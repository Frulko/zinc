// The fixed-function replay (ff_replay.h): the platform-free half of targets/vita/gxm_vita.cpp's replay, for the PSP and the 3DS.
#include "ff_replay.h"

#include <stdio.h>
#include <string.h>

#include <map>
#include <vector>

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
    if (gx + w > kAtlasW) { gx = 0; gy += growH; growH = 0; }
    if (gy + gh > kAtlasH || w > kAtlasW) return nullptr;
    uint8_t* mem = atlas_memory(0);
    for (int y = 0; y < g.h; y++) memcpy(mem + (size_t)(gy + y) * kAtlasW + gx, bitmap + g.off + (size_t)y * g.w, g.w);
    atlas_written(0, gx, gy, g.w, g.h);
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

const Cmd* G;   // the linear gradient (grad 1 vertical, 2 horizontal) of the command being drawn: its quads get a colour per corner
uint32_t gradAt(float x, float y) {   // raster.cpp color_at for grad 1 and 2
  float t = G->grad == 1 ? (y - G->y) / (G->h > 0 ? G->h : 1) : (x - G->x) / (G->w > 0 ? G->w : 1);
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  uint32_t out = 0;
  for (int k = 0; k < 24; k += 8) {
    const float a = (float)(G->c1 >> k & 255), b = (float)(G->c2 >> k & 255);
    out |= (uint32_t)(a + (b - a) * t + 0.5f) << k;
  }
  return out;
}
void quad(const void* tex, bool linear, float x0, float y0, float x1, float y1, float u0, float v0, float u1, float v1, uint32_t rgb, float a) {
  if (x0 < clip.x0) { u0 += (u1 - u0) * (clip.x0 - x0) / (x1 - x0); x0 = clip.x0; }
  if (x1 > clip.x1) { u1 -= (u1 - u0) * (x1 - clip.x1) / (x1 - x0); x1 = clip.x1; }
  if (y0 < clip.y0) { v0 += (v1 - v0) * (clip.y0 - y0) / (y1 - y0); y0 = clip.y0; }
  if (y1 > clip.y1) { v1 -= (v1 - v0) * (y1 - clip.y1) / (y1 - y0); y1 = clip.y1; }
  if (x0 >= x1 || y0 >= y1 || a <= 0) return;
  if (G) {
    const uint32_t c[4] = {gradAt(x0, y0), gradAt(x1, y0), gradAt(x0, y1), gradAt(x1, y1)};
    draw_quad4(tex, linear, OX + K * x0, OY + K * y0, OX + K * x1, OY + K * y1, u0, v0, u1, v1, c, a);
  } else draw_quad(tex, linear, OX + K * x0, OY + K * y0, OX + K * x1, OY + K * y1, u0, v0, u1, v1, rgb, a);
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
        quad(atlas(0), false, x, y, x + g->w, y + g->h, (float)gs->x / kAtlasW, (float)gs->y / kAtlasH, (float)(gs->x + g->w) / kAtlasW,
             (float)(gs->y + g->h) / kAtlasH, c.c1, a);
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

// ---- shapes: a single-colour command the raster draws (rounded RECT, BORDER, SHADOW, filled POLY) as its coverage, rasterized once by
// runtime/raster.cpp in white on black and kept in the shape atlas (atlas 1). The coverage of a box is mostly runs of equal columns and rows
// (the straight edges, the inside): the longest run of each is kept as one texel, stretched back by a 9-slice of quads, so a card of any
// size costs its corners. A command that moves keeps its shape when it moves by whole pixels (the key holds the fractions), a POLY too
// (its points are keyed from its box's corner). ponytail: the atlas is emptied when it is full (between frames), no eviction by use.
struct Shape { uint16_t ax, ay, w, h, lx, mx, ly, my; };   // atlas place; full size; the left / top part and the stretched run after it
std::map<uint64_t, Shape> shapes;
int sx, sy, srowH;          // the shape atlas's shelf
std::vector<uint32_t> scratch;
std::vector<uint8_t> cov;
bool shapesFull;

bool isShape(const Cmd& c) {
  switch (c.kind) {
    case RECT: return c.r > 0 && c.grad <= 2;
    case BORDER: case SHADOW: case POLY: return c.grad <= 2;   // one colour, or a linear gradient (the quads' corner colours)
    default: return false;
  }
}
// The shape's pixel box: where its bitmap's first texel is drawn, and its size.
void shapeBox(const Cmd& c, int32_t* x0, int32_t* y0, int32_t* w, int32_t* h) {
  const float e = c.kind == SHADOW ? (c.s > 0.5f ? c.s : 0.5f) + 1 : 1;
  int32_t a = (int32_t)fl(c.x - e), b = (int32_t)fl(c.y - e);
  const int32_t a1 = (int32_t)ce(c.x + c.w + e), b1 = (int32_t)ce(c.y + c.h + e);
  *x0 = a; *y0 = b; *w = a1 - a; *h = b1 - b;
}
uint64_t mix(uint64_t h, const void* p, size_t n) {   // FNV-1a
  const uint8_t* b = static_cast<const uint8_t*>(p);
  for (size_t i = 0; i < n; i++) h = (h ^ b[i]) * 1099511628211ull;
  return h;
}
uint32_t polyFloats(const Cmd& c, const float* p) {   // the contours' floats: [count, x, y, ...] per contour
  uint32_t len = 0;
  for (uint32_t k = 0; k < c.n; k++) len += 1 + 2 * (uint32_t)p[len];
  return len;
}
std::vector<float> moved;   // a POLY's contours moved by whole pixels to its box's corner: a path that moves keeps its shape
const float* movedPoly(const Cmd& c, const float* pts) {
  const float* p = pts + c.off;
  const uint32_t n = polyFloats(c, p);
  const float dx = fl(c.x), dy = fl(c.y);
  moved.assign(p, p + n);
  for (uint32_t len = 0; len < n; len += 1 + 2 * (uint32_t)moved[len])
    for (uint32_t i = 0; i < (uint32_t)moved[len]; i++) { moved[len + 1 + 2 * i] -= dx; moved[len + 2 + 2 * i] -= dy; }
  return moved.data();
}
uint64_t shapeKey(const Cmd& c, const float* pts) {
  uint64_t h = 1469598103934665603ull;
  const uint8_t head[2] = {c.kind, c.pad};
  h = mix(h, head, 2);
  const float f[6] = {c.x - fl(c.x), c.y - fl(c.y), c.w, c.h, c.r, c.s};
  h = mix(h, f, sizeof f);
  if (c.kind != POLY) return h;
  h = mix(h, &c.n, sizeof c.n);
  return mix(h, movedPoly(c, pts), moved.size() * sizeof(float));
}
void emptyShapes() { shapes.clear(); sx = sy = srowH = 0; }

// The shape of `c`, rasterized and placed in the atlas on first use; null when it does not fit (shapesFull: the atlas is full).
const Shape* shape(const Cmd& c, const float* pts) {
  const uint64_t key = shapeKey(c, pts);
  if (auto it = shapes.find(key); it != shapes.end()) return &it->second;
  int32_t bx, by, w, h;
  shapeBox(c, &bx, &by, &w, &h);
  if (w <= 0 || h <= 0 || w > 1024 || h > 1024) return nullptr;
  // in white on black into a buffer as wide as the box's right edge; a box is moved by whole pixels to the buffer's origin
  Cmd t = c;
  t.c1 = t.c2 = 0xFFFFFF; t.alpha = 255; t.grad = 0;
  const int32_t dx = -bx, dy = -by;
  t.x += (float)dx; t.y += (float)dy;
  const int32_t x0 = bx + dx, y0 = by + dy, bw = x0 + w;
  scratch.assign((size_t)bw * h, 0);
  // a POLY's points: moved (shapeKey left them in `moved`) by its box's whole-pixel corner, then by the box's shift
  if (c.kind == POLY) {
    const float ex = (float)(dx + (int32_t)fl(c.x)), ey = (float)(dy + (int32_t)fl(c.y));
    for (uint32_t len = 0; len < moved.size(); len += 1 + 2 * (uint32_t)moved[len])
      for (uint32_t i = 0; i < (uint32_t)moved[len]; i++) { moved[len + 1 + 2 * i] += ex; moved[len + 2 + 2 * i] += ey; }
    t.off = 0;
  }
  const Frame f = {&t, 1, nullptr, c.kind == POLY ? moved.data() : pts};
  render(f, scratch.data(), bw, y0, y0 + h, Rect{x0, y0, bw, y0 + h});
  // the coverage: blend() over black gives (255 k) >> 8, which is k - 1 for k in 1..254
  cov.resize((size_t)w * h);
  for (int32_t y = 0; y < h; y++)
    for (int32_t x = 0; x < w; x++) {
      const uint32_t g = scratch[(size_t)y * bw + x0 + x] >> 8 & 255;
      cov[(size_t)y * w + x] = (uint8_t)(g == 0 || g == 255 ? g : g + 1);
    }
  // the longest run of equal columns, and of equal rows
  auto col = [&](int32_t a, int32_t b) { for (int32_t y = 0; y < h; y++) if (cov[(size_t)y * w + a] != cov[(size_t)y * w + b]) return false; return true; };
  auto row = [&](int32_t a, int32_t b) { return !memcmp(&cov[(size_t)a * w], &cov[(size_t)b * w], (size_t)w); };
  int32_t lx = 0, mx = 0, ly = 0, my = 0;
  for (int32_t a = 0, b; a < w; a = b) { for (b = a + 1; b < w && col(a, b); b++) {} if (b - a > mx) { lx = a; mx = b - a; } }
  for (int32_t a = 0, b; a < h; a = b) { for (b = a + 1; b < h && row(a, b); b++) {} if (b - a > my) { ly = a; my = b - a; } }
  if (mx < 3) mx = 0;   // not worth a stretch: kept whole
  if (my < 3) my = 0;
  const int32_t cw = w - (mx ? mx - 1 : 0), ch = h - (my ? my - 1 : 0);
  if (cw > 256 || ch > 256) return nullptr;
  if (sx + cw > kAtlasW) { sx = 0; sy += srowH; srowH = 0; }
  if (sy + ch > kAtlasH) { shapesFull = true; return nullptr; }
  // the compressed bitmap: column x of it is column x (before the run), lx (the run) or x + mx - 1 (after) of the full one
  uint8_t* mem = atlas_memory(1);
  for (int32_t y = 0; y < ch; y++) {
    const int32_t fy = !my || y <= ly ? y : y + my - 1;
    for (int32_t x = 0; x < cw; x++) mem[(size_t)(sy + y) * kAtlasW + sx + x] = cov[(size_t)fy * w + (!mx || x <= lx ? x : x + mx - 1)];
  }
  atlas_written(1, sx, sy, cw, ch);
  const Shape s = {(uint16_t)sx, (uint16_t)sy, (uint16_t)w, (uint16_t)h, (uint16_t)lx, (uint16_t)mx, (uint16_t)ly, (uint16_t)my};
  sx += cw + 1;
  if (ch + 1 > srowH) srowH = ch + 1;
  return &(shapes[key] = s);
}

// The 9-slice of a shape: up to three spans a side (before the run, the run from one texel, after it).
void drawShape(const Cmd& c, const float* pts) {
  const Shape* s = shape(c, pts);
  if (!s) return;
  int32_t bx, by, w, h;
  shapeBox(c, &bx, &by, &w, &h);
  struct Span { int32_t p0, p1, t0, t1; };
  auto spans = [](int32_t n, int32_t l, int32_t m, Span* out) {
    if (!m) { out[0] = Span{0, n, 0, n}; return 1; }
    int k = 0;
    if (l > 0) out[k++] = Span{0, l, 0, l};
    out[k++] = Span{l, l + m, l, l + 1};
    if (l + m < n) out[k++] = Span{l + m, n, l + 1, n - m + 1};
    return k;
  };
  Span xs[3], ys[3];
  const int nx = spans(w, s->lx, s->mx, xs), ny = spans(h, s->ly, s->my, ys);
  const float a = (float)c.alpha / 255;
  G = c.grad ? &c : nullptr;
  for (int j = 0; j < ny; j++)
    for (int i = 0; i < nx; i++)
      quad(atlas(1), false, (float)(bx + xs[i].p0), (float)(by + ys[j].p0), (float)(bx + xs[i].p1), (float)(by + ys[j].p1),
           (float)(s->ax + xs[i].t0) / kAtlasW, (float)(s->ay + ys[j].t0) / kAtlasH, (float)(s->ax + xs[i].t1) / kAtlasW,
           (float)(s->ay + ys[j].t1) / kAtlasH, c.c1, a);
  G = nullptr;
}
}  // namespace

