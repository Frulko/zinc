// SDL3 HAL for macos and linux (TGT-MAC-02, D-05): window, renderer, keyboard/mouse input.
#include "hal.h"
#include <SDL3/SDL.h>
#include <stdlib.h>

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
// Test hooks: ZINC_FRAMES=n quits after n frames; ZINC_SHOT=file.bmp saves the last frame.
static long frames_left = -1;
static const char* shot_path;

extern "C" {
void hal_init(const HalConfig* cfg) {
  W = cfg->width; H = cfg->height; gfx_on = cfg->gfx != 0 && !hal_display;  // a display plugin brings its own window
  if (const char* f = getenv("ZINC_FRAMES")) frames_left = atol(f);
  if (!gfx_on) return;
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
  if (!SDL_CreateWindowAndRenderer(cfg->title, W * scale, H * scale, SDL_WINDOW_RESIZABLE | SDL_WINDOW_HIGH_PIXEL_DENSITY, &win, &ren))
    hal_panic(SDL_GetError(), "hal_sdl", __LINE__);
  SDL_SetRenderVSync(ren, 1);
  if (full) { set_fullscreen(true); SDL_SyncWindow(win); }
  if (kiosk) { SDL_HideCursor(); SDL_SetWindowAlwaysOnTop(win, true); }
  // HiDPI: frames are rasterized at the window's pixel size, so text and shapes stay sharp (ZINC_SCALE overrides)
  apply_size();
  SDL_AddEventWatch(watch, nullptr);
  shot_path = getenv("ZINC_SHOT");
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

void hal_poll_input(HalInput* in) {
  if (!gfx_on) return;
  SDL_Event e;
  while (SDL_PollEvent(&e)) {
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
    if (e.type == SDL_EVENT_QUIT && !kiosk) quit = true;
    if (e.type == SDL_EVENT_KEY_DOWN && e.key.scancode == SDL_SCANCODE_ESCAPE && !kiosk) {
      if (SDL_GetWindowFlags(win) & SDL_WINDOW_FULLSCREEN) set_fullscreen(false); else quit = true;
    }
    if (e.type == SDL_EVENT_KEY_DOWN && !kiosk && !e.key.repeat && (e.key.scancode == SDL_SCANCODE_F11 || (e.key.scancode == SDL_SCANCODE_F && (e.key.mod & SDL_KMOD_GUI) && (e.key.mod & SDL_KMOD_CTRL))))
      set_fullscreen(!(SDL_GetWindowFlags(win) & SDL_WINDOW_FULLSCREEN));
    if (e.type == SDL_EVENT_WINDOW_PIXEL_SIZE_CHANGED || e.type == SDL_EVENT_WINDOW_RESIZED) apply_size();
    if (e.type == SDL_EVENT_MOUSE_WHEEL) in->wheel += e.wheel.y;
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
  if (frames_left >= 0 && frames_left-- == 0) quit = true;
  in->quit = quit;
}

// The shared rasterizer renders only the damaged rows; the texture is updated for those rows.
void hal_present(const HalFrame* f) {
  if (!gfx_on || f->w != PW || f->h != PH) return;  // a frame rendered for the previous size
  if (f->y1 > f->y0 && f->x1 > f->x0) {
    (f->render_damage ? f->render_damage : f->render)(fb + (size_t)f->y0 * PW, f->y0, f->y1);  // fb keeps the previous frame
    SDL_Rect r = {0, f->y0, PW, f->y1 - f->y0};
    SDL_UpdateTexture(tex, &r, fb + (size_t)f->y0 * PW, PW * 4);
  }
  SDL_RenderClear(ren);
  SDL_RenderTexture(ren, tex, nullptr, nullptr);
  if (shot_path && frames_left == 0) {
    if (SDL_Surface* sfc = SDL_CreateSurfaceFrom(PW, PH, SDL_PIXELFORMAT_XRGB8888, fb, PW * 4)) { SDL_SaveBMP(sfc, shot_path); SDL_DestroySurface(sfc); }
  }
  SDL_RenderPresent(ren);
}
void hal_surface_size(int* w, int* h) { *w = W; *h = H; }
int32_t hal_pixel_scale(void) { return gfx_on ? K : 1; }
double hal_fixed_dt(void) {
  static double v = getenv("ZINC_FIXED_DT") ? atof(getenv("ZINC_FIXED_DT")) : 0;
  return v;
}
}
