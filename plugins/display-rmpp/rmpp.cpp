// display-rmpp on the reMarkable tablets: the backend selector of docs/reports/remarkable-bridge-design.md §7.
//   L1 the ink layer inside xochitl (lane.h): qtfb in UI mode, plus, while the Marker is down, the stroke's rectangles repainted in
//      xochitl's Pen mode by zinc-canvas (its painted item; preferred, and the one that works on OS 3.27) or the zinc-ink lane (vendor swaps).
//   L2 the ink session (native.h): the app owns the vendor engine inside a lease (xochitl stopped); "ink": "session" only.
//   L0 AppLoad's qtfb: a shared-memory RGB888 framebuffer that xochitl composites, update/refresh-mode messages on
//      /tmp/qtfb.sock (protocol: asivery/rm-appload src/qtfb/common.h). Always there; QTFB_KEY comes from AppLoad.
// The manifest's "ink" option chooses: "qtfb" L0; "native" L1, else L0; "session" L1, else L2 (inside the lease), else L0.
// A downgrade is one way (L1 -> L0 on any lane error) and says so once. The model and its vendor rows are in models.h.
// The reMarkable 2 has no lane and no session: its row selects timower's rm2fb (rm2fb.h), whose DU waveform draws the ink.
// Touch comes from qtfb (evdev under L2 and on the rM2); evdev supplies Marker pressure, tilt and the eraser end.
// Mode changes are explicit (drawing FAST / colour preview UI), never automatic per stroke.
// Only changed RGB pixels are submitted; xochitl owns the physical refresh policy.
#include <algorithm>
#include "eink.h"
#include "input.h"
#include "models.h"
#include "lane.h"
#include "native.h"
#include "rm2fb.h"
#include <errno.h>
#include <sys/mman.h>
#include <sys/socket.h>
#include <sys/un.h>

#ifndef ZP_DISPLAY_RMPP_REFRESH_MODE
#define ZP_DISPLAY_RMPP_REFRESH_MODE "ui"
#endif
#ifndef ZP_DISPLAY_RMPP_INK
#define ZP_DISPLAY_RMPP_INK "qtfb"
#endif
#ifndef ZP_DISPLAY_RMPP_FAST_HZ
#define ZP_DISPLAY_RMPP_FAST_HZ 60
#endif
#ifndef ZP_DISPLAY_RMPP_COLOR_HZ
#define ZP_DISPLAY_RMPP_COLOR_HZ 8
#endif

