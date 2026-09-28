#include "zrt.h"
#include "mod/net.h"
#include "mod/sock.h"
#include <curl/curl.h>
#include <stdlib.h>
#include <strings.h>

namespace zrt { namespace net {
const char* reason(int32_t s) {
  switch (s) {
    case 100: return "Continue"; case 101: return "Switching Protocols"; case 200: return "OK"; case 201: return "Created";
    case 202: return "Accepted"; case 204: return "No Content"; case 206: return "Partial Content"; case 301: return "Moved Permanently";
    case 302: return "Found"; case 303: return "See Other"; case 304: return "Not Modified"; case 307: return "Temporary Redirect";
    case 308: return "Permanent Redirect"; case 400: return "Bad Request"; case 401: return "Unauthorized"; case 403: return "Forbidden";
    case 404: return "Not Found"; case 405: return "Method Not Allowed"; case 408: return "Request Timeout"; case 409: return "Conflict";
    case 410: return "Gone"; case 413: return "Payload Too Large"; case 415: return "Unsupported Media Type"; case 418: return "I'm a Teapot";
    case 422: return "Unprocessable Entity"; case 426: return "Upgrade Required"; case 429: return "Too Many Requests";
    case 500: return "Internal Server Error"; case 501: return "Not Implemented"; case 502: return "Bad Gateway";
    case 503: return "Service Unavailable"; case 504: return "Gateway Timeout";
    default: return s < 400 ? "OK" : "Error";
  }
}
// ---------- fetch ----------
struct Pending { CURL* h; StrBuilder* body; StrBuilder* head; curl_slist* headers; Ref<PromiseObj<Ref<Response>>> p; Pending* next; };
/** Response headers of the last response (after redirects): "Name: value" lines, the status line first. */
static void parse_head(const StrBuilder& hb, const Ref<Response>& r) {
  const char* b = hb.buf; uint32_t n = hb.len, i = 0;
  while (i < n) {
    uint32_t e = i; while (e < n && b[e] != '\n') e++;
    uint32_t le = e; if (le > i && b[le - 1] == '\r') le--;
    if (le - i >= 5 && !strncmp(b + i, "HTTP/", 5)) {  // a new response (redirect, 100 Continue): start over
      r->headers = make<Headers>();
      uint32_t sp = i; while (sp < le && b[sp] != ' ') sp++;
      uint32_t sp2 = sp + 1; while (sp2 < le && b[sp2] != ' ') sp2++;
      r->statusText = sp2 < le ? String::from(b + sp2 + 1, le - sp2 - 1) : String();
    } else {
      uint32_t c = i; while (c < le && b[c] != ':') c++;
      if (c < le) r->headers->append(String::from(b + i, c - i), String::from(b + c + 1, le - c - 1));
    }
    i = e + 1;
  }
}
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
      CURLcode rc = m->data.result;
      if (rc != CURLE_OK) {
        // the same words as the sim (Node's error codes)
        const char* e = rc == CURLE_COULDNT_CONNECT ? "ECONNREFUSED" : rc == CURLE_COULDNT_RESOLVE_HOST ? "ENOTFOUND" : rc == CURLE_OPERATION_TIMEDOUT ? "timeout" : curl_easy_strerror(rc);
        d->p->reject(make<TypeError>(cat(String::from("fetch failed: ", 14), String::from(e, (uint32_t)strlen(e)))));
      } else {
        long code = 0; curl_easy_getinfo(d->h, CURLINFO_RESPONSE_CODE, &code);
        char* eff = nullptr; curl_easy_getinfo(d->h, CURLINFO_EFFECTIVE_URL, &eff);
        auto r = make<Response>();
        r->status = (int32_t)code; r->ok = code >= 200 && code < 300; r->body = d->body->build();
        if (eff) r->url = String::from(eff, (uint32_t)strlen(eff));
        parse_head(*d->head, r);
        d->p->resolve(r);
      }
      curl_multi_remove_handle(multi, d->h); curl_easy_cleanup(d->h);
      if (d->headers) curl_slist_free_all(d->headers);
      d->body->~StrBuilder(); mfree(d->body);
      d->head->~StrBuilder(); mfree(d->head);
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
  d->h = curl_easy_init(); d->body = new (alloc(sizeof(StrBuilder))) StrBuilder(); d->head = new (alloc(sizeof(StrBuilder))) StrBuilder();
  d->p = pr.p; d->headers = nullptr;
  sock::CStr u(url);
  curl_easy_setopt(d->h, CURLOPT_URL, u.c());
  curl_easy_setopt(d->h, CURLOPT_FOLLOWLOCATION, 1L);
  curl_easy_setopt(d->h, CURLOPT_WRITEFUNCTION, on_data);
  curl_easy_setopt(d->h, CURLOPT_WRITEDATA, d->body);
  curl_easy_setopt(d->h, CURLOPT_HEADERFUNCTION, on_data);
  curl_easy_setopt(d->h, CURLOPT_HEADERDATA, d->head);
  curl_easy_setopt(d->h, CURLOPT_USERAGENT, "zinc/0.1");
  curl_easy_setopt(d->h, CURLOPT_ACCEPT_ENCODING, "");  // gzip / deflate / br as libcurl supports, decoded
  if (init.p) {
    if (init->method.bytes()) { sock::CStr m(init->method); curl_easy_setopt(d->h, CURLOPT_COPYPOSTFIELDS, ""); curl_easy_setopt(d->h, CURLOPT_CUSTOMREQUEST, m.c()); }
    if (init->bodyBytes.a) { int32_t n = init->bodyBytes.length(); curl_easy_setopt(d->h, CURLOPT_POSTFIELDSIZE, (long)n); curl_easy_setopt(d->h, CURLOPT_COPYPOSTFIELDS, n ? (const char*)init->bodyBytes.a->data : ""); }
    else if (init->body.bytes()) { curl_easy_setopt(d->h, CURLOPT_POSTFIELDSIZE, (long)init->body.bytes()); curl_easy_setopt(d->h, CURLOPT_COPYPOSTFIELDS, init->body.ptr()); }
    if (init->contentType.bytes()) { sock::CStr ct(cat(String::from("Content-Type: ", 14), init->contentType)); d->headers = curl_slist_append(d->headers, ct.c()); }
    if (init->headers.p) for (int32_t i = 0; i < init->headers->names.length(); i++) {
      sock::CStr h(cat(init->headers->names.get(i), String::from(": ", 2), init->headers->vals.get(i)));
      d->headers = curl_slist_append(d->headers, h.c());
    }
    if (d->headers) curl_easy_setopt(d->h, CURLOPT_HTTPHEADER, d->headers);
    if (init->timeoutMs > 0) curl_easy_setopt(d->h, CURLOPT_TIMEOUT_MS, (long)init->timeoutMs);
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
    for (int32_t i = 0; i < hdr_end;) {  // header lines after the request line
      int32_t e = i; while (e < hdr_end && b[e] != '\r') e++;
      if (i > 0) { int32_t c = i; while (c < e && b[c] != ':') c++; if (c < e) req->headers->append(String::from(b + i, (uint32_t)(c - i)), String::from(b + c + 1, (uint32_t)(e - c - 1))); }
      i = e + 2;
    }
    Ref<Reply> r = handler(req);
    if (g_err.p) { Ref<Error> e = take_error(); r = make<Reply>(); r->status = 500; r->body = String::from("internal error", 14); (void)e; }
    StrBuilder out;
    out.cstr("HTTP/1.1 "); to_s(out, r->status); out.ch(' '); out.cstr(reason(r->status)); out.cstr("\r\n");
    if (r->headers.p) for (int32_t i = 0; i < r->headers->names.length(); i++) { to_s(out, r->headers->names.get(i)); out.cstr(": "); to_s(out, r->headers->vals.get(i)); out.cstr("\r\n"); }
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
