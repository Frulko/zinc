// One binary, two HALs (ZN-047): the window of the SDL HAL (targets/macos/hal_sdl.cpp) for interactive runs, the headless one
// (targets/null/hal_null.cpp, virtual clock, fixed time step) for tests, goldens and machines without a display. Both files are compiled
// with their hal_* functions renamed (sdl_hal_*, null_hal_*; CMakeLists.txt); these are the real ones and pick at hal_init.
// Headless: ZINC_HEADLESS, or a deterministic run (ZINC_DETERMINISTIC, ZINC_RECORD, ZINC_REPLAY), or an engine built without SDL.
#include <stdlib.h>
#include <string.h>

#include <stdio.h>
#include <chrono>
#include <deque>
#include <mutex>
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
//   move X Y | down | up | right-down | right-up | key NAME (a character, Space, Enter, Escape, Arrow*...) [shift|ctrl|alt|meta]... | text WORD | text "several words" (\" and \\ inside) | wheel DX DY | scroll DX DY PHASE (precise pixels and
//   the phase, as a trackpad's HAL reports them: HalInput.scroll_*) | pad NAME | padup NAME (the gamepad buttons Up Down Left Right A B X Y L R Start Select, held until padup)
//   gamepad I [NAME...] (a gamepad is plugged in slot I, 0 to 3) | gamepadoff I | gbutton I B [VALUE] (button B of the W3C standard order,
//   0 to 16, held until gbuttonup; VALUE 0..1: a trigger's travel or a pressure-sensitive button's press) | gbuttonup I B | gaxis I A VALUE (axis 0 to 3, -1..1, kept)
//   touch ID X Y (a finger lands or moves; up to HAL_MAX_TOUCH at once, held until its touchup) | touchup ID
//   window ID: the events after it in the same frame go to that window (ZN-663; 0 the main one) | close: the user closes the window the events go to
//   the system's signals, as a phone's OS sends them (zn_hal_signal below): safearea T R B L | theme dark|light | fontscale K | reducemotion 0|1 |
//   keyboard HEIGHT (0 hidden) | back | backstart EDGE | backprogress P | backcancel | orientation portrait|landscape | compose "TEXT" | commit "TEXT" |
//   imedelete BEFORE AFTER | imeselect START END | imeaction NAME (an input connection's calls on the focused field) |
//   a11y 0|1 (a screen reader listens) | a11yactivate ID | a11yfocus ID | a11yscroll ID 1|-1 (it pressed, moved to or scrolled a node of
//   zinc:ui's tree, ZN-630) | background | foreground (home and return: zinc:ui stops drawing between them) | safe-area T R B L (safearea's other
//   spelling) | rotate (the headless surface turns a quarter: its width and height swap, a resize, and the orientation signal follows; the safe
//   area of the new side is the script's next safe-area line, as the OS sends it)
// The events reach zinc:gfx exactly as a window's would (pointer position and buttons, button events, keys, typed text, wheel, touch points:
// the first finger is also the pointer, as on a touch screen).
// The system's signals (docs/ui.md, "System signals"): one line each, `kind args`, queued by the window HAL (SDL events: theme, safe area, the
// back key, the on-screen keyboard, IME composition), by a phone's glue (src/app/android, src/app/ios_glue.mm: font scale, reduce motion, back
// progress) and by a ZINC_INPUT script; zinc:ui takes them at the start of its frame (zinc:gfx signalCount, signalNext). Any thread may push.
static std::mutex sigMu;
static std::deque<std::string> sigQueue;
static std::string sigLast;
extern "C" void zn_hal_signal(const char* line) { std::lock_guard<std::mutex> g(sigMu); if (sigQueue.size() < 256) sigQueue.emplace_back(line); }
extern "C" int zn_hal_signal_count(void) { std::lock_guard<std::mutex> g(sigMu); return static_cast<int>(sigQueue.size()); }
extern "C" const char* zn_hal_signal_next(void) {   // valid until the next call
  std::lock_guard<std::mutex> g(sigMu);
  sigLast.clear();
  if (!sigQueue.empty()) { sigLast = sigQueue.front(); sigQueue.pop_front(); }
  return sigLast.c_str();
}
// The keyboard the focused field asks for, set by zinc:ui through zinc:sys device('keyboard-traits', ...) (sys_host.cpp) and read by the window HAL
// when it starts the text input (SDL's text input properties: type, capitalisation, autocorrect, multiline)
static std::string textTraits;
extern "C" void zn_hal_set_text_traits(const char* t) { std::lock_guard<std::mutex> g(sigMu); textTraits = t; }
extern "C" const char* zn_hal_text_traits(void) { return textTraits.c_str(); }
// What the program asks of a phone's system UI (zinc:sys device('haptic' | 'statusbar' | 'exitapp' | 'textinput' | 'keyboard-traits'), sys_host.cpp):
// the phone's glue sets it when the app starts (src/app/android_glue.cpp, src/app/ios_glue.mm); null on a desktop
extern "C" { const char* (*zn_mobile_command)(const char* q, const char* a) = nullptr; }
static bool isSignal(const std::string& k) {
  static const char* kinds[] = {"safearea", "theme", "fontscale", "reducemotion", "keyboard", "back", "backstart", "backprogress", "backcancel", "orientation", "background", "foreground", "compose", "commit", "imedelete", "imeselect", "imeaction", "a11y", "a11yactivate", "a11yfocus", "a11yscroll"};
  for (const char* x : kinds) if (k == x) return true;
  return false;
}

