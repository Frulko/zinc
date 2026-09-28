// Runtime TrueType glyphs (UI-15): fonts embedded as TTF (host targets) are rasterized on demand at any pixel size,
// so text stays sharp on Retina / HiDPI screens and at sizes that were not baked at build time. Glyphs are cached per
// (font, size). Small targets (esp32, ps1/ps2) embed no TTF and only use the baked bitmaps.
#include "zrt.h"
#include "zrt_raster.h"

namespace zrt { namespace raster {

static uint16_t u16(const uint8_t* p) { return (uint16_t)(p[0] << 8 | p[1]); }
static int16_t s16(const uint8_t* p) { return (int16_t)u16(p); }
static uint32_t u32(const uint8_t* p) { return (uint32_t)p[0] << 24 | (uint32_t)p[1] << 16 | (uint32_t)p[2] << 8 | p[3]; }

struct Ttf {
  const uint8_t* d; uint32_t len;
  uint32_t head, hhea, hmtx, loca, glyf, cmap;
  int32_t upem, ascent, descent, lineGap, numGlyphs, numH, cmapFmt;
  bool longLoca, ok;
};
static Ttf parse(const uint8_t* d, uint32_t len) {
  Ttf t{};
  t.d = d; t.len = len;
  uint16_t n = u16(d + 4);
  uint32_t maxp = 0;
  for (uint16_t i = 0; i < n; i++) {
    const uint8_t* r = d + 12 + i * 16;
    uint32_t off = u32(r + 8);
    if (!__builtin_memcmp(r, "head", 4)) t.head = off;
    else if (!__builtin_memcmp(r, "hhea", 4)) t.hhea = off;
    else if (!__builtin_memcmp(r, "hmtx", 4)) t.hmtx = off;
    else if (!__builtin_memcmp(r, "loca", 4)) t.loca = off;
    else if (!__builtin_memcmp(r, "glyf", 4)) t.glyf = off;
    else if (!__builtin_memcmp(r, "cmap", 4)) t.cmap = off;
    else if (!__builtin_memcmp(r, "maxp", 4)) maxp = off;
  }
  if (!t.head || !t.hhea || !t.hmtx || !t.loca || !t.glyf || !t.cmap || !maxp) return t;
  t.upem = u16(d + t.head + 18); t.longLoca = s16(d + t.head + 50) == 1;
  t.numGlyphs = u16(d + maxp + 4); t.numH = u16(d + t.hhea + 34);
  t.ascent = s16(d + t.hhea + 4); t.descent = s16(d + t.hhea + 6); t.lineGap = s16(d + t.hhea + 8);
  // best cmap subtable: format 12, else format 4 (Unicode platforms)
  uint16_t nsub = u16(d + t.cmap + 2);
  uint32_t best = 0;
  for (uint16_t i = 0; i < nsub; i++) {
    const uint8_t* r = d + t.cmap + 4 + i * 8;
    uint16_t pid = u16(r), eid = u16(r + 2);
    uint32_t off = t.cmap + u32(r + 4);
    uint16_t fmt = u16(d + off);
    if (((pid == 3 && (eid == 10 || eid == 1)) || pid == 0) && (fmt == 12 || (fmt == 4 && t.cmapFmt != 12))) { t.cmapFmt = fmt; best = off; }
  }
  t.cmap = best;
  t.ok = best != 0;
  return t;
}
static uint32_t glyph_index(const Ttf& t, uint32_t cp) {
  const uint8_t* s = t.d + t.cmap;
  if (t.cmapFmt == 12) {
    uint32_t ng = u32(s + 12);
    for (uint32_t i = 0; i < ng; i++) { const uint8_t* g = s + 16 + i * 12; uint32_t a = u32(g), b = u32(g + 4); if (cp >= a && cp <= b) return u32(g + 8) + cp - a; }
    return 0;
  }
  if (t.cmapFmt != 4 || cp > 0xFFFF) return 0;
  uint16_t segs = u16(s + 6) / 2;
  const uint8_t *ends = s + 14, *starts = ends + segs * 2 + 2, *deltas = starts + segs * 2, *ranges = deltas + segs * 2;
  for (uint16_t i = 0; i < segs; i++) {
    uint16_t end = u16(ends + i * 2);
    if (cp > end) continue;
    uint16_t start = u16(starts + i * 2);
    if (cp < start) return 0;
    int16_t delta = s16(deltas + i * 2);
    uint16_t ro = u16(ranges + i * 2);
    if (!ro) return (cp + delta) & 0xFFFF;
    uint16_t g = u16(ranges + i * 2 + ro + (cp - start) * 2);
    return g ? (g + delta) & 0xFFFF : 0;
  }
  return 0;
}
static uint32_t loc(const Ttf& t, uint32_t g) { return t.longLoca ? u32(t.d + t.loca + g * 4) : u16(t.d + t.loca + g * 2) * 2u; }

// ---- outline -> coverage (signed-area accumulation, as in font-rs)
struct Raster { float* a; int32_t w, h; };
static void line(Raster& r, float x0, float y0, float x1, float y1) {
  if (y0 == y1) return;
  float dir = 1;
  if (y0 > y1) { float tx = x0, ty = y0; x0 = x1; y0 = y1; x1 = tx; y1 = ty; dir = -1; }
  float dxdy = (x1 - x0) / (y1 - y0), x = x0;
  int32_t ys = y0 < 0 ? 0 : (int32_t)y0;
  if (y0 < 0) x -= y0 * dxdy;
  int32_t ye = (int32_t)__builtin_ceilf(y1); if (ye > r.h) ye = r.h;
  for (int32_t y = ys; y < ye; y++) {
    int32_t ls = y * r.w;
    float dy = ((float)(y + 1) < y1 ? (float)(y + 1) : y1) - ((float)y > y0 ? (float)y : y0);
    float xn = x + dxdy * dy, d = dy * dir;
    float xa = x < xn ? x : xn, xb = x < xn ? xn : x;
    float fa = __builtin_floorf(xa), cb = __builtin_ceilf(xb);
    int32_t ia = (int32_t)fa, ib = (int32_t)cb;
    if (ia < 0 || ib + 1 >= r.w) { x = xn; continue; }  // outside the padded box (should not happen)
    if (ib <= ia + 1) {
      float xm = 0.5f * (x + xn) - fa;
      r.a[ls + ia] += d - d * xm;
      r.a[ls + ia + 1] += d * xm;
    } else {
      float s = 1.0f / (xb - xa), xaf = xa - fa, a0 = 0.5f * s * (1 - xaf) * (1 - xaf), xbf = xb - cb + 1, am = 0.5f * s * xbf * xbf;
      r.a[ls + ia] += d * a0;
      if (ib == ia + 2) r.a[ls + ia + 1] += d * (1 - a0 - am);
      else {
        float a1 = s * (1.5f - xaf);
        r.a[ls + ia + 1] += d * (a1 - a0);
        for (int32_t xi = ia + 2; xi < ib - 1; xi++) r.a[ls + xi] += d * s;
        float a2 = a1 + (float)(ib - ia - 3) * s;
        r.a[ls + ib - 1] += d * (1 - a2 - am);
      }
      r.a[ls + ib] += d * am;
    }
    x = xn;
  }
}
static void quad(Raster& r, float x0, float y0, float cx, float cy, float x1, float y1) {
  float dd = __builtin_fabsf(x0 - 2 * cx + x1) + __builtin_fabsf(y0 - 2 * cy + y1);
  int32_t n = 1 + (int32_t)__builtin_sqrtf(__builtin_sqrtf(dd * dd) * 2.0f);
  if (n > 32) n = 32;
  float px = x0, py = y0;
  for (int32_t i = 1; i <= n; i++) {
    float t = (float)i / n, u = 1 - t;
    float qx = u * u * x0 + 2 * u * t * cx + t * t * x1, qy = u * u * y0 + 2 * u * t * cy + t * t * y1;
    line(r, px, py, qx, qy);
    px = qx; py = qy;
  }
}
// transform applied to glyph points: x * sx + dx, y * sy + dy (composites nest affine offsets/scales)
struct Xf { float a, b, c, d, e, f; };  // x' = a x + c y + e ; y' = b x + d y + f
static void outline(const Ttf& t, uint32_t g, const Xf& m, Raster& r, int depth, bool bounds_only, float* bb) {
  if ((int32_t)g >= t.numGlyphs || depth > 4) return;
  uint32_t o = loc(t, g), o2 = loc(t, g + 1);
  if (o == o2) return;
  const uint8_t* p = t.d + t.glyf + o;
  int16_t nc = s16(p);
  if (nc < 0) {
    const uint8_t* q = p + 10;
    uint16_t flags;
    do {
      flags = u16(q); uint16_t gi = u16(q + 2); q += 4;
      float dx, dy;
      if (flags & 1) { dx = s16(q); dy = s16(q + 2); q += 4; } else { dx = (int8_t)q[0]; dy = (int8_t)q[1]; q += 2; }
      float a = 1, b = 0, c = 0, d = 1;
      if (flags & 8) { a = d = s16(q) / 16384.0f; q += 2; }
      else if (flags & 0x40) { a = s16(q) / 16384.0f; d = s16(q + 2) / 16384.0f; q += 4; }
      else if (flags & 0x80) { a = s16(q) / 16384.0f; b = s16(q + 2) / 16384.0f; c = s16(q + 4) / 16384.0f; d = s16(q + 6) / 16384.0f; q += 8; }
      Xf k{m.a * a + m.c * b, m.b * a + m.d * b, m.a * c + m.c * d, m.b * c + m.d * d, m.a * dx + m.c * dy + m.e, m.b * dx + m.d * dy + m.f};
      outline(t, gi, k, r, depth + 1, bounds_only, bb);
    } while (flags & 0x20);
    return;
  }
  const uint8_t* ep = p + 10;
  uint16_t npts = nc ? u16(ep + (nc - 1) * 2) + 1 : 0;
  const uint8_t* q = ep + nc * 2;
  q += 2 + u16(q);
  static uint8_t fl[4096]; static float xs[4096], ys[4096];
  if (npts > 4096) return;
  for (uint16_t i = 0; i < npts;) { uint8_t f = *q++; fl[i++] = f; if (f & 8) { uint8_t rep = *q++; while (rep-- && i < npts) fl[i++] = f; } }
  int32_t v = 0;
  for (uint16_t i = 0; i < npts; i++) { uint8_t f = fl[i]; if (f & 2) { uint8_t dd = *q++; v += f & 16 ? dd : -dd; } else if (!(f & 16)) { v += s16(q); q += 2; } xs[i] = (float)v; }
  v = 0;
  for (uint16_t i = 0; i < npts; i++) { uint8_t f = fl[i]; if (f & 4) { uint8_t dd = *q++; v += f & 32 ? dd : -dd; } else if (!(f & 32)) { v += s16(q); q += 2; } ys[i] = (float)v; }
  for (uint16_t i = 0; i < npts; i++) { float x = xs[i], y = ys[i]; xs[i] = m.a * x + m.c * y + m.e; ys[i] = m.b * x + m.d * y + m.f; }
  if (bounds_only) {
    for (uint16_t i = 0; i < npts; i++) { bb[0] = xs[i] < bb[0] ? xs[i] : bb[0]; bb[1] = ys[i] < bb[1] ? ys[i] : bb[1]; bb[2] = xs[i] > bb[2] ? xs[i] : bb[2]; bb[3] = ys[i] > bb[3] ? ys[i] : bb[3]; }
    return;
  }
  uint16_t s = 0;
  for (int16_t c = 0; c < nc; c++) {
    uint16_t e = u16(ep + c * 2), cnt = (uint16_t)(e - s + 1);
    if (e < s || e >= npts) break;
    // start on an on-curve point, or the midpoint of the first two off-curve points
    int32_t k = -1;
    for (uint16_t i = 0; i < cnt; i++) if (fl[s + i] & 1) { k = i; break; }
    float sx, sy;
    if (k < 0) { sx = (xs[s] + xs[s + (1 % cnt)]) / 2; sy = (ys[s] + ys[s + (1 % cnt)]) / 2; k = 0; }
    else { sx = xs[s + k]; sy = ys[s + k]; k++; }
    float px = sx, py = sy, cx = 0, cy = 0;
    bool ctrl = false;
    for (uint16_t i = 0; i < cnt; i++) {
      uint16_t j = s + (uint16_t)((k + i) % cnt);
      float x = xs[j], y = ys[j];
      if (fl[j] & 1) { if (ctrl) quad(r, px, py, cx, cy, x, y); else line(r, px, py, x, y); px = x; py = y; ctrl = false; }
      else {
        if (ctrl) { float mx = (cx + x) / 2, my = (cy + y) / 2; quad(r, px, py, cx, cy, mx, my); px = mx; py = my; }
        cx = x; cy = y; ctrl = true;
      }
    }
    if (ctrl) quad(r, px, py, cx, cy, sx, sy); else line(r, px, py, sx, sy);
    s = e + 1;
  }
}

// ---- runtime fonts: one per (file, px), glyphs rasterized on first use
#ifndef ZRT_RUNTIME_FONTS
#define ZRT_RUNTIME_FONTS 48
#endif
struct RFont {
  Font f;          // name/px/metrics; glyphs/bitmap point into the growable arrays below
  int32_t file;
  Glyph* glyphs; int32_t nglyph, capglyph;   // open-addressing table keyed by cp (cp 0xFFFFFFFF = empty)
  uint8_t* bitmap; uint32_t nbits, capbits;
};
static RFont rfonts[ZRT_RUNTIME_FONTS];
static int32_t nrfonts = 0;
static Ttf ttfs[8];

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
  float scale = (float)r.f.px / t.upem;
  Xf m{scale, 0, 0, -scale, 0, 0};  // font units (y up) -> pixels (y down)
  float bb[4] = {1e9f, 1e9f, -1e9f, -1e9f};
  Raster none{nullptr, 0, 0};
  outline(t, gi, m, none, 0, true, bb);
  Glyph g{cp, 0, 0, 0, 0, (int32_t)__builtin_roundf(u16(t.d + t.hmtx + 4 * (gi < (uint32_t)t.numH ? gi : (uint32_t)t.numH - 1)) * scale * 64), r.nbits};
  if (bb[0] <= bb[2]) {
    int32_t x0 = (int32_t)__builtin_floorf(bb[0]), y0 = (int32_t)__builtin_floorf(bb[1]);
    int32_t w = (int32_t)__builtin_ceilf(bb[2]) - x0 + 1, h = (int32_t)__builtin_ceilf(bb[3]) - y0 + 1;
    if (w > 0 && h > 0 && w < 1024 && h < 1024) {
      int32_t aw = w + 3;
      float* acc = (float*)hal_alloc(sizeof(float) * (size_t)aw * h + 16);
      __builtin_memset(acc, 0, sizeof(float) * (size_t)aw * h + 16);
      Raster ras{acc, aw, h};
      Xf mm{scale, 0, 0, -scale, (float)-x0 + 1, (float)-y0};
      outline(t, gi, mm, ras, 0, false, nullptr);
      if (r.nbits + (uint32_t)(w * h) > r.capbits) {
        uint32_t nc = r.capbits ? r.capbits * 2 : 16384;
        while (nc < r.nbits + (uint32_t)(w * h)) nc *= 2;
        r.bitmap = (uint8_t*)grow(r.bitmap, r.nbits, nc); r.capbits = nc;
        r.f.bitmap = r.bitmap;
      }
      for (int32_t y = 0; y < h; y++) {
        float s = 0;
        for (int32_t x = 0; x < aw; x++) {
          s += acc[y * aw + x];
          if (x >= 1 && x <= w) { float c = __builtin_fabsf(s); r.bitmap[r.nbits + y * w + x - 1] = (uint8_t)(c >= 1 ? 255 : c * 255 + 0.5f); }
        }
      }
      hal_free(acc);
      g.x0 = (int16_t)x0; g.y0 = (int16_t)y0; g.w = (uint16_t)w; g.h = (uint16_t)h; g.off = r.nbits;
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
const Glyph* runtime_glyph(int32_t id, uint32_t cp) {
  RFont& r = rfonts[id - RUNTIME_FONT_BASE];
  if (r.capglyph) { Glyph* s = slot(r, cp); if (s->cp == cp) return s; }
  return rasterize(r, cp);
}
/** Font `name` at exactly `px` pixels: a baked one if it exists, else rasterized from the embedded TTF, else the
 *  closest baked size. `name` "sans"/"sans-bold"/"mono" or the file name of a TTF in the assets. */
int32_t render_font(const char* name, uint32_t name_len, int32_t px) {
  int32_t baked = find_font(name, name_len, px);
  if (baked >= 0 && fonts[baked].px == px) return baked;
  for (int32_t i = 0; i < nrfonts; i++) {
    const Font& f = rfonts[i].f;
    uint32_t k = 0; while (f.name[k]) k++;
    if (f.px == px && k == name_len && !__builtin_memcmp(f.name, name, k)) return RUNTIME_FONT_BASE + i;
  }
  for (int32_t i = 0; i < ttf_count && nrfonts < ZRT_RUNTIME_FONTS; i++) {
    const char* n = ttf_files[i].name;
    uint32_t k = 0; while (n[k]) k++;
    if (k != name_len || __builtin_memcmp(n, name, k)) continue;
    if (!ttfs[i].ok) ttfs[i] = parse(ttf_files[i].data, ttf_files[i].len);
    const Ttf& t = ttfs[i];
    if (!t.ok) return baked;
    RFont& r = rfonts[nrfonts];
    r = RFont{};
    float s = (float)px / t.upem;
    r.f = Font{ttf_files[i].name, px, (int32_t)__builtin_roundf(t.ascent * s), (int32_t)__builtin_roundf(-t.descent * s), (int32_t)__builtin_roundf(t.lineGap * s), 0, nullptr, nullptr};
    r.file = i;
    return RUNTIME_FONT_BASE + nrfonts++;
  }
  return baked;
}

}}  // namespace zrt::raster
