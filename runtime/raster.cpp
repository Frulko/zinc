// Software rasterizer (see zrt_raster.h). Pixels are 0x00RRGGBB; coverage-based anti-aliasing everywhere.
// ponytail: float math per pixel near edges; a fixed-point path would help FPU-less targets (ps1).
#include "zrt.h"
#include "zrt_raster.h"

namespace zrt { namespace raster {

static inline float fabsf_(float v) { return v < 0 ? -v : v; }
static inline float clampf(float v, float a, float b) { return v < a ? a : v > b ? b : v; }
static inline int32_t ifloor(float v) { int32_t i = (int32_t)v; return (float)i > v ? i - 1 : i; }
static inline int32_t iceil(float v) { int32_t i = (int32_t)v; return (float)i < v ? i + 1 : i; }

static inline void blend(uint32_t& d, uint32_t c, uint32_t a) {
  if (a >= 255) { d = c; return; }
  if (!a) return;
  uint32_t rb = (((c & 0xFF00FF) * a + (d & 0xFF00FF) * (255 - a)) >> 8) & 0xFF00FF;
  uint32_t g = (((c & 0x00FF00) * a + (d & 0x00FF00) * (255 - a)) >> 8) & 0x00FF00;
  d = rb | g;
}
static inline uint32_t lerp_color(uint32_t a, uint32_t b, float t) {
  uint32_t k = (uint32_t)clampf(t * 256, 0, 256);
  uint32_t rb = (((a & 0xFF00FF) * (256 - k) + (b & 0xFF00FF) * k) >> 8) & 0xFF00FF;
  uint32_t g = (((a & 0x00FF00) * (256 - k) + (b & 0x00FF00) * k) >> 8) & 0x00FF00;
  return rb | g;
}
/** Signed distance to a rounded box centred on (cx, cy) with half extents (hw, hh). */
static inline float rr_sdf(float px, float py, float cx, float cy, float hw, float hh, float r) {
  float qx = fabsf_(px - cx) - (hw - r), qy = fabsf_(py - cy) - (hh - r);
  float ox = qx > 0 ? qx : 0, oy = qy > 0 ? qy : 0;
  float m = qx > qy ? qx : qy;
  return __builtin_sqrtf(ox * ox + oy * oy) + (m < 0 ? m : 0) - r;
}

struct Target { uint32_t* px; int32_t w, y0; Rect clip; };
static inline uint32_t& at(const Target& t, int32_t x, int32_t y) { return t.px[(y - t.y0) * t.w + x]; }
static Rect intersect(Rect a, Rect b) {
  Rect r = {a.x0 > b.x0 ? a.x0 : b.x0, a.y0 > b.y0 ? a.y0 : b.y0, a.x1 < b.x1 ? a.x1 : b.x1, a.y1 < b.y1 ? a.y1 : b.y1};
  return r;
}
static Rect bounds(float x, float y, float w, float h, const Rect& clip) {
  Rect r = {ifloor(x), ifloor(y), iceil(x + w), iceil(y + h)};
  return intersect(r, clip);
}

// ---------------------------------------------------------------- rounded rectangles, gradients, borders, shadows
static uint32_t color_at(const Cmd& c, float px, float py) {
  if (c.grad == 1) return lerp_color(c.c1, c.c2, (py - c.y) / (c.h > 0 ? c.h : 1));
  if (c.grad == 2) return lerp_color(c.c1, c.c2, (px - c.x) / (c.w > 0 ? c.w : 1));
  if (c.grad == 3) {  // radial: c1 at the centre -> c2 at the box edge
    float dx = (px - c.x) / (c.w > 0 ? c.w : 1) * 2 - 1, dy = (py - c.y) / (c.h > 0 ? c.h : 1) * 2 - 1;
    return lerp_color(c.c1, c.c2, __builtin_sqrtf(dx * dx + dy * dy));
  }
  return c.c1;
}
static void fill_rrect(const Target& t, const Cmd& c) {
  Rect b = bounds(c.x, c.y, c.w, c.h, t.clip);
  if (b.x0 >= b.x1 || b.y0 >= b.y1) return;
  float hw = c.w * 0.5f, hh = c.h * 0.5f, cx = c.x + hw, cy = c.y + hh;
  float r = clampf(c.r, 0, hw < hh ? hw : hh);
  int32_t in0 = iceil(c.x + r + 1), in1 = ifloor(c.x + c.w - r - 1);
  for (int32_t y = b.y0; y < b.y1; y++) {
    float py = y + 0.5f;
    bool edge_row = fabsf_(py - cy) > hh - (r > 1 ? r : 1);
    uint32_t row_color = c.grad == 1 ? color_at(c, 0, py) : c.c1;
    for (int32_t x = b.x0; x < b.x1; x++) {
      if (!edge_row && x >= in0 && x < in1 && c.grad != 2) {
        int32_t e = in1 < b.x1 ? in1 : b.x1;
        if (c.alpha == 255) for (; x < e; x++) at(t, x, y) = row_color;
        else for (; x < e; x++) blend(at(t, x, y), row_color, c.alpha);
        x--;
        continue;
      }
      float px = x + 0.5f;
      float cov = clampf(0.5f - rr_sdf(px, py, cx, cy, hw, hh, r), 0, 1);
      if (cov > 0) blend(at(t, x, y), c.grad == 2 ? color_at(c, px, py) : row_color, (uint32_t)(cov * c.alpha));
    }
  }
}
static void border_rrect(const Target& t, const Cmd& c) {
  Rect b = bounds(c.x, c.y, c.w, c.h, t.clip);
  float hw = c.w * 0.5f, hh = c.h * 0.5f, cx = c.x + hw, cy = c.y + hh, bw = c.s;
  float r = clampf(c.r, 0, hw < hh ? hw : hh), ri = r - bw > 0 ? r - bw : 0;
  for (int32_t y = b.y0; y < b.y1; y++) {
    float py = y + 0.5f;
    for (int32_t x = b.x0; x < b.x1; x++) {
      float px = x + 0.5f;
      float outer = clampf(0.5f - rr_sdf(px, py, cx, cy, hw, hh, r), 0, 1);
      if (outer <= 0) continue;
      float inner = clampf(0.5f - rr_sdf(px, py, cx, cy, hw - bw, hh - bw, ri), 0, 1);
      float cov = outer - inner;
      if (cov > 0) blend(at(t, x, y), c.c1, (uint32_t)(cov * c.alpha));
    }
  }
}
static void shadow_rrect(const Target& t, const Cmd& c) {
  float blur = c.s > 0.5f ? c.s : 0.5f;
  Rect b = bounds(c.x - blur, c.y - blur, c.w + 2 * blur, c.h + 2 * blur, t.clip);
  float hw = c.w * 0.5f, hh = c.h * 0.5f, cx = c.x + hw, cy = c.y + hh;
  float r = clampf(c.r, 0, hw < hh ? hw : hh);
  for (int32_t y = b.y0; y < b.y1; y++) {
    float py = y + 0.5f;
    for (int32_t x = b.x0; x < b.x1; x++) {
      float d = rr_sdf(x + 0.5f, py, cx, cy, hw, hh, r);
      float k = clampf(1.0f - (d + blur * 0.5f) / (blur * 1.5f), 0, 1);
      k = k * k * (3 - 2 * k);
      if (k > 0) blend(at(t, x, y), c.c1, (uint32_t)(k * c.alpha));
    }
  }
}

// ---------------------------------------------------------------- polygons (nonzero or even-odd, 4x4 supersampling)
// Edges are bucketed by their first row once per call and walked with an active list, so the cost follows the rows
// each edge spans, not rows x edges (map tiles and SVG art have thousands of edges).
struct Edge { float y0, y1, x0, dxdy; int32_t d, next; };
template<class T> static T* scratch(T*& buf, uint32_t& cap, uint32_t need) {
  if (need <= cap) return buf;
  uint32_t n = cap ? cap : 256;
  while (n < need) n *= 2;
  T* nb = (T*)hal_alloc((size_t)n * sizeof(T));
  if (!nb) return nullptr;
  __builtin_memset(nb, 0, (size_t)n * sizeof(T));
  if (buf) { __builtin_memcpy(nb, buf, (size_t)cap * sizeof(T)); hal_free(buf); }
  buf = nb; cap = n;
  return buf;
}
static Edge* edges; static uint32_t edge_cap;
static int32_t* heads; static uint32_t head_cap;
static uint16_t* accs; static uint32_t acc_cap;
static int32_t* actives; static uint32_t active_cap;
static int16_t* wds; static uint32_t wd_cap;  // all zero between uses
static void fill_poly(const Target& t, const Cmd& c, const float* pts) {
  Rect b = bounds(c.x, c.y, c.w, c.h, t.clip);
  if (b.x0 >= b.x1 || b.y0 >= b.y1) return;
  int32_t bw = b.x1 - b.x0, rows = b.y1 - b.y0;
  if (!scratch(heads, head_cap, (uint32_t)rows) || !scratch(accs, acc_cap, (uint32_t)bw)) return;
  for (int32_t i = 0; i < rows; i++) heads[i] = -1;
  uint32_t ne = 0;
  const float* p = pts;
  for (uint32_t k = 0; k < c.n; k++) {
    int32_t cnt = (int32_t)p[0];
    const float* v = p + 1;
    for (int32_t i = 0; i < cnt; i++) {
      int32_t j = i + 1 == cnt ? 0 : i + 1;
      float ax = v[i * 2], ay = v[i * 2 + 1], bx = v[j * 2], by = v[j * 2 + 1];
      if (ay == by) continue;
      int32_t d = 1;
      if (ay > by) { float tx = ax, ty = ay; ax = bx; ay = by; bx = tx; by = ty; d = -1; }
      if (by <= b.y0 || ay >= b.y1) continue;
      if (!scratch(edges, edge_cap, ne + 1)) return;
      int32_t row = ay <= b.y0 ? 0 : ifloor(ay) - b.y0;
      edges[ne] = Edge{ay, by, ax, (bx - ax) / (by - ay), d, heads[row]};
      heads[row] = (int32_t)ne++;
    }
    p += 1 + cnt * 2;
  }
  if (!ne || !scratch(actives, active_cap, ne) || !scratch(wds, wd_cap, (uint32_t)bw * 4 + 4)) return;
  bool evenodd = c.pad & 1;
  int32_t* active = actives; int16_t* wd = wds;
  uint32_t na = 0;
  uint16_t* acc = accs;
  for (int32_t i = 0; i < bw; i++) acc[i] = 0;
  for (int32_t y = b.y0; y < b.y1; y++) {
    for (int32_t e = heads[y - b.y0]; e >= 0; e = edges[e].next) active[na++] = e;
    if (!na) continue;
    int32_t lo = bw, hi = -1;
    for (int s = 0; s < 4; s++) {
      float sy = y + (s + 0.5f) / 4;
      // winding deltas per subsample column, then one sweep: no sorting of crossings
      int32_t qlo = bw * 4, qhi = -1;
      for (uint32_t a = 0; a < na; a++) {
        const Edge& e = edges[active[a]];
        if (sy < e.y0 || sy >= e.y1) continue;
        int32_t q = iceil((e.x0 + (sy - e.y0) * e.dxdy - b.x0) * 4 - 0.5f);
        if (q < 0) q = 0;
        if (q > bw * 4) q = bw * 4;
        wd[q] = (int16_t)(wd[q] + e.d);
        if (q < qlo) qlo = q;
        if (q > qhi) qhi = q;
      }
      if (qhi < 0) continue;
      int32_t wind = 0, p1 = qhi >> 2;
      if ((qlo >> 2) < lo) lo = qlo >> 2;
      if (p1 > hi) hi = p1 < bw ? p1 : bw - 1;
      for (int32_t px = qlo >> 2; px <= p1; px++) {  // 4 subsamples per pixel; runs without crossings in one step
        int16_t* w4 = wd + px * 4;
        uint64_t any; __builtin_memcpy(&any, w4, 8);
        if (!any) { if ((evenodd ? (wind & 1) : wind) && px < bw) acc[px] += 4; continue; }
        for (int k = 0; k < 4; k++) { wind += w4[k]; w4[k] = 0; if ((evenodd ? (wind & 1) : wind) && px < bw) acc[px]++; }
      }
    }
    for (int32_t i = lo; i <= hi; i++) {
      uint32_t k = acc[i];
      if (!k) continue;
      acc[i] = 0;
      uint32_t col = c.grad ? color_at(c, b.x0 + i + 0.5f, y + 0.5f) : c.c1;
      if (k >= 16 && c.alpha == 255) at(t, b.x0 + i, y) = col;
      else blend(at(t, b.x0 + i, y), col, k * c.alpha / 16);
    }
    uint32_t keep = 0;  // drop edges that end in this row
    for (uint32_t a = 0; a < na; a++) if (edges[active[a]].y1 > y + 1) active[keep++] = active[a];
    na = keep;
  }
}

// ---------------------------------------------------------------- text and images
static const Glyph* glyph_of(const Font& f, uint32_t cp) {
  int32_t lo = 0, hi = f.count - 1;
  while (lo <= hi) { int32_t m = (lo + hi) >> 1; if (f.glyphs[m].cp == cp) return &f.glyphs[m]; if (f.glyphs[m].cp < cp) lo = m + 1; else hi = m - 1; }
  return nullptr;
}
static uint32_t next_cp(const char* s, uint32_t n, uint32_t& i) {
  uint8_t c = (uint8_t)s[i];
  uint32_t w = c < 0x80 ? 1 : c < 0xE0 ? 2 : c < 0xF0 ? 3 : 4, cp = c < 0x80 ? c : c < 0xE0 ? c & 0x1F : c < 0xF0 ? c & 0x0F : c & 0x07;
  for (uint32_t k = 1; k < w && i + k < n; k++) cp = (cp << 6) | ((uint8_t)s[i + k] & 0x3F);
  i += w;
  return cp;
}
int32_t text_advance(int32_t font, const char* s, uint32_t n, float tracking) {
  if (font < 0 || font >= font_count) return 0;
  const Font& f = fonts[font];
  int32_t pen = 0;
  for (uint32_t i = 0; i < n;) {
    const Glyph* g = glyph_of(f, next_cp(s, n, i));
    if (!g) g = glyph_of(f, '?');
    if (g) pen += g->adv + (int32_t)(tracking * 64);
  }
  return pen;
}
static void draw_text(const Target& t, const Cmd& c, const char* s) {
  if (c.res < 0 || c.res >= font_count) return;
  const Font& f = fonts[c.res];
  int32_t pen = (int32_t)(c.x * 64), base = (int32_t)(c.y + 0.5f) + f.ascent;
  for (uint32_t i = 0; i < c.n;) {
    const Glyph* g = glyph_of(f, next_cp(s, c.n, i));
    if (!g) g = glyph_of(f, '?');
    if (!g) continue;
    int32_t gx = ((pen + 32) >> 6) + g->x0, gy = base + g->y0;
    for (int32_t yy = 0; yy < g->h; yy++) {
      int32_t y = gy + yy;
      if (y < t.clip.y0 || y >= t.clip.y1) continue;
      const uint8_t* row = f.bitmap + g->off + yy * g->w;
      for (int32_t xx = 0; xx < g->w; xx++) {
        int32_t x = gx + xx;
        if (x < t.clip.x0 || x >= t.clip.x1 || !row[xx]) continue;
        blend(at(t, x, y), c.c1, (uint32_t)row[xx] * c.alpha / 255);
      }
    }
    pen += g->adv + (int32_t)(c.s * 64);
  }
}
// ---------------------------------------------------------------- runtime images
#ifndef ZRT_DYN_IMAGES
#define ZRT_DYN_IMAGES 64
#endif
struct Dyn { const uint32_t* px; uint32_t* owned; int32_t w, h, stride; uint32_t version; bool used; };
static Dyn dyn[ZRT_DYN_IMAGES];
static Dyn* dyn_at(int32_t id) { id -= DYN_BASE; return id >= 0 && id < ZRT_DYN_IMAGES && dyn[id].used ? &dyn[id] : nullptr; }
int32_t dyn_wrap(int32_t w, int32_t h, const uint32_t* px, int32_t stride) {
  for (int32_t i = 0; i < ZRT_DYN_IMAGES; i++) if (!dyn[i].used) { dyn[i] = Dyn{px, nullptr, w, h, stride ? stride : w, 1, true}; return DYN_BASE + i; }
  return -1;
}
int32_t dyn_create(int32_t w, int32_t h) {
  uint32_t* px = (uint32_t*)hal_alloc((size_t)w * h * 4);
  if (!px) return -1;
  __builtin_memset(px, 0, (size_t)w * h * 4);
  int32_t id = dyn_wrap(w, h, px, w);
  if (id < 0) hal_free(px); else dyn_at(id)->owned = px;
  return id;
}
void dyn_update(int32_t id, const uint32_t* px, int32_t stride) {
  if (Dyn* d = dyn_at(id)) { if (px) { d->px = px; if (stride) d->stride = stride; } d->version++; }
}
uint32_t* dyn_pixels(int32_t id) { Dyn* d = dyn_at(id); return d ? d->owned : nullptr; }
void dyn_resize(int32_t id, int32_t w, int32_t h) {
  Dyn* d = dyn_at(id);
  if (!d || !d->owned || (d->w == w && d->h == h)) return;
  hal_free(d->owned);
  d->owned = (uint32_t*)hal_alloc((size_t)w * h * 4);
  __builtin_memset(d->owned, 0, (size_t)w * h * 4);
  d->px = d->owned; d->w = w; d->h = h; d->stride = w; d->version++;
}
void dyn_destroy(int32_t id) { if (Dyn* d = dyn_at(id)) { if (d->owned) hal_free(d->owned); *d = Dyn{}; } }
bool image_size(int32_t id, int32_t* w, int32_t* h) {
  if (id >= 0 && id < image_count) { *w = images[id].w; *h = images[id].h; return true; }
  if (Dyn* d = dyn_at(id)) { *w = d->w; *h = d->h; return true; }
  *w = *h = 0; return false;
}
bool dyn_view(int32_t id, const uint32_t** px, int32_t* w, int32_t* h, int32_t* stride) {
  Dyn* d = dyn_at(id);
  if (!d || !d->px) return false;
  *px = d->px; *w = d->w; *h = d->h; *stride = d->stride; return true;
}
uint32_t image_version(int32_t id) { Dyn* d = dyn_at(id); return d ? d->version : 0; }

static void draw_dyn(const Target& t, const Cmd& c, const Dyn& im) {
  Rect b = bounds(c.x, c.y, c.w, c.h, t.clip);
  if (b.x0 >= b.x1 || b.y0 >= b.y1) return;
  bool plain = c.alpha == 255 && c.r <= 0;
  // 16.16 stepping, nearest sample: the fast path for video and camera frames (1:1 is a row copy)
  int32_t sx = (int32_t)((float)im.w / c.w * 65536), sy = (int32_t)((float)im.h / c.h * 65536);
  bool nearest = c.grad == 1 || (sx == 65536 && sy == 65536);
  float hw = c.w * 0.5f, hh = c.h * 0.5f, cx = c.x + hw, cy = c.y + hh;
  for (int32_t y = b.y0; y < b.y1; y++) {
    if (nearest) {
      int32_t iy = (int32_t)(((int64_t)((y - c.y) * 65536)) * sy >> 32); if (iy < 0) iy = 0; if (iy >= im.h) iy = im.h - 1;
      const uint32_t* src = im.px + (size_t)iy * im.stride;
      int32_t fx0 = (int32_t)((b.x0 + 0.5f - c.x) * sx);
      if (plain && sx == 65536) { int32_t ix = fx0 >> 16; if (ix < 0) ix = 0; int32_t n = b.x1 - b.x0; if (ix + n > im.w) n = im.w - ix; if (n > 0) __builtin_memcpy(&at(t, b.x0, y), src + ix, (size_t)n * 4); continue; }
      for (int32_t x = b.x0, fx = fx0; x < b.x1; x++, fx += sx) {
        int32_t ix = fx >> 16; if (ix >= im.w) ix = im.w - 1;
        uint32_t a = c.alpha;
        if (c.r > 0) a = (uint32_t)(a * clampf(0.5f - rr_sdf(x + 0.5f, y + 0.5f, cx, cy, hw, hh, c.r), 0, 1));
        if (a >= 255) at(t, x, y) = src[ix] & 0xFFFFFF; else if (a) blend(at(t, x, y), src[ix] & 0xFFFFFF, a);
      }
      continue;
    }
    float fy = (y + 0.5f - c.y) * im.h / c.h - 0.5f;
    int32_t y0i = ifloor(fy); float ty = fy - y0i;
    int32_t ya = y0i < 0 ? 0 : y0i >= im.h ? im.h - 1 : y0i, yb = y0i + 1 >= im.h ? im.h - 1 : y0i + 1 < 0 ? 0 : y0i + 1;
    for (int32_t x = b.x0; x < b.x1; x++) {
      float fx = (x + 0.5f - c.x) * im.w / c.w - 0.5f;
      int32_t x0i = ifloor(fx); float tx = fx - x0i;
      int32_t xa = x0i < 0 ? 0 : x0i >= im.w ? im.w - 1 : x0i, xb = x0i + 1 >= im.w ? im.w - 1 : x0i + 1 < 0 ? 0 : x0i + 1;
      uint32_t p00 = im.px[ya * im.stride + xa], p01 = im.px[ya * im.stride + xb], p10 = im.px[yb * im.stride + xa], p11 = im.px[yb * im.stride + xb];
      uint32_t out = 0;
      for (int k = 0; k < 24; k += 8) {
        float v = (((p00 >> k) & 255) * (1 - tx) + ((p01 >> k) & 255) * tx) * (1 - ty) + (((p10 >> k) & 255) * (1 - tx) + ((p11 >> k) & 255) * tx) * ty;
        out |= (uint32_t)v << k;
      }
      float a = c.alpha;
      if (c.r > 0) a *= clampf(0.5f - rr_sdf(x + 0.5f, y + 0.5f, cx, cy, hw, hh, c.r), 0, 1);
      if (a >= 255) at(t, x, y) = out; else if (a >= 1) blend(at(t, x, y), out, (uint32_t)a);
    }
  }
}

static void draw_image(const Target& t, const Cmd& c) {
  if (c.w <= 0 || c.h <= 0) return;
  if (const Dyn* d = dyn_at(c.res)) { if (d->px) draw_dyn(t, c, *d); return; }
  if (c.res < 0 || c.res >= image_count) return;
  const Image& im = images[c.res];
  Rect b = bounds(c.x, c.y, c.w, c.h, t.clip);
  float hw = c.w * 0.5f, hh = c.h * 0.5f, cx = c.x + hw, cy = c.y + hh;
  float sx = im.w / c.w, sy = im.h / c.h;
  for (int32_t y = b.y0; y < b.y1; y++) {
    float fy = (y + 0.5f - c.y) * sy - 0.5f;
    int32_t y0i = ifloor(fy); float ty = fy - y0i;
    int32_t ya = y0i < 0 ? 0 : y0i >= im.h ? im.h - 1 : y0i, yb = y0i + 1 >= im.h ? im.h - 1 : y0i + 1 < 0 ? 0 : y0i + 1;
    for (int32_t x = b.x0; x < b.x1; x++) {
      float fx = (x + 0.5f - c.x) * sx - 0.5f;
      int32_t x0i = ifloor(fx); float tx = fx - x0i;
      int32_t xa = x0i < 0 ? 0 : x0i >= im.w ? im.w - 1 : x0i, xb = x0i + 1 >= im.w ? im.w - 1 : x0i + 1 < 0 ? 0 : x0i + 1;
      const uint8_t *p00 = im.rgba + (ya * im.w + xa) * 4, *p01 = im.rgba + (ya * im.w + xb) * 4, *p10 = im.rgba + (yb * im.w + xa) * 4, *p11 = im.rgba + (yb * im.w + xb) * 4;
      float ch[4];
      for (int k = 0; k < 4; k++) ch[k] = (p00[k] * (1 - tx) + p01[k] * tx) * (1 - ty) + (p10[k] * (1 - tx) + p11[k] * tx) * ty;
      float a = ch[3] / 255 * c.alpha;
      if (c.r > 0) a *= clampf(0.5f - rr_sdf(x + 0.5f, y + 0.5f, cx, cy, hw, hh, c.r), 0, 1);
      if (a < 1) continue;
      blend(at(t, x, y), ((uint32_t)ch[0] << 16) | ((uint32_t)ch[1] << 8) | (uint32_t)ch[2], (uint32_t)a);
    }
  }
}

// ---------------------------------------------------------------- frame rendering and damage
void render(const Frame& f, uint32_t* band, int32_t w, int32_t y0, int32_t y1, Rect damage) {
  Rect base = intersect(damage, Rect{0, y0, w, y1});
  if (base.x0 >= base.x1 || base.y0 >= base.y1) return;
  Rect stack[16]; int sp = 0;
  Target t = {band, w, y0, base};
  for (uint32_t i = 0; i < f.count; i++) {
    const Cmd& c = f.cmds[i];
    switch (c.kind) {
      case CLEAR:
        for (int32_t y = t.clip.y0; y < t.clip.y1; y++) for (int32_t x = t.clip.x0; x < t.clip.x1; x++) at(t, x, y) = c.c1;
        break;
      case RECT: if (c.r <= 0 && !c.grad && c.alpha == 255) {
          Rect b = bounds(c.x, c.y, c.w, c.h, t.clip);
          for (int32_t y = b.y0; y < b.y1; y++) for (int32_t x = b.x0; x < b.x1; x++) at(t, x, y) = c.c1;
        } else fill_rrect(t, c);
        break;
      case BORDER: border_rrect(t, c); break;
      case SHADOW: shadow_rrect(t, c); break;
      case TEXT: draw_text(t, c, f.text + c.off); break;
      case IMAGE: draw_image(t, c); break;
      case LINE: case POLY: fill_poly(t, c, f.pts + c.off); break;
      case CLIP:
        if (sp < 16) stack[sp++] = t.clip;
        t.clip = intersect(t.clip, bounds(c.x, c.y, c.w, c.h, Rect{-100000, -100000, 100000, 100000}));
        break;
      case UNCLIP: if (sp > 0) t.clip = stack[--sp]; break;
    }
  }
}

static Rect cmd_bounds(const Cmd& c, int32_t w, int32_t h) {
  if (c.kind == CLEAR || c.kind == CLIP || c.kind == UNCLIP) return Rect{0, 0, w, h};
  float e = c.kind == SHADOW ? c.s + 1 : 1;
  return Rect{ifloor(c.x - e), ifloor(c.y - e), iceil(c.x + c.w + e), iceil(c.y + c.h + e)};
}
static void grow(Rect& r, Rect b) {
  r.x0 = b.x0 < r.x0 ? b.x0 : r.x0; r.y0 = b.y0 < r.y0 ? b.y0 : r.y0;
  r.x1 = b.x1 > r.x1 ? b.x1 : r.x1; r.y1 = b.y1 > r.y1 ? b.y1 : r.y1;
}
static bool same(const Frame& a, const Cmd& x, const Frame& b, const Cmd& y) {
  if (__builtin_memcmp(&x, &y, sizeof(Cmd) - 2 * sizeof(uint32_t)) || x.n != y.n) return false;
  if (x.kind == TEXT) return !__builtin_memcmp(a.text + x.off, b.text + y.off, x.n);
  if (x.kind == POLY || x.kind == LINE) {
    const float *p = a.pts + x.off, *q = b.pts + y.off;
    uint32_t len = 0;
    for (uint32_t k = 0; k < x.n; k++) { uint32_t cnt = (uint32_t)p[len]; if ((uint32_t)q[len] != cnt) return false; len += 1 + cnt * 2; }
    return !__builtin_memcmp(p, q, len * sizeof(float));
  }
  return true;
}
Rect diff(const Frame& a, const Frame& b, int32_t w, int32_t h) {
  Rect r = {w, h, 0, 0};
  uint32_t n = a.count > b.count ? a.count : b.count;
  for (uint32_t i = 0; i < n; i++) {
    bool ina = i < a.count, inb = i < b.count;
    if (ina && inb && same(a, a.cmds[i], b, b.cmds[i])) continue;
    if (ina) grow(r, cmd_bounds(a.cmds[i], w, h));
    if (inb) grow(r, cmd_bounds(b.cmds[i], w, h));
  }
  return intersect(r, Rect{0, 0, w, h});
}

static bool overlaps(Rect a, Rect b) { return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1; }
static int64_t area(Rect r) { return (int64_t)(r.x1 - r.x0) * (r.y1 - r.y0); }
int32_t diff_rects(const Frame& a, const Frame& b, int32_t w, int32_t h, Rect* out, int32_t max) {
  int32_t n = 0;
  const Rect screen{0, 0, w, h};
  auto add = [&](Rect r) {
    r = intersect(r, screen);
    if (r.x0 >= r.x1 || r.y0 >= r.y1) return;
    // merge into an overlapping rect (cascading), else append; over budget, merge the cheapest pair
    for (;;) {
      int32_t hit = -1;
      for (int32_t i = 0; i < n; i++) if (overlaps(out[i], r)) { hit = i; break; }
      if (hit < 0) break;
      grow(r, out[hit]);
      out[hit] = out[--n];
    }
    if (n < max) { out[n++] = r; return; }
    int32_t bi = 0; int64_t best = -1;
    for (int32_t i = 0; i < n; i++) { Rect m = out[i]; grow(m, r); int64_t cost = area(m) - area(out[i]); if (best < 0 || cost < best) { best = cost; bi = i; } }
    grow(r, out[bi]);
    out[bi] = out[--n];
    // the grown rect may now overlap others: re-add it
    for (;;) {
      int32_t hit = -1;
      for (int32_t i = 0; i < n; i++) if (overlaps(out[i], r)) { hit = i; break; }
      if (hit < 0) break;
      grow(r, out[hit]);
      out[hit] = out[--n];
    }
    out[n++] = r;
  };
  uint32_t cnt = a.count > b.count ? a.count : b.count;
  for (uint32_t i = 0; i < cnt; i++) {
    bool ina = i < a.count, inb = i < b.count;
    if (ina && inb && same(a, a.cmds[i], b, b.cmds[i])) continue;
    if (ina) add(cmd_bounds(a.cmds[i], w, h));
    if (inb) add(cmd_bounds(b.cmds[i], w, h));
  }
  return n;
}

int32_t find_font(const char* name, uint32_t name_len, int32_t px) {
  int32_t best = -1, bd = 1 << 30;
  for (int32_t i = 0; i < font_count; i++) {
    const char* n = fonts[i].name;
    uint32_t k = 0; while (n[k]) k++;
    if (k != name_len || __builtin_memcmp(n, name, k)) continue;
    int32_t d = fonts[i].px - px; if (d < 0) d = -d;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}
// ---------------------------------------------------------------- strokes
// A polyline becomes one quad per segment plus a round join/cap disc per vertex, all wound the same way, so the
// nonzero fill unions them without seams. ponytail: round joins only; miter joins if a style needs them.
uint32_t stroke_contours(const float* p, uint32_t n, float width, bool closed, float* out, uint32_t cap) {
  uint32_t used = 0, contours = 0;
  float r = width * 0.5f;
  auto emit = [&](const float* q, uint32_t cnt) {
    if (used + 1 + cnt * 2 > cap) return;
    float area = 0;
    for (uint32_t i = 0; i < cnt; i++) { uint32_t j = (i + 1) % cnt; area += q[i * 2] * q[j * 2 + 1] - q[j * 2] * q[i * 2 + 1]; }
    out[used++] = (float)cnt;
    for (uint32_t i = 0; i < cnt; i++) { uint32_t k = area < 0 ? cnt - 1 - i : i; out[used++] = q[k * 2]; out[used++] = q[k * 2 + 1]; }
    contours++;
  };
  uint32_t segs = closed ? n : n - 1;
  for (uint32_t i = 0; i < segs && n > 1; i++) {
    float ax = p[i * 2], ay = p[i * 2 + 1], bx = p[((i + 1) % n) * 2], by = p[((i + 1) % n) * 2 + 1];
    float dx = bx - ax, dy = by - ay, len = __builtin_sqrtf(dx * dx + dy * dy);
    if (len <= 0) continue;
    float nx = -dy / len * r, ny = dx / len * r;
    float q[8] = {ax + nx, ay + ny, bx + nx, by + ny, bx - nx, by - ny, ax - nx, ay - ny};
    emit(q, 4);
  }
  if (r >= 1.0f) {  // joins and caps; thin lines skip them (invisible at that size)
    int seg = r < 3 ? 6 : r < 8 ? 10 : 16;
    for (uint32_t i = 0; i < n; i++) {
      if (closed || (i > 0 && i + 1 < n)) {  // interior vertex: no disc where the turn leaves no visible notch
        uint32_t a = (i + n - 1) % n, b = (i + 1) % n;
        float ux = p[i * 2] - p[a * 2], uy = p[i * 2 + 1] - p[a * 2 + 1], vx = p[b * 2] - p[i * 2], vy = p[b * 2 + 1] - p[i * 2 + 1];
        float l2 = (ux * ux + uy * uy) * (vx * vx + vy * vy), cr = ux * vy - uy * vx;
        if (l2 > 0 && ux * vx + uy * vy > 0 && cr * cr * r * r < 0.1f * l2) continue;  // r * sin(turn) < ~0.3px
      }
      float q[32];
      for (int k = 0; k < seg; k++) { float a = 6.2831853f * k / seg; q[k * 2] = p[i * 2] + __builtin_cosf(a) * r; q[k * 2 + 1] = p[i * 2 + 1] + __builtin_sinf(a) * r; }
      emit(q, (uint32_t)seg);
    }
  }
  return contours | (used << 16);
}

int32_t find_image(const char* name, uint32_t name_len) {
  for (int32_t i = 0; i < image_count; i++) {
    const char* n = images[i].name;
    uint32_t k = 0; while (n[k]) k++;
    if (k == name_len && !__builtin_memcmp(n, name, k)) return i;
  }
  return -1;
}

}}  // namespace zrt::raster
