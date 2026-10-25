// A fake AppLoad qtfb server, a fake ink lane and a model of xochitl's compositing around the REAL display-rmpp driver (ZN-130,
// ZN-834). Built as a display plugin by tests/t1/rmpp_sim.sh, so a Zinc app (notes, dashboard) runs headless on the Mac and every
// message the driver sends is judged:
//   MSG_INIT       the server answers with the shared-memory key and size, the driver maps the same shared memory (shm_open) it would on the tablet;
//                  the format picks the panel (1 Paper Pro 1620x2160, 4 Move 954x1696, 7 Paper Pure 1404x1872);
//   MSG_UPDATE     only the rectangle of the update is copied from the shared framebuffer to the "glass": a driver that draws outside what it announces leaves stale pixels;
//   MSG_SET_MODE   qtfb sleeps one second on that connection: an update inside the second is lost (an error here), the driver must wait;
//   MSG_FULL_REFRESH  only with ZN_RMPP_SIM_APPLOAD=0.6, which also sends the device state after init (AppLoad 0.5 drops the client); sleeps one second too;
//   MSG_WINDOW_STATE  only with ZN_RMPP_SIM_APPLOAD=window (0.6 plus integrations/remarkable-engine/appload: the device state includes the
//                  window's visibility): minimize hides the window, an update while hidden is an error, and 60 frames later the window shows again;
//   the ink lane   (ZN_RMPP_SIM_LANE=ok | badhash | canvas | eof:N; unset: nobody listens) answers Hello with a vendor hash (canvas: as zinc-canvas), copies each Ink rectangle from the
//                  shared framebuffer to the glass, repaints the stroke's box at StrokeEnd, and with eof:N closes its end after N Ink messages.
//                  A qtfb update while the lane blocks xochitl's rendering, or an Ink outside a stroke, is an error.
//   rm2fb          (ZN_RMPP_SIM_RM2FB=1; unset: not running) timower's rm2fb server for the reMarkable 2: Init is answered with the format and the
//                  framebuffer's fd (SCM_RIGHTS, RGB565 1404x1872), each UpdateParams copies its rectangle to the glass and is answered true.
// ZN_RMPP_SIM_PEN=a-b,c-d holds the Marker down during those frames (the driver's stroke detection; the app's own ink is scripted).
// Output (ZN_RMPP_SIM_OUT=<dir>): trace.txt, one line per message with the virtual time, plus a hash of the glass after every update, and glass.ppm (last glass, 1/8 scale).
// Sockets are socketpairs (SOCK_DGRAM: AF_UNIX SEQPACKET does not exist on macOS) driven synchronously: the models run inside send().
#include <errno.h>
#include <fcntl.h>
#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/mman.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <sys/un.h>
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
#include "protocol.h"

