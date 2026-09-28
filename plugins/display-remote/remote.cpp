// display-remote: the app's screen and input over TCP (docs/plugins/remote.md), for zinc:remote viewers.
// No local window: frames are rendered into a buffer and streamed to one client (a new connection replaces the old
// one). On connect the client gets the whole frame, then only the damaged rectangle of each frame (row-RLE,
// remote_proto.h). Pacing: at most ZP_DISPLAY_REMOTE_INFLIGHT frames without an ACK; damage accumulates meanwhile,
// so a slow link gets fewer, larger updates instead of a growing queue. Input messages land in HalInput.
// Beacon: one UDP multicast datagram per second so viewers can list the running apps (zinc:remote discover).
// Security: no encryption. Default bind is 127.0.0.1 (this machine only); set `bind` to "0.0.0.0" to expose the app on
// the network, and then a `token` (or ZINC_REMOTE_TOKEN): a viewer must send it (AUTH) before it gets the screen or
// its input is read, and a connection that has not authenticated never replaces the current viewer.
#include "hal.h"
#include "remote_proto.h"
#include <sys/socket.h>
#include <netinet/in.h>
#include <netinet/tcp.h>
#include <arpa/inet.h>
#include <fcntl.h>
#include <unistd.h>
#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#ifndef ZP_DISPLAY_REMOTE_PORT
#define ZP_DISPLAY_REMOTE_PORT 7700
#endif
#ifndef ZP_DISPLAY_REMOTE_BIND
#define ZP_DISPLAY_REMOTE_BIND "127.0.0.1"
#endif
#ifndef ZP_DISPLAY_REMOTE_FPS
#define ZP_DISPLAY_REMOTE_FPS 60
#endif
#ifndef ZP_DISPLAY_REMOTE_INFLIGHT
#define ZP_DISPLAY_REMOTE_INFLIGHT 2
#endif
#ifndef ZP_DISPLAY_REMOTE_TOKEN
#define ZP_DISPLAY_REMOTE_TOKEN ""
#endif
#ifndef ZP_DISPLAY_REMOTE_BEACON
#define ZP_DISPLAY_REMOTE_BEACON 1
#endif
#ifndef ZRT_PLATFORM
#define ZRT_PLATFORM "?"
#endif
#ifndef MSG_NOSIGNAL
#define MSG_NOSIGNAL 0
#endif

using namespace zremote;

static int W, H, port;
static int lfd = -1, cfd = -1, bfd = -1;
static uint32_t* fb;                     // last frame (persistent: render_damage writes into it)
static uint32_t* tmp;                    // rectangle gathered for encoding
static uint8_t* out; static size_t out_len, out_off, out_cap;
static uint8_t in[4096]; static size_t in_len;
static bool need_full;
static int dx0, dy0, dx1, dy1;           // damage not sent yet (empty when dx1 <= dx0)
static uint32_t seq, acked;
static char title[64];
static uint64_t last_present, last_beacon;
// stats (ZINC_REMOTE_LOG=1: one line per second)
static bool logit;
static uint64_t st_t0, st_bytes, st_raw, st_frames, st_loops;
// input received
static float rx, ry, rwheel; static int rdown; static uint32_t rbuttons;
static long frames_left = -1;           // ZINC_FRAMES=n: quit after n frames (scripted runs)

static char token[MAX_TOKEN + 1];      // empty: no authentication
static int pfd = -1;                     // connection waiting for its AUTH message
static uint8_t pin[5 + MAX_TOKEN]; static size_t pin_len; static uint64_t p_t0;
static void nonblock(int fd) { fcntl(fd, F_SETFL, fcntl(fd, F_GETFL, 0) | O_NONBLOCK); }
static void drop_client() { if (cfd >= 0) close(cfd); cfd = -1; out_len = out_off = 0; in_len = 0; rdown = 0; rbuttons = 0; }

