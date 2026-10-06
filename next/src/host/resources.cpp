// Installs the baked fonts and images (the blob of src/res/res.cpp) into the tables of the runtime's rasterizer (runtime/zrt_raster.h:
// fonts, images, ttf_files). The runtime declares them const and has them defined by a generated file; here they are filled at start-up,
// so this file repeats the layout of Glyph, Font, Image and TtfFile (checked below) and avoids the runtime's own headers, which
// replace operator new.
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

#include <cstddef>

#include "zn/host.h"

namespace zrt { namespace raster {
struct Glyph { uint32_t cp; int16_t x0, y0; uint16_t w, h; int32_t adv; uint32_t off; };
struct Font { const char* name; int32_t px, ascent, descent, lineGap, count; const Glyph* glyphs; const uint8_t* bitmap; };
struct Image { const char* name; int32_t w, h; const uint8_t* rgba; int32_t scale; };
struct TtfFile { const char* name; const uint8_t* data; uint32_t len; };
static_assert(sizeof(Glyph) == 20, "layout of zrt::raster::Glyph");
// the tables the runtime reads (extern const in zrt_raster.h; the definition here is writable)
Font fonts[512];
int font_count = 0;
Image images[128];
int image_count = 0;
TtfFile ttf_files[16];
int ttf_count = 0;
}}

namespace zn::host {
namespace {

struct Reader {
  const uint8_t* p;
  const uint8_t* end;
  bool ok = true;
  uint32_t u32() { if (end - p < 4) { ok = false; return 0; } uint32_t v = p[0] | (p[1] << 8) | (p[2] << 16) | (static_cast<uint32_t>(p[3]) << 24); p += 4; return v; }
  const uint8_t* take(size_t n) { if (static_cast<size_t>(end - p) < n) { ok = false; return nullptr; } const uint8_t* r = p; p += n; return r; }
  char* str() { uint32_t n = u32(); const uint8_t* b = take(n); if (!b) return nullptr; char* s = static_cast<char*>(malloc(n + 1)); memcpy(s, b, n); s[n] = 0; return s; }
};

}  // namespace

bool installResources(const uint8_t* blob, size_t size) {
  using namespace zrt::raster;
  Reader r{blob, blob + size};
  const uint8_t* magic = r.take(4);
  if (!magic || memcmp(magic, "ZRS1", 4) != 0) return false;
  uint32_t nf = r.u32();
  if (nf > 512) return false;
  for (uint32_t i = 0; i < nf && r.ok; ++i) {
    Font& f = fonts[i];
    f.name = r.str();
    f.px = static_cast<int32_t>(r.u32()); f.ascent = static_cast<int32_t>(r.u32()); f.descent = static_cast<int32_t>(r.u32()); f.lineGap = static_cast<int32_t>(r.u32());
    uint32_t ng = r.u32();
    Glyph* gl = static_cast<Glyph*>(malloc((ng ? ng : 1) * sizeof(Glyph)));
    for (uint32_t k = 0; k < ng && r.ok; ++k) {
      Glyph& g = gl[k];
      g.cp = r.u32(); g.x0 = static_cast<int16_t>(r.u32()); g.y0 = static_cast<int16_t>(r.u32()); g.w = static_cast<uint16_t>(r.u32()); g.h = static_cast<uint16_t>(r.u32());
      g.adv = static_cast<int32_t>(r.u32()); g.off = r.u32();
    }
    uint32_t nb = r.u32();
    const uint8_t* bm = r.take(nb);
    uint8_t* bitmap = static_cast<uint8_t*>(malloc(nb ? nb : 1));
    if (bm) memcpy(bitmap, bm, nb);
    f.count = static_cast<int32_t>(ng); f.glyphs = gl; f.bitmap = bitmap;
  }
  uint32_t ni = r.u32();
  if (ni > 128) return false;
  for (uint32_t i = 0; i < ni && r.ok; ++i) {
    Image& im = images[i];
    im.name = r.str();
    im.w = static_cast<int32_t>(r.u32()); im.h = static_cast<int32_t>(r.u32()); im.scale = static_cast<int32_t>(r.u32());
    size_t n = static_cast<size_t>(im.w) * static_cast<size_t>(im.h) * 4;
    const uint8_t* px = r.take(n);
    uint8_t* copy = static_cast<uint8_t*>(malloc(n ? n : 1));
    if (px) memcpy(copy, px, n);
    im.rgba = copy;
  }
  uint32_t nt = r.u32();
  if (nt > 16) return false;
  for (uint32_t i = 0; i < nt && r.ok; ++i) {
    TtfFile& t = ttf_files[i];
    t.name = r.str();
    uint32_t n = r.u32();
    const uint8_t* d = r.take(n);
    uint8_t* copy = static_cast<uint8_t*>(malloc(n ? n : 1));
    if (d) memcpy(copy, d, n);
    t.data = copy; t.len = n;
  }
  if (!r.ok) return false;
  font_count = static_cast<int>(nf);
  image_count = static_cast<int>(ni);
  ttf_count = static_cast<int>(nt);
  return true;
}

}  // namespace zn::host
