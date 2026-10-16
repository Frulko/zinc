// One binary, two HALs (ZN-047): the window of the SDL HAL (targets/macos/hal_sdl.cpp) for interactive runs, the headless one
// (targets/null/hal_null.cpp, virtual clock, fixed time step) for tests, goldens and machines without a display. Both files are compiled
// with their hal_* functions renamed (sdl_hal_*, null_hal_*; CMakeLists.txt); these are the real ones and pick at hal_init.
// Headless: ZINC_HEADLESS, or a deterministic run (ZINC_DETERMINISTIC, ZINC_RECORD, ZINC_REPLAY), or an engine built without SDL.
#include <stdlib.h>
#include <string.h>

#include <stdio.h>
#include <string>
#include <vector>

#include "hal.h"

// Pixels per logical pixel without a window: ZINC_SCALE=1..4 (a HiDPI frame in headless runs and tests), 1 by default.
static int32_t headlessScale(void) { const char* s = getenv("ZINC_SCALE"); int k = s ? atoi(s) : 1; return k >= 1 && k <= 4 ? k : 1; }

namespace zrt { extern bool display_driver; }   // runtime/zrt.cpp: a plugins/display-* driver holds the screen

extern "C" {
void null_hal_init(const HalConfig*); void null_hal_shutdown(void); void null_hal_frame_begin(void); void null_hal_frame_end(void);
void null_hal_poll_input(HalInput*); void null_hal_present(const HalFrame*); void null_hal_surface_size(int*, int*); double null_hal_fixed_dt(void);
#ifdef ZN_HOST_SDL
void sdl_hal_init(const HalConfig*); void sdl_hal_shutdown(void); void sdl_hal_frame_begin(void); void sdl_hal_frame_end(void);
void sdl_hal_poll_input(HalInput*); void sdl_hal_present(const HalFrame*); void sdl_hal_surface_size(int*, int*); double sdl_hal_fixed_dt(void);
void sdl_hal_text_input(int32_t, float, float, float, float); const char* sdl_hal_clipboard_get(void); void sdl_hal_clipboard_set(const char*, size_t);
void sdl_hal_set_cursor(int32_t); void sdl_hal_escape_by_app(int32_t); void sdl_hal_escape(void); int32_t sdl_hal_pixel_scale(void); void* sdl_hal_window_handle(void);
int32_t sdl_hal_win_open(int32_t, const char*, int32_t, int32_t); void sdl_hal_win_close(int32_t); int32_t sdl_hal_win_state(int32_t);
void sdl_hal_win_input(int32_t, HalInput*, int32_t*, int32_t*); void sdl_hal_win_present(int32_t, const uint32_t*, int32_t, int32_t); void sdl_hal_win_current(int32_t);
#endif

static bool live = false;
static bool headlessRequested() {
  auto set = [](const char* n) { const char* v = getenv(n); return v && *v && *v != '0'; };
  return set("ZINC_HEADLESS") || set("ZINC_DETERMINISTIC") || getenv("ZINC_RECORD") || getenv("ZINC_REPLAY");
}
// A display driver on the headless HAL (a Pi's framebuffer: no SDL in a cross build) shows real frames: measured time and no budget of 60 frames (the driver's poll clears the null HAL's quit),
// unless the run is headless or counts its frames (ZINC_FRAMES, the tests)
static bool driven() { return zrt::display_driver && !headlessRequested() && !getenv("ZINC_FRAMES"); }
int zn_hal_is_live(void) { return live || driven() ? 1 : 0; }
int zn_hal_headless_requested(void) { return headlessRequested() ? 1 : 0; }
// zinc.json splash.minMs (ZN-446): the frame after the splash waits until then, so the splash stays at least that long (0: no wait)
static uint64_t holdUntil = 0;
void zn_hal_hold(uint64_t untilUs) { holdUntil = untilUs; }
static void hold() {
  for (uint64_t now; (now = hal_time_us()) < holdUntil;) hal_sleep_us(holdUntil - now);   // a sleep lasts a second at most
  holdUntil = 0;
}

// Scripted input for headless runs (ZINC_INPUT=file): one event per line, `<frame> <event>`, frames counted from 0 at each poll.
//   move X Y | down | up | right-down | right-up | key NAME [shift|ctrl|alt|meta]... | text WORD | text "several words" (\" and \\ inside) | wheel DX DY | pad NAME | padup NAME (the gamepad buttons Up Down Left Right A B X Y L R Start Select, held until padup)
//   gamepad I [NAME...] (a gamepad is plugged in slot I, 0 to 3) | gamepadoff I | gbutton I B [VALUE] (button B of the W3C standard order,
//   0 to 16, held until gbuttonup; VALUE 0..1 for the triggers 6 and 7) | gbuttonup I B | gaxis I A VALUE (axis 0 to 3, -1..1, kept)
//   touch ID X Y (a finger lands or moves; up to HAL_MAX_TOUCH at once, held until its touchup) | touchup ID
//   window ID: the events after it in the same frame go to that window (ZN-663; 0 the main one) | close: the user closes the window the events go to
// The events reach zinc:gfx exactly as a window's would (pointer position and buttons, button events, keys, typed text, wheel, touch points:
// the first finger is also the pointer, as on a touch screen).
namespace {
struct Event { int frame; std::string kind, a, b, c; };
std::vector<Event> script;
bool scriptRead = false;
int pollNo = 0;
float curX = 0, curY = 0;
uint32_t heldButtons = 0, heldPad = 0;
HalGamepad heldGamepad[HAL_MAX_GAMEPADS];   // the scripted gamepads (ZN-574)
HalTouch heldTouch[HAL_MAX_TOUCH];   // fingers down, in landing order
int nHeldTouch = 0;
void readScript() {
  scriptRead = true;
  const char* path = getenv("ZINC_INPUT");
  if (!path || !*path) return;
  FILE* f = fopen(path, "r");
  if (!f) return;
  char line[1024];
  while (fgets(line, sizeof line, f)) {
    int frame = 0, used = 0;
    char kind[32] = {0};
    if (sscanf(line, "%d %31s%n", &frame, kind, &used) < 2) continue;
    Event e{frame, kind, "", "", ""};
    const char* rest = line + used;
    while (*rest == ' ' || *rest == '\t') rest++;
    if (e.kind == "text" && *rest == '"') {   // text "two words": the whole string, with \" and \\ (ZN-688)
      for (const char* q = rest + 1; *q && *q != '"' && *q != '\n'; q++) {
        if (*q == '\\' && (q[1] == '"' || q[1] == '\\')) q++;
        e.a += *q;
      }
      script.push_back(e);
      continue;
    }
    char a[128] = {0}, b[128] = {0}, c[128] = {0};
    int named = 0;
    sscanf(rest, "%127s %n%127s %127s", a, &named, b, c);
    e.a = a; e.b = b; e.c = c;
    if (e.kind == "gamepad") { e.b = rest + named; while (!e.b.empty() && (e.b.back() == '\n' || e.b.back() == '\r' || e.b.back() == ' ')) e.b.pop_back(); }   // the name: the rest of the line
    script.push_back(e);
  }
  fclose(f);
}
int keyCode(const std::string& n) {
  if (n.size() == 1) return static_cast<unsigned char>(n[0]);
  static const struct { const char* n; int code; } named[] = {{"Backspace", HAL_KEY_BACKSPACE}, {"Delete", HAL_KEY_DELETE}, {"Enter", HAL_KEY_ENTER}, {"Tab", HAL_KEY_TAB},
    {"Escape", HAL_KEY_ESCAPE}, {"ArrowLeft", HAL_KEY_ARROW_LEFT}, {"ArrowRight", HAL_KEY_ARROW_RIGHT}, {"ArrowUp", HAL_KEY_ARROW_UP}, {"ArrowDown", HAL_KEY_ARROW_DOWN},
    {"Home", HAL_KEY_HOME}, {"End", HAL_KEY_END}, {"PageUp", HAL_KEY_PAGEUP}, {"PageDown", HAL_KEY_PAGEDOWN}};
  for (auto& k : named) if (n == k.n) return k.code;
  return 0;
}
// The windows beside the main one in headless runs (ZN-663): their surfaces are the runtime's; the script drives their input.
struct NullWin { int32_t id, w, h; bool open; HalInput in; float x, y; uint32_t held; };
std::vector<NullWin> nullWins;
bool nullMainHidden = false, nullQuit = false;
NullWin* nullWin(int32_t id) { for (NullWin& w : nullWins) if (w.open && w.id == id) return &w; return nullptr; }
bool nullAnyOpen() { for (NullWin& w : nullWins) if (w.open) return true; return false; }
void nullClose(int32_t id) {   // the rule of the last window, as the window HAL keeps it
  if (id == 0) { if (nullAnyOpen()) nullMainHidden = true; else nullQuit = true; return; }
  if (NullWin* w = nullWin(id)) w->open = false;
  if (nullMainHidden && !nullAnyOpen()) nullQuit = true;
}
/** A pointer, wheel or key event of the script into `in`, the pointer of its window at (x, y) with `held` buttons. False: not one of these. */
bool applyEvent(const Event& e, HalInput* in, float& x, float& y, uint32_t& held) {
  auto button = [&](int which, int down) {
    uint32_t bit = which == 0 ? 1u : 2u;
    held = down ? (held | bit) : (held & ~bit);
    if (in->nbtn < HAL_MAX_BUTTON_EVENTS) in->btn[in->nbtn++] = HalButtonEvent{x, y, which, down};
    in->pdown = held & 1; in->pbuttons = held;
  };
  if (e.kind == "move") { x = static_cast<float>(atof(e.a.c_str())); y = static_cast<float>(atof(e.b.c_str())); in->px = x; in->py = y; }
  else if (e.kind == "down") button(0, 1);
  else if (e.kind == "up") button(0, 0);
  else if (e.kind == "right-down") button(2, 1);
  else if (e.kind == "right-up") button(2, 0);
  else if (e.kind == "wheel") { in->wheel_x += static_cast<float>(atof(e.a.c_str())); in->wheel += static_cast<float>(atof(e.b.c_str())); }
  else if (e.kind == "key" && in->nkeys < HAL_MAX_KEYS) {
    uint32_t mods = 0;
    for (size_t at = 0; at <= e.b.size();) {   // "shift", or several joined with '+': "shift+meta"
      size_t end = e.b.find('+', at);
      if (end == std::string::npos) end = e.b.size();
      const std::string m = e.b.substr(at, end - at);
      mods |= m == "shift" ? HAL_MOD_SHIFT : m == "ctrl" ? HAL_MOD_CTRL : m == "alt" ? HAL_MOD_ALT : m == "meta" ? HAL_MOD_META : 0;
      at = end + 1;
    }
    in->keys[in->nkeys++] = HalKey{keyCode(e.a), mods, HAL_KEY_DOWN, 0, 0};
  } else if (e.kind == "text" && in->nkeys < HAL_MAX_KEYS) {
    size_t n = e.a.size();
    if (static_cast<size_t>(in->ntext) + n < HAL_TEXT_BYTES) {
      in->keys[in->nkeys++] = HalKey{0, 0, HAL_KEY_TEXT, static_cast<uint16_t>(in->ntext), static_cast<uint16_t>(n)};
      memcpy(in->text + in->ntext, e.a.data(), n);
      in->ntext += static_cast<int32_t>(n);
    }
  } else return false;
  return true;
}
void applyScript(HalInput* in) {
  if (!scriptRead) readScript();
  in->nkeys = 0; in->ntext = 0; in->nbtn = 0; in->wheel_x = 0;  // the events of a frame are the script's, like the window HAL's (hal_sdl.cpp)
  in->px = curX; in->py = curY; in->pdown = heldButtons & 1; in->pbuttons = heldButtons;
  int32_t target = 0;
  for (const Event& e : script) {
    if (e.frame != pollNo) continue;
    if (e.kind == "window") { target = atoi(e.a.c_str()); continue; }
    if (e.kind == "close") { nullClose(target); continue; }
    if (target != 0) { if (NullWin* w = nullWin(target)) applyEvent(e, &w->in, w->x, w->y, w->held); continue; }
    if (e.kind == "pad" || e.kind == "padup") {
      static const char* names[] = {"Up", "Down", "Left", "Right", "A", "B", "X", "Y", "L", "R", "Start", "Select"};
      for (int i = 0; i < 12; ++i) if (e.a == names[i]) heldPad = e.kind == "pad" ? (heldPad | (1u << i)) : (heldPad & ~(1u << i));
      continue;
    }
    if (e.kind == "gamepad" || e.kind == "gamepadoff" || e.kind == "gbutton" || e.kind == "gbuttonup" || e.kind == "gaxis") {
      const int slot = atoi(e.a.c_str()), k = atoi(e.b.c_str());
      if (slot < 0 || slot >= HAL_MAX_GAMEPADS) continue;
      HalGamepad& p = heldGamepad[slot];
      if (e.kind == "gamepad") { p = HalGamepad{}; p.connected = 1; snprintf(p.name, sizeof p.name, "%s", e.b.empty() ? "Zinc scripted gamepad" : e.b.c_str()); }
      else if (e.kind == "gamepadoff") p = HalGamepad{};
      else if (e.kind == "gaxis") { if (k >= 0 && k < 4) p.axes[k] = static_cast<float>(atof(e.c.c_str())); }
      else if (k >= 0 && k <= 16) {
        const float v = e.kind == "gbuttonup" ? 0 : e.c.empty() ? 1 : static_cast<float>(atof(e.c.c_str()));
        p.buttons = v > 0 ? (p.buttons | (1u << k)) : (p.buttons & ~(1u << k));
        if (k == 6 || k == 7) p.trigger[k - 6] = v;
      }
      continue;
    }
    if (e.kind == "touch" || e.kind == "touchup") {
      const int32_t id = atoi(e.a.c_str());
      int k = 0;
      while (k < nHeldTouch && heldTouch[k].id != id) k++;
      if (e.kind == "touchup") { if (k < nHeldTouch) { for (int j = k + 1; j < nHeldTouch; j++) heldTouch[j - 1] = heldTouch[j]; nHeldTouch--; } }
      else if (k < HAL_MAX_TOUCH) { heldTouch[k] = HalTouch{id, static_cast<float>(atof(e.b.c_str())), static_cast<float>(atof(e.c.c_str()))}; if (k == nHeldTouch) nHeldTouch++; }
      continue;
    }
    applyEvent(e, in, curX, curY, heldButtons);
  }
  in->buttons |= heldPad;
  for (int k = 0; k < HAL_MAX_GAMEPADS; k++) in->pad[k] = heldGamepad[k];   // a rumble asked by the program ends here: nothing shakes
  in->ntouch = nHeldTouch;
  for (int k = 0; k < nHeldTouch; k++) in->touch[k] = heldTouch[k];
  if (nHeldTouch > 0) { curX = heldTouch[0].x; curY = heldTouch[0].y; in->px = curX; in->py = curY; in->pdown = 1; in->pbuttons |= 1; }
  if (nullQuit) in->quit = 1;
  ++pollNo;
}
int32_t nullWinOpen(int32_t id, int32_t w, int32_t h) { NullWin n{}; n.id = id; n.w = w; n.h = h; n.open = true; n.in.pinch = 1; nullWins.push_back(n); return 1; }
int32_t nullWinState(int32_t id) { return id == 0 ? !nullMainHidden && !nullQuit : nullWin(id) != nullptr; }
void nullWinInput(int32_t id, HalInput* in, int32_t* w, int32_t* h) {
  NullWin* n = nullWin(id);
  if (!n) return;
  *in = n->in;
  n->in.nkeys = 0; n->in.ntext = 0; n->in.nbtn = 0; n->in.wheel = n->in.wheel_x = 0; n->in.pinch = 1;
  in->px = n->x; in->py = n->y; in->pdown = n->held & 1; in->pbuttons = n->held;
  *w = n->w; *h = n->h;
}
}  // namespace

#ifdef ZN_HOST_SDL
#define PICK(live_expr, null_expr) (live ? (live_expr) : (null_expr))
#ifdef ZN_WINDOW_SEPARATE
// The window host is its own library (ZN-592.01): compiled programs that draw link it whole (it says yes here), zinc loads it as a module
// (src/host/window_module.cpp), and a compiled program that does not draw links none of it (ZN-592.06): these stand in, never called.
__attribute__((weak)) int zn_window_load(void) { return 0; }
__attribute__((weak)) void sdl_hal_init(const HalConfig*) {}
__attribute__((weak)) void sdl_hal_shutdown(void) {}
__attribute__((weak)) void sdl_hal_frame_begin(void) {}
__attribute__((weak)) void sdl_hal_frame_end(void) {}
__attribute__((weak)) void sdl_hal_poll_input(HalInput*) {}
__attribute__((weak)) void sdl_hal_present(const HalFrame*) {}
__attribute__((weak)) void sdl_hal_surface_size(int* w, int* h) { *w = 0; *h = 0; }
__attribute__((weak)) double sdl_hal_fixed_dt(void) { return 0; }
__attribute__((weak)) void sdl_hal_text_input(int32_t, float, float, float, float) {}
__attribute__((weak)) const char* sdl_hal_clipboard_get(void) { return ""; }
__attribute__((weak)) void sdl_hal_clipboard_set(const char*, size_t) {}
__attribute__((weak)) void sdl_hal_set_cursor(int32_t) {}
__attribute__((weak)) void sdl_hal_escape_by_app(int32_t) {}
__attribute__((weak)) void sdl_hal_escape(void) {}
__attribute__((weak)) int32_t sdl_hal_pixel_scale(void) { return 1; }
__attribute__((weak)) void* sdl_hal_window_handle(void) { return nullptr; }
__attribute__((weak)) int32_t sdl_hal_win_open(int32_t, const char*, int32_t, int32_t) { return 0; }
__attribute__((weak)) void sdl_hal_win_close(int32_t) {}
__attribute__((weak)) int32_t sdl_hal_win_state(int32_t) { return 0; }
__attribute__((weak)) void sdl_hal_win_input(int32_t, HalInput*, int32_t*, int32_t*) {}
__attribute__((weak)) void sdl_hal_win_present(int32_t, const uint32_t*, int32_t, int32_t) {}
__attribute__((weak)) void sdl_hal_win_current(int32_t) {}
__attribute__((weak)) void hal_set_resize(int32_t) {}
#else
__attribute__((weak)) int zn_window_load(void) { return 1; }   // the window host is in this library
#endif
int zn_hal_wants_window(void) { return !headlessRequested() && zn_window_load(); }   // what hal_init decides, asked before it (the splash, ZN-446)
void hal_init(const HalConfig* c) { live = c->gfx && zn_hal_wants_window(); if (live) sdl_hal_init(c); else null_hal_init(c); }
void hal_shutdown(void) { if (live) sdl_hal_shutdown(); else null_hal_shutdown(); }
void hal_frame_begin(void) { if (live) sdl_hal_frame_begin(); else null_hal_frame_begin(); }
void hal_frame_end(void) { if (live) sdl_hal_frame_end(); else null_hal_frame_end(); }
// a window takes a ZINC_INPUT script too (ZN-744): a scripted fling measured on a real display (a phone, the desktop window); the script's pointer and
// fingers then replace the live ones
static bool windowScript() { static const bool on = [] { const char* p = getenv("ZINC_INPUT"); return p && *p; }(); return on; }
void hal_poll_input(HalInput* in) { if (live) { sdl_hal_poll_input(in); if (windowScript()) applyScript(in); } else { null_hal_poll_input(in); applyScript(in); } }
void hal_present(const HalFrame* f) { if (holdUntil) hold(); if (live) sdl_hal_present(f); else null_hal_present(f); }
void hal_surface_size(int* w, int* h) { if (live) sdl_hal_surface_size(w, h); else null_hal_surface_size(w, h); }
double hal_fixed_dt(void) { return live ? sdl_hal_fixed_dt() : driven() ? 0 : null_hal_fixed_dt(); }
void hal_text_input(int32_t on, float x, float y, float w, float h) { if (live) sdl_hal_text_input(on, x, y, w, h); }
static std::string privateClipboard;
const char* hal_clipboard_get(void) { return live ? sdl_hal_clipboard_get() : privateClipboard.c_str(); }
void hal_clipboard_set(const char* s, size_t n) { if (live) sdl_hal_clipboard_set(s, n); else privateClipboard.assign(s, n); }
void hal_set_cursor(int32_t shape) { if (live) sdl_hal_set_cursor(shape); }
void hal_escape_by_app(int32_t on) { if (live) sdl_hal_escape_by_app(on); }
void hal_escape(void) { if (live) sdl_hal_escape(); }
int32_t hal_pixel_scale(void) { return live ? sdl_hal_pixel_scale() : headlessScale(); }
void* hal_window_handle(void) { return live ? sdl_hal_window_handle() : nullptr; }
int32_t hal_win_open(int32_t id, const char* title, int32_t w, int32_t h) { return live ? sdl_hal_win_open(id, title, w, h) : nullWinOpen(id, w, h); }
void hal_win_close(int32_t id) { if (live) sdl_hal_win_close(id); else nullClose(id); }
int32_t hal_win_state(int32_t id) { return live ? sdl_hal_win_state(id) : nullWinState(id); }
void hal_win_input(int32_t id, HalInput* in, int32_t* w, int32_t* h) { if (live) sdl_hal_win_input(id, in, w, h); else nullWinInput(id, in, w, h); }
void hal_win_present(int32_t id, const uint32_t* px, int32_t pw, int32_t ph) { if (live) sdl_hal_win_present(id, px, pw, ph); }
void hal_win_current(int32_t id) { if (live) sdl_hal_win_current(id); }
#else
int zn_hal_wants_window(void) { return 0; }
void hal_init(const HalConfig* c) { null_hal_init(c); }
void hal_shutdown(void) { null_hal_shutdown(); }
void hal_frame_begin(void) { null_hal_frame_begin(); }
void hal_frame_end(void) { null_hal_frame_end(); }
void hal_poll_input(HalInput* in) { null_hal_poll_input(in); applyScript(in); }
void hal_present(const HalFrame* f) { null_hal_present(f); }
void hal_surface_size(int* w, int* h) { null_hal_surface_size(w, h); }
double hal_fixed_dt(void) { return driven() ? 0 : null_hal_fixed_dt(); }
void hal_text_input(int32_t, float, float, float, float) {}
static std::string privateClipboard;
const char* hal_clipboard_get(void) { return privateClipboard.c_str(); }
void hal_clipboard_set(const char* s, size_t n) { privateClipboard.assign(s, n); }
void hal_set_cursor(int32_t) {}
void hal_escape_by_app(int32_t) {}
void hal_escape(void) {}
int32_t hal_pixel_scale(void) { return headlessScale(); }
void* hal_window_handle(void) { return nullptr; }
int32_t hal_win_open(int32_t id, const char*, int32_t w, int32_t h) { return nullWinOpen(id, w, h); }
void hal_win_close(int32_t id) { nullClose(id); }
int32_t hal_win_state(int32_t id) { return nullWinState(id); }
void hal_win_input(int32_t id, HalInput* in, int32_t* w, int32_t* h) { nullWinInput(id, in, w, h); }
void hal_win_present(int32_t, const uint32_t*, int32_t, int32_t) {}
void hal_win_current(int32_t) {}
#endif
}
