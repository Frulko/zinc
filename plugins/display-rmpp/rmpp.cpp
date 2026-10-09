// display-rmpp on the reMarkable Paper Pro. The panel is driven by a software TCON inside xochitl (libqsgepaper), with
// no usable fbdev and no public waveform ioctl, so we draw through AppLoad's qtfb: a shared-memory RGB888 1620x2160
// framebuffer that xochitl composites, plus update/refresh-mode messages on /tmp/qtfb.sock (protocol:
// asivery/rm-appload src/qtfb/common.h). Launch the app from AppLoad (external.manifest.json, "qtfb": true), which sets
// QTFB_KEY. Touch comes from qtfb; evdev supplies Marker pressure, tilt and the eraser end.
// Mode changes are explicit (drawing FAST / colour preview UI), never automatic per stroke.
// Only changed RGB pixels are submitted; xochitl owns the physical refresh policy.
#if defined(ZP_DISPLAY_RMPP_DIRECT) && ZP_DISPLAY_RMPP_DIRECT
#include "direct.h"
#else
#include "eink.h"
#include "input.h"
#include <errno.h>
#include <sys/mman.h>
#include <sys/socket.h>
#include <sys/un.h>

#ifndef ZP_DISPLAY_RMPP_REFRESH_MODE
#define ZP_DISPLAY_RMPP_REFRESH_MODE "ui"
#endif
#ifndef ZP_DISPLAY_RMPP_FAST_HZ
#define ZP_DISPLAY_RMPP_FAST_HZ 60
#endif
#ifndef ZP_DISPLAY_RMPP_COLOR_HZ
#define ZP_DISPLAY_RMPP_COLOR_HZ 8
#endif

