// The fixed-function replay (ff_replay.h): the platform-free half of targets/vita/gxm_vita.cpp's replay, for the PSP and the 3DS.
#include "ff_replay.h"

#include <string.h>

#include "zrt_raster.h"

using namespace zrt::raster;

namespace zn::ff {
namespace {
struct GSlot { int32_t font; uint32_t cp; int16_t x, y; };
GSlot gtab[4096];
int gx, gy, growH, gcount;
// A glyph's place in the atlas, copied on first use; null when the atlas is full. ponytail: never evicted, a reset when a program needs more
// than 512x512 of distinct glyphs is the upgrade.
const GSlot* glyph(int32_t font, uint32_t cp, const Glyph& g, const uint8_t* bitmap) {
  uint32_t h = ((uint32_t)font * 2654435761u) ^ (cp * 40503u);
  for (int probe = 0; probe < 4096; probe++, h++) {
    GSlot& s = gtab[h & 4095];
    if (s.font == font + 1 && s.cp == cp) return &s;
    if (s.font) continue;
    if (gcount >= 3072) return nullptr;
    const int w = g.w + 1, gh = g.h + 1;   // a texel of space between glyphs
    if (gx + w > kGlyphW) { gx = 0; gy += growH; growH = 0; }
    if (gy + gh > kGlyphH || w > kGlyphW) return nullptr;
    uint8_t* mem = glyph_memory();
    for (int y = 0; y < g.h; y++) memcpy(mem + (size_t)(gy + y) * kGlyphW + gx, bitmap + g.off + (size_t)y * g.w, g.w);
    glyphs_written(gx, gy, g.w, g.h);
    s = GSlot{font + 1, cp, (int16_t)gx, (int16_t)gy};
    gx += w; if (gh > growH) growH = gh;
    gcount++;
    return &s;
  }
  return nullptr;
}
const Glyph* glyphOf(int32_t font, const Font& f, uint32_t cp) {   // raster.cpp glyph_of without its ASCII table
  if (font >= RUNTIME_FONT_BASE) return runtime_glyph(font, cp);
  int32_t lo = 0, hi = f.count - 1;
  while (lo <= hi) { const int32_t m = (lo + hi) >> 1; if (f.glyphs[m].cp == cp) return &f.glyphs[m]; if (f.glyphs[m].cp < cp) lo = m + 1; else hi = m - 1; }
  return nullptr;
}
uint32_t nextCp(const char* s, uint32_t n, uint32_t& i) {
  const uint8_t c = (uint8_t)s[i];
  const uint32_t w = c < 0x80 ? 1 : c < 0xE0 ? 2 : c < 0xF0 ? 3 : 4;
  uint32_t cp = c < 0x80 ? c : c < 0xE0 ? c & 0x1F : c < 0xF0 ? c & 0x0F : c & 0x07;
  for (uint32_t k = 1; k < w && i + k < n; k++) cp = (cp << 6) | ((uint8_t)s[i + k] & 0x3F);
  i += w;
  return cp;
}

float K = 1, OX = 0, OY = 0;
struct Clip { float x0, y0, x1, y1; };
Clip clip;

void quad(const void* tex, bool linear, float x0, float y0, float x1, float y1, float u0, float v0, float u1, float v1, uint32_t rgb, float a) {
  if (x0 < clip.x0) { u0 += (u1 - u0) * (clip.x0 - x0) / (x1 - x0); x0 = clip.x0; }
  if (x1 > clip.x1) { u1 -= (u1 - u0) * (x1 - clip.x1) / (x1 - x0); x1 = clip.x1; }
  if (y0 < clip.y0) { v0 += (v1 - v0) * (clip.y0 - y0) / (y1 - y0); y0 = clip.y0; }
  if (y1 > clip.y1) { v1 -= (v1 - v0) * (y1 - clip.y1) / (y1 - y0); y1 = clip.y1; }
  if (x0 >= x1 || y0 >= y1 || a <= 0) return;
  draw_quad(tex, linear, OX + K * x0, OY + K * y0, OX + K * x1, OY + K * y1, u0, v0, u1, v1, rgb, a);
}
float fl(float v) { const float i = (float)(int32_t)v; return i > v ? i - 1 : i; }
float ce(float v) { const float i = (float)(int32_t)v; return i < v ? i + 1 : i; }

void text(const Cmd& c, const char* s) {
  const Font* fp = font_at(c.res);
  if (!fp) return;
  const Font& f = *fp;
  // a baked font's ASCII glyphs go into the atlas at its first use, together: an emulator that caches textures sees one upload
  static bool loaded[64];
  if (c.res >= 0 && c.res < 64 && !loaded[c.res]) {
    loaded[c.res] = true;
    for (int32_t i = 0; i < f.count; i++) if (f.glyphs[i].cp < 128 && f.glyphs[i].w && f.glyphs[i].h) glyph(c.res, f.glyphs[i].cp, f.glyphs[i], f.bitmap);
  }
  // raster.cpp draw_text: the pen in 26.6, glyphs on whole pixels, the baseline at the rounded y plus the ascent
  int32_t pen = (int32_t)fl(c.x * 64);
  const int32_t base = (int32_t)fl(c.y + 0.5f) + f.ascent, track = (int32_t)(c.s * 64);
  const float a = (float)c.alpha / 255;
  for (uint32_t i = 0; i < c.n;) {
    const uint32_t cp = nextCp(s, c.n, i);
    const Glyph* g = glyphOf(c.res, f, cp);
    if (!g && !ignorable_cp(cp)) g = glyphOf(c.res, f, '?');
    if (!g) continue;
    if (g->w && g->h) {
      const Font* bf = c.res >= RUNTIME_FONT_BASE ? font_at(c.res) : &f;
      if (const GSlot* gs = glyph(c.res, cp, *g, bf->bitmap)) {
        const float x = (float)(((pen + 32) >> 6) + g->x0), y = (float)(base + g->y0);
        quad(glyphs(), false, x, y, x + g->w, y + g->h, (float)gs->x / kGlyphW, (float)gs->y / kGlyphH, (float)(gs->x + g->w) / kGlyphW,
             (float)(gs->y + g->h) / kGlyphH, c.c1, a);
      }
    }
    pen += g->adv + track;
  }
}

void image(const Cmd& c) {
  if (!(c.w > 0 && c.h > 0 && c.w < 1e30f && c.h < 1e30f)) return;
  int32_t tw, th;
  const void* t = texture(c.res, &tw, &th);
  if (!t) return;
  const Box b = image_box(c);   // the box the whole image covers; what of it lies over the painted rectangle is drawn
  if (!(b.w != 0 && b.h != 0)) return;
  // the pixels the rasterizer paints: floor / ceil of the rectangle, within the box
  const float bx0 = b.w < 0 ? b.x + b.w : b.x, bx1 = b.w < 0 ? b.x : b.x + b.w, by0 = b.h < 0 ? b.y + b.h : b.y, by1 = b.h < 0 ? b.y : b.y + b.h;
  float x0 = fl(c.x), y0 = fl(c.y), x1 = ce(c.x + c.w), y1 = ce(c.y + c.h);
  if (fl(bx0) > x0) x0 = fl(bx0);
  if (fl(by0) > y0) y0 = fl(by0);
  if (ce(bx1) < x1) x1 = ce(bx1);
  if (ce(by1) < y1) y1 = ce(by1);
  if (x0 >= x1 || y0 >= y1) return;
  const float u0 = (x0 - b.x) / b.w, u1 = (x1 - b.x) / b.w, v0 = (y0 - b.y) / b.h, v1 = (y1 - b.y) / b.h;
  const bool whole = (b.w == (float)tw || b.w == -(float)tw) && (b.h == (float)th || b.h == -(float)th) && b.x == fl(b.x) && b.y == fl(b.y);
  quad(t, !(c.grad == 1 || whole), x0, y0, x1, y1, u0, v0, u1, v1, image_tint(c), (float)c.alpha / 255);
}
}  // namespace

bool drawable(const HalCmdList* const* l, int32_t n) {
  for (int32_t k = 0; k < n; k++) {
    const Cmd* c = static_cast<const Cmd*>(l[k]->cmds);
    for (uint32_t i = 0; i < l[k]->count; i++) {
      const Cmd& m = c[i];
      int32_t w, h;
      switch (m.kind) {
        case CLEAR: case UNCLIP: break;
        case RECT: if (m.r > 0 || m.grad) return false; break;
        case CLIP: if (m.r > 0) return false; break;
        case TEXT: { const Font* f = font_at(m.res); if (f && f->count == 0 && m.res < font_count) return false; break; }   // an outline font the tables cannot read
        case IMAGE:
          if (image_radius(m) > 0 || image_blend(m) != BLEND_NORMAL || (m.pad & kImageLayer)) return false;
          if (!texture(m.res, &w, &h)) return false;   // too large for the GPU, or no memory left for it
          break;
        default: return false;
      }
    }
  }
  return true;
}

void replay(const HalCmdList* l, int32_t w, int32_t h, float k, float ox, float oy) {
  K = k; OX = ox; OY = oy;
  const Cmd* cmds = static_cast<const Cmd*>(l->cmds);
  Clip stack[16];
  int sp = 0;
  clip = Clip{0, 0, (float)w, (float)h};
  for (uint32_t i = 0; i < l->count; i++) {
    const Cmd& c = cmds[i];
    switch (c.kind) {
      case CLEAR: quad(nullptr, false, clip.x0, clip.y0, clip.x1, clip.y1, 0, 0, 0, 0, c.c1, 1); break;
      case RECT: quad(nullptr, false, fl(c.x), fl(c.y), ce(c.x + c.w), ce(c.y + c.h), 0, 0, 0, 0, c.c1, (float)c.alpha / 255); break;
      case TEXT: text(c, l->text + c.off); break;
      case IMAGE: image(c); break;
      case CLIP:
        if (sp < 16) {
          stack[sp++] = clip;
          const float x0 = fl(c.x), y0 = fl(c.y), x1 = ce(c.x + c.w), y1 = ce(c.y + c.h);
          clip = Clip{x0 > clip.x0 ? x0 : clip.x0, y0 > clip.y0 ? y0 : clip.y0, x1 < clip.x1 ? x1 : clip.x1, y1 < clip.y1 ? y1 : clip.y1};
        }
        break;
      case UNCLIP: if (sp > 0) clip = stack[--sp]; break;
      default: break;
    }
  }
}

void full(const void* tex, int32_t w, int32_t h, float k, float ox, float oy) {
  K = k; OX = ox; OY = oy;
  clip = Clip{0, 0, (float)w, (float)h};
  quad(tex, false, 0, 0, (float)w, (float)h, 0, 0, 1, 1, 0xFFFFFF, 1);
}
}  // namespace zn::ff
