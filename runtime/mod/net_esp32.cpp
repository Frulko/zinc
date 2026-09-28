// zinc:net esp32 — fetch via esp_http_client, run on a FreeRTOS task so a slow/absent network
// never stalls the event loop.
//
// NAT-07: the Zinc heap (Ref<>/String/StrBuilder/alloc()) is single-threaded and must only be
// touched from the main task. The worker task therefore never sees a Zinc object: request
// fields are copied into plain malloc'ed C strings before the task starts, the HTTP response
// body is accumulated into a malloc'ed buffer, and the result crosses back to the main task as
// a pointer on a FreeRTOS queue (FreeRTOS queues are internally mutex/spinlock protected, so
// this is the "mutex-protected queue drained by a Poller" without hand-rolling a mutex).
// Building the Ref<Response> and resolving/rejecting the promise both happen on the main task,
// inside Fetcher::poll().
//
// WiFi is not available in Espressif's QEMU (no radio), so with no station connected
// esp_http_client_perform() simply fails and fetch() rejects with that reason — there is no
// separate "no network" check to write. To join a real network, set targets.esp32.wifi in
// zinc.json:
//   { "targets": { "esp32": { "wifi": { "ssid": "...", "password": "..." } } } }
// `zinc build --target esp32` turns that into the ZINC_WIFI_SSID/ZINC_WIFI_PASSWORD compile
// defines (see espBuild in compiler/src/cli.ts); wiring those into an esp_wifi station bring-up
// is left for when there's a board to test it on (QEMU can't exercise a WiFi radio).
#include "zrt.h"
#include "mod/net.h"
#include "esp_http_client.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/queue.h"
#include <string.h>
#include <stdlib.h>

