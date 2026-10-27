// display-rmpp on the reMarkable tablets: the backend selector of docs/reports/remarkable-bridge-design.md §7.
//   L1 the ink layer inside xochitl (lane.h): qtfb in UI mode, plus, while the Marker is down, the stroke's rectangles repainted in
//      xochitl's Pen mode by zinc-canvas (its painted item; preferred, and the one that works on OS 3.27) or the zinc-ink lane (vendor swaps).
//   L2 the ink session (native.h): the app owns the vendor engine inside a lease (xochitl stopped); "ink": "session" only.
//   L0 AppLoad's qtfb: a shared-memory RGB888 framebuffer that xochitl composites, update/refresh-mode messages on
//      /tmp/qtfb.sock (protocol: asivery/rm-appload src/qtfb/common.h). Always there; QTFB_KEY comes from AppLoad.
// The manifest's "ink" option chooses: "qtfb" L0; "native" L1, else L0; "session" L1, else L2 (inside the lease), else L0.
// A downgrade is one way (L1 -> L0 on any lane error) and says so once. The model and its vendor rows are in models.h.
// The reMarkable 2 has no lane and no session: its row selects timower's rm2fb (rm2fb.h), whose DU waveform draws the ink.
// Touch and keys (the Type Folio, AppLoad's keyboard) come from qtfb (touch from evdev under L2 and on the rM2); evdev supplies Marker pressure, tilt and the eraser end.
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
#ifndef ZP_DISPLAY_RMPP_HEADER
#define ZP_DISPLAY_RMPP_HEADER "none"
#endif