// The first command of a kind the replay does not draw, once on the log (why a program's frames are the software raster's).
bool refuse(const Cmd& m) {
  static uint32_t told;
  if (!(told & 1u << (m.kind & 31))) {
    told |= 1u << (m.kind & 31);
    static const char* const names[] = {"CLEAR", "RECT", "BORDER", "SHADOW", "LINE", "TEXT", "IMAGE", "POLY", "CLIP", "UNCLIP", "STROKE", "XFORM", "SHADER"};
    char b[160];
    const int k = snprintf(b, sizeof b, "gpu replay: a frame with a %s (radius %g, gradient %d) is rasterized in software\n",
                           m.kind < 13 ? names[m.kind] : "command", (double)m.r, (int)m.grad);
    if (k > 0) hal_log(b, (size_t)k);
  }
  return false;
}

bool drawable(const HalCmdList* const* l, int32_t n) {
  for (int pass = 0; pass < 2; pass++) {   // a second pass when the shape atlas filled up: emptied, the frame's shapes put back
    shapesFull = false;
    bool ok = true;
    for (int32_t k = 0; k < n && ok; k++) {
      const Cmd* c = static_cast<const Cmd*>(l[k]->cmds);
      for (uint32_t i = 0; i < l[k]->count && ok; i++) {
        const Cmd& m = c[i];
        int32_t w, h;
        if (isShape(m)) { ok = shape(m, l[k]->pts) != nullptr || (!shapesFull && refuse(m)); continue; }
        switch (m.kind) {
          case CLEAR: case UNCLIP: break;
          case RECT: if (m.grad > 2) ok = refuse(m); break;   // radial and paint records: the software raster
          case CLIP: if (m.r > 0) ok = refuse(m); break;
          case TEXT: { const Font* f = font_at(m.res); if (f && f->count == 0 && m.res < font_count) ok = refuse(m); break; }   // an outline font the tables cannot read
          case IMAGE:
            if (image_radius(m) > 0 || image_blend(m) != BLEND_NORMAL || (m.pad & kImageLayer)) ok = refuse(m);
            else if (!texture(m.res, &w, &h)) ok = false;   // too large for the GPU, or no memory left for it
            break;
          default: ok = refuse(m);
        }
      }
    }
    if (ok) return true;
    if (!shapesFull || pass || quads_pending()) return false;
    emptyShapes();
  }
  return false;
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
      case RECT:
        if (c.r > 0) drawShape(c, l->pts);
        else {
          G = c.grad ? &c : nullptr;
          quad(nullptr, false, fl(c.x), fl(c.y), ce(c.x + c.w), ce(c.y + c.h), 0, 0, 0, 0, c.c1, (float)c.alpha / 255);
          G = nullptr;
        }
        break;
      case BORDER: case SHADOW: case POLY: drawShape(c, l->pts); break;
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