namespace {
struct Event { int frame; std::string kind, a, b, c; };
std::vector<Event> script;
bool scriptRead = false;
int pollNo = 0;
bool turned = false;   // a script's rotate: the headless surface's width and height are swapped
void nullSize(int* w, int* h) { null_hal_surface_size(w, h); if (turned) { const int t = *w; *w = *h; *h = t; } }
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
    Event e{frame, strcmp(kind, "safe-area") == 0 ? "safearea" : kind, "", "", ""};
    const char* rest = line + used;
    while (*rest == ' ' || *rest == '\t') rest++;
    if ((e.kind == "text" || e.kind == "compose" || e.kind == "commit") && *rest == '"') {   // text "two words": the whole string, with \" and \\ (ZN-688)
      for (const char* q = rest + 1; *q && *q != '"' && *q != '\n'; q++) {
        if (*q == '\\' && (q[1] == '"' || q[1] == '\\')) q++;
        e.a += *q;
      }
      script.push_back(e);
      continue;
    }
    if (isSignal(e.kind)) {   // the rest of the line, as the signal's arguments
      e.a = rest;
      while (!e.a.empty() && (e.a.back() == '\n' || e.a.back() == '\r' || e.a.back() == ' ')) e.a.pop_back();
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
    {"Home", HAL_KEY_HOME}, {"End", HAL_KEY_END}, {"PageUp", HAL_KEY_PAGEUP}, {"PageDown", HAL_KEY_PAGEDOWN}, {"Space", ' '}};
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
  else if (e.kind == "scroll") { in->scroll_dx += static_cast<float>(atof(e.a.c_str())); in->scroll_dy += static_cast<float>(atof(e.b.c_str())); in->scroll_phase = atoi(e.c.c_str()); }
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
  in->nkeys = 0; in->ntext = 0; in->nbtn = 0; in->wheel_x = 0; in->scroll_dx = in->scroll_dy = 0; in->scroll_phase = 0;  // the events of a frame are the script's, like the window HAL's (hal_sdl.cpp)
  in->px = curX; in->py = curY; in->pdown = heldButtons & 1; in->pbuttons = heldButtons;
  int32_t target = 0;
  for (const Event& e : script) {
    if (e.frame != pollNo) continue;
    if (e.kind == "window") { target = atoi(e.a.c_str()); continue; }
    if (isSignal(e.kind)) { zn_hal_signal((e.kind + (e.a.empty() ? "" : " " + e.a)).c_str()); continue; }
    if (e.kind == "close") { nullClose(target); continue; }
    if (e.kind == "rotate" && live) {   // a phone: the app asks the OS to turn the screen (zinc:sys orientation, the glue of src/app)
      int w, h; hal_surface_size(&w, &h);
      if (zn_mobile_command) zn_mobile_command("orientation", w > h ? "portrait" : "landscape");
      continue;
    }
    if (e.kind == "rotate") { turned = !turned; int w, h; nullSize(&w, &h); zn_hal_signal(w > h ? "orientation landscape" : "orientation portrait"); continue; }
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
        else p.value[k] = e.c.empty() ? 0 : v;   // a VALUE is how hard the button is pressed (a DualShock 2's pressure, ZN-759)
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
  for (int k = 0; k < HAL_MAX_GAMEPADS; k++) {   // a rumble asked by the program ends here: nothing shakes, ZINC_DEVICE_LOG records it (ZN-759)
    if (in->pad[k].connected && in->pad[k].rumble_ms > 0)
      if (const char* log = getenv("ZINC_DEVICE_LOG"); log && *log)
        if (FILE* f = fopen(log, "a")) { fprintf(f, "rumble %d %.2f %.2f %d\n", k, in->pad[k].rumble_low, in->pad[k].rumble_high, static_cast<int>(in->pad[k].rumble_ms)); fclose(f); }
    in->pad[k] = heldGamepad[k];
  }
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
  n->in.nkeys = 0; n->in.ntext = 0; n->in.nbtn = 0; n->in.wheel = n->in.wheel_x = 0; n->in.pinch = 1; n->in.scroll_dx = n->in.scroll_dy = 0; n->in.scroll_phase = 0;
  in->px = n->x; in->py = n->y; in->pdown = n->held & 1; in->pbuttons = n->held;
  *w = n->w; *h = n->h;
}
}  // namespace

