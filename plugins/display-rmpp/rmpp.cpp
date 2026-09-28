// display-rmpp on the reMarkable Paper Pro. The panel is driven by a software TCON inside xochitl (libqsgepaper), with
// no usable fbdev and no public waveform ioctl, so we draw through AppLoad's qtfb: a shared-memory RGB888 1620x2160
// framebuffer that xochitl composites, plus update/refresh-mode messages on /tmp/qtfb.sock (protocol:
// asivery/rm-appload src/qtfb/common.h). Launch the app from AppLoad (external.manifest.json, "qtfb": true), which sets
// QTFB_KEY. Pen and touch are read from evdev directly (qtfb forwards neither tilt nor the eraser end).
// Refresh policy: eink.h. FAST -> REFRESH_MODE_FAST (monochrome), QUALITY -> REFRESH_MODE_UI (colour),
// FULL -> REQUEST_FULL_REFRESH. The qtfb server sleeps 1 s after a mode change on the sending connection, so mode
// changes and full refreshes go through a second "control" connection on its own thread; updates never wait.
#include "eink.h"
#include "input.h"
#include <sys/mman.h>
#include <sys/socket.h>
#include <sys/un.h>

#ifndef ZP_DISPLAY_RMPP_DITHER
#define ZP_DISPLAY_RMPP_DITHER 0
#endif

namespace {
enum : uint8_t { MSG_INIT = 0, MSG_UPDATE = 1, MSG_TERMINATE = 3, MSG_SET_MODE = 5, MSG_FULL = 6 };
enum : int { FMT_RMPP_RGB888 = 1, UPDATE_PARTIAL = 1, MODE_FAST = 1, MODE_CONTENT = 3, MODE_UI = 4 };
// wire structs, same layout as qtfb::ClientMessage / ServerMessage (LP64: 24 and 32 bytes)
struct ClientMsg { uint8_t type; union { struct { int key; uint8_t fmt; } init; struct { int type, x, y, w, h; } update; int mode; }; };
struct ServerMsg { uint8_t type; union { struct { int shm_key; size_t shm_size; } init; struct { int a, b, c, d, e; } input; }; };
static_assert(sizeof(ClientMsg) == 24 && sizeof(ServerMsg) == 32, "qtfb wire layout");

eink::Panel panel;
int sock = -1;
uint8_t* shm = nullptr;
// control connection: the wanted mode / full-refresh request, applied by a thread
pthread_mutex_t cmu = PTHREAD_MUTEX_INITIALIZER;
pthread_cond_t ccv = PTHREAD_COND_INITIALIZER;
int want_mode = MODE_UI, cur_mode = MODE_UI;
bool want_full = false;

int connect_qtfb(int key) {
  int s = socket(AF_UNIX, SOCK_SEQPACKET | SOCK_CLOEXEC, 0);
  sockaddr_un a = {};
  a.sun_family = AF_UNIX;
  strcpy(a.sun_path, "/tmp/qtfb.sock");
  if (s < 0 || connect(s, (sockaddr*)&a, sizeof a) != 0) { if (s >= 0) close(s); return -1; }
  ClientMsg m = {}; m.type = MSG_INIT; m.init.key = key; m.init.fmt = FMT_RMPP_RGB888;
  ServerMsg r = {};
  if (send(s, &m, sizeof m, 0) != sizeof m || recv(s, &r, sizeof r, 0) < 1 || r.type != MSG_INIT) { close(s); return -1; }
  if (!shm) {
    char name[24]; snprintf(name, sizeof name, "/qtfb_%d", r.init.shm_key);
    int fd = shm_open(name, O_RDWR, 0);
    void* p = fd >= 0 ? mmap(nullptr, r.init.shm_size, PROT_READ | PROT_WRITE, MAP_SHARED, fd, 0) : MAP_FAILED;
    if (fd >= 0) close(fd);
    if (p == MAP_FAILED || r.init.shm_size < (size_t)panel.w * panel.h * 3) { close(s); return -1; }
    shm = (uint8_t*)p;
  }
  return s;
}

void* control(void* arg) {
  int s = (int)(intptr_t)arg;
  for (;;) {
    pthread_mutex_lock(&cmu);
    while (want_mode == cur_mode && !want_full) pthread_cond_wait(&ccv, &cmu);
    bool full = want_full; int mode = want_mode;
    want_full = false; cur_mode = mode;
    pthread_mutex_unlock(&cmu);
    ClientMsg m = {};
    if (full) m.type = MSG_FULL; else { m.type = MSG_SET_MODE; m.mode = mode; }
    if (send(s, &m, sizeof m, 0) != sizeof m) return nullptr;  // server sleeps ~1 s here; updates are not blocked
  }
}
void request(int mode, bool full) {
  pthread_mutex_lock(&cmu);
  want_mode = mode; want_full = want_full || full;
  pthread_cond_signal(&ccv);
  pthread_mutex_unlock(&cmu);
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
  sock = connect_qtfb(atoi(k));
  int ctl = sock >= 0 ? connect_qtfb(atoi(k)) : -1;
  if (ctl < 0) { fprintf(stderr, "display-rmpp: cannot attach to qtfb (is AppLoad running?)\n"); return 0; }
  fcntl(sock, F_SETFL, O_NONBLOCK);  // input messages from the server are drained and ignored
  pthread_t t;
  pthread_create(&t, nullptr, control, (void*)(intptr_t)ctl);
  pthread_detach(t);
  rin::start(cfg->width, cfg->height);
  wake_lock(true);
  return 1;
}

void rm_present(const HalFrame* f) {
  ServerMsg junk;
  while (recv(sock, &junk, sizeof junk, MSG_DONTWAIT) > 0) {}
  eink::Update u = eink::present(panel, f, hal_time_us(), ZP_DISPLAY_RMPP_DITHER);
  if (u.mode == eink::NONE) { rin::wait_input(33); return; }  // idle: sleep until input (or a timer's next frame)
  for (int32_t y = u.r.y0; y < u.r.y1; y++) {
    const uint32_t* s = panel.out + (size_t)y * panel.w;
    uint8_t* d = shm + ((size_t)y * panel.w + u.r.x0) * 3;
    for (int32_t x = u.r.x0; x < u.r.x1; x++, d += 3) { d[0] = (uint8_t)(s[x] >> 16); d[1] = (uint8_t)(s[x] >> 8); d[2] = (uint8_t)s[x]; }
  }
  request(u.mode == eink::FAST ? MODE_FAST : u.mode == eink::FULL ? MODE_CONTENT : MODE_UI, u.mode == eink::FULL);
  ClientMsg m = {}; m.type = MSG_UPDATE;
  m.update.type = UPDATE_PARTIAL; m.update.x = u.r.x0; m.update.y = u.r.y0; m.update.w = u.r.x1 - u.r.x0; m.update.h = u.r.y1 - u.r.y0;
  send(sock, &m, sizeof m, 0);
}

void rm_shutdown() {
  ClientMsg m = {}; m.type = MSG_TERMINATE;
  send(sock, &m, sizeof m, 0);
  wake_lock(false);
}

HalDisplay rmpp = {rm_init, rm_present, rin::poll_input, rm_shutdown, 0, 0};
int reg = (hal_display = &rmpp, 0);
}  // namespace
