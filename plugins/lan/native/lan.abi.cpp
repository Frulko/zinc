// zinc:lan on the native ABI (include/zn/native.h; the export table of lan.spec.ts written out below, so the console cores need no generator):
// polled IPv4 sockets over BSD sockets, one file for the desktop's plugin library and the console cores (targets/console links it).
// Nothing waits and nothing calls back: a datagram or a stream's bytes are taken by recv()/read() when the program asks (once a frame).
// A console brings its network up through its HAL (zn_console_net_up: the PSP joins its first Wi-Fi setting, the Vita its system's, the 3DS
// starts soc:u); the PSP and the Vita set non-blocking with SO_NONBLOCK, the others with fcntl. Results are static buffers, valid until the
// next call: a console core calls exports with no host API (targets/console/stubs.cpp), and the engine copies a result at once.
#include <errno.h>
#include <fcntl.h>
#include <stdio.h>
#include <string.h>
#include <unistd.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#if !defined(__PSP__) && !defined(__vita__) && !defined(__3DS__)
#include <netdb.h>
#endif

#include "zn/native.h"

#if defined(__PSP__) || defined(__vita__) || defined(__3DS__)
#define LAN_CONSOLE 1
// the console's HAL: 1 up (addr filled), 0 still joining, -1 no network (why filled)
extern "C" int zn_console_net_up(char* addr, size_t addrSize, char* why, size_t whySize);
#endif
#ifndef MSG_NOSIGNAL
#define MSG_NOSIGNAL 0
#endif
#ifndef MSG_DONTWAIT
#define MSG_DONTWAIT 0
#endif

