#include "../../targets/console/ff_cpu.h"
#include "../../runtime/zrt_raster.h"
#include "zn/resource_stats.h"
#include <cassert>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <stdexcept>
#include <string>
#include <vector>
extern "C" void zn_resource_stats_register(const char*, ZnResourceStatsFn, void*) {}
extern "C" void* hal_alloc(size_t n) { return malloc(n); }
extern "C" void hal_free(void* p) { free(p); }
extern "C" void hal_panic(const char*, const char*, int) { abort(); }
static std::string logText;
extern "C" void hal_log(const char* p, size_t n) { logText.append(p, n); }
extern "C" void hal_log_err(const char*, size_t) {}
extern "C" const char* hal_env(const char* key) { return getenv(key); }
namespace zrt::raster {
extern const Font fonts[] = {};
extern const int font_count = 0;
extern const Image images[] = {};
extern const int image_count = 0;
const Font* font_at(int32_t) { return nullptr; }
const Glyph* runtime_glyph(int32_t, uint32_t) { return nullptr; }
int32_t scaled_font(int32_t, int32_t) { return -1; }
}
using namespace zrt::raster;
static Cmd rect(float x, float y, float w, float h, uint32_t color, float radius = 0) {
  Cmd c{}; c.kind = RECT; c.x = x; c.y = y; c.w = w; c.h = h; c.c1 = color; c.alpha = 255; c.r = radius; return c;
}
int main() {
  constexpr int w = 32, h = 24;
  std::vector<uint32_t> actual(w * h), expected(w * h);
  Cmd a[] = {rect(0, 0, w, h, 0x112233), rect(2, 2, 8, 8, 0xAABBCC), rect(14, 2, 12, 12, 0x445566, 3)};
  Cmd b[] = {rect(2, 16, 16, 6, 0x204060), {}, rect(24, 17, 8, 7, 0xFFFFFF), {}};
  b[0].grad = 2; b[0].c2 = 0x80A0C0;
  b[1] = rect(26, 18, 3, 3, 0); b[1].kind = CLIP;
  b[3].kind = UNCLIP;
  const HalCmdList la{a, 3, "", nullptr}, lb{b, 4, "", nullptr};
  const HalCmdList* lists[] = {&la, &lb};
  render(Frame{a, 3, "", nullptr}, expected.data(), w, 0, h, Rect{0, 0, w, h});
  render(Frame{b, 4, "", nullptr}, expected.data(), w, 0, h, Rect{0, 0, w, h});
  {
    zn::ff::Cpu cpu(actual.data(), w, h);
    bool rejected = false;
    try { zn::ff::Cpu duplicate(actual.data(), w, h); } catch (const std::logic_error&) { rejected = true; }
    assert(rejected);
    unsetenv("ZINC_LOG");
    assert(cpu.render(lists, 2));
    assert(logText.empty());
    assert(actual[3 * w + 3] == 0xAABBCC);
    assert(actual[19 * w + 27] == 0xFFFFFF && actual[19 * w + 25] == 0x112233);
    int maxDifference = 0;
    for (size_t i = 0; i < actual.size(); i++) for (int shift = 0; shift < 24; shift += 8) {
      int d = abs((int)(actual[i] >> shift & 255) - (int)(expected[i] >> shift & 255));
      if (d > maxDifference) maxDifference = d;
    }
    printf("tiny reference maximum channel difference: %d\n", maxDifference);
    assert(maxDifference <= 8);
    const auto cold = zn::ff::frame_stats();
    assert(cold.quads > 4 && cold.tiles == 1 && cold.cache_hits == 0);
    setenv("ZINC_LOG", "info", 1); // src/main.cpp's zinc -v setting
    assert(cpu.render(lists, 2));
    const auto warm = zn::ff::frame_stats();
    assert(warm.quads == cold.quads && warm.tiles == 1 && warm.cache_hits == 1);
    assert(logText.find("quads, 1 tiles, 1 cache hits\n") != std::string::npos);
    assert(logText.find('\n') == logText.size() - 1);
    Cmd rounded = b[1]; rounded.r = 2;
    const HalCmdList unsupported{&rounded, 1, "", nullptr}; const HalCmdList* lp = &unsupported;
    assert(!cpu.render(&lp, 1));
    assert(zn::ff::frame_stats().quads == 0);
    // Dynamic image identity/version and alpha use the actual runtime registry.
    const int32_t image = dyn_create(2, 2);
    assert(image >= 0);
    uint32_t px[] = {0xFF0000, 0x00FF00, 0x0000FF, 0xFFFFFF}; dyn_update(image, px, 2);
    Cmd sprite = rect(0, 0, 2, 2, 0); sprite.kind = IMAGE; sprite.res = image;
    const HalCmdList li{&sprite, 1, "", nullptr}; lp = &li;
    assert(cpu.render(&lp, 1)); assert(actual[0] == 0xFF0000 && actual[w] == 0x0000FF);
    px[0] = 0x123456; dyn_update(image, px, 2);
    assert(cpu.render(&lp, 1)); assert(actual[0] == 0x123456);
    // The backend must preserve alpha and select the requested sampler.
    px[0] = 0xFF000000; px[1] = 0xFFFFFFFF; px[2] = 0x800000FF; px[3] = 0xFFFFFFFF;
    dyn_set_alpha(image, true); dyn_update(image, px, 2);
    sprite.w = sprite.h = 8; sprite.grad = 1;
    Cmd alphaRect = rect(10, 10, 4, 4, 0xFFFFFF); alphaRect.alpha = 128;
    const HalCmdList alphaList{&alphaRect, 1, "", nullptr}; const HalCmdList* alphaPtr = &alphaList;
    std::fill(actual.begin(), actual.end(), 0);
    assert(cpu.render(&alphaPtr, 1));
    assert((actual[11 * w + 11] & 255) >= 126 && (actual[11 * w + 11] & 255) <= 129);
    Cmd backdrop = rect(0, 0, w, h, 0);
    const HalCmdList bg{&backdrop, 1, "", nullptr};
    const HalCmdList* pair[] = {&bg, &li};
    assert(cpu.render(pair, 2));
    assert(actual[3] == 0 && actual[4] == 0xFFFFFF);
    assert((actual[6 * w + 1] & 255) >= 126 && (actual[6 * w + 1] & 255) <= 129);
    sprite.grad = 0;
    assert(cpu.render(pair, 2));
    assert((actual[3] & 255) > 0 && (actual[3] & 255) < 255);
    zn::ff::begin_frame();
    int32_t iw, ih;
    const void* uploaded = zn::ff::texture(image, &iw, &ih);
    assert(uploaded);
    zn::ff::full(uploaded, iw, ih, 1, 0, 0);
    assert(zn::ff::frame_stats().quads == 1 && zn::ff::frame_stats().tiles == 0);
    zn::ff::end_frame();
    // Flush pending work before the image is removed.
    assert(cpu.render(pair, 2));
    dyn_destroy(image);
    assert(!cpu.render(&lp, 1));
  }
  // New backend has fresh atlas memory; shared cache must not retain the old atlas's placements.
  {
    zn::ff::Cpu restarted(actual.data(), w, h);
    assert(restarted.render(lists, 2));
    assert(zn::ff::frame_stats().cache_hits == 0);
    assert(actual[7 * w + 19] == 0x445566);
  }
  puts("ff CPU pixels, frame counters, cache, images and restart: ok");
}
