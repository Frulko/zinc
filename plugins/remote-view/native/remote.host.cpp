// zinc:remote for macos/linux/rpi1 (remote.rpi1.cpp includes this file). docs/plugins/remote.md.
// Each session is a non-blocking TCP socket read by the event loop (a zrt::Poller): rectangles are decoded straight
// into a runtime-owned image on the main thread (never while it is being presented), FRAME marks it changed and is
// acknowledged, which paces the server. Discovery listens to the display-remote beacons (UDP multicast).
#include "zinc_native_remote.h"
#include "zrt_raster.h"
#include "mod/sock.h"
#include "../../display-remote/remote_proto.h"
#include <poll.h>
#include <stdio.h>
#include <stdlib.h>

using namespace zremote;
namespace {
zrt::String zs(const char* s) { return zrt::String::from(s, (uint32_t)strlen(s)); }

enum State { FREE, CONNECTING, OPEN, WAITING };  // WAITING: dropped, reconnecting later
struct Session {
  State st = FREE;
  int fd = -1;
  char host[128]; int port;
  bool reconnect = true, ever_open = false;
  double retry_at = 0, ping_at = 0;
  uint8_t* in = nullptr; size_t len = 0, cap = 0;
  int32_t w = 0, h = 0, img = -1;
  char name[64] = "";
  char token[MAX_TOKEN + 1] = "";  // sent as AUTH once connected
  zrt::Ref<zrt::PromiseObj<zrt::String>> pend;
  // stats
  int32_t frames = 0; int fcount = 0; size_t bytes = 0; double stat_t0 = 0, fps = 0, kbps = 0, rtt = 0;
};
const int MAXS = 8;
Session ss[MAXS];
Session* at(int32_t s) { return s >= 0 && s < MAXS && ss[s].st != FREE ? &ss[s] : nullptr; }

void send_msg(Session& s, uint8_t type, const void* p, uint32_t n) {
  if (s.st != OPEN) return;
  uint8_t b[5 + 16];
  b[0] = type; put32(b + 1, n); memcpy(b + 5, p, n);
  // ponytail: tiny messages, a full socket buffer drops them (input is resent on the next change anyway)
  (void)::send(s.fd, b, 5 + n, MSG_NOSIGNAL);
}
}  // namespace

struct HostRemote : NativeRemote, zrt::Poller {
  zrt::Fn<void(int32_t, zrt::String)> ev;
  zrt::Fn<void(zrt::String, zrt::String)> disc;
  int ufd = -1;

  void event(int32_t s, const char* kind) {
    if (!ev) return;
    zrt::Fn<void(int32_t, zrt::String)> f = ev;
    f(s, zs(kind));
    zrt::check_uncaught();
  }
  void start(Session& s) {
    s.fd = zrt::sock::tcp_connect(s.host, s.port);
    s.st = s.fd >= 0 ? CONNECTING : WAITING;
    s.retry_at = zrt::now_ms() + 1000;
  }
  /** Connection lost or refused: reject the first connect, or wait and retry. */
  void drop(int32_t i, const char* why) {
    Session& s = ss[i];
    if (s.fd >= 0) ::close(s.fd);
    s.fd = -1; s.len = 0;
    bool was_open = s.st == OPEN;
    if (s.pend.p) {
      zrt::Ref<zrt::PromiseObj<zrt::String>> p = s.pend;
      s.pend = nullptr;
      p->reject(zrt::make<zrt::Error>(zs(why)));
      free_session(s);
      return;
    }
    s.st = s.reconnect ? WAITING : FREE;
    s.retry_at = zrt::now_ms() + 1000;
    if (s.st == FREE) free_session(s);
    if (was_open) event(i, "close");
  }
  void free_session(Session& s) {
    if (s.fd >= 0) ::close(s.fd);
    if (s.img >= 0) zrt::raster::dyn_destroy(s.img);
    free(s.in);
    s = Session();
  }

