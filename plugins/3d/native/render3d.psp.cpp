// zinc:3d on the PSP's GE (sceGu): the interface and the meshes of the software renderer (render3d.host.cpp, included below: the fallback,
// ZINC_PSP_GPU=0) drawn with the GE's own transform and lighting. A mesh is one vertex buffer in main memory built at meshCreate (texture,
// colour, normal, position; 16-bit indices), plus a de-indexed copy with face normals the first time it is drawn flat. A frame is its own display
// list, sent at end(): the target is a 16-bit (5650) colour buffer and a 16-bit depth buffer in VRAM after the two screen buffers of gu_psp.cpp;
// present() emits the IMAGE command of the target's runtime image as the software renderer does, and gu_psp.cpp's texture() takes the VRAM
// buffer through the zn_3d_gpu_texture hook below, so the 3D view composes in the 2D order without a read back. Lighting is the GE's: ambient
// plus up to 4 directional lights per vertex, specular per vertex (the GE's half vector with an infinite viewer), the emissive colour as the
// material's. The GE clamps the lit colour once (emissive + base x light), the software renderer clamps the light first: a lit colour brighter
// than white by both lights and ambient comes out a little brighter here.
// ponytail: a frame whose 2D commands the replay cannot draw falls back to the software raster, which shows the target's runtime image (black)
// instead of the GE's picture; VRAM is a bump allocator (a target that grows leaks its last size unless it was the last one made).
#define ZP_3D_GPU 1
#include "render3d.host.cpp"

#include <malloc.h>

#include <pspge.h>
#include <pspgu.h>
#include <pspkernel.h>

#include "ff_replay.h"

namespace {

// gu_psp.cpp's texture, as zn::ff::texture returns it and its replay reads it (keep the two in step)
struct GuTex { void* mem; int32_t w, h, stride, tw, th, psm; uint32_t ver; bool ok; };
struct GVtx { float u, v; uint32_t c; float nx, ny, nz, x, y, z; };
constexpr int kVtype = GU_TEXTURE_32BITF | GU_COLOR_8888 | GU_NORMAL_32BITF | GU_VERTEX_32BITF | GU_TRANSFORM_3D;
constexpr uint32_t kVramScreens = 2 * 512 * 272 * 4, kVram = 2 * 1024 * 1024;   // gu_psp.cpp's draw and display buffers, then ours
constexpr int32_t kScreenW = 480, kScreenH = 272;   // gu_psp.cpp's 2D state, set again at the end of a 3D list

struct GMesh { GVtx* v; GVtx* flat; int32_t nv, ni; };
struct GTarget { int32_t img, w, h, d; uint32_t* px; uint32_t off, bytes; GuTex tex; };

unsigned int __attribute__((aligned(16))) list3d[64 * 1024 / 4];
uint32_t vramTop = kVramScreens;

int32_t pow2(int32_t v) { int32_t p = 8; while (p < v) p <<= 1; return p; }
uint32_t abgr(uint32_t rgb) { return 0xFF000000u | (rgb & 0xFF) << 16 | (rgb & 0xFF00) | (rgb >> 16 & 0xFF); }
uint32_t abgrf(const float* c, float k) {   // 0..k floats -> the GE's 0xAABBGGRR
  uint32_t o = 0xFF000000u;
  for (int i = 0; i < 3; i++) { int32_t v = (int32_t)(c[i] / k * 255 + 0.5f); o |= (uint32_t)(v > 255 ? 255 : v < 0 ? 0 : v) << (8 * i); }
  return o;
}
void writeback(const void* p, size_t n) { sceKernelDcacheWritebackRange(p, (unsigned)n); }

struct Psp : Engine {
  GMesh** gm = nullptr; int32_t ngm = 0;   // by the software mesh's id
  Pool<GTarget> gtargets;
  GTarget* gcur = nullptr;

