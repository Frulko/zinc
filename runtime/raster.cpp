// Software rasterizer (see zrt_raster.h). Pixels are 0x00RRGGBB; coverage-based anti-aliasing everywhere.
// ponytail: float math per pixel near edges; a fixed-point path would help FPU-less targets (ps1).
#include "zrt.h"
#include "zrt_raster.h"
#ifdef ZRT_RASTER_PROFILE
// -DZRT_RASTER_PROFILE: microseconds per command kind (CLEAR RECT BORDER SHADOW LINE TEXT IMAGE POLY CLIP UNCLIP), then
// 10: polygon edge setup (n = edges), 11: polygon row sweep (n = painted pixels), 12: polygon calls; read and cleared by
// zrt_raster_profile (the st7789 `perf` option prints them).
static uint32_t prof_us[13], prof_n[13];
#endif

namespace zrt { namespace raster {

static inline float fabsf_(float v) { return v < 0 ? -v : v; }
static inline float clampf(float v, float a, float b) { return v < a ? a : v > b ? b : v; }
#if (defined(__APPLE__) || defined(__linux__)) && !defined(ESP_PLATFORM)
#define ZRT_TLS thread_local
#else
#define ZRT_TLS
#endif
// float -> int saturates at +-2^27 (NaN goes low): out-of-range casts are UB, and coordinates come from programs
static inline int32_t f2i(float v) { return (int32_t)__builtin_fminf(__builtin_fmaxf(v, -134217728.0f), 134217728.0f); }  // fmax: NaN -> low
static inline int32_t ifloor(float v) { int32_t i = f2i(v); return (float)i > v ? i - 1 : i; }
static inline int32_t iceil(float v) { int32_t i = f2i(v); return (float)i < v ? i + 1 : i; }
// per-pixel / per-sample paths: the caller keeps v in int range (clamped, or bounded by a checked scale)
static inline int32_t ifloor_fast(float v) { int32_t i = (int32_t)v; return (float)i > v ? i - 1 : i; }
static inline int32_t iceil_fast(float v) { int32_t i = (int32_t)v; return (float)i < v ? i + 1 : i; }

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
// Runs of one colour (ZN-401): the colour and alpha arrive by value, so a pixel store cannot alias them (a store through
// uint32_t* could be the command's c1) and the loops vectorize; same formula per pixel as blend(), same pixels.
static inline void fill_row(uint32_t* p, int32_t n, uint32_t col) { for (int32_t i = 0; i < n; i++) p[i] = col; }
static inline void blend_row(uint32_t* p, int32_t n, uint32_t col, uint32_t a) {
  if (a >= 255) { fill_row(p, n, col); return; }
  if (!a) return;
  const uint32_t crb = (col & 0xFF00FF) * a, cg = (col & 0x00FF00) * a, ia = 255 - a;
  for (int32_t i = 0; i < n; i++) {
    uint32_t d = p[i];
    p[i] = (((crb + (d & 0xFF00FF) * ia) >> 8) & 0xFF00FF) | (((cg + (d & 0x00FF00) * ia) >> 8) & 0x00FF00);
  }
}
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
// Per row, a rounded box covers one horizontal span. Pixels whose centre lies in the box shrunk by `in` are fully
// covered (plain fill), pixels outside the box grown by `out` are untouched: only the few pixels between the two
// spans pay for the distance function (a circle 700 px wide costs ~4 sqrt per row instead of 700).
struct Span { int32_t x0, x1; };   // pixel columns [x0, x1)
/** Columns whose centres lie inside the rounded box (cx, cy, hw, hh, r) grown by `d` (negative shrinks), on row py. */
static Span row_span(float py, float cx, float cy, float hw, float hh, float r, float d) {
  hw += d; hh += d; r += d;
  if (hw <= 0 || hh <= 0) return Span{0, 0};
  if (r < 0) r = 0;
  float qy = fabsf_(py - cy) - (hh - r);
  if (qy > r) return Span{0, 0};
  float half = qy <= 0 ? hw : (hw - r) + __builtin_sqrtf(r * r - qy * qy);
  return Span{iceil(cx - half - 0.5f), ifloor(cx + half - 0.5f) + 1};
}
static void fill_rrect(const Target& t, const Cmd& c) {
  Rect b = bounds(c.x, c.y, c.w, c.h, t.clip);
  if (b.x0 >= b.x1 || b.y0 >= b.y1) return;
  float hw = c.w * 0.5f, hh = c.h * 0.5f, cx = c.x + hw, cy = c.y + hh;
  float r = clampf(c.r, 0, hw < hh ? hw : hh);
  bool per_pixel = c.grad == 2 || c.grad == 3;
  for (int32_t y = b.y0; y < b.y1; y++) {
    float py = y + 0.5f;
    Span o = row_span(py, cx, cy, hw, hh, r, 0.5f), in = row_span(py, cx, cy, hw, hh, r, -0.5f);
    int32_t x0 = o.x0 > b.x0 ? o.x0 : b.x0, x1 = o.x1 < b.x1 ? o.x1 : b.x1;
    int32_t i0 = in.x0 > x0 ? in.x0 : x0, i1 = in.x1 < x1 ? in.x1 : x1;
    if (i1 < i0) i1 = i0;
    uint32_t row_color = c.grad == 1 ? color_at(c, 0, py) : c.c1;
    for (int32_t x = x0; x < x1; x++) {
      if (x == i0 && i1 > i0) {   // fully covered run
        if (per_pixel) for (; x < i1; x++) blend(at(t, x, y), color_at(c, x + 0.5f, py), c.alpha);
        else { blend_row(&at(t, x, y), i1 - x, row_color, c.alpha); x = i1; }
        if (x >= x1) break;
      }
      float px = x + 0.5f;
      float cov = clampf(0.5f - rr_sdf(px, py, cx, cy, hw, hh, r), 0, 1);
      if (cov > 0) blend(at(t, x, y), per_pixel ? color_at(c, px, py) : row_color, (uint32_t)(cov * c.alpha));
    }
  }
}
static void border_rrect(const Target& t, const Cmd& c) {
  Rect b = bounds(c.x, c.y, c.w, c.h, t.clip);
  float hw = c.w * 0.5f, hh = c.h * 0.5f, cx = c.x + hw, cy = c.y + hh, bw = c.s;
  float r = clampf(c.r, 0, hw < hh ? hw : hh), ri = r - bw > 0 ? r - bw : 0;
  for (int32_t y = b.y0; y < b.y1; y++) {
    float py = y + 0.5f;
    // skip the hole: pixels well inside the inner box are not part of the ring
    Span o = row_span(py, cx, cy, hw, hh, r, 0.5f), hole = row_span(py, cx, cy, hw - bw, hh - bw, ri, -0.5f);
    int32_t x0 = o.x0 > b.x0 ? o.x0 : b.x0, x1 = o.x1 < b.x1 ? o.x1 : b.x1;
    // over the straight part of a top or bottom row (qx <= 0 < qy) rr_sdf depends on the row alone (see shadow_rrect): computed once (ZN-403)
    const float hwi = hw - bw, hhi = hh - bw;
    const float sxo = hw - r, sxi = hwi - ri, qyo = fabsf_(py - cy) - (hh - r), qyi = fabsf_(py - cy) - (hhi - ri);
    const float row_outer = clampf(0.5f - rr_sdf(cx, py, cx, cy, hw, hh, r), 0, 1), row_inner = clampf(0.5f - rr_sdf(cx, py, cx, cy, hwi, hhi, ri), 0, 1);
    for (int32_t x = x0; x < x1; x++) {
      if (x == hole.x0 && hole.x1 > hole.x0) { x = hole.x1 - 1; continue; }
      float px = x + 0.5f, ax = fabsf_(px - cx);
      float outer = qyo > 0 && ax - sxo <= 0 ? row_outer : clampf(0.5f - rr_sdf(px, py, cx, cy, hw, hh, r), 0, 1);
      if (outer <= 0) continue;
      float inner = qyi > 0 && ax - sxi <= 0 ? row_inner : clampf(0.5f - rr_sdf(px, py, cx, cy, hwi, hhi, ri), 0, 1);
      float cov = outer - inner;
      if (cov > 0) blend(at(t, x, y), c.c1, (uint32_t)(cov * c.alpha));
    }
  }
}
// Shadows (ZN-403): the same pixels as one rr_sdf per pixel, computed once per distinct row. With qx = |px - cx| - (hw - r) and
// qy = |py - cy| - (hh - r), rr_sdf is (sqrt(ox*ox + oy*oy) + min(max(qx, qy), 0)) - r: a row's alphas depend on qy and its spans only, so
// rows with the same qy bits and spans share them (top and bottom halves), and a middle row (qy <= 0) whose own qy-alpha is already full
// (every pixel ruled by qy is fully covered) has alphas that depend on qx alone: every such row shares one. The per-row loops have no
// data-dependent branches, so they vectorize, with the same float operations per pixel.
static ZRT_TLS uint8_t* shadow_rows; static ZRT_TLS uint32_t shadow_rows_cap;
struct ShadowKey { uint32_t q; int32_t x0, x1, i0, i1, row; };
static ZRT_TLS ShadowKey* shadow_keys; static ZRT_TLS uint32_t shadow_keys_cap;
static inline float sdf_q(float qx, float qy, float r) {   // rr_sdf from its qx, qy
  float ox = qx > 0 ? qx : 0, oy = qy > 0 ? qy : 0;
  float m = qx > qy ? qx : qy;
  return __builtin_sqrtf(ox * ox + oy * oy) + (m < 0 ? m : 0) - r;
}
static inline void blend_alphas(uint32_t* p, const uint8_t* a, int32_t n, uint32_t col) {   // blend() per pixel with its own alpha
  const uint32_t crb = col & 0xFF00FF, cg = col & 0x00FF00;
  for (int32_t i = 0; i < n; i++) {
    const uint32_t k = a[i], d = p[i], ik = 255 - k;
    const uint32_t mixed = ((((crb * k) + (d & 0xFF00FF) * ik) >> 8) & 0xFF00FF) | ((((cg * k) + (d & 0x00FF00) * ik) >> 8) & 0x00FF00);
    p[i] = k >= 255 ? col : k ? mixed : d;
  }
}
template<class T> static T* grow_scratch(T*& buf, uint32_t& cap, uint32_t need) {
  if (need <= cap) return buf;
  uint32_t n = cap ? cap : 256;
  while (n < need) n *= 2;
  T* nb = (T*)hal_alloc((size_t)n * sizeof(T));
  if (!nb) return nullptr;
  if (buf) hal_free(buf);
  buf = nb; cap = n;
  return buf;
}
static void shadow_rrect(const Target& t, const Cmd& c) {
  float blur = c.s > 0.5f ? c.s : 0.5f;
  Rect b = bounds(c.x - blur, c.y - blur, c.w + 2 * blur, c.h + 2 * blur, t.clip);
  if (b.x0 >= b.x1 || b.y0 >= b.y1) return;
  float hw = c.w * 0.5f, hh = c.h * 0.5f, cx = c.x + hw, cy = c.y + hh;
  float r = clampf(c.r, 0, hw < hh ? hw : hh);
  const float sx = hw - r, sy = hh - r, bh = blur * 0.5f, bd = blur * 1.5f;
  const uint32_t alpha = c.alpha, col = c.c1;
  auto alpha_of = [&](float d) {
    float k = clampf(1.0f - (d + bh) / bd, 0, 1);
    k = k * k * (3 - 2 * k);
    return k > 0 ? (uint32_t)(k * alpha) : 0u;
  };
  const uint32_t full = alpha_of(-1e30f);   // what a fully covered pixel gets: (uint32_t)(1 * alpha)
  const uint32_t ncol = (uint32_t)(b.x1 - b.x0), nrow = (uint32_t)(b.y1 - b.y0);
  // one alpha row per distinct key; without memory for the cache every row is computed into row 0
  const bool cache = (uint64_t)ncol * nrow <= (8u << 20) && grow_scratch(shadow_rows, shadow_rows_cap, ncol * nrow) && grow_scratch(shadow_keys, shadow_keys_cap, nrow);
  if (!cache && !grow_scratch(shadow_rows, shadow_rows_cap, ncol)) return;
  uint32_t nkeys = 0, nslots = 0;
  for (int32_t y = b.y0; y < b.y1; y++) {
    float py = y + 0.5f;
    // k = 1 where d <= -blur/2 (inside the box shrunk by blur/2), 0 where d >= blur (outside it grown by blur)
    Span o = row_span(py, cx, cy, hw, hh, r, blur), in = row_span(py, cx, cy, hw, hh, r, -blur * 0.5f);
    int32_t x0 = o.x0 > b.x0 ? o.x0 : b.x0, x1 = o.x1 < b.x1 ? o.x1 : b.x1;
    int32_t i0 = in.x0 > x0 ? in.x0 : x0, i1 = in.x1 < x1 ? in.x1 : x1;
    if (!(i1 > i0)) i0 = i1 = x1;   // no covered run: the whole span is computed
    if (x0 >= x1) continue;
    const float qy = fabsf_(py - cy) - sy;
    const bool by_column = qy <= 0 && alpha_of(sdf_q(qy, qy, r)) == full;   // every pixel ruled by qy is full, so the row depends on qx alone
    uint32_t qbits; __builtin_memcpy(&qbits, &qy, 4);
    const ShadowKey key = {by_column ? 0x7FC0DEADu : qbits, x0, x1, i0, i1, 0};
    uint8_t* a = nullptr;
    if (cache) {
      for (uint32_t k = nkeys; k-- > 0;) {   // newest first: neighbouring rows repeat most
        const ShadowKey& h = shadow_keys[k];
        if (h.q == key.q && h.x0 == x0 && h.x1 == x1 && h.i0 == i0 && h.i1 == i1) { a = shadow_rows + (size_t)h.row * ncol; break; }
      }
    }
    if (!a) {
      a = shadow_rows + (cache ? (size_t)nslots * ncol : 0);
      auto fill = [&](int32_t from, int32_t to) {
        for (int32_t x = from; x < to; x++) {
          const float qx = fabsf_((x + 0.5f) - cx) - sx;
          a[x - b.x0] = (uint8_t)alpha_of(sdf_q(qx, qy, r));
        }
      };
      fill(x0, i0); fill(i1, x1);
      if (cache) { shadow_keys[nkeys] = key; shadow_keys[nkeys].row = (int32_t)nslots; nkeys++; nslots++; }
    }
    blend_alphas(&at(t, x0, y), a + (x0 - b.x0), i0 - x0, col);
    if (i1 > i0) blend_row(&at(t, i0, y), i1 - i0, col, alpha);
    blend_alphas(&at(t, i1, y), a + (i1 - b.x0), x1 - i1, col);
  }
}

// Canvas-style gradient paint of a POLY (grad 4), stored after its contours:
// [kind (1 linear, 2 radial), x0, y0, r0, x1, y1, r1, n, (offset, 0xRRGGBB, alpha 0..255) * n]. Scales `a` by the stop alpha.
static uint32_t paint_at(const float* g, float px, float py, uint32_t& a) {
  float dx = g[4] - g[1], dy = g[5] - g[2], qx = px - g[1], qy = py - g[2], t;
  if (g[0] == 1) { float l = dx * dx + dy * dy; t = l > 0 ? (qx * dx + qy * dy) / l : 0; }
  else {  // two circles: the largest t with |p - c(t)| = r(t) >= 0 (HTML canvas)
    float dr = g[6] - g[3], A = dx * dx + dy * dy - dr * dr, B = qx * dx + qy * dy + g[3] * dr, C = qx * qx + qy * qy - g[3] * g[3];
    if (fabsf_(A) < 1e-4f) t = B != 0 ? C / (2 * B) : 0;
    else {
      float D = B * B - A * C;
      if (D < 0) { a = 0; return 0; }
      float s = __builtin_sqrtf(D), t1 = (B + s) / A, t2 = (B - s) / A;
      t = t1 > t2 ? t1 : t2;
      if (g[3] + t * dr < 0) t = t1 > t2 ? t2 : t1;
      if (g[3] + t * dr < 0) { a = 0; return 0; }
    }
  }
  int32_t n = (int32_t)g[7];
  const float* s = g + 8;
  int32_t i = 0;
  while (i < n && t > s[i * 3]) i++;
  if (i == 0 || i == n) { const float* e = s + (i ? n - 1 : 0) * 3; a = a * (uint32_t)e[2] / 255; return (uint32_t)e[1]; }
  const float *l = s + (i - 1) * 3, *r = s + i * 3;
  float u = r[0] > l[0] ? (t - l[0]) / (r[0] - l[0]) : 1;
  a = a * (uint32_t)(l[2] + (r[2] - l[2]) * u) / 255;
  return lerp_color((uint32_t)l[1], (uint32_t)r[1], u);
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
// scratch buffers are per thread: hosted HALs rasterize bands of a frame in parallel (hal_sdl.cpp)
static ZRT_TLS Edge* edges; static ZRT_TLS uint32_t edge_cap;
static ZRT_TLS int32_t* heads; static ZRT_TLS uint32_t head_cap;
static ZRT_TLS uint16_t* accs; static ZRT_TLS uint32_t acc_cap;
static ZRT_TLS int32_t* actives; static ZRT_TLS uint32_t active_cap;
static ZRT_TLS int16_t* wds; static ZRT_TLS uint32_t wd_cap;  // all zero between uses
static void fill_poly(const Target& t, const Cmd& c, const float* pts) {
  Rect b = bounds(c.x, c.y, c.w, c.h, t.clip);
  if (b.x0 >= b.x1 || b.y0 >= b.y1) return;
#ifdef ZRT_RASTER_PROFILE
  uint64_t pt0 = hal_time_us(); prof_n[12]++;
#endif
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
      if (!(ay < by || ay > by)) continue;  // horizontal, or NaN: no edge (a NaN row would index heads[] out of range)
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
#ifdef ZRT_RASTER_PROFILE
  uint64_t pt1 = hal_time_us(); prof_us[10] += (uint32_t)(pt1 - pt0); prof_n[10] += ne;
#endif
  bool evenodd = c.pad & 1;
  const float* paint = c.grad == 4 ? p : nullptr;  // gradient paint record after the contours
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
        float fq = (e.x0 + (sy - e.y0) * e.dxdy - b.x0) * 4 - 0.5f, lim = (float)(bw * 4);
        int32_t q = fq > 0 ? (fq < lim ? iceil_fast(fq) : bw * 4) : 0;  // clamped as a float first (NaN: 0)
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
        // two aligned 32-bit loads: a 64-bit memcpy is a run of byte loads on Xtensa (esp32), the hot spot of this loop
        typedef uint32_t __attribute__((may_alias)) u32a;
        if (!(((const u32a*)w4)[0] | ((const u32a*)w4)[1])) { if ((evenodd ? (wind & 1) : wind) && px < bw) acc[px] += 4; continue; }
        for (int k = 0; k < 4; k++) { wind += w4[k]; w4[k] = 0; if ((evenodd ? (wind & 1) : wind) && px < bw) acc[px]++; }
      }
    }
    for (int32_t i = lo; i <= hi; i++) {
      uint32_t k = acc[i];
      if (!k) continue;
      acc[i] = 0;
      uint32_t a = c.alpha;
      uint32_t col = paint ? paint_at(paint, b.x0 + i + 0.5f, y + 0.5f, a) : c.grad ? color_at(c, b.x0 + i + 0.5f, y + 0.5f) : c.c1;
      if (k >= 16 && a == 255) at(t, b.x0 + i, y) = col;
      else blend(at(t, b.x0 + i, y), col, k * a / 16);
#ifdef ZRT_RASTER_PROFILE
      prof_n[11]++;
#endif
    }
    uint32_t keep = 0;  // drop edges that end in this row
    for (uint32_t a = 0; a < na; a++) if (edges[active[a]].y1 > y + 1) active[keep++] = active[a];
    na = keep;
  }
#ifdef ZRT_RASTER_PROFILE
  prof_us[11] += (uint32_t)(hal_time_us() - pt1);
#endif
}

