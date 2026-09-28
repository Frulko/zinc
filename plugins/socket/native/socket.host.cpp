// zinc:socket for macos and linux (rpi1 / rmpp include this file). See docs/plugins/socket.md.
// Non-blocking sockets in a fixed handle table, polled with poll(2) on every event loop iteration (no thread).
#include "zinc_native_socket.h"
#include <sys/socket.h>
#include <sys/un.h>
#include <netinet/in.h>
#include <netinet/tcp.h>
#include <arpa/inet.h>
#include <netdb.h>
#include <poll.h>
#include <fcntl.h>
#include <unistd.h>
#include <errno.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#ifndef MSG_NOSIGNAL
#define MSG_NOSIGNAL 0
#endif

enum { DATA, OPEN, ACCEPT, CLOSE, ERROR, DGRAM, LOOKUP, LOOKUP_ERROR };
enum Type { NONE, CONN, SERVER, UDP };
static const int MAXH = 256;
struct Handle {
  Type type; int fd; bool connecting, ending, shut;
  char* out; size_t out_len, out_cap;
  char remote[64]; int rport; char target[300];
};
static Handle hs[MAXH];
struct Lookup { int id; bool ok; char* text; };
static Lookup pending_lookups[32];
static int npending = 0, next_lookup = 1;
static char err_msg[256];

static const char* code_of(int e) {
  switch (e) {
    case ECONNREFUSED: return "ECONNREFUSED"; case ECONNRESET: return "ECONNRESET"; case EADDRINUSE: return "EADDRINUSE";
    case EADDRNOTAVAIL: return "EADDRNOTAVAIL"; case ETIMEDOUT: return "ETIMEDOUT"; case EHOSTUNREACH: return "EHOSTUNREACH";
    case ENETUNREACH: return "ENETUNREACH"; case ENOENT: return "ENOENT"; case EACCES: return "EACCES"; case EPIPE: return "EPIPE";
    case EINVAL: return "EINVAL"; case ENOTSOCK: return "ENOTSOCK";
    default: return "EIO";
  }
}
static zrt::String str(const char* s) { return zrt::String::from(s, (uint32_t)strlen(s)); }
static char* cstr(const zrt::String& s) { char* p = (char*)malloc(s.bytes() + 1); memcpy(p, s.ptr(), s.bytes()); p[s.bytes()] = 0; return p; }
static void nonblock(int fd) { fcntl(fd, F_SETFL, fcntl(fd, F_GETFL, 0) | O_NONBLOCK); fcntl(fd, F_SETFD, FD_CLOEXEC); }
static void nosigpipe(int fd) {
#ifdef SO_NOSIGPIPE
  int one = 1; setsockopt(fd, SOL_SOCKET, SO_NOSIGPIPE, &one, sizeof one);
#else
  (void)fd;
#endif
}
static int alloc_handle(Type t, int fd) {
  for (int h = 0; h < MAXH; h++) if (hs[h].type == NONE) { hs[h] = Handle{}; hs[h].type = t; hs[h].fd = fd; return h; }
  close(fd);
  strcpy(err_msg, "too many sockets");
  return -1;
}
static void free_handle(int h) {
  Handle& x = hs[h];
  if (x.fd >= 0) close(x.fd);
  free(x.out);
  x = Handle{};
  x.type = NONE; x.fd = -1;
}
static void peer_name(int fd, char* addr, size_t n, int* port) {
  sockaddr_storage ss; socklen_t len = sizeof ss;
  addr[0] = 0; *port = 0;
  if (getpeername(fd, (sockaddr*)&ss, &len) != 0) return;
  if (ss.ss_family == AF_INET) { inet_ntop(AF_INET, &((sockaddr_in*)&ss)->sin_addr, addr, (socklen_t)n); *port = ntohs(((sockaddr_in*)&ss)->sin_port); }
  else if (ss.ss_family == AF_INET6) { inet_ntop(AF_INET6, &((sockaddr_in6*)&ss)->sin6_addr, addr, (socklen_t)n); *port = ntohs(((sockaddr_in6*)&ss)->sin6_port); }
}
static bool resolve(const char* host, int port, int socktype, sockaddr_storage* out, socklen_t* len, int* family) {
  addrinfo hints{}, *res = nullptr;
  hints.ai_family = AF_UNSPEC; hints.ai_socktype = socktype;
  char ps[16]; snprintf(ps, sizeof ps, "%d", port);
  int rc = getaddrinfo(*host ? host : nullptr, ps, &hints, &res);
  if (rc != 0 || !res) { snprintf(err_msg, sizeof err_msg, "getaddrinfo ENOTFOUND %s", host); return false; }
  // prefer IPv4 (loopback servers here listen on IPv4)
  addrinfo* pick = res;
  for (addrinfo* a = res; a; a = a->ai_next) if (a->ai_family == AF_INET) { pick = a; break; }
  memcpy(out, pick->ai_addr, pick->ai_addrlen); *len = pick->ai_addrlen; *family = pick->ai_family;
  freeaddrinfo(res);
  return true;
}