  zrt::Promise<zrt::String> connect(zrt::String host, int32_t port, zrt::String token) override {
    auto pr = zrt::Promise<zrt::String>::make_pending();
    int i = 0;
    while (i < MAXS && ss[i].st != FREE) i++;
    if (i == MAXS) { pr.p->reject(zrt::make<zrt::Error>(zs("remote: too many sessions"))); return pr; }
    Session& s = ss[i];
    zrt::sock::CStr h(host);
    snprintf(s.host, sizeof s.host, "%s", h.c());
    s.port = port;
    zrt::sock::CStr t(token);
    const char* env = getenv("ZINC_REMOTE_TOKEN");
    snprintf(s.token, sizeof s.token, "%s", token.bytes() ? t.c() : env ? env : "");
    s.pend = pr.p;
    start(s);
    if (s.st == WAITING) drop(i, "remote: cannot resolve host");
    return pr;
  }
  void setReconnect(int32_t i, bool on) override { if (Session* s = at(i)) s->reconnect = on; }
  void close(int32_t i) override { if (Session* s = at(i)) { bool was = s->st == OPEN; free_session(*s); if (was) event(i, "close"); } }
  bool connected(int32_t i) override { Session* s = at(i); return s && s->st == OPEN && s->w > 0; }
  int32_t image(int32_t i) override { Session* s = at(i); return s ? s->img : -1; }
  int32_t width(int32_t i) override { Session* s = at(i); return s ? s->w : 0; }
  int32_t height(int32_t i) override { Session* s = at(i); return s ? s->h : 0; }
  zrt::String name(int32_t i) override { Session* s = at(i); return zs(s ? s->name : ""); }
  double fps(int32_t i) override { Session* s = at(i); return s ? s->fps : 0; }
  double rtt(int32_t i) override { Session* s = at(i); return s ? s->rtt : 0; }
  double kbps(int32_t i) override { Session* s = at(i); return s ? s->kbps : 0; }
  int32_t frames(int32_t i) override { Session* s = at(i); return s ? s->frames : 0; }
  void pointer(int32_t i, double x, double y, bool down, int32_t button) override {
    Session* s = at(i); if (!s) return;
    uint8_t b[10]; float fx = (float)x, fy = (float)y;
    memcpy(b, &fx, 4); memcpy(b + 4, &fy, 4); b[8] = down; b[9] = (uint8_t)button;
    send_msg(*s, POINTER, b, 10);
  }
  void wheel(int32_t i, double dy) override { Session* s = at(i); if (!s) return; float d = (float)dy; send_msg(*s, WHEEL, &d, 4); }
  void buttons(int32_t i, int32_t mask) override { Session* s = at(i); if (!s) return; uint8_t b[4]; put32(b, (uint32_t)mask); send_msg(*s, BUTTONS, b, 4); }
  void onEvent(zrt::Fn<void(int32_t, zrt::String)> f) override { ev = f; }
  void discover(bool on, zrt::Fn<void(zrt::String, zrt::String)> f) override {
    disc = on ? f : nullptr;
    if (!on) { if (ufd >= 0) ::close(ufd); ufd = -1; return; }
    if (ufd >= 0) return;
    ufd = socket(AF_INET, SOCK_DGRAM, 0);
    int one = 1;
    setsockopt(ufd, SOL_SOCKET, SO_REUSEADDR, &one, sizeof one);
#ifdef SO_REUSEPORT
    setsockopt(ufd, SOL_SOCKET, SO_REUSEPORT, &one, sizeof one);  // several viewers on one machine
#endif
    sockaddr_in a{}; a.sin_family = AF_INET; a.sin_port = htons(BEACON_PORT); a.sin_addr.s_addr = htonl(INADDR_ANY);
    if (bind(ufd, (sockaddr*)&a, sizeof a) < 0) { ::close(ufd); ufd = -1; fprintf(stderr, "remote: cannot listen for beacons on %d\n", BEACON_PORT); return; }
    // loopback-only apps announce on lo0, the others on the default interface: join the group on both
    const char* itfs[2] = {"127.0.0.1", "0.0.0.0"};
    for (const char* itf : itfs) {
      ip_mreq m{}; inet_pton(AF_INET, GROUP, &m.imr_multiaddr); inet_pton(AF_INET, itf, &m.imr_interface);
      setsockopt(ufd, IPPROTO_IP, IP_ADD_MEMBERSHIP, &m, sizeof m);
    }
    zrt::sock::nonblock(ufd);
  }

  /** Handles complete messages in the input buffer; false on a protocol error. */
  bool parse(int32_t i) {
    Session& s = ss[i];
    size_t off = 0;
    while (s.len - off >= 5) {
      uint32_t n = get32(s.in + off + 1);
      // no message is longer than a whole-screen RECT: a larger length is a bad server, not a reason to buffer
      if (n > 4096 + (s.w > 0 ? 8 + rle_bound((uint32_t)s.w * (uint32_t)s.h) : 0)) return false;
      if (s.len - off < 5 + (size_t)n) break;
      const uint8_t* p = s.in + off + 5;
      uint8_t t = s.in[off];
      off += 5 + n;
      if (t == HELLO && n >= 4) {
        int32_t w = get16(p), h = get16(p + 2);
        uint32_t k = n - 4 < sizeof s.name - 1 ? n - 4 : sizeof s.name - 1;
        memcpy(s.name, p + 4, k); s.name[k] = 0;
        if (s.img < 0) s.img = zrt::raster::dyn_create(w, h);
        else if (w != s.w || h != s.h) zrt::raster::dyn_resize(s.img, w, h);
        // the image may refuse the size (0, too large, out of memory): RECTs are checked against what it really has
        int32_t iw = 0, ih = 0;
        if (s.img < 0 || !zrt::raster::image_size(s.img, &iw, &ih) || iw != w || ih != h) return false;
        s.w = w; s.h = h;
        s.ever_open = true;
        if (s.pend.p) {
          zrt::Ref<zrt::PromiseObj<zrt::String>> pr = s.pend;
          s.pend = nullptr;
          char id[16]; snprintf(id, sizeof id, "%d", (int)i);
          pr->resolve(zs(id));
        }
        event(i, "open");
      } else if (t == RECT && n >= 8) {
        int32_t x = get16(p), y = get16(p + 2), w = get16(p + 4), h = get16(p + 6);
        uint32_t* px = s.img >= 0 ? zrt::raster::dyn_pixels(s.img) : nullptr;
        if (!px || x + w > s.w || y + h > s.h || !rle_decode(p + 8, n - 8, px + (size_t)y * s.w + x, s.w, w, h)) return false;
      } else if (t == FRAME && n >= 4) {
        if (s.img >= 0) zrt::raster::dyn_update(s.img, nullptr, s.w);
        s.frames++; s.fcount++;
        uint8_t ack[4]; memcpy(ack, p, 4);
        send_msg(s, ACK, ack, 4);
      } else if (t == PONG && n >= 8) {
        double t0; memcpy(&t0, p, 8);
        s.rtt = zrt::now_ms() - t0;
      }
    }
    memmove(s.in, s.in + off, s.len - off);
    s.len -= off;
    return true;
  }