static uint8_t* reserve(size_t n) {
  if (out_len + n > out_cap) {
    uint8_t* b = (uint8_t*)realloc(out, (out_len + n) * 2);
    if (!b) return nullptr;
    out = b; out_cap = (out_len + n) * 2;
  }
  return out + out_len;
}
static void msg(uint8_t type, const void* p, uint32_t n) {
  uint8_t* o = reserve(5 + n);
  if (!o) { drop_client(); return; }
  o[0] = type; put32(o + 1, n); if (n) memcpy(o + 5, p, n);
  out_len += 5 + n;
}
static void flush() {
  while (cfd >= 0 && out_off < out_len) {
    ssize_t w = send(cfd, out + out_off, out_len - out_off, MSG_NOSIGNAL);
    if (w > 0) { out_off += (size_t)w; continue; }
    if (w < 0 && (errno == EAGAIN || errno == EWOULDBLOCK)) return;
    drop_client();
    return;
  }
  if (out_off == out_len) out_off = out_len = 0;
}
static void add_damage(int x0, int y0, int x1, int y1) {
  if (x1 <= x0 || y1 <= y0) return;
  if (dx1 <= dx0) { dx0 = x0; dy0 = y0; dx1 = x1; dy1 = y1; return; }
  if (x0 < dx0) dx0 = x0; if (y0 < dy0) dy0 = y0; if (x1 > dx1) dx1 = x1; if (y1 > dy1) dy1 = y1;
}
/** Sends the pending damage as one frame when the client has acknowledged enough of the previous ones. */
static void pump() {
  flush();
  if (cfd < 0 || dx1 <= dx0 || seq - acked >= (uint32_t)ZP_DISPLAY_REMOTE_INFLIGHT || out_len) return;
  int w = dx1 - dx0, h = dy1 - dy0;
  for (int y = 0; y < h; y++) memcpy(tmp + (size_t)y * w, fb + (size_t)(dy0 + y) * W + dx0, (size_t)w * 4);
  uint32_t n = (uint32_t)w * h;
  uint8_t* o = reserve(5 + 8 + rle_bound(n));
  if (!o) { drop_client(); return; }
  put16(o + 5, (uint16_t)dx0); put16(o + 7, (uint16_t)dy0); put16(o + 9, (uint16_t)w); put16(o + 11, (uint16_t)h);
  uint32_t len = 8 + rle_encode(tmp, n, o + 13);
  o[0] = RECT; put32(o + 1, len);
  out_len += 5 + len;
  seq++;
  uint8_t s[4]; put32(s, seq); msg(FRAME, s, 4);
  st_bytes += 5 + len + 9; st_raw += (uint64_t)n * 4; st_frames++;
  dx0 = dy0 = dx1 = dy1 = 0;
  flush();
}

