// Runtime TrueType glyphs (UI-15): fonts embedded as TTF (host targets) are rasterized on demand at any pixel size,
// so text stays sharp on Retina / HiDPI screens and at sizes that were not baked at build time. Glyphs are cached per
// (font, size). Small targets (esp32, ps1/ps2) embed no TTF and only use the baked bitmaps.
#include "zrt.h"
#include "zrt_raster.h"
#if __has_include("zn/resource_stats.h")
#include "zn/resource_stats.h"
#endif

namespace zrt { namespace raster {

// Every read is bounds-checked against the file: a truncated or hostile font reads zeros, never past its end
// (offsets are uint32 arithmetic; a wrapped offset is simply out of range).
struct Rd {
  const uint8_t* d; uint32_t len;
  uint32_t u8(uint32_t o) const { return o < len ? d[o] : 0; }
  uint16_t u16(uint32_t o) const { return o < len && len - o >= 2 ? (uint16_t)(d[o] << 8 | d[o + 1]) : 0; }
  int16_t s16(uint32_t o) const { return (int16_t)u16(o); }
  uint32_t u32(uint32_t o) const { return o < len && len - o >= 4 ? (uint32_t)d[o] << 24 | (uint32_t)d[o + 1] << 16 | (uint32_t)d[o + 2] << 8 | d[o + 3] : 0; }
};

struct Ttf {
  const uint8_t* d; uint32_t len;
  uint32_t head, hhea, hmtx, loca, glyf, cmap;
  int32_t upem, ascent, descent, lineGap, numGlyphs, numH, cmapFmt;
  bool longLoca, ok;
  Rd rd() const { return Rd{d, len}; }
};
static Ttf parse(const uint8_t* d, uint32_t len) {
  Ttf t{};
  t.d = d; t.len = len;
  Rd r = t.rd();
  uint16_t n = r.u16(4);
  uint32_t maxp = 0;
  for (uint32_t i = 0; i < n && 12 + i * 16 + 16 <= len; i++) {
    const uint8_t* rec = d + 12 + i * 16;
    uint32_t off = r.u32(12 + i * 16 + 8);
    if (!__builtin_memcmp(rec, "head", 4)) t.head = off;
    else if (!__builtin_memcmp(rec, "hhea", 4)) t.hhea = off;
    else if (!__builtin_memcmp(rec, "hmtx", 4)) t.hmtx = off;
    else if (!__builtin_memcmp(rec, "loca", 4)) t.loca = off;
    else if (!__builtin_memcmp(rec, "glyf", 4)) t.glyf = off;
    else if (!__builtin_memcmp(rec, "cmap", 4)) t.cmap = off;
    else if (!__builtin_memcmp(rec, "maxp", 4)) maxp = off;
  }
  if (!t.head || !t.hhea || !t.hmtx || !t.loca || !t.glyf || !t.cmap || !maxp) return t;
  t.upem = r.u16(t.head + 18); t.longLoca = r.s16(t.head + 50) == 1;
  t.numGlyphs = r.u16(maxp + 4); t.numH = r.u16(t.hhea + 34);
  t.ascent = r.s16(t.hhea + 4); t.descent = r.s16(t.hhea + 6); t.lineGap = r.s16(t.hhea + 8);
  if (!t.upem || !t.numH) return t;  // divides by upem; advances index numH - 1
  // best cmap subtable: format 12, else format 4 (Unicode platforms)
  uint16_t nsub = r.u16(t.cmap + 2);
  uint32_t best = 0;
  for (uint16_t i = 0; i < nsub; i++) {
    uint32_t rec = t.cmap + 4 + i * 8;
    uint16_t pid = r.u16(rec), eid = r.u16(rec + 2);
    uint32_t off = t.cmap + r.u32(rec + 4);
    uint16_t fmt = r.u16(off);
    if (((pid == 3 && (eid == 10 || eid == 1)) || pid == 0) && (fmt == 12 || (fmt == 4 && t.cmapFmt != 12))) { t.cmapFmt = fmt; best = off; }
  }
  t.cmap = best;
  t.ok = best != 0;
  return t;
}
static uint32_t glyph_index(const Ttf& t, uint32_t cp) {
  Rd r = t.rd();
  const uint32_t s = t.cmap;
  if (t.cmapFmt == 12) {
    uint32_t ng = r.u32(s + 12);
    for (uint32_t i = 0; i < ng; i++) {
      uint32_t g = s + 16 + i * 12;
      if (g < s || g > t.len || t.len - g < 12) break;  // groups past the end of the file
      uint32_t a = r.u32(g), b = r.u32(g + 4);
      if (cp >= a && cp <= b) return r.u32(g + 8) + cp - a;
    }
    return 0;
  }
  if (t.cmapFmt != 4 || cp > 0xFFFF) return 0;
  uint32_t segs = r.u16(s + 6) / 2u;
  const uint32_t ends = s + 14, starts = ends + segs * 2 + 2, deltas = starts + segs * 2, ranges = deltas + segs * 2;
  for (uint32_t i = 0; i < segs; i++) {
    uint16_t end = r.u16(ends + i * 2);
    if (cp > end) continue;
    uint16_t start = r.u16(starts + i * 2);
    if (cp < start) return 0;
    int16_t delta = r.s16(deltas + i * 2);
    uint16_t ro = r.u16(ranges + i * 2);
    if (!ro) return (cp + delta) & 0xFFFF;
    uint16_t g = r.u16(ranges + i * 2 + ro + (cp - start) * 2);
    return g ? (g + delta) & 0xFFFF : 0;
  }
  return 0;
}
static uint32_t loc(const Ttf& t, uint32_t g) { Rd r = t.rd(); return t.longLoca ? r.u32(t.loca + g * 4) : r.u16(t.loca + g * 2) * 2u; }

// ---- outline -> coverage, the way the baker does it (src/res/res.cpp, a port of the prototype's resources.ts): contours in font units,
// quadratics flattened into 8 segments, composites placed by their offset and x/y scale, then nonzero winding sampled 4 x 4 per pixel, in
// doubles and without fused multiply-adds, so a glyph rasterized here has the pixels a baked glyph of the same size has (ZN-669): a size or a
// file chosen at run time draws like one written in the program.
#if defined(__clang__)
#pragma clang fp contract(off)
#elif defined(__GNUC__)
#pragma GCC optimize("fp-contract=off")
#endif
struct Outline { double* xy; uint32_t n, cap; uint32_t* ends; uint32_t nc, capc; };   // points, and the end (exclusive) of each contour
static bool out_point(Outline& o, double x, double y) {
  if (o.n == o.cap) {
    uint32_t c = o.cap ? o.cap * 2 : 1024;
    double* p = (double*)hal_alloc(sizeof(double) * 2 * c);
    if (!p) return false;
    if (o.xy) { __builtin_memcpy(p, o.xy, sizeof(double) * 2 * o.n); hal_free(o.xy); }
    o.xy = p; o.cap = c;
  }
  o.xy[o.n * 2] = x; o.xy[o.n * 2 + 1] = y; o.n++;
  return true;
}
static void out_close(Outline& o) {
  if (o.nc == o.capc) {
    uint32_t c = o.capc ? o.capc * 2 : 64;
    uint32_t* p = (uint32_t*)hal_alloc(sizeof(uint32_t) * c);
    if (!p) return;
    if (o.ends) { __builtin_memcpy(p, o.ends, sizeof(uint32_t) * o.nc); hal_free(o.ends); }
    o.ends = p; o.capc = c;
  }
  o.ends[o.nc++] = o.n;
}
static void quad8(Outline& o, double ax, double ay, double cx, double cy, double bx, double by) {
  for (int i = 1; i <= 8; i++) {
    double t = (double)i / 8, u = 1 - t;
    out_point(o, u * u * ax + 2 * u * t * cx + t * t * bx, u * u * ay + 2 * u * t * cy + t * t * by);
  }
}
// composites nest at most 4 deep and expand at most this many components per glyph (a font could fan out 64K^4)
static int32_t outline_budget = 0;
static void outline(const Ttf& t, uint32_t g, Outline& out, int depth) {
  if (depth == 0) outline_budget = 4096;
  if (g >= (uint32_t)t.numGlyphs || depth > 4 || --outline_budget < 0) return;
  uint32_t o = loc(t, g), o2 = loc(t, g + 1);
  // the glyph's bytes [glyf + o, glyf + o2) must lie in the file; every read below is relative to them
  if (o >= o2 || t.glyf + o < t.glyf || t.glyf + o2 < t.glyf + o || t.glyf + o2 > t.len) return;
  Rd p{t.d + t.glyf + o, o2 - o};
  int16_t nc = p.s16(0);
  if (nc < 0) {   // a composite: each component at its offset with an x and a y scale (like the baker, the 2 x 2 matrix keeps only its diagonal)
    uint32_t q = 10;
    uint16_t flags;
    do {
      if (q + 4 > p.len) return;
      flags = p.u16(q); uint16_t gi = p.u16(q + 2); q += 4;
      double dx, dy;
      if (flags & 1) { dx = p.s16(q); dy = p.s16(q + 2); q += 4; } else { dx = (int8_t)p.u8(q); dy = (int8_t)p.u8(q + 1); q += 2; }
      double sx = 1, sy = 1;
      if (flags & 8) { sx = sy = p.s16(q) / 16384.0; q += 2; }
      else if (flags & 0x40) { sx = p.s16(q) / 16384.0; sy = p.s16(q + 2) / 16384.0; q += 4; }
      else if (flags & 0x80) { sx = p.s16(q) / 16384.0; sy = p.s16(q + 6) / 16384.0; q += 8; }
      const uint32_t from = out.n;
      outline(t, gi, out, depth + 1);
      for (uint32_t i = from; i < out.n; i++) { out.xy[i * 2] = out.xy[i * 2] * sx + dx; out.xy[i * 2 + 1] = out.xy[i * 2 + 1] * sy + dy; }
    } while (flags & 0x20);
    return;
  }
  const uint32_t ep = 10;
  uint32_t npts = nc ? p.u16(ep + (uint32_t)(nc - 1) * 2) + 1u : 0;
  uint32_t q = ep + (uint32_t)nc * 2;
  q += 2 + p.u16(q);
  // scratch allocated on first use: targets that never rasterize a TTF (esp32, ps1/ps2) keep this RAM
  static uint8_t* fl = nullptr; static double *xs = nullptr, *ys = nullptr;
  if (!fl) { fl = (uint8_t*)hal_alloc(4096); xs = (double*)hal_alloc(4096 * sizeof(double)); ys = (double*)hal_alloc(4096 * sizeof(double)); }
  if (npts > 4096 || !fl || !xs || !ys) return;
  for (uint32_t i = 0; i < npts;) { uint8_t f = (uint8_t)p.u8(q++); fl[i++] = f; if (f & 8) { uint8_t rep = (uint8_t)p.u8(q++); while (rep-- && i < npts) fl[i++] = f; } }
  int32_t v = 0;
  for (uint32_t i = 0; i < npts; i++) { uint8_t f = fl[i]; if (f & 2) { uint8_t dd = (uint8_t)p.u8(q++); v += f & 16 ? dd : -dd; } else if (!(f & 16)) { v += p.s16(q); q += 2; } xs[i] = v; }
  v = 0;
  for (uint32_t i = 0; i < npts; i++) { uint8_t f = fl[i]; if (f & 4) { uint8_t dd = (uint8_t)p.u8(q++); v += f & 32 ? dd : -dd; } else if (!(f & 32)) { v += p.s16(q); q += 2; } ys[i] = v; }
  uint32_t s = 0;
  for (int16_t c = 0; c < nc; c++) {
    uint32_t e = p.u16(ep + (uint32_t)c * 2);
    if (e < s || e >= npts) break;
    const uint32_t cnt = e - s + 1;
    // start on an on-curve point, or the midpoint of the first two off-curve points
    int32_t k = -1;
    for (uint32_t i = 0; i < cnt; i++) if (fl[s + i] & 1) { k = (int32_t)i; break; }
    double sx, sy;
    if (k < 0) { sx = (xs[s] + xs[s + (1 % cnt)]) / 2; sy = (ys[s] + ys[s + (1 % cnt)]) / 2; k = 0; }
    else { sx = xs[s + k]; sy = ys[s + k]; k++; }
    out_point(out, sx, sy);
    double px = sx, py = sy, cx = 0, cy = 0;
    bool ctrl = false;
    for (uint32_t i = 0; i < cnt; i++) {
      uint32_t j = s + ((uint32_t)k + i) % cnt;
      double x = xs[j], y = ys[j];
      if (fl[j] & 1) { if (ctrl) quad8(out, px, py, cx, cy, x, y); else out_point(out, x, y); px = x; py = y; ctrl = false; }
      else {
        if (ctrl) { double mx = (cx + x) / 2, my = (cy + y) / 2; quad8(out, px, py, cx, cy, mx, my); px = mx; py = my; }
        cx = x; cy = y; ctrl = true;
      }
    }
    if (ctrl) quad8(out, px, py, cx, cy, sx, sy);
    out_close(out);
    s = e + 1;
  }
}
/** Nonzero coverage of the contours (already in pixels, the box at the origin) into `bits`, w x h, 4 x 4 samples per pixel. */
static void cover(const Outline& o, int32_t w, int32_t h, uint8_t* bits) {
  struct Edge { double x0, y0, x1, y1; int32_t dir; };
  struct X { double x; int32_t d; };
  Edge* edges = (Edge*)hal_alloc(sizeof(Edge) * (o.n + 1));
  X* xs = (X*)hal_alloc(sizeof(X) * (o.n + 1));
  uint16_t* acc = (uint16_t*)hal_alloc(sizeof(uint16_t) * (size_t)w * h + 2);
  if (!edges || !xs || !acc) { if (edges) hal_free(edges); if (xs) hal_free(xs); if (acc) hal_free(acc); return; }
  __builtin_memset(acc, 0, sizeof(uint16_t) * (size_t)w * h);
  uint32_t ne = 0, start = 0;
  for (uint32_t c = 0; c < o.nc; c++) {
    const uint32_t end = o.ends[c], cnt = end - start;
    for (uint32_t i = 0; i < cnt; i++) {
      const double* a = o.xy + (start + i) * 2;
      const double* b = o.xy + (start + (i + 1) % cnt) * 2;
      if (a[1] == b[1]) continue;
      edges[ne++] = a[1] < b[1] ? Edge{a[0], a[1], b[0], b[1], 1} : Edge{b[0], b[1], a[0], a[1], -1};
    }
    start = end;
  }
  const int32_t S = 4;
  for (int32_t sy = 0; sy < h * S; sy++) {
    const double y = (sy + 0.5) / S;
    uint32_t nx = 0;
    for (uint32_t i = 0; i < ne; i++) {
      const Edge& e = edges[i];
      if (y >= e.y0 && y < e.y1) {   // in edge order, then a stable insertion by x (as the baker's stable_sort)
        X v{e.x0 + (y - e.y0) * (e.x1 - e.x0) / (e.y1 - e.y0), e.dir};
        uint32_t k = nx++;
        while (k > 0 && v.x < xs[k - 1].x) { xs[k] = xs[k - 1]; k--; }
        xs[k] = v;
      }
    }
    if (!nx) continue;
    int32_t wind = 0;
    const size_t row = (size_t)(sy / S) * w;
    for (uint32_t k = 0; k + 1 < nx; k++) {
      wind += xs[k].d;
      if (wind == 0) continue;
      double fa = __builtin_ceil(xs[k].x * S - 0.5), fb = __builtin_floor(xs[k + 1].x * S - 0.5);
      int32_t from = fa < 0 ? 0 : (int32_t)fa, to = fb > w * S - 1 ? w * S - 1 : (int32_t)fb;
      for (int32_t sx = from; sx <= to; sx++) acc[row + (sx >> 2)]++;
    }
  }
  for (size_t i = 0; i < (size_t)w * h; i++) { double c = __builtin_floor(acc[i] * 255.0 / (S * S) + 0.5); bits[i] = (uint8_t)(c > 255 ? 255 : c); }
  hal_free(edges); hal_free(xs); hal_free(acc);
}

// ---- runtime fonts: one per (file, px), glyphs rasterized on first use
#ifndef ZRT_RUNTIME_FONTS
#define ZRT_RUNTIME_FONTS 48
#endif
// Besides the fonts a program asks for, those gfx makes for a text drawn through a matrix that scales (scaled_font, ZN-726): their own
// share of the table, so a zoom never takes a font the program asks for later. None where no TrueType file is embedded.
#ifndef ZRT_SCALED_FONTS
#if ((defined(__APPLE__) || defined(__linux__)) && !defined(ESP_PLATFORM)) || defined(__EMSCRIPTEN__)
#define ZRT_SCALED_FONTS 64
#else
#define ZRT_SCALED_FONTS 0
#endif
#endif
struct RFont {
  Font f;          // name/px/metrics; glyphs/bitmap point into the growable arrays below
  int32_t file; bool italic;   // italic: synthetic slant (12 degrees), the font is asked as "Name~i"
  Glyph* glyphs; int32_t nglyph, capglyph;   // open-addressing table keyed by cp (cp 0xFFFFFFFF = empty)
  uint8_t* bitmap; uint32_t nbits, capbits;
};
static RFont rfonts[ZRT_RUNTIME_FONTS + ZRT_SCALED_FONTS];
static int32_t nrfonts = 0, nscaled = 0;
#if __has_include("zn/resource_stats.h")
static ZnResourceStats font_stats(void*) {   // the fonts made at run time and their glyphs; active: those made for scaled texts
  ZnResourceStats s{};
  s.objects = (uint64_t)nrfonts; s.active = (uint64_t)nscaled;
  for (int32_t i = 0; i < nrfonts; i++) s.cpuBytes += rfonts[i].capbits + (uint64_t)rfonts[i].capglyph * sizeof(Glyph);
  return s;
}
static ZnResourceStatsRegistration font_stats_registration("fonts", font_stats);
#endif
static const int32_t MAX_TTF = 32;  // ponytail: fixed table, fonts past it render with the baked sizes only
static Ttf ttfs[MAX_TTF];

static void* grow(void* old, uint32_t old_bytes, uint32_t new_bytes) {
  void* p = hal_alloc(new_bytes);
  if (old) { __builtin_memcpy(p, old, old_bytes); hal_free(old); }
  return p;
}
static Glyph* slot(RFont& r, uint32_t cp) {
  uint32_t mask = (uint32_t)r.capglyph - 1, i = (cp * 2654435761u) & mask;
  while (r.glyphs[i].cp != 0xFFFFFFFFu && r.glyphs[i].cp != cp) i = (i + 1) & mask;
  return &r.glyphs[i];
}
static const Glyph* rasterize(RFont& r, uint32_t cp) {
  if (r.nglyph * 2 >= r.capglyph) {  // rehash
    Glyph* old = r.glyphs; int32_t oc = r.capglyph;
    r.capglyph = oc ? oc * 2 : 256;
    r.glyphs = (Glyph*)hal_alloc(sizeof(Glyph) * r.capglyph);
    for (int32_t i = 0; i < r.capglyph; i++) r.glyphs[i].cp = 0xFFFFFFFFu;
    for (int32_t i = 0; i < oc; i++) if (old[i].cp != 0xFFFFFFFFu) *slot(r, old[i].cp) = old[i];
    if (old) hal_free(old);
  }
  const Ttf& t = ttfs[r.file];
  uint32_t gi = glyph_index(t, cp);
  if (!gi && cp != 0) return nullptr;
  const double scale = (double)r.f.px / t.upem;
  const uint32_t hi = gi < (uint32_t)t.numH ? gi : (uint32_t)t.numH - 1;
  Glyph g{cp, 0, 0, 0, 0, (int32_t)__builtin_floor(t.rd().u16(t.hmtx + 4 * hi) * scale * 64 + 0.5), r.nbits};
  static Outline o = {};   // scratch kept between glyphs
  o.n = 0; o.nc = 0;
  outline(t, gi, o, 0);
  if (o.n) {   // font units (y up) -> pixels (y down); the synthetic italic slants x by the height above the baseline
    double x0 = 1e300, y0 = 1e300, x1 = -1e300, y1 = -1e300;
    for (uint32_t i = 0; i < o.n; i++) {
      double* q = o.xy + i * 2;
      const double x = (q[0] + (r.italic ? 0.2126 * q[1] : 0)) * scale, y = -q[1] * scale;
      q[0] = x; q[1] = y;
      x0 = x < x0 ? x : x0; y0 = y < y0 ? y : y0; x1 = x > x1 ? x : x1; y1 = y > y1 ? y : y1;
    }
    const int32_t gx = (int32_t)__builtin_floor(x0), gy = (int32_t)__builtin_floor(y0);
    const int32_t w = (int32_t)__builtin_ceil(x1) - gx, h = (int32_t)__builtin_ceil(y1) - gy;
    if (w >= 0 && h >= 0 && w < 1024 && h < 1024) {
      for (uint32_t i = 0; i < o.n; i++) { o.xy[i * 2] -= gx; o.xy[i * 2 + 1] -= gy; }
      if (r.nbits + (uint32_t)(w * h) > r.capbits) {
        uint32_t nc = r.capbits ? r.capbits * 2 : 16384;
        while (nc < r.nbits + (uint32_t)(w * h)) nc *= 2;
        r.bitmap = (uint8_t*)grow(r.bitmap, r.nbits, nc); r.capbits = nc;
        r.f.bitmap = r.bitmap;
      }
      if (w > 0 && h > 0) cover(o, w, h, r.bitmap + r.nbits);
      g.x0 = (int16_t)gx; g.y0 = (int16_t)gy; g.w = (uint16_t)w; g.h = (uint16_t)h; g.off = r.nbits;
      r.nbits += (uint32_t)(w * h);
    }
  }
  Glyph* s = slot(r, cp);
  *s = g;
  r.nglyph++;
  return s;
}

bool runtime_font(int32_t id) { return id >= RUNTIME_FONT_BASE && id < RUNTIME_FONT_BASE + nrfonts; }
const Font* font_at(int32_t id) {
  if (id >= 0 && id < font_count) return &fonts[id];
  if (runtime_font(id)) return &rfonts[id - RUNTIME_FONT_BASE].f;
  return nullptr;
}
// TrueType files added at run time (ZN-669): a font file of the assets that the program names while it runs, read by the host. Their indices
// follow the embedded files'.
static TtfFile extra[8];
static int32_t nextra = 0;
static const TtfFile* file_at(int32_t i) { return i < ttf_count ? &ttf_files[i] : i - ttf_count < nextra ? &extra[i - ttf_count] : nullptr; }
int32_t add_font_file(const char* name, uint32_t name_len, const uint8_t* data, uint32_t len) {
  if (nextra == 8 || ttf_count + nextra >= MAX_TTF) return -1;
  const Ttf t = parse(data, len);
  if (!t.ok) return -1;   // not a TrueType file with glyf outlines (a CFF OpenType file has none for this rasterizer)
  char* n = (char*)hal_alloc(name_len + 1);
  uint8_t* d = (uint8_t*)hal_alloc(len ? len : 1);
  if (!n || !d) { if (n) hal_free(n); if (d) hal_free(d); return -1; }
  __builtin_memcpy(n, name, name_len); n[name_len] = 0;
  __builtin_memcpy(d, data, len);
  extra[nextra] = TtfFile{n, d, len};
  return ttf_count + nextra++;
}
int32_t font_file(int32_t id) { return runtime_font(id) && rfonts[id - RUNTIME_FONT_BASE].file < ttf_count ? rfonts[id - RUNTIME_FONT_BASE].file : -1; }   // the shaper's faces are the embedded files
const Glyph* runtime_glyph(int32_t id, uint32_t cp) {
  RFont& r = rfonts[id - RUNTIME_FONT_BASE];
  if (r.capglyph) { Glyph* s = slot(r, cp); if (s->cp == cp) return s; }
  return rasterize(r, cp);
}
/** Font `name` at exactly `px` pixels, rasterized from its TrueType file (embedded, or added at run time); `baked`: a baked font of that size
 *  first. -1 when no file has that name. */
static int32_t from_file(const char* name, uint32_t name_len, int32_t px, bool baked_first, bool scaled = false) {
  static uint32_t gen = 0;
  if (gen != font_gen) {   // another program's files at the same indices: its runtime fonts start again (ponytail: the old glyphs are not freed)
    gen = font_gen;
    nrfonts = nscaled = 0;
    for (Ttf& t : ttfs) t.ok = false;
  }
  bool italic = name_len > 2 && name[name_len - 2] == '~' && name[name_len - 1] == 'i';
  if (italic) name_len -= 2;
  if (baked_first) { int32_t b = find_font(name, name_len, px); if (b >= 0 && fonts[b].px == px && !italic) return b; }
  for (int32_t i = 0; i < nrfonts; i++) {
    const Font& f = rfonts[i].f;
    uint32_t k = 0; while (f.name[k]) k++;
    if (f.px == px && rfonts[i].italic == italic && k == name_len && !__builtin_memcmp(f.name, name, k)) return RUNTIME_FONT_BASE + i;
  }
  if (scaled ? nscaled >= ZRT_SCALED_FONTS : nrfonts - nscaled >= ZRT_RUNTIME_FONTS) return -1;
  for (int32_t i = 0; i < ttf_count + nextra && i < MAX_TTF; i++) {
    const TtfFile& file = *file_at(i);
    uint32_t k = 0; while (file.name[k]) k++;
    if (k != name_len || __builtin_memcmp(file.name, name, k)) continue;
    if (!ttfs[i].ok) ttfs[i] = parse(file.data, file.len);
    const Ttf& t = ttfs[i];
    if (!t.ok) return -1;
    RFont& r = rfonts[nrfonts];
    r = RFont{};
    const double s = (double)px / t.upem;   // the baker's metrics: Math.round of the scaled values
    r.f = Font{file.name, px, (int32_t)__builtin_floor(t.ascent * s + 0.5), (int32_t)__builtin_floor(-t.descent * s + 0.5), (int32_t)__builtin_floor(t.lineGap * s + 0.5), 0, nullptr, nullptr};
    r.file = i; r.italic = italic;
    nscaled += scaled;
    return RUNTIME_FONT_BASE + nrfonts++;
  }
  return -1;
}
int32_t exact_font(const char* name, uint32_t name_len, int32_t px) { return from_file(name, name_len, px, true); }
/** Font `name` at exactly `px` pixels: a baked one if it exists, else rasterized from its TTF, else the closest baked size. `name` "sans"/"sans-bold"/
 *  "mono", the file name of a TTF in the assets, or a file added at run time. */
int32_t render_font(const char* name, uint32_t name_len, int32_t px) {
  const int32_t f = from_file(name, name_len, px, true);
  if (f >= 0) return f;
  bool italic = name_len > 2 && name[name_len - 2] == '~' && name[name_len - 1] == 'i';
  return find_font(name, italic ? name_len - 2 : name_len, px);
}
/** The family and style of `font` at `px` pixels, for the glyphs of a text drawn through a matrix that scales (gfx drawText): a baked or
 *  runtime font of that size, else one made from its TrueType file while ZRT_SCALED_FONTS allows, else the closest baked size. -1: none.
 *  ponytail: these fonts are never freed; gfx asks for a few sizes only (its ladder), so the table bounds them. An LRU if a program
 *  zooms more families than the table holds. */
int32_t scaled_font(int32_t font, int32_t px) {
  const Font* f = font_at(font);
  char name[96];
  uint32_t n = 0;
  if (!f) return -1;
  while (f->name[n] && n < sizeof name - 3) { name[n] = f->name[n]; n++; }
  if (f->name[n]) return -1;
  uint32_t asked = n;
  if (runtime_font(font) && rfonts[font - RUNTIME_FONT_BASE].italic) { name[n] = '~'; name[n + 1] = 'i'; asked = n + 2; }
  const int32_t r = from_file(name, asked, px, true, true);
  return r >= 0 ? r : find_font(name, n, px);
}
/** The font text `s` should be drawn in: `font`, or when it is a baked font that lacks one of the characters (typed at run time, read from a
 *  file the baker did not see) the same family and size rasterized from its TrueType file, which has the same pixels for the characters both
 *  have (ZN-669). ASCII is always baked. */
int32_t text_font(int32_t font, const char* s, uint32_t n) {
  if (font < 0 || font >= font_count) return font;
  uint32_t i = 0;
  while (i < n && (uint8_t)s[i] < 0x80) i++;
  if (i == n) return font;
  const Font& f = fonts[font];
  for (i = 0; i < n;) {
    uint8_t c = (uint8_t)s[i];
    uint32_t w = c < 0x80 ? 1 : c < 0xE0 ? 2 : c < 0xF0 ? 3 : 4, cp = c < 0x80 ? c : c < 0xE0 ? c & 0x1F : c < 0xF0 ? c & 0x0F : c & 0x07;
    for (uint32_t k = 1; k < w && i + k < n; k++) cp = (cp << 6) | ((uint8_t)s[i + k] & 0x3F);
    i += w;
    if (cp < 0x80 || has_glyph(font, cp)) continue;
    uint32_t len = 0; while (f.name[len]) len++;
    const int32_t t = from_file(f.name, len, f.px, false);
    return t >= 0 ? t : font;
  }
  return font;
}

}}  // namespace zrt::raster