  bool poll() override {
    bool active = ufd >= 0;
    double now = zrt::now_ms();
    for (int32_t i = 0; i < MAXS; i++) {
      Session& s = ss[i];
      if (s.st == FREE) continue;
      active = true;
      if (s.st == WAITING) { if (now >= s.retry_at) start(s); continue; }
      if (s.st == CONNECTING) {
        pollfd pf = {s.fd, POLLOUT, 0};
        if (::poll(&pf, 1, 0) <= 0) { if (now > s.retry_at + 4000) drop(i, "remote: connect timeout"); continue; }
        int err = 0; socklen_t el = sizeof err;
        getsockopt(s.fd, SOL_SOCKET, SO_ERROR, &err, &el);
        if (err) { drop(i, "remote: connection refused"); continue; }
        s.st = OPEN; s.stat_t0 = now; s.ping_at = 0;
        if (s.token[0]) {  // AUTH first: the server sends nothing (HELLO) before it
          uint8_t b[5 + MAX_TOKEN]; uint32_t tl = (uint32_t)strlen(s.token);
          b[0] = AUTH; put32(b + 1, tl); memcpy(b + 5, s.token, tl);
          (void)::send(s.fd, b, 5 + tl, MSG_NOSIGNAL);
        }
      }
      for (;;) {
        if (s.len >= (64u << 20) + (size_t)s.w * s.h * 4) break;  // parse what is there first (no message is larger)
        if (s.cap - s.len < 65536) {
          uint8_t* b = (uint8_t*)realloc(s.in, s.cap * 2 + 65536);
          if (!b) { drop(i, "remote: out of memory"); break; }
          s.in = b; s.cap = s.cap * 2 + 65536;
        }
        ssize_t n = recv(s.fd, s.in + s.len, s.cap - s.len, 0);
        if (n > 0) { s.len += (size_t)n; s.bytes += (size_t)n; continue; }
        if (n == 0 || (errno != EAGAIN && errno != EWOULDBLOCK)) { drop(i, "remote: connection closed"); break; }
        break;
      }
      if (s.st != OPEN) continue;
      if (!parse(i)) { drop(i, "remote: bad data"); continue; }
      if (now >= s.ping_at) { s.ping_at = now + 500; send_msg(s, PING, &now, 8); }
      if (now - s.stat_t0 >= 1000) {
        s.fps = s.fcount * 1000.0 / (now - s.stat_t0); s.kbps = s.bytes / 1.024 / (now - s.stat_t0);
        s.fcount = 0; s.bytes = 0; s.stat_t0 = now;
      }
    }
    while (ufd >= 0) {
      char b[512]; sockaddr_in from{}; socklen_t fl = sizeof from;
      ssize_t n = recvfrom(ufd, b, sizeof b - 1, 0, (sockaddr*)&from, &fl);
      if (n <= 0) break;
      b[n] = 0;
      if (strncmp(b, "ZINC1\t", 6) != 0 || !disc) continue;
      char host[INET_ADDRSTRLEN];
      inet_ntop(AF_INET, &from.sin_addr, host, sizeof host);
      zrt::Fn<void(zrt::String, zrt::String)> f = disc;
      f(zrt::String::from(b, (uint32_t)n), zs(host));
      zrt::check_uncaught();
    }
    return active;
  }
  void shutdown() override {
    ev = nullptr; disc = nullptr;
    for (auto& s : ss) { s.pend = nullptr; if (s.st != FREE) free_session(s); }
    if (ufd >= 0) ::close(ufd);
    ufd = -1;
  }
};

NativeRemote* zinc_create_Remote() {
  static HostRemote r;
  r.rc = zrt::IMMORTAL;
  zrt::add_poller(&r);
  return &r;
}