namespace zrt { namespace net {

// ---------- fetch ----------
struct Pending { uint32_t id; Ref<PromiseObj<Ref<Response>>> p; Pending* next; };
static Pending* pending_list = nullptr;
static uint32_t next_id = 1;
static QueueHandle_t done_q = nullptr;

struct TaskArgs { uint32_t id; char* url; char* method; char* body; size_t body_len; char* content_type; char* headers; int timeout_ms; };  // headers: "name\nvalue\n" pairs
struct Done { uint32_t id; bool ok_transport; int status; char* body; size_t body_len; char* err; };
struct RecvBuf { char* p; size_t n; };

static char* dupstr(const char* p, uint32_t n) { char* r = (char*)malloc((size_t)n + 1); memcpy(r, p, n); r[n] = 0; return r; }

static esp_err_t http_event(esp_http_client_event_t* evt) {
  if (evt->event_id == HTTP_EVENT_ON_DATA && evt->data_len > 0) {
    RecvBuf* b = (RecvBuf*)evt->user_data;
    char* np = (char*)realloc(b->p, b->n + (size_t)evt->data_len);
    if (!np) return ESP_FAIL;
    memcpy(np + b->n, evt->data, (size_t)evt->data_len);
    b->p = np; b->n += (size_t)evt->data_len;
  }
  return ESP_OK;
}
// ponytail: 8 KiB task stack — enough for esp_http_client + the TLS handshake in practice;
// raise it if a board build hits a stack-overflow reset with a large response or deep TLS chain.
static void fetch_task(void* arg) {
  TaskArgs* a = (TaskArgs*)arg;
  RecvBuf buf{nullptr, 0};
  esp_http_client_config_t cfg{};
  cfg.url = a->url;
  cfg.event_handler = http_event;
  cfg.user_data = &buf;
  cfg.timeout_ms = a->timeout_ms > 0 ? a->timeout_ms : 15000;
  esp_http_client_handle_t h = esp_http_client_init(&cfg);
  if (a->method) {
    esp_http_client_method_t m = !strcmp(a->method, "POST") ? HTTP_METHOD_POST : !strcmp(a->method, "PUT") ? HTTP_METHOD_PUT
      : !strcmp(a->method, "DELETE") ? HTTP_METHOD_DELETE : !strcmp(a->method, "PATCH") ? HTTP_METHOD_PATCH : HTTP_METHOD_GET;
    esp_http_client_set_method(h, m);
  }
  if (a->content_type) esp_http_client_set_header(h, "Content-Type", a->content_type);
  for (char* p = a->headers; p && *p;) {
    char* nl = strchr(p, '\n'); if (!nl) break; *nl = 0;
    char* v = nl + 1; char* vl = strchr(v, '\n'); if (!vl) break; *vl = 0;
    esp_http_client_set_header(h, p, v);
    p = vl + 1;
  }
  if (a->body) esp_http_client_set_post_field(h, a->body, (int)a->body_len);

  Done* d = (Done*)malloc(sizeof(Done));
  d->id = a->id; d->body = nullptr; d->body_len = 0; d->err = nullptr;
  esp_err_t err = esp_http_client_perform(h);
  if (err == ESP_OK) {
    d->ok_transport = true;
    d->status = esp_http_client_get_status_code(h);
    d->body = buf.p; d->body_len = buf.n;
  } else {
    d->ok_transport = false; d->status = 0;
    if (buf.p) free(buf.p);
    const char* e = esp_err_to_name(err);
    d->err = dupstr(e, (uint32_t)strlen(e));
  }
  esp_http_client_cleanup(h);
  free(a->url); free(a->method); free(a->body); free(a->content_type); free(a->headers); free(a);
  xQueueSend(done_q, &d, portMAX_DELAY);
  vTaskDelete(nullptr);
}
struct Fetcher : Poller {
  void shutdown() override { for (Pending* p = pending_list; p; p = p->next) p->p = nullptr; }
  bool poll() override {
    Done* d;
    while (done_q && xQueueReceive(done_q, &d, 0) == pdTRUE) {
      Pending** pp = &pending_list;
      while (*pp && (*pp)->id != d->id) pp = &(*pp)->next;
      Pending* node = *pp;
      if (node) {
        *pp = node->next;
        if (d->ok_transport) {
          auto r = make<Response>();
          r->status = d->status; r->ok = d->status >= 200 && d->status < 300;
          r->statusText = String::from(reason(d->status), (uint32_t)strlen(reason(d->status)));  // esp_http_client keeps no reason phrase
          r->body = d->body ? String::from(d->body, (uint32_t)d->body_len) : String();
          node->p->resolve(r);
        } else {
          const char* e = d->err ? d->err : "transport error";
          node->p->reject(make<TypeError>(cat(String::from("fetch failed: ", 14), String::from(e, (uint32_t)strlen(e)))));
        }
        node->p = nullptr; mfree(node);
      }
      if (d->body) free(d->body);
      if (d->err) free(d->err);
      free(d);
    }
    return pending_list != nullptr;
  }
};
static Fetcher* fetcher = nullptr;
Promise<Ref<Response>> fetch(const String& url, const Ref<RequestInit>& init) {
  if (!fetcher) {
    fetcher = new (alloc(sizeof(Fetcher))) Fetcher();
    done_q = xQueueCreate(8, sizeof(Done*));
    add_poller(fetcher);
  }
  auto pr = Promise<Ref<Response>>::make_pending();
  Pending* node = new (alloc(sizeof(Pending))) Pending();
  node->id = next_id++; node->p = pr.p; node->next = pending_list; pending_list = node;

  TaskArgs* a = (TaskArgs*)malloc(sizeof(TaskArgs));
  a->id = node->id;
  a->url = dupstr(url.ptr(), url.bytes());
  a->method = (init.p && init->method.bytes()) ? dupstr(init->method.ptr(), init->method.bytes()) : nullptr;
  bool has_body = init.p && init->body.bytes();
  a->body = has_body ? dupstr(init->body.ptr(), init->body.bytes()) : nullptr;
  a->body_len = has_body ? init->body.bytes() : 0;
  a->content_type = (init.p && init->contentType.bytes()) ? dupstr(init->contentType.ptr(), init->contentType.bytes()) : nullptr;
  a->timeout_ms = init.p ? init->timeoutMs : 0;
  a->headers = nullptr;
  if (init.p && init->headers.p) {
    StrBuilder hb;
    for (int32_t i = 0; i < init->headers->names.length(); i++) { to_s(hb, init->headers->names.get(i)); hb.ch('\n'); to_s(hb, init->headers->vals.get(i)); hb.ch('\n'); }
    a->headers = dupstr(hb.buf ? hb.buf : "", hb.len);
  }

  if (xTaskCreate(fetch_task, "zinc_fetch", 8192, a, tskIDLE_PRIORITY + 3, nullptr) != pdPASS) {
    Pending** pp = &pending_list; while (*pp && *pp != node) pp = &(*pp)->next; if (*pp) *pp = node->next;
    pr.p->reject(make<TypeError>(String::from("fetch failed: cannot start task", 32)));
    mfree(node);
    free(a->url); free(a->method); free(a->body); free(a->content_type); free(a->headers); free(a);
  }
  return pr;
}

// ---------- server ----------
// ponytail: no listen-socket server on esp32 yet (no conformance program needs it there and
// QEMU has no network to test it against); build on esp_http_server when a real use case shows
// up instead of shipping an untested implementation.
const char* reason(int32_t s) {
  switch (s) {
    case 200: return "OK"; case 201: return "Created"; case 204: return "No Content"; case 301: return "Moved Permanently"; case 302: return "Found";
    case 304: return "Not Modified"; case 400: return "Bad Request"; case 401: return "Unauthorized"; case 403: return "Forbidden";
    case 404: return "Not Found"; case 500: return "Internal Server Error"; case 503: return "Service Unavailable";
    default: return s < 400 ? "OK" : "Error";
  }
}
void serve(int32_t, Fn<Ref<Reply>(Ref<Request>)>) { g_err = make<Error>(String::from("net.serve: not supported on esp32 yet", 38)); }
void stop() {}
}}
