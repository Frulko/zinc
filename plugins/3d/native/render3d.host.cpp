// zinc:3d renderer: per-vertex transform and lighting in float, homogeneous clipping (near/far planes + a guard
// band), backface culling, scanline rasterization with 16.16 fixed-point edges and attributes, a 16- or 32-bit
// z-buffer, perspective-correct texturing by span subdivision, optional 2x2 ordered dither to RGB565.
// Colour buffer = a runtime image (raster::dyn_wrap), drawn as an IMAGE command by present(). docs/plugins/3d.md.
#include "zinc_native_render3d.h"
#include "zrt_raster.h"
#include "zn/zmesh.h"
#include "zn/zworld.h"
#if __has_include("zn/resource_stats.h")
#include "zn/resource_stats.h"
#endif
#include <stdlib.h>
#include <string.h>
#include <math.h>

// Options (plugin.json, zinc.json "plugins": { "3d": {...} }): zbits (0 = auto: 16 on ESP32, 32 elsewhere),
// scale (internal resolution divisor), dither (2x2 ordered dither to RGB565), subdiv (perspective step in pixels).
#if !defined(ZP_3D_ZBITS) || ZP_3D_ZBITS == 0
#undef ZP_3D_ZBITS
#ifdef ESP_PLATFORM
#define ZP_3D_ZBITS 16
#else
#define ZP_3D_ZBITS 32
#endif
#endif
#ifndef ZP_3D_SCALE
#define ZP_3D_SCALE 0
#endif
#ifndef ZP_3D_DITHER
#define ZP_3D_DITHER 0
#endif
#ifndef ZP_3D_SUBDIV
#define ZP_3D_SUBDIV 16
#endif

