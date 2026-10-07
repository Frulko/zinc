// SDL3 HAL for macos and linux (TGT-MAC-02, D-05): window, renderer, keyboard/mouse input.
#include "hal.h"
#include "hal_window.h"
#include <SDL3/SDL.h>
#include <stdlib.h>
#include <string.h>
#include <condition_variable>
#include <mutex>
#include <thread>

static void start_workers();   // parallel rasterization (hal_present)
static SDL_Window* win;
static SDL_Renderer* ren;
static SDL_Texture* tex;
static uint32_t* fb;
static int W = 320, H = 240;
static int K = 1, PW = 320, PH = 240;  // physical pixels per logical pixel (Retina x window magnification)
static int zoom = 1;
// Window behaviour (zinc.json targets.<id>: resize "fill" | "letterbox", fullscreen, kiosk; ZINC_RESIZE / ZINC_FULLSCREEN /
// ZINC_KIOSK override). fill: the logical surface follows the window (responsive layouts); letterbox: fixed surface, scaled.
static bool fill = false, kiosk = false;
// ZN-233: window properties from zinc.json app.window, the close veto and file drops (runtime/include/hal_window.h)
static HalWindowConfig wcfg;
static bool wcfg_set = false;
static int (*close_handler)(void) = nullptr;
static void (*drop_handler)(const char*, int) = nullptr;
extern "C" void hal_set_window_config(const HalWindowConfig* c) { wcfg = *c; wcfg_set = true; }
extern "C" void hal_set_close_handler(int (*h)(void)) { close_handler = h; }
extern "C" void hal_set_drop_handler(void (*h)(const char*, int)) { drop_handler = h; }

static void alloc_surface() {
  if (tex) SDL_DestroyTexture(tex);
  free(fb);
  SDL_SetRenderLogicalPresentation(ren, PW, PH, SDL_LOGICAL_PRESENTATION_LETTERBOX);
  tex = SDL_CreateTexture(ren, SDL_PIXELFORMAT_XRGB8888, SDL_TEXTUREACCESS_STREAMING, PW, PH);
  SDL_SetTextureScaleMode(tex, SDL_SCALEMODE_LINEAR);
  fb = (uint32_t*)calloc((size_t)PW * PH, 4);
}
/** Recomputes the surface from the window: fill mode follows the window size; both follow the screen density. */
static void apply_size() {
  int ww = W * zoom, wh = H * zoom;
  SDL_GetWindowSize(win, &ww, &wh);
  int nw = W, nh = H;
  if (fill) { nw = ww / zoom > 0 ? ww / zoom : 1; nh = wh / zoom > 0 ? wh / zoom : 1; }
  float density = SDL_GetWindowPixelDensity(win);
  int k = (int)(zoom * (density > 0 ? density : 1) + 0.5f);
  if (const char* ks = getenv("ZINC_SCALE")) k = atoi(ks);
  if (k < 1) k = 1;
  while (k > 1 && (long)nw * k * nh * k > 3840L * 2400L) k--;
  if (nw == W && nh == H && k == K && tex) return;
  W = nw; H = nh; K = k; PW = W * K; PH = H * K;
  alloc_surface();
}
// macOS blocks the event loop during a live resize: redraw from the event watcher so the layout follows the mouse
static bool SDLCALL watch(void*, SDL_Event* e) {
  if (e->type == SDL_EVENT_WINDOW_EXPOSED || e->type == SDL_EVENT_WINDOW_PIXEL_SIZE_CHANGED) { apply_size(); zrt_redraw(); }
  return true;
}
static void set_fullscreen(bool on) { SDL_SetWindowFullscreen(win, on); }
static bool gfx_on;
static bool quit;
static bool escape_app;   // zinc:ui handles Escape (hal_escape_by_app)
// Test hooks: ZINC_FRAMES=n quits after n frames (ZINC_SHOT captures are made by the runtime, runtime/gfx.cpp).
static long frames_left = -1;
// Deterministic runs (ZINC_DETERMINISTIC / ZINC_RECORD / ZINC_REPLAY): fixed surface size, private clipboard.
static bool det = false;