namespace {
enum : uint8_t { MSG_INIT = 0, MSG_UPDATE = 1, MSG_TERMINATE = 3, MSG_INPUT = 4, MSG_SET_MODE = 5, MSG_FULL_REFRESH = 6, MSG_STATE_CHANGED = 7, MSG_STATE_INIT = 8,
                   MSG_WINDOW_STATE = 9, MSG_SET_WIDGET = 10 };   // 9, 10: AppLoad with integrations/remarkable-engine/appload
enum : int { REASON_VISIBILITY = 1, REASON_CAPABILITIES = 2, CAN_WINDOW = 1, CAN_WIDGET = 2 };
enum : int { WINDOW_MINIMIZE = 0, WINDOW_RESTORE = 1, WINDOW_WIDGET = 2 };   // also the visibility values: 0 minimized, 1 shown, 2 as its widget
enum : int { UPDATE_PARTIAL = 1, MODE_FAST = 0, MODE_UI = 4 };   // qtfb REFRESH_MODE_UFAST (0) for the pen, not FAST (1): the fastest waveform
// wire structs, same layout as qtfb::ClientMessage / ServerMessage (LP64: 24 and 32 bytes)
struct ClientMsg { uint8_t type; union { struct { int key; uint8_t fmt; } init; struct { int type, x, y, w, h; } update; int mode; int window; }; };
struct ServerMsg { uint8_t type; union { struct { int shm_key; size_t shm_size; } init; struct { int type, id, x, y, pressure; } input;
                                   struct { int reason, value; } state; }; };
static_assert(sizeof(ClientMsg) == 24 && sizeof(ServerMsg) == 32, "qtfb wire layout");

eink::Panel panel;
enum Layer { L0, L1, L2, RM2 } layer = L0;
const rmm::Model* row = nullptr;
int wanted_mode = MODE_UI;  // the qtfb mode the app asked for; L1 keeps UI while the lane runs
int sock = -1;
uint8_t* shm = nullptr;
size_t shm_size = 0;
int shm_key = 0;          // AppLoad's name for the buffer (/qtfb_<shm_key>): QTFB_KEY on 0.5, random since 0.6.0
eink::Rect pending = {};
int refresh_mode = -1;
uint64_t mode_ready_us = 0, last_sent_us = 0;
eink::Ghost ghost;          // partial area since the last full refresh
bool full_refresh_ok = false;  // AppLoad 0.6.0+ (it sends its device state after init); 0.5 drops a client that asks for a full refresh
bool full_asked = false;   // refreshDisplay() of zinc:gfx: a full refresh at the next idle frame
bool ghost_skip = true;     // the first page lands on a white panel: no ghost to count
bool window_ok = false;     // AppLoad reports the window's visibility (reason 1), so it takes MSG_WINDOW_STATE; others drop the client
bool hidden = false;        // the window is minimized: frames stay in the buffer, nothing is sent until it shows again
bool widget_ok = false;     // AppLoad shows a rectangle of the buffer as the app's widget (capability bit 1, 0002 of the patch)
bool as_widget = false;     // shown as the widget: only what changes inside the rectangle is sent
eink::Rect widget = {};     // the rectangle, framebuffer pixels

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
  // ZINC_RMPP_FAST_HZ / ZINC_RMPP_COLOR_HZ: the project's values when the engine on the tablet runs the prebuilt driver (ZN-841)
  static const int fast_hz = getenv("ZINC_RMPP_FAST_HZ") ? atoi(getenv("ZINC_RMPP_FAST_HZ")) : ZP_DISPLAY_RMPP_FAST_HZ;
  static const int color_hz = getenv("ZINC_RMPP_COLOR_HZ") ? atoi(getenv("ZINC_RMPP_COLOR_HZ")) : ZP_DISPLAY_RMPP_COLOR_HZ;
  int hz = refresh_mode == MODE_FAST ? fast_hz : color_hz;
  if (hz < 1) hz = 1; if (hz > 125) hz = 125;
  return 1000000u / hz;
}

int connect_qtfb(int key, int fmt) {
  int s = socket(AF_UNIX, SOCK_SEQPACKET | SOCK_CLOEXEC, 0);
  sockaddr_un a = {};
  a.sun_family = AF_UNIX;
  strcpy(a.sun_path, "/tmp/qtfb.sock");
  if (s < 0 || connect(s, (sockaddr*)&a, sizeof a) != 0) { if (s >= 0) close(s); return -1; }
  ClientMsg m = {}; m.type = MSG_INIT; m.init.key = key; m.init.fmt = (uint8_t)fmt;
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
    shm = (uint8_t*)p; shm_size = r.init.shm_size; shm_key = r.init.shm_key;
  }
  return s;
}