  GMesh* gmesh(int32_t id) { return id >= 0 && id < ngm ? gm[id] : nullptr; }
  static uint32_t vcol(const Mesh* m, int32_t i) { return m->col ? abgr(m->col[i]) : 0xFFFFFFFFu; }
  int32_t keep(int32_t sid) {
    Mesh* m = meshes.at(sid);
    if (!m) return -1;
    if (sid >= ngm) { gm = (GMesh**)realloc(gm, sizeof(GMesh*) * (size_t)(sid + 1)); for (int32_t i = ngm; i <= sid; i++) gm[i] = nullptr; ngm = sid + 1; }
    GMesh* g = (GMesh*)mem(sizeof(GMesh));
    *g = GMesh{(GVtx*)memalign(16, sizeof(GVtx) * (size_t)m->nv), nullptr, m->nv, m->ni};
    for (int32_t i = 0; i < m->nv; i++) {
      const float* p = m->pos + i * 3; const float* n = m->nrm + i * 3;
      g->v[i] = GVtx{m->uv ? m->uv[i * 2] : 0, m->uv ? m->uv[i * 2 + 1] : 0, vcol(m, i), n[0], n[1], n[2], p[0], p[1], p[2]};
    }
    writeback(g->v, sizeof(GVtx) * (size_t)m->nv);
    writeback(m->idx, sizeof(uint16_t) * (size_t)m->ni);   // the GE reads the software mesh's indices
    gm[sid] = g;
    return sid;
  }
  /** The flat copy: three vertices a triangle, the face's normal, the mean of its vertex colours (as the software renderer shades a face). */
  GVtx* flat(Mesh* m, GMesh* g) {
    if (g->flat) return g->flat;
    g->flat = (GVtx*)memalign(16, sizeof(GVtx) * (size_t)m->ni);
    for (int32_t t = 0; t < m->ni; t += 3) {
      const uint16_t* ix = m->idx + t;
      const float *p0 = m->pos + ix[0] * 3, *p1 = m->pos + ix[1] * 3, *p2 = m->pos + ix[2] * 3;
      float ax = p1[0] - p0[0], ay = p1[1] - p0[1], az = p1[2] - p0[2], bx = p2[0] - p0[0], by = p2[1] - p0[1], bz = p2[2] - p0[2];
      float nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx, l = sqrtf(nx * nx + ny * ny + nz * nz);
      if (l > 0) { nx /= l; ny /= l; nz /= l; }
      uint32_t c = 0xFFFFFFFFu;
      if (m->col) {
        uint32_t s[3] = {0, 0, 0};
        for (int k = 0; k < 3; k++) for (int j = 0; j < 3; j++) s[j] += m->col[ix[k]] >> (16 - 8 * j) & 255;
        c = abgr(s[0] / 3 << 16 | s[1] / 3 << 8 | s[2] / 3);
      }
      for (int k = 0; k < 3; k++) { GVtx v = g->v[ix[k]]; v.c = c; v.nx = nx; v.ny = ny; v.nz = nz; g->flat[t + k] = v; }
    }
    writeback(g->flat, sizeof(GVtx) * (size_t)m->ni);
    return g->flat;
  }
  int32_t meshCreate(Array<N> pos, Array<N> nrm, Array<N> uv, Array<uint32_t> col, Array<int32_t> idx) override { return keep(Engine::meshCreate(pos, nrm, uv, col, idx)); }
  int32_t meshLoad(Array<uint8_t> data, int32_t at) override { return keep(Engine::meshLoad(data, at)); }
  void meshDestroy(int32_t id) override {
    if (GMesh* g = gmesh(id)) { sceGuSync(GU_SYNC_FINISH, GU_SYNC_WHAT_DONE); free(g->v); free(g->flat); mfree(g); gm[id] = nullptr; }
    Engine::meshDestroy(id);
  }

