// The sidecar's stream (app/sidecar): a Mac's screen as rectangles of 1-bit or grey pixels over TCP, written into qtfb's buffer and
// announced as partial updates from their own thread, without waiting for the app's frame loop: the shortest path qtfb has.
// rm_present leaves the screen to the stream while a Mac is connected, and draws the app's whole frame again when it leaves.
// Wire (little-endian). On connect the tablet says "RMPP <w> <h> <model>\n" (h: below xochitl's header when docked); then per message
//   [u8 type][u8 depth][u16 x][u16 y][u16 w][u16 h][u16 0][u32 len][payload]
//   1 RECT  depth 1: rows of ceil(w/8) bytes, MSB first, 1 = black; depth 8: grey bytes. Answered by an ACK.
//   2 MODE  x: qtfb's mode: 0 UFAST (the pen's), 1 FAST (DU), 2 ANIMATE (A2), 3 CONTENT (GC16, xochitl's page), 4 UI (GL16).
//   3 FULL  one full refresh.
// The tablet's messages are 16 bytes: [u8 kind][u8 type][u16 id][i32 a][i32 b][i32 c]
//   kind 1 ACK    a: the RECT's number, b: microseconds to apply it
//   kind 2 INPUT  type: AppLoad's (0x10 finger press, 0x11 release, 0x12 move; 0x20..0x22 the Marker), id: the finger,
//                 a, b: where, in the stream's pixels, c: the Marker's pressure. While a Mac is connected the app gets no touch.
//   kind 3 TURN   a: the tablet's way up from its accelerometer, 0 upright, 90 its top on the left, 180 upside down, 270 its top on the
//                 right; at the start and on each change (lying flat changes nothing). The Mac turns its picture to match.
//   kind 5 FULL   a full refresh has just started (the Mac's, or two fingers): what the Mac sends during it may not stay, so it
//                 sends again what changed once it is over.
//   kind 4 ROOM   a, b: the room the stream has now, when xochitl's header came or went: the Mac starts again at that size (and the
//                 rectangles it sends until then are dropped).
//   kind 7 MENU   a three-finger tap: the Mac shows or hides its quick panel over the picture.
// INPUT for the Marker (0x20..0x22, and 0x23: hovering, from evdev in an ink session) has its tilt in id: x degrees in the low byte, y in
// the high one (signed).
//   kind 6 SCROLL a, b: one finger's step while two are down, in the stream's pixels (the Mac halves it and turns it with the picture).
// A session ends with a full refresh once the app's page is back (the Mac sends FULL after its first picture). Two fingers scroll the Mac;
// two fingers that barely moved (a tap) ask for a full refresh. Neither finger goes to the Mac as the mouse.
#pragma once
#include <algorithm>
#include <atomic>
#include <functional>
#include <mutex>
#include <thread>
#include <vector>
#include <arpa/inet.h>
#include <errno.h>
#include <fcntl.h>
#include <netinet/in.h>
#include <netinet/tcp.h>
#include <poll.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include <sys/socket.h>
#include <time.h>
#include <unistd.h>

