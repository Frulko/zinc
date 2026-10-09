// display-gl backend for macOS: SDL3 window with an OpenGL 3.2 core context. F toggles fullscreen, Esc quits.
#include "hal.h"
#include "zgl.h"
#include <SDL3/SDL.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#ifndef ZP_DISPLAY_GL_FULLSCREEN
#define ZP_DISPLAY_GL_FULLSCREEN 0
#endif

static SDL_Window* win;
static SDL_GLContext ctx;
static bool quit;
static float zoom = 1;   // window points per logical pixel
static int lw, lh;       // logical size

bool zgl_backend_init(const HalConfig* cfg) {
  if (!SDL_Init(SDL_INIT_VIDEO)) { fprintf(stderr, "display-gl: %s\n", SDL_GetError()); return false; }
  SDL_GL_SetAttribute(SDL_GL_CONTEXT_MAJOR_VERSION, 3);
  SDL_GL_SetAttribute(SDL_GL_CONTEXT_MINOR_VERSION, 2);
  SDL_GL_SetAttribute(SDL_GL_CONTEXT_PROFILE_MASK, SDL_GL_CONTEXT_PROFILE_CORE);
  SDL_GL_SetAttribute(SDL_GL_CONTEXT_FLAGS, SDL_GL_CONTEXT_FORWARD_COMPATIBLE_FLAG);
  SDL_GL_SetAttribute(SDL_GL_DOUBLEBUFFER, 1);
  SDL_GL_SetAttribute(SDL_GL_DEPTH_SIZE, 24);   // the GL renderer's occlusion of what opaque rectangles hide (ZN-412.01)
  // window size in points as in hal_sdl: tiny surfaces doubled (ZINC_ZOOM overrides), a surface larger than the screen scaled down to fit
  int scale = cfg->width <= 400 ? 2 : 1;
  if (const char* z = getenv("ZINC_ZOOM")) scale = atoi(z) > 0 ? atoi(z) : scale;
  zoom = scale; lw = cfg->width; lh = cfg->height;
  float ww = (float)cfg->width * scale, wh = (float)cfg->height * scale;
  SDL_Rect usable;
  if (SDL_GetDisplayUsableBounds(SDL_GetPrimaryDisplay(), &usable) && usable.w > 0 && usable.h > 0) {
    const float fit = SDL_min(usable.w * 0.9f / ww, usable.h * 0.9f / wh);
    if (fit < 1) { ww *= fit; wh *= fit; zoom *= fit; }
  }
  SDL_WindowFlags fl = SDL_WINDOW_OPENGL | SDL_WINDOW_RESIZABLE | SDL_WINDOW_HIGH_PIXEL_DENSITY | (ZP_DISPLAY_GL_FULLSCREEN ? SDL_WINDOW_FULLSCREEN : 0);
  win = SDL_CreateWindow(cfg->title, (int)ww, (int)wh, fl);
  if (!win || !(ctx = SDL_GL_CreateContext(win))) { fprintf(stderr, "display-gl: %s\n", SDL_GetError()); return false; }
  SDL_GL_MakeCurrent(win, ctx);
  SDL_GL_SetSwapInterval(getenv("ZINC_VSYNC") && atoi(getenv("ZINC_VSYNC")) == 0 ? 0 : 1);   // ZINC_VSYNC=0: as fast as the frames come (measurements)
  return true;
}

// zoom x the screen's density (2 on Retina), so the surface has the window's own pixels and is not stretched; ZINC_SCALE overrides, capped at 4K like hal_sdl
int32_t zgl_backend_scale() {
  const float density = SDL_GetWindowPixelDensity(win);
  int32_t k = (int32_t)(zoom * (density > 0 ? density : 1) + 0.5f);
  if (const char* ks = getenv("ZINC_SCALE")) k = atoi(ks);
  if (k < 1) k = 1;
  while (k > 1 && (long)lw * k * lh * k > 3840L * 2400L) k--;
  return k;
}

void zgl_backend_size(int32_t* w, int32_t* h) { int a, b; SDL_GetWindowSizeInPixels(win, &a, &b); *w = a; *h = b; }
void zgl_backend_swap() { SDL_GL_SwapWindow(win); }

void zgl_backend_poll(HalInput* in, int32_t W, int32_t H) {
  int ww, wh;
  SDL_GetWindowSize(win, &ww, &wh);
  SDL_Event e;
  while (SDL_PollEvent(&e)) {
    if (e.type == SDL_EVENT_QUIT) quit = true;
    if (e.type == SDL_EVENT_KEY_DOWN && e.key.scancode == SDL_SCANCODE_ESCAPE) quit = true;
    if (e.type == SDL_EVENT_KEY_DOWN && e.key.scancode == SDL_SCANCODE_F && !e.key.repeat)
      SDL_SetWindowFullscreen(win, !(SDL_GetWindowFlags(win) & SDL_WINDOW_FULLSCREEN));
    if (e.type == SDL_EVENT_MOUSE_WHEEL) in->wheel += e.wheel.y;
    if (e.type == SDL_EVENT_PINCH_UPDATE) in->pinch *= e.pinch.scale;
    if (e.type == SDL_EVENT_FINGER_DOWN || e.type == SDL_EVENT_FINGER_MOTION) {
      int32_t id = (int32_t)e.tfinger.fingerID, k = 0;
      while (k < in->ntouch && in->touch[k].id != id) k++;
      if (k == in->ntouch && k < HAL_MAX_TOUCH) in->ntouch++;
      if (k < HAL_MAX_TOUCH) in->touch[k] = HalTouch{id, e.tfinger.x * W, e.tfinger.y * H};
    }
    if (e.type == SDL_EVENT_FINGER_UP || e.type == SDL_EVENT_FINGER_CANCELED) {
      for (int32_t k = 0; k < in->ntouch; k++) if (in->touch[k].id == (int32_t)e.tfinger.fingerID) { in->touch[k] = in->touch[--in->ntouch]; break; }
    }
  }
  static const bool det = getenv("ZINC_DETERMINISTIC") && strcmp(getenv("ZINC_DETERMINISTIC"), "0") != 0;
  if (det) { in->quit = quit; return; }   // a deterministic run (tests) reads no live keyboard or mouse: the pointer over the window changed hover states
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
  in->px = ww > 0 ? mx * W / ww : 0;
  in->py = wh > 0 ? my * H / wh : 0;
  in->pdown = (mb & SDL_BUTTON_LMASK) != 0;
  in->quit = quit;
}

void zgl_backend_shutdown() {
  SDL_GL_DestroyContext(ctx);
  SDL_DestroyWindow(win);
  SDL_Quit();
}
