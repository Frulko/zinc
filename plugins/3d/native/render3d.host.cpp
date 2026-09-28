// zinc:3d renderer: per-vertex transform and lighting in float, homogeneous clipping (near/far planes + a guard
// band), backface culling, scanline rasterization with 16.16 fixed-point edges and attributes, a 16- or 32-bit
// z-buffer, perspective-correct texturing by span subdivision, optional 2x2 ordered dither to RGB565.
// Colour buffer = a runtime image (raster::dyn_create), shown with gfx.drawImage. docs/plugins/3d.md.
#include "zinc_native_render3d.h"
#include "zrt_raster.h"
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
#define ZP_3D_SCALE 1
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
enum { VCOL = 1, FLAT = 2, UNLIT = 4, DOUBLE = 8 };

struct Mesh { int32_t nv, ni; float *pos, *nrm, *uv; uint32_t* col; uint16_t* idx; };
struct Target { int32_t img, w, h; ZT* z; };
struct Tex { const uint32_t* px; int32_t w, h, stride; };
struct V { float x, y, z, w, r, g, b, u, v; };      // clip space + shade (0..255) + uv
struct S { float x, y, z, iw, r, g, b, u, v; };     // screen space; u, v premultiplied by iw
struct Ctx { uint32_t* px; ZT* zb; int32_t w, h; Tex tex; uint32_t flat; };

template<class T> struct Pool {
  T** p = nullptr; int32_t n = 0;
  int32_t add(T* v) {
    for (int32_t i = 0; i < n; i++) if (!p[i]) { p[i] = v; return i; }
    p = (T**)realloc(p, sizeof(T*) * (size_t)(n + 1)); p[n] = v; return n++;
  }
  T* at(int32_t i) const { return i >= 0 && i < n ? p[i] : nullptr; }
};

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