namespace {
enum : uint8_t { MSG_INIT = 0, MSG_UPDATE = 1, MSG_TERMINATE = 3, MSG_INPUT = 4, MSG_SET_MODE = 5, MSG_FULL_REFRESH = 6, MSG_STATE_CHANGED = 7, MSG_STATE_INIT = 8,
                   MSG_WINDOW_STATE = 9, MSG_SET_WIDGET = 10, MSG_SET_TITLE = 11 };   // 9 to 11: AppLoad with integrations/remarkable-engine/appload
enum : int { REASON_VISIBILITY = 1, REASON_CAPABILITIES = 2, REASON_INSETS = 3, REASON_ACTION = 4, CAN_WINDOW = 1, CAN_WIDGET = 2, CAN_DOCK = 4,
             CAN_INSTANT_MODE = 8, CAN_HEADER_BAR = 16 };
// also the visibility values: 0 minimized, 1 shown, 2 as its widget, 3 docked under xochitl's header (0005)
enum : int { WINDOW_MINIMIZE = 0, WINDOW_RESTORE = 1, WINDOW_WIDGET = 2, WINDOW_DOCKED = 3 };
enum : int { UPDATE_PARTIAL = 1, MODE_FAST = 0, MODE_UI = 4 };   // qtfb REFRESH_MODE_UFAST (0) for the pen, not FAST (1): the fastest waveform
// wire structs, same layout as qtfb::ClientMessage / ServerMessage (LP64: 24 and 32 bytes)
struct ClientMsg { uint8_t type; union { struct { int key; uint8_t fmt; } init; struct { int type, x, y, w, h; } update; int mode; int window;
                                         struct { int offset; char text[16]; } title; }; };
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
bool dock_ok = false;       // AppLoad docks the window under xochitl's header (capability bit 2, 0005 of the patch)
bool docked = false;        // docked: only what changes below dock_top is sent, zinc:ui gets dock_top as its top safe area
int dock_top = 0;           // the header's height (STATE_CHANGED_REASON_INSETS), framebuffer pixels
bool instant_mode = false;  // AppLoad applies a mode or a full refresh without its 1 s pause (capability bit 3, 0006 of the patch)
bool header_bar = false;    // docked, AppLoad shows the app's title and Home / Quit in xochitl's header (capability bit 4, 0010 of the patch)
int header_actions = 0, header_action = 0;   // presses on those buttons so far, the last one (1 Home, 2 Quit): "window.action"
bool action_read = false;   // the app asked "window.action" (zinc:remarkable): else a press on Home or Quit quits it
char app_title[96] = "";   // HalConfig's title (zinc.json "name"): the header bar's title (MSG_SET_TITLE)
// how long this connection is busy after a mode switch or a full refresh: qtfb's second, or a few ms with 0006
uint64_t switch_pause() { return instant_mode ? 30000 : 1100000; }
eink::Rect dock_rect() { return {0, std::min(std::max(dock_top, 0), panel.h), panel.w, panel.h}; }

extern "C" void zn_hal_signal(const char* line);   // the host's system signals (src/host/hal_dispatch.cpp): zinc:ui's safe area
// After a change of the window's state: where the pen and the top-edge swipe come from, and the safe area zinc:ui pads by
void window_changed() {
  rin::pen_from_appload = hidden || as_widget || docked;   // docked too: evdev's Marker would also write on xochitl's header
  if (rin::pen_from_appload) rin::touch_event(0x11, rin::PEN_TOUCH_ID, 0, 0);   // no stale press across the change
  rin::edge_top = hidden || as_widget ? -1 : docked ? dock_top : 0;
  static int inset = 0;
  const int now = docked ? dock_top : 0;
  if (now == inset) return;
  inset = now;
  char b[48]; snprintf(b, sizeof b, "safearea %d 0 0 0", now);
  zn_hal_signal(b);
}

/** The window under xochitl's header (AppLoad 0005): true when AppLoad took the message. */
bool dock() {
  if (!window_ok || !dock_ok || sock < 0 || (layer != L0 && layer != L1)) return false;
  ClientMsg m = {}; m.type = MSG_WINDOW_STATE; m.window = WINDOW_DOCKED;
  if (send(sock, &m, sizeof m, MSG_DONTWAIT | MSG_NOSIGNAL) != sizeof m) return false;
  if (!docked || hidden || as_widget) pending = dock_rect();   // what AppLoad shows from now on, as it is now
  docked = true; hidden = false; as_widget = false;   // as for minimize: frames from now on are the docked window's
  window_changed();
  return true;
}
// zinc.json "display": {"header": "remarkable"} (ZINC_RMPP_HEADER on the tablet, which a launcher can also set per app): experimental, the app docks
// under xochitl's header as soon as AppLoad says it can (its capabilities come with the first device state); else it stays full screen.
// The Hub's Settings turn it on for every app at once: the file <zinc home>/rmpp-header (ZINC_HOME, else ~/.zinc).
bool header_wanted() {
  static const char* h = getenv("ZINC_RMPP_HEADER") ? getenv("ZINC_RMPP_HEADER") : ZP_DISPLAY_RMPP_HEADER;
  if (strcmp(h, "remarkable") == 0) return true;
  const char* zh = getenv("ZINC_HOME");
  char flag[512];
  if (zh) snprintf(flag, sizeof flag, "%s/rmpp-header", zh); else snprintf(flag, sizeof flag, "%s/.zinc/rmpp-header", getenv("HOME") ? getenv("HOME") : ".");
  return access(flag, F_OK) == 0;
}

bool set_mode(int mode) {
  if (mode != MODE_FAST && mode != MODE_UI) return false;
  if (mode == refresh_mode) return true;
  uint64_t now = hal_time_us();
  if (sock < 0 || now < mode_ready_us) return false;
  ClientMsg m = {}; m.type = MSG_SET_MODE; m.mode = mode;
  if (send(sock, &m, sizeof m, MSG_DONTWAIT | MSG_NOSIGNAL) != sizeof m) return false;
  refresh_mode = mode;
  // qtfb sleeps 1 s on THIS connection (a few ms with AppLoad 0006). Keep input/rendering alive and send one latest frame afterwards.
  mode_ready_us = now + switch_pause();
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

// The way out of an app that does not answer its buttons: three fingers held 2 s quit it (the frame loop still turns when the app's
// own code is stuck waiting). One journal line says why it quit.
// The frames' intent (zinc:gfx refreshIntent, "display.intent", set by zinc:ui around a pinch and a ZoomView): 'interactive' takes the
// Pen waveform while the picture follows the fingers, 'settle' the app's own mode again and one full refresh once that final frame is
// sent. qtfb pauses about a second on each switch of the connection's mode.
// Without intents (an app that reads raw touches), the guess of before: two fingers or more held 150 ms are a gesture, and the full
// refresh comes 1.5 s after the last finger lifts. An app that declared an intent once is never guessed for again.
// AppLoad patch 0004 (backlog/later.md): with its capability bit each MSG_UPDATE carries its own mode, no switch and no second of sleep;
// then `gesture` picks the update's mode in rm_present instead of set_mode.
bool gesture = false, intent_seen = false;
uint64_t full_due = 0;   // the clean pass after a guessed gesture, once the app had time to draw its sharp picture
// What went out in the fast waveform since the last clean pass: when the gesture settles it goes out again in the app's mode, a partial
// update without the flash of a full refresh (KOReader's way); the full refreshes are left to the ghost count (full_after_pct).
eink::Rect fast_area = {0, 0, 0, 0};
void gestures(const HalInput* in) {
  if (intent_seen) return;
  static uint64_t since = 0;
  if (in->ntouch >= 2) {
    uint64_t now = hal_time_us();
    if (!since) since = now;
    else if (!gesture && now - since >= 150000) gesture = true;
    return;
  }
  since = 0;
  if (in->ntouch == 0 && gesture) { gesture = false; full_due = hal_time_us() + 1500000; }
}

void escape(HalInput* in) {
  gestures(in);
  static uint64_t since = 0;
  if (in->ntouch < 3) { since = 0; return; }
  uint64_t now = hal_time_us();
  if (!since) { since = now; return; }
  if (now - since < 2000000 || rin::quit_flag) return;
  fprintf(stderr, "display-rmpp: three fingers held 2 s: quitting the app\n");
  rin::quit_flag = 1; in->quit = 1;
}

const char* rm_device(const char* query, const char* arg);
void rm_poll(HalInput* in) {
  if (layer == L2 || layer == RM2) { rin::poll_touch(); rin::poll_input(in); escape(in); return; }
  ServerMsg m = {};
  for (;;) {
    ssize_t n = recv(sock, &m, sizeof m, MSG_DONTWAIT);
    if (n < 0 && errno == EINTR) continue;
    if (n < 0 && (errno == EAGAIN || errno == EWOULDBLOCK)) break;
    if (n != sizeof m || m.type == MSG_TERMINATE) { rin::quit_flag = 1; break; }
    if (m.type == MSG_STATE_INIT || m.type == MSG_STATE_CHANGED) {
      full_refresh_ok = true;
      if (m.state.reason == REASON_CAPABILITIES) {
        window_ok = (m.state.value & CAN_WINDOW) != 0; widget_ok = (m.state.value & CAN_WIDGET) != 0; dock_ok = (m.state.value & CAN_DOCK) != 0; instant_mode = (m.state.value & CAN_INSTANT_MODE) != 0;
        header_bar = (m.state.value & CAN_HEADER_BAR) != 0;
        // the header bar shows the app's name, not the AppLoad entry's: an app the Hub opens runs in the Hub's window. 16 bytes a
        // message, a shorter part ends it (an empty one when the name fills its last part); only to an AppLoad that has the message
        const int len = (int) strlen(app_title);
        for (int off = 0; header_bar && off <= len; off += 16) {
          ClientMsg t = {}; t.type = MSG_SET_TITLE; t.title.offset = off;
          memcpy(t.title.text, app_title + off, len - off < 16 ? len - off : 16);
          send(sock, &t, sizeof t, MSG_DONTWAIT | MSG_NOSIGNAL);
          if (len - off < 16) break;
        }
      }
      if (m.state.reason == REASON_ACTION) {
        header_actions++; header_action = m.state.value;
        // an app without zinc:remarkable answers neither: Home floats it as AppLoad does any app (its widget if it set one, else the
        // minimized pill, still running), Quit ends it (in the Hub's window, back to the Hub)
        if (!action_read) {
          const bool away = header_action != 2 && (strcmp(rm_device("window.show-widget", nullptr), "1") == 0 || strcmp(rm_device("window.minimize", nullptr), "1") == 0);
          fprintf(stderr, "display-rmpp: %s in xochitl's header: %s\n", header_action == 2 ? "Quit" : "Home", away ? (as_widget ? "its widget" : "minimized") : "quitting the app");
          if (!away) rin::quit_flag = 1;
        }
      }
      if (m.state.reason == REASON_INSETS && m.state.value >= 0 && m.state.value < panel.h && m.state.value != dock_top) {
        dock_top = m.state.value;
        if (docked) { pending = dock_rect(); window_changed(); }   // the header moved: the app lays out again, its whole docked area goes out
      }
      if (m.state.reason == REASON_VISIBILITY) {
        window_ok = true;
        // back to the full window: the whole page, then a full refresh
        if ((hidden || as_widget || docked) && m.state.value == WINDOW_RESTORE) { pending = {0, 0, panel.w, panel.h}; full_asked = true; }
        // a collapsed widget (a tap on its header) is hidden and stays the widget: the app keeps its widget view, and the
        // rectangle is sent again when it opens
        if (hidden && as_widget && m.state.value == WINDOW_WIDGET) eink::unite(pending, widget);
        // docked again after a press on xochitl's header minimized it: the docked area, as it is now
        if ((hidden || !docked) && m.state.value == WINDOW_DOCKED) eink::unite(pending, dock_rect());
        hidden = m.state.value == WINDOW_MINIMIZE;
        as_widget = m.state.value == WINDOW_WIDGET || (as_widget && hidden);
        docked = m.state.value == WINDOW_DOCKED || (docked && hidden);
        window_changed();
      }
    }
    if (m.type == MSG_INPUT && rin::key_event(m.input.type, m.input.x)) continue;   // keys queue in order: no frame each
    if (m.type == MSG_INPUT && rin::touch_event(m.input.type, m.input.id, m.input.x, m.input.y)) {
      // Deliver each press and release to the UI (draining a quick press+release would swallow the tap); moves go on: the frame sees the
      // newest positions. One message a frame let two moving fingers (about 200 moves a second) fall seconds behind a pinch.
      if (m.input.type != 0x12 && m.input.type != 0x22) break;
    }
  }
  static bool dock_tried = false;
  if (!dock_tried && dock_ok && header_wanted()) { dock_tried = true; if (!hidden && !as_widget) dock(); }
  rin::poll_input(in);
  escape(in);
}

void wake_lock(bool on) {  // autosleep would suspend the SoC (and the digitizer) under a running app
  if (FILE* f = fopen(on ? "/sys/power/wake_lock" : "/sys/power/wake_unlock", "w")) { fputs("zinc", f); fclose(f); }
}

int rm_init(const HalConfig* cfg) {
  if (cfg->title) snprintf(app_title, sizeof app_title, "%s", cfg->title);
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

// The ghost, as xochitl zooms (display.ghost, from ZoomView of zinc:ui/kit): when a pinch starts the driver keeps the view's pixels as they
// are on the glass, and while the fingers move it draws that copy scaled and moved straight into AppLoad's buffer (nearest pixel, a few ms
// for the whole page) instead of the app drawing the page again each frame, which takes a quarter of a second on the tablet's CPU. The app
// draws its sharp picture once, when the fingers lift: "end" keeps the ghost on the glass until that frame comes, "cancel" (a pinch back to
// where it started) puts the app's frame back at once.
struct GhostView { bool on = false, dirty = false, restore = false, hold = false; eink::Rect view = {}; uint8_t* px = nullptr; float k = 1, ox = 0, oy = 0; } ghostv;
// The ghost goes out in black and white, ordered-dithered on the screen's own grid (KOReader does so before its A2/DU updates): the fast
// waveform draws two levels cleanly and quickly, greys and colours would smear, and a grid fixed to the screen does not shimmer as it moves.
static const uint8_t BAYER4[4][4] = {{8, 136, 40, 168}, {200, 72, 232, 104}, {56, 184, 24, 152}, {248, 120, 216, 88}};
void ghost_render() {
  const eink::Rect& v = ghostv.view;
  const int32_t w = v.x1 - v.x0, h = v.y1 - v.y0;
  static int32_t* xs = nullptr; static int32_t xn = 0;
  if (xn < w) { free(xs); xs = (int32_t*)malloc(sizeof(int32_t) * w); xn = w; }
  for (int32_t x = 0; x < w; x++) { const float u = (v.x0 + x - ghostv.ox) / ghostv.k; xs[x] = u >= 0 && u < w ? (int32_t)u : -1; }
  for (int32_t y = v.y0; y < v.y1; y++) {
    const float fv = (y - ghostv.oy) / ghostv.k;
    const int32_t sv = fv >= 0 && fv < h ? (int32_t)fv : -1;
    uint8_t* d = shm + ((size_t)y * panel.w + v.x0) * 3;
    if (sv < 0) { memset(d, 0xFF, (size_t)w * 3); continue; }
    const uint8_t* row = ghostv.px + (size_t)sv * w * 3;
    const uint8_t* bayer = BAYER4[y & 3];
    for (int32_t x = 0; x < w; x++, d += 3) {
      if (xs[x] < 0) { d[0] = d[1] = d[2] = 0xFF; continue; }
      const uint8_t* q = row + (size_t)xs[x] * 3;
      d[0] = d[1] = d[2] = (q[0] * 77 + q[1] * 150 + q[2] * 29) >> 8 > bayer[(v.x0 + x) & 3] ? 0xFF : 0x00;
    }
  }
}
// the app's last frame back under the view (the sharp picture may be the same pixels: a pinch that came back to 1)
void ghost_restore() {
  const eink::Rect& v = ghostv.view;
  for (int32_t y = v.y0; y < v.y1; y++) {
    const uint32_t* s = panel.cur + (size_t)y * panel.w;
    uint8_t* d = shm + ((size_t)y * panel.w + v.x0) * 3;
    for (int32_t x = v.x0; x < v.x1; x++, d += 3) { d[0] = (uint8_t)(s[x] >> 16); d[1] = (uint8_t)(s[x] >> 8); d[2] = (uint8_t)s[x]; }
  }
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
  if (ghostv.on) {   // the app's own frames do not reach the view while the ghost moves: it is drawn over them
    const eink::Rect& v = ghostv.view;
    const bool under = !eink::empty(r) && r.x0 < v.x1 && v.x0 < r.x1 && r.y0 < v.y1 && v.y0 < r.y1;
    if (ghostv.dirty || under) { ghost_render(); ghostv.dirty = false; eink::unite(r, v); }
  } else if (ghostv.restore || (ghostv.hold && !eink::empty(r) && r.x0 < ghostv.view.x1 && ghostv.view.x0 < r.x1 && r.y0 < ghostv.view.y1 && ghostv.view.y0 < r.y1)) {
    ghost_restore(); ghostv.restore = ghostv.hold = false; eink::unite(r, ghostv.view);   // the whole view from the app's frame: no ghost pixel left
  }
  if (layer == L1 && !first) {
    bool was = lane::stroke;
    if (!lane::frame(r, rin::pen_down)) downgrade();
    else if (lane::stroke) { if (eink::empty(r)) rin::wait_input(8, sock); return; }  // xochitl's rendering is blocked
    else if (was) r = {};  // pen-up: the lane repaints the stroke's box through AppLoad's item
  }
  eink::unite(pending, r);
  if (hidden) { if (eink::empty(r)) rin::wait_input(8, sock); return; }
  if (as_widget || docked) {   // the rest of the page is not on the screen: what lies outside the widget (above the dock) waits for the full window
    const eink::Rect c = as_widget ? widget : dock_rect();
    eink::Rect in = {std::max(pending.x0, c.x0), std::max(pending.y0, c.y0), std::min(pending.x1, c.x1), std::min(pending.y1, c.y1)};
    if (eink::empty(in)) { if (eink::empty(r)) rin::wait_input(8, sock); return; }
    pending = in;
  }
  uint64_t now = hal_time_us();
  if (full_due && now >= full_due) { full_due = 0; eink::unite(pending, fast_area); fast_area = {}; }
  const int want = gesture ? MODE_FAST : wanted_mode;
  if (layer == L0 && refresh_mode != want && now >= mode_ready_us) set_mode(want);   // a gesture, or a switch asked during qtfb's second
  if (eink::empty(pending) && full_refresh_ok && !as_widget && now >= mode_ready_us && (full_asked || eink::ghost_due(ghost, eink::area({0, 0, panel.w, panel.h}), now, rin::pen_down))) {
    ClientMsg m = {}; m.type = MSG_FULL_REFRESH;
    if (send(sock, &m, sizeof m, MSG_DONTWAIT | MSG_NOSIGNAL) == sizeof m) { ghost = {}; full_asked = false; mode_ready_us = now + switch_pause(); }  // qtfb sleeps 1 s on this connection (without 0006)
  }
  // during a gesture the panel takes about 120 ms per fast update: one at a time, the newest picture, so they never queue up and lag
  // behind the fingers (ZINC_RMPP_GESTURE_MS)
  static const uint64_t gesture_us = (uint64_t)(getenv("ZINC_RMPP_GESTURE_MS") ? atoi(getenv("ZINC_RMPP_GESTURE_MS")) : 160) * 1000;
  const uint64_t interval = gesture ? std::max(update_interval(), gesture_us) : update_interval();
  if (eink::empty(pending) || now < mode_ready_us || (last_sent_us && now - last_sent_us < interval)) {
    if (eink::empty(r)) rin::wait_input(8, sock);
    return;
  }
  ClientMsg m = {}; m.type = MSG_UPDATE;
  m.update.type = UPDATE_PARTIAL; m.update.x = pending.x0; m.update.y = pending.y0;
  m.update.w = pending.x1 - pending.x0; m.update.h = pending.y1 - pending.y0;
  ssize_t sent = send(sock, &m, sizeof m, MSG_DONTWAIT | MSG_NOSIGNAL);
  if (sent == sizeof m) {
    if (ghost_skip) ghost_skip = false; else if (!ghostv.on) eink::ghost_add(ghost, eink::area(pending), now);   // the ghost is cleaned after
    if (refresh_mode == MODE_FAST && wanted_mode != MODE_FAST) eink::unite(fast_area, pending);
    else if (pending.x0 <= fast_area.x0 && pending.y0 <= fast_area.y0 && pending.x1 >= fast_area.x1 && pending.y1 >= fast_area.y1) fast_area = {};
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

}  // namespace
extern "C" bool zinc_rmpp_set_fast(bool fast);
namespace {
// zinc:gfx refreshDisplay() asks for "display.refresh": "1" when this layer can do a full refresh (qtfb of AppLoad 0.6.0+, the ink session)
bool send_msg(const ClientMsg& m) { return send(sock, &m, sizeof m, MSG_DONTWAIT | MSG_NOSIGNAL) == sizeof m; }

// zinc:gfx's window calls: "window.minimize" (minimizeWindow), "window.widget" with "x,y,w,h" (setWidget), "window.show-widget"
// (showWidget), "window.dock" (dockWindow): "1" when AppLoad did it, the app keeps running; "window.state": "full", "docked", "widget" or "hidden"
const char* rm_device(const char* query, const char* arg) {
  const bool qtfb = window_ok && sock >= 0 && (layer == L0 || layer == L1);
  if (strcmp(query, "window.edge") == 0) { static char n[16]; snprintf(n, sizeof n, "%d", rin::edge_swipes); return n; }   // swipes so far
  // the header bar (AppLoad 0010): "window.headerbar" "1" while docked with it (the app shows no bar of its own), "window.action" the
  // presses on its buttons so far and the last one, "n:home" or "n:quit"
  if (strcmp(query, "window.headerbar") == 0) return header_bar && docked && !hidden && !as_widget ? "1" : "0";
  if (strcmp(query, "window.action") == 0) {
    action_read = true;
    static char n[24]; snprintf(n, sizeof n, "%d:%s", header_actions, header_action == 2 ? "quit" : "home"); return n;
  }
  if (strcmp(query, "window.state") == 0) return as_widget ? "widget" : hidden ? "hidden" : docked ? "docked" : "full";
  if (strcmp(query, "window.minimize") == 0) {
    ClientMsg m = {}; m.type = MSG_WINDOW_STATE; m.window = WINDOW_MINIMIZE;
    if (!qtfb || !send_msg(m)) return "0";
    hidden = true;   // at once: AppLoad's answer comes at the next poll, and a frame sent before it would land in a hidden window
    window_changed();
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
    window_changed();
    return "1";
  }
  // "window.dock" (zinc:gfx dockWindow): the window under xochitl's header, the app's top safe area its height; "1" when AppLoad did it
  if (strcmp(query, "window.dock") == 0) return dock() ? "1" : "0";
  // "display.mode" "fast" | "ui" (zinc:remarkable setPenMode): Pen waveform while the app writes, UI for the rest. qtfb sleeps 1 s on a
  // switch, so the app asks when the user starts or stops writing, not per stroke; a switch refused in that second is made by rm_present.
  // ponytail: kept while qtfb has one global mode. With AppLoad patch 0004's capability bit the pen's own updates go out in Pen mode, and
  // this query, setPenMode and InkPalette's call to it are removed (docs/reports/engine-gestures-zoom-refresh.md, step 6).
  if (strcmp(query, "display.mode") == 0) {
    if (!arg || (strcmp(arg, "fast") && strcmp(arg, "ui"))) return "0";
    return zinc_rmpp_set_fast(strcmp(arg, "fast") == 0) || layer == L0 ? "1" : "0";
  }
  // "display.ghost" "begin x,y,w,h" (the view, framebuffer pixels: "1" when this driver draws the ghost), "move ox,oy,k" (the view's top left
  // shows at (ox, oy), scaled by k), "end" (kept until the app draws the view again), "cancel"
  if (strcmp(query, "display.ghost") == 0) {
    if (!arg || !shm || (layer != L0 && layer != L1)) return "0";
    int x = 0, y = 0, w = 0, h = 0; float ox = 0, oy = 0, k = 1;
    if (sscanf(arg, "begin %d,%d,%d,%d", &x, &y, &w, &h) == 4) {
      eink::Rect v = {std::max(x, 0), std::max(y, 0), std::min(x + w, panel.w), std::min(y + h, panel.h)};
      if (eink::empty(v)) return "0";
      const int32_t vw = v.x1 - v.x0, vh = v.y1 - v.y0;
      free(ghostv.px); ghostv.px = (uint8_t*)malloc((size_t)vw * vh * 3);
      if (!ghostv.px) return "0";
      for (int32_t r = 0; r < vh; r++) memcpy(ghostv.px + (size_t)r * vw * 3, shm + ((size_t)(v.y0 + r) * panel.w + v.x0) * 3, (size_t)vw * 3);
      ghostv = {true, false, false, false, v, ghostv.px, 1, (float)v.x0, (float)v.y0};
      return "1";
    }
    if (sscanf(arg, "move %f,%f,%f", &ox, &oy, &k) == 3) {
      if (!ghostv.on || !(k > 0.05f)) return "0";
      if (ox != ghostv.ox || oy != ghostv.oy || k != ghostv.k) { ghostv.ox = ox; ghostv.oy = oy; ghostv.k = k; ghostv.dirty = true; }
      return "1";
    }
    if (strcmp(arg, "end") == 0) { if (ghostv.on) { ghostv.on = false; ghostv.hold = true; gesture = false; } return "1"; }   // the sharp page: app's mode
    if (strcmp(arg, "cancel") == 0) { if (ghostv.on || ghostv.hold) { ghostv.on = ghostv.hold = false; ghostv.restore = true; } return "1"; }
    return "0";
  }
  if (strcmp(query, "display.intent") == 0) {
    if (!arg || (strcmp(arg, "interactive") && strcmp(arg, "settle") && strcmp(arg, "normal"))) return "0";
    intent_seen = true;
    const bool fast = strcmp(arg, "interactive") == 0, settle = strcmp(arg, "settle") == 0;
    if (layer == L2) { native::fast = fast || wanted_mode == MODE_FAST; if (settle) native::full_now = true; return "1"; }
    if (layer == RM2) { rm2fb::fast = fast || wanted_mode == MODE_FAST; return "1"; }
    gesture = fast;
    full_due = 0;
    if (settle) { eink::unite(pending, fast_area); fast_area = {}; }   // after the frame being drawn now, in the app's mode: no flash
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