namespace {
enum : uint8_t { MSG_INIT = 0, MSG_UPDATE = 1, MSG_TERMINATE = 3, MSG_INPUT = 4, MSG_SET_MODE = 5 };
enum : int { FMT_RMPP_RGB888 = 1, UPDATE_PARTIAL = 1, MODE_FAST = 1, MODE_UI = 4 };
// wire structs, same layout as qtfb::ClientMessage / ServerMessage (LP64: 24 and 32 bytes)
struct ClientMsg { uint8_t type; union { struct { int key; uint8_t fmt; } init; struct { int type, x, y, w, h; } update; int mode; }; };
struct ServerMsg { uint8_t type; union { struct { int shm_key; size_t shm_size; } init; struct { int type, id, x, y, pressure; } input; }; };
static_assert(sizeof(ClientMsg) == 24 && sizeof(ServerMsg) == 32, "qtfb wire layout");

eink::Panel panel;
int sock = -1;
uint8_t* shm = nullptr;
size_t shm_size = 0;
eink::Rect pending = {};
int refresh_mode = -1;
uint64_t mode_ready_us = 0, last_sent_us = 0;

bool set_mode(int mode) {
  if (mode != MODE_FAST && mode != MODE_UI) return false;
  if (mode == refresh_mode) return true;
  uint64_t now = hal_time_us();
  if (sock < 0 || now < mode_ready_us) return false;
  ClientMsg m = {}; m.type = MSG_SET_MODE; m.mode = mode;
  if (send(sock, &m, sizeof m, MSG_DONTWAIT | MSG_NOSIGNAL) != sizeof m) return false;
  refresh_mode = mode;
  // qtfb sleeps 1 s on THIS connection. Keep input/rendering alive and send one latest frame afterwards.
  mode_ready_us = now + 1100000;
  pending = {0, 0, panel.w, panel.h}; // repaint unchanged RGB too, to reveal colours after FAST
  return true;
}

uint64_t update_interval() {
  int hz = refresh_mode == MODE_FAST ? ZP_DISPLAY_RMPP_FAST_HZ : ZP_DISPLAY_RMPP_COLOR_HZ;
  if (hz < 1) hz = 1; if (hz > 125) hz = 125;
  return 1000000u / hz;
}

int connect_qtfb(int key) {
  int s = socket(AF_UNIX, SOCK_SEQPACKET | SOCK_CLOEXEC, 0);
  sockaddr_un a = {};
  a.sun_family = AF_UNIX;
  strcpy(a.sun_path, "/tmp/qtfb.sock");
  if (s < 0 || connect(s, (sockaddr*)&a, sizeof a) != 0) { if (s >= 0) close(s); return -1; }
  ClientMsg m = {}; m.type = MSG_INIT; m.init.key = key; m.init.fmt = FMT_RMPP_RGB888;
  ServerMsg r = {};
  if (send(s, &m, sizeof m, 0) != sizeof m || recv(s, &r, sizeof r, 0) != sizeof r || r.type != MSG_INIT) { close(s); return -1; }
  if (!shm) {
    char name[24]; snprintf(name, sizeof name, "/qtfb_%d", r.init.shm_key);
    int fd = shm_open(name, O_RDWR, 0);
    void* p = fd >= 0 ? mmap(nullptr, r.init.shm_size, PROT_READ | PROT_WRITE, MAP_SHARED, fd, 0) : MAP_FAILED;
    if (fd >= 0) close(fd);
    if (p == MAP_FAILED || r.init.shm_size < (size_t)panel.w * panel.h * 3) {
      if (p != MAP_FAILED) munmap(p, r.init.shm_size);
      close(s); return -1;
    }
    shm = (uint8_t*)p; shm_size = r.init.shm_size;
  }
  return s;
}

void rm_poll(HalInput* in) {
  ServerMsg m = {};
  for (;;) {
    ssize_t n = recv(sock, &m, sizeof m, MSG_DONTWAIT);
    if (n < 0 && errno == EINTR) continue;
    if (n < 0 && (errno == EAGAIN || errno == EWOULDBLOCK)) break;
    if (n != sizeof m || m.type == MSG_TERMINATE) { rin::quit_flag = 1; break; }
    if (m.type == MSG_INPUT && rin::touch_event(m.input.type, m.input.id, m.input.x, m.input.y)) {
      // Deliver each touch transition to the UI; draining a quick press+release would swallow the tap.
      break;
    }
  }
  rin::poll_input(in);
}

void wake_lock(bool on) {  // autosleep would suspend the SoC (and the digitizer) under a running app
  if (FILE* f = fopen(on ? "/sys/power/wake_lock" : "/sys/power/wake_unlock", "w")) { fputs("zinc", f); fclose(f); }
}

int rm_init(const HalConfig* cfg) {
  const char* k = getenv("QTFB_KEY");
  if (!k || cfg->width != 1620 || cfg->height != 2160) {
    fprintf(stderr, "display-rmpp: %s; running headless\n", k ? "profile must be 1620x2160" : "QTFB_KEY unset (launch from AppLoad, see docs/targets/remarkable-paper-pro.md)");
    return 0;
  }
  if (!eink::init(panel, cfg->width, cfg->height)) return 0;
  free(panel.out); panel.out = nullptr;  // the device sends original RGB; only the emulator quantizes
  sock = connect_qtfb(atoi(k));
  if (sock < 0) { fprintf(stderr, "display-rmpp: cannot attach to qtfb (is AppLoad running?)\n"); return 0; }
  signal(SIGPIPE, SIG_IGN);
  const char* mode = getenv("ZINC_RMPP_REFRESH_MODE");
  if (!mode) mode = ZP_DISPLAY_RMPP_REFRESH_MODE;
  if (strcmp(mode, "fast") && strcmp(mode, "ui")) {
    fprintf(stderr, "display-rmpp: invalid refresh mode '%s', using ui\n", mode); mode = "ui";
  }
  if (!set_mode(!strcmp(mode, "fast") ? MODE_FAST : MODE_UI)) { close(sock); sock = -1; return 0; }
  fprintf(stderr, "display-rmpp: %s, partial updates capped at %llu Hz\n", mode,
          (unsigned long long)(1000000 / update_interval()));
  rin::start(cfg->width, cfg->height);
  wake_lock(true);
  return 1;
}

void rm_present(const HalFrame* f) {
  // Diff the rendered RGB frame directly: no monochrome conversion or delayed colour upgrade.
  eink::Rect r = {0, 0, 0, 0};
  if (f->y1 > f->y0 && f->x1 > f->x0) {
    // scratch persists between frames, so the runtime can leave undamaged pixels untouched.
    auto render = f->render_damage ? f->render_damage : f->render;
    render(panel.scratch + (size_t)f->y0 * panel.w, f->y0, f->y1);
    r = eink::changed(panel, f->y0, f->y1);
  }
  if (panel.first) { r = {0, 0, panel.w, panel.h}; panel.first = false; }
  for (int32_t y = r.y0; y < r.y1; y++) {
    const uint32_t* s = panel.cur + (size_t)y * panel.w;
    uint8_t* d = shm + ((size_t)y * panel.w + r.x0) * 3;
    for (int32_t x = r.x0; x < r.x1; x++, d += 3) { d[0] = (uint8_t)(s[x] >> 16); d[1] = (uint8_t)(s[x] >> 8); d[2] = (uint8_t)s[x]; }
  }
  eink::unite(pending, r);
  uint64_t now = hal_time_us();
  if (eink::empty(pending) || now < mode_ready_us || (last_sent_us && now - last_sent_us < update_interval())) {
    if (eink::empty(r)) rin::wait_input(8, sock);
    return;
  }
  ClientMsg m = {}; m.type = MSG_UPDATE;
  m.update.type = UPDATE_PARTIAL; m.update.x = pending.x0; m.update.y = pending.y0;
  m.update.w = pending.x1 - pending.x0; m.update.h = pending.y1 - pending.y0;
  ssize_t sent = send(sock, &m, sizeof m, MSG_DONTWAIT | MSG_NOSIGNAL);
  if (sent == sizeof m) { pending = {}; last_sent_us = now; }
  else if (errno != EAGAIN && errno != EWOULDBLOCK && errno != EINTR) rin::quit_flag = 1;
  // Unsent frames share one dirty region; the newest pixels survive socket backpressure.
}

void rm_shutdown() {
  rin::quit_flag = 1;
  ClientMsg m = {}; m.type = MSG_TERMINATE;
  send(sock, &m, sizeof m, MSG_DONTWAIT);
  close(sock); sock = -1;
  if (shm) { munmap(shm, shm_size); shm = nullptr; }
  free(panel.cur); free(panel.scratch); free(panel.out); panel = {};
  wake_lock(false);
}

HalDisplay rmpp = {rm_init, rm_present, rm_poll, rm_shutdown, 0, 0};
int reg = (hal_display = &rmpp, 0);
}  // namespace

// Notes' native bridge; mode changes are a user action, not driven by pen-up/pen-down.
extern "C" bool zinc_rmpp_set_fast(bool fast) { return set_mode(fast ? MODE_FAST : MODE_UI); }
extern "C" int zinc_rmpp_refresh_mode() { return refresh_mode; }
extern "C" bool zinc_rmpp_refresh_busy() { return hal_time_us() < mode_ready_us; }
#endif
