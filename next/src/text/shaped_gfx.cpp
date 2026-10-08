#include "text/shaped_gfx.h"
#include <cmath>
#include <cstring>
#include <map>
#include <memory>
#include <string>
#include <vector>
#include "text/layout.h"
#include "zrt_raster.h"

namespace zn::text {
namespace {

using zrt::raster::ShapedGlyph;

std::vector<std::unique_ptr<Face>> gFaces;   // one per embedded TrueType file, null when it does not open
bool gOpened = false;

void openFaces() {
  if (gOpened) return;
  gOpened = true;
  for (int i = 0; i < zrt::raster::ttf_count; ++i) gFaces.push_back(Face::open(zrt::raster::ttf_files[i].data, zrt::raster::ttf_files[i].len));
}

// The file a font id was made from: runtime fonts know it, baked ones by name ("sans" is Inter, "mono" JetBrains Mono).
int fileOf(int32_t font) {
  int f = zrt::raster::font_file(font);
  if (f >= 0) return f;
  const zrt::raster::Font* fp = zrt::raster::font_at(font);
  if (!fp || !fp->name) return -1;
  for (int i = 0; i < zrt::raster::ttf_count; ++i) if (std::strcmp(zrt::raster::ttf_files[i].name, fp->name) == 0) return i;   // the TrueType files carry the families' names (sans, sans-bold, mono, the stems of the assets)
  return -1;
}

struct Rendered { std::vector<Bitmap> bitmaps; std::vector<ShapedGlyph> glyphs; int32_t advance = 0; };

std::map<std::string, Rendered> gCache;   // (file, size, tracking, text) -> glyph bitmaps placed on the baseline
std::map<std::tuple<int, uint32_t, int>, Bitmap> gBitmaps;

const Rendered* shape(int32_t font, std::string_view text, float tracking) {
  openFaces();
  const zrt::raster::Font* fp = zrt::raster::font_at(font);
  int file = fileOf(font);
  if (!fp || file < 0 || file >= static_cast<int>(gFaces.size()) || !gFaces[file]) return nullptr;
  std::string key = std::to_string(file) + ":" + std::to_string(fp->px) + ":" + std::to_string(tracking) + ":" + std::string(text);
  auto it = gCache.find(key);
  if (it != gCache.end()) return &it->second;
  if (gCache.size() > 512) { gCache.clear(); gBitmaps.clear(); }
  std::vector<Face*> faces{gFaces[file].get()};   // the font's own file first, then the others as the fallback chain
  for (int i = 0; i < static_cast<int>(gFaces.size()); ++i) if (i != file && gFaces[i]) faces.push_back(gFaces[i].get());
  std::vector<int> faceFile{file};
  for (int i = 0; i < static_cast<int>(gFaces.size()); ++i) if (i != file && gFaces[i]) faceFile.push_back(i);
  Options o;
  o.size = static_cast<float>(fp->px);
  std::vector<Line> lines = layout(faces, text, o);
  Rendered r;
  float lineH = static_cast<float>(fp->ascent + fp->descent + fp->lineGap), y0 = 0, widest = 0;
  r.bitmaps.reserve(256);
  for (const Line& l : lines) {
    float pen = 0;
    for (const Run& run : l.runs) {
      float x = pen;
      for (const Glyph& g : run.glyphs) {
        Bitmap bm;
        auto bk = std::make_tuple(faceFile[g.face], g.gid, fp->px);
        auto bi = gBitmaps.find(bk);
        if (bi == gBitmaps.end()) { Bitmap nb; rasterize(*faces[g.face], g.gid, o.size, nb); bi = gBitmaps.emplace(bk, std::move(nb)).first; }
        const Bitmap& b = bi->second;
        if (b.w > 0 && b.h > 0) {
          r.bitmaps.push_back(b);   // a stable copy for the entry
          r.glyphs.push_back({static_cast<int32_t>(std::lround(x + g.x)) + b.left, static_cast<int32_t>(std::lround(y0 + g.y)) - b.top, b.w, b.h, nullptr});
        }
        x += g.advance + tracking;
      }
      pen += run.width + tracking * run.glyphs.size();
    }
    widest = std::max(widest, pen);
    y0 += lineH;
  }
  for (size_t i = 0; i < r.glyphs.size(); ++i) r.glyphs[i].a = r.bitmaps[i].a.data();
  r.advance = static_cast<int32_t>(std::lround(widest * 64));
  return &gCache.emplace(key, std::move(r)).first->second;
}

int32_t run(int32_t font, const char* s, uint32_t n, float tracking, void (*emit)(void*, const ShapedGlyph&), void* user) {
  const Rendered* r = shape(font, std::string_view(s, n), tracking);
  if (!r) return -1;
  if (emit) for (const ShapedGlyph& g : r->glyphs) emit(user, g);
  return r->advance;
}

const zrt::raster::ShapeHooks kHooks = {run};

}  // namespace

void installShapedGfx() { zrt::raster::shape_hooks = &kHooks; }

}  // namespace zn::text

// For the main of a program built with `zinc build` and "text": "shaped" in its zinc.json.
void zn_install_shaped_text() { zn::text::installShapedGfx(); }