using namespace zrt;
namespace {

// `number` in the spec is the program's number kind: take it from a generated signature.
template<class C, class A, class B, class D, class E> A arg0(void (C::*)(A, B, D, E));
typedef decltype(arg0(&NativeRender3D::light)) N;
static inline float F(N x) { return (float)x; }

#if ZP_3D_ZBITS == 16
typedef uint16_t ZT;
static const int ZSHIFT = 14;
#else
typedef uint32_t ZT;
static const int ZSHIFT = 0;
#endif
static const float ZS = 1073741823.0f;  // depth [0, 1] -> Q30
static const float GUARD = 2;           // guard band: clip x, y at +-2w (pixels stay well inside 16.16)
enum { VCOL = 1, FLAT = 2, UNLIT = 4, DOUBLE = 8, NOFOG = 1 << 16 };
enum { OPAQUE = 0, ALPHA = 1, ADD = 2 };   // draw flags bits 6-7 (ZN-696); bits 8-15 the opacity of a blended draw

struct Mesh { int32_t nv, ni; float *pos, *nrm, *uv; uint32_t* col; uint16_t* idx; };
struct Target { int32_t img, w, h; uint32_t* px; ZT* z; };
struct Tex { const uint32_t* px; int32_t w, h, stride; };
struct V { float x, y, z, w, r, g, b, u, v; };      // clip space + shade (0..255) + uv
struct S { float x, y, z, iw, r, g, b, u, v; };     // screen space; u, v premultiplied by iw
struct Ctx { uint32_t* px; ZT* zb; int32_t w, h; Tex tex; uint32_t flat; uint32_t alpha; };

template<class T> struct Pool {
  T** p = nullptr; int32_t n = 0;
  int32_t add(T* v) {
    for (int32_t i = 0; i < n; i++) if (!p[i]) { p[i] = v; return i; }
    p = (T**)realloc(p, sizeof(T*) * (size_t)(n + 1)); p[n] = v; return n++;
  }
  T* at(int32_t i) const { return i >= 0 && i < n ? p[i] : nullptr; }
};

/** System memory first, then the Zinc heap (on ESP32 it holds the largest free block); panics when both are full.
 *  Freed with zrt::mfree, which knows both. */
static void* mem(size_t n) { void* p = hal_alloc(n ? n : 1); return p ? p : zrt::alloc(n); }

/** The arrays of the .zmesh part (ZN-441, include/zn/zmesh.h) at byte `at` of `d`, after its header: null when the part does not fit in `d` or an
 *  index passes its vertices (the file may come from anywhere). */
static const uint8_t* zpart(const Array<uint8_t>& d, int32_t at, uint32_t* nv, uint32_t* ni, uint32_t* flags) {
  const uint32_t n = (uint32_t)d.length();
  if (at < 0 || (at & 3) || (uint64_t)at + zn::zmesh::kPartHeader > n) return nullptr;
  const uint8_t* p = d.a->data + at;
  memcpy(nv, p, 4); memcpy(ni, p + 4, 4); memcpy(flags, p + 8, 4);
  if (*nv == 0 || *nv > zn::zmesh::kMaxVertices || *ni % 3 || *ni > (1u << 28) || (uint64_t)at + zn::zmesh::partBytes(*nv, *ni, *flags) > n) return nullptr;
  p += zn::zmesh::kPartHeader;
  const uint8_t* ix = p + zn::zmesh::vertexBytes(*nv, *flags);
  for (uint32_t i = 0; i < *ni; i++) { uint16_t v; memcpy(&v, ix + 2 * (size_t)i, 2); if (v >= *nv) return nullptr; }
  return p;
}

/** float -> 16.16 (or any fixed) with saturation: slivers and extrapolated run ends must not overflow. */
static inline int32_t fx(float v) { return v >= 2147483520.f ? 2147483520 : v <= -2147483520.f ? -2147483520 : (int32_t)v; }

static inline uint32_t pack(float r, float g, float b) {
  int32_t R = (int32_t)r, G = (int32_t)g, B = (int32_t)b;
  R = R > 255 ? 255 : R < 0 ? 0 : R; G = G > 255 ? 255 : G < 0 ? 0 : G; B = B > 255 ? 255 : B < 0 ? 0 : B;
  return (uint32_t)(R << 16 | G << 8 | B);
}
static inline uint32_t modulate(uint32_t t, uint32_t r, uint32_t g, uint32_t b) {
  return (((t >> 16 & 255) * (r + 1)) >> 8) << 16 | (((t >> 8 & 255) * (g + 1)) >> 8) << 8 | (((t & 255) * (b + 1)) >> 8);
}
static inline uint32_t out(uint32_t c, int32_t x, int32_t y) {
#if ZP_3D_DITHER
  static const uint8_t bayer[4] = {0, 2, 3, 1};
  uint32_t k = bayer[(x & 1) | (y & 1) << 1];
  uint32_t r = (c >> 16 & 255) + k * 2, g = (c >> 8 & 255) + k, b = (c & 255) + k * 2;
  r = (r > 255 ? 255 : r) & 0xF8; g = (g > 255 ? 255 : g) & 0xFC; b = (b > 255 ? 255 : b) & 0xF8;
  return (r | r >> 5) << 16 | (g | g >> 6) << 8 | (b | b >> 5);
#else
  (void)x; (void)y;
  return c;
#endif
}

/** A blended pixel (ZN-696): over the one under it with `alpha` (0..255), or added to it, `alpha` of the colour, clamped. */
template<int BLEND> static inline uint32_t blend(uint32_t dst, uint32_t src, uint32_t a) {
  uint32_t o = 0;
  for (int s = 0; s <= 16; s += 8) {
    const uint32_t d = dst >> s & 255, c = src >> s & 255;
    const uint32_t v = BLEND == ALPHA ? (c * a + d * (255 - a) + 127) / 255 : d + (c * a + 127) / 255;
    o |= (v > 255 ? 255 : v) << s;
  }
  return o;
}

// Scanline triangle: top-left fill rule at pixel centres, edges and attributes stepped in 16.16. A blended triangle (BLEND) is depth
// tested but leaves the depth buffer alone, so what is behind it still shows and the glows of a scene add up.
template<bool TEX, bool SMOOTH, int BLEND>
static void raster(const Ctx& c, const S* a, const S* b, const S* d) {
  if (b->y < a->y) { const S* t = a; a = b; b = t; }
  if (d->y < b->y) { const S* t = b; b = d; d = t; }
  if (b->y < a->y) { const S* t = a; a = b; b = t; }
  float e1x = b->x - a->x, e1y = b->y - a->y, e2x = d->x - a->x, e2y = d->y - a->y;
  float area = e1x * e2y - e2x * e1y;
  if (area == 0) return;
  float ia = 1 / area;
#define GX(f) (((b->f - a->f) * e2y - (d->f - a->f) * e1y) * ia)
#define GY(f) (((d->f - a->f) * e1x - (b->f - a->f) * e2x) * ia)
  float zx = GX(z), zy = GY(z);
  float rx = 0, ry = 0, gx = 0, gy = 0, bx = 0, by = 0, wx = 0, wy = 0, ux = 0, uy = 0, vx = 0, vy = 0;
  if (SMOOTH) { rx = GX(r); ry = GY(r); gx = GX(g); gy = GY(g); bx = GX(b); by = GY(b); }
  if (TEX) { wx = GX(iw); wy = GY(iw); ux = GX(u); uy = GY(u); vx = GX(v); vy = GY(v); }
#undef GX
#undef GY
  int32_t y0 = (int32_t)ceilf(a->y - 0.5f), ym = (int32_t)ceilf(b->y - 0.5f), y1 = (int32_t)ceilf(d->y - 0.5f);
  if (y0 < 0) y0 = 0;
  if (y1 > c.h) y1 = c.h;
  if (y0 >= y1) return;
  bool longLeft = area > 0;  // y down: the middle vertex is on the right
  struct Edge { int32_t x, dx; };
  auto edge = [](const S* p, const S* q, int32_t y) {
    float k = (q->x - p->x) / (q->y - p->y);
    return Edge{fx((p->x + (y + 0.5f - p->y) * k) * 65536), fx(k * 65536)};
  };
  Edge L = edge(a, d, y0), R = {0, 0};
  bool upper = y0 < ym;
  if (upper) R = edge(a, b, y0); else if (ym < y1) R = edge(b, d, y0);
  const uint32_t tw = (uint32_t)c.tex.w, th = (uint32_t)c.tex.h, ts = (uint32_t)c.tex.stride;
  const uint32_t fr = c.flat >> 16 & 255, fg = c.flat >> 8 & 255, fb = c.flat & 255;
  for (int32_t y = y0; y < y1; y++) {
    if (upper && y == ym) { upper = false; R = edge(b, d, y); }
    const Edge& l = longLeft ? L : R;
    const Edge& r = longLeft ? R : L;
    int32_t x0 = (l.x + 0x7FFF) >> 16, x1 = (r.x + 0x7FFF) >> 16;
    L.x += L.dx; R.x += R.dx;
    if (x0 < 0) x0 = 0;
    if (x1 > c.w) x1 = c.w;
    int32_t n = x1 - x0;
    if (n <= 0) continue;
    float ox = x0 + 0.5f - a->x, oy = y + 0.5f - a->y;
    int32_t z = fx((a->z + zx * ox + zy * oy) * ZS), dz = fx(zx * ZS);
    int32_t R_ = 0, G_ = 0, B_ = 0, dr = 0, dg = 0, db = 0;
    if (SMOOTH) {
      R_ = fx((a->r + rx * ox + ry * oy) * 65536); dr = fx(rx * 65536);
      G_ = fx((a->g + gx * ox + gy * oy) * 65536); dg = fx(gx * 65536);
      B_ = fx((a->b + bx * ox + by * oy) * 65536); db = fx(bx * 65536);
    }
    uint32_t* px = c.px + (size_t)y * c.w + x0;
    ZT* zb = c.zb + (size_t)y * c.w + x0;
    float iw = 0, uw = 0, vw = 0;
    int32_t u = 0, v = 0;
    if (TEX) {
      iw = a->iw + wx * ox + wy * oy; uw = a->u + ux * ox + uy * oy; vw = a->v + vx * ox + vy * oy;
      float q = 1 / iw;
      u = fx(uw * q * 65536); v = fx(vw * q * 65536);
    }
    for (int32_t i = 0; i < n;) {
      int32_t len = TEX ? (n - i < ZP_3D_SUBDIV ? n - i : ZP_3D_SUBDIV) : n;
      int32_t du = 0, dv = 0, u2 = 0, v2 = 0;
      if (TEX) {  // exact uv at the end of the run, affine inside it
        iw += wx * len; uw += ux * len; vw += vx * len;
        float q = iw > 1e-9f ? 1 / iw : 0;
        u2 = fx(uw * q * 65536); v2 = fx(vw * q * 65536);
        du = (u2 - u) / len; dv = (v2 - v) / len;
      }
      for (int32_t e = i + len; i < e; i++) {
        uint32_t zz = (uint32_t)z >> ZSHIFT;
        if (zz < zb[i]) {
          if (BLEND == OPAQUE) zb[i] = (ZT)zz;
          uint32_t col;
          if (TEX) {
            uint32_t t = c.tex.px[(((uint32_t)v & 0xFFFF) * th >> 16) * ts + (((uint32_t)u & 0xFFFF) * tw >> 16)];
            col = SMOOTH ? modulate(t, (uint32_t)R_ >> 16, (uint32_t)G_ >> 16, (uint32_t)B_ >> 16) : modulate(t, fr, fg, fb);
          } else if (SMOOTH) col = ((uint32_t)R_ >> 16) << 16 | ((uint32_t)G_ >> 16) << 8 | (uint32_t)B_ >> 16;
          else col = c.flat;
          px[i] = out(BLEND == OPAQUE ? col : blend<BLEND>(px[i], col, c.alpha), x0 + i, y);
        }
        z += dz;
        if (SMOOTH) { R_ += dr; G_ += dg; B_ += db; }
        if (TEX) { u += du; v += dv; }
      }
      if (TEX) { u = u2; v = v2; }
    }
  }
}

static inline float dist(const V& p, int pl) {
  switch (pl) {
    case 0: return p.z + p.w;          // near
    case 1: return p.w - p.z;          // far
    case 2: return p.x + GUARD * p.w;
    case 3: return GUARD * p.w - p.x;
    case 4: return p.y + GUARD * p.w;
    default: return GUARD * p.w - p.y;
  }
}
static inline uint32_t outcode(const V& p) {
  uint32_t o = 0;
  for (int pl = 0; pl < 6; pl++) if (dist(p, pl) < 0) o |= 1u << pl;
  return o;
}
/** Sutherland-Hodgman against the planes in `mask`; p holds up to 12 vertices. */
static int clip(V* p, int n, uint32_t mask) {
  V tmp[12];
  for (int pl = 0; pl < 6; pl++) {
    if (!(mask >> pl & 1)) continue;
    int m = 0;
    for (int i = 0; i < n; i++) {
      const V& A = p[i]; const V& B = p[i + 1 == n ? 0 : i + 1];
      float da = dist(A, pl), db = dist(B, pl);
      if (da >= 0) tmp[m++] = A;
      if ((da >= 0) != (db >= 0)) {
        float t = da / (da - db);
        const float* fa = &A.x; const float* fb = &B.x; float* o = &tmp[m++].x;
        for (int k = 0; k < 9; k++) o[k] = fa[k] + (fb[k] - fa[k]) * t;
      }
    }
    n = m;
    if (n < 3) return 0;
    memcpy(p, tmp, sizeof(V) * (size_t)n);
  }
  return n;
}

static void mul(float* o, const float* a, const float* b) {  // column-major o = a * b
  for (int c = 0; c < 4; c++)
    for (int r = 0; r < 4; r++)
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
}

/** vp = projection x view, column-major. */
static void viewProjection(float* vp, float asp, Array<N> view, N proj, N nearN, N farN, bool ortho) {
  float n = F(nearN), f = F(farN), P[16] = {0}, Vw[16];
  if (ortho) {
    float hh = F(proj);
    P[0] = 2 / (hh * asp); P[5] = 2 / hh; P[10] = -2 / (f - n); P[14] = -(f + n) / (f - n); P[15] = 1;
  } else {
    float k = 1 / tanf(F(proj) * 0.5f);
    P[0] = k / asp; P[5] = k; P[10] = (f + n) / (n - f); P[11] = -1; P[14] = 2 * f * n / (n - f);
  }
  for (int i = 0; i < 16; i++) Vw[i] = i < view.length() ? F(view.a->data[i]) : (i % 5 == 0 ? 1.0f : 0.0f);
  mul(vp, P, Vw);
}

/** The colour buffer, drawn in the box as an IMAGE command. */
static void presentImage(int32_t img, N x, N y, N w, N h) {
  if (raster::Cmd* c = gfx::emit(raster::IMAGE, nullptr, 0)) {  // grad 1: nearest filter (cheap, keeps the dither)
    c->x = F(x); c->y = F(y); c->w = F(w); c->h = F(h);
    c->res = img; c->grad = 1; c->c2 = raster::image_version(img);
  }
}

static uint32_t** baked;  // 0x00RRGGBB copies of baked images used as textures (made on first use)
static bool texture(int32_t id, Tex& t) {
  if (id >= 0 && id < raster::image_count) {
    const raster::Image& im = raster::images[id];
    if (!baked) { baked = (uint32_t**)mem(sizeof(uint32_t*) * (size_t)raster::image_count); memset(baked, 0, sizeof(uint32_t*) * (size_t)raster::image_count); }
    if (!baked[id]) {
      uint32_t* px = (uint32_t*)mem((size_t)im.w * im.h * 4);
      for (int32_t i = 0; i < im.w * im.h; i++) { const uint8_t* s = im.rgba + i * 4; px[i] = (uint32_t)s[0] << 16 | (uint32_t)s[1] << 8 | s[2]; }
      baked[id] = px;
    }
    t = Tex{baked[id], im.w, im.h, im.w};
    return true;
  }
  return raster::dyn_view(id, &t.px, &t.w, &t.h, &t.stride) && t.w > 0 && t.h > 0;
}

// The bytes of an asset for a native module (src/host/sys_host.cpp, targets/console/host_console.cpp): a malloc'd copy, null when it is not
// there or this host gives none (weak: a host without it leaves loadModel on zinc:assets).
extern "C" unsigned char* zn_asset_bytes(const char* name, uint32_t n, uint32_t* size) __attribute__((weak));
// zinc:gfx image(name) of a pack's image entry (the same hosts): a world's pictures by name.
extern "C" int zn_asset_image(const char* name, uint32_t n) __attribute__((weak));

// ---------------------------------------------------------------- worlds (zinc:3d World, include/zn/zworld.h)
// A static world: cells on the ground with up to three levels of detail, each level in a chunk loaded and freed as one; a chunk's batches
// are meshes whose indices are grouped by cell and by the compass sector a face looks to. worldSelect culls the cells against the frustum,
// chooses each one's level by distance (the distances scaled to keep a triangle budget), keeps of each cell's walls only the sectors that
// can face the eye, and lists the index ranges to draw and the chunks to load and to free; worldDraw draws the ranges. The selection is a
// port of Pocket Tokyo's tokyo-sim view.rs (select, facing, arcs, Governor; MIT, (c) pocket-nexus).
enum { WORLD_ASK = 64, WORLD_FREE = 16, WORLD_POINTS = 8 };
struct WBatch { int32_t mesh; uint32_t kind, flags, color, emis, nemis; int32_t tex, ntex, cell; uint32_t cells, groups; const uint32_t* spans; };
struct WChunk { int32_t level; char* name; bool loaded; float idle, need; WBatch* b; int32_t nb; uint32_t* spans; };
struct WCell { float mn[3], mx[3], reach[2], diag; int32_t chunk[3]; int8_t shown; bool vis; float d; int16_t arc0, arcN; };
// sector: the compass sector its faces look to, 16 up or down, 17 several (one colour lights a draw, render3d.psp.cpp); near: in the near
// pass (Engine::worldSplit); out: metres from the eye to the farthest point of its cells' boxes
enum { WORLD_MIXED = 17 };
struct WItem { int32_t chunk, batch; uint32_t kind, from, to; uint8_t sector, near; float out; };
struct World {
  WCell* c; int32_t nc;
  WChunk* k; int32_t nk;
  char dir[256];
  WItem* items; int32_t ni, icap;
  bool night;
  float scale;
  float dusk;   // how far the night has come, 0..1 (worldNight)
};
/** Metres from p to the nearest point of a box. */
static float boxDist(const float* mn, const float* mx, const float* p) {
  float s = 0;
  for (int a = 0; a < 3; a++) { const float d = p[a] < mn[a] ? mn[a] - p[a] : p[a] > mx[a] ? p[a] - mx[a] : 0; s += d * d; }
  return sqrtf(s);
}
/** Whether a box is inside (or across) the six planes (a x + b y + c z + d >= 0 inside). */
static bool inFrustum(const float (*pl)[4], const float* mn, const float* mx) {
  for (int i = 0; i < 6; i++) {
    const float* p = pl[i];
    const float x = p[0] >= 0 ? mx[0] : mn[0], y = p[1] >= 0 ? mx[1] : mn[1], z = p[2] >= 0 ? mx[2] : mn[2];
    if (p[0] * x + p[1] * y + p[2] * z + p[3] < 0) return false;
  }
  return true;
}
static float wrapAngle(float a) { const float T = 6.2831853f; a = fmodf(a + 3.14159265f, T); if (a < 0) a += T; return a - 3.14159265f; }
/** atan2 within 1.1e-5 radians (Abramowitz and Stegun 4.4.49): a few multiplications where a console's atan2f costs hundreds of cycles. */
static float atan2Fast(float y, float x) {
  const float ax = fabsf(x), ay = fabsf(y);
  if (ax == 0 && ay == 0) return 0;
  const float a = ax > ay ? ay / ax : ax / ay, s = a * a;
  float r = a * (0.9998660f + s * (-0.3302995f + s * (0.1801410f + s * (-0.0851330f + s * 0.0208351f))));
  if (ay > ax) r = 1.57079633f - r;
  if (x < 0) r = 3.14159265f - r;
  return y < 0 ? -r : r;
}
/** The sectors of the compass whose walls can face `eye` from somewhere in a box: the first and how many; count 16 (or more): all. */
static void facingExact(const float* eye, const float* mn, const float* mx, int16_t* first, int16_t* count);
static void facing(const float* eye, const float* mn, const float* mx, int16_t* first, int16_t* count) {
  const float PAD = 4, PI = 3.14159265f, T = 6.2831853f, step = T / zn::zworld::kSectors;
  *first = 0; *count = zn::zworld::kSectors;
  if (eye[0] > mn[0] - PAD && eye[0] < mx[0] + PAD && eye[2] > mn[2] - PAD && eye[2] < mx[2] + PAD) return;
  // facingExact's sectors from the fast angles; where an edge of the arc falls within a thousandth of a sector of a boundary (far more than
  // the angles' error), facingExact itself decides, so the result is always facingExact's (5.1 ms of selection on the 3DS was 3 of this)
  const float cx = (mn[0] + mx[0]) * 0.5f, cz = (mn[2] + mx[2]) * 0.5f, mid = atan2Fast(eye[2] - cz, eye[0] - cx);
  float lo = 0, hi = 0;
  const float xs[2] = {mn[0], mx[0]}, zs[2] = {mn[2], mx[2]};
  for (int i = 0; i < 2; i++) for (int j = 0; j < 2; j++) {
    float d = atan2Fast(eye[2] - zs[j], eye[0] - xs[i]) - mid;
    d = d > PI ? d - T : d < -PI ? d + T : d;
    if (d > 3.0f || d < -3.0f) { facingExact(eye, mn, mx, first, count); return; }
    lo = d < lo ? d : lo; hi = d > hi ? d : hi;
  }
  const float F = (mid + lo - PI * 0.5f + PI) / step, L = (mid + hi + PI * 0.5f + PI) / step, ff = floorf(F), fl = floorf(L);
  if (F - ff < 1e-3f || F - ff > 1 - 1e-3f || L - fl < 1e-3f || L - fl > 1 - 1e-3f) { facingExact(eye, mn, mx, first, count); return; }
  const int f = (int)ff, n = (int)fl - f + 1;
  if (n >= (int)zn::zworld::kSectors) return;
  *first = (int16_t)(((f % 16) + 16) % 16); *count = (int16_t)n;
}
static void facingExact(const float* eye, const float* mn, const float* mx, int16_t* first, int16_t* count) {
  const float PAD = 4, PI = 3.14159265f, step = 6.2831853f / zn::zworld::kSectors;
  *first = 0; *count = zn::zworld::kSectors;
  if (eye[0] > mn[0] - PAD && eye[0] < mx[0] + PAD && eye[2] > mn[2] - PAD && eye[2] < mx[2] + PAD) return;
  const float cx = (mn[0] + mx[0]) * 0.5f, cz = (mn[2] + mx[2]) * 0.5f, mid = atan2f(eye[2] - cz, eye[0] - cx);
  float lo = 0, hi = 0;
  const float xs[2] = {mn[0], mx[0]}, zs[2] = {mn[2], mx[2]};
  for (int i = 0; i < 2; i++) for (int j = 0; j < 2; j++) {
    const float d = wrapAngle(atan2f(eye[2] - zs[j], eye[0] - xs[i]) - mid);
    lo = d < lo ? d : lo; hi = d > hi ? d : hi;
  }
  const int f = (int)floorf((mid + lo - PI * 0.5f + PI) / step), l = (int)floorf((mid + hi + PI * 0.5f + PI) / step);
  const int n = l - f + 1;
  if (n >= (int)zn::zworld::kSectors) return;
  *first = (int16_t)(((f % 16) + 16) % 16); *count = (int16_t)n;
}
/** Grows a mem() array of `n` items of `size` bytes to hold `need`. */
static void* grown(void* p, int32_t n, int32_t* cap, int32_t need, size_t size) {
  if (need <= *cap) return p;
  int32_t c = *cap < 16 ? 16 : *cap * 2;
  if (c < need) c = need;
  void* q = mem(size * (size_t)c);
  if (n) memcpy(q, p, size * (size_t)n);
  mfree(p);
  *cap = c;
  return q;
}
static uint32_t rd32(const uint8_t* p) { uint32_t v; memcpy(&v, p, 4); return v; }
static float rdf(const uint8_t* p) { float v; memcpy(&v, p, 4); return v; }


struct Engine : NativeRender3D {
  Array<uint8_t> asset;   // the model assetOpen read
  Pool<Mesh> meshes;
  Pool<Target> targets;
  Target* cur = nullptr;
  float vp[16];
  float amb[3] = {0, 0, 0};
  int nl = 0;
  float ld[4][3], lc[4][3];
  // specular reflection (ZN-563.04): reflectance at normal incidence, exponent, three.js's Blinn-Phong factor (G 1/4, D (s / 2 + 1) / pi with
  // the lights already divided by pi), and the eye in world space (from the view matrix)
  float spec[3] = {0, 0, 0}, shin = 30, specK = 0, eye[3] = {0, 0, 0};
  float emit[3] = {0, 0, 0};   // the emissive colour of the next draws (ZN-696), 0..255, added to the light they receive
  // fog: on for the rest of the frame, its colour 0..255, the view depths where it starts and where it is whole; the camera's planes
  bool fogOn = false;
  float fogC[3] = {0, 0, 0}, fogN = 0, fogF = 1, camN = 0.1f, camF = 100;
  bool camOrtho = false;
  int32_t tris = 0;
  V* vs = nullptr; uint8_t* oc = nullptr; int32_t cap = 0;

#if __has_include("zn/resource_stats.h")
  static ZnResourceStats meshStats(void* owner) {
    auto& e = *(Engine*)owner; ZnResourceStats s{};
    s.cpuBytes = (uint64_t)e.cap * (sizeof(V) + 1);
    for (int i = 0; i < e.meshes.n; ++i) if (const Mesh* m = e.meshes.p[i]) {
      ++s.objects;
      s.cpuBytes += (uint64_t)m->nv * (24 + (m->uv ? 8 : 0) + (m->col ? 4 : 0)) + (uint64_t)m->ni * 2;
    }
    return s;
  }
  static ZnResourceStats targetStats(void* owner) {
    auto& e = *(Engine*)owner; ZnResourceStats s{};
    for (int i = 0; i < e.targets.n; ++i) if (const Target* t = e.targets.p[i]) {
      ++s.objects; s.cpuBytes += (uint64_t)t->w * t->h * (4 + sizeof(ZT));
    }
    return s;
  }
#endif

