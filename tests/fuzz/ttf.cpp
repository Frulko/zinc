// TrueType glyphs (runtime/ttf.cpp): parse a font file and rasterize a few code points at a size from the input.
#include "fuzz.h"
#include "../../runtime/ttf.cpp"
using namespace zrt::raster;

extern "C" int LLVMFuzzerTestOneInput(const uint8_t* d, size_t n) {
  if (n < 1 || n > (1 << 16)) return 0;
  ttfs[0] = parse(d + 1, (uint32_t)(n - 1));
  if (!ttfs[0].ok) return 0;
  RFont r{};
  r.f.px = 4 + d[0] % 96;
  r.file = 0;
  static const uint32_t cps[] = {0, 'A', 'g', 0xE9, 0x416, 0x4E2D, 0x1F600, 0xFFFF, 0x10FFFF, 0xFFFFFFFE};
  for (uint32_t cp : cps) rasterize(r, cp);
  if (r.glyphs) hal_free(r.glyphs);
  if (r.bitmap) hal_free(r.bitmap);
  ttfs[0] = Ttf{};
  return 0;
}
