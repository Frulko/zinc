#include "text/sbix.h"
#include <algorithm>
#include <cmath>
#define STB_IMAGE_STATIC
#define STBI_ONLY_PNG
#define STB_IMAGE_IMPLEMENTATION
#pragma GCC diagnostic push
#pragma GCC diagnostic ignored "-Wunused-function"   // the static PNG-only build leaves stb helpers unused
#include "stb_image.h"
#pragma GCC diagnostic pop

namespace zn::text {
namespace {

struct Rd {
  const uint8_t* d; size_t n;
  uint32_t u8(size_t o) const { return o < n ? d[o] : 0; }
  uint32_t u16(size_t o) const { return o + 2 <= n ? (d[o] << 8) | d[o + 1] : 0; }
  int32_t s16(size_t o) const { uint32_t v = u16(o); return v >= 0x8000 ? int32_t(v) - 0x10000 : int32_t(v); }
  uint32_t u32(size_t o) const { return o + 4 <= n ? (uint32_t(d[o]) << 24) | (uint32_t(d[o + 1]) << 16) | (uint32_t(d[o + 2]) << 8) | d[o + 3] : 0; }
};

size_t table(const Rd& r, const char* tag) {
  size_t base = 0;
  if (r.u32(0) == 0x74746366) base = r.u32(12);   // 'ttcf': the first font of the collection
  uint32_t nt = r.u16(base + 4);
  for (uint32_t i = 0; i < nt; ++i) {
    size_t rec = base + 12 + i * 16;
    if (r.u8(rec) == uint8_t(tag[0]) && r.u8(rec + 1) == uint8_t(tag[1]) && r.u8(rec + 2) == uint8_t(tag[2]) && r.u8(rec + 3) == uint8_t(tag[3])) return r.u32(rec + 8);
  }
  return 0;
}

}  // namespace

bool hasSbix(const uint8_t* font, size_t size) { return table(Rd{font, size}, "sbix") != 0; }

bool sbixGlyph(const uint8_t* font, size_t size, uint32_t gid, float px, ColorBitmap& out) {
  Rd r{font, size};
  size_t sb = table(r, "sbix"), maxp = table(r, "maxp");
  if (!sb || !maxp) return false;
  uint32_t numGlyphs = r.u16(maxp + 4), strikes = r.u32(sb + 4);
  if (gid >= numGlyphs || !strikes) return false;
  size_t best = 0; uint32_t bestPpem = 0;   // the smallest strike that is at least `px`, else the largest
  for (uint32_t i = 0; i < strikes; ++i) {
    size_t st = sb + r.u32(sb + 8 + i * 4);
    uint32_t ppem = r.u16(st);
    bool better = !best || (ppem >= px ? (bestPpem < px || ppem < bestPpem) : (bestPpem < px && ppem > bestPpem));
    if (better) { best = st; bestPpem = ppem; }
  }
  uint32_t a = r.u32(best + 4 + gid * 4), b = r.u32(best + 4 + (gid + 1) * 4);
  if (b <= a + 8) return false;
  size_t g = best + a;
  int32_t ox = r.s16(g), oy = r.s16(g + 2);
  if (r.u32(g + 4) != 0x706e6720) return false;   // 'png '
  int w, h, comp;
  unsigned char* px8 = stbi_load_from_memory(font + g + 8, int(b - a - 8), &w, &h, &comp, 4);
  if (!px8) return false;
  float k = px / float(bestPpem);
  int tw = std::max(1, int(std::lround(w * k))), th = std::max(1, int(std::lround(h * k)));
  out.w = tw; out.h = th;
  out.left = int(std::lround(ox * k));
  out.top = int(std::lround((oy + h) * k));
  out.rgba.assign(size_t(tw) * th, 0);
  for (int y = 0; y < th; ++y)
    for (int x = 0; x < tw; ++x) {   // box average of the source pixels under the target pixel, alpha-weighted
      int x0 = int(std::floor(x / k)), x1 = std::max(x0 + 1, int(std::ceil((x + 1) / k))), y0 = int(std::floor(y / k)), y1 = std::max(y0 + 1, int(std::ceil((y + 1) / k)));
      x1 = std::min(x1, w); y1 = std::min(y1, h);
      float sr = 0, sg = 0, sbl = 0, sa = 0; int cnt = 0;
      for (int yy = y0; yy < y1; ++yy)
        for (int xx = x0; xx < x1; ++xx) {
          const unsigned char* p = px8 + (size_t(yy) * w + xx) * 4;
          float al = p[3] / 255.f;
          sr += p[0] * al; sg += p[1] * al; sbl += p[2] * al; sa += al; ++cnt;
        }
      if (!cnt || sa <= 0) continue;
      uint32_t A = uint32_t(std::lround(255.f * sa / cnt)), R = uint32_t(std::lround(sr / sa)), G = uint32_t(std::lround(sg / sa)), B = uint32_t(std::lround(sbl / sa));
      out.rgba[size_t(y) * tw + x] = (A << 24) | (std::min(B, 255u) << 16) | (std::min(G, 255u) << 8) | std::min(R, 255u);
    }
  stbi_image_free(px8);
  return true;
}

}  // namespace zn::text