static void adopt_client(int c);
static void accept_client() {
  int c = accept(lfd, nullptr, nullptr);
  if (c < 0) return;
  if (!token[0]) { adopt_client(c); return; }
  if (pfd >= 0) close(pfd);  // one connection authenticating at a time
  pfd = c; nonblock(pfd); pin_len = 0; p_t0 = hal_time_us();
}
/** The pending connection: its first message must be AUTH with the token, within 3 s. */
static void read_pending() {
  if (pfd < 0) return;
  ssize_t n = recv(pfd, pin + pin_len, sizeof pin - pin_len, 0);
  if (n > 0) pin_len += (size_t)n;
  bool bad = n == 0 || (n < 0 && errno != EAGAIN && errno != EWOULDBLOCK) || hal_time_us() - p_t0 > 3000000;
  if (!bad && pin_len >= 5) {
    uint32_t len = get32(pin + 1), tl = (uint32_t)strlen(token);
    if (pin[0] != AUTH || len > MAX_TOKEN) bad = true;
    else if (pin_len >= 5 + len) {
      uint8_t d = len != tl;
      for (uint32_t i = 0; i < len; i++) d |= (uint8_t)(pin[5 + i] ^ (uint8_t)token[i % tl]);  // no early exit
      if (!d) { int c = pfd; pfd = -1; adopt_client(c); return; }
      bad = true;
    }
  }
  if (bad) { if (logit) fprintf(stderr, "remote: connection refused (token)\n"); close(pfd); pfd = -1; }
}
static void adopt_client(int c) {
  drop_client();  // ponytail: one viewer at a time; a newer connection wins
  cfd = c;
  nonblock(cfd);
  int one = 1;
  setsockopt(cfd, IPPROTO_TCP, TCP_NODELAY, &one, sizeof one);
#ifdef SO_NOSIGPIPE
  setsockopt(cfd, SOL_SOCKET, SO_NOSIGPIPE, &one, sizeof one);
#endif
  uint8_t hello[4 + sizeof title];
  put16(hello, (uint16_t)W); put16(hello + 2, (uint16_t)H);
  size_t tn = strlen(title);
  memcpy(hello + 4, title, tn);
  msg(HELLO, hello, (uint32_t)(4 + tn));
  need_full = true; seq = acked = 0;
  if (logit) fprintf(stderr, "remote: viewer connected\n");
}
static void read_client() {
  for (;;) {
    if (cfd < 0) return;
    ssize_t n = recv(cfd, in + in_len, sizeof in - in_len, 0);
    if (n == 0 || (n < 0 && errno != EAGAIN && errno != EWOULDBLOCK)) { if (logit) fprintf(stderr, "remote: viewer left\n"); drop_client(); return; }
    if (n < 0) return;
    in_len += (size_t)n;
    size_t off = 0;
    while (in_len - off >= 5) {
      uint32_t len = get32(in + off + 1);
      if (len > 64) { drop_client(); return; }
      if (in_len - off < 5 + len) break;
      const uint8_t* p = in + off + 5;
      switch (in[off]) {
        case ACK: if (len >= 4) acked = get32(p); break;
        case POINTER: if (len >= 10) { memcpy(&rx, p, 4); memcpy(&ry, p + 4, 4); rdown = p[8] != 0; } break;
        case WHEEL: if (len >= 4) { float d; memcpy(&d, p, 4); rwheel += d; } break;
        case BUTTONS: if (len >= 4) rbuttons = get32(p); break;
        case PING: if (out_len < 65536) msg(PONG, p, len); break;  // a client that never reads must not grow `out`
      }
      off += 5 + len;
    }
    memmove(in, in + off, in_len - off);
    in_len -= off;
  }
}

static uint64_t now_us() { return hal_time_us(); }
static void beacon() {
  if (bfd < 0) return;
  uint64_t t = now_us();
  if (last_beacon && t - last_beacon < 1000000) return;
  last_beacon = t;
  char b[160];
  int n = snprintf(b, sizeof b, "ZINC1\t%s\t%s\t%d\t%d\t%d\t%d", title, ZRT_PLATFORM, port, (int)getpid(), W, H);
  sockaddr_in a{}; a.sin_family = AF_INET; a.sin_port = htons(BEACON_PORT); inet_pton(AF_INET, GROUP, &a.sin_addr);
  sendto(bfd, b, (size_t)n, 0, (sockaddr*)&a, sizeof a);
}

