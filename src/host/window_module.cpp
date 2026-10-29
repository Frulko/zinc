// The window host as a module (ZN-592.01): zinc does not link SDL3, the window HAL (targets/macos/hal_sdl.cpp) or the GUI frameworks
// (AppKit, Metal, QuartzCore...); they live in libzn_window beside it (or $ZINC_WINDOW_LIB), loaded with RTLD_GLOBAL at the first window,
// so zinc --version, check, build and console programs load none of them. Compiled programs link the window host (zn_host_window).
// The sdl_hal_* functions src/host/hal_dispatch.cpp calls and the hal_window.h setters forward to the module; the setters keep what they
// were given until it is loaded. The display drivers, zinc:3d and libzn_webgl resolve SDL3 from the module: zn_window_load() first.
#include <dlfcn.h>
#include <stdio.h>
#include <stdlib.h>

#include <filesystem>
#include <string>

#include "hal.h"
#include "hal_window.h"
#include "tc/tc.h"

namespace {
struct Win {
  void (*init)(const HalConfig*); void (*shutdown)(void); void (*frameBegin)(void); void (*frameEnd)(void); void (*pollInput)(HalInput*);
  void (*present)(const HalFrame*); void (*surfaceSize)(int*, int*); double (*fixedDt)(void); void (*textInput)(int32_t, float, float, float, float);
  const char* (*clipboardGet)(void); void (*clipboardSet)(const char*, size_t); void (*setCursor)(int32_t); void (*escapeByApp)(int32_t);
  void (*escape)(void); int32_t (*pixelScale)(void); void* (*windowHandle)(void);
  void (*setWindowConfig)(const HalWindowConfig*); void (*setResize)(int32_t); void (*setClose)(int (*)(void)); void (*setDrop)(void (*)(const char*, int));
  int32_t (*winOpen)(int32_t, const char*, int32_t, int32_t); void (*winClose)(int32_t); int32_t (*winState)(int32_t);
  void (*winInput)(int32_t, HalInput*, int32_t*, int32_t*); void (*winPresent)(int32_t, const uint32_t*, int32_t, int32_t); void (*winCurrent)(int32_t);
};
Win w;
int state;   // 0 not tried, 1 loaded, -1 missing
HalWindowConfig config;
bool configSet;
int32_t resizeOn = -1;
int (*closeHandler)(void);
void (*dropHandler)(const char*, int);

template <class F> bool sym(void* h, const char* name, F& f) { f = reinterpret_cast<F>(dlsym(h, name)); return f != nullptr; }
}  // namespace

std::string fusedWindowModule();   // src/main.cpp: the module a fused executable carries, written into the cache

extern "C" int zn_window_load(void) {
  if (state) return state > 0;
  state = -1;
  const char* env = getenv("ZINC_WINDOW_LIB");
  std::string path = env && *env ? std::string(env) : (std::filesystem::path(zn::tc::executablePath()).parent_path() / "libzn_window.dylib").string();
  std::error_code ec;
  if (!(env && *env) && !std::filesystem::exists(path, ec)) { const std::string fused = fusedWindowModule(); if (!fused.empty()) path = fused; }
  void* h = dlopen(path.c_str(), RTLD_NOW | RTLD_GLOBAL);
  if (!h) { fprintf(stderr, "zinc: no window (the program runs headless): %s\n", dlerror()); return 0; }
  const bool ok = sym(h, "sdl_hal_init", w.init) && sym(h, "sdl_hal_shutdown", w.shutdown) && sym(h, "sdl_hal_frame_begin", w.frameBegin) &&
    sym(h, "sdl_hal_frame_end", w.frameEnd) && sym(h, "sdl_hal_poll_input", w.pollInput) && sym(h, "sdl_hal_present", w.present) &&
    sym(h, "sdl_hal_surface_size", w.surfaceSize) && sym(h, "sdl_hal_fixed_dt", w.fixedDt) && sym(h, "sdl_hal_text_input", w.textInput) &&
    sym(h, "sdl_hal_clipboard_get", w.clipboardGet) && sym(h, "sdl_hal_clipboard_set", w.clipboardSet) && sym(h, "sdl_hal_set_cursor", w.setCursor) &&
    sym(h, "sdl_hal_escape_by_app", w.escapeByApp) && sym(h, "sdl_hal_escape", w.escape) && sym(h, "sdl_hal_pixel_scale", w.pixelScale) &&
    sym(h, "sdl_hal_window_handle", w.windowHandle) && sym(h, "hal_set_window_config", w.setWindowConfig) && sym(h, "hal_set_resize", w.setResize) &&
    sym(h, "hal_set_close_handler", w.setClose) && sym(h, "hal_set_drop_handler", w.setDrop) && sym(h, "sdl_hal_win_open", w.winOpen) &&
    sym(h, "sdl_hal_win_close", w.winClose) && sym(h, "sdl_hal_win_state", w.winState) && sym(h, "sdl_hal_win_input", w.winInput) &&
    sym(h, "sdl_hal_win_present", w.winPresent) && sym(h, "sdl_hal_win_current", w.winCurrent);
  if (!ok) { fprintf(stderr, "zinc: no window (the program runs headless): %s is not zinc's window module\n", path.c_str()); return 0; }
  state = 1;
  if (configSet) w.setWindowConfig(&config);
  if (resizeOn >= 0) w.setResize(resizeOn);
  if (closeHandler) w.setClose(closeHandler);
  if (dropHandler) w.setDrop(dropHandler);
  return 1;
}