namespace stream {
inline std::atomic<bool> active{false};   // a Mac is connected: the screen is the stream's
inline std::atomic<bool> ended{false};    // it left: rm_present draws the app's frame again
inline std::atomic<int> mode{-1};         // the waveform the Mac asked for; rm_present switches on the main thread
inline std::atomic<bool> full{false};     // a full refresh the Mac asked for
inline int port = 0;
inline std::mutex out;          // the stream's thread answers, the main thread forwards touches
inline int client = -1, client_top = 0;
inline int fingers = 0;         // fingers down (main thread)
inline bool two = false;        // a second finger came down: the rest of this touch scrolls the Mac, or is a full refresh when it barely moved
inline int finger_x[16], finger_y[16], travel = 0;   // each finger's last place (AppLoad's id & 15), how far two fingers went
inline int last_id = 0, last_x = 0, last_y = 0;   // the finger the Mac has, where it was last
inline std::atomic<bool> moved{false};      // the room changed under this session: its rectangles are dropped until the Mac leaves
inline std::atomic<unsigned> session{0};
inline uint32_t now_us() { timespec t; clock_gettime(CLOCK_MONOTONIC, &t); return (uint32_t)(t.tv_sec * 1000000ull + t.tv_nsec / 1000); }   // which Mac is connected: the way-up watcher stops when it changes

inline bool send16(uint8_t kind, uint8_t type, uint16_t id, int32_t a, int32_t b, int32_t c) {
  uint8_t m[16] = {kind, type};
  memcpy(m + 2, &id, 2); memcpy(m + 4, &a, 4); memcpy(m + 8, &b, 4); memcpy(m + 12, &c, 4);
  std::lock_guard<std::mutex> g(out);
  return client >= 0 && write(client, m, sizeof m) == (ssize_t)sizeof m;
}
/** A touch or the Marker from AppLoad (panel pixels): to the Mac while one is connected; true when it took it. */
inline bool menu = false;       // a third finger came down: the touch asks for the Mac's quick panel
inline bool input(int type, int id, int x, int y, int pressure) {
  if (!active || !((type >= 0x10 && type <= 0x12) || (type >= 0x20 && type <= 0x23))) return false;
  if (type == 0x10 && ++fingers == 2) { two = true; travel = 0; send16(2, 0x11, (uint16_t)last_id, last_x, last_y, 0); }   // the Mac lets go of the first
  if (type == 0x10 && fingers == 3) menu = true;
  if (type >= 0x10 && type <= 0x12) {
    const int k = id & 15;
    if (two && type == 0x12) {   // each finger's step; the Mac halves them, two fingers moving together
      const int dx = x - finger_x[k], dy = y - finger_y[k];
      travel += (dx < 0 ? -dx : dx) + (dy < 0 ? -dy : dy);
      send16(6, 0, 0, dx, dy, 0);
    }
    finger_x[k] = x; finger_y[k] = y;
  }
  if (type == 0x11) {
    fingers = fingers > 0 ? fingers - 1 : 0;
    if (two) {   // a two-finger tap: a full refresh; a three-finger tap: the quick panel
      if (!fingers) { two = false; if (menu) send16(7, 0, 0, 0, 0, 0); else if (travel < 60) full = true; menu = false; }
      return true;
    }
  }
  if (two && type >= 0x10 && type <= 0x12) return true;
  if (type < 0x20) { last_id = id; last_x = x; last_y = y - client_top; }
  send16(2, (uint8_t)type, (uint16_t)id, x, y - client_top, pressure);
  return true;
}

/** Sends the tablet's way up while session `mine` lasts. The Paper Pro's lis2dw12 is mounted with the screen's x along the chip's y and the
 *  screen's y along its x (in_accel_mount_matrix); a reading is the reaction to gravity: up the screen when it stands upright. */
inline void watch_way_up(unsigned mine) {
  char dir[64] = "";
  for (int i = 0; i < 16 && !dir[0]; i++) {
    char p[80], n[32] = "";
    snprintf(p, sizeof p, "/sys/bus/iio/devices/iio:device%d/name", i);
    if (FILE* f = fopen(p, "r")) { if (fgets(n, sizeof n, f) && !strncmp(n, "lis2dw12_accel", 14)) snprintf(dir, sizeof dir, "/sys/bus/iio/devices/iio:device%d", i); fclose(f); }
  }
  if (!dir[0]) return;   // no accelerometer (the Move, the simulator): the Mac keeps its own --rotate
  auto axis = [&](const char* a) { char p[96]; int v = 0; snprintf(p, sizeof p, "%s/in_accel_%s_raw", dir, a);
                                   if (FILE* f = fopen(p, "r")) { if (fscanf(f, "%d", &v) != 1) v = 0; fclose(f); } return v; };
  int sent = -1, seen = -1;
  while (session == mine) {
    const int x = axis("y"), y = axis("x"), z = axis("z"), ax = x < 0 ? -x : x, ay = y < 0 ? -y : y, az = z < 0 ? -z : z;
    int way = -1;   // tilted at least ~30 degrees off flat, and one edge clearly lower
    if (ay > ax * 3 / 2 && ay * 2 > az) way = y > 0 ? 0 : 180;
    else if (ax > ay * 3 / 2 && ax * 2 > az) way = x > 0 ? 90 : 270;
    if (way >= 0 && way == seen && way != sent && send16(3, 0, 0, way, 0, 0)) { sent = way; fprintf(stderr, "display-rmpp: sidecar way up %d\n", way); }
    seen = way;
    usleep(250000);
  }
}

/** Called by the app's frame loop with the first row the stream may use now: a Mac given another room is told once. */
inline void room(int top, int w, int h) {
  if (!active || moved || top == client_top) return;
  moved = true;
  send16(4, 0, 0, w, h - top, 0);
  fprintf(stderr, "display-rmpp: sidecar room now %dx%d\n", w, h - top);
}

// The probe (on while /tmp/zinc-sidecar-probe exists when a Mac connects): how long the panel takes to start moving after an update.
// xochitl drives the panel through the LCDIF, whose interrupt counts only while the panel is driven (none at rest): read every ms,
// the first count after an update is when the panel starts. Logged every 5 s, apart for a panel at rest and one already driven.
inline std::atomic<uint32_t> probe_at{0};   // when the last update went out (us), 0 once the panel answered it
inline long lcdif_count() {
  FILE* f = fopen("/proc/interrupts", "r");
  if (!f) return -1;
  char line[256]; long n = -1;
  while (fgets(line, sizeof line, f)) if (strstr(line, "lcdif")) { sscanf(line, "%*d: %ld", &n); break; }
  fclose(f);
  return n;
}
inline void probe_loop(unsigned mine) {
  std::vector<uint32_t> rest, busy;
  long last = lcdif_count();
  uint32_t changed = 0, logged = 0;
  for (; session == mine; usleep(1000)) {
    const uint32_t t = now_us(); const long n = lcdif_count();
    const uint32_t at = probe_at;
    if (n != last) {
      if (at && (int32_t)(t - at) >= 0) { ((int32_t)(at - changed) > 40000 ? rest : busy).push_back(t - at); probe_at = 0; }
      last = n; changed = t;
    }
    if (t - logged > 5000000 && (rest.size() || busy.size())) {
      auto show = [](std::vector<uint32_t>& v, const char* what) {
        if (v.empty()) return;
        std::sort(v.begin(), v.end());
        fprintf(stderr, "display-rmpp: probe %s: %zu updates, panel starts after %u ms (median), %u ms (90%%), %u ms (max)\n", what, v.size(),
                v[v.size() / 2] / 1000, v[v.size() * 9 / 10] / 1000, v.back() / 1000);
        v.clear();
      };
      show(rest, "from rest"); show(busy, "while driven");
      logged = t;
    }
  }
}

struct Target {
  uint8_t* fb;                              // qtfb's RGB888 buffer, or the vendor engine's RGB32 one in an ink session (L2)
  int w, h;
  int stride, bpp;                          // bytes per row and per pixel (3 or 4)
  std::function<int()> top;                 // the first row the stream may use (the dock's)
  std::function<void(int, int, int, int)> update;   // one partial update
  std::function<bool()> busy;               // qtfb switching its waveform or sleeping after a full refresh: an update now is lost
  std::function<bool(int, int, int, int, int)> pen;   // the ink lane (L1, zinc-canvas): 0 begin, 1 ink x y w h, 2 end; empty without it,
                                                      // false once it is gone
  const char* model;
};

inline bool read_full(int fd, void* p, size_t n) {
  for (uint8_t* b = (uint8_t*)p; n;) { ssize_t r = read(fd, b, n); if (r <= 0) return false; b += r; n -= (size_t)r; }
  return true;
}

inline void serve(Target t, int ls) {
  static uint8_t lut[256][32];   // a byte of bits -> its 8 pixels (RGB888, or RGB32 with an opaque alpha)
  const int B = t.bpp;
  for (int b = 0; b < 256; b++) for (int i = 0; i < 8; i++) {
    memset(lut[b] + i * B, (b >> (7 - i) & 1) ? 0 : 0xFF, 3);
    if (B == 4) lut[b][i * 4 + 3] = 0xFF;
  }
  std::vector<uint8_t> buf;
  for (;;) {
    int c = accept(ls, nullptr, nullptr);
    if (c < 0) continue;
    int one = 1;
    setsockopt(c, IPPROTO_TCP, TCP_NODELAY, &one, sizeof one);
    // a USB link that drops for a moment can lose the Mac's goodbye: without keepalive the session waits for it forever and no Mac
    // can connect again. Probed after 2 s of silence, every second, given up after 3 unanswered (~5 s)
    int idle = 2, intvl = 1, cnt = 3;
    setsockopt(c, SOL_SOCKET, SO_KEEPALIVE, &one, sizeof one);
#ifdef TCP_KEEPIDLE
    setsockopt(c, IPPROTO_TCP, TCP_KEEPIDLE, &idle, sizeof idle);
#endif
    setsockopt(c, IPPROTO_TCP, TCP_KEEPINTVL, &intvl, sizeof intvl);
    setsockopt(c, IPPROTO_TCP, TCP_KEEPCNT, &cnt, sizeof cnt);
    const int top = t.top(), H = t.h - top;
    char hello[128];
    const int n = snprintf(hello, sizeof hello, "RMPP %d %d %s\n", t.w, H, t.model);
    if (write(c, hello, n) != n) { close(c); continue; }
    { std::lock_guard<std::mutex> g(out); client = c; client_top = top; }
    fingers = 0; two = false; moved = false;
    active = true;
    std::thread(watch_way_up, ++session).detach();
    const bool probe = access("/tmp/zinc-sidecar-probe", F_OK) == 0;
    if (probe) std::thread(probe_loop, (unsigned)session).detach();
    fprintf(stderr, "display-rmpp: sidecar connected, %dx%d from row %d\n", t.w, H, top);
    uint32_t seq = 0;
    uint8_t h[16];
    // With the ink lane, rectangles go out in xochitl's Pen mode (the Marker's own path) as one "stroke" while they keep coming; 300 ms
    // without one ends it and AppLoad's item settles its box in the stream's mode.
    // ponytail: fixed 300 ms, a Mac option if the settle shows up too often or too late
    bool pen = (bool)t.pen, stroke = false;
    auto settle = [&] { if (stroke && !t.pen(2, 0, 0, 1, 1)) pen = false; stroke = false; };
    for (;;) {
      pollfd pf = {c, POLLIN, 0};
      if (stroke && poll(&pf, 1, 300) == 0) settle();
      if (!read_full(c, h, sizeof h)) break;
      uint16_t x, y, w, hh; uint32_t len;
      memcpy(&x, h + 2, 2); memcpy(&y, h + 4, 2); memcpy(&w, h + 6, 2); memcpy(&hh, h + 8, 2); memcpy(&len, h + 12, 4);
      if (h[0] == 2) { if (x <= 4) mode = x; continue; }   // qtfb's modes, set by rm_present
      if (h[0] == 3) { full = true; continue; }
      const size_t stride = h[1] == 1 ? (w + 7u) / 8 : w;
      if (h[0] != 1 || (h[1] != 1 && h[1] != 8) || x + w > t.w || y + hh > H || len < stride * hh || len > (size_t)t.w * t.h) break;
      buf.resize(len);
      if (!read_full(c, buf.data(), len)) break;
      if (moved) { if (!send16(1, 0, 0, (int32_t)++seq, 0, 0)) break; continue; }   // the old room: answered, not drawn
      const uint32_t t0 = now_us();
      for (int j = 0; j < hh; j++) {
        uint8_t* d = t.fb + (size_t)(top + y + j) * t.stride + (size_t)x * B;
        const uint8_t* s = buf.data() + j * stride;
        if (h[1] == 1) {
          int i = 0;
          for (; i + 8 <= w; i += 8, d += 8 * B) memcpy(d, lut[s[i >> 3]], 8 * B);
          if (i < w) memcpy(d, lut[s[i >> 3]], (size_t)(w - i) * B);
        } else for (int i = 0; i < w; i++, d += B) { d[0] = d[1] = d[2] = s[i]; if (B == 4) d[3] = 0xFF; }
      }
      while (t.busy()) usleep(2000);   // a few ms with AppLoad 0006, a second without
      if (w && hh) {
        if (pen && !stroke) stroke = pen = t.pen(0, 0, 0, 0, 0);
        if (pen && !(pen = t.pen(1, x, top + y, w, hh))) stroke = false;
        if (!pen) t.update(x, top + y, w, hh);
        if (probe && !probe_at) probe_at = now_us() | 1;
      }
      ++seq;
      if (!send16(1, 0, 0, (int32_t)seq, (int32_t)(now_us() - t0), 0)) break;
    }
    settle();
    { std::lock_guard<std::mutex> g(out); client = -1; }
    ++session;
    close(c);
    fprintf(stderr, "display-rmpp: sidecar left after %u rectangles\n", seq);
    mode = -1; active = false; ended = true;
  }
}

/** Listens on the port (once; again with the same port is fine); false when it cannot. */
inline bool start(int p, Target t) {
  if (port) return port == p;
  int ls = socket(AF_INET, SOCK_STREAM, 0), one = 1;
  if (ls >= 0) fcntl(ls, F_SETFD, FD_CLOEXEC);   // not SOCK_CLOEXEC: macOS (the simulator) has none
  setsockopt(ls, SOL_SOCKET, SO_REUSEADDR, &one, sizeof one);
  sockaddr_in a = {};
  a.sin_family = AF_INET; a.sin_port = htons((uint16_t)p); a.sin_addr.s_addr = htonl(INADDR_ANY);
  if (ls < 0 || p <= 0 || p > 65535 || bind(ls, (sockaddr*)&a, sizeof a) || listen(ls, 1)) {
    fprintf(stderr, "display-rmpp: sidecar cannot listen on %d: %s\n", p, strerror(errno));
    if (ls >= 0) close(ls);
    return false;
  }
  port = p;
  std::thread(serve, std::move(t), ls).detach();
  return true;
}
}  // namespace stream