void rm_poll(HalInput* in) {
  if (layer == L2 || layer == RM2) { rin::poll_touch(); rin::poll_input(in); return; }
  ServerMsg m = {};
  for (;;) {
    ssize_t n = recv(sock, &m, sizeof m, MSG_DONTWAIT);
    if (n < 0 && errno == EINTR) continue;
    if (n < 0 && (errno == EAGAIN || errno == EWOULDBLOCK)) break;
    if (n != sizeof m || m.type == MSG_TERMINATE) { rin::quit_flag = 1; break; }
    if (m.type == MSG_STATE_INIT || m.type == MSG_STATE_CHANGED) {
      full_refresh_ok = true;
      if (m.state.reason == REASON_CAPABILITIES) { window_ok = (m.state.value & CAN_WINDOW) != 0; widget_ok = (m.state.value & CAN_WIDGET) != 0; }
      if (m.state.reason == REASON_VISIBILITY) {
        window_ok = true;
        // back to the full window: the whole page, then a full refresh
        if ((hidden || as_widget) && m.state.value == WINDOW_RESTORE) { pending = {0, 0, panel.w, panel.h}; full_asked = true; }
        hidden = m.state.value == WINDOW_MINIMIZE;
        as_widget = m.state.value == WINDOW_WIDGET;
      }
    }
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
  const char* codename = rmm::machine();
  row = rmm::model(codename);
  const bool known = row != nullptr;
  if (!row) row = rmm::model_by_size(cfg->width, cfg->height);
  if (!known) fprintf(stderr, "display-rmpp: unknown model '%s'; fast ink off, qtfb only\n", codename);
  if (!row || cfg->width != row->w || cfg->height != row->h) {
    fprintf(stderr, "display-rmpp: profile must be %dx%d on the %s; running headless\n", row ? row->w : rmm::models[0].w,
            row ? row->h : rmm::models[0].h, row ? row->name : rmm::models[0].name);
    return 0;
  }
  const char* ink = getenv("ZINC_RMPP_INK");
  if (!ink) ink = ZP_DISPLAY_RMPP_INK;
  if (strcmp(ink, "qtfb") && strcmp(ink, "native") && strcmp(ink, "session")) {
    fprintf(stderr, "display-rmpp: invalid ink '%s' (qtfb, native or session), using qtfb\n", ink); ink = "qtfb";
  }
  const bool fast_ink = known && strcmp(ink, "qtfb") != 0, session = !strcmp(ink, "session");
  const char* mode = getenv("ZINC_RMPP_REFRESH_MODE");
  if (!mode) mode = ZP_DISPLAY_RMPP_REFRESH_MODE;
  if (strcmp(mode, "fast") && strcmp(mode, "ui")) {
    fprintf(stderr, "display-rmpp: invalid refresh mode '%s', using ui\n", mode); mode = "ui";
  }
  wanted_mode = strcmp(ink, "qtfb") || !strcmp(mode, "fast") ? MODE_FAST : MODE_UI;
  if (!eink::init(panel, cfg->width, cfg->height)) return 0;
  free(panel.out); panel.out = nullptr;  // the device sends original RGB; only the emulator quantizes
  signal(SIGPIPE, SIG_IGN);
  if (ZP_DISPLAY_RMPP_PEN_ROTATE == 0) rin::pen_rot = row->pen_rotate;  // ZINC_RMPP_PEN_ROTATE still wins (rin::start)
  if (row->backend == rmm::RM2FB) {
    if (strcmp(ink, "qtfb")) fprintf(stderr, "display-rmpp: no ink lane or session on the %s; rm2fb's DU waveform draws the ink\n", row->name);
    if (!rm2fb::open(cfg->width, cfg->height)) return 0;
    rm2fb::fast = wanted_mode == MODE_FAST;
    layer = RM2; refresh_mode = wanted_mode;
    rin::start(cfg->width, cfg->height);
    if (!rin::open_touch()) fprintf(stderr, "display-rmpp: no evdev touch found\n");
    wake_lock(true);
    return 1;
  }
  if (fast_ink && session && getenv("ZINC_LEASE")) {
    // Inside the lease xochitl is stopped: no lane, no qtfb. Without the engine the app exits and the lease restores xochitl.
    if (!native::open(*row)) exit(3);
    native::fast = wanted_mode == MODE_FAST;
    layer = L2; refresh_mode = wanted_mode;
    rin::start(cfg->width, cfg->height);
    if (!rin::open_touch()) fprintf(stderr, "display-rmpp: no evdev touch found\n");
    return 1;
  }
  const char* k = getenv("QTFB_KEY");
  if (!k) {
    fprintf(stderr, "display-rmpp: QTFB_KEY unset (launch from AppLoad, see docs/targets/remarkable-paper-pro.md); running headless\n");
    return 0;
  }
  sock = connect_qtfb(atoi(k), row->qtfb_fmt);
  if (sock < 0) { fprintf(stderr, "display-rmpp: cannot attach to qtfb (is AppLoad running?)\n"); return 0; }
  if (fast_ink && lane::open(*row, shm_key)) layer = L1;
  else if (fast_ink && session) fprintf(stderr, "display-rmpp: an ink session starts from its AppLoad tile, through the lease; qtfb\n");
  if (!set_mode(layer == L1 ? MODE_UI : wanted_mode)) { close(sock); sock = -1; lane::close_lane(); return 0; }
  fprintf(stderr, "display-rmpp: %s on qtfb%s, partial updates capped at %llu Hz\n", refresh_mode == MODE_FAST ? "fast" : "ui",
          layer == L1 ? " with the ink lane" : "", (unsigned long long)(1000000 / update_interval()));
  rin::start(cfg->width, cfg->height);
  wake_lock(true);
  return 1;
}

/** L1 -> L0, once: the lane is gone. The stroke's box goes through qtfb, in the mode the app asked for. */
void downgrade() {
  fprintf(stderr, "display-rmpp: ink lane closed; qtfb from now on\n");
  eink::unite(pending, lane::box);
  lane::close_lane();
  layer = L0;
  set_mode(wanted_mode);
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
  const bool first = panel.first;
  if (panel.first) { r = {0, 0, panel.w, panel.h}; panel.first = false; }
  if (layer == RM2) {
    const bool fast = rm2fb::fast;
    if (first) rm2fb::fast = false;  // the first page in grey levels, then the mode the app asked for
    if (!eink::empty(r) && !rm2fb::update(panel, r)) rin::quit_flag = 1;
    rm2fb::fast = fast;
    if (eink::empty(r)) rin::wait_input(8, -1);
    return;
  }
  if (layer == L2) {
    native::present(panel, r, rin::pen_down, first);
    if (eink::empty(r)) rin::wait_input(8, -1);
    return;
  }
  for (int32_t y = r.y0; y < r.y1; y++) {
    const uint32_t* s = panel.cur + (size_t)y * panel.w;
    uint8_t* d = shm + ((size_t)y * panel.w + r.x0) * 3;
    for (int32_t x = r.x0; x < r.x1; x++, d += 3) { d[0] = (uint8_t)(s[x] >> 16); d[1] = (uint8_t)(s[x] >> 8); d[2] = (uint8_t)s[x]; }
  }
  if (layer == L1 && !first) {
    bool was = lane::stroke;
    if (!lane::frame(r, rin::pen_down)) downgrade();
    else if (lane::stroke) { if (eink::empty(r)) rin::wait_input(8, sock); return; }  // xochitl's rendering is blocked
    else if (was) r = {};  // pen-up: the lane repaints the stroke's box through AppLoad's item
  }
  eink::unite(pending, r);
  if (hidden) { if (eink::empty(r)) rin::wait_input(8, sock); return; }
  if (as_widget) {   // the rest of the page is not on the screen: what lies outside the widget waits for the full window
    eink::Rect in = {std::max(pending.x0, widget.x0), std::max(pending.y0, widget.y0), std::min(pending.x1, widget.x1), std::min(pending.y1, widget.y1)};
    if (eink::empty(in)) { if (eink::empty(r)) rin::wait_input(8, sock); return; }
    pending = in;
  }
  uint64_t now = hal_time_us();
  if (eink::empty(pending) && full_refresh_ok && !as_widget && now >= mode_ready_us && (full_asked || eink::ghost_due(ghost, eink::area({0, 0, panel.w, panel.h}), now, rin::pen_down))) {
    ClientMsg m = {}; m.type = MSG_FULL_REFRESH;
    if (send(sock, &m, sizeof m, MSG_DONTWAIT | MSG_NOSIGNAL) == sizeof m) { ghost = {}; full_asked = false; mode_ready_us = now + 1100000; }  // qtfb sleeps 1 s on this connection
  }
  if (eink::empty(pending) || now < mode_ready_us || (last_sent_us && now - last_sent_us < update_interval())) {
    if (eink::empty(r)) rin::wait_input(8, sock);
    return;
  }
  ClientMsg m = {}; m.type = MSG_UPDATE;
  m.update.type = UPDATE_PARTIAL; m.update.x = pending.x0; m.update.y = pending.y0;
  m.update.w = pending.x1 - pending.x0; m.update.h = pending.y1 - pending.y0;
  ssize_t sent = send(sock, &m, sizeof m, MSG_DONTWAIT | MSG_NOSIGNAL);
  if (sent == sizeof m) {
    if (ghost_skip) ghost_skip = false; else eink::ghost_add(ghost, eink::area(pending), now);
    pending = {}; last_sent_us = now;
  }
  else if (errno != EAGAIN && errno != EWOULDBLOCK && errno != EINTR) rin::quit_flag = 1;
  // Unsent frames share one dirty region; the newest pixels survive socket backpressure.
}

void rm_shutdown() {
  rin::quit_flag = 1;
  lane::bye();
  if (layer == L2 || layer == RM2) {
    if (rin::touch_fd >= 0) close(rin::touch_fd);
    if (layer == RM2) { rm2fb::close_fb(); wake_lock(false); }
  } else {
    ClientMsg m = {}; m.type = MSG_TERMINATE;
    send(sock, &m, sizeof m, MSG_DONTWAIT);
    close(sock); sock = -1;
    if (shm) { munmap(shm, shm_size); shm = nullptr; }
    wake_lock(false);
  }
  free(panel.cur); free(panel.scratch); free(panel.out); panel = {};
}

// zinc:gfx refreshDisplay() asks for "display.refresh": "1" when this layer can do a full refresh (qtfb of AppLoad 0.6.0+, the ink session)
bool send_msg(const ClientMsg& m) { return send(sock, &m, sizeof m, MSG_DONTWAIT | MSG_NOSIGNAL) == sizeof m; }

// zinc:gfx's window calls: "window.minimize" (minimizeWindow), "window.widget" with "x,y,w,h" (setWidget), "window.show-widget"
// (showWidget): "1" when AppLoad did it, the app keeps running; "window.state": "full", "widget" or "hidden"
const char* rm_device(const char* query, const char* arg) {
  const bool qtfb = window_ok && sock >= 0 && (layer == L0 || layer == L1);
  if (strcmp(query, "window.state") == 0) return hidden ? "hidden" : as_widget ? "widget" : "full";
  if (strcmp(query, "window.minimize") == 0) {
    ClientMsg m = {}; m.type = MSG_WINDOW_STATE; m.window = WINDOW_MINIMIZE;
    if (!qtfb || !send_msg(m)) return "0";
    hidden = true;   // at once: AppLoad's answer comes at the next poll, and a frame sent before it would land in a hidden window
    return "1";
  }
  if (strcmp(query, "window.widget") == 0) {
    int x = 0, y = 0, w = 0, h = 0;
    if (!qtfb || !widget_ok || !arg || sscanf(arg, "%d,%d,%d,%d", &x, &y, &w, &h) != 4) return "0";
    if (w > 0 && h > 0 && (x < 0 || y < 0 || x + w > panel.w || y + h > panel.h)) return "0";   // AppLoad drops a client for this
    ClientMsg m = {}; m.type = MSG_SET_WIDGET; m.update.x = x; m.update.y = y; m.update.w = w; m.update.h = h;
    if (!send_msg(m)) return "0";
    widget = w > 0 && h > 0 ? eink::Rect{x, y, x + w, y + h} : eink::Rect{};
    return "1";
  }
  if (strcmp(query, "window.show-widget") == 0) {
    ClientMsg m = {}; m.type = MSG_WINDOW_STATE; m.window = WINDOW_WIDGET;
    if (!qtfb || !widget_ok || eink::empty(widget) || !send_msg(m)) return "0";
    as_widget = true;   // as for minimize: frames from now on are the widget's
    return "1";
  }
  if (strcmp(query, "display.refresh") != 0) return nullptr;
  if (layer == L2) { native::full_now = true; return "1"; }
  if ((layer == L0 || layer == L1) && full_refresh_ok) { full_asked = true; return "1"; }
  return "0";
}

HalDisplay rmpp = {rm_init, rm_present, rm_poll, rm_shutdown, 0, 0, nullptr, nullptr, nullptr, rm_device};
int reg = (hal_display = &rmpp, 0);
}  // namespace

// Notes' native bridge; mode changes are a user action, not driven by pen-up/pen-down.
extern "C" bool zinc_rmpp_set_fast(bool fast) {
  wanted_mode = fast ? MODE_FAST : MODE_UI;
  if (layer == L2) { native::fast = fast; refresh_mode = wanted_mode; return true; }
  if (layer == RM2) { rm2fb::fast = fast; refresh_mode = wanted_mode; return true; }
  if (layer == L1) return true;  // the lane draws ink in Pen mode; qtfb stays in UI for the settle
  return set_mode(wanted_mode);
}
extern "C" int zinc_rmpp_refresh_mode() { return refresh_mode; }
extern "C" bool zinc_rmpp_refresh_busy() { return hal_time_us() < mode_ready_us; }