extern "C" {
void hal_init(const HalConfig* cfg) {
  // a display plugin brings its own output, unless it draws through this window (host_window: the e-ink emulator)
  W = cfg->width; H = cfg->height; gfx_on = cfg->gfx != 0 && (!hal_display || hal_display->host_window);
  if (const char* f = getenv("ZINC_FRAMES")) frames_left = atol(f);
  const char* d = getenv("ZINC_DETERMINISTIC");
  det = (d && *d && *d != '0') || getenv("ZINC_RECORD") || getenv("ZINC_REPLAY");
  if (!gfx_on) return;
  // Trackpad scrolling: zinc:ui follows the fingers 1:1 and runs its own inertia from the release velocity, so the
  // OS momentum events are off, and trackpad touches are reported (without mouse emulation) to know when the
  // fingers lift (docs/ui.md, scrolling).
#ifdef SDL_HINT_MAC_SCROLL_MOMENTUM
  SDL_SetHint(SDL_HINT_MAC_SCROLL_MOMENTUM, "0");
#endif
#ifdef SDL_HINT_TRACKPAD_IS_TOUCH_ONLY
  SDL_SetHint(SDL_HINT_TRACKPAD_IS_TOUCH_ONLY, "1");
#endif
  if (!SDL_Init(SDL_INIT_VIDEO)) hal_panic(SDL_GetError(), "hal_sdl", __LINE__);
  // window size in points: zinc.json targets.<id>.zoom (ZINC_ZOOM overrides); auto only enlarges tiny surfaces
#ifdef ZINC_ZOOM
  int scale = ZINC_ZOOM;
#else
  int scale = W <= 400 ? 2 : 1;
#endif
  if (const char* z = getenv("ZINC_ZOOM")) scale = atoi(z);
  if (scale < 1) scale = 1;
  zoom = scale;
#ifdef ZINC_RESIZE_FILL
  fill = true;
#endif
  if (const char* r = getenv("ZINC_RESIZE")) fill = r[0] == 'f';
  if (det) fill = false;  // the layout must not follow the window
  if (hal_display) fill = false;   // an emulated device (host_window driver) has a fixed panel: letterbox it
  bool full = false;
#ifdef ZINC_FULLSCREEN
  full = true;
#endif
#ifdef ZINC_KIOSK
  kiosk = true;
#endif
  if (const char* v = getenv("ZINC_FULLSCREEN")) full = v[0] == '1';
  if (const char* v = getenv("ZINC_KIOSK")) kiosk = v[0] == '1';
  if (kiosk) full = true;
  // a surface taller or wider than the screen (a 1620x2160 tablet) opens scaled down to fit, keeping its proportions
  // (the OS would only clamp one side)
  int ww = W * scale, wh = H * scale;
  SDL_Rect usable;
  if (SDL_GetDisplayUsableBounds(SDL_GetPrimaryDisplay(), &usable) && usable.w > 0 && usable.h > 0) {
    const float fit = SDL_min(usable.w * 0.9f / ww, usable.h * 0.9f / wh);
    if (fit < 1) { ww = (int)(ww * fit); wh = (int)(wh * fit); }
  }
  if (!wcfg_set) {
    if (!SDL_CreateWindowAndRenderer(cfg->title, ww, wh, SDL_WINDOW_RESIZABLE | SDL_WINDOW_HIGH_PIXEL_DENSITY, &win, &ren))
      hal_panic(SDL_GetError(), "hal_sdl", __LINE__);
  } else {   // window properties of the app (frameless, always on top, position, minimum size, transparent)
    SDL_PropertiesID props = SDL_CreateProperties();
    SDL_SetStringProperty(props, SDL_PROP_WINDOW_CREATE_TITLE_STRING, wcfg.title[0] ? wcfg.title : cfg->title);
    SDL_SetNumberProperty(props, SDL_PROP_WINDOW_CREATE_WIDTH_NUMBER, ww);
    SDL_SetNumberProperty(props, SDL_PROP_WINDOW_CREATE_HEIGHT_NUMBER, wh);
    SDL_SetBooleanProperty(props, SDL_PROP_WINDOW_CREATE_RESIZABLE_BOOLEAN, !wcfg.not_resizable);
    SDL_SetBooleanProperty(props, SDL_PROP_WINDOW_CREATE_HIGH_PIXEL_DENSITY_BOOLEAN, true);
    SDL_SetBooleanProperty(props, SDL_PROP_WINDOW_CREATE_BORDERLESS_BOOLEAN, wcfg.borderless != 0);
    SDL_SetBooleanProperty(props, SDL_PROP_WINDOW_CREATE_ALWAYS_ON_TOP_BOOLEAN, wcfg.always_on_top != 0);
    SDL_SetBooleanProperty(props, SDL_PROP_WINDOW_CREATE_TRANSPARENT_BOOLEAN, wcfg.transparent != 0);
    if (wcfg.has_position) { SDL_SetNumberProperty(props, SDL_PROP_WINDOW_CREATE_X_NUMBER, wcfg.x); SDL_SetNumberProperty(props, SDL_PROP_WINDOW_CREATE_Y_NUMBER, wcfg.y); }
    win = SDL_CreateWindowWithProperties(props);
    SDL_DestroyProperties(props);
    if (!win || !(ren = SDL_CreateRenderer(win, nullptr))) hal_panic(SDL_GetError(), "hal_sdl", __LINE__);
    if (wcfg.min_w > 0 || wcfg.min_h > 0) SDL_SetWindowMinimumSize(win, wcfg.min_w, wcfg.min_h);
  }
  // a fixed surface (letterbox) keeps its proportions while the window is resized, so it never shows bars
  if (!fill) { const float a = (float)W / (float)H; SDL_SetWindowAspectRatio(win, a, a); }
  SDL_SetRenderVSync(ren, 1);
  start_workers();
  if (full) { set_fullscreen(true); SDL_SyncWindow(win); }
  if (kiosk) { SDL_HideCursor(); SDL_SetWindowAlwaysOnTop(win, true); }
  // HiDPI: frames are rasterized at the window's pixel size, so text and shapes stay sharp (ZINC_SCALE overrides)
  apply_size();
  SDL_AddEventWatch(watch, nullptr);
}
void hal_shutdown(void) {
  if (!gfx_on) return;
  SDL_DestroyRenderer(ren);
  SDL_DestroyWindow(win);
  SDL_Quit();
}
void hal_frame_begin(void) {}
void hal_frame_end(void) {}

// Pen: SDL pen events (Wacom, tablets); the mouse stands in for a pen (left = draw, right = eraser, pressure 0.5).
static HalPen pen;
static void pen_push(float wx, float wy, uint32_t flags) {
  if (ren) SDL_RenderCoordinatesFromWindow(ren, wx, wy, &wx, &wy);
  pen.x = wx / K; pen.y = wy / K; pen.flags = flags;
  hal_pen_push(&pen);
}
static uint32_t pen_flags(SDL_PenInputFlags s) {
  return ((s & SDL_PEN_INPUT_DOWN) ? HAL_PEN_DOWN : HAL_PEN_HOVER) | ((s & SDL_PEN_INPUT_ERASER_TIP) ? HAL_PEN_ERASER : 0);
}

// Keyboard: SDL keycodes are layout-aware; printable keys are their (lowercase) ASCII code.
static int32_t key_code(SDL_Keycode k) {
  if (k >= 32 && k < 127) return (int32_t)k;
  switch (k) {
    case SDLK_BACKSPACE: return HAL_KEY_BACKSPACE;
    case SDLK_DELETE: return HAL_KEY_DELETE;
    case SDLK_RETURN: case SDLK_KP_ENTER: return HAL_KEY_ENTER;
    case SDLK_TAB: return HAL_KEY_TAB;
    case SDLK_ESCAPE: return HAL_KEY_ESCAPE;
    case SDLK_LEFT: return HAL_KEY_ARROW_LEFT;
    case SDLK_RIGHT: return HAL_KEY_ARROW_RIGHT;
    case SDLK_UP: return HAL_KEY_ARROW_UP;
    case SDLK_DOWN: return HAL_KEY_ARROW_DOWN;
    case SDLK_HOME: return HAL_KEY_HOME;
    case SDLK_END: return HAL_KEY_END;
    case SDLK_PAGEUP: return HAL_KEY_PAGEUP;
    case SDLK_PAGEDOWN: return HAL_KEY_PAGEDOWN;
    default: break;
  }
  if (k >= SDLK_F1 && k <= SDLK_F12) return HAL_KEY_F1 + (int32_t)(k - SDLK_F1);
  return 0;
}
static uint32_t mods_of(SDL_Keymod m) {
  return ((m & SDL_KMOD_SHIFT) ? HAL_MOD_SHIFT : 0) | ((m & SDL_KMOD_CTRL) ? HAL_MOD_CTRL : 0) | ((m & SDL_KMOD_ALT) ? HAL_MOD_ALT : 0) | ((m & SDL_KMOD_GUI) ? HAL_MOD_META : 0);
}
static void key_push(HalInput* in, int32_t key, int32_t kind, SDL_Keymod mod, const char* text) {
  if (in->nkeys == HAL_MAX_KEYS) return;
  HalKey& k = in->keys[in->nkeys];
  k = HalKey{key, mods_of(mod), kind, 0, 0};
  if (text) {
    size_t n = strlen(text);
    if (in->ntext + n > HAL_TEXT_BYTES) return;
    memcpy(in->text + in->ntext, text, n);
    k.off = (uint16_t)in->ntext; k.len = (uint16_t)n; in->ntext += (int32_t)n;
  }
  in->nkeys++;
}

// ---- precise scrolling: timestamped cumulative deltas, resampled at frame time (Chromium / Android style:
// sample time = now - 5 ms, linear between the two bracketing events, extrapolation capped at 8 ms)
struct ScrollSample { uint64_t t; double x, y; };
static ScrollSample ss[32];
static int nss = 0;
static double cum_x, cum_y, out_x, out_y;
static bool gesture = false, saw_fingers = false;
static int tp_fingers = 0, tp_fingers_prev = 0;
static uint64_t last_precise_us = 0;
static void scroll_push(uint64_t t, double dx, double dy) {
  cum_x += dx; cum_y += dy;
  if (nss == 32) { memmove(ss, ss + 1, sizeof(ss[0]) * 31); nss--; }
  ss[nss++] = ScrollSample{t, cum_x, cum_y};
}
static void scroll_resample(HalInput* in) {
  in->scroll_dx = in->scroll_dy = 0; in->scroll_phase = 0;
  const bool touched = tp_fingers > 0 && tp_fingers_prev == 0;
  tp_fingers_prev = tp_fingers;
  if (!gesture) { if (touched) in->scroll_phase = 3; return; }   // fingers landed: catches a running inertia
  const uint64_t now = SDL_GetTicksNS() / 1000;
  const bool lifted = saw_fingers ? (tp_fingers == 0) : (now - last_precise_us > 50000);
  double x = cum_x, y = cum_y;
  if (!lifted && nss > 0) {
    uint64_t ts = now > 5000 ? now - 5000 : 0;
    const ScrollSample& last = ss[nss - 1];
    if (nss >= 2 && ts > last.t) {   // extrapolate a little past the newest event
      const ScrollSample& prev = ss[nss - 2];
      uint64_t span = last.t - prev.t, ahead = ts - last.t, cap = span / 2 < 8000 ? span / 2 : 8000;
      if (ahead > cap) ahead = cap;
      double k = span ? (double)ahead / (double)span : 0;
      x = last.x + (last.x - prev.x) * k; y = last.y + (last.y - prev.y) * k;
    } else if (ts <= ss[0].t) {
      x = out_x; y = out_y;   // no event old enough yet
    } else {
      int i = nss - 1;
      while (i > 0 && ss[i - 1].t > ts) i--;
      const ScrollSample& a = ss[i > 0 ? i - 1 : 0]; const ScrollSample& b = ss[i];
      double k = b.t > a.t ? (double)(ts - a.t) / (double)(b.t - a.t) : 1;
      x = a.x + (b.x - a.x) * k; y = a.y + (b.y - a.y) * k;
    }
  }
  in->scroll_dx = (float)(x - out_x); in->scroll_dy = (float)(y - out_y);
  out_x = x; out_y = y;
  in->scroll_phase = lifted ? 2 : 1;
  if (lifted) { gesture = false; nss = 0; cum_x = cum_y = out_x = out_y = 0; }
}

void hal_poll_input(HalInput* in) {
  in->nkeys = 0; in->ntext = 0; in->nbtn = 0; in->wheel_x = 0;
  // A display plugin with its own window (LED / OLED / e-ink emulators) still needs this HAL to pump the OS events,
  // unless it reads them itself (display-gl).
  if (!gfx_on && (!hal_display || hal_display->owns_input || !SDL_WasInit(SDL_INIT_VIDEO))) {
    if (frames_left >= 0 && frames_left-- == 0) quit = true;
    in->quit = quit;
    return;
  }
  SDL_Event e;
  while (SDL_PollEvent(&e)) {
    if (e.type == SDL_EVENT_KEY_DOWN || e.type == SDL_EVENT_KEY_UP) {
      if (int32_t k = key_code(e.key.key)) key_push(in, k, e.type == SDL_EVENT_KEY_UP ? HAL_KEY_UP : e.key.repeat ? HAL_KEY_REPEAT : HAL_KEY_DOWN, e.key.mod, nullptr);
    }
    if (e.type == SDL_EVENT_TEXT_INPUT) key_push(in, 0, HAL_KEY_TEXT, SDL_GetModState(), e.text.text);
    if ((e.type == SDL_EVENT_MOUSE_BUTTON_DOWN || e.type == SDL_EVENT_MOUSE_BUTTON_UP) && in->nbtn < HAL_MAX_BUTTON_EVENTS) {
      HalButtonEvent& b = in->btn[in->nbtn++];
      float bx = e.button.x, by = e.button.y;
      if (ren) SDL_RenderCoordinatesFromWindow(ren, bx, by, &bx, &by);
      b.x = bx / K; b.y = by / K;
      b.button = e.button.button == SDL_BUTTON_RIGHT ? 2 : e.button.button == SDL_BUTTON_MIDDLE ? 1 : 0;
      b.down = e.button.down;
    }
    if (e.type == SDL_EVENT_MOUSE_WHEEL) {
      // notches are whole steps outside a trackpad gesture; anything else is precise (px = delta * 10 on macOS)
      const bool precise = tp_fingers > 0 || gesture || e.wheel.y != SDL_floorf(e.wheel.y) || e.wheel.x != SDL_floorf(e.wheel.x);
      if (precise) {
        const uint64_t t = e.wheel.timestamp / 1000;
        if (!gesture) { gesture = true; nss = 0; cum_x = cum_y = out_x = out_y = 0; scroll_push(t > 16000 ? t - 16000 : 0, 0, 0); }
        scroll_push(t, e.wheel.x * 10, e.wheel.y * 10);
        last_precise_us = SDL_GetTicksNS() / 1000;
      } else { in->wheel_x += e.wheel.x; in->wheel += e.wheel.y; }
    }
    // trackpad fingers (indirect touch devices, SDL_HINT_TRACKPAD_IS_TOUCH_ONLY): how many are down
    if ((e.type == SDL_EVENT_FINGER_DOWN || e.type == SDL_EVENT_FINGER_UP || e.type == SDL_EVENT_FINGER_CANCELED) &&
        SDL_GetTouchDeviceType(e.tfinger.touchID) != SDL_TOUCH_DEVICE_DIRECT) {
      int n = 0;
      if (SDL_Finger** f = SDL_GetTouchFingers(e.tfinger.touchID, &n)) SDL_free(f);
      tp_fingers = e.type == SDL_EVENT_FINGER_DOWN ? (n > 0 ? n : 1) : n;
      saw_fingers = true;
    }
    if (e.type == SDL_EVENT_PEN_AXIS) {
      if (e.paxis.axis == SDL_PEN_AXIS_PRESSURE) pen.pressure = e.paxis.value;
      if (e.paxis.axis == SDL_PEN_AXIS_XTILT) pen.tilt_x = e.paxis.value;
      if (e.paxis.axis == SDL_PEN_AXIS_YTILT) pen.tilt_y = e.paxis.value;
    }
    if (e.type == SDL_EVENT_PEN_MOTION) pen_push(e.pmotion.x, e.pmotion.y, pen_flags(e.pmotion.pen_state));
    if (e.type == SDL_EVENT_PEN_DOWN || e.type == SDL_EVENT_PEN_UP)
      pen_push(e.ptouch.x, e.ptouch.y, (e.ptouch.down ? HAL_PEN_DOWN : HAL_PEN_HOVER) | (e.ptouch.eraser ? HAL_PEN_ERASER : 0));
    if (e.type == SDL_EVENT_MOUSE_MOTION || e.type == SDL_EVENT_MOUSE_BUTTON_DOWN || e.type == SDL_EVENT_MOUSE_BUTTON_UP) {
      const bool motion = e.type == SDL_EVENT_MOUSE_MOTION;
      const SDL_MouseID which = motion ? e.motion.which : e.button.which;
      uint32_t f = motion ? ((e.motion.state & SDL_BUTTON_LMASK) ? HAL_PEN_DOWN : (e.motion.state & SDL_BUTTON_RMASK) ? HAL_PEN_DOWN | HAL_PEN_ERASER : 0)
                          : (e.button.button == SDL_BUTTON_LEFT || e.button.button == SDL_BUTTON_RIGHT)
                              ? (e.button.down ? HAL_PEN_DOWN : HAL_PEN_HOVER) | (e.button.button == SDL_BUTTON_RIGHT ? HAL_PEN_ERASER : 0) : 0;
      if (f && which != SDL_PEN_MOUSEID && which != SDL_TOUCH_MOUSEID) {
        pen.pressure = 0.5f; pen.tilt_x = pen.tilt_y = 0;
        pen_push(motion ? e.motion.x : e.button.x, motion ? e.motion.y : e.button.y, f);
      }
    }
    // kiosk: no way out from the keyboard or the window (stop the process or its service instead)
    if (e.type == SDL_EVENT_QUIT && !kiosk && (!close_handler || close_handler())) quit = true;   // a handler may veto (close to tray)
    if (drop_handler && (e.type == SDL_EVENT_DROP_FILE || e.type == SDL_EVENT_DROP_TEXT) && e.drop.data) drop_handler(e.drop.data, e.type == SDL_EVENT_DROP_TEXT);
    // not while a text field has the keyboard: Escape blurs the field first
    if (e.type == SDL_EVENT_KEY_DOWN && e.key.scancode == SDL_SCANCODE_ESCAPE && !escape_app && !(win && SDL_TextInputActive(win))) hal_escape();
    if (gfx_on && e.type == SDL_EVENT_KEY_DOWN && !kiosk && !e.key.repeat && (e.key.scancode == SDL_SCANCODE_F11 || (e.key.scancode == SDL_SCANCODE_F && (e.key.mod & SDL_KMOD_GUI) && (e.key.mod & SDL_KMOD_CTRL))))
      set_fullscreen(!(SDL_GetWindowFlags(win) & SDL_WINDOW_FULLSCREEN));
    if (gfx_on && (e.type == SDL_EVENT_WINDOW_PIXEL_SIZE_CHANGED || e.type == SDL_EVENT_WINDOW_RESIZED)) apply_size();
    if (e.type == SDL_EVENT_PINCH_UPDATE) in->pinch *= e.pinch.scale;
    // touch screens only: trackpad fingers (indirect devices) are the pointer, not screen touches
    if ((e.type == SDL_EVENT_FINGER_DOWN || e.type == SDL_EVENT_FINGER_MOTION) && SDL_GetTouchDeviceType(e.tfinger.touchID) == SDL_TOUCH_DEVICE_DIRECT) {
      int32_t id = (int32_t)e.tfinger.fingerID, k = 0;
      while (k < in->ntouch && in->touch[k].id != id) k++;
      if (k == in->ntouch && k < HAL_MAX_TOUCH) in->ntouch++;
      int ww, wh;
      float tx = e.tfinger.x * W, ty = e.tfinger.y * H;
      if (SDL_GetWindowSize(win, &ww, &wh)) { SDL_RenderCoordinatesFromWindow(ren, e.tfinger.x * ww, e.tfinger.y * wh, &tx, &ty); tx /= K; ty /= K; }  // letterbox
      if (k < HAL_MAX_TOUCH) in->touch[k] = HalTouch{id, tx, ty};
    }
    if (e.type == SDL_EVENT_FINGER_UP || e.type == SDL_EVENT_FINGER_CANCELED) {
      for (int32_t k = 0; k < in->ntouch; k++) if (in->touch[k].id == (int32_t)e.tfinger.fingerID) { in->touch[k] = in->touch[--in->ntouch]; break; }
    }
  }
  scroll_resample(in);
  const bool* k = SDL_GetKeyboardState(nullptr);
  uint32_t b = 0;
  if (k[SDL_SCANCODE_UP] || k[SDL_SCANCODE_W]) b |= HAL_UP;
  if (k[SDL_SCANCODE_DOWN] || k[SDL_SCANCODE_S]) b |= HAL_DOWN;
  if (k[SDL_SCANCODE_LEFT] || k[SDL_SCANCODE_A]) b |= HAL_LEFT;
  if (k[SDL_SCANCODE_RIGHT] || k[SDL_SCANCODE_D]) b |= HAL_RIGHT;
  if (k[SDL_SCANCODE_SPACE] || k[SDL_SCANCODE_Z]) b |= HAL_A;
  if (k[SDL_SCANCODE_X]) b |= HAL_B;
  if (k[SDL_SCANCODE_C]) b |= HAL_X;
  if (k[SDL_SCANCODE_V]) b |= HAL_Y;
  if (k[SDL_SCANCODE_Q]) b |= HAL_L;
  if (k[SDL_SCANCODE_E]) b |= HAL_R;
  if (k[SDL_SCANCODE_RETURN]) b |= HAL_START;
  if (k[SDL_SCANCODE_TAB]) b |= HAL_SELECT;
  in->buttons = b;
  float mx, my;
  SDL_MouseButtonFlags mb = SDL_GetMouseState(&mx, &my);
  if (ren) { SDL_RenderCoordinatesFromWindow(ren, mx, my, &mx, &my); mx /= K; my /= K; }
  in->px = mx; in->py = my; in->pdown = (mb & SDL_BUTTON_LMASK) != 0;
  in->pbuttons = ((mb & SDL_BUTTON_LMASK) ? 1u : 0u) | ((mb & SDL_BUTTON_RMASK) ? 2u : 0u) | ((mb & SDL_BUTTON_MMASK) ? 4u : 0u);
  in->mods = mods_of(SDL_GetModState());
  if (frames_left >= 0 && frames_left-- == 0) quit = true;
  in->quit = quit;
}

// Parallel rasterization: the damaged rows are split into horizontal bands, one per core; each band renders the
// whole command list clipped to its rows (the rasterizer keeps its scratch buffers per thread), so the pixels are
// the same as a single-threaded render. ZINC_RENDER_THREADS=n overrides the count (1: no worker threads).
static void (*band_fn)(uint32_t*, int32_t, int32_t);
static int32_t band_y0, band_y1, band_count, workers, band_pending;
static unsigned band_gen;
static std::mutex band_mu;
static std::condition_variable band_go, band_done;
// profiler hooks (runtime/gfx.cpp): band spans for the raster phase and the trace; no-ops without zinc:gfx
extern "C" __attribute__((weak)) int32_t zrt_profiling(void) { return 0; }
extern "C" __attribute__((weak)) void zrt_prof_band(int32_t, uint64_t, uint64_t) {}
static bool band_prof;
static void run_band(int i) {
  int32_t rows = band_y1 - band_y0, a = band_y0 + rows * i / band_count, b = band_y0 + rows * (i + 1) / band_count;
  uint64_t t0 = band_prof ? hal_time_us() : 0;
  if (b > a) band_fn(fb + (size_t)a * PW, a, b);
  if (band_prof) zrt_prof_band(i, t0, hal_time_us());
}
static void band_worker(int id) {
  unsigned seen = 0;
  for (;;) {
    std::unique_lock<std::mutex> l(band_mu);
    band_go.wait(l, [&] { return band_gen != seen; });
    seen = band_gen;
    l.unlock();
    run_band(id);
    l.lock();
    if (--band_pending == 0) band_done.notify_one();
  }
}
static void start_workers() {
  static bool started = false;
  if (started) return;
  started = true;
  const char* e = getenv("ZINC_RENDER_THREADS");
  int n = e ? atoi(e) : SDL_GetNumLogicalCPUCores();
  if (n > 8) n = 8;   // ponytail: memory bandwidth, not cores, limits past ~8 bands
  for (int i = 1; i < n; i++) std::thread(band_worker, i).detach();
  workers = n > 1 ? n - 1 : 0;
}
static void render_rows_parallel(void (*fn)(uint32_t*, int32_t, int32_t), int32_t y0, int32_t y1) {
  band_prof = zrt_profiling() != 0;
  if (workers == 0 || y1 - y0 < 32 * (workers + 1)) {
    uint64_t t0 = band_prof ? hal_time_us() : 0;
    fn(fb + (size_t)y0 * PW, y0, y1);
    if (band_prof) zrt_prof_band(0, t0, hal_time_us());
    return;
  }
  {
    std::lock_guard<std::mutex> l(band_mu);
    band_fn = fn; band_y0 = y0; band_y1 = y1; band_count = workers + 1; band_pending = workers; band_gen++;
  }
  band_go.notify_all();
  run_band(0);
  std::unique_lock<std::mutex> l(band_mu);
  band_done.wait(l, [] { return band_pending == 0; });
}

// The shared rasterizer renders only the damaged rows; the texture is updated for those rows.
void hal_present(const HalFrame* f) {
  if (!gfx_on) return;
  if (f->w != PW || f->h != PH) {   // a frame rendered for the previous size (live resize): expected once in a while
    static int dropped = 0;
    if (++dropped == 30) {   // many in a row means a size mismatch, not a resize: say so instead of a black window
      char b[160];
      snprintf(b, sizeof b, "zinc: frames of %dx%d do not fit the %dx%d window surface; nothing is shown\n", f->w, f->h, PW, PH);
      hal_log_err(b, strlen(b));
    }
    return;
  }
  if (f->y1 > f->y0 && f->x1 > f->x0) {
    render_rows_parallel(f->render_damage ? f->render_damage : f->render, f->y0, f->y1);  // fb keeps the previous frame
    SDL_Rect r = {0, f->y0, PW, f->y1 - f->y0};
    SDL_UpdateTexture(tex, &r, fb + (size_t)f->y0 * PW, PW * 4);
  }
  SDL_RenderClear(ren);
  SDL_RenderTexture(ren, tex, nullptr, nullptr);
  SDL_RenderPresent(ren);
}
void hal_surface_size(int* w, int* h) { *w = W; *h = H; }
// Text input (IME candidate window next to the field), clipboard, cursor shapes.
void hal_text_input(int32_t on, float x, float y, float w, float h) {
  if (!gfx_on) return;
  if (!on) { SDL_StopTextInput(win); return; }
  float x0 = x * K, y0 = y * K, x1 = (x + w) * K, y1 = (y + h) * K;
  SDL_RenderCoordinatesToWindow(ren, x0, y0, &x0, &y0);
  SDL_RenderCoordinatesToWindow(ren, x1, y1, &x1, &y1);
  SDL_Rect r = {(int)x0, (int)y0, (int)(x1 - x0), (int)(y1 - y0)};
  SDL_SetTextInputArea(win, &r, 0);
  SDL_StartTextInput(win);
}
// ZINC_CLIPBOARD=local (set by `zinc test`) or a deterministic run: a process-local clipboard, so test runs never
// touch the user's one
static char* clip_local;
static bool clip_is_local() { const char* c = getenv("ZINC_CLIPBOARD"); return !gfx_on || det || (c && !strcmp(c, "local")); }
const char* hal_clipboard_get(void) {
  static char* last;
  if (clip_is_local()) return clip_local ? clip_local : "";
  SDL_free(last);
  last = SDL_GetClipboardText();
  return last ? last : "";
}
void hal_clipboard_set(const char* s, size_t n) {
  char* t = (char*)malloc(n + 1);
  if (!t) return;
  memcpy(t, s, n); t[n] = 0;
  if (clip_is_local()) { free(clip_local); clip_local = t; return; }
  SDL_SetClipboardText(t);
  free(t);
}
void hal_escape_by_app(int32_t on) { escape_app = on != 0; }
void hal_escape(void) {
  if (kiosk) return;
  if (win && (SDL_GetWindowFlags(win) & SDL_WINDOW_FULLSCREEN)) set_fullscreen(false); else quit = true;
}
void hal_set_cursor(int32_t shape) {
  static SDL_Cursor* cache[10];
  static const SDL_SystemCursor sys[10] = {SDL_SYSTEM_CURSOR_DEFAULT, SDL_SYSTEM_CURSOR_TEXT, SDL_SYSTEM_CURSOR_POINTER, SDL_SYSTEM_CURSOR_MOVE,
    SDL_SYSTEM_CURSOR_EW_RESIZE, SDL_SYSTEM_CURSOR_NS_RESIZE, SDL_SYSTEM_CURSOR_CROSSHAIR,
    SDL_SYSTEM_CURSOR_MOVE, SDL_SYSTEM_CURSOR_MOVE,  // grab / grabbing: SDL has no hand-grab cursor
    SDL_SYSTEM_CURSOR_NOT_ALLOWED};
  if (!gfx_on || shape < 0 || shape >= 10) return;
  if (!cache[shape]) cache[shape] = SDL_CreateSystemCursor(sys[shape]);
  if (cache[shape]) SDL_SetCursor(cache[shape]);
}
int32_t hal_pixel_scale(void) { return gfx_on ? K : 1; }
void* hal_window_handle(void) { return win; }
double hal_fixed_dt(void) {
  static double v = getenv("ZINC_FIXED_DT") ? atof(getenv("ZINC_FIXED_DT")) : 0;
  return v;
}
}
