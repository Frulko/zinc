// A fake AppLoad qtfb server and a model of xochitl's compositing around the REAL display-rmpp driver (ZN-130). Built as a display plugin by tests/t1/rmpp_sim.sh, so a Zinc app
// (notes, dashboard) runs headless on the Mac and every message the driver sends is judged:
//   MSG_INIT       the server answers with the shared-memory key and size, the driver maps the same shared memory (shm_open) it would on the tablet;
//   MSG_UPDATE     only the rectangle of the update is copied from the shared framebuffer to the "glass": a driver that draws outside what it announces leaves stale pixels;
//   MSG_SET_MODE   qtfb sleeps one second on that connection: an update inside the second is lost (an error here), the driver must wait;
// Output (ZN_RMPP_SIM_OUT=<dir>): trace.txt, one line per message with the virtual time, plus a hash of the glass after every update, and glass.ppm (last glass, 1/8 scale).
// The socket is a socketpair (SOCK_DGRAM: AF_UNIX SEQPACKET does not exist on macOS) driven synchronously: the model runs inside send().
#include <fcntl.h>
#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/mman.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <unistd.h>

#include <string>
#include <vector>

#ifndef MSG_NOSIGNAL
#define MSG_NOSIGNAL 0
#endif
#ifndef SOCK_SEQPACKET
#define SOCK_SEQPACKET 0
#endif
#ifndef SOCK_CLOEXEC
#define SOCK_CLOEXEC 0
#endif
#include "hal.h"