struct HostSocket : NativeSocket, zrt::Poller {
  zrt::Fn<void(int32_t, int32_t, int32_t, zrt::String, zrt::Array<uint8_t>)> cb;
  bool polling = false;
  void start() { if (!polling) { polling = true; zrt::add_poller(this); } }

  int32_t connect_to(const sockaddr* sa, socklen_t len, int family, const char* target) {
    int fd = socket(family, SOCK_STREAM, 0);
    if (fd < 0) { snprintf(err_msg, sizeof err_msg, "socket %s", strerror(errno)); return -1; }
    nonblock(fd); nosigpipe(fd);
    if (family != AF_UNIX) { int one = 1; setsockopt(fd, IPPROTO_TCP, TCP_NODELAY, &one, sizeof one); }
    int h = alloc_handle(CONN, fd);
    if (h < 0) return -1;
    snprintf(hs[h].target, sizeof hs[h].target, "%s", target);
    if (::connect(fd, sa, len) < 0 && errno != EINPROGRESS && errno != EAGAIN) {
      // refused right away (unix sockets): reported like an asynchronous failure
      hs[h].connecting = true;
      int e = errno;
      snprintf(err_msg, sizeof err_msg, "connect %s %s", code_of(e), target);
      pending_error(h, err_msg);
    } else hs[h].connecting = true;
    start();
    return h;
  }
  // events decided synchronously (a server or UDP endpoint is ready, a connect failed at once): delivered on the next
  // poll, so they arrive like the asynchronous ones (and like Node's)
  struct Later { int h, kind; char msg[128]; };
  Later later[MAXH]; int nlater = 0;
  void defer(int h, int kind, const char* msg) { if (nlater < MAXH) { later[nlater].h = h; later[nlater].kind = kind; snprintf(later[nlater].msg, 128, "%s", msg); nlater++; } }
  void pending_error(int h, const char* msg) { defer(h, ERROR, msg); }

