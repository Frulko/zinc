// Exercise the real raster cache, including allocation failure, without a window or a platform HAL.
#include <cassert>
#include <cstdio>
#include <cstdlib>
#include <unordered_map>
#include <vector>
#include "../../runtime/raster.cpp"

static std::unordered_map<void*, size_t> blocks;
static size_t live, peak;
static int allocations, fail_at = -1;
extern "C" void zn_resource_stats_register(const char*, ZnResourceStatsFn, void*) {}
extern "C" void* hal_alloc(size_t n) {
  if (allocations++ == fail_at) return nullptr;
  void* p = std::malloc(n);
  if (p) { blocks[p] = n; live += n; if (live > peak) peak = live; }
  return p;
}
extern "C" void hal_free(void* p) {
  if (p) { live -= blocks.at(p); blocks.erase(p); std::free(p); }
}
static void reset() {
  using namespace zrt::raster;
  hal_free(shadow_rows); shadow_rows = nullptr; shadow_rows_cap = 0;
  hal_free(shadow_keys); shadow_keys = nullptr; shadow_keys_cap = 0;
  hal_free(shadow_slot); shadow_slot = nullptr; shadow_slot_cap = 0;
  assert(live == 0); peak = 0; allocations = 0; fail_at = -1;
}
static std::vector<uint32_t> draw(zrt::raster::Cmd c, int w, int h, int fail) {
  reset(); fail_at = fail;
  std::vector<uint32_t> px(w * h, 0x112233);
  zrt::raster::Target t{px.data(), w, 0, {0, 0, w, h}};
  zrt::raster::shadow_rrect(t, c);
  return px;
}
int main() {
  using namespace zrt::raster;
  Cmd c{}; c.x = 64; c.y = 64; c.w = 1800; c.h = 1300; c.r = 16; c.s = 24; c.alpha = 160; c.c1 = 0x334455;
  auto cached = draw(c, 2048, 1536, -1);
  printf("shadow scratch: live=%zu peak=%zu bytes\n", live, peak);
  assert(live < 256 * 1024 && peak < 512 * 1024);
  // First allocation failure disables the cache; later failures interrupt its growth.
  for (int fail = 0; fail < 8; ++fail) {
    if (fail == 2) continue;   // no memory for even one alpha row: rendering already cannot proceed
    assert(draw(c, 2048, 1536, fail) == cached);
  }
  for (int i = 0; i < 36; ++i) {
    c.x = (i % 4) * 0.25f - 4; c.y = (i % 3) * 0.25f + 2;
    c.w = 70; c.h = 50; c.r = (i % 6) * 5; c.s = (i % 4) * 7 + 1;
    auto expected = draw(c, 96, 80, 0);
    assert(draw(c, 96, 80, -1) == expected);
  }
  reset(); puts("raster scratch: ok");
}