  int32_t meshCreate(Array<N> pos, Array<N> nrm, Array<N> uv, Array<uint32_t> col, Array<int32_t> idx) override {
    int32_t nv = pos.length() / 3, ni = idx.length() / 3 * 3;
    if (nv <= 0 || nv > 65535) return -1;
    Mesh* m = (Mesh*)mem(sizeof(Mesh));
    *m = Mesh{nv, ni, nullptr, nullptr, nullptr, nullptr, nullptr};
    m->pos = (float*)mem(sizeof(float) * 3 * (size_t)nv);
    m->nrm = (float*)mem(sizeof(float) * 3 * (size_t)nv);
    memset(m->nrm, 0, sizeof(float) * 3 * (size_t)nv);
    m->idx = (uint16_t*)mem(sizeof(uint16_t) * (size_t)ni);
    for (int32_t i = 0; i < nv * 3; i++) m->pos[i] = F(pos.a->data[i]);
    for (int32_t i = 0; i < ni; i++) { int32_t k = idx.a->data[i]; m->idx[i] = (uint16_t)(k >= 0 && k < nv ? k : 0); }
    if (uv.length() >= nv * 2) { m->uv = (float*)mem(sizeof(float) * 2 * (size_t)nv); for (int32_t i = 0; i < nv * 2; i++) m->uv[i] = F(uv.a->data[i]); }
    if (col.length() >= nv) { m->col = (uint32_t*)mem(sizeof(uint32_t) * (size_t)nv); memcpy(m->col, col.a->data, sizeof(uint32_t) * (size_t)nv); }
    if (nrm.length() >= nv * 3) for (int32_t i = 0; i < nv * 3; i++) m->nrm[i] = F(nrm.a->data[i]);
    else for (int32_t t = 0; t < ni; t += 3) {  // smooth normals: area-weighted face normals
      const float *p0 = m->pos + m->idx[t] * 3, *p1 = m->pos + m->idx[t + 1] * 3, *p2 = m->pos + m->idx[t + 2] * 3;
      float ax = p1[0] - p0[0], ay = p1[1] - p0[1], az = p1[2] - p0[2], bx = p2[0] - p0[0], by = p2[1] - p0[1], bz = p2[2] - p0[2];
      float nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
      for (int k = 0; k < 3; k++) { float* o = m->nrm + m->idx[t + k] * 3; o[0] += nx; o[1] += ny; o[2] += nz; }
    }
    for (int32_t i = 0; i < nv; i++) {
      float* o = m->nrm + i * 3; float l = sqrtf(o[0] * o[0] + o[1] * o[1] + o[2] * o[2]);
      if (l > 0) { o[0] /= l; o[1] /= l; o[2] /= l; }
    }
    room(nv);
    return meshes.add(m);
  }
  /** A part of a .zmesh model (ZN-441): its arrays are the Mesh's own layout, copied as they are. */
  int32_t meshLoad(Array<uint8_t> data, int32_t at) override {
    uint32_t nv, ni, flags;
    const uint8_t* p = zpart(data, at, &nv, &ni, &flags);
    if (!p) return -1;
    auto take = [&](size_t bytes) { void* q = mem(bytes); memcpy(q, p, bytes); p += bytes; return q; };
    Mesh* m = (Mesh*)mem(sizeof(Mesh));
    *m = Mesh{(int32_t)nv, (int32_t)ni, nullptr, nullptr, nullptr, nullptr, nullptr};
    m->pos = (float*)take(12 * (size_t)nv);
    m->nrm = (float*)take(12 * (size_t)nv);
    if (flags & zn::zmesh::Uvs) m->uv = (float*)take(8 * (size_t)nv);
    if (flags & zn::zmesh::Colors) m->col = (uint32_t*)take(4 * (size_t)nv);
    m->idx = (uint16_t*)take(2 * (size_t)ni);
    room((int32_t)nv);
    return meshes.add(m);
  }
  int32_t assetOpen(String name) override {
    asset = Array<uint8_t>();
    uint32_t n = 0;
    unsigned char* p = zn_asset_bytes ? zn_asset_bytes(name.ptr(), name.bytes(), &n) : nullptr;
    if (!p) return -1;
    asset = Array<uint8_t>::with_cap((int32_t)n);
    memcpy(asset.a->data, p, n);
    asset.a->len = (int32_t)n;
    free(p);
    return (int32_t)n;
  }
  int32_t assetByte(int32_t at) override { return asset.a && at >= 0 && at < asset.a->len ? asset.a->data[at] : 0; }
  int32_t assetMesh(int32_t at) override { return asset.a ? meshLoad(asset, at) : -1; }
  void assetClose() override { asset = Array<uint8_t>(); }
  /** The per-vertex scratch of draw() for meshes of `nv` vertices. */
  void room(int32_t nv) {
    if (nv <= cap) return;
    cap = nv;
    mfree(vs); mfree(oc);
    vs = (V*)mem(sizeof(V) * (size_t)cap);
    oc = (uint8_t*)mem((size_t)cap);
  }
  void meshDestroy(int32_t id) override {
    Mesh* m = meshes.at(id);
    if (!m) return;
    mfree(m->pos); mfree(m->nrm); mfree(m->uv); mfree(m->col); mfree(m->idx); mfree(m);
    meshes.p[id] = nullptr;
  }
  bool meshDeform(int32_t id, Array<N> pos, Array<N> nrm) override {
    Mesh* m = meshes.at(id);
    if (!m || pos.length() != m->nv * 3 || nrm.length() != m->nv * 3) return false;
    for (int32_t i = 0; i < m->nv * 3; ++i) {
      if (!isfinite(F(pos.a->data[i])) || !isfinite(F(nrm.a->data[i]))) return false;
    }
    for (int32_t i = 0; i < m->nv * 3; ++i) { m->pos[i] = F(pos.a->data[i]); m->nrm[i] = F(nrm.a->data[i]); }
    return true;
  }

