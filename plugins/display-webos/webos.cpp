// display-webos: a Zinc program as a full-screen card of HP webOS 3 (HP TouchPad; docs/reports/hardware/hp-touchpad-webos.md).
// webOS gives a native program its screen and its touches through Palm's SDL 1.2: LunaSysMgr composes the card. The library is
// loaded from the device when the program starts, and the few functions and structures used are declared here (the ABI of SDL 1.2
// is frozen), so a cross build needs neither the PDK nor a sysroot. Frames come from the software rasterizer, drawn in bands on every
// core; a surface smaller than the screen is centred, not scaled. Not on webOS (no libSDL-1.2.so.0, no screen): init returns 0 and the target HAL keeps
// the screen.
#include "hal.h"
#include "render_bands.h"
#include <dlfcn.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <unistd.h>

#ifndef ZP_DISPLAY_WEBOS_FPS
#define ZP_DISPLAY_WEBOS_FPS 60
#endif

namespace {
// SDL 1.2: the start of each structure, as far as it is read
struct SdlFormat { void* palette; uint8_t bits, bytes, loss[4], shift[4]; uint32_t rmask, gmask, bmask, amask; };
struct SdlSurface { uint32_t flags; SdlFormat* format; int w, h; uint16_t pitch; void* pixels; };
union SdlEvent {
  uint8_t type;
  struct { uint8_t type, which, state; uint16_t x, y; int16_t xrel, yrel; } motion;
  struct { uint8_t type, which, button, state; uint16_t x, y; } button;
  uint8_t room[64];
};
enum : uint32_t { SDL_INIT_VIDEO = 0x20 };
enum : uint8_t { SDL_MOUSEMOTION = 4, SDL_MOUSEBUTTONDOWN = 5, SDL_MOUSEBUTTONUP = 6, SDL_QUIT = 12 };

int (*SDL_Init)(uint32_t);
void (*SDL_Quit)();
const char* (*SDL_GetError)();
SdlSurface* (*SDL_SetVideoMode)(int, int, int, uint32_t);
int (*SDL_LockSurface)(SdlSurface*);
void (*SDL_UnlockSurface)(SdlSurface*);
void (*SDL_UpdateRect)(SdlSurface*, int32_t, int32_t, uint32_t, uint32_t);
int (*SDL_PollEvent)(SdlEvent*);

SdlSurface* screen = nullptr;
uint32_t* surf = nullptr;      // the program's surface, kept between frames (render_damage writes only what changed)
int W = 0, H = 0, ox = 0, oy = 0;
bool swap_rb = false, quit = false;
uint64_t last_us = 0;
struct Finger { bool down, gone; float x, y; };
Finger fingers[HAL_MAX_TOUCH] = {};   // SDL's `which` is the finger
float px = 0, py = 0;                 // the pointer stays where the last finger was: a release is read at that place

// ZINC_WEBOS_STATS=1: once a second on stderr, the frames a second and the milliseconds a changed frame takes to draw and to reach the
// screen (on the screen itself: the runtime's panel, ZINC_PERF_HUD=1)
bool stats = false;
uint64_t stat_t = 0, sum_draw = 0, sum_show = 0;
int stat_frames = 0, stat_drawn = 0;

zbands::Pool& pool = *new zbands::Pool;   // never destroyed: its workers wait (render_bands.h)
enum { BAND_ROWS = 16 };
// one band of a frame: drawn into the surface, then copied to the screen's (locked) pixels
void band(void* ctx, int32_t a, int32_t b) {
  ((const HalFrame*)ctx)->render(surf + (size_t)a * W, a, b);
  for (int y = a; y < b; y++) {
    const uint32_t* s = surf + (size_t)y * W;
    uint32_t* d = (uint32_t*)((uint8_t*)screen->pixels + (size_t)(y + oy) * screen->pitch) + ox;
    if (!swap_rb) memcpy(d, s, (size_t)W * 4);
    else for (int x = 0; x < W; x++) d[x] = (s[x] & 0xFF00FF00u) | ((s[x] >> 16) & 0xFF) | ((s[x] & 0xFF) << 16);
  }
}

uint64_t now_us() { timespec t; clock_gettime(CLOCK_MONOTONIC, &t); return (uint64_t)t.tv_sec * 1000000u + t.tv_nsec / 1000; }

// The card of this process, at the size of the screen. Once: the size is asked for before init.
bool open_screen() {
  static int state = 0;   // 0 not tried, 1 open, -1 none
  if (state) return state > 0;
  state = -1;
  void* so = dlopen("libSDL-1.2.so.0", RTLD_NOW | RTLD_GLOBAL);
  if (!so) return false;   // not webOS: say nothing, the HAL keeps the screen
#define SYM(f) if (!(f = (decltype(f))dlsym(so, #f))) { fprintf(stderr, "display-webos: libSDL has no %s\n", #f); return false; }
  SYM(SDL_Init) SYM(SDL_Quit) SYM(SDL_GetError) SYM(SDL_SetVideoMode) SYM(SDL_LockSurface) SYM(SDL_UnlockSurface) SYM(SDL_UpdateRect) SYM(SDL_PollEvent)
#undef SYM
  if (SDL_Init(SDL_INIT_VIDEO) != 0) { fprintf(stderr, "display-webos: SDL_Init: %s\n", SDL_GetError()); return false; }
  screen = SDL_SetVideoMode(0, 0, 32, 0);   // 0 x 0: the screen's own mode; flags 0: a software surface
  if (!screen) { fprintf(stderr, "display-webos: no screen: %s\n", SDL_GetError()); SDL_Quit(); return false; }
  if (screen->format->bits != 32) { fprintf(stderr, "display-webos: a %d-bit screen is not handled\n", screen->format->bits); SDL_Quit(); screen = nullptr; return false; }
  swap_rb = screen->format->rmask == 0xFF;   // the rasterizer writes 0x00RRGGBB
  state = 1;
  return true;
}

void wb_native(int32_t* w, int32_t* h) { if (open_screen()) { *w = screen->w; *h = screen->h; } }

int wb_init(const HalConfig* cfg) {
  if (!open_screen()) return 0;
  W = cfg->width; H = cfg->height;
  if (W > screen->w || H > screen->h) { fprintf(stderr, "display-webos: the surface (%dx%d) is larger than the screen (%dx%d)\n", W, H, screen->w, screen->h); return 0; }
  ox = (screen->w - W) / 2; oy = (screen->h - H) / 2;
  surf = (uint32_t*)calloc((size_t)W * H, 4);
  pool.init();
  if (const char* e = getenv("ZINC_WEBOS_STATS")) stats = *e && *e != '0';
  fprintf(stderr, "display-webos: %dx%d on a %dx%d screen, %d threads\n", W, H, screen->w, screen->h, pool.threads);
  return surf != nullptr;
}

void wb_present(const HalFrame* f) {
  const bool has = f->x1 > f->x0 && f->y1 > f->y0;
  const uint64_t t0 = now_us();
  uint64_t t1 = t0;
  if (has && SDL_LockSurface(screen) == 0) {
    pool.run(f->y0, f->y1, BAND_ROWS, band, (void*)f);
    SDL_UnlockSurface(screen);
    t1 = now_us();
    SDL_UpdateRect(screen, ox, oy + f->y0, W, f->y1 - f->y0);
  }
  if (stats) {
    const uint64_t t2 = now_us();
    stat_frames++;
    if (has) { stat_drawn++; sum_draw += t1 - t0; sum_show += t2 - t1; }
    if (!stat_t) stat_t = t2;
    if (t2 - stat_t >= 1000000) {
      fprintf(stderr, "display-webos: %u frames/s, %d changed: draw %.1f ms, show %.1f ms\n", (unsigned)(stat_frames * 1000000ull / (t2 - stat_t)), stat_drawn,
              stat_drawn ? sum_draw / 1e3 / stat_drawn : 0.0, stat_drawn ? sum_show / 1e3 / stat_drawn : 0.0);
      stat_t = t2; stat_frames = stat_drawn = 0; sum_draw = sum_show = 0;
    }
  }
  // the pace of the loop: SDL's update does not wait for the screen
  const uint64_t period = 1000000u / ZP_DISPLAY_WEBOS_FPS, t = now_us();
  if (last_us && t - last_us < period) usleep((useconds_t)(period - (t - last_us)));
  last_us = now_us();
}

void wb_poll(HalInput* in) {
  static const bool budget = getenv("ZINC_FRAMES") != nullptr;   // the null HAL's frame count ends a run only when it is asked for
  if (!budget) in->quit = 0;
  SdlEvent e;
  while (SDL_PollEvent(&e)) {
    if (e.type == SDL_QUIT) quit = true;
    else if (e.type == SDL_MOUSEMOTION && e.motion.which < HAL_MAX_TOUCH) { Finger& g = fingers[e.motion.which]; g.x = e.motion.x - ox; g.y = e.motion.y - oy; }
    else if ((e.type == SDL_MOUSEBUTTONDOWN || e.type == SDL_MOUSEBUTTONUP) && e.button.which < HAL_MAX_TOUCH) {
      Finger& g = fingers[e.button.which];
      g.x = e.button.x - ox; g.y = e.button.y - oy;
      if (e.type == SDL_MOUSEBUTTONDOWN) g.down = true; else g.gone = true;   // a finger that left is shown once more, so a tap within one frame is seen
    }
  }
  in->ntouch = 0;
  for (int i = 0; i < HAL_MAX_TOUCH; i++) {
    Finger& g = fingers[i];
    if (!g.down) continue;
    if (!in->ntouch) { px = g.x; py = g.y; }
    in->touch[in->ntouch++] = HalTouch{i, g.x, g.y};
    if (g.gone) g.down = g.gone = false;
  }
  in->px = px; in->py = py;
  in->pdown = in->ntouch > 0;
  if (quit) in->quit = 1;
}

void wb_shutdown() { if (screen) SDL_Quit(); screen = nullptr; free(surf); surf = nullptr; }

HalDisplay webos = {wb_init, wb_present, wb_poll, wb_shutdown, 0, 0, nullptr, nullptr, wb_native};
int registered = (hal_display = &webos, 0);
}  // namespace
