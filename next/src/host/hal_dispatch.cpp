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

extern "C" {
void null_hal_init(const HalConfig*); void null_hal_shutdown(void); void null_hal_frame_begin(void); void null_hal_frame_end(void);
void null_hal_poll_input(HalInput*); void null_hal_present(const HalFrame*); void null_hal_surface_size(int*, int*); double null_hal_fixed_dt(void);
#ifdef ZN_HOST_SDL
void sdl_hal_init(const HalConfig*); void sdl_hal_shutdown(void); void sdl_hal_frame_begin(void); void sdl_hal_frame_end(void);
void sdl_hal_poll_input(HalInput*); void sdl_hal_present(const HalFrame*); void sdl_hal_surface_size(int*, int*); double sdl_hal_fixed_dt(void);
void sdl_hal_text_input(int32_t, float, float, float, float); const char* sdl_hal_clipboard_get(void); void sdl_hal_clipboard_set(const char*, size_t);
void sdl_hal_set_cursor(int32_t); void sdl_hal_escape_by_app(int32_t); void sdl_hal_escape(void); int32_t sdl_hal_pixel_scale(void); void* sdl_hal_window_handle(void);
#endif

static bool live = false;
static bool headlessRequested() {
  auto set = [](const char* n) { const char* v = getenv(n); return v && *v && *v != '0'; };
  return set("ZINC_HEADLESS") || set("ZINC_DETERMINISTIC") || getenv("ZINC_RECORD") || getenv("ZINC_REPLAY");
}
int zn_hal_is_live(void) { return live ? 1 : 0; }

// Scripted input for headless runs (ZINC_INPUT=file): one event per line, `<frame> <event>`, frames counted from 0 at each poll.
//   move X Y | down | up | right-down | right-up | key NAME [shift|ctrl|alt|meta]... | text STRING | wheel DX DY | pad NAME | padup NAME (the gamepad buttons Up Down Left Right A B X Y L R Start Select, held until padup)
// The events reach zinc:gfx exactly as a window's would (pointer position and buttons, button events, keys, typed text, wheel).
namespace {
struct Event { int frame; std::string kind, a, b; };
std::vector<Event> script;
bool scriptRead = false;
int pollNo = 0;
float curX = 0, curY = 0;
uint32_t heldButtons = 0, heldPad = 0;
void readScript() {
  scriptRead = true;
  const char* path = getenv("ZINC_INPUT");
  if (!path || !*path) return;
  FILE* f = fopen(path, "r");
  if (!f) return;
  char line[256];
  while (fgets(line, sizeof line, f)) {
    int frame = 0, used = 0;
    char kind[32] = {0};
    if (sscanf(line, "%d %31s%n", &frame, kind, &used) < 2) continue;
    Event e{frame, kind, "", ""};
    char a[128] = {0}, b[128] = {0};
    sscanf(line + used, " %127s %127s", a, b);
    e.a = a; e.b = b;
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
void applyScript(HalInput* in) {
  if (!scriptRead) readScript();
  in->nkeys = 0; in->ntext = 0; in->nbtn = 0; in->wheel_x = 0;  // the events of a frame are the script's, like the window HAL's (hal_sdl.cpp)
  in->px = curX; in->py = curY; in->pdown = heldButtons & 1; in->pbuttons = heldButtons;
  for (const Event& e : script) {
    if (e.frame != pollNo) continue;
    if (e.kind == "pad" || e.kind == "padup") {
      static const char* names[] = {"Up", "Down", "Left", "Right", "A", "B", "X", "Y", "L", "R", "Start", "Select"};
      for (int i = 0; i < 12; ++i) if (e.a == names[i]) heldPad = e.kind == "pad" ? (heldPad | (1u << i)) : (heldPad & ~(1u << i));
      continue;
    }
    auto button = [&](int which, int down) {
      uint32_t bit = which == 0 ? 1u : 2u;
      heldButtons = down ? (heldButtons | bit) : (heldButtons & ~bit);
      if (in->nbtn < HAL_MAX_BUTTON_EVENTS) in->btn[in->nbtn++] = HalButtonEvent{curX, curY, which, down};
      in->pdown = heldButtons & 1; in->pbuttons = heldButtons;
    };
    if (e.kind == "move") { curX = static_cast<float>(atof(e.a.c_str())); curY = static_cast<float>(atof(e.b.c_str())); in->px = curX; in->py = curY; }
    else if (e.kind == "down") button(0, 1);
    else if (e.kind == "up") button(0, 0);
    else if (e.kind == "right-down") button(2, 1);
    else if (e.kind == "right-up") button(2, 0);
    else if (e.kind == "wheel") { in->wheel_x += static_cast<float>(atof(e.a.c_str())); in->wheel += static_cast<float>(atof(e.b.c_str())); }
    else if (e.kind == "key" && in->nkeys < HAL_MAX_KEYS) {
      uint32_t mods = 0;
      for (const std::string& m : {e.b}) mods |= m == "shift" ? HAL_MOD_SHIFT : m == "ctrl" ? HAL_MOD_CTRL : m == "alt" ? HAL_MOD_ALT : m == "meta" ? HAL_MOD_META : 0;
      in->keys[in->nkeys++] = HalKey{keyCode(e.a), mods, HAL_KEY_DOWN, 0, 0};
    } else if (e.kind == "text" && in->nkeys < HAL_MAX_KEYS) {
      size_t n = e.a.size();
      if (static_cast<size_t>(in->ntext) + n < HAL_TEXT_BYTES) {
        in->keys[in->nkeys++] = HalKey{0, 0, HAL_KEY_TEXT, static_cast<uint16_t>(in->ntext), static_cast<uint16_t>(n)};
        memcpy(in->text + in->ntext, e.a.data(), n);
        in->ntext += static_cast<int32_t>(n);
      }
    }
  }
  in->buttons |= heldPad;
  ++pollNo;
}
}  // namespace

#ifdef ZN_HOST_SDL
#define PICK(live_expr, null_expr) (live ? (live_expr) : (null_expr))
void hal_init(const HalConfig* c) { live = c->gfx && !headlessRequested(); if (live) sdl_hal_init(c); else null_hal_init(c); }
void hal_shutdown(void) { if (live) sdl_hal_shutdown(); else null_hal_shutdown(); }
void hal_frame_begin(void) { if (live) sdl_hal_frame_begin(); else null_hal_frame_begin(); }
void hal_frame_end(void) { if (live) sdl_hal_frame_end(); else null_hal_frame_end(); }
void hal_poll_input(HalInput* in) { if (live) sdl_hal_poll_input(in); else { null_hal_poll_input(in); applyScript(in); } }
void hal_present(const HalFrame* f) { if (live) sdl_hal_present(f); else null_hal_present(f); }
void hal_surface_size(int* w, int* h) { if (live) sdl_hal_surface_size(w, h); else null_hal_surface_size(w, h); }
double hal_fixed_dt(void) { return live ? sdl_hal_fixed_dt() : null_hal_fixed_dt(); }
void hal_text_input(int32_t on, float x, float y, float w, float h) { if (live) sdl_hal_text_input(on, x, y, w, h); }
static std::string privateClipboard;
const char* hal_clipboard_get(void) { return live ? sdl_hal_clipboard_get() : privateClipboard.c_str(); }
void hal_clipboard_set(const char* s, size_t n) { if (live) sdl_hal_clipboard_set(s, n); else privateClipboard.assign(s, n); }
void hal_set_cursor(int32_t shape) { if (live) sdl_hal_set_cursor(shape); }
void hal_escape_by_app(int32_t on) { if (live) sdl_hal_escape_by_app(on); }
void hal_escape(void) { if (live) sdl_hal_escape(); }
int32_t hal_pixel_scale(void) { return live ? sdl_hal_pixel_scale() : headlessScale(); }
void* hal_window_handle(void) { return live ? sdl_hal_window_handle() : nullptr; }
#else
void hal_init(const HalConfig* c) { null_hal_init(c); }
void hal_shutdown(void) { null_hal_shutdown(); }
void hal_frame_begin(void) { null_hal_frame_begin(); }
void hal_frame_end(void) { null_hal_frame_end(); }
void hal_poll_input(HalInput* in) { null_hal_poll_input(in); applyScript(in); }
void hal_present(const HalFrame* f) { null_hal_present(f); }
void hal_surface_size(int* w, int* h) { null_hal_surface_size(w, h); }
double hal_fixed_dt(void) { return null_hal_fixed_dt(); }
void hal_text_input(int32_t, float, float, float, float) {}
static std::string privateClipboard;
const char* hal_clipboard_get(void) { return privateClipboard.c_str(); }
void hal_clipboard_set(const char* s, size_t n) { privateClipboard.assign(s, n); }
void hal_set_cursor(int32_t) {}
void hal_escape_by_app(int32_t) {}
void hal_escape(void) {}
int32_t hal_pixel_scale(void) { return headlessScale(); }
void* hal_window_handle(void) { return nullptr; }
#endif
}
