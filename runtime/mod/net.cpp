#include "zrt.h"
#include "mod/net.h"
#include "mod/sock.h"
#include <curl/curl.h>
#include <stdlib.h>
#include <strings.h>

namespace zrt { namespace net {
// ---------- fetch ----------
struct Pending { CURL* h; StrBuilder* body; curl_slist* headers; Ref<PromiseObj<Ref<Response>>> p; Pending* next; };
struct Fetcher : Poller {
  CURLM* multi = nullptr;
  Pending* list = nullptr;
  void shutdown() override { for (Pending* d = list; d; d = d->next) d->p = nullptr; }
  bool poll() override {
    if (!list) return false;
    int running = 0;
    curl_multi_perform(multi, &running);
    int left;
    while (CURLMsg* m = curl_multi_info_read(multi, &left)) {
      if (m->msg != CURLMSG_DONE) continue;
      Pending** pp = &list;
      while (*pp && (*pp)->h != m->easy_handle) pp = &(*pp)->next;
      Pending* d = *pp; if (!d) continue;
      *pp = d->next;
      if (m->data.result != CURLE_OK) {
        const char* e = curl_easy_strerror(m->data.result);
        d->p->reject(make<TypeError>(cat(String::from("fetch failed: ", 14), String::from(e, (uint32_t)strlen(e)))));
      } else {
        long code = 0; curl_easy_getinfo(d->h, CURLINFO_RESPONSE_CODE, &code);
        auto r = make<Response>();
        r->status = (int32_t)code; r->ok = code >= 200 && code < 300; r->body = d->body->build();
        d->p->resolve(r);
      }
      curl_multi_remove_handle(multi, d->h); curl_easy_cleanup(d->h);
      if (d->headers) curl_slist_free_all(d->headers);
      d->body->~StrBuilder(); mfree(d->body);
      d->p = nullptr; mfree(d);
    }
    return list != nullptr;
  }
};
static Fetcher* fetcher = nullptr;
static size_t on_data(char* ptr, size_t size, size_t n, void* ud) { ((StrBuilder*)ud)->raw(ptr, (uint32_t)(size * n)); return size * n; }
Promise<Ref<Response>> fetch(const String& url, const Ref<RequestInit>& init) {
  if (!fetcher) {
    curl_global_init(CURL_GLOBAL_DEFAULT);
    fetcher = new (alloc(sizeof(Fetcher))) Fetcher();
    fetcher->multi = curl_multi_init();
    add_poller(fetcher);
  }
  auto pr = Promise<Ref<Response>>::make_pending();
  Pending* d = new (alloc(sizeof(Pending))) Pending();
  d->h = curl_easy_init(); d->body = new (alloc(sizeof(StrBuilder))) StrBuilder(); d->p = pr.p; d->headers = nullptr;
  sock::CStr u(url);
  curl_easy_setopt(d->h, CURLOPT_URL, u.c());
  curl_easy_setopt(d->h, CURLOPT_FOLLOWLOCATION, 1L);
  curl_easy_setopt(d->h, CURLOPT_WRITEFUNCTION, on_data);
  curl_easy_setopt(d->h, CURLOPT_WRITEDATA, d->body);
  curl_easy_setopt(d->h, CURLOPT_USERAGENT, "zinc/0.1");
  if (init.p) {
    if (init->method.bytes()) { sock::CStr m(init->method); curl_easy_setopt(d->h, CURLOPT_COPYPOSTFIELDS, ""); curl_easy_setopt(d->h, CURLOPT_CUSTOMREQUEST, m.c()); }
    if (init->body.bytes()) { curl_easy_setopt(d->h, CURLOPT_POSTFIELDSIZE, (long)init->body.bytes()); curl_easy_setopt(d->h, CURLOPT_COPYPOSTFIELDS, init->body.ptr()); }
    if (init->contentType.bytes()) { sock::CStr ct(cat(String::from("Content-Type: ", 14), init->contentType)); d->headers = curl_slist_append(nullptr, ct.c()); curl_easy_setopt(d->h, CURLOPT_HTTPHEADER, d->headers); }
  }
  curl_multi_add_handle(fetcher->multi, d->h);
  d->next = fetcher->list; fetcher->list = d;
  return pr;
}

// ---------- server ----------
struct Conn { int fd; StrBuilder* in; Conn* next; };
struct Server : Poller {
  int fd = -1;
  Fn<Ref<Reply>(Ref<Request>)> handler;
  Conn* conns = nullptr;
  void shutdown() override { handler = nullptr; }
  bool poll() override {
    if (fd < 0) return false;
    for (;;) {
      int c = accept(fd, nullptr, nullptr);
      if (c < 0) break;
      sock::nonblock(c);
      sock::nosigpipe(c);
      Conn* k = new (alloc(sizeof(Conn))) Conn(); k->fd = c; k->in = new (alloc(sizeof(StrBuilder))) StrBuilder(); k->next = conns; conns = k;
    }
    for (Conn** pp = &conns; *pp;) {
      Conn* k = *pp; char buf[4096]; bool closed = false;
      for (;;) { ssize_t n = recv(k->fd, buf, sizeof buf, 0); if (n > 0) k->in->raw(buf, (uint32_t)n); else { if (n == 0) closed = true; break; } }
      if (handle(k) || closed) { ::close(k->fd); *pp = k->next; k->in->~StrBuilder(); mfree(k->in); mfree(k); }
      else pp = &k->next;
    }
    return true;
  }
  // true when a full request was answered
  bool handle(Conn* k) {
    const char* b = k->in->buf; uint32_t n = k->in->len;
    int32_t hdr_end = -1;
    for (uint32_t i = 0; i + 3 < n; i++) if (b[i] == '\r' && b[i + 1] == '\n' && b[i + 2] == '\r' && b[i + 3] == '\n') { hdr_end = (int32_t)i; break; }
    if (hdr_end < 0) return false;
    long clen = 0;
    for (int32_t i = 0; i < hdr_end; i++) if ((b[i] == 'C' || b[i] == 'c') && !strncasecmp(b + i, "content-length:", 15)) clen = atol(b + i + 15);
    if ((long)n < hdr_end + 4 + clen) return false;
    auto req = make<Request>();
    uint32_t sp1 = 0; while (sp1 < n && b[sp1] != ' ') sp1++;
    uint32_t sp2 = sp1 + 1; while (sp2 < n && b[sp2] != ' ') sp2++;
    req->method = String::from(b, sp1);
    req->path = String::from(b + sp1 + 1, sp2 - sp1 - 1);
    req->body = String::from(b + hdr_end + 4, (uint32_t)clen);
    Ref<Reply> r = handler(req);
    if (g_err.p) { Ref<Error> e = take_error(); r = make<Reply>(); r->status = 500; r->body = String::from("internal error", 14); (void)e; }
    StrBuilder out;
    out.cstr("HTTP/1.1 "); to_s(out, r->status); out.cstr(r->status < 400 ? " OK\r\n" : " Error\r\n");
    out.cstr("Content-Type: "); if (r->contentType.bytes()) to_s(out, r->contentType); else out.cstr("text/plain; charset=utf-8");
    out.cstr("\r\nContent-Length: "); to_s(out, (int64_t)r->body.bytes()); out.cstr("\r\nConnection: close\r\n\r\n");
    to_s(out, r->body);
    uint32_t off = 0;
    while (off < out.len) { ssize_t w = ::send(k->fd, out.buf + off, out.len - off, MSG_NOSIGNAL); if (w <= 0) { if (errno == EAGAIN) continue; break; } off += (uint32_t)w; }
    drain_microtasks();
    return true;
  }
};
static Server* server = nullptr;
void serve(int32_t port, Fn<Ref<Reply>(Ref<Request>)> handler) {
  if (!server) { server = new (alloc(sizeof(Server))) Server(); add_poller(server); }
  server->fd = sock::tcp_listen(port);
  if (server->fd < 0) { g_err = make<Error>(String::from("net.serve: cannot listen", 24)); return; }
  server->handler = handler;
}
void stop() { if (server && server->fd >= 0) { ::close(server->fd); server->fd = -1; server->handler = nullptr; } }
}}