// Scanline triangle: top-left fill rule at pixel centres, edges and attributes stepped in 16.16.
template<bool TEX, bool SMOOTH>
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
    return Edge{(int32_t)((p->x + (y + 0.5f - p->y) * k) * 65536), (int32_t)(k * 65536)};
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
    float fx = x0 + 0.5f - a->x, fy = y + 0.5f - a->y;
    int32_t z = (int32_t)((a->z + zx * fx + zy * fy) * ZS), dz = (int32_t)(zx * ZS);
    int32_t R_ = 0, G_ = 0, B_ = 0, dr = 0, dg = 0, db = 0;
    if (SMOOTH) {
      R_ = (int32_t)((a->r + rx * fx + ry * fy) * 65536); dr = (int32_t)(rx * 65536);
      G_ = (int32_t)((a->g + gx * fx + gy * fy) * 65536); dg = (int32_t)(gx * 65536);
      B_ = (int32_t)((a->b + bx * fx + by * fy) * 65536); db = (int32_t)(bx * 65536);
    }
    uint32_t* px = c.px + (size_t)y * c.w + x0;
    ZT* zb = c.zb + (size_t)y * c.w + x0;
    float iw = 0, uw = 0, vw = 0;
    int32_t u = 0, v = 0;
    if (TEX) {
      iw = a->iw + wx * fx + wy * fy; uw = a->u + ux * fx + uy * fy; vw = a->v + vx * fx + vy * fy;
      float q = 1 / iw;
      u = (int32_t)(uw * q * 65536); v = (int32_t)(vw * q * 65536);
    }
    for (int32_t i = 0; i < n;) {
      int32_t len = TEX ? (n - i < ZP_3D_SUBDIV ? n - i : ZP_3D_SUBDIV) : n;
      int32_t du = 0, dv = 0, u2 = 0, v2 = 0;
      if (TEX) {  // exact uv at the end of the run, affine inside it
        iw += wx * len; uw += ux * len; vw += vx * len;
        float q = iw > 1e-9f ? 1 / iw : 0;
        u2 = (int32_t)(uw * q * 65536); v2 = (int32_t)(vw * q * 65536);
        du = (u2 - u) / len; dv = (v2 - v) / len;
      }
      for (int32_t e = i + len; i < e; i++) {
        uint32_t zz = (uint32_t)z >> ZSHIFT;
        if (zz < zb[i]) {
          zb[i] = (ZT)zz;
          uint32_t col;
          if (TEX) {
            uint32_t t = c.tex.px[(((uint32_t)v & 0xFFFF) * th >> 16) * ts + (((uint32_t)u & 0xFFFF) * tw >> 16)];
            col = SMOOTH ? modulate(t, (uint32_t)R_ >> 16, (uint32_t)G_ >> 16, (uint32_t)B_ >> 16) : modulate(t, fr, fg, fb);
          } else if (SMOOTH) col = ((uint32_t)R_ >> 16) << 16 | ((uint32_t)G_ >> 16) << 8 | (uint32_t)B_ >> 16;
          else col = c.flat;
          px[i] = out(col, x0 + i, y);
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

static uint32_t** baked;  // 0x00RRGGBB copies of baked images used as textures (made on first use)
static bool texture(int32_t id, Tex& t) {
  if (id >= 0 && id < raster::image_count) {
    const raster::Image& im = raster::images[id];
    if (!baked) baked = (uint32_t**)calloc((size_t)raster::image_count, sizeof(uint32_t*));
    if (!baked[id]) {
      uint32_t* px = (uint32_t*)malloc((size_t)im.w * im.h * 4);
      if (!px) return false;
      for (int32_t i = 0; i < im.w * im.h; i++) { const uint8_t* s = im.rgba + i * 4; px[i] = (uint32_t)s[0] << 16 | (uint32_t)s[1] << 8 | s[2]; }
      baked[id] = px;
    }
    t = Tex{baked[id], im.w, im.h, im.w};
    return true;
  }
  return raster::dyn_view(id, &t.px, &t.w, &t.h, &t.stride) && t.w > 0 && t.h > 0;
}

struct Engine : NativeRender3D {
  Pool<Mesh> meshes;
  Pool<Target> targets;
  Target* cur = nullptr;
  float vp[16];
  float amb[3] = {0, 0, 0};
  int nl = 0;
  float ld[4][3], lc[4][3];
  int32_t tris = 0;
  V* vs = nullptr; uint8_t* oc = nullptr; int32_t cap = 0;

  int32_t meshCreate(Array<N> pos, Array<N> nrm, Array<N> uv, Array<uint32_t> col, Array<int32_t> idx) override {
    int32_t nv = pos.length() / 3, ni = idx.length() / 3 * 3;
    if (nv <= 0 || nv > 65535) return -1;
    Mesh* m = (Mesh*)calloc(1, sizeof(Mesh));
    m->nv = nv; m->ni = ni;
    m->pos = (float*)malloc(sizeof(float) * 3 * (size_t)nv);
    m->nrm = (float*)calloc(3 * (size_t)nv, sizeof(float));
    m->idx = (uint16_t*)malloc(sizeof(uint16_t) * (size_t)(ni ? ni : 1));
    for (int32_t i = 0; i < nv * 3; i++) m->pos[i] = F(pos.a->data[i]);
    for (int32_t i = 0; i < ni; i++) { int32_t k = idx.a->data[i]; m->idx[i] = (uint16_t)(k >= 0 && k < nv ? k : 0); }
    if (uv.length() >= nv * 2) { m->uv = (float*)malloc(sizeof(float) * 2 * (size_t)nv); for (int32_t i = 0; i < nv * 2; i++) m->uv[i] = F(uv.a->data[i]); }
    if (col.length() >= nv) { m->col = (uint32_t*)malloc(sizeof(uint32_t) * (size_t)nv); memcpy(m->col, col.a->data, sizeof(uint32_t) * (size_t)nv); }
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
    if (nv > cap) {
      cap = nv;
      vs = (V*)realloc(vs, sizeof(V) * (size_t)cap);
      oc = (uint8_t*)realloc(oc, (size_t)cap);
    }
    return meshes.add(m);
  }
  void meshDestroy(int32_t id) override {
    Mesh* m = meshes.at(id);
    if (!m) return;
    free(m->pos); free(m->nrm); free(m->uv); free(m->col); free(m->idx); free(m);
    meshes.p[id] = nullptr;
  }

  int32_t target(int32_t id, int32_t w, int32_t h) override {
    w = w / ZP_3D_SCALE; h = h / ZP_3D_SCALE;
    if (w < 1) w = 1;
    if (h < 1) h = 1;
    Target* t = targets.at(id);
    if (!t) {
      int32_t img = raster::dyn_create(w, h);
      ZT* z = (ZT*)malloc(sizeof(ZT) * (size_t)w * h);
      if (img < 0 || !z) { if (img >= 0) raster::dyn_destroy(img); free(z); return -1; }
      t = (Target*)malloc(sizeof(Target));
      *t = Target{img, w, h, z};
      return targets.add(t);
    }
    if (t->w != w || t->h != h) {
      raster::dyn_resize(t->img, w, h);
      free(t->z); t->z = (ZT*)malloc(sizeof(ZT) * (size_t)w * h);
      t->w = w; t->h = h;
    }
    return id;
  }
  int32_t image(int32_t id) override { Target* t = targets.at(id); return t ? t->img : -1; }
  void targetDestroy(int32_t id) override {
    Target* t = targets.at(id);
    if (!t) return;
    if (cur == t) cur = nullptr;
    raster::dyn_destroy(t->img); free(t->z); free(t);
    targets.p[id] = nullptr;
  }

  void begin(int32_t id, uint32_t clear, Array<N> view, N proj, N nearN, N farN, bool ortho) override {
    cur = targets.at(id);
    uint32_t* px = cur ? raster::dyn_pixels(cur->img) : nullptr;
    if (!px || !cur->z) { cur = nullptr; return; }
    tris = 0; nl = 0; amb[0] = amb[1] = amb[2] = 0;
    for (int32_t i = 0, n = cur->w * cur->h; i < n; i++) px[i] = clear & 0xFFFFFF;
    memset(cur->z, 0xFF, sizeof(ZT) * (size_t)cur->w * cur->h);
    float asp = (float)cur->w / cur->h, n = F(nearN), f = F(farN), P[16] = {0}, Vw[16];
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
  void ambient(uint32_t c) override { amb[0] = (c >> 16 & 255) / 255.0f; amb[1] = (c >> 8 & 255) / 255.0f; amb[2] = (c & 255) / 255.0f; }
  void light(N dx, N dy, N dz, uint32_t c) override {
    if (nl >= 4) return;
    float x = F(dx), y = F(dy), z = F(dz), l = sqrtf(x * x + y * y + z * z);
    if (l <= 0) return;
    ld[nl][0] = x / l; ld[nl][1] = y / l; ld[nl][2] = z / l;
    lc[nl][0] = (c >> 16 & 255) / 255.0f; lc[nl][1] = (c >> 8 & 255) / 255.0f; lc[nl][2] = (c & 255) / 255.0f;
    nl++;
  }
  /** Light reaching a surface with object-space normal (nx, ny, nz) under model matrix M, times base colour. */
  void shade(const float* M, float nx, float ny, float nz, uint32_t base, float* o) const {
    float x = M[0] * nx + M[4] * ny + M[8] * nz, y = M[1] * nx + M[5] * ny + M[9] * nz, z = M[2] * nx + M[6] * ny + M[10] * nz;
    float l = sqrtf(x * x + y * y + z * z);
    if (l > 0) { x /= l; y /= l; z /= l; }
    float r = amb[0], g = amb[1], b = amb[2];
    for (int i = 0; i < nl; i++) {
      float k = -(x * ld[i][0] + y * ld[i][1] + z * ld[i][2]);
      if (k > 0) { r += k * lc[i][0]; g += k * lc[i][1]; b += k * lc[i][2]; }
    }
    o[0] = (base >> 16 & 255) * (r > 1 ? 1 : r); o[1] = (base >> 8 & 255) * (g > 1 ? 1 : g); o[2] = (base & 255) * (b > 1 ? 1 : b);
  }

  void draw(int32_t id, Array<N> model, uint32_t color, int32_t tex, int32_t flags) override {
    Mesh* m = meshes.at(id);
    if (!m || !cur) return;
    float M[16], MVP[16];
    for (int i = 0; i < 16; i++) M[i] = i < model.length() ? F(model.a->data[i]) : (i % 5 == 0 ? 1.0f : 0.0f);
    mul(MVP, vp, M);
    Ctx c{raster::dyn_pixels(cur->img), cur->z, cur->w, cur->h, Tex{nullptr, 0, 0, 0}, color & 0xFFFFFF};
    bool textured = tex >= 0 && m->uv && texture(tex, c.tex);
    bool lit = !(flags & UNLIT), flat = flags & FLAT, vcol = (flags & VCOL) && m->col;
    bool smooth = !flat && (lit || vcol);
    for (int32_t i = 0; i < m->nv; i++) {
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
        if (lit) shade(M, m->nrm[i * 3], m->nrm[i * 3 + 1], m->nrm[i * 3 + 2], base, &o.r);
        else { o.r = (float)(base >> 16 & 255); o.g = (float)(base >> 8 & 255); o.b = (float)(base & 255); }
      } else o.r = o.g = o.b = 0;
    }
    const float W = (float)cur->w, H = (float)cur->h;
    for (int32_t t = 0; t < m->ni; t += 3) {
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
          shade(M, ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx, base, s);
          c.flat = pack(s[0], s[1], s[2]);
        } else c.flat = base & 0xFFFFFF;
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
      for (int k = 1; k + 1 < n; k++) {
        if (textured) { if (smooth) raster<true, true>(c, &s[0], &s[k], &s[k + 1]); else raster<true, false>(c, &s[0], &s[k], &s[k + 1]); }
        else if (smooth) raster<false, true>(c, &s[0], &s[k], &s[k + 1]);
        else raster<false, false>(c, &s[0], &s[k], &s[k + 1]);
      }
      tris++;
    }
  }
  int32_t end() override {
    if (!cur) return 0;
    raster::dyn_update(cur->img, nullptr, 0);
    cur = nullptr;
    return tris;
  }
};

}  // namespace

NativeRender3D* zinc_create_Render3D() {
  static Engine e;
  e.rc = zrt::IMMORTAL;
  return &e;
}