  int32_t target(int32_t id, int32_t w, int32_t h) override {
    GTarget* t = gtargets.at(id);
    // the box's size (or the `scale` option's fraction), halved until it fits the GE's 512-texel textures and the VRAM left
    int32_t d = ZP_3D_SCALE > 0 ? ZP_3D_SCALE : 1, tw, th;
    const uint32_t base = t && t->off + t->bytes == vramTop ? t->off : vramTop;   // a target made last gives its VRAM back when it changes
    for (;; d++) {
      tw = w / d < 1 ? 1 : w / d; th = h / d < 1 ? 1 : h / d;
      if (tw <= 512 && th <= 512 && base + (uint32_t)pow2(tw < 64 ? 64 : tw) * th * 4 <= kVram) break;
    }
    if (t && t->w == tw && t->h == th) return id;
    sceGuSync(GU_SYNC_FINISH, GU_SYNC_WHAT_DONE);
    if (t) { if (gcur == t) gcur = nullptr; raster::dyn_destroy(t->img); mfree(t->px); }
    else { t = (GTarget*)mem(sizeof(GTarget)); id = gtargets.add(t); }
    const int32_t stride = pow2(tw < 64 ? 64 : tw);
    t->w = tw; t->h = th; t->d = d;
    t->off = base; t->bytes = (uint32_t)stride * th * 4;   // 5650 colour, then 16-bit depth
    vramTop = base + t->bytes;
    // the runtime image the IMAGE command names: its pixels are the GE's buffer (the hook); this copy only shows when the 2D frame falls back
    t->px = (uint32_t*)mem((size_t)tw * th * 4);
    memset(t->px, 0, (size_t)tw * th * 4);
    t->img = raster::dyn_wrap(tw, th, t->px, tw);
    t->tex = GuTex{(char*)sceGeEdramGetAddr() + t->off, tw, th, stride, pow2(tw), pow2(th), GU_PSM_5650, 0, true};
    return id;
  }
  void targetDestroy(int32_t id) override {
    GTarget* t = gtargets.at(id);
    if (!t) return;
    if (gcur == t) gcur = nullptr;
    if (t->off + t->bytes == vramTop) vramTop = t->off;
    raster::dyn_destroy(t->img); mfree(t->px); mfree(t);
    gtargets.p[id] = nullptr;
  }
  GTarget* byImage(int32_t img) { for (int32_t i = 0; i < gtargets.n; i++) if (GTarget* t = gtargets.p[i]) if (t->img == img) return t; return nullptr; }

  void begin(int32_t id, uint32_t clear, Array<N> view, N proj, N nearN, N farN, bool ortho) override {
    gcur = gtargets.at(id);
    if (!gcur) return;
    GTarget* t = gcur;
    tris = 0; nl = 0; amb[0] = amb[1] = amb[2] = 0;
    spec[0] = spec[1] = spec[2] = 0; emit[0] = emit[1] = emit[2] = 0;
    eyeOf(view);
    float P[16] = {0}, V[16];
    const float n = F(nearN), f = F(farN), asp = (float)t->w / t->h;
    if (ortho) { const float hh = F(proj); P[0] = 2 / (hh * asp); P[5] = 2 / hh; P[10] = -2 / (f - n); P[14] = -(f + n) / (f - n); P[15] = 1; }
    else { const float k = 1 / tanf(F(proj) * 0.5f); P[0] = k / asp; P[5] = k; P[10] = (f + n) / (n - f); P[11] = -1; P[14] = 2 * f * n / (n - f); }
    for (int i = 0; i < 16; i++) V[i] = i < view.length() ? F(view.a->data[i]) : (i % 5 == 0 ? 1.0f : 0.0f);
    sceGuSync(GU_SYNC_FINISH, GU_SYNC_WHAT_DONE);   // the last 3D list is done with list3d (gu_psp.cpp's frame waited for the GE already)
    sceGuStart(GU_DIRECT, list3d);
    sceGuDrawBufferList(GU_PSM_5650, (void*)t->off, t->tex.stride);
    sceGuDepthBuffer((void*)(t->off + (uint32_t)t->tex.stride * t->h * 2), t->tex.stride);
    sceGuOffset(2048 - t->w / 2, 2048 - t->h / 2);
    sceGuViewport(2048, 2048, t->w, t->h);
    sceGuScissor(0, 0, t->w, t->h);
    sceGuDepthRange(65535, 0);
    sceGuDepthFunc(GU_GEQUAL);
    sceGuEnable(GU_DEPTH_TEST);
    sceGuDepthMask(GU_FALSE);
    sceGuEnable(GU_CLIP_PLANES);
    sceGuFrontFace(GU_CCW);   // the front faces are counter-clockwise, as in the software renderer
    sceGuShadeModel(GU_SMOOTH);
    sceGuDisable(GU_BLEND);
    sceGuEnable(GU_LIGHTING);   // always: an unlit draw is a white ambient and no light
    sceGuClearColor(abgr(clear));
    sceGuClearDepth(0);
    sceGuClear(GU_COLOR_BUFFER_BIT | GU_DEPTH_BUFFER_BIT);
    sceGuSetMatrix(GU_PROJECTION, (const ScePspFMatrix4*)P);
    sceGuSetMatrix(GU_VIEW, (const ScePspFMatrix4*)V);
    sceGuTexFlush();
    blendOn = -1; cullOn = -1; litOn = -1;
  }
  int blendOn = -1, cullOn = -1, litOn = -1;