  // scale 0 (auto): the smallest divisor that keeps the internal picture under AUTO_PIXELS, so a 1080p screen is drawn at 640x360 and scaled up.
  // Measured on a Pi 3B+: 85 ms a frame at 1920x1080, 24 ms at 640x360 (docs/plugins/3d.md). A deterministic run (goldens) keeps scale 1.
  static int32_t divisor(int32_t w, int32_t h) {
    if (ZP_3D_SCALE > 0) return ZP_3D_SCALE;
    static const bool det = getenv("ZINC_DETERMINISTIC") != nullptr;
    const int64_t AUTO_PIXELS = 400000;
    int32_t d = 1;
    while (!det && d < 8 && (int64_t)(w / d) * (h / d) > AUTO_PIXELS) d++;
    return d;
  }
  int32_t target(int32_t id, int32_t w, int32_t h) override {
    const int32_t d = divisor(w, h);
    w = w / d; h = h / d;
    if (w < 1) w = 1;
    if (h < 1) h = 1;
    Target* t = targets.at(id);
    if (t && t->w == w && t->h == h) return id;
    if (t) release(t);
    else { t = (Target*)mem(sizeof(Target)); id = targets.add(t); }
    t->w = w; t->h = h;
    t->px = (uint32_t*)mem((size_t)w * h * 4);
    t->z = (ZT*)mem(sizeof(ZT) * (size_t)w * h);
    t->img = raster::dyn_wrap(w, h, t->px, w);
    return id;
  }
  void release(Target* t) { if (cur == t) cur = nullptr; raster::dyn_destroy(t->img); mfree(t->px); mfree(t->z); }
  void targetDestroy(int32_t id) override {
    Target* t = targets.at(id);
    if (!t) return;
    release(t); mfree(t);
    targets.p[id] = nullptr;
  }