// ZINC_HEARTBEAT=<file> (zinc-app on a reMarkable, ZN-844): the frame loop rewrites the file every 2 s with the window's state ("full",
// "hidden", "widget"; "full" when no driver knows), and integrations/remarkable-engine/zinc-watch.c sees a hung app by the file's age.
// One clock read per frame. The loop keeps turning while the window is minimized (rm_present returns at once), so a hidden app beats too.
static void heartbeat() {
  static const char* path = getenv("ZINC_HEARTBEAT");
  if (!path || !*path) return;
  static std::chrono::steady_clock::time_point next;
  const auto now = std::chrono::steady_clock::now();
  if (now < next) return;
  next = now + std::chrono::seconds(2);
  const char* st = zrt::display_driver && hal_display->device ? hal_display->device("window.state", nullptr) : nullptr;
  if (FILE* f = fopen(path, "w")) { fputs(st ? st : "full", f); fclose(f); }
}
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
void hal_frame_end(void) { heartbeat(); if (live) sdl_hal_frame_end(); else null_hal_frame_end(); }
// a window takes a ZINC_INPUT script too (ZN-744): a scripted fling measured on a real display (a phone, the desktop window); the script's pointer and
// fingers then replace the live ones
static bool windowScript() { static const bool on = [] { const char* p = getenv("ZINC_INPUT"); return p && *p; }(); return on; }
void hal_poll_input(HalInput* in) { if (live) { sdl_hal_poll_input(in); if (windowScript()) applyScript(in); } else { null_hal_poll_input(in); applyScript(in); } }
void hal_present(const HalFrame* f) { if (holdUntil) hold(); if (live) sdl_hal_present(f); else null_hal_present(f); }
void hal_surface_size(int* w, int* h) { if (live) sdl_hal_surface_size(w, h); else nullSize(w, h); }
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
void hal_frame_end(void) { heartbeat(); null_hal_frame_end(); }
void hal_poll_input(HalInput* in) { null_hal_poll_input(in); applyScript(in); }
void hal_present(const HalFrame* f) { null_hal_present(f); }
void hal_surface_size(int* w, int* h) { nullSize(w, h); }
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