static int r_init(const HalConfig* cfg) {
  W = cfg->width; H = cfg->height;
  snprintf(title, sizeof title, "%s", cfg->title ? cfg->title : "zinc");
  for (char* c = title; *c; c++) if (*c == '\t' || *c == '\n') *c = ' ';
  const char* e = getenv("ZINC_REMOTE_PORT");
  port = e ? atoi(e) : ZP_DISPLAY_REMOTE_PORT;
  const char* bind_addr = getenv("ZINC_REMOTE_BIND") ? getenv("ZINC_REMOTE_BIND") : ZP_DISPLAY_REMOTE_BIND;
  snprintf(token, sizeof token, "%s", getenv("ZINC_REMOTE_TOKEN") ? getenv("ZINC_REMOTE_TOKEN") : ZP_DISPLAY_REMOTE_TOKEN);
  if (const char* f = getenv("ZINC_FRAMES")) frames_left = atol(f);
  logit = getenv("ZINC_REMOTE_LOG") && getenv("ZINC_REMOTE_LOG")[0] == '1';
  lfd = socket(AF_INET, SOCK_STREAM, 0);
  int one = 1;
  setsockopt(lfd, SOL_SOCKET, SO_REUSEADDR, &one, sizeof one);
  sockaddr_in a{}; a.sin_family = AF_INET; a.sin_port = htons((uint16_t)port);
  if (inet_pton(AF_INET, bind_addr, &a.sin_addr) != 1 || bind(lfd, (sockaddr*)&a, sizeof a) < 0 || listen(lfd, 4) < 0) {
    fprintf(stderr, "display-remote: cannot listen on %s:%d (%s)\n", bind_addr, port, strerror(errno));
    close(lfd); lfd = -1;
    return 0;
  }
  nonblock(lfd);
  fb = (uint32_t*)calloc((size_t)W * H, 4);
  tmp = (uint32_t*)malloc((size_t)W * H * 4);
  fprintf(stderr, "display-remote: %dx%d on %s:%d%s\n", W, H, bind_addr, port, token[0] ? " (token)" : "");
  if (strncmp(bind_addr, "127.", 4) && !token[0])
    fprintf(stderr, "display-remote: warning: no token, anyone who can reach %s:%d sees and drives this app (set ZINC_REMOTE_TOKEN)\n", bind_addr, port);
  if (ZP_DISPLAY_REMOTE_BEACON) {
    // loopback-only apps announce on lo0 with TTL 0 (never leaves the machine); others on the LAN (TTL 1)
    bfd = socket(AF_INET, SOCK_DGRAM, 0);
    bool local = strncmp(bind_addr, "127.", 4) == 0;
    unsigned char ttl = local ? 0 : 1, loop = 1;
    setsockopt(bfd, IPPROTO_IP, IP_MULTICAST_TTL, &ttl, sizeof ttl);
    setsockopt(bfd, IPPROTO_IP, IP_MULTICAST_LOOP, &loop, sizeof loop);
    if (local) { in_addr lo; lo.s_addr = htonl(INADDR_LOOPBACK); setsockopt(bfd, IPPROTO_IP, IP_MULTICAST_IF, &lo, sizeof lo); }
    nonblock(bfd);
  }
  return 1;
}

static void r_present(const HalFrame* f) {
  if (lfd >= 0) accept_client();
  if (cfd >= 0 && f->w == W && f->h == H) {
    if (need_full) { f->render(fb, 0, H); add_damage(0, 0, W, H); need_full = false; }
    else if (f->x1 > f->x0 && f->y1 > f->y0) {
      (f->render_damage ? f->render_damage : f->render)(fb + (size_t)f->y0 * W, f->y0, f->y1);
      add_damage(f->x0, f->y0, f->x1, f->y1);
    }
  }
  pump();
  st_loops++;
  uint64_t t = now_us();
  if (logit && t - st_t0 >= 1000000) {
    if (st_t0 && cfd >= 0) fprintf(stderr, "remote: %llu frames sent / %llu, %.1f KiB/s (raw %.1f KiB/s, x%.1f)\n", (unsigned long long)st_frames, (unsigned long long)st_loops,
      st_bytes / 1024.0, st_raw / 1024.0, st_bytes ? (double)st_raw / st_bytes : 0.0);
    st_t0 = t; st_bytes = st_raw = st_frames = st_loops = 0;
  }
  // pacing: no vsync here, hold the loop to the configured rate. Deadlines, not fixed sleeps: macOS stretches the
  // sleeps of a windowless process (timer coalescing), the next frame makes up for it.
  const uint64_t period = 1000000 / (ZP_DISPLAY_REMOTE_FPS > 0 ? ZP_DISPLAY_REMOTE_FPS : 60);
  last_present = last_present && t < last_present + 2 * period ? last_present + period : t;
  if (last_present > t) hal_sleep_us(last_present - t);
}

static void r_poll(HalInput* inp) {
  beacon();
  if (lfd >= 0) accept_client();
  read_pending();
  read_client();
  pump();
  inp->px = rx; inp->py = ry; inp->pdown = rdown;
  inp->buttons = rbuttons;
  inp->wheel += rwheel; rwheel = 0;
  if (frames_left >= 0 && frames_left-- == 0) inp->quit = 1;
}
static void r_shutdown() {
  drop_client();
  if (pfd >= 0) close(pfd);
  if (lfd >= 0) close(lfd);
  if (bfd >= 0) close(bfd);
  lfd = bfd = -1;
}

static HalDisplay remote_display = {r_init, r_present, r_poll, r_shutdown};
static int registered = (hal_display = &remote_display, 0);
