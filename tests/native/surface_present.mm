#include <cassert>
#include <cstdio>
#include <vector>
#include "../../targets/macos/hal_metal.mm"
extern "C" void zrt_prof_info(const char*, const char*) {}
extern "C" void hal_panic(const char* msg, const char*, int) { std::fprintf(stderr, "%s\n", msg); std::abort(); }
int main() {
  setenv("ZINC_PRESENT", "surface", 1);
  SDL_SetHint(SDL_HINT_WINDOW_ACTIVATE_WHEN_SHOWN, "0");
  SDL_SetHint(SDL_HINT_WINDOW_ACTIVATE_WHEN_RAISED, "0");
  assert(SDL_Init(SDL_INIT_VIDEO));
  SDL_Window* w = SDL_CreateWindow("Zinc surface test", 96, 64, SDL_WINDOW_METAL | SDL_WINDOW_HIDDEN);
  if (!w || !hal_mtl_open(w, false)) return 77;
  SDL_ShowWindow(w);
  for (int resize = 0; resize < 2; ++resize) {
    int width = resize ? 95 : 64, height = resize ? 61 : 48;
    SDL_SetWindowSize(w, width, height); SDL_PumpEvents();
    std::vector<uint32_t> expected(width * height);
    id previous_contents = image_layer.contents;
    hal_mtl_pixels(width, height);
    if (resize) assert(image_layer.contents == previous_contents);
    for (int n = 0; n < 24; ++n) { @autoreleasepool {
      SDL_PumpEvents();
      const bool full = n % 7 == 0;
      hal_mtl_wait(!full);
      uint32_t* px = hal_mtl_pixels(width, height);
      if (n && !full) for (size_t i = 0; i < expected.size(); ++i) assert((px[i] & 0xFFFFFFu) == expected[i]);
      const auto previous = expected;
      int x0 = full ? 0 : n % 17, y0 = full ? 0 : n % 13;
      int x1 = full ? width : x0 + 19, y1 = full ? height : y0 + 17;
      uint32_t color = 0x102030u + n * 0x030507u;
      for (int y = y0; y < y1; ++y) for (int x = x0; x < x1; ++x) { expected[y * width + x] = color; px[y * width + x] = color | 0xFF000000u; }
      if (n) for (size_t i = 0; i < previous.size(); ++i) assert((displayed_px[i] & 0xFFFFFFu) == previous[i]);
      hal_mtl_present();
      assert((__bridge IOSurfaceRef)image_layer.contents == displayed);
      for (size_t i = 0; i < expected.size(); ++i) assert(displayed_px[i] == (expected[i] | 0xFF000000u));
    }
    }
    assert(displayed && !drawing);
  }
  hal_mtl_close();
  setenv("ZINC_PRESENT", "auto", 1);
  assert(hal_mtl_open(w, false));
  hal_mtl_pixels(64, 48);
  for (int cycle = 0; cycle < 2; ++cycle) {
    for (int n = 0; n < 12; ++n) {
      SDL_PumpEvents(); hal_mtl_wait();
      uint32_t* px = hal_mtl_pixels(64, 48);
      for (int i = 0; i < 64 * 48; ++i) px[i] = 0xFF102030u + n;
      hal_mtl_present();
    }
    assert(!surface_mode && frame);
    uint32_t* snapshot = nullptr;
    for (int n = 0; n < 30; ++n) if (uint32_t* p = hal_mtl_idle()) snapshot = p;
    assert(surface_mode && snapshot && !frame && !queue && !view);
    for (int i = 0; i < 64 * 48; ++i) assert(snapshot[i] == 0xFF10203Bu);
  }
  hal_mtl_close();
  unsetenv("ZINC_PRESENT");
  assert(hal_mtl_open(w, false));
  assert(!adaptive && !surface_mode);
  uint32_t* stable = hal_mtl_pixels(64, 48);
  for (int i = 0; i < 64 * 48; ++i) stable[i] = 0xFF102030u;
  hal_mtl_present();
  for (int n = 0; n < 60; ++n) { assert(!hal_mtl_idle()); assert(!surface_mode && frame && view); }
  hal_mtl_close(); SDL_DestroyWindow(w); SDL_Quit();
  puts("surface present: partial updates, resize, opaque pixels and immutable display lifetime ok");
}