  void lights(bool lit) {
    const int want = lit ? 1 : 0;
    if (want == litOn) return;   // lit draws of a frame share its lights
    litOn = want;
    if (!lit) { sceGuAmbient(0xFFFFFFFFu); for (int i = 0; i < 4; i++) sceGuDisable(GU_LIGHT0 + i); return; }
    sceGuAmbient(abgrf(amb, 1));
    for (int i = 0; i < 4; i++) {
      if (i >= nl) { sceGuDisable(GU_LIGHT0 + i); continue; }
      const ScePspFVector3 to = {-ld[i][0], -ld[i][1], -ld[i][2]};   // towards the light, in world space (the GE takes it through the view)
      sceGuLight(i, GU_DIRECTIONAL, GU_DIFFUSE_AND_SPECULAR, &to);
      sceGuLightColor(i, GU_AMBIENT, 0xFF000000u);
      sceGuLightColor(i, GU_DIFFUSE, abgrf(lc[i], 1));
      sceGuLightColor(i, GU_SPECULAR, abgrf(lc[i], 1));
      sceGuEnable(GU_LIGHT0 + i);
    }
  }

  void draw(int32_t id, Array<N> model, uint32_t color, int32_t tex, int32_t flags) override {
    Mesh* m = meshes.at(id);
    GMesh* g = gmesh(id);
    if (!m || !g || !gcur) return;
    const int bl = (flags >> 6) & 3;
    const uint32_t alpha = (flags >> 8) & 255;
    if ((bl == ALPHA || bl == ADD) && !alpha) return;
    float M[16];
    for (int i = 0; i < 16; i++) M[i] = i < model.length() ? F(model.a->data[i]) : (i % 5 == 0 ? 1.0f : 0.0f);
    lights(!(flags & UNLIT));
    // the material: the vertex colours or the draw's colour as ambient and diffuse, the specular reflection (three.js's factor, clamped), the
    // emissive colour; the specular power
    float sc[3];
    for (int i = 0; i < 3; i++) sc[i] = spec[i] * specK;
    sceGuColorMaterial((flags & VCOL) && m->col ? GU_AMBIENT | GU_DIFFUSE : 0);
    sceGuModelColor(abgrf(emit, 255), abgr(color), abgr(color), (flags & UNLIT) || !specOn() ? 0xFF000000u : abgrf(sc, 1));
    if (specOn()) sceGuSpecular(shin);
    GuTex* tx = nullptr;
    int32_t tw = 0, th = 0;
    if (tex >= 0 && m->uv) tx = (GuTex*)zn::ff::texture(tex, &tw, &th);
    if (tx) {
      const int f = (flags >> 4) & 3;
      sceGuEnable(GU_TEXTURE_2D);
      sceGuTexMode(tx->psm, 0, 0, 0);
      sceGuTexImage(0, tx->tw, tx->th, tx->stride, tx->mem);
      sceGuTexFunc(GU_TFX_MODULATE, GU_TCC_RGB);
      sceGuTexFilter(f == 1 ? GU_NEAREST : GU_LINEAR, f == 1 ? GU_NEAREST : GU_LINEAR);
      sceGuTexScale((float)tw / tx->tw, (float)th / tx->th);   // uv over the image, inside its power-of-two texture
      sceGuTexOffset(0, 0);
      const bool whole = tw == tx->tw && th == tx->th;   // a power-of-two image repeats, as in the software renderer
      sceGuTexWrap(whole ? GU_REPEAT : GU_CLAMP, whole ? GU_REPEAT : GU_CLAMP);
      sceGuTexFlush();
    } else sceGuDisable(GU_TEXTURE_2D);
    // blending (ZN-696): over or added with the draw's opacity, depth tested, no depth written
    const int b = bl == ALPHA || bl == ADD ? bl : 0;
    if (b) sceGuBlendFunc(GU_ADD, GU_FIX, GU_FIX, alpha * 0x010101u, b == ALPHA ? (255 - alpha) * 0x010101u : 0xFFFFFFu);
    if (b != blendOn) { if (b) { sceGuEnable(GU_BLEND); sceGuDepthMask(GU_TRUE); } else { sceGuDisable(GU_BLEND); sceGuDepthMask(GU_FALSE); } blendOn = b; }
    const int c = flags & DOUBLE ? 0 : 1;
    if (c != cullOn) { if (c) sceGuEnable(GU_CULL_FACE); else sceGuDisable(GU_CULL_FACE); cullOn = c; }
    sceGuSetMatrix(GU_MODEL, (const ScePspFMatrix4*)M);
    const bool fl = flags & FLAT;
    const GVtx* v = fl ? flat(m, g) : g->v;
    for (int32_t at = 0; at < m->ni; at += 65535) {   // a draw takes at most 65535 vertices
      const int32_t k = m->ni - at < 65535 ? m->ni - at : 65535;
      if (fl) sceGuDrawArray(GU_TRIANGLES, kVtype, k, nullptr, v + at);
      else sceGuDrawArray(GU_TRIANGLES, kVtype | GU_INDEX_16BIT, k, m->idx + at, v);
    }
    tris += m->ni / 3;
  }

