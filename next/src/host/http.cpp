#include "http.h"

#include <llhttp.h>
#include <uv.h>

#include <algorithm>
#include <cctype>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <map>
#include <memory>
#include <vector>

#include "zn/loop.h"

namespace zn::http {
namespace {

const char* reasonOf(int s) {
  switch (s) {
    case 100: return "Continue"; case 200: return "OK"; case 201: return "Created"; case 202: return "Accepted"; case 204: return "No Content";
    case 206: return "Partial Content"; case 301: return "Moved Permanently"; case 302: return "Found"; case 303: return "See Other";
    case 304: return "Not Modified"; case 307: return "Temporary Redirect"; case 308: return "Permanent Redirect"; case 400: return "Bad Request";
    case 401: return "Unauthorized"; case 403: return "Forbidden"; case 404: return "Not Found"; case 405: return "Method Not Allowed";
    case 408: return "Request Timeout"; case 409: return "Conflict"; case 410: return "Gone"; case 413: return "Payload Too Large";
    case 415: return "Unsupported Media Type"; case 418: return "I'm a Teapot"; case 422: return "Unprocessable Entity"; case 426: return "Upgrade Required";
    case 429: return "Too Many Requests"; case 431: return "Request Header Fields Too Large"; case 500: return "Internal Server Error";
    case 501: return "Not Implemented"; case 502: return "Bad Gateway"; case 503: return "Service Unavailable"; case 504: return "Gateway Timeout";
    default: return s < 400 ? "OK" : "Error";
  }
}
uv_loop_t* L() { return static_cast<uv_loop_t*>(loop::uvLoop()); }
void alloc(uv_handle_t*, size_t n, uv_buf_t* b) { b->base = static_cast<char*>(std::malloc(n)); b->len = static_cast<unsigned>(b->base ? n : 0); }
struct WriteReq { uv_write_t req; std::string data; bool closeAfter; };
bool hasCtl(const std::string& s) { return s.find_first_of(std::string("\r\0", 2)) != std::string::npos; }

// Both sides collect a message the same way.
struct Msg {
  std::string head, body, field, value;   // head: "name: value\n" lines
  bool inValue = false;
  void flush() { if (inValue) { head += field + ": " + value + "\n"; field.clear(); value.clear(); inValue = false; } }
  void onField(const char* p, size_t n) { flush(); field.append(p, n); }
  void onValue(const char* p, size_t n) { inValue = true; value.append(p, n); }
};

// ---------------------------------------------------------------- client
constexpr int kRedirectCap = 20, kConnectCapMs = 30000;

struct Fetch {
  int handle = 0;
  uv_tcp_t tcp;
  uv_timer_t timer;
  uv_connect_t creq;
  llhttp_t parser;
  llhttp_settings_t settings;
  std::string url, method, headers, reqBody, host, path, reason, finalUrl;
  int port = 80, status = 0, redirects = 0, maxBytes = 0;
  uint64_t timeoutMs = 0, startMs = 0;
  Msg msg;
  bool tooBig = false, finished = false, restart = false, released = false, tcpOpen = false, timerOpen = false;
  int closing = 0;
};
std::vector<std::unique_ptr<Fetch>> gFetches;   // index = handle - 1
Fetch* fetchAt(int h) { return h > 0 && static_cast<size_t>(h) <= gFetches.size() ? gFetches[static_cast<size_t>(h) - 1].get() : nullptr; }

bool splitUrl(const std::string& u, Fetch* f, std::string* why) {
  if (u.compare(0, 8, "https://") == 0) { *why = "https is not supported yet"; return false; }
  if (u.compare(0, 7, "http://") != 0) { *why = "unsupported protocol"; return false; }
  size_t hs = 7, pe = u.find_first_of("/?#", hs);
  std::string auth = u.substr(hs, pe == std::string::npos ? pe : pe - hs);
  f->path = pe == std::string::npos ? "/" : u.substr(pe);
  if (f->path[0] != '/') f->path = "/" + f->path;
  size_t hash = f->path.find('#');
  if (hash != std::string::npos) f->path.resize(hash);
  size_t colon = auth.rfind(':');
  f->port = 80;
  if (colon != std::string::npos) { f->port = std::atoi(auth.c_str() + colon + 1); auth.resize(colon); }
  f->host = auth;
  f->url = u;
  return !f->host.empty() && f->port > 0 && f->port < 65536;
}

void startConnection(Fetch* f);

void maybeFree(Fetch* f) {
  if (f->closing == 0 && f->released && f->finished) gFetches[static_cast<size_t>(f->handle) - 1].reset();
}
void onFetchClosed(uv_handle_t* h) {
  auto* f = static_cast<Fetch*>(h->data);
  f->closing--;
  if (h == reinterpret_cast<uv_handle_t*>(&f->tcp)) {
    f->tcpOpen = false;
    if (f->restart && !f->finished) { f->restart = false; startConnection(f); return; }
  }
  maybeFree(f);
}
void closeTcp(Fetch* f) {
  if (f->tcpOpen) { f->closing++; uv_close(reinterpret_cast<uv_handle_t*>(&f->tcp), onFetchClosed); f->tcpOpen = false; }
}
void finish(Fetch* f, bool ok, const std::string& why) {
  if (f->finished) return;
  f->finished = true;
  if (f->timerOpen) { uv_timer_stop(&f->timer); f->closing++; uv_close(reinterpret_cast<uv_handle_t*>(&f->timer), onFetchClosed); f->timerOpen = false; }
  closeTcp(f);
  loop::addActive(-1);
  loop::pushEvent(f->handle, ok ? 40 : 41, why);
}

std::string resolveLocation(Fetch* f, const std::string& loc) {
  if (loc.compare(0, 7, "http://") == 0 || loc.compare(0, 8, "https://") == 0) return loc;
  std::string origin = "http://" + f->host + (f->port == 80 ? "" : ":" + std::to_string(f->port));
  if (loc[0] == '/') return origin + loc;
  size_t slash = f->path.rfind('/');
  return origin + f->path.substr(0, slash + 1) + loc;
}
std::string headerOf(const std::string& head, const std::string& name) {   // case-insensitive, first match
  size_t i = 0;
  while (i < head.size()) {
    size_t e = head.find('\n', i);
    if (e == std::string::npos) e = head.size();
    size_t c = head.find(':', i);
    if (c != std::string::npos && c < e && c - i == name.size()) {
      bool same = true;
      for (size_t k = 0; k < name.size(); k++) if (std::tolower(static_cast<unsigned char>(head[i + k])) != name[k]) same = false;
      if (same) { size_t v = c + 1; while (v < e && head[v] == ' ') v++; return head.substr(v, e - v); }
    }
    i = e + 1;
  }
  return "";
}

void onComplete(Fetch* f) {
  f->msg.flush();
  int s = llhttp_get_status_code(&f->parser);
  std::string loc = headerOf(f->msg.head, "location");
  if ((s == 301 || s == 302 || s == 303 || s == 307 || s == 308) && !loc.empty()) {
    if (f->redirects++ >= kRedirectCap) { finish(f, false, "fetch failed: too many redirects"); return; }
    std::string next = resolveLocation(f, loc), why;
    Fetch probe;
    if (!splitUrl(next, &probe, &why)) { finish(f, false, "fetch failed: " + why); return; }
    if (s == 303 || ((s == 301 || s == 302) && f->method == "POST")) { if (f->method != "HEAD") f->method = "GET"; f->reqBody.clear(); }
    splitUrl(next, f, &why);
    f->msg = Msg();
    f->restart = true;
    closeTcp(f);
    return;
  }
  f->status = s;
  finish(f, true, "");
}

void onFetchRead(uv_stream_t* s, ssize_t n, const uv_buf_t* buf) {
  auto* f = static_cast<Fetch*>(s->data);
  if (n > 0 && !f->finished && !f->restart) {
    llhttp_errno_t e = llhttp_execute(&f->parser, buf->base, static_cast<size_t>(n));
    if (e != HPE_OK && e != HPE_PAUSED && !f->finished && !f->restart) finish(f, false, f->tooBig ? "fetch failed: response too large" : std::string("fetch failed: ") + llhttp_get_error_reason(&f->parser));
  } else if (n < 0 && !f->finished && !f->restart) {
    llhttp_errno_t e = llhttp_finish(&f->parser);
    if (!f->finished && !f->restart) finish(f, false, e == HPE_OK ? "fetch failed: empty response" : "fetch failed: ECONNRESET");
  }
  if (buf->base) std::free(buf->base);
}

void startConnection(Fetch* f) {
  sockaddr_in a;
  if (!loop::resolveHost(f->host, f->port, &a)) { finish(f, false, "fetch failed: ENOTFOUND"); return; }
  uv_tcp_init(L(), &f->tcp);
  f->tcp.data = f->creq.data = f;
  f->tcpOpen = true;
  llhttp_settings_init(&f->settings);
  f->settings.on_status = [](llhttp_t* p, const char* at, size_t n) { static_cast<Fetch*>(p->data)->reason.assign(at, n); return 0; };
  f->settings.on_header_field = [](llhttp_t* p, const char* at, size_t n) { static_cast<Fetch*>(p->data)->msg.onField(at, n); return 0; };
  f->settings.on_header_value = [](llhttp_t* p, const char* at, size_t n) { static_cast<Fetch*>(p->data)->msg.onValue(at, n); return 0; };
  f->settings.on_headers_complete = [](llhttp_t* p) { static_cast<Fetch*>(p->data)->msg.flush(); return static_cast<Fetch*>(p->data)->method == "HEAD" ? 1 : 0; };
  f->settings.on_body = [](llhttp_t* p, const char* at, size_t n) {
    auto* k = static_cast<Fetch*>(p->data);
    if (k->msg.body.size() + n > static_cast<size_t>(k->maxBytes)) { k->tooBig = true; return -1; }
    k->msg.body.append(at, n);
    return 0;
  };
  f->settings.on_message_complete = [](llhttp_t* p) { onComplete(static_cast<Fetch*>(p->data)); return 0; };
  llhttp_init(&f->parser, HTTP_RESPONSE, &f->settings);
  f->parser.data = f;
  uint64_t elapsed = uv_now(L()) - f->startMs;
  uv_timer_stop(&f->timer);
  uint64_t connectMs = f->timeoutMs < kConnectCapMs ? f->timeoutMs : kConnectCapMs;
  uv_timer_start(&f->timer, [](uv_timer_t* t) { finish(static_cast<Fetch*>(t->data), false, "fetch failed: timeout"); }, connectMs > elapsed ? connectMs - elapsed : 1, 0);
  int rc = uv_tcp_connect(&f->creq, &f->tcp, reinterpret_cast<sockaddr*>(&a), [](uv_connect_t* r, int status) {
    auto* k = static_cast<Fetch*>(r->data);
    if (status != 0) { if (!k->finished) finish(k, false, status == UV_ECONNREFUSED ? "fetch failed: ECONNREFUSED" : status == UV_ETIMEDOUT ? "fetch failed: timeout" : "fetch failed: " + std::string(uv_err_name(status))); return; }
    if (k->finished) return;
    uint64_t used = uv_now(L()) - k->startMs;
    uv_timer_stop(&k->timer);
    uv_timer_start(&k->timer, [](uv_timer_t* t) { finish(static_cast<Fetch*>(t->data), false, "fetch failed: timeout"); }, k->timeoutMs > used ? k->timeoutMs - used : 1, 0);
    std::string req = k->method + " " + k->path + " HTTP/1.1\r\nHost: " + k->host + (k->port == 80 ? "" : ":" + std::to_string(k->port)) + "\r\nConnection: close\r\nUser-Agent: zinc/0.1\r\n";
    if (headerOf(k->headers, "accept") == "") req += "Accept: */*\r\n";
    for (size_t i = 0; i < k->headers.size();) {
      size_t e = k->headers.find('\n', i);
      if (e == std::string::npos) e = k->headers.size();
      req += k->headers.substr(i, e - i) + "\r\n";
      i = e + 1;
    }
    if (!k->reqBody.empty() || k->method == "POST" || k->method == "PUT" || k->method == "PATCH") req += "Content-Length: " + std::to_string(k->reqBody.size()) + "\r\n";
    req += "\r\n" + k->reqBody;
    auto* w = new WriteReq{{}, req, false};
    uv_buf_t b = uv_buf_init(w->data.data(), static_cast<unsigned>(w->data.size()));
    if (uv_write(&w->req, reinterpret_cast<uv_stream_t*>(&k->tcp), &b, 1, [](uv_write_t* r2, int) { delete reinterpret_cast<WriteReq*>(r2); }) != 0) delete w;
    uv_read_start(reinterpret_cast<uv_stream_t*>(&k->tcp), alloc, onFetchRead);
  });
  if (rc != 0) finish(f, false, "fetch failed: ECONNREFUSED");
}

// ---------------------------------------------------------------- server
constexpr size_t kHeadCap = 16384, kBodyCap = 1u << 20, kConnCap = 32;
constexpr uint64_t kIdleMs = 10000;

struct SConn {
  int id = 0;
  uv_tcp_t tcp;
  uv_timer_t idle;
  llhttp_t parser;
  llhttp_settings_t settings;
  Msg msg;
  std::string target;
  size_t seen = 0;
  bool complete = false, answered = false, closed = false;
  int closing = 0;
};
uv_tcp_t* gListener = nullptr;
std::map<int, SConn*> gConns;
int gNextConn = 1;

void onSClosed(uv_handle_t* h) {
  auto* c = static_cast<SConn*>(h->data);
  if (--c->closing == 0) delete c;
}
void closeConn(SConn* c) {
  if (c->closed) return;
  c->closed = true;
  gConns.erase(c->id);
  uv_read_stop(reinterpret_cast<uv_stream_t*>(&c->tcp));
  uv_timer_stop(&c->idle);
  c->closing = 2;
  uv_close(reinterpret_cast<uv_handle_t*>(&c->idle), onSClosed);
  uv_close(reinterpret_cast<uv_handle_t*>(&c->tcp), onSClosed);
}
void writeAndClose(SConn* c, const std::string& data) {
  if (c->closed || c->answered) return;
  c->answered = true;
  auto* w = new WriteReq{{}, data, true};
  w->req.data = c;
  uv_buf_t b = uv_buf_init(w->data.data(), static_cast<unsigned>(w->data.size()));
  if (uv_write(&w->req, reinterpret_cast<uv_stream_t*>(&c->tcp), &b, 1, [](uv_write_t* r, int) { auto* x = reinterpret_cast<WriteReq*>(r); closeConn(static_cast<SConn*>(r->data)); delete x; }) != 0) { delete w; closeConn(c); }
}
void quick(SConn* c, int status) {
  writeAndClose(c, std::string("HTTP/1.1 ") + std::to_string(status) + " " + reasonOf(status) + "\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
}

void onSRead(uv_stream_t* s, ssize_t n, const uv_buf_t* buf) {
  auto* c = static_cast<SConn*>(s->data);
  if (n > 0 && !c->closed && !c->complete) {
    c->seen += static_cast<size_t>(n);
    llhttp_errno_t e = llhttp_execute(&c->parser, buf->base, static_cast<size_t>(n));
    if (e != HPE_OK && e != HPE_PAUSED && !c->complete) quick(c, c->msg.body.size() > kBodyCap ? 413 : 400);
    else if (!c->complete && c->msg.head.size() + c->msg.field.size() + c->msg.value.size() > kHeadCap) quick(c, 431);
  } else if (n < 0) closeConn(c);
  if (buf->base) std::free(buf->base);
}
void onConnection(uv_stream_t* srv, int status) {
  if (status != 0) return;
  auto* c = new SConn();
  uv_tcp_init(L(), &c->tcp);
  uv_timer_init(L(), &c->idle);
  c->tcp.data = c->idle.data = c;
  if (uv_accept(srv, reinterpret_cast<uv_stream_t*>(&c->tcp)) != 0 || gConns.size() >= kConnCap) {
    c->closed = true;
    c->closing = 2;
    uv_close(reinterpret_cast<uv_handle_t*>(&c->idle), onSClosed);
    uv_close(reinterpret_cast<uv_handle_t*>(&c->tcp), onSClosed);
    return;
  }
  c->id = gNextConn++;
  gConns[c->id] = c;
  llhttp_settings_init(&c->settings);
  c->settings.on_url = [](llhttp_t* p, const char* at, size_t n) { static_cast<SConn*>(p->data)->target.append(at, n); return 0; };
  c->settings.on_header_field = [](llhttp_t* p, const char* at, size_t n) { static_cast<SConn*>(p->data)->msg.onField(at, n); return 0; };
  c->settings.on_header_value = [](llhttp_t* p, const char* at, size_t n) { static_cast<SConn*>(p->data)->msg.onValue(at, n); return 0; };
  c->settings.on_body = [](llhttp_t* p, const char* at, size_t n) {
    auto* k = static_cast<SConn*>(p->data);
    if (k->msg.body.size() + n > kBodyCap) return -1;
    k->msg.body.append(at, n);
    return 0;
  };
  c->settings.on_message_complete = [](llhttp_t* p) {
    auto* k = static_cast<SConn*>(p->data);
    k->msg.flush();
    k->complete = true;
    loop::pushEvent(k->id, 42, std::string(llhttp_method_name(static_cast<llhttp_method_t>(llhttp_get_method(p)))) + '\x1e' + k->target + '\x1e' + k->msg.head + '\x1e' + k->msg.body);
    return static_cast<int>(HPE_PAUSED);
  };
  llhttp_init(&c->parser, HTTP_REQUEST, &c->settings);
  c->parser.data = c;
  uv_timer_start(&c->idle, [](uv_timer_t* t) { auto* k = static_cast<SConn*>(t->data); if (!k->answered) quick(k, 408); else closeConn(k); }, kIdleMs, 0);
  uv_read_start(reinterpret_cast<uv_stream_t*>(&c->tcp), alloc, onSRead);
}

}  // namespace

int fetchOpen(const std::string& url, const std::string& method, const std::string& headers, const std::string& body, int timeoutMs, int maxBytes) {
  auto f = std::make_unique<Fetch>();
  Fetch* p = f.get();
  gFetches.push_back(std::move(f));
  p->handle = static_cast<int>(gFetches.size());
  p->method = method.empty() ? "GET" : method;
  p->headers = headers;
  p->reqBody = body;
  p->timeoutMs = timeoutMs > 0 ? static_cast<uint64_t>(timeoutMs) : 120000;
  p->maxBytes = maxBytes > 0 ? maxBytes : 64 << 20;
  p->startMs = uv_now(L());
  loop::addActive(1);
  uv_timer_init(L(), &p->timer);
  p->timer.data = p;
  p->timerOpen = true;
  std::string why;
  if (!splitUrl(url, p, &why)) finish(p, false, "fetch failed: " + why);
  else startConnection(p);
  return p->handle;
}
int fetchStatus(int h) { Fetch* f = fetchAt(h); return f ? f->status : 0; }
std::string fetchHead(int h) { Fetch* f = fetchAt(h); return f ? f->reason + "\n" + f->msg.head : ""; }
std::string fetchBody(int h) { Fetch* f = fetchAt(h); return f ? f->msg.body : ""; }
std::string fetchUrl(int h) { Fetch* f = fetchAt(h); return f ? f->url : ""; }
void fetchFree(int h) { Fetch* f = fetchAt(h); if (f) { f->released = true; maybeFree(f); } }

bool serve(int port) {
  stop();
  auto* l = new uv_tcp_t;
  uv_tcp_init(L(), l);
  sockaddr_in a;
  uv_ip4_addr("0.0.0.0", port, &a);
  if (uv_tcp_bind(l, reinterpret_cast<sockaddr*>(&a), 0) != 0 || uv_listen(reinterpret_cast<uv_stream_t*>(l), 64, onConnection) != 0) {
    uv_close(reinterpret_cast<uv_handle_t*>(l), [](uv_handle_t* h) { delete reinterpret_cast<uv_tcp_t*>(h); });
    return false;
  }
  gListener = l;
  loop::addActive(1);
  return true;
}
void stop() {
  if (!gListener) return;
  uv_close(reinterpret_cast<uv_handle_t*>(gListener), [](uv_handle_t* h) { delete reinterpret_cast<uv_tcp_t*>(h); });
  gListener = nullptr;
  loop::addActive(-1);
}
void reply(int conn, int status, const std::string& headers, const std::string& body) {
  auto it = gConns.find(conn);
  if (it == gConns.end()) return;
  std::string out = "HTTP/1.1 " + std::to_string(status) + " " + reasonOf(status) + "\r\n";
  for (size_t i = 0; i < headers.size();) {   // lines are checked in Zinc; a stray control character is dropped here too
    size_t e = headers.find('\n', i);
    if (e == std::string::npos) e = headers.size();
    std::string line = headers.substr(i, e - i);
    if (!line.empty() && !hasCtl(line)) out += line + "\r\n";
    i = e + 1;
  }
  bool chunked = false;   // a reply that asks for Transfer-Encoding: chunked is sent in 4 KiB chunks
  for (size_t i = 0; i < headers.size();) {
    size_t e = headers.find('\n', i);
    if (e == std::string::npos) e = headers.size();
    std::string line = headers.substr(i, e - i);
    for (char& ch : line) ch = static_cast<char>(std::tolower(static_cast<unsigned char>(ch)));
    if (line == "transfer-encoding: chunked") chunked = true;
    i = e + 1;
  }
  if (!chunked) { out += "Content-Length: " + std::to_string(body.size()) + "\r\nConnection: close\r\n\r\n" + body; }
  else {
    out += "Connection: close\r\n\r\n";
    for (size_t i = 0; i < body.size(); i += 4096) {
      size_t n = std::min<size_t>(4096, body.size() - i);
      char hex[16];
      std::snprintf(hex, sizeof hex, "%zx\r\n", n);
      out += hex + body.substr(i, n) + "\r\n";
    }
    out += "0\r\n\r\n";
  }
  writeAndClose(it->second, out);
}

}  // namespace zn::http