  void begin(int32_t id, uint32_t clear, Array<N> view, N proj, N nearN, N farN, bool ortho) override {
    cur = targets.at(id);
    if (!cur) return;
    uint32_t* px = cur->px;
    tris = 0; nl = 0; amb[0] = amb[1] = amb[2] = 0;
    for (int32_t i = 0, n = cur->w * cur->h; i < n; i++) px[i] = clear & 0xFFFFFF;
    memset(cur->z, 0xFF, sizeof(ZT) * (size_t)cur->w * cur->h);
    viewProjection(vp, (float)cur->w / cur->h, view, proj, nearN, farN, ortho);
    eyeOf(view);
    spec[0] = spec[1] = spec[2] = 0;
    emit[0] = emit[1] = emit[2] = 0;
    camera(nearN, farN, ortho);
  }
  /** The camera's planes, which fog needs, and no fog yet: every begin() calls it. */
  void camera(N nearN, N farN, bool ortho) { camN = F(nearN); camF = F(farN); camOrtho = ortho; fogOn = false; }
  void fog(uint32_t c, N nearN, N farN) override {
    fogC[0] = (float)(c >> 16 & 255); fogC[1] = (float)(c >> 8 & 255); fogC[2] = (float)(c & 255);
    fogN = F(nearN); fogF = F(farN); if (!(fogF > fogN)) fogF = fogN + 1e-3f;
    fogOn = true;
  }
  /** The fog's share (0..1) at view depth `d`. */
  float fogAt(float d) const { const float k = (d - fogN) / (fogF - fogN); return k < 0 ? 0 : k > 1 ? 1 : k; }
  /** Software fog: once the frame is drawn, each pixel something covers moves toward the fog colour by the view depth its depth buffer
   *  holds. ponytail: a blended pixel takes the depth of what is behind it; per pixel in a span would need one more interpolant. */
  void fogPass() {
    if (!fogOn || !cur) return;
    const ZT clear = (ZT)~(ZT)0;
    const float n = camN, f = camF, k = (float)(1u << ZSHIFT) / ZS;
    for (int32_t i = 0, total = cur->w * cur->h; i < total; i++) {
      const ZT z = cur->z[i];
      if (z == clear) continue;
      const float ndc = 2 * (z * k) - 1;
      const float a = fogAt(camOrtho ? (ndc * (f - n) + f + n) * 0.5f : 2 * f * n / ((f + n) - ndc * (f - n)));
      if (a <= 0) continue;
      const uint32_t p = cur->px[i];
      const float r = (float)(p >> 16 & 255), g = (float)(p >> 8 & 255), b = (float)(p & 255);
      cur->px[i] = pack(r + (fogC[0] - r) * a, g + (fogC[1] - g) * a, b + (fogC[2] - b) * a);
    }
  }
  void emissive(uint32_t c) override { emit[0] = (float)(c >> 16 & 255); emit[1] = (float)(c >> 8 & 255); emit[2] = (float)(c & 255); }
  bool emitOn() const { return emit[0] > 0 || emit[1] > 0 || emit[2] > 0; }
  /** A shade with the emissive colour added, clamped (before the texture modulates it, as on the GPU). */
  void glow(float* o) const { for (int c = 0; c < 3; c++) { o[c] += emit[c]; if (o[c] > 255) o[c] = 255; } }
  /** The camera's position: the view matrix is [R t], the eye -R^T t. */
  void eyeOf(Array<N> view) {
    float V[16];
    for (int i = 0; i < 16; i++) V[i] = i < view.length() ? F(view.a->data[i]) : (i % 5 == 0 ? 1.0f : 0.0f);
    for (int i = 0; i < 3; i++) eye[i] = -(V[i * 4] * V[12] + V[i * 4 + 1] * V[13] + V[i * 4 + 2] * V[14]);
  }
  void specular(uint32_t c, N s) override {
    spec[0] = (c >> 16 & 255) / 255.0f; spec[1] = (c >> 8 & 255) / 255.0f; spec[2] = (c & 255) / 255.0f;
    shin = F(s); if (!(shin >= 1)) shin = 1; if (shin > 2048) shin = 2048;
    specK = 0.25f * (shin * 0.5f + 1);
  }
  void ambient(uint32_t c) override { amb[0] = (c >> 16 & 255) / 255.0f; amb[1] = (c >> 8 & 255) / 255.0f; amb[2] = (c & 255) / 255.0f; }
  void light(N dx, N dy, N dz, uint32_t c) override {
    if (nl >= 4) return;
    float x = F(dx), y = F(dy), z = F(dz), l = sqrtf(x * x + y * y + z * z);
    if (l <= 0) return;
    ld[nl][0] = x / l; ld[nl][1] = y / l; ld[nl][2] = z / l;
    lc[nl][0] = (c >> 16 & 255) / 255.0f; lc[nl][1] = (c >> 8 & 255) / 255.0f; lc[nl][2] = (c & 255) / 255.0f;
    nl++;
  }
  /** Light reaching a surface with object-space normal (nx, ny, nz) under model matrix M, times base colour; with a specular reflection
   *  and the surface's world position `wp`, plus the highlights (clamped to 255). */
  void shade(const float* M, float nx, float ny, float nz, uint32_t base, float* o, const float* wp = nullptr) const {
    float x = M[0] * nx + M[4] * ny + M[8] * nz, y = M[1] * nx + M[5] * ny + M[9] * nz, z = M[2] * nx + M[6] * ny + M[10] * nz;
    float l = sqrtf(x * x + y * y + z * z);
    if (l > 0) { x /= l; y /= l; z /= l; }
    float r = amb[0], g = amb[1], b = amb[2];
    for (int i = 0; i < nl; i++) {
      float k = -(x * ld[i][0] + y * ld[i][1] + z * ld[i][2]);
      if (k > 0) { r += k * lc[i][0]; g += k * lc[i][1]; b += k * lc[i][2]; }
    }
    o[0] = (base >> 16 & 255) * (r > 1 ? 1 : r); o[1] = (base >> 8 & 255) * (g > 1 ? 1 : g); o[2] = (base & 255) * (b > 1 ? 1 : b);
    if (!wp) return;
    float vx = eye[0] - wp[0], vy = eye[1] - wp[1], vz = eye[2] - wp[2], vl = sqrtf(vx * vx + vy * vy + vz * vz);
    if (vl > 0) { vx /= vl; vy /= vl; vz /= vl; }
    float sr = 0, sg = 0, sb = 0;
    for (int i = 0; i < nl; i++) {
      const float lx = -ld[i][0], ly = -ld[i][1], lz = -ld[i][2], k = x * lx + y * ly + z * lz;
      if (k <= 0) continue;
      float hx = lx + vx, hy = ly + vy, hz = lz + vz, hl = sqrtf(hx * hx + hy * hy + hz * hz);
      if (hl <= 0) continue;
      const float nh = (x * hx + y * hy + z * hz) / hl;
      if (nh <= 0) continue;
      const float s = k * specK * powf(nh, shin);
      sr += s * lc[i][0]; sg += s * lc[i][1]; sb += s * lc[i][2];
    }
    o[0] += 255 * spec[0] * sr; o[1] += 255 * spec[1] * sg; o[2] += 255 * spec[2] * sb;
    for (int c = 0; c < 3; c++) if (o[c] > 255) o[c] = 255;
  }
  bool specOn() const { return spec[0] > 0 || spec[1] > 0 || spec[2] > 0; }
  bool gpu() override { return false; }
  void transform(Array<N> world, Array<N> parent, Array<N> p, Array<N> q, Array<N> s) override {
    if (world.length() < 16 || parent.length() < 16 || p.length() < 3 || q.length() < 4 || s.length() < 3) return;
    // in double, as mat4Compose and mat4Multiply of index.ts do: the frames are the same as before (examples_pixels 3d/cubes). The PSP's FPU
    // has no double: emulated, this was 54 of the 74 us of a call in PPSSPP, so it composes in float there
#ifdef __psp__
    typedef float X;
#else
    typedef double X;
#endif
    const X x = X(q.a->data[0]), y = X(q.a->data[1]), z = X(q.a->data[2]), w = X(q.a->data[3]);
    const X sx = X(s.a->data[0]), sy = X(s.a->data[1]), sz = X(s.a->data[2]);
    const X L[16] = {(1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
                     2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
                     2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
                     X(p.a->data[0]), X(p.a->data[1]), X(p.a->data[2]), 1};
    X P[16];
    for (int i = 0; i < 16; i++) P[i] = X(parent.a->data[i]);
    for (int c = 0; c < 4; c++)
      for (int r = 0; r < 4; r++)
        world.a->data[c * 4 + r] = N(P[r] * L[c * 4] + P[4 + r] * L[c * 4 + 1] + P[8 + r] * L[c * 4 + 2] + P[12 + r] * L[c * 4 + 3]);
  }

  void draw(int32_t id, Array<N> model, uint32_t color, int32_t tex, int32_t flags) override {
    Mesh* m = meshes.at(id);
    if (!m || !cur) return;
    float M[16], MVP[16];
    for (int i = 0; i < 16; i++) M[i] = i < model.length() ? F(model.a->data[i]) : (i % 5 == 0 ? 1.0f : 0.0f);
    mul(MVP, vp, M);
    const int bl = (flags >> 6) & 3;
    Ctx c{cur->px, cur->z, cur->w, cur->h, Tex{nullptr, 0, 0, 0}, color & 0xFFFFFF, bl ? (uint32_t)((flags >> 8) & 255) : 255};
    if (bl && !c.alpha) return;   // a blended draw with no opacity leaves the frame as it is
    bool textured = tex >= 0 && m->uv && texture(tex, c.tex);
    bool lit = !(flags & UNLIT), flat = flags & FLAT, vcol = (flags & VCOL) && m->col;
    const bool em = emitOn();
    bool smooth = !flat && (lit || vcol || em);
    const bool sp = lit && specOn();
    // a range of the indices (worldDraw): only the vertices it uses
    const int32_t t0 = rFirst, t1 = rFirst + rangeCount(m);
    int32_t v0 = 0, v1 = m->nv;
    if (rCount >= 0) { v0 = m->nv; v1 = 0; for (int32_t t = t0; t < t1; t++) { const int32_t k = m->idx[t]; v0 = k < v0 ? k : v0; v1 = k >= v1 ? k + 1 : v1; } }
    for (int32_t i = v0; i < v1; i++) {
      const float* p = m->pos + i * 3;
      V& o = vs[i];
      o.x = MVP[0] * p[0] + MVP[4] * p[1] + MVP[8] * p[2] + MVP[12];
      o.y = MVP[1] * p[0] + MVP[5] * p[1] + MVP[9] * p[2] + MVP[13];
      o.z = MVP[2] * p[0] + MVP[6] * p[1] + MVP[10] * p[2] + MVP[14];
      o.w = MVP[3] * p[0] + MVP[7] * p[1] + MVP[11] * p[2] + MVP[15];
      oc[i] = (uint8_t)outcode(o);
      if (textured) { o.u = m->uv[i * 2]; o.v = m->uv[i * 2 + 1]; } else o.u = o.v = 0;
      if (smooth) {
        uint32_t base = vcol ? m->col[i] : color;
        if (lit && sp) {
          const float wp[3] = {M[0] * p[0] + M[4] * p[1] + M[8] * p[2] + M[12], M[1] * p[0] + M[5] * p[1] + M[9] * p[2] + M[13], M[2] * p[0] + M[6] * p[1] + M[10] * p[2] + M[14]};
          shade(M, m->nrm[i * 3], m->nrm[i * 3 + 1], m->nrm[i * 3 + 2], base, &o.r, wp);
        } else if (lit) shade(M, m->nrm[i * 3], m->nrm[i * 3 + 1], m->nrm[i * 3 + 2], base, &o.r);
        else { o.r = (float)(base >> 16 & 255); o.g = (float)(base >> 8 & 255); o.b = (float)(base & 255); }
        if (em) glow(&o.r);
      } else o.r = o.g = o.b = 0;
    }
    const float W = (float)cur->w, H = (float)cur->h;
    for (int32_t t = t0; t < t1; t += 3) {
      int32_t i0 = m->idx[t], i1 = m->idx[t + 1], i2 = m->idx[t + 2];
      uint32_t o0 = oc[i0], o1 = oc[i1], o2 = oc[i2];
      if (o0 & o1 & o2) continue;
      if (flat) {
        uint32_t base = color;
        if (vcol) {
          const uint32_t *a = &m->col[i0], *b = &m->col[i1], *d = &m->col[i2];
          base = (((*a >> 16 & 255) + (*b >> 16 & 255) + (*d >> 16 & 255)) / 3) << 16 | (((*a >> 8 & 255) + (*b >> 8 & 255) + (*d >> 8 & 255)) / 3) << 8 | ((*a & 255) + (*b & 255) + (*d & 255)) / 3;
        }
        if (lit) {
          const float *p0 = m->pos + i0 * 3, *p1 = m->pos + i1 * 3, *p2 = m->pos + i2 * 3;
          float ax = p1[0] - p0[0], ay = p1[1] - p0[1], az = p1[2] - p0[2], bx = p2[0] - p0[0], by = p2[1] - p0[1], bz = p2[2] - p0[2];
          float s[3];
          if (sp) {   // the face's centre for the highlight
            const float cx = (p0[0] + p1[0] + p2[0]) / 3, cy = (p0[1] + p1[1] + p2[1]) / 3, cz = (p0[2] + p1[2] + p2[2]) / 3;
            const float wp[3] = {M[0] * cx + M[4] * cy + M[8] * cz + M[12], M[1] * cx + M[5] * cy + M[9] * cz + M[13], M[2] * cx + M[6] * cy + M[10] * cz + M[14]};
            shade(M, ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx, base, s, wp);
          } else shade(M, ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx, base, s);
          if (em) glow(s);
          c.flat = pack(s[0], s[1], s[2]);
        } else if (em) { float s[3] = {(float)(base >> 16 & 255), (float)(base >> 8 & 255), (float)(base & 255)}; glow(s); c.flat = pack(s[0], s[1], s[2]); }
        else c.flat = base & 0xFFFFFF;
      }
      V poly[12] = {vs[i0], vs[i1], vs[i2]};
      int n = (o0 | o1 | o2) ? clip(poly, 3, o0 | o1 | o2) : 3;
      if (n < 3) continue;
      S s[12];
      for (int k = 0; k < n; k++) {
        const V& q = poly[k];
        float iw = 1 / q.w;
        s[k] = S{(q.x * iw * 0.5f + 0.5f) * W, (0.5f - q.y * iw * 0.5f) * H, q.z * iw * 0.5f + 0.5f, iw, q.r, q.g, q.b, q.u * iw, q.v * iw};
      }
      float area = 0;  // shoelace; front faces are counter-clockwise, i.e. negative with y down
      for (int k = 0; k < n; k++) { const S& A = s[k]; const S& B = s[k + 1 == n ? 0 : k + 1]; area += A.x * B.y - B.x * A.y; }
      if (area >= 0 && !(flags & DOUBLE)) continue;
      if (bl == OPAQUE || bl > ADD) {   // the opaque draws keep their direct calls
        for (int k = 1; k + 1 < n; k++) {
          if (textured) { if (smooth) raster<true, true, OPAQUE>(c, &s[0], &s[k], &s[k + 1]); else raster<true, false, OPAQUE>(c, &s[0], &s[k], &s[k + 1]); }
          else if (smooth) raster<false, true, OPAQUE>(c, &s[0], &s[k], &s[k + 1]);
          else raster<false, false, OPAQUE>(c, &s[0], &s[k], &s[k + 1]);
        }
      } else {
        typedef void (*Fill)(const Ctx&, const S*, const S*, const S*);
        static const Fill fills[2][4] = {
          {raster<false, false, ALPHA>, raster<false, true, ALPHA>, raster<true, false, ALPHA>, raster<true, true, ALPHA>},
          {raster<false, false, ADD>, raster<false, true, ADD>, raster<true, false, ADD>, raster<true, true, ADD>}};
        const Fill fill = fills[bl - ALPHA][(textured ? 2 : 0) | (smooth ? 1 : 0)];
        for (int k = 1; k + 1 < n; k++) fill(c, &s[0], &s[k], &s[k + 1]);
      }
      tris++;
    }
  }
  // ------------------------------------------------ worlds
  Pool<World> worlds;
  Array<N> ident;                     // the world matrix of a world's batches: their positions are the world's
  // The index range of the next draw (worldDraw): every renderer's draw() draws indices rFirst .. rFirst + rCount of its mesh (rCount < 0: all)
  int32_t rFirst = 0, rCount = -1;
  int32_t rangeCount(const Mesh* m) const { return rCount < 0 ? m->ni - rFirst : rCount; }
  // A renderer that draws a world its own way (render3d.psp.cpp) overrides these: one range a sector (it lights a draw with one colour), the
  // distance that splits the cells into a near and a far pass (0: one pass), and its own copy of a batch from the chunk's record, 20-byte
  // vertices and indices (include/zn/zworld.h), whose mesh id its meshDestroy frees (-1: the float mesh every renderer draws)
  virtual bool worldSectorDraws() const { return false; }
  virtual float worldSplit() const { return 0; }
  virtual int32_t worldMesh(const uint8_t*, const uint8_t*, uint32_t, const uint8_t*, uint32_t) { return -1; }

  /** Reads a world's index (include/zn/zworld.h): its cells and chunks, none loaded. -1 when it is not there or damaged. */
  int32_t worldOpen(String name) override {
    uint32_t n = 0;
    unsigned char* p = zn_asset_bytes ? zn_asset_bytes(name.ptr(), name.bytes(), &n) : nullptr;
    if (!p) return -1;
    const uint32_t nc = n >= 16 ? rd32(p + 8) : 0, nk = n >= 16 ? rd32(p + 12) : 0;
    if (n < 16 || memcmp(p, "ZWD1", 4) || rd32(p + 4) != zn::zworld::kVersion || (uint64_t)16 + (uint64_t)nc * zn::zworld::kCell > n) { free(p); return -1; }
    World* w = (World*)mem(sizeof(World));
    memset(w, 0, sizeof(World));
    w->scale = 1;
    uint32_t slash = 0;
    for (uint32_t i = 0; i < name.bytes() && i < sizeof(w->dir) - 1; i++) if (name.ptr()[i] == '/') slash = i + 1;
    memcpy(w->dir, name.ptr(), slash < sizeof(w->dir) ? slash : 0);
    w->c = (WCell*)mem(sizeof(WCell) * (nc ? nc : 1));
    w->nc = (int32_t)nc;
    const uint8_t* q = p + 16;
    for (uint32_t i = 0; i < nc; i++, q += zn::zworld::kCell) {
      WCell& c = w->c[i];
      memset(&c, 0, sizeof c);
      for (int a = 0; a < 3; a++) { c.mn[a] = rdf(q + 4 * a); c.mx[a] = rdf(q + 12 + 4 * a); }
      c.reach[0] = rdf(q + 24); c.reach[1] = rdf(q + 28);
      for (int a = 0; a < 3; a++) c.diag += (c.mx[a] - c.mn[a]) * (c.mx[a] - c.mn[a]);
      c.diag = sqrtf(c.diag);   // the box's diagonal (WItem::out)
      for (int l = 0; l < 3; l++) { const int32_t k = (int32_t)rd32(q + 32 + 4 * l); c.chunk[l] = k >= 0 && (uint32_t)k < nk ? k : -1; }
      c.shown = -1;
    }
    w->k = (WChunk*)mem(sizeof(WChunk) * (nk ? nk : 1));
    w->nk = (int32_t)nk;
    for (uint32_t i = 0; i < nk; i++) {
      WChunk& k = w->k[i];
      memset(&k, 0, sizeof k);
      const uint32_t len = q + 8 <= p + n ? rd32(q + 4) : 0;
      if (q + 8 + len > p + n) { w->nk = (int32_t)i; break; }
      k.level = (int32_t)rd32(q);
      k.name = (char*)mem(slash + len + 1);
      memcpy(k.name, w->dir, slash); memcpy(k.name + slash, q + 8, len); k.name[slash + len] = 0;
      q += 8 + ((len + 3) & ~3u);
    }
    free(p);
    return worlds.add(w);
  }
  /** Loads a chunk: its batches become meshes (through meshLoad, so a GPU renderer keeps its own copy), its pictures are looked up. The
   *  bytes read, or -1. */
  int32_t worldLoad(int32_t id, int32_t chunk) override {
    World* w = worlds.at(id);
    if (!w || chunk < 0 || chunk >= w->nk) return -1;
    WChunk& k = w->k[chunk];
    if (k.loaded) return 0;
    uint32_t n = 0;
    unsigned char* p = zn_asset_bytes ? zn_asset_bytes(k.name, (uint32_t)strlen(k.name), &n) : nullptr;
    if (!p) {   // not in this device's packs (an asset rule left the level out): its cells no longer have that level
      for (int32_t i = 0; i < w->nc; i++) if (w->c[i].chunk[k.level] == chunk) w->c[i].chunk[k.level] = -1;
      return -1;
    }
    const uint32_t nb = n >= 16 ? rd32(p + 4) : 0, ns = n >= 16 ? rd32(p + 8) : 0, nn = n >= 16 ? rd32(p + 12) : 0;
    if (n < 16 || memcmp(p, "ZWC1", 4) || (uint64_t)16 + (uint64_t)nb * zn::zworld::kBatch > n) { free(p); return -1; }
    const uint8_t* end = p + n;
    const uint8_t* q = p + 16 + nb * zn::zworld::kBatch;
    int32_t names[256];
    for (uint32_t i = 0; i < nn; i++) {   // the pictures, by name beside the index
      const uint32_t len = q + 4 <= end ? rd32(q) : 0;
      if (q + 4 + len > end) { free(p); return -1; }
      char path[512];
      const size_t dl = strlen(w->dir), l = len < sizeof(path) - dl - 1 ? len : sizeof(path) - dl - 1;
      memcpy(path, w->dir, dl); memcpy(path + dl, q + 4, l); path[dl + l] = 0;
      if (i < 256) {
        names[i] = raster::find_image(path, (uint32_t)(dl + l));
        if (names[i] < 0 && zn_asset_image) names[i] = zn_asset_image(path, (uint32_t)(dl + l));
      }
      q += 4 + ((len + 3) & ~3u);
    }
    if (q + (uint64_t)ns * 4 > end) { free(p); return -1; }
    k.spans = (uint32_t*)mem(4 * (size_t)(ns ? ns : 1));
    memcpy(k.spans, q, 4 * (size_t)ns);
    q += 4 * (size_t)ns;
    k.b = (WBatch*)mem(sizeof(WBatch) * (nb ? nb : 1));
    k.nb = 0;
    for (uint32_t i = 0; i < nb; i++) {
      const uint8_t* r = p + 16 + i * zn::zworld::kBatch;
      const uint32_t nv = rd32(r + 44), ni = rd32(r + 48), groups = rd32(r + 36), cells = rd32(r + 32), at = rd32(r + 40);
      const size_t vbytes = (size_t)nv * zn::zworld::kVertex, ibytes = ((size_t)ni * 2 + 3) & ~(size_t)3;
      if (!nv || nv > zn::zmesh::kMaxVertices || ni % 3 || q + vbytes + ibytes > end || (uint64_t)at + (uint64_t)cells * groups + 1 > ns) break;
      bool ok = true;
      for (uint32_t j = 0; j < ni && ok; j++) { uint16_t v; memcpy(&v, q + vbytes + 2 * j, 2); ok = v < nv; }
      for (uint32_t j = 0; j <= cells * groups && ok; j++) ok = k.spans[at + j] <= ni;
      if (!ok) break;
      int32_t mesh = worldMesh(r, q, nv, q + vbytes, ni);   // the renderer's own layout, else the float mesh
      if (mesh < 0) {
        // the part as meshLoad takes it (include/zn/zmesh.h): float positions and normals, uvs, colours, the indices
        const uint32_t flags = zn::zmesh::Uvs | zn::zmesh::Colors;
        const size_t bytes = zn::zmesh::partBytes(nv, ni, flags);
        Array<uint8_t> part = Array<uint8_t>::with_cap((int32_t)bytes);
        part.a->len = (int32_t)bytes;
        uint8_t* d = part.a->data;
        memset(d, 0, zn::zmesh::kPartHeader);
        memcpy(d, &nv, 4); memcpy(d + 4, &ni, 4); memcpy(d + 8, &flags, 4);
        float* pos = (float*)(d + zn::zmesh::kPartHeader);
        float* nrm = pos + 3 * (size_t)nv;
        float* uv = nrm + 3 * (size_t)nv;
        uint32_t* col = (uint32_t*)(uv + 2 * (size_t)nv);
        const float o[3] = {rdf(r + 52), rdf(r + 56), rdf(r + 60)}, s[3] = {rdf(r + 64), rdf(r + 68), rdf(r + 72)}, us = rdf(r + 76);
        for (uint32_t v = 0; v < nv; v++) {
          const uint8_t* x = q + (size_t)v * zn::zworld::kVertex;
          int16_t h[5]; memcpy(h, x, 10);
          for (int a = 0; a < 3; a++) pos[v * 3 + a] = o[a] + ((float)h[a] + 32768.0f) / 65535.0f * s[a];
          uv[v * 2] = h[3] * us; uv[v * 2 + 1] = h[4] * us;
          col[v] = (uint32_t)x[10] << 16 | (uint32_t)x[11] << 8 | x[12];
          float nx = (int8_t)x[14] / 127.0f, ny = (int8_t)x[15] / 127.0f, nz = (int8_t)x[16] / 127.0f, l = sqrtf(nx * nx + ny * ny + nz * nz);
          if (l > 0) { nx /= l; ny /= l; nz /= l; }
          nrm[v * 3] = nx; nrm[v * 3 + 1] = ny; nrm[v * 3 + 2] = nz;
        }
        memcpy(col + nv, q + vbytes, (size_t)ni * 2);
        mesh = meshLoad(part, 0);
      }
      q += vbytes + ibytes;
      if (mesh < 0) break;
      WBatch& b = k.b[k.nb++];
      const int32_t tn = (int32_t)rd32(r + 20), nt = (int32_t)rd32(r + 24);
      b.mesh = mesh; b.kind = rd32(r); b.flags = rd32(r + 4); b.color = rd32(r + 8); b.emis = rd32(r + 12); b.nemis = rd32(r + 16);
      b.tex = tn >= 0 && tn < 256 && (uint32_t)tn < nn ? names[tn] : -1;
      b.ntex = nt >= 0 && nt < 256 && (uint32_t)nt < nn ? names[nt] : -1;
      if (nt >= 0 && b.ntex < 0) { b.ntex = b.tex; b.nemis = b.emis; }   // a night picture this device's packs leave out: the day's
      else if (nt < 0) b.ntex = b.tex;
      b.cell = (int32_t)rd32(r + 28); b.cells = cells; b.groups = groups; b.spans = k.spans + at;
    }
    free(p);
    k.loaded = true; k.idle = 0;
    return (int32_t)n;
  }
  /** Frees a chunk's meshes: its cells fall back to another level at the next select. */
  void worldFree(int32_t id, int32_t chunk) override {
    World* w = worlds.at(id);
    if (!w || chunk < 0 || chunk >= w->nk || !w->k[chunk].loaded) return;
    WChunk& k = w->k[chunk];
    for (int32_t i = 0; i < k.nb; i++) meshDestroy(k.b[i].mesh);
    mfree(k.b); mfree(k.spans);
    k.b = nullptr; k.spans = nullptr; k.nb = 0; k.loaded = false;
  }
  void worldNight(int32_t id, N night) override { if (World* w = worlds.at(id)) { w->dusk = F(night); w->night = w->dusk >= 0.5f; } }
  void worldShadows(int32_t, String, Array<N>) override {}   // the 3DS draws them (render3d.n3ds.cpp)

  /** One cell's indices of a batch, of which only the sectors in `arc` (all when count >= 16) for a batch ordered by sector. */
  void ranges(World* w, int32_t chunk, int32_t batch, const WBatch& b, const WCell& c, int32_t ci, bool sectors) {
    const uint32_t g = b.groups;
    const uint32_t* s = b.spans + (size_t)(ci - b.cell) * g;
    const float split = worldSplit();
    const uint8_t nr = split > 0 && c.d < split;
    const float out = c.d + c.diag;
    auto push = [&](uint32_t from, uint32_t to, uint8_t sec) {
      if (to <= from) return;
      WItem* last = w->ni ? &w->items[w->ni - 1] : nullptr;
      if (last && last->chunk == chunk && last->batch == batch && last->to == from && last->sector == sec && last->near == nr) {   // continues the last
        last->to = to; last->out = out > last->out ? out : last->out;
        return;
      }
      w->items = (WItem*)grown(w->items, w->ni, &w->icap, w->ni + 1, sizeof(WItem));
      w->items[w->ni++] = WItem{chunk, batch, b.kind, from, to, sec, nr, out};
    };
    const int S = zn::zworld::kSectors;
    const uint8_t whole = g == zn::zworld::kGroups || b.kind != zn::zworld::Top ? WORLD_MIXED : (uint8_t)S;
    const bool each = g == zn::zworld::kGroups && worldSectorDraws();
    if (g != zn::zworld::kGroups || !sectors || c.arcN >= (int16_t)S) {
      if (!each) { push(s[0], s[g], whole); return; }
      for (int j = 0; j <= S; j++) push(s[j], s[j + 1], (uint8_t)j);
      return;
    }
    const int first = c.arc0, end = c.arc0 + c.arcN;
    if (each) {   // in index order: the sectors from 0 when the arc wraps, those from its first, then the faces that look up or down
      for (int j = end > S ? 0 : S; j < end - S; j++) push(s[j], s[j + 1], (uint8_t)j);
      for (int j = first; j < (end < S ? end : S); j++) push(s[j], s[j + 1], (uint8_t)j);
      push(s[S], s[g], (uint8_t)S);
    } else if (end <= S) { push(s[first], s[end], whole); push(s[S], s[g], whole); }
    else { push(s[0], s[end - S], whole); push(s[first], s[g], whole); }
  }

  /** view: the camera's view matrix. eyes: the eye, then points it will pass (x, y, z each). prm: vertical field of view (radians), aspect,
   *  near, far, near reach, mid reach (metres, scaled by the governor), budget (triangles), hysteresis (>= 1), sectors (0/1), dt (seconds),
   *  idle (seconds before a chunk nobody wants is named to free; 0 never). out: triangles, draws, the governor's scale x 1000, the count of
   *  chunks to load and to free, then the chunks to load (the coarse levels first, nearest first) and to free. */
  void worldSelect(int32_t id, Array<N> view, Array<N> eyes, Array<N> prm, Array<int32_t> out) override {
    World* w = worlds.at(id);
    if (!w || prm.length() < 11 || eyes.length() < 3 || view.length() < 16) return;
    float P[11];
    for (int i = 0; i < 11; i++) P[i] = F(prm.a->data[i]);
    const float nearR = P[4] * w->scale, midR = P[5] * w->scale, hyst = P[7] > 1 ? P[7] : 1, dt = P[9], idleMax = P[10];
    const int64_t budget = (int64_t)P[6];
    const bool sectors = P[8] != 0;
    // the frustum's planes from projection x view (Gribb and Hartmann), inside >= 0
    float VP[16], pl[6][4];
    {
      const float asp = P[1] > 0 ? P[1] : 1, n = P[2], f = P[3], k = 1 / tanf(P[0] * 0.5f);
      float Pm[16] = {0}, Vw[16];
      Pm[0] = k / asp; Pm[5] = k; Pm[10] = (f + n) / (n - f); Pm[11] = -1; Pm[14] = 2 * f * n / (n - f);
      for (int i = 0; i < 16; i++) Vw[i] = F(view.a->data[i]);
      mul(VP, Pm, Vw);
      for (int i = 0; i < 3; i++) for (int sgn = 0; sgn < 2; sgn++) {
        float* q = pl[i * 2 + sgn];
        for (int c = 0; c < 4; c++) q[c] = VP[c * 4 + 3] + (sgn ? -1.0f : 1.0f) * VP[c * 4 + i];
      }
    }
    int ne = eyes.length() / 3;
    if (ne > WORLD_POINTS) ne = WORLD_POINTS;
    float E[WORLD_POINTS][3];
    for (int k = 0; k < ne; k++) for (int a = 0; a < 3; a++) E[k][a] = F(eyes.a->data[k * 3 + a]);
    // each cell's level: by distance, coarser only past the distance times the hysteresis; the level wanted if loaded, else a coarser one
    // that is, else a finer one (no holes); of its walls, the sectors that can face the eye
    for (int32_t i = 0; i < w->nc; i++) {
      WCell& c = w->c[i];
      c.d = boxDist(c.mn, c.mx, E[0]);
      c.vis = c.mn[1] <= c.mx[1] && inFrustum(pl, c.mn, c.mx);
      if (!c.vis) { c.shown = -1; continue; }
      const float r[2] = {c.reach[0] > 0 ? c.reach[0] : nearR, c.reach[1] > 0 ? c.reach[1] : midR};
      int want = c.d < r[0] ? 0 : c.d < r[1] ? 1 : 2;
      if (c.shown >= 0 && want > c.shown) { int l = c.shown; while (l < want && c.d >= r[l] * hyst) l++; want = l; }
      int lvl = -1;
      for (int l = want; l < 3 && lvl < 0; l++) if (c.chunk[l] >= 0 && w->k[c.chunk[l]].loaded) lvl = l;
      for (int l = want - 1; l >= 0 && lvl < 0; l--) if (c.chunk[l] >= 0 && w->k[c.chunk[l]].loaded) lvl = l;
      c.shown = (int8_t)lvl;
      if (sectors && lvl >= 0) facing(E[0], c.mn, c.mx, &c.arc0, &c.arcN);
      else c.arcN = (int16_t)zn::zworld::kSectors;
    }
    // the ranges: of every loaded chunk's batches, the cells that show the chunk's level; in the order they are drawn (by kind, chunk,
    // batch, then index), with no sort
    w->ni = 0;
    int64_t tris = 0;
    for (uint32_t kd = 0; kd < zn::zworld::Kinds; kd++) for (int32_t k = 0; k < w->nk; k++) {
      const WChunk& ch = w->k[k];
      if (!ch.loaded) continue;
      for (int32_t j = 0; j < ch.nb; j++) {
        const WBatch& b = ch.b[j];
        if ((b.kind < zn::zworld::Kinds ? b.kind : zn::zworld::Kinds - 1) != kd) continue;
        for (uint32_t ci = 0; ci < b.cells; ci++) {
          const int32_t cell = b.cell + (int32_t)ci;
          if (cell < 0 || cell >= w->nc) continue;
          const WCell& c = w->c[cell];
          if (c.shown != ch.level || c.chunk[ch.level] != k) continue;
          ranges(w, k, j, b, c, cell, sectors);
        }
      }
    }
    for (int32_t t = 0; t < w->ni; t++) tris += (w->items[t].to - w->items[t].from) / 3;
    // the governor (tokyo-sim view.rs Governor): the distances in quickly over the budget, out slowly under 88% of it
    if (budget > 0) {
      if (tris > budget) w->scale *= 0.97f;
      else if ((float)tris < budget * 0.88f) w->scale *= 1.008f;
      w->scale = w->scale < 0.25f ? 0.25f : w->scale > 1 ? 1 : w->scale;
    }
    // the chunks to load: for the eye and the points after it, each cell's coarsest level (without it the cell is missing), then the
    // level its distance asks for; nearest first. And those nobody has wanted for `idle` seconds, to free (never a coarsest level).
    const float NONE = 1e30f, LATER = 1e7f;
    for (int32_t k = 0; k < w->nk; k++) w->k[k].need = NONE;
    for (int32_t i = 0; i < w->nc; i++) {
      const WCell& c = w->c[i];
      int cl = -1;
      for (int l = 2; l >= 0 && cl < 0; l--) if (c.chunk[l] >= 0) cl = l;
      if (cl < 0) continue;
      const float r[2] = {c.reach[0] > 0 ? c.reach[0] : nearR, c.reach[1] > 0 ? c.reach[1] : midR};
      for (int e = 0; e < ne; e++) {
        const float d = e == 0 ? c.d : boxDist(c.mn, c.mx, E[e]);
        WChunk& co = w->k[c.chunk[cl]];
        if (d < co.need) co.need = d;
        int want = d < r[0] ? 0 : d < r[1] ? 1 : 2;
        while (want < cl && c.chunk[want] < 0) want++;
        if (want < cl) { WChunk& ch = w->k[c.chunk[want]]; if (LATER + d < ch.need) ch.need = LATER + d; }
      }
    }
    int32_t ask[WORLD_ASK], freed[WORLD_FREE];
    int na = 0, nf = 0;
    for (int32_t k = 0; k < w->nk; k++) {
      WChunk& ch = w->k[k];
      if (ch.loaded) {
        if (ch.need < NONE || ch.level == 2) ch.idle = 0;
        else if ((ch.idle += dt) > idleMax && idleMax > 0 && nf < WORLD_FREE) { freed[nf++] = k; ch.idle = 0; }
        continue;
      }
      if (ch.need >= NONE || (na == WORLD_ASK && ch.need >= w->k[ask[na - 1]].need)) continue;
      int j = na < WORLD_ASK ? na++ : na - 1;
      while (j > 0 && w->k[ask[j - 1]].need > ch.need) { ask[j] = ask[j - 1]; j--; }
      ask[j] = k;
    }
    out.set_length(0);
    out.push((int32_t)tris); out.push(w->ni); out.push((int32_t)(w->scale * 1000)); out.push(na); out.push(nf);
    for (int k = 0; k < na; k++) out.push(ask[k]);
    for (int k = 0; k < nf; k++) out.push(freed[k]);
  }
  /** Draws the ranges worldSelect chose, in its order (by kind, then batch): state changes only between batches. */
  void worldDraw(int32_t id) override {
    World* w = worlds.at(id);
    if (!w) return;
    if (!ident.a) { ident = Array<N>::with_cap(16); for (int i = 0; i < 16; i++) ident.push_raw(N(i % 5 == 0 ? 1 : 0)); }
    specular(0, N(30));
    uint32_t e = 0;
    for (int32_t i = 0; i < w->ni; i++) {
      const WItem& it = w->items[i];
      const WChunk& ch = w->k[it.chunk];
      if (!ch.loaded || it.batch >= ch.nb) continue;   // freed since the select
      const WBatch& b = ch.b[it.batch];
      const uint32_t em = w->night ? b.nemis : b.emis;
      if (em != e) { emissive(em); e = em; }
      rFirst = (int32_t)it.from; rCount = (int32_t)(it.to - it.from);
      draw(b.mesh, ident, b.color, w->night ? b.ntex : b.tex, (int32_t)b.flags);
    }
    rFirst = 0; rCount = -1;
    if (e) emissive(0);
  }


  int32_t end() override {
    if (!cur) return 0;
    fogPass();
    raster::dyn_update(cur->img, nullptr, 0);
    cur = nullptr;
    return tris;
  }
  void present(int32_t id, N x, N y, N w, N h) override {
    Target* t = targets.at(id);
    if (t && t->img >= 0) presentImage(t->img, x, y, w, h);
  }
};

}  // namespace

#ifdef ZP_3D_GPU
NativeRender3D* gpuRenderer();  // render3d.gl.cpp, which includes this file: null when the software renderer is wanted or no GPU context opens
#endif

NativeRender3D* zinc_create_Render3D() {
#ifdef ZP_3D_GPU
  if (NativeRender3D* g = gpuRenderer()) return g;
#endif
  static Engine e;
#if __has_include("zn/resource_stats.h")
  static ZnResourceStatsRegistration meshes("3d.meshes", Engine::meshStats, &e), targets("3d.targets", Engine::targetStats, &e);
#endif
  e.rc = zrt::IMMORTAL;
  return &e;
}