extern "C" {
void sdl_hal_init(const HalConfig* c) { w.init(c); }   // hal_dispatch.cpp calls these only once zn_window_load() succeeded
void sdl_hal_shutdown(void) { w.shutdown(); }
void sdl_hal_frame_begin(void) { w.frameBegin(); }
void sdl_hal_frame_end(void) { w.frameEnd(); }
void sdl_hal_poll_input(HalInput* in) { w.pollInput(in); }
void sdl_hal_present(const HalFrame* f) { w.present(f); }
void sdl_hal_surface_size(int* a, int* b) { w.surfaceSize(a, b); }
double sdl_hal_fixed_dt(void) { return w.fixedDt(); }
void sdl_hal_text_input(int32_t on, float x, float y, float ww, float hh) { w.textInput(on, x, y, ww, hh); }
const char* sdl_hal_clipboard_get(void) { return w.clipboardGet(); }
void sdl_hal_clipboard_set(const char* s, size_t n) { w.clipboardSet(s, n); }
void sdl_hal_set_cursor(int32_t shape) { w.setCursor(shape); }
void sdl_hal_escape_by_app(int32_t on) { w.escapeByApp(on); }
void sdl_hal_escape(void) { w.escape(); }
int32_t sdl_hal_pixel_scale(void) { return w.pixelScale(); }
void* sdl_hal_window_handle(void) { return w.windowHandle(); }
int32_t sdl_hal_win_open(int32_t id, const char* t, int32_t ww, int32_t hh) { return w.winOpen(id, t, ww, hh); }
void sdl_hal_win_close(int32_t id) { w.winClose(id); }
int32_t sdl_hal_win_state(int32_t id) { return w.winState(id); }
void sdl_hal_win_input(int32_t id, HalInput* in, int32_t* ww, int32_t* hh) { w.winInput(id, in, ww, hh); }
void sdl_hal_win_present(int32_t id, const uint32_t* px, int32_t pw, int32_t ph) { w.winPresent(id, px, pw, ph); }
void sdl_hal_win_current(int32_t id) { w.winCurrent(id); }
void hal_set_window_config(const HalWindowConfig* c) { config = *c; configSet = true; if (state > 0) w.setWindowConfig(c); }
void hal_set_resize(int32_t on) { resizeOn = on; if (state > 0) w.setResize(on); }
extern int (*zn_null_close_handler)(void);   // src/host/hal_dispatch.cpp: the headless window's `close` (ZINC_INPUT) asks the handler too
void hal_set_close_handler(int (*h)(void)) { closeHandler = h; zn_null_close_handler = h; if (state > 0) w.setClose(h); }
void hal_set_drop_handler(void (*h)(const char*, int)) { dropHandler = h; if (state > 0) w.setDrop(h); }
}
