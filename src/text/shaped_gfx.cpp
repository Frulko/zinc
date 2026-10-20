#include "text/shaped_gfx.h"
#include <cmath>
#include <cstring>
#include <map>
#include <memory>
#include <string>
#include <vector>
#include <fstream>
#include <iterator>
#include "text/layout.h"
#include "text/sbix.h"
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

// System fonts (ZN-225): the fallback behind the embedded files for what none of them covers, opened the first time a text needs one. Colour emoji come from the sbix table of Apple Color Emoji.
// ponytail: CBDT/COLR colour fonts (Noto Color Emoji on Linux) are not drawn yet, only glyf and CFF outlines and sbix bitmaps.
struct SysFace { std::vector<uint8_t> data; std::unique_ptr<Face> face; bool color = false; };
std::vector<SysFace> gSys;
bool gSysLoaded = false;

void loadSystemFaces() {
  if (gSysLoaded) return;
  gSysLoaded = true;
#if defined(__APPLE__)
  const char* paths[] = {"/System/Library/Fonts/Apple Color Emoji.ttc", "/System/Library/Fonts/Apple Symbols.ttf", "/System/Library/Fonts/Supplemental/Arial Unicode.ttf"};
#else
  const char* paths[] = {"/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/TTF/DejaVuSans.ttf", "/usr/share/fonts/dejavu/DejaVuSans.ttf"};
#endif
  for (const char* p : paths) {
    std::ifstream in(p, std::ios::binary);
    if (!in) continue;
    SysFace f;
    f.data.assign(std::istreambuf_iterator<char>(in), std::istreambuf_iterator<char>());
    f.face = Face::open(f.data.data(), f.data.size());
    if (!f.face) continue;
    f.color = hasSbix(f.data.data(), f.data.size());
    gSys.push_back(std::move(f));
  }
}

bool covered(std::string_view text, const std::vector<Face*>& faces) {   // every code point has a glyph in one of the faces
  for (size_t i = 0; i < text.size();) {
    unsigned char c = static_cast<unsigned char>(text[i]);
    int n = c < 0x80 ? 1 : c < 0xE0 ? 2 : c < 0xF0 ? 3 : 4;
    uint32_t cp = n == 1 ? c : c & (0xFF >> (n + 1));
    for (int k = 1; k < n && i + k < text.size(); ++k) cp = (cp << 6) | (static_cast<unsigned char>(text[i + k]) & 0x3F);
    i += n;
    if (cp < 0x20 || cp == 0x200D || (cp >= 0xFE00 && cp <= 0xFE0F)) continue;
    bool any = false;
    for (Face* f : faces) if (f->hasGlyph(cp)) { any = true; break; }
    if (!any) return false;
  }
  return true;
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

struct Rendered { std::vector<Bitmap> bitmaps; std::vector<ColorBitmap> colors; std::vector<ShapedGlyph> glyphs; std::vector<char> isColor; int32_t advance = 0; };

std::map<std::string, Rendered> gCache;   // (file, size, tracking, text) -> glyph bitmaps placed on the baseline
std::map<std::tuple<int, uint32_t, int>, Bitmap> gBitmaps;
std::map<std::tuple<int, uint32_t, int>, ColorBitmap> gColors;

const Rendered* shape(int32_t font, std::string_view text, float tracking) {
  openFaces();
  const zrt::raster::Font* fp = zrt::raster::font_at(font);
  int file = fileOf(font);
  if (!fp || file < 0 || file >= static_cast<int>(gFaces.size()) || !gFaces[file]) return nullptr;
  std::string key = std::to_string(file) + ":" + std::to_string(fp->px) + ":" + std::to_string(tracking) + ":" + std::string(text);
  auto it = gCache.find(key);
  if (it != gCache.end()) return &it->second;
  if (gCache.size() > 512) { gCache.clear(); gBitmaps.clear(); gColors.clear(); }
  std::vector<Face*> faces{gFaces[file].get()};   // the font's own file first, then the others as the fallback chain, then the system fonts
  std::vector<int> faceFile{file};
  for (int i = 0; i < static_cast<int>(gFaces.size()); ++i) if (i != file && gFaces[i]) { faces.push_back(gFaces[i].get()); faceFile.push_back(i); }
  if (!covered(text, faces) || text.find("\xEF\xB8\x8F") != std::string_view::npos) {   // an uncovered code point, or an emoji presentation selector (U+FE0F)
    loadSystemFaces();
    for (size_t i = 0; i < gSys.size(); ++i) { faces.push_back(gSys[i].face.get()); faceFile.push_back(-1 - static_cast<int>(i)); }
  }
  Options o;
  o.size = static_cast<float>(fp->px);
  std::vector<Line> lines = layout(faces, text, o);
  Rendered r;
  float lineH = static_cast<float>(fp->ascent + fp->descent + fp->lineGap), y0 = 0, widest = 0;
  for (const Line& l : lines) {
    float pen = 0;
    for (const Run& run : l.runs) {
      float x = pen;
      for (const Glyph& g : run.glyphs) {
        int ff = faceFile[g.face];
        if (ff < 0 && gSys[-1 - ff].color) {   // a colour glyph from the system emoji font
          const SysFace& sf = gSys[-1 - ff];
          auto ck = std::make_tuple(ff, g.gid, fp->px);
          auto ci = gColors.find(ck);
          if (ci == gColors.end()) { ColorBitmap cb; if (!sbixGlyph(sf.data.data(), sf.data.size(), g.gid, o.size, cb)) cb = ColorBitmap(); ci = gColors.emplace(ck, std::move(cb)).first; }
          const ColorBitmap& c = ci->second;
          if (c.w > 0) {
            r.colors.push_back(c); r.isColor.push_back(1); r.bitmaps.push_back(Bitmap());
            r.glyphs.push_back({static_cast<int32_t>(std::lround(x + g.x)) + c.left, static_cast<int32_t>(std::lround(y0 + g.y)) - c.top, c.w, c.h, nullptr, nullptr});
          }
          x += g.advance + tracking;
          continue;
        }
        auto bk = std::make_tuple(ff, g.gid, fp->px);
        auto bi = gBitmaps.find(bk);
        if (bi == gBitmaps.end()) { Bitmap nb; rasterize(*faces[g.face], g.gid, o.size, nb); bi = gBitmaps.emplace(bk, std::move(nb)).first; }
        const Bitmap& b = bi->second;
        if (b.w > 0 && b.h > 0) {
          r.bitmaps.push_back(b);   // a stable copy for the entry
          r.colors.push_back(ColorBitmap()); r.isColor.push_back(0);
          r.glyphs.push_back({static_cast<int32_t>(std::lround(x + g.x)) + b.left, static_cast<int32_t>(std::lround(y0 + g.y)) - b.top, b.w, b.h, nullptr, nullptr});
        }
        x += g.advance + tracking;
      }
      pen += run.width + tracking * run.glyphs.size();
    }
    widest = std::max(widest, pen);
    y0 += lineH;
  }
  for (size_t i = 0; i < r.glyphs.size(); ++i) { if (r.isColor[i]) r.glyphs[i].rgba = r.colors[i].rgba.data(); else r.glyphs[i].a = r.bitmaps[i].a.data(); }
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