// ---------------------------------------------------------------- text and images
// ASCII glyphs of the baked fonts by direct index (ZN-407): 128 entries per font, built on first use (concurrent bands write the same values;
// the ready flag is published after the table). -1: no glyph. Fonts past the first 64 and other code points keep the binary search.
static int16_t ascii_tab[64][128];
static int ascii_ready[64];
static const Glyph* glyph_of(int32_t font, const Font& f, uint32_t cp) {
  if (font >= RUNTIME_FONT_BASE) return runtime_glyph(font, cp);
  if (cp < 128 && font >= 0 && font < 64 && f.count < 32768) {
    if (!__atomic_load_n(&ascii_ready[font], __ATOMIC_ACQUIRE)) {
      for (int k = 0; k < 128; k++) ascii_tab[font][k] = -1;
      for (int32_t g = 0; g < f.count; g++) if (f.glyphs[g].cp < 128 && ascii_tab[font][f.glyphs[g].cp] < 0) ascii_tab[font][f.glyphs[g].cp] = (int16_t)g;
      __atomic_store_n(&ascii_ready[font], 1, __ATOMIC_RELEASE);
    }
    const int16_t g = ascii_tab[font][cp];
    return g < 0 ? nullptr : &f.glyphs[g];
  }
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
const ShapeHooks* shape_hooks = nullptr;
static bool needs_shaping(const char* s, uint32_t n) {   // combining marks, Hebrew to Indic and Southeast Asian scripts, ZWJ and variation selectors, Arabic forms, emoji: not symbols, arrows or CJK
  for (uint32_t i = 0; i < n;) {
    if ((uint8_t)s[i] < 0xCC) { i++; continue; }
    uint32_t cp = next_cp(s, n, i);
    if ((cp >= 0x300 && cp <= 0x36F) || (cp >= 0x590 && cp <= 0x1FFF) || cp == 0x200C || cp == 0x200D || (cp >= 0xFE00 && cp <= 0xFE0F) || (cp >= 0xFB1D && cp <= 0xFDFF) || (cp >= 0xFE70 && cp <= 0xFEFF) || cp >= 0x1F000) return true;
  }
  return false;
}
int32_t text_advance(int32_t font, const char* s, uint32_t n, float tracking) {
  const Font* fp = font_at(font);
  if (!fp) return 0;
  if (shape_hooks && (needs_shaping(s, n) || (font < font_count && !fp->count))) { int32_t a = shape_hooks->run(font, s, n, tracking, nullptr, nullptr); if (a >= 0) return a; }
  const Font& f = *fp;
  int32_t pen = 0;
  for (uint32_t i = 0; i < n;) {
    const Glyph* g = glyph_of(font, f, next_cp(s, n, i));
    if (!g) g = glyph_of(font, f, '?');
    if (g) pen += g->adv + f2i(tracking * 64);
  }
  return pen;
}
static void draw_text(const Target& t, const Cmd& c, const char* s) {
  const Font* fp = font_at(c.res);
  if (!fp) return;
  const Font& f = *fp;
  int32_t pen = f2i(c.x * 64), base = f2i(c.y + 0.5f) + f.ascent;
  if (shape_hooks && (needs_shaping(s, c.n) || (c.res < font_count && !fp->count))) {   // a baked font without glyphs is an outline format the tables cannot read (CFF)
    struct Ctx { const Target* t; const Cmd* c; int32_t px, py; } cx = {&t, &c, (pen + 32) >> 6, base};
    int32_t a = shape_hooks->run(c.res, s, c.n, c.s, [](void* u, const ShapedGlyph& g) {
      Ctx& k = *static_cast<Ctx*>(u);
      for (int32_t yy = 0; yy < g.h; yy++) {
        int32_t y = k.py + g.y + yy;
        if (y < k.t->clip.y0 || y >= k.t->clip.y1) continue;
        for (int32_t xx = 0; xx < g.w; xx++) {
          int32_t x = k.px + g.x + xx;
          if (x < k.t->clip.x0 || x >= k.t->clip.x1) continue;
          if (g.rgba) {
            uint32_t p = g.rgba[yy * g.w + xx], al = p >> 24;
            if (al) blend(at(*k.t, x, y), ((p & 0xFF) << 16) | (p & 0xFF00) | ((p >> 16) & 0xFF), al * k.c->alpha / 255);
          } else {
            uint8_t cov = g.a[yy * g.w + xx];
            if (cov) blend(at(*k.t, x, y), k.c->c1, (uint32_t)cov * k.c->alpha / 255);
          }
        }
      }
    }, &cx);
    if (a >= 0) return;
  }
  const uint32_t col = c.c1, alpha = c.alpha;
  const int32_t track = f2i(c.s * 64);
  for (uint32_t i = 0; i < c.n;) {
    const Glyph* g = glyph_of(c.res, f, next_cp(s, c.n, i));
    if (!g) g = glyph_of(c.res, f, '?');
    if (!g) continue;
    int32_t gx = ((pen + 32) >> 6) + g->x0, gy = base + g->y0;
    // the glyph box clipped once (ZN-407), then an unchecked loop: the same pixels as clipping each one
    const int32_t y0 = gy > t.clip.y0 ? gy : t.clip.y0, y1 = gy + g->h < t.clip.y1 ? gy + g->h : t.clip.y1;
    const int32_t x0 = gx > t.clip.x0 ? gx : t.clip.x0, x1 = gx + g->w < t.clip.x1 ? gx + g->w : t.clip.x1;
    for (int32_t y = y0; y < y1; y++) {
      const uint8_t* row = f.bitmap + g->off + (y - gy) * g->w - gx;
      uint32_t* dst = &at(t, 0, y);
      for (int32_t x = x0; x < x1; x++) {
        const uint32_t cov = row[x];
        if (cov) blend(dst[x], col, alpha == 255 ? cov : cov * alpha / 255);
      }
    }
    pen += g->adv + track;
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
// w x h x 4 must not overflow size_t on 32-bit targets (a wrapped size is a heap overflow): 16384 per side at most
static bool dyn_size_ok(int32_t w, int32_t h) { return w > 0 && h > 0 && w <= 16384 && h <= 16384; }
int32_t dyn_create(int32_t w, int32_t h) {
  if (!dyn_size_ok(w, h)) return -1;
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
  if (!d || !d->owned || (d->w == w && d->h == h) || !dyn_size_ok(w, h)) return;
  uint32_t* px = (uint32_t*)hal_alloc((size_t)w * h * 4);
  if (!px) return;
  hal_free(d->owned);
  d->owned = px;
  __builtin_memset(d->owned, 0, (size_t)w * h * 4);
  d->px = d->owned; d->w = w; d->h = h; d->stride = w; d->version++;
}
void dyn_destroy(int32_t id) { if (Dyn* d = dyn_at(id)) { if (d->owned) hal_free(d->owned); *d = Dyn{}; } }
bool image_size(int32_t id, int32_t* w, int32_t* h) {
  if (id >= 0 && id < image_count) { int32_t k = images[id].scale > 1 ? images[id].scale : 1; *w = (images[id].w + k / 2) / k; *h = (images[id].h + k / 2) / k; return true; }
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
  int32_t sx = f2i((float)im.w / c.w * 65536), sy = f2i((float)im.h / c.h * 65536);
  bool nearest = c.grad == 1 || (sx == 65536 && sy == 65536);
  float hw = c.w * 0.5f, hh = c.h * 0.5f, cx = c.x + hw, cy = c.y + hh;
  for (int32_t y = b.y0; y < b.y1; y++) {
    if (nearest) {
      int32_t iy = (int32_t)(((int64_t)((y - c.y) * 65536)) * sy >> 32); if (iy < 0) iy = 0; if (iy >= im.h) iy = im.h - 1;
      const uint32_t* src = im.px + (size_t)iy * im.stride;
      int32_t fx0 = f2i((b.x0 + 0.5f - c.x) * sx); if (fx0 < 0) fx0 = 0;
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
    int32_t y0i = ifloor_fast(fy); float ty = fy - y0i;
    int32_t ya = y0i < 0 ? 0 : y0i >= im.h ? im.h - 1 : y0i, yb = y0i + 1 >= im.h ? im.h - 1 : y0i + 1 < 0 ? 0 : y0i + 1;
    for (int32_t x = b.x0; x < b.x1; x++) {
      float fx = (x + 0.5f - c.x) * im.w / c.w - 0.5f;
      int32_t x0i = ifloor_fast(fx); float tx = fx - x0i;
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
  // sample positions (x - c.x) * scale stay in int range: finite origin and size, at most 1e6 texels per pixel
  if (!(c.w > 0 && c.h > 0 && c.w < 1e30f && c.h < 1e30f && c.x - c.x == 0 && c.y - c.y == 0)) return;
  if (const Dyn* d = dyn_at(c.res)) { if (d->px && (float)d->w / c.w < 1e6f && (float)d->h / c.h < 1e6f) draw_dyn(t, c, *d); return; }
  if (c.res < 0 || c.res >= image_count) return;
  const Image& im = images[c.res];
  if (!((float)im.w / c.w < 1e6f && (float)im.h / c.h < 1e6f)) return;
  Rect b = bounds(c.x, c.y, c.w, c.h, t.clip);
  float hw = c.w * 0.5f, hh = c.h * 0.5f, cx = c.x + hw, cy = c.y + hh;
  float sx = im.w / c.w, sy = im.h / c.h;
  for (int32_t y = b.y0; y < b.y1; y++) {
    float fy = (y + 0.5f - c.y) * sy - 0.5f;
    int32_t y0i = ifloor_fast(fy); float ty = fy - y0i;
    int32_t ya = y0i < 0 ? 0 : y0i >= im.h ? im.h - 1 : y0i, yb = y0i + 1 >= im.h ? im.h - 1 : y0i + 1 < 0 ? 0 : y0i + 1;
    for (int32_t x = b.x0; x < b.x1; x++) {
      float fx = (x + 0.5f - c.x) * sx - 0.5f;
      int32_t x0i = ifloor_fast(fx); float tx = fx - x0i;
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
// Rounded clips (CLIP with r > 0): children are clipped to the box, then the four corner squares are blended back
// toward the pixels saved when the clip began, by the rounded-rect coverage, so content never shows outside the
// curve (scroll views and overflow-hidden cards with rounded corners).
// ponytail: a fixed pool of saved corner pixels; clips that do not fit it stay square-cornered.
#ifndef ZRT_CLIP_CORNER_PX
#define ZRT_CLIP_CORNER_PX 16384
#endif
struct RoundClip { float x, y, w, h, r; int32_t R; uint32_t off; bool on; };
#if ZRT_CLIP_CORNER_PX > 0
static ZRT_TLS uint32_t corner_px[ZRT_CLIP_CORNER_PX];
#endif
/** Visits the pixels of the four corner squares of a rounded clip that lie in the target's clip `lim`. */
template<class F> static void corners(const Target& t, const RoundClip& k, Rect lim, F f) {
  int32_t x0 = ifloor(k.x), y0 = ifloor(k.y), x1 = iceil(k.x + k.w), y1 = iceil(k.y + k.h), R = k.R;
  const int32_t cx[4] = {x0, x1 - R, x0, x1 - R}, cy[4] = {y0, y0, y1 - R, y1 - R};
  uint32_t i = k.off;
  for (int q = 0; q < 4; q++)
    for (int32_t y = cy[q]; y < cy[q] + R; y++)
      for (int32_t x = cx[q]; x < cx[q] + R; x++, i++)
        if (x >= lim.x0 && x < lim.x1 && y >= lim.y0 && y < lim.y1) f(x, y, i);
  (void)t;
}
#ifdef ZRT_RASTER_PROFILE
extern "C" void zrt_raster_profile(uint32_t* us, uint32_t* n) { for (int i = 0; i < 13; i++) { us[i] = prof_us[i]; n[i] = prof_n[i]; prof_us[i] = prof_n[i] = 0; } }
#endif
// Paints the commands `pick(0 .. n)` of `f` in order into `t` (render: all of them; render_tiles: a tile's list).
template<class Pick> static void run_cmds(const Frame& f, Target t, uint32_t n, Pick pick) {
  Rect stack[16]; int sp = 0;
  RoundClip rstack[16]; uint32_t pool = 0;
  for (uint32_t i = 0; i < n; i++) {
    const Cmd& c = f.cmds[pick(i)];
#ifdef ZRT_RASTER_PROFILE
    struct Prof { uint8_t k; uint64_t t0 = hal_time_us(); ~Prof() { prof_us[k] += (uint32_t)(hal_time_us() - t0); prof_n[k]++; } } prof{(uint8_t)c.kind};
#endif
    switch (c.kind) {
      case CLEAR:
        for (int32_t y = t.clip.y0; y < t.clip.y1; y++) fill_row(&at(t, t.clip.x0, y), t.clip.x1 - t.clip.x0, c.c1);
        break;
      case RECT: if (c.r <= 0 && !c.grad && c.alpha == 255) {
          Rect b = bounds(c.x, c.y, c.w, c.h, t.clip);
          for (int32_t y = b.y0; y < b.y1; y++) if (b.x1 > b.x0) fill_row(&at(t, b.x0, y), b.x1 - b.x0, c.c1);
        } else fill_rrect(t, c);
        break;
      case BORDER: border_rrect(t, c); break;
      case SHADOW: shadow_rrect(t, c); break;
      case TEXT: draw_text(t, c, f.text + c.off); break;
      case IMAGE: draw_image(t, c); break;
      case LINE: case POLY: fill_poly(t, c, f.pts + c.off); break;
      case CLIP: {
        if (sp >= 16) break;
        RoundClip k = {c.x, c.y, c.w, c.h, c.r, 0, pool, false};
#if ZRT_CLIP_CORNER_PX > 0
        k.R = c.r > 0 ? iceil(c.r < c.w / 2 ? (c.r < c.h / 2 ? c.r : c.h / 2) : (c.w / 2 < c.h / 2 ? c.w / 2 : c.h / 2)) : 0;
        if (k.R > 0 && pool + 4u * k.R * k.R <= ZRT_CLIP_CORNER_PX) {
          k.on = true;
          pool += 4u * k.R * k.R;
          corners(t, k, t.clip, [&](int32_t x, int32_t y, uint32_t i) { corner_px[i] = at(t, x, y); });
        }
#endif
        rstack[sp] = k;
        stack[sp++] = t.clip;
        t.clip = intersect(t.clip, bounds(c.x, c.y, c.w, c.h, Rect{-100000, -100000, 100000, 100000}));
        break;
      }
      case UNCLIP: {
        if (sp <= 0) break;
        const RoundClip& k = rstack[--sp];
        t.clip = stack[sp];
#if ZRT_CLIP_CORNER_PX > 0
        if (k.on) {
          float hw = k.w / 2, hh = k.h / 2, cx = k.x + hw, cy = k.y + hh;
          corners(t, k, t.clip, [&](int32_t x, int32_t y, uint32_t i) {
            float a = clampf(0.5f - rr_sdf(x + 0.5f, y + 0.5f, cx, cy, hw, hh, k.r), 0, 1);
            if (a < 1) at(t, x, y) = lerp_color(corner_px[i], at(t, x, y), a);
          });
          pool = k.off;
        }
#endif
        break;
      }
    }
  }
}

void render(const Frame& f, uint32_t* band, int32_t w, int32_t y0, int32_t y1, Rect damage) {
  Rect base = intersect(damage, Rect{0, y0, w, y1});
  if (base.x0 >= base.x1 || base.y0 >= base.y1) return;
  run_cmds(f, Target{band, w, y0, base}, f.count, [](uint32_t i) { return i; });
}

static Rect cmd_bounds(const Cmd& c, int32_t w, int32_t h) {
  if (c.kind == CLEAR || c.kind == CLIP || c.kind == UNCLIP) return Rect{0, 0, w, h};
  float e = c.kind == SHADOW ? c.s + 1 : 1;
  // glyphs can overhang their line box (descenders, italic/scaled grid glyphs)
  if (c.kind == TEXT) { float m = c.h * 0.5f + 1; return Rect{ifloor(c.x - m), ifloor(c.y - m), iceil(c.x + c.w + m), iceil(c.y + c.h + m)}; }
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
    if (x.grad == 4) len += 8 + 3 * (uint32_t)p[len + 7];  // gradient paint
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

// ---------------------------------------------------------------- tiles (ZN-410)
// A frame with many commands is binned once into 16 x 16 tiles: each tile keeps the commands that touch it, in paint order, from the last
// opaque one that covers it whole outside any clip (CLEAR, an opaque square-cornered RECT), so each band paints its tiles' short lists instead
// of every command over every layer. A tile paints exactly the pixels render() would: the same code runs with the tile as the clip, and
// CLIP / UNCLIP (and their rounded corners) are replayed in every tile their box touches.
static const int32_t kTile = 16;
// What a command can touch: the damage bounds, widened for glyphs that overhang their line box and borders drawn across their edge.
static Rect bin_bounds(const Cmd& c, int32_t w, int32_t h) {
  if (c.kind == TEXT) { float m = c.h + 2; return Rect{ifloor(c.x - m), ifloor(c.y - m), iceil(c.x + c.w + m), iceil(c.y + c.h + m)}; }
  float e = (c.kind == SHADOW || c.kind == BORDER ? c.s : 0) + 2;
  if (c.kind == CLEAR || c.kind == CLIP || c.kind == UNCLIP) return Rect{0, 0, w, h};
  return Rect{ifloor(c.x - e), ifloor(c.y - e), iceil(c.x + c.w + e), iceil(c.y + c.h + e)};
}
static bool grow_buf(uint32_t*& p, uint32_t& cap, uint32_t need, uint32_t keep = 0) {   // keep: the leading words to copy over
  if (need <= cap) return true;
  uint32_t n = need + need / 2;
  uint32_t* q = (uint32_t*)hal_alloc((size_t)n * 4);
  if (!q) return false;
  for (uint32_t k = 0; k < keep; k++) q[k] = p[k];
  if (p) hal_free(p);
  p = q; cap = n;
  return true;
}
static inline Rect tile_range(Rect r) { return Rect{r.x0 / kTile, r.y0 / kTile, (r.x1 + kTile - 1) / kTile, (r.y1 + kTile - 1) / kTile}; }
// Binning walks the commands from the last to the first: a tile takes a command unless an opaque command above it already covers the tile
// whole (the tile is then closed), so hidden commands are never listed and the walk ends once every tile is closed. Clip boxes come from
// the commands before, so a frame with clips first records each command's tile range forward (Tiles.rng), with the clip stack applied.
bool bin(const Frame& f, int32_t w, int32_t h, Tiles& out) {
  out.ok = false;
  if (f.count < kTilesMin || w <= 0 || h <= 0 || w > 0x7FFF * kTile || h > 0x7FFF * kTile) return false;
  if (out.cooldown) { out.cooldown--; return false; }   // the tiles did not pay off a few frames ago
  static int8_t enabled = -1;   // ZINC_TILES=0: every frame through render() (comparisons, bisecting)
  if (enabled < 0) { const char* e = hal_env("ZINC_TILES"); enabled = !(e && e[0] == '0'); }
  if (!enabled) return false;
  const int32_t tw = (w + kTile - 1) / kTile, th = (h + kTile - 1) / kTile;
  const uint32_t nt = (uint32_t)(tw * th);
  const Rect screen{0, 0, w, h};
  bool clips = false;
  for (uint32_t i = 0; i < f.count && !clips; i++) clips = f.cmds[i].kind == CLIP;
  // forward, only with clips: per command 2 words, its tile range (x0 | y0 << 16 and x1 | y1 << 16; x1 = 0: none), bit 31 of the first set
  // when it is outside any clip (only there may it close tiles)
  if (clips) {
    if (!grow_buf(out.rng, out.cap_rng, 2 * f.count)) return false;
    struct Lvl { Rect clip, tiles; };
    Lvl stack[16]; int sp = 0;
    Rect clip = screen;
    for (uint32_t i = 0; i < f.count; i++) {
      const Cmd& c = f.cmds[i];
      Rect tr{0, 0, 0, 0};
      bool outside = false;
      if (c.kind == CLIP) {
        if (sp >= 16) return false;   // render() would ignore it and pop a parent at its UNCLIP: too deep to bin, render() paints the frame
        Rect inner = intersect(clip, bounds(c.x, c.y, c.w, c.h, Rect{-100000, -100000, 100000, 100000}));
        if (inner.x0 < inner.x1 && inner.y0 < inner.y1) tr = tile_range(inner);
        stack[sp++] = Lvl{clip, tr};
        clip = inner;
      } else if (c.kind == UNCLIP) {
        if (sp > 0) { const Lvl& l = stack[--sp]; clip = l.clip; tr = l.tiles; }   // else render() ignores it
      } else {
        Rect b = intersect(bin_bounds(c, w, h), clip);
        if (b.x0 < b.x1 && b.y0 < b.y1) tr = tile_range(b);
        outside = sp == 0;
      }
      out.rng[2 * i] = (uint32_t)tr.x0 | (uint32_t)tr.y0 << 16 | (outside ? 0x80000000u : 0);
      out.rng[2 * i + 1] = (uint32_t)tr.x1 | (uint32_t)tr.y1 << 16;
    }
  }
  // backward: per tile a chain of chunks, newest first (link, count, then kChunk command indices); closed[t] once a command covers tile t
  static const uint32_t kChunk = 14, kWords = kChunk + 2, kNone = 0xFFFFFFFFu;
  if (!grow_buf(out.head, out.cap_head, nt) || !grow_buf(out.closed, out.cap_closed, nt) || !grow_buf(out.chunks, out.cap_chunks, 256 * kWords)) return false;
  uint32_t *head = out.head, *closed = out.closed;
  for (uint32_t t = 0; t < nt; t++) { head[t] = kNone; closed[t] = 0; }
  uint32_t used = 0, open = nt, listed = 0, repeats = 0;
  for (uint32_t i = f.count; i-- > 0 && open;) {
    const Cmd& c = f.cmds[i];
    Rect tr;
    bool outside;   // outside any clip
    if (clips) {
      const uint32_t a = out.rng[2 * i], b = out.rng[2 * i + 1];
      tr = Rect{(int32_t)(a & 0xFFFF), (int32_t)((a >> 16) & 0x7FFF), (int32_t)(b & 0xFFFF), (int32_t)(b >> 16)};
      outside = (a & 0x80000000u) != 0;
    } else {
      if (c.kind == UNCLIP) continue;   // without a CLIP, render() ignores it
      Rect b = intersect(bin_bounds(c, w, h), screen);
      if (b.x0 >= b.x1 || b.y0 >= b.y1) continue;
      tr = tile_range(b);
      outside = true;
    }
    if (tr.x0 >= tr.x1 || tr.y0 >= tr.y1) continue;
    const bool opaque = outside && (c.kind == CLEAR || (c.kind == RECT && c.r <= 0 && !c.grad && c.alpha == 255));
    const bool light = c.kind == CLEAR || c.kind == CLIP || c.kind == UNCLIP || (c.kind == RECT && c.r <= 0 && !c.grad);
    const Rect pr = c.kind == CLEAR ? screen : Rect{ifloor(c.x), ifloor(c.y), iceil(c.x + c.w), iceil(c.y + c.h)};
    uint32_t calls = 0;
    for (int32_t ty = tr.y0; ty < tr.y1; ty++)
      for (int32_t tx = tr.x0; tx < tr.x1; tx++) {
        const uint32_t t = (uint32_t)(ty * tw + tx);
        if (closed[t]) continue;
        uint32_t k = head[t];
        if (k == kNone || out.chunks[k + 1] == kChunk) {
          if (!grow_buf(out.chunks, out.cap_chunks, used + kWords, used)) return false;
          out.chunks[used] = k; out.chunks[used + 1] = 0;
          k = head[t] = used; used += kWords;
        }
        out.chunks[k + 2 + out.chunks[k + 1]++] = i;
        calls++;
        if (!opaque) continue;
        const int32_t x0 = tx * kTile, y0 = ty * kTile, x1 = x0 + kTile < w ? x0 + kTile : w, y1 = y0 + kTile < h ? y0 + kTile : h;
        if (pr.x0 <= x0 && pr.y0 <= y0 && pr.x1 >= x1 && pr.y1 >= y1) { closed[t] = 1; open--; }
      }
    if (calls) { listed++; if (!light) repeats += calls - 1; }
  }
  // a shape with a set-up per call (rounded corners, text, polygons, images) is painted once per tile it lists in: those repeated calls must
  // cost less than the commands the tiles hide (b2-rounded, 6000 overlapping rounded rects: 14 ms whole, 54 ms in tiles); else render(),
  // and no binning for the next 30 frames
  if ((uint64_t)repeats * 4 > f.count - listed) { out.cooldown = 30; return false; }
  // flat lists in paint order: a chain starts at the lowest command index (the newest chunk, its last entry first)
  if (!grow_buf(out.start, out.cap_start, nt + 1)) return false;
  uint32_t total = 0;
  for (uint32_t t = 0; t < nt; t++) {
    out.start[t] = total;
    for (uint32_t k = head[t]; k != kNone; k = out.chunks[k]) total += out.chunks[k + 1];
  }
  out.start[nt] = total;
  if (!grow_buf(out.idx, out.cap_idx, total ? total : 1)) return false;
  for (uint32_t t = 0, n = 0; t < nt; t++)
    for (uint32_t k = head[t]; k != kNone; k = out.chunks[k])
      for (uint32_t e = out.chunks[k + 1]; e-- > 0;) out.idx[n++] = out.chunks[k + 2 + e];
  out.w = w; out.h = h; out.tw = tw; out.th = th; out.ok = true;
  return true;
}
void render_tiles(const Frame& f, const Tiles& tl, uint32_t* band, int32_t w, int32_t y0, int32_t y1, Rect damage) {
  if (!tl.ok || tl.w != w) { render(f, band, w, y0, y1, damage); return; }
  Rect base = intersect(intersect(damage, Rect{0, y0, w, y1}), Rect{0, 0, tl.w, tl.h});
  if (base.x0 >= base.x1 || base.y0 >= base.y1) return;
  for (int32_t ty = base.y0 / kTile; ty * kTile < base.y1; ty++)
    for (int32_t tx = base.x0 / kTile; tx * kTile < base.x1; tx++) {
      const uint32_t t = (uint32_t)(ty * tl.tw + tx), a = tl.start[t], n = tl.start[t + 1] - a;
      if (!n) continue;
      Rect clip = intersect(base, Rect{tx * kTile, ty * kTile, tx * kTile + kTile, ty * kTile + kTile});
      const uint32_t* list = tl.idx + a;
      run_cmds(f, Target{band, w, y0, clip}, n, [list](uint32_t k) { return list[k]; });
    }
}
void free_tiles(Tiles& t) {
  uint32_t* owned[] = {t.start, t.idx, t.rng, t.head, t.closed, t.chunks};
  for (uint32_t* p : owned) if (p) hal_free(p);
  t = Tiles{};
  t.ok = false;
}

static bool overlaps(Rect a, Rect b) { return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1; }
static int64_t area(Rect r) { return (int64_t)(r.x1 - r.x0) * (r.y1 - r.y0); }
static Rect united(Rect a, Rect b) { grow(a, b); return a; }
// The damage list (ZN-179): a rectangle joins an existing one when they overlap or when the union is smaller than the two apart (LVGL lv_refr.c join rule: area(union) < area(a) + area(b));
// over budget the cheapest pair is merged, so the list never overflows and the frame is never redrawn whole just because there were many small changes.
static void damage_add(Rect* out, int32_t& n, int32_t max, Rect screen, Rect r) {
  r = intersect(r, screen);
  if (r.x0 >= r.x1 || r.y0 >= r.y1) return;
  for (int32_t i = 0; i < n; i++)   // already covered: nothing to join (ZN-402)
    if (out[i].x0 <= r.x0 && out[i].y0 <= r.y0 && out[i].x1 >= r.x1 && out[i].y1 >= r.y1) return;
  auto join_all = [&]() {
    for (;;) {
      int32_t hit = -1;
      for (int32_t i = 0; i < n; i++) if (overlaps(out[i], r) || area(united(out[i], r)) < area(out[i]) + area(r)) { hit = i; break; }
      if (hit < 0) return;
      grow(r, out[hit]);
      out[hit] = out[--n];
    }
  };
  join_all();
  if (n < max) { out[n++] = r; return; }
  int32_t bi = 0; int64_t best = -1;
  for (int32_t i = 0; i < n; i++) { int64_t cost = area(united(out[i], r)) - area(out[i]); if (best < 0 || cost < best) { best = cost; bi = i; } }
  grow(r, out[bi]);
  out[bi] = out[--n];
  join_all();   // the grown rect may now overlap or join others
  out[n++] = r;
}
int32_t diff_rects(const Frame& a, const Frame& b, int32_t w, int32_t h, Rect* out, int32_t max, uint32_t* changed, uint32_t bulk_after) {
  int32_t n = 0;
  uint32_t nch = 0;
  const Rect screen{0, 0, w, h};
  Rect bulk = {w, h, 0, 0};   // past kBulkChanged changes: one box instead of joining every rectangle
  uint32_t cnt = a.count > b.count ? a.count : b.count;
  for (uint32_t i = 0; i < cnt; i++) {
    bool ina = i < a.count, inb = i < b.count;
    if (ina && inb && same(a, a.cmds[i], b, b.cmds[i])) continue;
    if (++nch > bulk_after) {
      if (ina) grow(bulk, cmd_bounds(a.cmds[i], w, h));
      if (inb) grow(bulk, cmd_bounds(b.cmds[i], w, h));
      continue;
    }
    if (ina) damage_add(out, n, max, screen, cmd_bounds(a.cmds[i], w, h));
    if (inb) damage_add(out, n, max, screen, cmd_bounds(b.cmds[i], w, h));
  }
  if (changed) *changed = nch;
  if (nch > bulk_after) {
    for (int32_t i = 0; i < n; i++) grow(bulk, out[i]);
    bulk = intersect(bulk, screen);
    n = bulk.x0 < bulk.x1 && bulk.y0 < bulk.y1 ? 1 : 0;
    if (n) out[0] = bulk;
  }
  return n;
}
Rect bounds_all(const Frame& f, int32_t w, int32_t h) {
  Rect r = {w, h, 0, 0};
  for (uint32_t i = 0; i < f.count; i++) {
    const uint8_t k = f.cmds[i].kind;
    if (k == CLEAR || k == CLIP || k == UNCLIP) return Rect{0, 0, w, h};   // their bounds are the screen: nothing can grow it further
    grow(r, cmd_bounds(f.cmds[i], w, h));
  }
  r = intersect(r, Rect{0, 0, w, h});
  return r.x0 < r.x1 && r.y0 < r.y1 ? r : Rect{0, 0, 0, 0};
}

// Compact previous frame (T0, ZRT_COMPACT_PREV): 12 bytes per command instead of the 48-byte command plus its share of the pools.
static uint32_t fnv(uint32_t h, const void* p, uint32_t n) { const uint8_t* b = (const uint8_t*)p; while (n--) { h ^= *b++; h *= 16777619u; } return h; }
static uint32_t cmd_hash(const Frame& f, const Cmd& c) {
  uint32_t h = fnv(2166136261u, &c, (uint32_t)(sizeof(Cmd) - 2 * sizeof(uint32_t)));   // like same(): everything but the pool offsets, then the payload
  h = fnv(h, &c.n, sizeof c.n);
  if (c.kind == TEXT) h = fnv(h, f.text + c.off, c.n);
  else if (c.kind == POLY || c.kind == LINE) {
    const float* p = f.pts + c.off;
    uint32_t len = 0;
    for (uint32_t k = 0; k < c.n; k++) len += 1 + (uint32_t)p[len] * 2;
    if (c.grad == 4) len += 8 + 3 * (uint32_t)p[len + 7];
    h = fnv(h, p, len * (uint32_t)sizeof(float));
  }
  return h;
}
static int16_t i16(int32_t v) { return v < -32768 ? (int16_t)-32768 : v > 32767 ? (int16_t)32767 : (int16_t)v; }
void sign_frame(const Frame& f, int32_t w, int32_t h, CmdSig* out) {
  for (uint32_t i = 0; i < f.count; i++) {
    Rect b = cmd_bounds(f.cmds[i], w, h);
    out[i] = CmdSig{cmd_hash(f, f.cmds[i]), i16(b.x0), i16(b.y0), i16(b.x1), i16(b.y1)};
  }
}
int32_t diff_rects_sig(const CmdSig* before, uint32_t nbefore, const Frame& now, int32_t w, int32_t h, Rect* out, int32_t max) {
  int32_t n = 0;
  const Rect screen{0, 0, w, h};
  uint32_t cnt = nbefore > now.count ? nbefore : now.count;
  for (uint32_t i = 0; i < cnt; i++) {
    bool ina = i < nbefore, inb = i < now.count;
    if (ina && inb && before[i].hash == cmd_hash(now, now.cmds[i])) continue;
    if (ina) damage_add(out, n, max, screen, Rect{before[i].x0, before[i].y0, before[i].x1, before[i].y1});
    if (inb) damage_add(out, n, max, screen, cmd_bounds(now.cmds[i], w, h));
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
// The unit circle of the join discs (ZN-406): built on first use with the same expression and the same libm calls as the loop it replaces,
// at run time (seg is not a constant there, so the compiler cannot fold cosf differently), hence the same floats. Concurrent first uses
// write the same values.
static float circle_c[3][16], circle_s[3][16];
static volatile int circle_ready[3];
static const float* circle(int seg, const float** sin_out) {
  const int t = seg == 6 ? 0 : seg == 10 ? 1 : 2;
  if (!circle_ready[t]) {
    for (int k = 0; k < seg; k++) { float a = 6.2831853f * k / seg; circle_c[t][k] = __builtin_cosf(a); circle_s[t][k] = __builtin_sinf(a); }
    circle_ready[t] = 1;
  }
  *sin_out = circle_s[t];
  return circle_c[t];
}
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
    const float* sn;
    const float* cs = circle(seg, &sn);
    for (uint32_t i = 0; i < n; i++) {
      if (closed || (i > 0 && i + 1 < n)) {  // interior vertex: no disc where the turn leaves no visible notch
        uint32_t a = (i + n - 1) % n, b = (i + 1) % n;
        float ux = p[i * 2] - p[a * 2], uy = p[i * 2 + 1] - p[a * 2 + 1], vx = p[b * 2] - p[i * 2], vy = p[b * 2 + 1] - p[i * 2 + 1];
        float l2 = (ux * ux + uy * uy) * (vx * vx + vy * vy), cr = ux * vy - uy * vx;
        if (l2 > 0 && ux * vx + uy * vy > 0 && cr * cr * r * r < 0.1f * l2) continue;  // r * sin(turn) < ~0.3px
      }
      float q[32];
      for (int k = 0; k < seg; k++) { q[k * 2] = p[i * 2] + cs[k] * r; q[k * 2 + 1] = p[i * 2 + 1] + sn[k] * r; }
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
