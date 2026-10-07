#include "sock.h"

#include <uv.h>

#include <cstdlib>
#include <cstring>
#include <map>
#include <memory>

#include "zn/loop.h"

namespace zn::sock {
namespace {

enum Ev { kData = 50, kOpen, kAccept, kPeerClosed, kError, kDatagram, kLookup, kLookupFailed };
enum class Kind { Client, Server, Udp };

struct Sock {
  int id = 0;
  Kind kind = Kind::Client;
  bool unixPath = false, closing = false, ended = false;
  union { uv_tcp_t tcp; uv_pipe_t pipe; uv_udp_t udp; } h;
  uv_handle_t* handle() { return reinterpret_cast<uv_handle_t*>(&h); }
  uv_stream_t* stream() { return reinterpret_cast<uv_stream_t*>(&h); }
  uv_connect_t creq;
  std::string target;   // "host:port" or the path, for error messages
};
std::map<int, Sock*> gSocks;
int gNext = 1;
std::string gError;

uv_loop_t* L() { return static_cast<uv_loop_t*>(loop::uvLoop()); }
Sock* at(int id) { auto it = gSocks.find(id); return it == gSocks.end() ? nullptr : it->second; }
int fail(const std::string& why) { gError = why; return -1; }
void allocBuf(uv_handle_t*, size_t n, uv_buf_t* b) { b->base = static_cast<char*>(std::malloc(n)); b->len = static_cast<unsigned>(b->base ? n : 0); }

Sock* make(Kind k, bool unixPath, const std::string& target) {
  auto* s = new Sock();
  s->id = gNext++;
  s->kind = k;
  s->unixPath = unixPath;
  s->target = target;
  std::memset(&s->h, 0, sizeof s->h);
  gSocks[s->id] = s;
  loop::addActive(1);
  return s;
}
void release(Sock* s) {   // closes the handle; the object goes with its close callback
  if (s->closing) return;
  s->closing = true;
  gSocks.erase(s->id);
  loop::addActive(-1);
  if (s->kind != Kind::Udp && s->kind != Kind::Server) uv_read_stop(s->stream());
  uv_close(s->handle(), [](uv_handle_t* h) { delete reinterpret_cast<Sock*>(h->data); });
}
std::string errName(int rc) { return uv_err_name(rc); }
void failOpen(Sock* s, const char* what, int rc) {
  int id = s->id;
  std::string t = std::string(what) + " " + errName(rc) + " " + s->target;
  release(s);
  loop::pushEvent(id, kError, t);
}

void onRead(uv_stream_t* st, ssize_t n, const uv_buf_t* b) {
  auto* s = static_cast<Sock*>(st->data);
  if (n > 0 && !s->closing) loop::pushEvent(s->id, kData, "", std::string(b->base, static_cast<size_t>(n)));
  if (b->base) std::free(b->base);
  if (n < 0 && !s->closing) {
    int id = s->id;
    bool reset = n != UV_EOF;
    release(s);
    if (reset && n != UV_ECONNRESET) loop::pushEvent(id, kError, "read " + errName(static_cast<int>(n)));
    loop::pushEvent(id, kPeerClosed, "");
  }
}
void startReading(Sock* s) { uv_read_start(s->stream(), allocBuf, onRead); }

void initClient(Sock* s, bool unixPath) {
  if (unixPath) uv_pipe_init(L(), &s->h.pipe, 0); else { uv_tcp_init(L(), &s->h.tcp); uv_tcp_nodelay(&s->h.tcp, 1); }
  s->handle()->data = s;
}
void onConnection(uv_stream_t* srv, int status) {
  auto* sv = static_cast<Sock*>(srv->data);
  if (status != 0 || sv->closing) return;
  Sock* c = make(Kind::Client, sv->unixPath, "");
  initClient(c, sv->unixPath);
  if (uv_accept(srv, c->stream()) != 0) { release(c); return; }
  startReading(c);
  loop::pushEvent(sv->id, kAccept, std::to_string(c->id));
}

}  // namespace

const std::string& error() { return gError; }

int connectTcp(const std::string& host, int port) {
  sockaddr_in a;
  std::string target = host + ":" + std::to_string(port);
  if (!loop::resolveHost(host == "localhost" ? "127.0.0.1" : host, port, &a)) return fail("connect ENOTFOUND " + target);
  Sock* s = make(Kind::Client, false, target);
  initClient(s, false);
  s->creq.data = s;
  int rc = uv_tcp_connect(&s->creq, &s->h.tcp, reinterpret_cast<sockaddr*>(&a), [](uv_connect_t* r, int status) {
    auto* k = static_cast<Sock*>(r->data);
    if (k->closing) return;
    if (status != 0) { failOpen(k, "connect", status); return; }
    startReading(k);
    loop::pushEvent(k->id, kOpen, "");
  });
  if (rc != 0) { int id = s->id; release(s); gError = "connect " + errName(rc) + " " + target; (void)id; return -1; }
  return s->id;
}
int connectUnix(const std::string& path) {
  Sock* s = make(Kind::Client, true, path);
  initClient(s, true);
  s->creq.data = s;
  uv_pipe_connect(&s->creq, &s->h.pipe, path.c_str(), [](uv_connect_t* r, int status) {
    auto* k = static_cast<Sock*>(r->data);
    if (k->closing) return;
    if (status != 0) { failOpen(k, "connect", status); return; }
    startReading(k);
    loop::pushEvent(k->id, kOpen, "");
  });
  return s->id;
}
int listenTcp(const std::string& host, int port) {
  sockaddr_in a;
  std::string target = (host.empty() ? "0.0.0.0" : host) + ":" + std::to_string(port);
  if (!loop::resolveHost(host.empty() ? "0.0.0.0" : host == "localhost" ? "127.0.0.1" : host, port, &a)) return fail("listen ENOTFOUND " + target);
  Sock* s = make(Kind::Server, false, target);
  uv_tcp_init(L(), &s->h.tcp);
  s->handle()->data = s;
  int rc = uv_tcp_bind(&s->h.tcp, reinterpret_cast<sockaddr*>(&a), 0);
  if (rc == 0) rc = uv_listen(s->stream(), 128, onConnection);
  if (rc != 0) { release(s); return fail("listen " + errName(rc) + " " + target); }
  loop::pushEvent(s->id, kOpen, "");
  return s->id;
}
int listenUnix(const std::string& path) {
  Sock* s = make(Kind::Server, true, path);
  uv_pipe_init(L(), &s->h.pipe, 0);
  s->handle()->data = s;
  int rc = uv_pipe_bind(&s->h.pipe, path.c_str());
  if (rc == 0) rc = uv_listen(s->stream(), 128, onConnection);
  if (rc != 0) { release(s); return fail("listen " + errName(rc) + " " + path); }
  loop::pushEvent(s->id, kOpen, "");
  return s->id;
}
int udp(const std::string& host, int port) {
  sockaddr_in a;
  std::string target = (host.empty() ? "0.0.0.0" : host) + ":" + std::to_string(port);
  if (!loop::resolveHost(host.empty() ? "0.0.0.0" : host == "localhost" ? "127.0.0.1" : host, port, &a)) return fail("bind ENOTFOUND " + target);
  Sock* s = make(Kind::Udp, false, target);
  uv_udp_init(L(), &s->h.udp);
  s->handle()->data = s;
  int rc = uv_udp_bind(&s->h.udp, reinterpret_cast<sockaddr*>(&a), UV_UDP_REUSEADDR);
  if (rc == 0) rc = uv_udp_recv_start(&s->h.udp, allocBuf, [](uv_udp_t* u, ssize_t n, const uv_buf_t* b, const sockaddr* from, unsigned) {
    auto* k = static_cast<Sock*>(u->data);
    if (n > 0 && from && !k->closing) {
      char ip[64] = "";
      uv_ip4_name(reinterpret_cast<const sockaddr_in*>(from), ip, sizeof ip);
      loop::pushEvent(k->id, kDatagram, std::string(ip) + '\x1e' + std::to_string(ntohs(reinterpret_cast<const sockaddr_in*>(from)->sin_port)), std::string(b->base, static_cast<size_t>(n)));
    }
    if (b->base) std::free(b->base);
  });
  if (rc != 0) { release(s); return fail("bind " + errName(rc) + " " + target); }
  loop::pushEvent(s->id, kOpen, "");
  return s->id;
}

namespace {
struct WriteReq { uv_write_t req; std::string data; };
}
bool write(int h, const std::string& bytes) {
  Sock* s = at(h);
  if (!s || s->kind != Kind::Client || s->ended) return false;
  auto* w = new WriteReq{{}, bytes};
  uv_buf_t b = uv_buf_init(w->data.data(), static_cast<unsigned>(w->data.size()));
  if (uv_write(&w->req, s->stream(), &b, 1, [](uv_write_t* r, int) { delete reinterpret_cast<WriteReq*>(r); }) != 0) { delete w; return false; }
  return true;
}
bool sendTo(int h, const std::string& host, int port, const std::string& bytes) {
  Sock* s = at(h);
  sockaddr_in a;
  if (!s || s->kind != Kind::Udp || !loop::resolveHost(host == "localhost" ? "127.0.0.1" : host, port, &a)) return false;
  std::string copy = bytes;
  uv_buf_t b = uv_buf_init(copy.data(), static_cast<unsigned>(copy.size()));
  return uv_udp_try_send(&s->h.udp, &b, 1, reinterpret_cast<sockaddr*>(&a)) >= 0;
}
void end(int h) {
  Sock* s = at(h);
  if (!s || s->kind != Kind::Client || s->ended) return;
  s->ended = true;
  auto* r = new uv_shutdown_t;
  if (uv_shutdown(r, s->stream(), [](uv_shutdown_t* q, int) { delete q; }) != 0) delete r;
}
void close(int h) { Sock* s = at(h); if (s) release(s); }
int localPort(int h) {
  Sock* s = at(h);
  if (!s || s->unixPath) return 0;
  sockaddr_storage a;
  int len = sizeof a;
  int rc = s->kind == Kind::Udp ? uv_udp_getsockname(&s->h.udp, reinterpret_cast<sockaddr*>(&a), &len) : uv_tcp_getsockname(&s->h.tcp, reinterpret_cast<sockaddr*>(&a), &len);
  return rc == 0 ? ntohs(reinterpret_cast<sockaddr_in*>(&a)->sin_port) : 0;
}
static bool peer(int h, sockaddr_storage* a) {
  Sock* s = at(h);
  int len = sizeof *a;
  return s && s->kind == Kind::Client && !s->unixPath && uv_tcp_getpeername(&s->h.tcp, reinterpret_cast<sockaddr*>(a), &len) == 0;
}
std::string remoteAddress(int h) {
  sockaddr_storage a;
  char ip[64] = "";
  if (!peer(h, &a)) return "";
  uv_ip4_name(reinterpret_cast<sockaddr_in*>(&a), ip, sizeof ip);
  return ip;
}
int remotePort(int h) { sockaddr_storage a; return peer(h, &a) ? ntohs(reinterpret_cast<sockaddr_in*>(&a)->sin_port) : 0; }

int lookup(const std::string& host) {
  struct Req { uv_getaddrinfo_t req; int id; std::string host; };
  auto* r = new Req();
  r->id = gNext++;
  r->host = host;
  r->req.data = r;
  addrinfo hints{};
  hints.ai_socktype = SOCK_STREAM;
  loop::addActive(1);
  int rc = uv_getaddrinfo(L(), &r->req, [](uv_getaddrinfo_t* q, int status, addrinfo* res) {
    auto* k = static_cast<Req*>(q->data);
    loop::addActive(-1);
    if (status != 0 || !res) loop::pushEvent(k->id, kLookupFailed, "getaddrinfo ENOTFOUND " + k->host);
    else {
      std::string list;
      for (addrinfo* p = res; p; p = p->ai_next) {
        char ip[64] = "";
        if (p->ai_family == AF_INET) uv_ip4_name(reinterpret_cast<sockaddr_in*>(p->ai_addr), ip, sizeof ip);
        else if (p->ai_family == AF_INET6) uv_ip6_name(reinterpret_cast<sockaddr_in6*>(p->ai_addr), ip, sizeof ip);
        else continue;
        if (list.find(ip) == std::string::npos) list += (list.empty() ? "" : ",") + std::string(ip);
      }
      loop::pushEvent(k->id, kLookup, list);
    }
    if (res) uv_freeaddrinfo(res);
    delete k;
  }, host.c_str(), nullptr, &hints);
  if (rc != 0) { loop::addActive(-1); int id = r->id; delete r; loop::pushEvent(id, kLookupFailed, "getaddrinfo ENOTFOUND " + host); return id; }
  return r->id;
}

}  // namespace zn::sock