namespace qsim {
enum : uint8_t { MSG_INIT = 0, MSG_UPDATE = 1, MSG_TERMINATE = 3, MSG_INPUT = 4, MSG_SET_MODE = 5 };
struct ClientMsg { uint8_t type; union { struct { int key; uint8_t fmt; } init; struct { int type, x, y, w, h; } update; int mode; }; };
struct ServerMsg { uint8_t type; union { struct { int shm_key; size_t shm_size; } init; struct { int type, id, x, y, pressure; } input; }; };

static int pair[2] = {-1, -1};
static uint8_t* shm = nullptr;
static std::vector<uint8_t> glass;                 // what xochitl shows: 1620 x 2160 RGB
static const int W = 1620, H = 2160;
static uint64_t frames = 0;                        // presented frames: the clock of the model (a headless run has no real time worth keeping)
static uint64_t virtualNow() { return frames * 16667; }   // 60 Hz
static uint64_t sleepUntil = 0;
static int updates = 0, modes = 0, errors = 0;
static std::string trace;
static uint64_t pixelsSent = 0;

static uint64_t fnv(const uint8_t* p, size_t n) { uint64_t h = 1469598103934665603ull; while (n--) { h ^= *p++; h *= 1099511628211ull; } return h; }
static void line(const char* fmt, ...) __attribute__((format(printf, 1, 2)));
static void line(const char* fmt, ...) {
  char b[256];
  va_list ap; va_start(ap, fmt); vsnprintf(b, sizeof b, fmt, ap); va_end(ap);
  trace += b; trace += '\n';
}
static void flush() {
  const char* dir = getenv("ZN_RMPP_SIM_OUT");
  if (!dir) return;
  std::string d = dir;
  if (FILE* f = fopen((d + "/trace.txt").c_str(), "w")) {
    fprintf(f, "%s# %d updates, %d mode changes, %d errors, %llu pixels announced\n", trace.c_str(), updates, modes, errors, (unsigned long long)pixelsSent);
    fclose(f);
  }
  if (FILE* f = fopen((d + "/glass.ppm").c_str(), "wb")) {   // 1/8 scale, nearest
    fprintf(f, "P6\n%d %d\n255\n", W / 8, H / 8);
    for (int y = 0; y < H / 8; y++) for (int x = 0; x < W / 8; x++) fwrite(&glass[((size_t)y * 8 * W + x * 8) * 3], 1, 3, f);
    fclose(f);
  }
}

static void reply(const ServerMsg& m) { send(pair[1], &m, sizeof m, 0); }
static void handle(const ClientMsg& m) {
  uint64_t now = virtualNow();
  if (m.type == MSG_INIT) {
    char name[32]; snprintf(name, sizeof name, "/qtfb_%d", m.init.key);
    shm_unlink(name);
    int fd = shm_open(name, O_RDWR | O_CREAT, 0600);
    size_t size = (size_t)W * H * 3;
    if (fd < 0 || ftruncate(fd, size) < 0) { line("error: cannot create %s", name); errors++; return; }
    shm = (uint8_t*)mmap(nullptr, size, PROT_READ | PROT_WRITE, MAP_SHARED, fd, 0);
    close(fd);
    glass.assign(size, 0xFF);
    ServerMsg r = {}; r.type = MSG_INIT; r.init.shm_key = m.init.key; r.init.shm_size = size;
    reply(r);
    line("%8.1f ms init key %d fmt %d (RGB888 %dx%d)", now / 1000.0, m.init.key, m.init.fmt, W, H);
  } else if (m.type == MSG_SET_MODE) {
    line("%8.1f ms mode %s (qtfb sleeps 1000 ms)", now / 1000.0, m.mode == 1 ? "FAST" : m.mode == 4 ? "UI" : "?");
    if (now < sleepUntil) { line("error: mode change while qtfb still sleeps"); errors++; }
    sleepUntil = now + 1000000;
    modes++;
  } else if (m.type == MSG_UPDATE) {
    int x = m.update.x, y = m.update.y, w = m.update.w, h = m.update.h;
    if (now < sleepUntil) { line("%8.1f ms error: update %d,%d %dx%d inside qtfb's sleep: lost", now / 1000.0, x, y, w, h); errors++; return; }
    if (x < 0 || y < 0 || w <= 0 || h <= 0 || x + w > W || y + h > H) { line("%8.1f ms error: update %d,%d %dx%d outside the panel", now / 1000.0, x, y, w, h); errors++; return; }
    for (int r = y; r < y + h; r++) memcpy(&glass[((size_t)r * W + x) * 3], shm + ((size_t)r * W + x) * 3, (size_t)w * 3);
    updates++; pixelsSent += (uint64_t)w * h;
    line("%8.1f ms update %s %d,%d %dx%d glass %016llx", now / 1000.0, m.update.type == 1 ? "PARTIAL" : "FULL", x, y, w, h, (unsigned long long)fnv(glass.data(), glass.size()));
  } else if (m.type == MSG_TERMINATE) {
    line("%8.1f ms terminate", now / 1000.0);
  }
}
static void pump() {
  ClientMsg m;
  while (recv(pair[1], &m, sizeof m, MSG_DONTWAIT) == (ssize_t)sizeof m) handle(m);
}
struct Flush { ~Flush() { flush(); } } flusher;

static int zn_socket(int, int, int) { if (pair[0] < 0) socketpair(AF_UNIX, SOCK_DGRAM, 0, pair); return pair[0]; }
static int zn_connect(int, const struct sockaddr*, socklen_t) { return 0; }
static ssize_t zn_send(int s, const void* b, size_t n, int flags) { ssize_t r = send(s, b, n, flags & ~MSG_NOSIGNAL); pump(); return r; }
static ssize_t zn_recv(int s, void* b, size_t n, int flags) { return recv(s, b, n, flags); }
}  // namespace qsim

#define hal_time_us qsim::virtualNow
#define socket qsim::zn_socket
#define connect qsim::zn_connect
#define send qsim::zn_send
#define recv qsim::zn_recv
#include "RMPP_DRIVER"
#undef hal_time_us
#undef socket
#undef connect
#undef send
#undef recv

// the model counts the frames the driver is handed
static void (*qsim_present)(const HalFrame*) = nullptr;
static void qsim_counted(const HalFrame* f) { qsim::frames++; qsim_present(f); }
static HalDisplay qsim_display;
static int qsim_wrap = (qsim_present = hal_display->present, qsim_display = *hal_display, qsim_display.present = qsim_counted, hal_display = &qsim_display, 0);
