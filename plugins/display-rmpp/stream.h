// The sidecar's stream (app/sidecar): a Mac's screen as rectangles of 1-bit or grey pixels over TCP, written into qtfb's buffer and
// announced as partial updates from their own thread, without waiting for the app's frame loop: the shortest path qtfb has.
// rm_present leaves the screen to the stream while a Mac is connected, and draws the app's whole frame again when it leaves.
// Wire (little-endian). On connect the tablet says "RMPP <w> <h> <model>\n" (h: below xochitl's header when docked); then per message
//   [u8 type][u8 depth][u16 x][u16 y][u16 w][u16 h][u16 0][u32 len][payload]
//   1 RECT  depth 1: rows of ceil(w/8) bytes, MSB first, 1 = black; depth 8: grey bytes. Answered by an ACK.
//   2 MODE  x: 0 the pen's waveform (black and white, fastest), 3 xochitl's page waveform (clears the fast one's trails), 4 UI.
//   3 FULL  one full refresh.
// The tablet's messages are 16 bytes: [u8 kind][u8 type][u16 id][i32 a][i32 b][i32 c]
//   kind 1 ACK    a: the RECT's number, b: microseconds to apply it
//   kind 2 INPUT  type: AppLoad's (0x10 finger press, 0x11 release, 0x12 move; 0x20..0x22 the Marker), id: the finger,
//                 a, b: where, in the stream's pixels, c: the Marker's pressure. While a Mac is connected the app gets no touch.
//   kind 3 TURN   a: the tablet's way up from its accelerometer, 0 upright, 90 its top on the left, 180 upside down, 270 its top on the
//                 right; at the start and on each change (lying flat changes nothing). The Mac turns its picture to match.
// A session ends with a full refresh once the app's page is back (the Mac sends FULL after its first picture), and a second finger
// down asks for one: neither finger goes to the Mac.
#pragma once
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
inline bool two = false;        // a second finger came down: the rest of this touch is the tablet's
inline int last_id = 0, last_x = 0, last_y = 0;   // the finger the Mac has, where it was last
inline std::atomic<unsigned> session{0};   // which Mac is connected: the way-up watcher stops when it changes

inline bool send16(uint8_t kind, uint8_t type, uint16_t id, int32_t a, int32_t b, int32_t c) {
  uint8_t m[16] = {kind, type};
  memcpy(m + 2, &id, 2); memcpy(m + 4, &a, 4); memcpy(m + 8, &b, 4); memcpy(m + 12, &c, 4);
  std::lock_guard<std::mutex> g(out);
  return client >= 0 && write(client, m, sizeof m) == (ssize_t)sizeof m;
}
/** A touch or the Marker from AppLoad (panel pixels): to the Mac while one is connected; true when it took it. */
inline bool input(int type, int id, int x, int y, int pressure) {
  if (!active || !((type >= 0x10 && type <= 0x12) || (type >= 0x20 && type <= 0x22))) return false;
  if (type == 0x10 && ++fingers == 2) { two = true; full = true; send16(2, 0x11, (uint16_t)last_id, last_x, last_y, 0); }   // the Mac lets go of the first
  if (type == 0x11) { fingers = fingers > 0 ? fingers - 1 : 0; if (two) { if (!fingers) two = false; return true; } }
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

struct Target {
  uint8_t* fb;                              // qtfb's RGB888 buffer
  int w, h;
  std::function<int()> top;                 // the first row the stream may use (the dock's)
  std::function<void(int, int, int, int)> update;   // one partial update
  std::function<bool()> busy;               // qtfb switching its waveform or sleeping after a full refresh: an update now is lost
  const char* model;
};

inline bool read_full(int fd, void* p, size_t n) {
  for (uint8_t* b = (uint8_t*)p; n;) { ssize_t r = read(fd, b, n); if (r <= 0) return false; b += r; n -= (size_t)r; }
  return true;
}
inline uint32_t now_us() { timespec t; clock_gettime(CLOCK_MONOTONIC, &t); return (uint32_t)(t.tv_sec * 1000000ull + t.tv_nsec / 1000); }

inline void serve(Target t, int ls) {
  static uint8_t lut[256][24];   // a byte of bits -> its 8 RGB888 pixels
  for (int b = 0; b < 256; b++) for (int i = 0; i < 8; i++) memset(lut[b] + i * 3, (b >> (7 - i) & 1) ? 0 : 0xFF, 3);
  std::vector<uint8_t> buf;
  for (;;) {
    int c = accept(ls, nullptr, nullptr);
    if (c < 0) continue;
    int one = 1;
    setsockopt(c, IPPROTO_TCP, TCP_NODELAY, &one, sizeof one);
    const int top = t.top(), H = t.h - top;
    char hello[128];
    const int n = snprintf(hello, sizeof hello, "RMPP %d %d %s\n", t.w, H, t.model);
    if (write(c, hello, n) != n) { close(c); continue; }
    { std::lock_guard<std::mutex> g(out); client = c; client_top = top; }
    fingers = 0; two = false;
    active = true;
    std::thread(watch_way_up, ++session).detach();
    fprintf(stderr, "display-rmpp: sidecar connected, %dx%d from row %d\n", t.w, H, top);
    uint32_t seq = 0;
    uint8_t h[16];
    while (read_full(c, h, sizeof h)) {
      uint16_t x, y, w, hh; uint32_t len;
      memcpy(&x, h + 2, 2); memcpy(&y, h + 4, 2); memcpy(&w, h + 6, 2); memcpy(&hh, h + 8, 2); memcpy(&len, h + 12, 4);
      if (h[0] == 2) { if (x == 0 || x == 3 || x == 4) mode = x; continue; }   // the waveforms rm_present can set
      if (h[0] == 3) { full = true; continue; }
      const size_t stride = h[1] == 1 ? (w + 7u) / 8 : w;
      if (h[0] != 1 || (h[1] != 1 && h[1] != 8) || x + w > t.w || y + hh > H || len < stride * hh || len > (size_t)t.w * t.h) break;
      buf.resize(len);
      if (!read_full(c, buf.data(), len)) break;
      const uint32_t t0 = now_us();
      for (int j = 0; j < hh; j++) {
        uint8_t* d = t.fb + ((size_t)(top + y + j) * t.w + x) * 3;
        const uint8_t* s = buf.data() + j * stride;
        if (h[1] == 1) {
          int i = 0;
          for (; i + 8 <= w; i += 8, d += 24) memcpy(d, lut[s[i >> 3]], 24);
          if (i < w) memcpy(d, lut[s[i >> 3]], (size_t)(w - i) * 3);
        } else for (int i = 0; i < w; i++, d += 3) d[0] = d[1] = d[2] = s[i];
      }
      while (t.busy()) usleep(2000);   // a few ms with AppLoad 0006, a second without
      if (w && hh) t.update(x, top + y, w, hh);
      ++seq;
      if (!send16(1, 0, 0, (int32_t)seq, (int32_t)(now_us() - t0), 0)) break;
    }
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
