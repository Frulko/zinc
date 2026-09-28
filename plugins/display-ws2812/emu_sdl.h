// macOS emulator window shared by the small-display plugins (ws2812, ssd1306): each device pixel becomes an upscaled
// dot (round LED with a soft glow, or a square OLED pixel) on a dark background. The target HAL (hal_sdl.cpp) still
// polls SDL events and keys; it skips its own window because a display driver is registered.
// ZINC_SHOT=file.bmp saves the emulator picture at exit.
#pragma once
#include <SDL3/SDL.h>
#include <stdint.h>
#include <stdlib.h>
#include <math.h>

namespace emu {
static SDL_Window* win;
static SDL_Renderer* ren;
static SDL_Texture* tex;
static uint32_t* px;        // window-sized picture
static float* mask;         // per-cell coverage: dot (0..1), glow in the second half
static int cols, rows, S;   // device size, pixels per device pixel

// round: LED dots with glow; otherwise square pixels with a 1 px gap (OLED)
static bool open(const char* title, int w, int h, int scale, bool round) {
  cols = w; rows = h; S = scale;
  if (!SDL_Init(SDL_INIT_VIDEO)) return false;
  if (!SDL_CreateWindowAndRenderer(title, w * S, h * S, 0, &win, &ren)) return false;
  SDL_SetRenderVSync(ren, 1);
  tex = SDL_CreateTexture(ren, SDL_PIXELFORMAT_XRGB8888, SDL_TEXTUREACCESS_STREAMING, w * S, h * S);
  px = (uint32_t*)calloc((size_t)w * h * S * S, 4);
  mask = (float*)calloc((size_t)S * S * 2, sizeof(float));
  for (int y = 0; y < S; y++)
    for (int x = 0; x < S; x++) {
      float dx = x + 0.5f - S / 2.0f, dy = y + 0.5f - S / 2.0f, d = sqrtf(dx * dx + dy * dy) / (S / 2.0f);
      float dot = round ? fminf(1, fmaxf(0, (0.72f - d) * S / 2)) : (x > 0 && y > 0 ? 1.f : 0.f);
      mask[y * S + x] = dot;
      mask[S * S + y * S + x] = round ? fmaxf(0, 1 - d) * 0.35f : 0;
    }
  return true;
}
// colors: w*h 0x00RRGGBB; `off` is drawn for unlit pixels (the dark LED package / OLED background)
static void show(const uint32_t* colors, uint32_t off) {
  for (int cy = 0; cy < rows; cy++)
    for (int cx = 0; cx < cols; cx++) {
      uint32_t c = colors[cy * cols + cx];
      if (!(c & 0xFFFFFF)) c = off;
      float r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
      for (int y = 0; y < S; y++) {
        uint32_t* o = px + (size_t)(cy * S + y) * cols * S + cx * S;
        for (int x = 0; x < S; x++) {
          float m = mask[y * S + x], k = m + mask[S * S + y * S + x] * (1 - m);
          o[x] = (uint32_t)(r * k) << 16 | (uint32_t)(g * k) << 8 | (uint32_t)(b * k);
        }
      }
    }
  SDL_UpdateTexture(tex, nullptr, px, cols * S * 4);
}
static void frame() { SDL_RenderClear(ren); SDL_RenderTexture(ren, tex, nullptr, nullptr); SDL_RenderPresent(ren); }
static void close() {
  if (const char* f = getenv("ZINC_SHOT"))
    if (SDL_Surface* s = SDL_CreateSurfaceFrom(cols * S, rows * S, SDL_PIXELFORMAT_XRGB8888, px, cols * S * 4)) { SDL_SaveBMP(s, f); SDL_DestroySurface(s); }
  SDL_DestroyRenderer(ren);
  SDL_DestroyWindow(win);
  SDL_Quit();
}
}  // namespace emu