  int32_t connect(zrt::String host, int32_t port) override {
    char* hst = cstr(host);
    sockaddr_storage ss; socklen_t len; int fam;
    char target[300]; snprintf(target, sizeof target, "%s:%d", hst, port);
    bool ok = resolve(hst, port, SOCK_STREAM, &ss, &len, &fam);
    free(hst);
    if (!ok) return -1;
    char ip[64] = {0};
    if (fam == AF_INET) inet_ntop(AF_INET, &((sockaddr_in*)&ss)->sin_addr, ip, sizeof ip); else inet_ntop(AF_INET6, &((sockaddr_in6*)&ss)->sin6_addr, ip, sizeof ip);
    snprintf(target, sizeof target, "%s:%d", ip, port);
    return connect_to((sockaddr*)&ss, len, fam, target);
  }
  int32_t connectUnix(zrt::String path) override {
    sockaddr_un a{}; a.sun_family = AF_UNIX;
    if (path.bytes() >= sizeof a.sun_path) { strcpy(err_msg, "unix socket path too long"); return -1; }
    memcpy(a.sun_path, path.ptr(), path.bytes());
    return connect_to((sockaddr*)&a, sizeof a, AF_UNIX, a.sun_path);
  }
  int32_t listen_on(int fd, const sockaddr* sa, socklen_t len, const char* what) {
    int one = 1; setsockopt(fd, SOL_SOCKET, SO_REUSEADDR, &one, sizeof one);
    if (bind(fd, sa, len) < 0 || ::listen(fd, 64) < 0) { snprintf(err_msg, sizeof err_msg, "listen %s %s", code_of(errno), what); close(fd); return -1; }
    nonblock(fd);
    int h = alloc_handle(SERVER, fd);
    if (h >= 0) { defer(h, OPEN, ""); start(); }
    return h;
  }
  int32_t listen(zrt::String host, int32_t port) override {
    char* hst = cstr(host);
    char what[300]; snprintf(what, sizeof what, "%s:%d", *hst ? hst : "0.0.0.0", port);
    sockaddr_storage ss; socklen_t len; int fam = AF_INET;
    if (*hst) { if (!resolve(hst, port, SOCK_STREAM, &ss, &len, &fam)) { free(hst); return -1; } }
    else { sockaddr_in a{}; a.sin_family = AF_INET; a.sin_port = htons((uint16_t)port); a.sin_addr.s_addr = htonl(INADDR_ANY); memcpy(&ss, &a, sizeof a); len = sizeof a; }
    free(hst);
    int fd = socket(fam, SOCK_STREAM, 0);
    if (fd < 0) { snprintf(err_msg, sizeof err_msg, "socket %s", strerror(errno)); return -1; }
    return listen_on(fd, (sockaddr*)&ss, len, what);
  }
  int32_t listenUnix(zrt::String path) override {
    sockaddr_un a{}; a.sun_family = AF_UNIX;
    if (path.bytes() >= sizeof a.sun_path) { strcpy(err_msg, "unix socket path too long"); return -1; }
    memcpy(a.sun_path, path.ptr(), path.bytes());
    int fd = socket(AF_UNIX, SOCK_STREAM, 0);
    if (fd < 0) { snprintf(err_msg, sizeof err_msg, "socket %s", strerror(errno)); return -1; }
    return listen_on(fd, (sockaddr*)&a, sizeof a, a.sun_path);
  }
  int32_t udp(zrt::String host, int32_t port) override {
    char* hst = cstr(host);
    sockaddr_storage ss; socklen_t len; int fam = AF_INET;
    char what[300]; snprintf(what, sizeof what, "%s:%d", *hst ? hst : "0.0.0.0", port);
    if (*hst) { if (!resolve(hst, port, SOCK_DGRAM, &ss, &len, &fam)) { free(hst); return -1; } }
    else { sockaddr_in a{}; a.sin_family = AF_INET; a.sin_port = htons((uint16_t)port); a.sin_addr.s_addr = htonl(INADDR_ANY); memcpy(&ss, &a, sizeof a); len = sizeof a; }
    free(hst);
    int fd = socket(fam, SOCK_DGRAM, 0);
    if (fd < 0) { snprintf(err_msg, sizeof err_msg, "socket %s", strerror(errno)); return -1; }
    int one = 1; setsockopt(fd, SOL_SOCKET, SO_REUSEADDR, &one, sizeof one);
    if (bind(fd, (sockaddr*)&ss, len) < 0) { snprintf(err_msg, sizeof err_msg, "bind %s %s", code_of(errno), what); close(fd); return -1; }
    nonblock(fd);
    int h = alloc_handle(UDP, fd);
    if (h >= 0) { defer(h, OPEN, ""); start(); }
    return h;
  }
  static Handle* at(int32_t h) { return h >= 0 && h < MAXH && hs[h].type != NONE ? &hs[h] : nullptr; }
  bool queue(int32_t h, const char* p, size_t n) {
    Handle* x = at(h);
    if (!x || x->type != CONN || x->ending) return false;
    if (x->out_len + n > x->out_cap) {
      size_t c = x->out_cap ? x->out_cap * 2 : 4096; while (c < x->out_len + n) c *= 2;
      x->out = (char*)realloc(x->out, c); x->out_cap = c;
    }
    memcpy(x->out + x->out_len, p, n); x->out_len += n;
    if (!x->connecting) flush(h);
    return true;
  }
  bool write(int32_t h, zrt::Array<uint8_t> data) override { int32_t n = data.length(); return queue(h, n ? (const char*)data.a->data : "", (size_t)n); }
  bool writeText(int32_t h, zrt::String data) override { return queue(h, data.ptr(), data.bytes()); }
  bool sendTo(int32_t h, zrt::String host, int32_t port, zrt::Array<uint8_t> data) override {
    Handle* x = at(h);
    if (!x || x->type != UDP) return false;
    char* hst = cstr(host);
    sockaddr_storage ss; socklen_t len; int fam;
    bool ok = resolve(hst, port, SOCK_DGRAM, &ss, &len, &fam);
    free(hst);
    if (!ok) return false;
    int32_t n = data.length();
    return sendto(x->fd, n ? (const char*)data.a->data : "", (size_t)n, 0, (sockaddr*)&ss, len) >= 0;
  }
  void end(int32_t h) override { Handle* x = at(h); if (x && x->type == CONN) { x->ending = true; flush(h); } }
  void close(int32_t h) override { if (at(h)) free_handle(h); }
  int32_t localPort(int32_t h) override {
    Handle* x = at(h); if (!x) return 0;
    sockaddr_storage ss; socklen_t len = sizeof ss;
    if (getsockname(x->fd, (sockaddr*)&ss, &len) != 0) return 0;
    if (ss.ss_family == AF_INET) return ntohs(((sockaddr_in*)&ss)->sin_port);
    if (ss.ss_family == AF_INET6) return ntohs(((sockaddr_in6*)&ss)->sin6_port);
    return 0;
  }
  zrt::String remoteAddress(int32_t h) override { Handle* x = at(h); return x ? str(x->remote) : zrt::String(); }
  int32_t remotePort(int32_t h) override { Handle* x = at(h); return x ? x->rport : 0; }
  // ponytail: getaddrinfo blocks the loop while it resolves (instant for literals, localhost and cached names); the
  // result is still delivered asynchronously. A resolver thread would keep the loop free on slow DNS.
  int32_t lookup(zrt::String host) override {
    char* hst = cstr(host);
    addrinfo hints{}, *res = nullptr;
    hints.ai_family = AF_UNSPEC; hints.ai_socktype = SOCK_STREAM;
    int rc = getaddrinfo(hst, nullptr, &hints, &res);
    int id = next_lookup++;
    if (npending == 32) { free(hst); strcpy(err_msg, "too many lookups"); return -1; }
    Lookup& l = pending_lookups[npending++];
    l.id = id;
    if (rc != 0 || !res) {
      l.ok = false; size_t tl = strlen(hst) + 32; l.text = (char*)malloc(tl); snprintf(l.text, tl, "getaddrinfo ENOTFOUND %s", hst);
    } else {
      size_t cap = 256, n = 0; char* t = (char*)malloc(cap); t[0] = 0;
      for (addrinfo* a = res; a; a = a->ai_next) {
        char ip[64] = {0};
        if (a->ai_family == AF_INET) inet_ntop(AF_INET, &((sockaddr_in*)a->ai_addr)->sin_addr, ip, sizeof ip);
        else if (a->ai_family == AF_INET6) inet_ntop(AF_INET6, &((sockaddr_in6*)a->ai_addr)->sin6_addr, ip, sizeof ip);
        else continue;
        if (strstr(t, ip) && (strstr(t, ip) == t || strstr(t, ip)[-1] == ',')) continue;  // duplicates (one per socktype)
        if (n + strlen(ip) + 2 > cap) { cap *= 2; t = (char*)realloc(t, cap); }
        n += (size_t)snprintf(t + n, cap - n, "%s%s", n ? "," : "", ip);
      }
      l.ok = true; l.text = t;
      freeaddrinfo(res);
    }
    free(hst);
    start();
    return id;
  }
  zrt::String error() override { return str(err_msg); }
  void onEvent(zrt::Fn<void(int32_t, int32_t, int32_t, zrt::String, zrt::Array<uint8_t>)> f) override { cb = f; }