namespace {
enum Kind { FREE, UDP, CONN, SERVER };
struct Handle { Kind kind; int fd; int state; };   // state: 0 connecting, 1 open, -1 closed
const int kHandles = 32;
Handle hs[kHandles];
char err[160] = "", addr[48] = "", from[24] = "";
int fromPort = 0;
char buf[4096];

int fail(const char* what) { snprintf(err, sizeof err, "%s: %s", what, strerror(errno)); return -1; }
ZnStr zs(const char* p, size_t n) { return ZnStr{p, static_cast<uint32_t>(n)}; }
Handle* at(int64_t h) { return h >= 0 && h < kHandles && hs[h].kind != FREE ? &hs[h] : nullptr; }
int take(Kind k, int fd, int state) {
  for (int h = 0; h < kHandles; h++) if (hs[h].kind == FREE) { hs[h] = Handle{k, fd, state}; return h; }
  close(fd);
  snprintf(err, sizeof err, "too many sockets open (%d)", kHandles);
  return -1;
}
void nonblocking(int fd) {
#if defined(__PSP__) || defined(__vita__)
  int one = 1;
  setsockopt(fd, SOL_SOCKET, SO_NONBLOCK, &one, sizeof one);
#else
  fcntl(fd, F_SETFL, fcntl(fd, F_GETFL, 0) | O_NONBLOCK);
#endif
#ifdef SO_NOSIGPIPE
  int on = 1;
  setsockopt(fd, SOL_SOCKET, SO_NOSIGPIPE, &on, sizeof on);
#endif
}
// a dotted IPv4 address (or 'localhost'; a desktop also resolves names): false when it is none
bool resolve(const char* host, int port, sockaddr_in& sa) {
  memset(&sa, 0, sizeof sa);
  sa.sin_family = AF_INET;
  sa.sin_port = htons(static_cast<uint16_t>(port));
  if (!strcmp(host, "localhost")) host = "127.0.0.1";
  unsigned b[4], k = 0;
  const char* p = host;
  for (; k < 4; k++) {
    if (*p < '0' || *p > '9') break;
    unsigned v = 0;
    while (*p >= '0' && *p <= '9') v = v * 10 + static_cast<unsigned>(*p++ - '0');
    if (v > 255) break;
    b[k] = v;
    if (k < 3 && *p++ != '.') break;
  }
  if (k == 4 && *p == 0) {
    sa.sin_addr.s_addr = htonl(b[0] << 24 | b[1] << 16 | b[2] << 8 | b[3]);
    return true;
  }
#ifndef LAN_CONSOLE
  addrinfo hints{}, *res = nullptr;
  hints.ai_family = AF_INET;
  if (getaddrinfo(host, nullptr, &hints, &res) == 0 && res) {
    sa.sin_addr = reinterpret_cast<sockaddr_in*>(res->ai_addr)->sin_addr;
    freeaddrinfo(res);
    return true;
  }
#endif
  snprintf(err, sizeof err, "not an IPv4 address: %s", host);
  return false;
}
void dotted(uint32_t a, char* out, size_t n) { a = ntohl(a); snprintf(out, n, "%u.%u.%u.%u", a >> 24, a >> 16 & 255, a >> 8 & 255, a & 255); }
bool again() { return errno == EAGAIN || errno == EWOULDBLOCK || errno == EINPROGRESS || errno == EALREADY; }

#define FN(name) int32_t name(void*, ZnCtx*, const ZnVal* a, ZnVal* r)
FN(fUp) {
  (void)a;
#ifdef LAN_CONSOLE
  r->i = zn_console_net_up(addr, sizeof addr, err, sizeof err);
#else
  if (!addr[0]) {   // the interface of the default route: a UDP socket "connected" outside sends nothing and names it
    strcpy(addr, "127.0.0.1");
    const int fd = socket(AF_INET, SOCK_DGRAM, 0);
    sockaddr_in sa;
    if (fd >= 0 && resolve("10.255.255.255", 9, sa) && connect(fd, reinterpret_cast<sockaddr*>(&sa), sizeof sa) == 0) {
      socklen_t n = sizeof sa;
      if (getsockname(fd, reinterpret_cast<sockaddr*>(&sa), &n) == 0 && sa.sin_addr.s_addr) dotted(sa.sin_addr.s_addr, addr, sizeof addr);
    }
    if (fd >= 0) close(fd);
  }
  r->i = 1;
#endif
  return ZN_OK;
}
FN(fAddress) { (void)a; r->s = zs(addr, strlen(addr)); return ZN_OK; }
int bound(int type, int port) {
  const int fd = socket(AF_INET, type, 0);
  if (fd < 0) return fail("socket");
  int one = 1;
  setsockopt(fd, SOL_SOCKET, SO_REUSEADDR, &one, sizeof one);
  if (type == SOCK_DGRAM) setsockopt(fd, SOL_SOCKET, SO_BROADCAST, &one, sizeof one);
  sockaddr_in sa;
  memset(&sa, 0, sizeof sa);
  sa.sin_family = AF_INET;
  sa.sin_port = htons(static_cast<uint16_t>(port));
  sa.sin_addr.s_addr = htonl(INADDR_ANY);
  if (bind(fd, reinterpret_cast<sockaddr*>(&sa), sizeof sa) < 0) { fail("bind"); close(fd); return -1; }
  nonblocking(fd);
  return fd;
}
FN(fUdp) {
  const int fd = bound(SOCK_DGRAM, static_cast<int>(a[0].i));
  r->i = fd < 0 ? -1 : take(UDP, fd, 1);
  return ZN_OK;
}
FN(fSend) {
  Handle* h = at(a[0].i);
  sockaddr_in sa;
  r->i = 0;
  if (!h || h->kind != UDP || !resolve(a[1].s.p, static_cast<int>(a[2].i), sa)) return ZN_OK;
  const ssize_t n = sendto(h->fd, a[3].s.p, a[3].s.n, MSG_NOSIGNAL, reinterpret_cast<sockaddr*>(&sa), sizeof sa);
  if (n < 0) fail("sendto");
  r->i = n == static_cast<ssize_t>(a[3].s.n);
  return ZN_OK;
}
FN(fRecv) {
  Handle* h = at(a[0].i);
  r->s = zs(buf, 0);
  if (!h || h->kind != UDP) return ZN_OK;
  sockaddr_in sa;
  socklen_t len = sizeof sa;
  const ssize_t n = recvfrom(h->fd, buf, sizeof buf, MSG_DONTWAIT, reinterpret_cast<sockaddr*>(&sa), &len);
  if (n <= 0) return ZN_OK;
  dotted(sa.sin_addr.s_addr, from, sizeof from);
  fromPort = ntohs(sa.sin_port);
  r->s = zs(buf, static_cast<size_t>(n));
  return ZN_OK;
}
FN(fFrom) { (void)a; r->s = zs(from, strlen(from)); return ZN_OK; }
FN(fFromPort) { (void)a; r->i = fromPort; return ZN_OK; }
FN(fConnect) {
  sockaddr_in sa;
  r->i = -1;
  if (!resolve(a[0].s.p, static_cast<int>(a[1].i), sa)) return ZN_OK;
  const int fd = socket(AF_INET, SOCK_STREAM, 0);
  if (fd < 0) { fail("socket"); return ZN_OK; }
  nonblocking(fd);
  const int c = connect(fd, reinterpret_cast<sockaddr*>(&sa), sizeof sa);
  if (c < 0 && !again()) { fail("connect"); close(fd); return ZN_OK; }
  r->i = take(CONN, fd, c == 0 ? 1 : 0);
  return ZN_OK;
}
FN(fListen) {
  const int fd = bound(SOCK_STREAM, static_cast<int>(a[0].i));
  r->i = -1;
  if (fd < 0) return ZN_OK;
  if (listen(fd, 8) < 0) { fail("listen"); close(fd); return ZN_OK; }
  r->i = take(SERVER, fd, 1);
  return ZN_OK;
}
FN(fAccept) {
  Handle* h = at(a[0].i);
  r->i = -1;
  if (!h || h->kind != SERVER) return ZN_OK;
  sockaddr_in sa;
  socklen_t len = sizeof sa;
  const int fd = accept(h->fd, reinterpret_cast<sockaddr*>(&sa), &len);
  if (fd < 0) return ZN_OK;
  nonblocking(fd);
  dotted(sa.sin_addr.s_addr, from, sizeof from);
  fromPort = ntohs(sa.sin_port);
  r->i = take(CONN, fd, 1);
  return ZN_OK;
}
// a connection still connecting: open once getpeername() names the peer, failed once SO_ERROR says why
void settle(Handle& h) {
  if (h.state != 0) return;
  sockaddr_in sa;
  socklen_t len = sizeof sa;
  if (getpeername(h.fd, reinterpret_cast<sockaddr*>(&sa), &len) == 0) { h.state = 1; return; }
  int e = 0;
  socklen_t el = sizeof e;
  if (getsockopt(h.fd, SOL_SOCKET, SO_ERROR, &e, &el) == 0 && e != 0 && e != EINPROGRESS && e != EALREADY) {
    errno = e;
    fail("connect");
    h.state = -1;
  }
}
FN(fState) {
  Handle* h = at(a[0].i);
  if (h && h->kind == CONN) settle(*h);
  r->i = h ? h->state : -1;
  return ZN_OK;
}
FN(fWrite) {
  Handle* h = at(a[0].i);
  r->i = -1;
  if (!h || h->kind != CONN) return ZN_OK;
  settle(*h);
  if (h->state < 0) return ZN_OK;
  r->i = 0;
  if (h->state == 0) return ZN_OK;
  const ssize_t n = send(h->fd, a[1].s.p, a[1].s.n, MSG_NOSIGNAL);
  if (n >= 0) r->i = n;
  else if (!again()) { fail("send"); h->state = -1; r->i = -1; }
  return ZN_OK;
}
FN(fRead) {
  Handle* h = at(a[0].i);
  r->s = zs(buf, 0);
  if (!h || h->kind != CONN) return ZN_OK;
  settle(*h);
  if (h->state != 1) return ZN_OK;
  const ssize_t n = recv(h->fd, buf, sizeof buf, MSG_DONTWAIT);
  if (n > 0) r->s = zs(buf, static_cast<size_t>(n));
  else if (n == 0) { snprintf(err, sizeof err, "the peer closed the connection"); h->state = -1; }
  else if (!again()) { fail("recv"); h->state = -1; }
  return ZN_OK;
}
FN(fPort) {
  Handle* h = at(a[0].i);
  sockaddr_in sa;
  socklen_t len = sizeof sa;
  r->i = h && getsockname(h->fd, reinterpret_cast<sockaddr*>(&sa), &len) == 0 ? ntohs(sa.sin_port) : 0;
  return ZN_OK;
}
FN(fClose) {
  (void)r;
  if (Handle* h = at(a[0].i)) { close(h->fd); *h = Handle{FREE, -1, -1}; }
  return ZN_OK;
}
FN(fError) { (void)a; r->s = zs(err, strlen(err)); return ZN_OK; }

const ZnExport kExports[] = {
  {"up", ">i", fUp, 0}, {"address", ">s", fAddress, 0}, {"udp", "i>i", fUdp, 0}, {"send", "isis>b", fSend, 0}, {"recv", "i>s", fRecv, 0},
  {"from", ">s", fFrom, 0}, {"fromPort", ">i", fFromPort, 0}, {"connect", "si>i", fConnect, 0}, {"listen", "i>i", fListen, 0},
  {"accept", "i>i", fAccept, 0}, {"state", "i>i", fState, 0}, {"write", "is>i", fWrite, 0}, {"read", "i>s", fRead, 0}, {"port", "i>i", fPort, 0},
  {"close", "i>n", fClose, 0}, {"error", ">s", fError, 0},
};
void closeAll(void*) { for (Handle& h : hs) if (h.kind != FREE) { close(h.fd); h = Handle{FREE, -1, -1}; } }
}  // namespace

extern "C" const ZnModule zn_console_lan_module;   // declared extern first: a const at namespace scope is internal otherwise
extern "C" {
const ZnModule zn_console_lan_module = {ZN_ABI_VERSION, sizeof(ZnModule), "Lan", kExports, sizeof kExports / sizeof kExports[0], nullptr, 0, 0, nullptr, nullptr, closeAll};
const ZnModule* zn_module_Lan(void) { return &zn_console_lan_module; }   // the desktop's plugin library
}