  bool gpu() override { return true; }
  /** Sends the frame's list (the GE draws it while the program goes on; gu_psp.cpp's frame waits for it), with gu_psp.cpp's 2D state back. */
  int32_t end() override {
    if (!gcur) return 0;
    gcur = nullptr;
    sceGuDisable(GU_DEPTH_TEST); sceGuDisable(GU_LIGHTING); sceGuDisable(GU_CULL_FACE); sceGuDisable(GU_CLIP_PLANES); sceGuDisable(GU_TEXTURE_2D);
    sceGuDepthMask(GU_FALSE);
    sceGuEnable(GU_BLEND);
    sceGuBlendFunc(GU_ADD, GU_SRC_ALPHA, GU_ONE_MINUS_SRC_ALPHA, 0, 0);
    sceGuOffset(2048 - kScreenW / 2, 2048 - kScreenH / 2);
    sceGuViewport(2048, 2048, kScreenW, kScreenH);
    sceGuScissor(0, 0, kScreenW, kScreenH);
    sceGuShadeModel(GU_SMOOTH);
    sceGuTexWrap(GU_CLAMP, GU_CLAMP);
    sceGuTexScale(1, 1);
    sceGuTexOffset(0, 0);
    sceGuDrawBufferList(GU_PSM_8888, nullptr, 512);   // the screen's pixel format; the next sceGuStart (gu_psp.cpp's frame) sets its address again
    sceGuFinish();
    return tris;
  }
  void present(int32_t id, N x, N y, N w, N h) override {
    GTarget* t = gtargets.at(id);
    if (t && t->img >= 0) presentImage(t->img, x, y, w, h);
  }
};

Psp* psp;

}  // namespace

/** gu_psp.cpp's texture() asks first: the GE's picture of a zinc:3d target, by its runtime image. */
extern "C" const void* zn_3d_gpu_texture(int32_t id, int32_t* w, int32_t* h) {
  GTarget* t = psp ? psp->byImage(id) : nullptr;
  if (!t) return nullptr;
  *w = t->w; *h = t->h;
  return &t->tex;
}

/** The GE draws unless ZINC_PSP_GPU=0, the switch of the 2D path whose frame shows the picture. */
NativeRender3D* gpuRenderer() {
  const char* g = getenv("ZINC_PSP_GPU");
  if (g && *g == '0') return nullptr;
  static Psp p;
  p.rc = zrt::IMMORTAL;
  psp = &p;
  return &p;
}