namespace qsim {
enum : uint8_t { MSG_INIT = 0, MSG_UPDATE = 1, MSG_TERMINATE = 3, MSG_INPUT = 4, MSG_SET_MODE = 5, MSG_FULL_REFRESH = 6, MSG_STATE_CHANGED = 7,
                 MSG_STATE_INIT = 8, MSG_WINDOW_STATE = 9 };
static const char* appload = getenv("ZN_RMPP_SIM_APPLOAD") ? getenv("ZN_RMPP_SIM_APPLOAD") : "0.5";
static const bool windowState = !strcmp(appload, "window");
static const bool appload06 = windowState || !strcmp(appload, "0.6");   // else 0.5: no device state, no full refresh
struct ClientMsg { uint8_t type; union { struct { int key; uint8_t fmt; } init; struct { int type, x, y, w, h; } update; int mode; int window; }; };
struct ServerMsg { uint8_t type; union { struct { int shm_key; size_t shm_size; } init; struct { int type, id, x, y, pressure; } input;
                                   struct { int reason, value; } state; }; };

static int qtfb = -1, lane = -1, rm2 = -1;         // server ends
static uint16_t* rm2fb = nullptr;
static uint8_t* shm = nullptr;
static int shmKey = 0;
static std::vector<uint8_t> glass;                 // what xochitl shows: W x H RGB
static int W = 1620, H = 2160;
static uint64_t frames = 0;                        // presented frames: the clock of the model (a headless run has no real time worth keeping)
static uint64_t virtualNow() { return frames * 16667; }   // 60 Hz
static uint64_t sleepUntil = 0;
static int updates = 0, modes = 0, errors = 0, inks = 0;
static bool blocked = false;                       // the lane holds xochitl's rendering
static uint64_t hiddenAt = 0;                      // frame of the minimize, 0: the window shows
static std::string trace;
static uint64_t pixelsSent = 0;

static uint64_t fnv(const uint8_t* p, size_t n) { uint64_t h = 1469598103934665603ull; while (n--) { h ^= *p++; h *= 1099511628211ull; } return h; }
static unsigned long long glassHash() { return (unsigned long long)fnv(glass.data(), glass.size()); }
static void line(const char* fmt, ...) __attribute__((format(printf, 1, 2)));
static void line(const char* fmt, ...) {
  char b[256];
  va_list ap; va_start(ap, fmt); vsnprintf(b, sizeof b, fmt, ap); va_end(ap);
  trace += b; trace += '\n';
}
static void flush() {
  const char* dir = getenv("ZN_RMPP_SIM_OUT");
  if (!dir || glass.empty()) return;
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
static void show(int x, int y, int w, int h) {
  for (int r = y; r < y + h; r++) memcpy(&glass[((size_t)r * W + x) * 3], shm + ((size_t)r * W + x) * 3, (size_t)w * 3);
}

static void handle(const ClientMsg& m) {
  uint64_t now = virtualNow();
  if (m.type == MSG_INIT) {
    if (m.init.fmt == 4) { W = 954; H = 1696; } else if (m.init.fmt == 7) { W = 1404; H = 1872; }
    shmKey = m.init.key + 1000;   // AppLoad 0.6.0 names the buffer with a random key, not the framebuffer's
    char name[32]; snprintf(name, sizeof name, "/qtfb_%d", shmKey);
    shm_unlink(name);
    int fd = shm_open(name, O_RDWR | O_CREAT, 0600);
    size_t size = (size_t)W * H * 3;
    if (fd < 0 || ftruncate(fd, size) < 0) { line("error: cannot create %s", name); errors++; return; }
    shm = (uint8_t*)mmap(nullptr, size, PROT_READ | PROT_WRITE, MAP_SHARED, fd, 0);
    close(fd);
    glass.assign(size, 0xFF);
    ServerMsg r = {}; r.type = MSG_INIT; r.init.shm_key = shmKey; r.init.shm_size = size;
    send(qtfb, &r, sizeof r, 0);
    line("%8.1f ms init key %d fmt %d (RGB888 %dx%d)", now / 1000.0, m.init.key, m.init.fmt, W, H);
    if (appload06) { ServerMsg st = {}; st.type = MSG_STATE_INIT; send(qtfb, &st, sizeof st, 0); }   // the rotation
    if (windowState) { ServerMsg st = {}; st.type = MSG_STATE_INIT; st.state.reason = 1; st.state.value = 1; send(qtfb, &st, sizeof st, 0); }
  } else if (m.type == MSG_SET_MODE) {
    line("%8.1f ms mode %s (qtfb sleeps 1000 ms)", now / 1000.0, m.mode == 0 ? "FAST" : m.mode == 4 ? "UI" : "?");
    if (now < sleepUntil) { line("error: mode change while qtfb still sleeps"); errors++; }
    sleepUntil = now + 1000000;
    modes++;
  } else if (m.type == MSG_UPDATE) {
    int x = m.update.x, y = m.update.y, w = m.update.w, h = m.update.h;
    if (now < sleepUntil) { line("%8.1f ms error: update %d,%d %dx%d inside qtfb's sleep: lost", now / 1000.0, x, y, w, h); errors++; return; }
    if (blocked) { line("%8.1f ms error: update %d,%d %dx%d while the lane blocks rendering", now / 1000.0, x, y, w, h); errors++; return; }
    if (hiddenAt) { line("%8.1f ms error: update %d,%d %dx%d while the window is minimized", now / 1000.0, x, y, w, h); errors++; return; }
    if (x < 0 || y < 0 || w <= 0 || h <= 0 || x + w > W || y + h > H) { line("%8.1f ms error: update %d,%d %dx%d outside the panel", now / 1000.0, x, y, w, h); errors++; return; }
    show(x, y, w, h);
    updates++; pixelsSent += (uint64_t)w * h;
    line("%8.1f ms update %s %d,%d %dx%d glass %016llx", now / 1000.0, m.update.type == 1 ? "PARTIAL" : "FULL", x, y, w, h, glassHash());
  } else if (m.type == MSG_FULL_REFRESH) {
    if (!appload06) { line("%8.1f ms error: full refresh: AppLoad 0.5 closes the connection", now / 1000.0); errors++; return; }
    if (now < sleepUntil) { line("%8.1f ms error: full refresh inside qtfb's sleep", now / 1000.0); errors++; }
    sleepUntil = now + 1000000;
    line("%8.1f ms full refresh (qtfb sleeps 1000 ms)", now / 1000.0);
  } else if (m.type == MSG_WINDOW_STATE) {
    if (!windowState) { line("%8.1f ms error: window state: this AppLoad closes the connection", now / 1000.0); errors++; return; }
    if (m.window != 0) { line("%8.1f ms error: window state %d", now / 1000.0, m.window); errors++; return; }
    hiddenAt = frames;
    line("%8.1f ms minimize", now / 1000.0);
    ServerMsg st = {}; st.type = MSG_STATE_CHANGED; st.state.reason = 1; st.state.value = 0; send(qtfb, &st, sizeof st, 0);
  } else if (m.type == MSG_TERMINATE) {
    line("%8.1f ms terminate", now / 1000.0);
  }
}

static void laneClose(const char* why) {
  line("%8.1f ms lane closed: %s", virtualNow() / 1000.0, why);
  close(lane); lane = -1; blocked = false;
}
static void handleLane(const zink::Message& m) {
  double now = virtualNow() / 1000.0;
  const char* mode = getenv("ZN_RMPP_SIM_LANE");
  if (m.magic != zink::magic || m.version != zink::version) { line("error: lane protocol"); errors++; laneClose("protocol"); return; }
  if (m.type == zink::Hello) {
    if (m.key != shmKey) { line("error: lane hello key %d is not the qtfb buffer's %d", m.key, shmKey); errors++; }
    zink::Message w; w.type = zink::Welcome; w.seq = m.seq; w.w = W; w.h = H;
    if (!strcmp(mode, "canvas")) w.key = zink::Canvas;   // zinc-canvas: the hash is xochitl's, verified on the tablet, not a vendor row
    memcpy(w.hash, !strcmp(mode, "badhash") || !strcmp(mode, "canvas") ? "0badc0de0badc0de0badc0de0badc0de0badc0de0badc0de0badc0de0badc0de"
                                             : "3800e9f3d01f40fa3f5cc96ca49bcd982471ce5b033320f8788707520c8ddd08", 64);
    send(lane, &w, sizeof w, 0);
    line("%8.1f ms lane hello key %d -> welcome %.12s", now, m.key, w.hash);
  } else if (m.type == zink::StrokeBegin) {
    if (blocked) { line("error: stroke begin inside a stroke"); errors++; }
    blocked = true;
    line("%8.1f ms lane stroke begin (rendering blocked)", now);
  } else if (m.type == zink::Ink) {
    if (!blocked) { line("%8.1f ms error: ink outside a stroke", now); errors++; return; }
    if (!zink::inside(m, W, H)) { line("%8.1f ms error: ink %d,%d %dx%d outside the panel", now, m.x, m.y, m.w, m.h); errors++; laneClose("bad rect"); return; }
    show(m.x, m.y, m.w, m.h);
    line("%8.1f ms lane ink %d,%d %dx%d pen glass %016llx", now, m.x, m.y, m.w, m.h, glassHash());
    if (!strncmp(mode, "eof:", 4) && ++inks >= atoi(mode + 4)) laneClose("eof after ink");
  } else if (m.type == zink::StrokeEnd) {
    if (!blocked) { line("%8.1f ms error: stroke end outside a stroke", now); errors++; return; }
    blocked = false;
    if (zink::inside(m, W, H)) show(m.x, m.y, m.w, m.h);
    line("%8.1f ms lane stroke end, settle %d,%d %dx%d glass %016llx", now, m.x, m.y, m.w, m.h, glassHash());
  } else if (m.type == zink::Bye) {
    line("%8.1f ms lane bye", now);
  }
}
static void handleRm2(int32_t index) {
  double now = virtualNow() / 1000.0;
  struct FbFormat { int32_t w, h, format; };
  struct Init { bool own; FbFormat format; } init;
  struct Update { int32_t y1, x1, y2, x2, flags, waveform; float temperature; int32_t extra; } u;
  if (index == 0 && recv(rm2, &init, sizeof init, MSG_WAITALL) == (ssize_t)sizeof init) {
    W = 1404; H = 1872;
    int fd = shm_open("/zn-rm2fb-sim", O_RDWR | O_CREAT, 0600);
    shm_unlink("/zn-rm2fb-sim");
    if (fd < 0 || ftruncate(fd, (off_t)W * H * 3) < 0) { line("error: rm2fb buffer"); errors++; return; }
    rm2fb = (uint16_t*)mmap(nullptr, (size_t)W * H * 2, PROT_READ | PROT_WRITE, MAP_SHARED, fd, 0);
    glass.assign((size_t)W * H * 3, 0xFF);
    FbFormat granted = {W, H, 0};
    send(rm2, &granted, sizeof granted, 0);
    char one = 0, ctrl[CMSG_SPACE(sizeof(int))] = {};
    iovec io = {&one, 1};
    msghdr msg = {};
    msg.msg_iov = &io; msg.msg_iovlen = 1; msg.msg_control = ctrl; msg.msg_controllen = sizeof ctrl;
    cmsghdr* c = CMSG_FIRSTHDR(&msg);
    c->cmsg_level = SOL_SOCKET; c->cmsg_type = SCM_RIGHTS; c->cmsg_len = CMSG_LEN(sizeof(int));
    memcpy(CMSG_DATA(c), &fd, sizeof fd);
    sendmsg(rm2, &msg, 0);
    close(fd);
    line("%8.1f ms rm2fb init own %d format %dx%d/%d", now, init.own, init.format.w, init.format.h, init.format.format);
  } else if (index == 2 && recv(rm2, &u, sizeof u, MSG_WAITALL) == (ssize_t)sizeof u) {
    bool ok = rm2fb && u.x1 >= 0 && u.y1 >= 0 && u.x1 <= u.x2 && u.y1 <= u.y2 && u.x2 < W && u.y2 < H;
    if (!ok) { line("%8.1f ms error: rm2fb update %d,%d-%d,%d", now, u.x1, u.y1, u.x2, u.y2); errors++; }
    else for (int y = u.y1; y <= u.y2; y++) for (int x = u.x1; x <= u.x2; x++) {
      uint16_t v = rm2fb[(size_t)y * W + x];
      uint8_t* g = &glass[((size_t)y * W + x) * 3];
      g[0] = (uint8_t)((v >> 11) << 3); g[1] = (uint8_t)(((v >> 5) & 63) << 2); g[2] = (uint8_t)((v & 31) << 3);
    }
    if (ok) { updates++; pixelsSent += (uint64_t)(u.x2 - u.x1 + 1) * (u.y2 - u.y1 + 1); }
    const int wave = u.waveform & 0xfff;
    line("%8.1f ms rm2fb update %d,%d %dx%d %s glass %016llx", now, u.x1, u.y1, u.x2 - u.x1 + 1, u.y2 - u.y1 + 1,
         wave == 1 ? "DU" : wave == 3 ? "GC16_FAST" : "?", glassHash());
    send(rm2, &ok, 1, 0);
  } else { line("error: rm2fb message %d", index); errors++; }
}
static void pump() {
  ClientMsg m;
  while (qtfb >= 0 && recv(qtfb, &m, sizeof m, MSG_DONTWAIT) == (ssize_t)sizeof m) handle(m);
  int32_t index;
  while (rm2 >= 0 && recv(rm2, &index, sizeof index, MSG_DONTWAIT) == (ssize_t)sizeof index) handleRm2(index);
  zink::Message z;
  while (lane >= 0 && recv(lane, &z, sizeof z, MSG_DONTWAIT) == (ssize_t)sizeof z) handleLane(z);
}
struct Flush { ~Flush() { flush(); } } flusher;

static int zn_socket(int, int, int) { return socket(AF_UNIX, SOCK_DGRAM, 0); }
static int zn_connect(int s, const struct sockaddr* a, socklen_t) {
  const char* path = ((const sockaddr_un*)a)->sun_path;
  int* server = !strcmp(path, "/tmp/qtfb.sock") ? &qtfb : !strcmp(path, zink::socket_path) && getenv("ZN_RMPP_SIM_LANE") ? &lane
               : !strcmp(path, "/var/run/rm2fb.sock") && getenv("ZN_RMPP_SIM_RM2FB") ? &rm2 : nullptr;
  if (!server) { errno = ECONNREFUSED; return -1; }
  int pair[2];
  if (socketpair(AF_UNIX, server == &rm2 ? SOCK_STREAM : SOCK_DGRAM, 0, pair) != 0 || dup2(pair[0], s) < 0) return -1;
  close(pair[0]);
  *server = pair[1];
  return 0;
}
static ssize_t zn_send(int s, const void* b, size_t n, int flags) { ssize_t r = send(s, b, n, flags & ~MSG_NOSIGNAL); pump(); return r; }
static ssize_t zn_recv(int s, void* b, size_t n, int flags) { return recv(s, b, n, flags); }
}  // namespace qsim

#define hal_time_us qsim::virtualNow
#define socket qsim::zn_socket
#define connect qsim::zn_connect
#define send qsim::zn_send
#define recv qsim::zn_recv
#if defined(ZP_DISPLAY_RMPP_SIM_INK)
#define ZP_DISPLAY_RMPP_INK ZP_DISPLAY_RMPP_SIM_INK   // the "ink" option of the project's display object
#endif
#include "RMPP_DRIVER"
#undef hal_time_us
#undef socket
#undef connect
#undef send
#undef recv

// the model counts the frames the driver is handed, and holds the Marker down over ZN_RMPP_SIM_PEN's frame ranges
static void (*qsim_present)(const HalFrame*) = nullptr;
static void (*qsim_poll)(HalInput*) = nullptr;
static void qsim_counted(const HalFrame* f) { qsim::frames++; qsim_present(f); }
// ZN_RMPP_SIM_TAP=frame:x,y[;...]: AppLoad's MESSAGE_USERINPUT for a finger, INPUT_TOUCH_PRESS at that frame and INPUT_TOUCH_RELEASE two
// frames later, in framebuffer pixels (src/qtfb/FBController.cpp touchEvent)
static void qsim_taps() {
  const char* p = getenv("ZN_RMPP_SIM_TAP");
  for (const char* s = p ? p : ""; *s && qsim::qtfb >= 0;) {
    char* e;
    long f = strtol(s, &e, 10);
    int x = (int)strtol(e + 1, &e, 10), y = (int)strtol(e + 1, &e, 10);
    for (int k = 0; k < 2; k++) if ((long)qsim::frames == f + 2 * k) {
      qsim::ServerMsg m = {};
      m.type = qsim::MSG_INPUT; m.input.type = 0x10 + k; m.input.id = 3; m.input.x = x; m.input.y = y;
      send(qsim::qtfb, &m, sizeof m, 0);
      qsim::line("%8.1f ms touch %s %d,%d", qsim::virtualNow() / 1000.0, k ? "release" : "press", x, y);
    }
    s = *e ? e + 1 : e;
  }
}
// the person taps the minimized window's bar 60 frames after the app minimized it
static void qsim_restore() {
  if (!qsim::hiddenAt || qsim::frames < qsim::hiddenAt + 60) return;
  qsim::hiddenAt = 0;
  qsim::line("%8.1f ms restore", qsim::virtualNow() / 1000.0);
  qsim::ServerMsg st = {}; st.type = qsim::MSG_STATE_CHANGED; st.state.reason = 1; st.state.value = 1; send(qsim::qtfb, &st, sizeof st, 0);
}
static void qsim_polled(HalInput* in) {
  qsim_taps();
  qsim_restore();
  qsim_poll(in);
  if (const char* p = getenv("ZN_RMPP_SIM_PEN")) {
    bool down = false;
    for (const char* s = p; *s;) {
      char* e; long a = strtol(s, &e, 10), b = *e == '-' ? strtol(e + 1, &e, 10) : a;
      down = down || ((long)qsim::frames >= a && (long)qsim::frames < b);
      s = *e ? e + 1 : e;
    }
    rin::pen_down = down;
  }
}
static HalDisplay qsim_display;
static int qsim_wrap = (qsim_present = hal_display->present, qsim_poll = hal_display->poll, qsim_display = *hal_display,
                        qsim_display.present = qsim_counted, qsim_display.poll = qsim_polled, hal_display = &qsim_display, 0);