  void emit(int32_t h, int32_t kind, int32_t a, const char* text, const char* bytes, int n) {
    if (!cb) return;
    zrt::Array<uint8_t> b = zrt::Array<uint8_t>::with_cap(n);
    if (n) { __builtin_memcpy(b.a->data, bytes, (size_t)n); b.a->len = n; }
    auto f = cb;
    f(h, kind, a, text ? str(text) : zrt::String(), b);
    zrt::check_uncaught();
  }
  void flush(int32_t h) {
    Handle& x = hs[h];
    while (x.out_len) {
      ssize_t w = send(x.fd, x.out, x.out_len, MSG_NOSIGNAL);
      if (w < 0) { if (errno == EINTR) continue; return; }  // EAGAIN: later; errors show up in recv
      memmove(x.out, x.out + w, x.out_len - (size_t)w); x.out_len -= (size_t)w;
    }
    if (x.ending && !x.shut) { ::shutdown(x.fd, SHUT_WR); x.shut = true; }
  }
  bool poll() override {
    bool alive = npending > 0 || nlater > 0;
    int nl = nlater;
    Later* ls = (Later*)malloc(sizeof(Later) * (size_t)(nl ? nl : 1));
    memcpy(ls, later, sizeof(Later) * (size_t)nl);
    nlater = 0;
    for (int i = 0; i < nl; i++) {
      int h = ls[i].h;
      if (hs[h].type == NONE) continue;
      if (ls[i].kind == ERROR) free_handle(h);
      emit(h, ls[i].kind, 0, ls[i].kind == ERROR ? ls[i].msg : nullptr, nullptr, 0);
    }
    free(ls);
    for (int i = 0; i < npending; i++) {
      Lookup l = pending_lookups[i];
      emit(l.id, l.ok ? LOOKUP : LOOKUP_ERROR, 0, l.text, nullptr, 0);
      free(l.text);
    }
    npending = 0;
    for (int h = 0; h < MAXH; h++) {
      Handle& x = hs[h];
      if (x.type == NONE) continue;
      alive = true;
      struct pollfd p = {x.fd, (short)(POLLIN | (x.connecting || x.out_len ? POLLOUT : 0)), 0};
      if (::poll(&p, 1, 0) <= 0 || !p.revents) continue;
      if (x.type == SERVER) {
        for (;;) {
          int c = accept(x.fd, nullptr, nullptr);
          if (c < 0) break;
          nonblock(c); nosigpipe(c);
          int one = 1; setsockopt(c, IPPROTO_TCP, TCP_NODELAY, &one, sizeof one);
          int nh = alloc_handle(CONN, c);
          if (nh < 0) continue;
          peer_name(c, hs[nh].remote, sizeof hs[nh].remote, &hs[nh].rport);
          emit(h, ACCEPT, nh, nullptr, nullptr, 0);
          if (hs[h].type != SERVER) break;  // closed from the callback
        }
        continue;
      }
      if (x.type == UDP) {
        for (;;) {
          char buf[65536]; sockaddr_storage ss; socklen_t len = sizeof ss;
          ssize_t n = recvfrom(x.fd, buf, sizeof buf, 0, (sockaddr*)&ss, &len);
          if (n < 0) break;
          char ip[64] = {0}; int port = 0;
          if (ss.ss_family == AF_INET) { inet_ntop(AF_INET, &((sockaddr_in*)&ss)->sin_addr, ip, sizeof ip); port = ntohs(((sockaddr_in*)&ss)->sin_port); }
          else if (ss.ss_family == AF_INET6) { inet_ntop(AF_INET6, &((sockaddr_in6*)&ss)->sin6_addr, ip, sizeof ip); port = ntohs(((sockaddr_in6*)&ss)->sin6_port); }
          emit(h, DGRAM, port, ip, buf, (int)n);
          if (hs[h].type != UDP) break;
        }
        continue;
      }
      if (x.connecting) {
        if (!(p.revents & (POLLOUT | POLLERR | POLLHUP))) continue;
        int e = 0; socklen_t el = sizeof e;
        getsockopt(x.fd, SOL_SOCKET, SO_ERROR, &e, &el);
        if (e) {
          snprintf(err_msg, sizeof err_msg, "connect %s %s", code_of(e), x.target);
          free_handle(h);
          emit(h, ERROR, 0, err_msg, nullptr, 0);
          continue;
        }
        x.connecting = false;
        peer_name(x.fd, x.remote, sizeof x.remote, &x.rport);
        emit(h, OPEN, 0, nullptr, nullptr, 0);
        if (hs[h].type != CONN) continue;
        flush(h);
      }
      if (x.out_len) flush(h);
      for (;;) {
        char buf[16384];
        ssize_t n = recv(x.fd, buf, sizeof buf, 0);
        if (n > 0) { emit(h, DATA, 0, nullptr, buf, (int)n); if (hs[h].type != CONN) break; continue; }
        if (n < 0 && (errno == EAGAIN || errno == EWOULDBLOCK)) break;
        if (n < 0 && errno == EINTR) continue;
        if (n < 0) { char m[128]; snprintf(m, sizeof m, "read %s", code_of(errno)); emit(h, ERROR, 0, m, nullptr, 0); }
        if (hs[h].type == CONN) { free_handle(h); emit(h, CLOSE, 0, nullptr, nullptr, 0); }
        break;
      }
    }
    return alive;
  }
  void shutdown() override {
    cb = nullptr;
    for (int h = 0; h < MAXH; h++) if (hs[h].type != NONE) free_handle(h);
    for (int i = 0; i < npending; i++) free(pending_lookups[i].text);
    npending = 0; nlater = 0;
  }
};

NativeSocket* zinc_create_Socket() {
  static HostSocket inst;
  inst.rc = zrt::IMMORTAL;
  for (Handle& x : hs) { x.type = NONE; x.fd = -1; }
  signal(SIGPIPE, SIG_IGN);  // a write to a closed peer returns EPIPE instead of killing the program
  return &inst;
}
