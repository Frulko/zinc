// zinc:3d on the PSP's GE (sceGu): the interface and the meshes of the software renderer (render3d.host.cpp, included below: the fallback,
// ZINC_PSP_GPU=0) drawn with the GE's own transform and lighting. A mesh is one vertex buffer in main memory built at meshCreate (texture,
// colour, normal, position; 16-bit indices), plus a de-indexed copy with face normals the first time it is drawn flat. A frame is its own display
// list, sent at end(): the target is a 16-bit (5650) colour buffer and a 16-bit depth buffer in VRAM after the two screen buffers of gu_psp.cpp;
// present() emits the IMAGE command of the target's runtime image as the software renderer does, and gu_psp.cpp's texture() takes the VRAM
// buffer through the zn_3d_gpu_texture hook below, so the 3D view composes in the 2D order without a read back. Lighting is the GE's: ambient
// plus up to 4 directional lights per vertex, specular per vertex (the GE's half vector with an infinite viewer), the emissive colour as the
// material's. The GE clamps the lit colour once (emissive + base x light), the software renderer clamps the light first: a lit colour brighter
// than white by both lights and ambient comes out a little brighter here. A World (worldMesh, worldDraw below) is drawn as Pocket Tokyo's PSP
// draws its city: 8 and 12-byte vertices, a sector's light as the ambient colour, a few words of list a range, two depth ranges, clut8 pictures
// whose palette is the day's and the night's mixed by the hour, and shadows in the top bit of the ground pictures' indices.
// ponytail: a frame whose 2D commands the replay cannot draw falls back to the software raster, which shows the target's runtime image (black)
// instead of the GE's picture; VRAM is a bump allocator (a target that grows leaks its last size unless it was the last one made).
#define ZRT_HOSTED_CPP   // the standard library's placement new, not zrt.h's: the pack's pictures come as a std::string
#define ZP_3D_GPU 1
#include "render3d.host.cpp"

#include <malloc.h>
#include <stdio.h>

#include <string>

#include "zn/zim.h"

#include <pspge.h>
#include <pspgu.h>
#include <pspkernel.h>

#include "ff_replay.h"

extern "C" void hal_log(const char* s, size_t n);   // hal_psp.cpp: the console log and zinc.log
bool zn_console_pack_read(const std::string& name, int kind, std::string& out) __attribute__((weak));   // targets/console/host_console.cpp

namespace {

// gu_psp.cpp's texture, as zn::ff::texture returns it and its replay reads it (keep the two in step)
struct GuTex { void* mem; int32_t w, h, stride, tw, th, psm; uint32_t ver; bool ok; };
struct GVtx { float u, v; uint32_t c; float nx, ny, nz, x, y, z; };
constexpr int kVtype = GU_TEXTURE_32BITF | GU_COLOR_8888 | GU_NORMAL_32BITF | GU_VERTEX_32BITF | GU_TRANSFORM_3D;
constexpr uint32_t kVramScreens = 2 * 512 * 272 * 4, kVram = 2 * 1024 * 1024;   // gu_psp.cpp's draw and display buffers, then ours
constexpr int32_t kScreenW = 480, kScreenH = 272;   // gu_psp.cpp's 2D state, set again at the end of a 3D list

struct GMesh { GVtx* v; GVtx* flat; int32_t nv, ni; };
struct GTarget { int32_t img, w, h, d; uint32_t* px; uint32_t off, bytes; GuTex tex; };

// 64-byte aligned, whole cache lines: sceGu writes the list through the uncached mirror, and a cached line it shared with a CPU-written static
// would be written back over its first commands on a real PSP (Pocket3D's finding; PPSSPP has no data cache)
// 256 KiB: a world's ranges are several hundred draws of about 150 bytes of state each (a 64 KiB list held about 450)
unsigned int __attribute__((aligned(64))) list3d[256 * 1024 / 4];
uint32_t vramTop = kVramScreens;

int32_t pow2(int32_t v) { int32_t p = 8; while (p < v) p <<= 1; return p; }
uint32_t abgr(uint32_t rgb) { return 0xFF000000u | (rgb & 0xFF) << 16 | (rgb & 0xFF00) | (rgb >> 16 & 0xFF); }
uint32_t abgrf(const float* c, float k) {   // 0..k floats -> the GE's 0xAABBGGRR
  uint32_t o = 0xFF000000u;
  for (int i = 0; i < 3; i++) { int32_t v = (int32_t)(c[i] / k * 255 + 0.5f); o |= (uint32_t)(v > 255 ? 255 : v < 0 ? 0 : v) << (8 * i); }
  return o;
}
void writeback(const void* p, size_t n) { sceKernelDcacheWritebackRange(p, (unsigned)n); }

// Where a render's time goes, logged every 600 renders: in this file (building the GE list), waiting for the GE, and the rest of the
// window from begin() to end() (the program: its scene walk and the calls into this module)
uint64_t now() { return sceKernelGetSystemTimeWide(); }
struct Times { uint64_t start = 0, native = 0, wait = 0, span = 0, shadows = 0; uint32_t n = 0; } times;   // shadows: of the module's, the sweep and its patch
struct Spend { uint64_t& acc; uint64_t t0; explicit Spend(uint64_t& a) : acc(a), t0(now()) {} ~Spend() { acc += now() - t0; } };

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
    if (id >= 0 && (id & kWorldMesh)) {   // a world's batch (worldMesh)
      if (WMesh* g = wm.at(id & ~kWorldMesh)) { sceGuSync(GU_SYNC_FINISH, GU_SYNC_WHAT_DONE); free(g->v); free(g->idx); mfree(g); wm.p[id & ~kWorldMesh] = nullptr; }
      return;
    }
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
    times.start = now();
    Spend spent(times.native);
    gcur = gtargets.at(id);
    if (!gcur) return;
    GTarget* t = gcur;
    tris = 0; nl = 0; amb[0] = amb[1] = amb[2] = 0;
    spec[0] = spec[1] = spec[2] = 0; emit[0] = emit[1] = emit[2] = 0;
    camera(nearN, farN, ortho);
    eyeOf(view);
    float P[16] = {0}, V[16];
    const float n = F(nearN), f = F(farN), asp = (float)t->w / t->h;
    if (ortho) { const float hh = F(proj); P[0] = 2 / (hh * asp); P[5] = 2 / hh; P[10] = -2 / (f - n); P[14] = -(f + n) / (f - n); P[15] = 1; }
    else { const float k = 1 / tanf(F(proj) * 0.5f); P[0] = k / asp; P[5] = k; P[10] = (f + n) / (n - f); P[11] = -1; P[14] = 2 * f * n / (n - f); }
    for (int i = 0; i < 16; i++) V[i] = i < view.length() ? F(view.a->data[i]) : (i % 5 == 0 ? 1.0f : 0.0f);
    memcpy(frameP, P, sizeof P); memcpy(frameV, V, sizeof V);
    fovY = F(proj); aspect = asp;
    { Spend waited(times.wait); sceGuSync(GU_SYNC_FINISH, GU_SYNC_WHAT_DONE); }   // the last 3D list is done with list3d (gu_psp.cpp's frame waited for the GE already)
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
    blendOn = -1; cullOn = -1; litOn = -1; fogLive = 0;
  }
  int blendOn = -1, cullOn = -1, litOn = -1, fogLive = 0;
  float frameP[16], frameV[16], fovY = 1, aspect = 1;   // the frame's projection and view (worldDraw sets its own and puts them back)

  // ------------------------------------------------ worlds, as Pocket Tokyo's PSP draws its city (TK/psp/src/gfx.rs, MIT)
  // A batch keeps the GE's own vertices: s16 positions over the batch's box (the model matrix places them, the eye subtracted on the CPU),
  // RGB565 colours, no normals: a draw's light is its sector's, the GE's ambient colour. Tops are 8 bytes, their uvs made from the position
  // by the texture matrix; walls 12 (u16 uvs, the stored s16 + 32768); the painted geometry 8. A range is then a few words of display list:
  // the vertex address when the batch changes, the ambient when the sector does, the index address and the primitive.
  struct V8 { uint16_t c; int16_t x, y, z; };
  struct V12 { uint16_t u, v, c; int16_t x, y, z; };
  static constexpr int kV8 = GU_COLOR_5650 | GU_VERTEX_16BIT | GU_INDEX_16BIT | GU_TRANSFORM_3D, kV12 = GU_TEXTURE_16BIT | kV8;
  static constexpr int32_t kWorldMesh = 1 << 30;   // the ids of these batches, apart from the meshes' (meshDestroy)
  /** Metres from the eye that split the cells into the near pass (depth 65535..16384) and the far one (16384..0, to the far plane):
   *  a 16-bit depth buffer over 12 km (gfx.rs DEPTH_SPLIT). */
  static constexpr float kSplit = 400;
  struct WMesh { void* v; uint16_t* idx; int32_t ni; bool uvs, fit; float o[3], s[3], us, tk[2], tb[2]; };
  Pool<WMesh> wm;

  // ---- clut8 pictures (include/zn/zim.h): the indices swizzled for the GE, the day's and the night's palettes, and the palette the GE reads,
  // the two mixed by how far the night has come in 64 steps (Pocket Tokyo's handheld.rs). A ground picture of at most 128 colours keeps the
  // upper half of its palette for the same colours in shadow, and the shadows set the top bit of its indices: where the sweep of the heights
  // (Engine::sweep) finds something between the texel and the light. Its place on the ground comes from the first top drawn with it.
  struct Pic { uint8_t* idx; int32_t w, h; uint32_t day[256], night[256]; uint32_t* clut; int32_t key; bool shade, placed; float ax, bx, az, bz;
               int16_t* col; float colX0, colStep; };   // col: the column of heights under each column of texels (-1: none), for that grid
  Pool<Pic> pics;
  std::string picNames;   // "name\n" a picture, in the order of pics
  int32_t picKey = -1;    // what the palettes were mixed for
  int32_t worldPicture(const char* path, uint32_t n) override {
    const std::string name(path, n);
    for (size_t at = 0, k = 0; at < picNames.size(); k++) {
      const size_t end = picNames.find('\n', at);
      if (picNames.compare(at, end - at, name) == 0) return kWorldPair | (int32_t)k;
      at = end + 1;
    }
    std::string zim;
    if (!zn_console_pack_read || !zn_console_pack_read(name, 1, zim) || zim.size() < zn::zim::kHeader || zim.compare(0, 4, "ZIM1")) return -1;
    const uint8_t* p = (const uint8_t*)zim.data();
    const int32_t w = (int32_t)rd32(p + 8), h = (int32_t)rd32(p + 12);
    // the GE's swizzled T8: a power of two from 16 x 8 to 512 x 512; another size or format is the runtime image's
    if (p[4] != 16 || w < 16 || h < 8 || w > 512 || h > 512 || (w & (w - 1)) || (h & (h - 1)) || zim.size() < zn::zim::kHeader + zn::zim::kClut8Palettes + (size_t)w * h) return -1;
    Pic* q = (Pic*)mem(sizeof(Pic));
    memset(q, 0, sizeof *q);
    q->w = w; q->h = h; q->key = -1;
    memcpy(q->day, p + zn::zim::kHeader, 1024); memcpy(q->night, p + zn::zim::kHeader + 1024, 1024);   // R, G, B, A: the GE's 0xAABBGGRR
    q->idx = (uint8_t*)memalign(16, (size_t)w * h);
    q->clut = (uint32_t*)memalign(64, 1024);
    const uint8_t* ix = p + zn::zim::kHeader + zn::zim::kClut8Palettes;
    uint8_t top = 0;
    for (int32_t y = 0; y < h; y++)   // blocks of 16 bytes x 8 rows, row by row
      for (int32_t x = 0; x < w; x++) { const uint8_t v = ix[(size_t)y * w + x]; top |= v; q->idx[swz(w, x, y)] = v; }
    q->shade = !(top & 0x80);
    writeback(q->idx, (size_t)w * h);
    picNames += name; picNames += '\n';
    sweep.dark = -1;   // a new ground picture: the next sweep patches it
    picKey = -1;       // and its palette is mixed
    return kWorldPair | pics.add(q);
  }
  static size_t swz(int32_t w, int32_t x, int32_t y) { return ((size_t)(y >> 3) * (size_t)(w >> 4) + (size_t)(x >> 4)) * 128 + (size_t)(y & 7) * 16 + (size_t)(x & 15); }
  /** The palettes the GE reads: day and night mixed by the night (64 steps), the shaded half `lit` of the lit (0..64). */
  void palettes(float night, int32_t lit) {
    const int32_t t = (int32_t)((night < 0 ? 0 : night > 1 ? 1 : night) * 64 + 0.5f), key = t * 65 + lit;
    if (key == picKey) return;
    picKey = key;
    for (int32_t i = 0; i < pics.n; i++) {
      Pic* q = pics.p[i];
      if (!q) continue;
      for (int k = 0; k < 256; k++) {
        const uint32_t d = q->day[k], n = q->night[k];
        uint32_t o = d & 0xFF000000u;
        for (int c = 0; c < 24; c += 8) { const int32_t a = (int32_t)(d >> c & 255), b = (int32_t)(n >> c & 255); o |= (uint32_t)(a + (b - a) * t / 64) << c; }
        q->clut[k] = o;
      }
      if (q->shade)
        for (int k = 0; k < 128; k++) {
          const uint32_t o = q->clut[k];
          q->clut[128 + k] = (o & 0xFF000000u) | ((o >> 16 & 255) * lit / 64) << 16 | ((o >> 8 & 255) * lit / 64) << 8 | (o & 255) * lit / 64;
        }
      writeback(q->clut, 1024);
    }
  }
  /** Where the sweep says a row of cells is in shade, the top bit of the ground pictures' texels over it. */
  void shadeRow(int32_t z, const uint16_t* top, const uint16_t* own) {
    const ShadowSweep& s = sweep;
    const uint32_t deep = (uint32_t)(0.5f / s.unit);   // half a metre under the shade's top: in it (the 3DS's map has 2 m of shades)
    const float zlo = s.z0 + z * s.step, zhi = zlo + s.step;
    for (int32_t i = 0; i < pics.n; i++) {
      Pic* q = pics.p[i];
      if (!q || !q->shade || !q->placed) continue;
      // the texel rows whose centres stand over the cells of row z: v = az world z + bz
      float v0 = q->az * zlo + q->bz, v1 = q->az * zhi + q->bz;
      if (v0 > v1) { const float t = v0; v0 = v1; v1 = t; }
      int32_t j0 = (int32_t)ceilf(v0 * q->h - 0.5f), j1 = (int32_t)ceilf(v1 * q->h - 0.5f);
      j0 = j0 < 0 ? 0 : j0; j1 = j1 > q->h ? q->h : j1;
      if (j0 >= j1) continue;
      if (!q->col || q->colX0 != s.x0 || q->colStep != s.step) {   // the cells under its texels' centres: u = ax world x + bx
        if (!q->col) q->col = (int16_t*)mem(2 * (size_t)q->w);
        q->colX0 = s.x0; q->colStep = s.step;
        for (int32_t x = 0; x < q->w; x++) {
          const int32_t c = (int32_t)floorf((((x + 0.5f) / q->w - q->bx) / q->ax - s.x0) / s.step);
          q->col[x] = (int16_t)(c >= 0 && c < s.w ? c : -1);
        }
      }
      for (int32_t j = j0; j < j1; j++) {
        uint8_t* row = q->idx + swz(q->w, 0, j);   // swizzled: 16 texels a block of 128 bytes
        for (int32_t x = 0; x < q->w; x++) {
          const int32_t c = q->col[x];
          uint8_t& t = row[(x >> 4) * 128 + (x & 15)];
          t = (uint8_t)((t & 0x7F) | (c >= 0 && top[c] > own[c] + deep ? 0x80 : 0));
        }
      }
      writeback(q->idx + (size_t)(j0 >> 3) * q->w * 8, (size_t)(((j1 - 1) >> 3) - (j0 >> 3) + 1) * q->w * 8);
    }
  }
  bool shadowsDrawn() const override { return true; }
  // the shadows off: the heights go (Engine::worldShadows), the shaded half of the palettes becomes the lit one (palettes(), the bits stay)
  void shadowsOn() override { picKey = -1; sweep.whole = false; }   // spread over frames from the first: no frame of a whole sweep
  void shadowsOff() override { picKey = -1; }

  bool worldSectorDraws() const override { return true; }
  float worldSplit() const override { return kSplit; }
  int32_t worldMesh(const uint8_t* r, const uint8_t* x, uint32_t nv, const uint8_t* ix, uint32_t ni) override {
    const uint32_t kind = rd32(r);
    WMesh* g = (WMesh*)mem(sizeof(WMesh));
    memset(g, 0, sizeof *g);
    for (int a = 0; a < 3; a++) { g->o[a] = rdf(r + 52 + 4 * a); g->s[a] = rdf(r + 64 + 4 * a); }
    g->us = rdf(r + 76);
    g->ni = (int32_t)ni;
    auto h = [&](uint32_t v, int k) { int16_t s; memcpy(&s, x + (size_t)v * zn::zworld::kVertex + 2 * k, 2); return s; };
    // a top's uvs as a line of its position (city-world.py makes them so): u from x, v from z, checked on every vertex; else kept
    if (kind == zn::zworld::Top) {
      g->fit = true;
      for (int a = 0; a < 2 && g->fit; a++) {
        const int p = a * 2, t = 3 + a;
        uint32_t lo = 0, hi = 0;
        for (uint32_t v = 1; v < nv; v++) { if (h(v, p) < h(lo, p)) lo = v; if (h(v, p) > h(hi, p)) hi = v; }
        const float d = (float)(h(hi, p) - h(lo, p)), k = d > 0 ? (h(hi, t) - h(lo, t)) / d : 0, b = h(lo, t) - k * h(lo, p);
        for (uint32_t v = 0; v < nv && g->fit; v++) g->fit = fabsf(k * h(v, p) + b - h(v, t)) * g->us < 1e-3f;
        g->tk[a] = k * 32768 * g->us; g->tb[a] = b * g->us;   // u = tk n + tb, n the GE's -1..1 of the s16
      }
    }
    g->uvs = kind == zn::zworld::Wall || (kind == zn::zworld::Top && !g->fit);
    const size_t vb = (g->uvs ? sizeof(V12) : sizeof(V8)) * nv;
    g->v = memalign(16, vb);
    for (uint32_t v = 0; v < nv; v++) {
      const uint8_t* c = x + (size_t)v * zn::zworld::kVertex + 10;
      const uint16_t col = (uint16_t)(c[0] >> 3 | (c[1] >> 2) << 5 | (c[2] >> 3) << 11);
      if (g->uvs) ((V12*)g->v)[v] = V12{(uint16_t)(h(v, 3) + 32768), (uint16_t)(h(v, 4) + 32768), col, h(v, 0), h(v, 1), h(v, 2)};
      else ((V8*)g->v)[v] = V8{col, h(v, 0), h(v, 1), h(v, 2)};
    }
    g->idx = (uint16_t*)memalign(16, 2 * (size_t)ni);
    memcpy(g->idx, ix, 2 * (size_t)ni);
    writeback(g->v, vb); writeback(g->idx, 2 * (size_t)ni);
    return kWorldMesh | wm.add(g);
  }

  /** The light of each sector: the frame's ambient plus its lights on the sector's normal, clamped (the software renderer's shade() of a
   *  wall), 16 what looks up, 17 a draw of several sectors (lit as what looks up, as Pocket's). */
  void sectorLights(uint32_t* out) const {
    for (int k = 0; k <= WORLD_MIXED; k++) {
      const float a = -3.14159265f + (k + 0.5f) * 6.2831853f / zn::zworld::kSectors;
      const float n[3] = {k < (int)zn::zworld::kSectors ? cosf(a) : 0, k < (int)zn::zworld::kSectors ? 0.0f : 1.0f, k < (int)zn::zworld::kSectors ? sinf(a) : 0};
      float c[3] = {amb[0], amb[1], amb[2]};
      for (int i = 0; i < nl; i++) {
        const float d = -(n[0] * ld[i][0] + n[1] * ld[i][1] + n[2] * ld[i][2]);
        if (d > 0) for (int j = 0; j < 3; j++) c[j] += d * lc[i][j];
      }
      for (int j = 0; j < 3; j++) c[j] = c[j] > 1 ? 1 : c[j];
      out[k] = abgrf(c, 1);
    }
  }
  static void projection(float* P, float fov, float asp, float n, float f) {
    memset(P, 0, 16 * sizeof(float));
    const float k = 1 / tanf(fov * 0.5f);
    P[0] = k / asp; P[5] = k; P[10] = (f + n) / (n - f); P[11] = -1; P[14] = 2 * f * n / (n - f);
  }

  /** The ranges worldSelect chose (by kind, then batch), the near pass and then the far one, each with its share of the depth buffer. The
   *  frame's projection, view and depth range are put back after. */
  void worldDraw(int32_t id) override {
    Spend spent(times.native);
    World* w = worlds.at(id);
    if (!w || !gcur) return;
    uint32_t light[WORLD_MIXED + 1];
    sectorLights(light);
    float sun[3], dark = 0;
    const bool shadowed = sweep.on() && sweep.world == id;
    if (shadowed) {   // 12 rows of a sweep a frame (about 2 s a sweep) when the light has turned by a degree
      Spend shading(times.shadows);
      ShadowSweep::light(nl, ld, lc, amb, sun, dark);
      if (dark >= 8) sweep.aim(sun, 0, 256);   // the shade's darkness is in the palettes, not the bits; none to see (the moon): no new sweep
      sweep.rows(12, [&](int32_t z, const uint16_t* top, const uint16_t* own) { shadeRow(z, top, own); });
    }
    palettes(w->dusk, shadowed ? (int32_t)((255 - dark) * 64 / 255 + 0.5f) : 64);
    sceGuEnable(GU_LIGHTING);
    for (int i = 0; i < 4; i++) sceGuDisable(GU_LIGHT0 + i);
    litOn = -1;
    sceGuColorMaterial(GU_AMBIENT);   // the vertex colour under the ambient light; the emissive colour is the batch's
    if (blendOn) { sceGuDisable(GU_BLEND); sceGuDepthMask(GU_FALSE); blendOn = 0; }
    if (fogOn && !fogLive) { sceGuEnable(GU_FOG); fogLive = 1; }
    sceGuTexFunc(GU_TFX_MODULATE, GU_TCC_RGB);
    sceGuTexFilter(GU_LINEAR, GU_LINEAR);
    float V[16];   // the view without the eye: a batch's model matrix carries where it is from the eye
    memcpy(V, frameV, sizeof V); V[12] = V[13] = V[14] = 0;
    sceGuSetMatrix(GU_VIEW, (const ScePspFMatrix4*)V);
    // the near pass ends past its farthest cell; the far one starts short of the split (a corner of the view sees a cell at 0.68 of its
    // distance in depth)
    float nearF = camN + 1;
    bool anyNear = false;
    for (int32_t i = 0; i < w->ni; i++) if (w->items[i].near) { anyNear = true; if (w->items[i].out > nearF) nearF = w->items[i].out; }
    if (nearF > camF) nearF = camF;
    const float farN = kSplit * 0.6f > camN ? kSplit * 0.6f : camN;
    for (int pass = anyNear ? 1 : 0; pass >= 0; pass--) {
      float P[16];
      if (camOrtho) memcpy(P, frameP, sizeof P);
      else projection(P, fovY, aspect, pass ? camN : farN, pass ? nearF : camF);
      sceGuSetMatrix(GU_PROJECTION, (const ScePspFMatrix4*)P);
      if (pass) sceGuDepthRange(65535, 16384); else sceGuDepthRange(anyNear ? 16384 : 65535, 0);
      worldPass(w, pass, light);
    }
    sceGuSetMatrix(GU_PROJECTION, (const ScePspFMatrix4*)frameP);
    sceGuSetMatrix(GU_VIEW, (const ScePspFMatrix4*)frameV);
    sceGuDepthRange(65535, 0);
    sceGuTexMapMode(GU_TEXTURE_COORDS, 0, 0);
  }
  void worldPass(World* w, int near, const uint32_t* light) {
    const WMesh* g = nullptr;
    const void* tex = nullptr;
    int32_t chunk = -1, batch = -1, vt = -1, sector = -1, kind = -1, since = 0;
    uint32_t em = 0xFFFFFFFFu;
    for (int32_t i = 0; i < w->ni; i++) {
      const WItem& it = w->items[i];
      if (it.near != near) continue;
      const WChunk& ch = w->k[it.chunk];
      if (!ch.loaded || it.batch >= ch.nb) continue;   // freed since the select
      const WBatch& b = ch.b[it.batch];
      if (it.chunk != chunk || it.batch != batch) {   // ---- a new batch: its vertices, place, picture, material
        chunk = it.chunk; batch = it.batch;
        g = (b.mesh & kWorldMesh) ? wm.at(b.mesh & ~kWorldMesh) : nullptr;
        if (!g) continue;
        const int t = g->uvs ? kV12 : kV8;
        if (t != vt) { sceGuSendCommandi(18, t); vt = t; }
        float M[16] = {0};
        for (int a = 0; a < 3; a++) { const float h = g->s[a] * (32768.0f / 65535.0f); M[a * 5] = h; M[12 + a] = g->o[a] + h - eye[a]; }
        M[15] = 1;
        sceGuSetMatrix(GU_MODEL, (const ScePspFMatrix4*)M);
        const bool pair = b.tex >= 0 && (b.tex & kWorldPair);   // its night in its palette: the glow mixed by the night too
        uint32_t e = w->night ? b.nemis : b.emis;
        if (pair) {
          const float t = w->dusk < 0 ? 0 : w->dusk > 1 ? 1 : w->dusk;
          e = 0;
          for (int c = 0; c < 24; c += 8) { const float a = (float)(b.emis >> c & 255), z = (float)(b.nemis >> c & 255); e |= (uint32_t)(a + (z - a) * t + 0.5f) << c; }
        }
        if (e != em) { sceGuModelColor(abgr(e), 0xFFFFFFFFu, 0xFFFFFFFFu, 0xFF000000u); em = e; }
        const int c = b.flags & DOUBLE ? 0 : 1;
        if (c != cullOn) { if (c) sceGuEnable(GU_CULL_FACE); else sceGuDisable(GU_CULL_FACE); cullOn = c; }
        int32_t tw = 0, th = 0;
        const int32_t ti = w->night && !pair ? b.ntex : b.tex;
        Pic* pic = pair ? pics.at(ti & ~kWorldPair) : nullptr;
        GuTex own;
        if (pic) { own = GuTex{pic->idx, pic->w, pic->h, pic->w, pic->w, pic->h, GU_PSM_T8, 0, true}; tw = pic->w; th = pic->h; }
        const GuTex* tx = pic ? &own : ti >= 0 && !pair ? (const GuTex*)zn::ff::texture(ti, &tw, &th) : nullptr;
        const int k = !tx ? 0 : g->uvs ? 2 : 1;   // no picture, a picture placed by the position, by the uvs
        if (k != kind) {
          if (!k) sceGuDisable(GU_TEXTURE_2D);
          else {
            sceGuEnable(GU_TEXTURE_2D);
            if (k == 1) { sceGuTexMapMode(GU_TEXTURE_MATRIX, 0, 0); sceGuTexProjMapMode(GU_POSITION); }
            else sceGuTexMapMode(GU_TEXTURE_COORDS, 0, 0);
          }
          kind = k;
        }
        if (tx) {
          if (tx->mem != tex) {
            const bool whole = tw == tx->tw && th == tx->th;   // a power-of-two image repeats, as in the software renderer
            if (pic) { sceGuClutMode(GU_PSM_8888, 0, 0xFF, 0); sceGuClutLoad(256 / 8, pic->clut); }
            sceGuTexMode(tx->psm, 0, 0, pic ? 1 : 0);   // a clut8 picture is swizzled
            sceGuTexImage(0, tx->tw, tx->th, tx->stride, tx->mem);
            sceGuTexWrap(whole ? GU_REPEAT : GU_CLAMP, whole ? GU_REPEAT : GU_CLAMP);
            sceGuTexFlush();
            tex = tx->mem;
          }
          const float fx = (float)tw / tx->tw, fy = (float)th / tx->th;   // uv over the image, inside its power-of-two texture
          if (k == 1) {
            if (pic && !pic->placed) {   // where the picture lies: u = ax x + bx, v = az z + bz (the s16 n of a coordinate is (x - o) 65535 / s - 32768)
              const float kx = g->tk[0] / 32768, kz = g->tk[1] / 32768;
              pic->ax = kx * 65535 / g->s[0]; pic->bx = g->tb[0] - kx * (32768 + g->o[0] * 65535 / g->s[0]);
              pic->az = kz * 65535 / g->s[2]; pic->bz = g->tb[1] - kz * (32768 + g->o[2] * 65535 / g->s[2]);
              pic->placed = pic->ax != 0 && pic->az != 0;
              if (pic->placed) sweep.dark = -1;   // the next sweep patches it
            }
            const float T[16] = {fx * g->tk[0], 0, 0, 0, 0, 0, 0, 0, 0, fy * g->tk[1], 0, 0, fx * g->tb[0], fy * g->tb[1], 1, 0};
            sceGuSetMatrix(GU_TEXTURE, (const ScePspFMatrix4*)T);
            sceGuTexScale(1, 1); sceGuTexOffset(0, 0);
          } else {   // the GE reads u16 / 32768: the stored s16 + 32768, so an offset of one whole scale
            const float su = fx * g->us * 32768, sv = fy * g->us * 32768;
            sceGuTexScale(su, sv); sceGuTexOffset(-su, -sv);
          }
        }
        sceGuSendCommandi(16, (int)(((uint32_t)(uintptr_t)g->v >> 8) & 0xF0000));   // the vertex address: BASE, VADDR
        sceGuSendCommandi(1, (int)((uint32_t)(uintptr_t)g->v & 0xFFFFFF));
      }
      if (!g) continue;
      if (it.sector != sector) { sector = it.sector; sceGuAmbient(light[sector]); }
      for (uint32_t from = it.from; from < it.to;) {   // a draw takes at most 65535 indices
        const uint32_t n = it.to - from < 65535 ? it.to - from : 65535;
        const uint16_t* at = g->idx + from;
        if (++since == 24) { since = 0; sceGuDrawArray(GU_TRIANGLES, 0, (int)n, at, nullptr); }   // also lets the GE read this far
        else {
          sceGuSendCommandi(16, (int)(((uint32_t)(uintptr_t)at >> 8) & 0xF0000));   // BASE, IADDR, PRIM
          sceGuSendCommandi(2, (int)((uint32_t)(uintptr_t)at & 0xFFFFFF));
          sceGuSendCommandi(4, (int)(GU_TRIANGLES << 16 | n));
        }
        from += n;
      }
      tris += (int32_t)(it.to - it.from) / 3;
    }
  }

  /** The GE's own fog, by view depth, for the rest of the list (end() turns it off). */
  void fog(uint32_t c, N nearN, N farN) override {
    Engine::fog(c, nearN, farN);
    if (!gcur) return;
    sceGuFog(fogN, fogF, abgr(c));
    sceGuEnable(GU_FOG);
    fogLive = 1;
  }

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
    Spend spent(times.native);
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
    if (fogOn) {   // a material without fog (bit 16) draws with the GE's fog off
      const int fo = flags & NOFOG ? 0 : 1;
      if (fo != fogLive) { if (fo) sceGuEnable(GU_FOG); else sceGuDisable(GU_FOG); fogLive = fo; }
    }
    const int c = flags & DOUBLE ? 0 : 1;
    if (c != cullOn) { if (c) sceGuEnable(GU_CULL_FACE); else sceGuDisable(GU_CULL_FACE); cullOn = c; }
    sceGuSetMatrix(GU_MODEL, (const ScePspFMatrix4*)M);
    const bool fl = flags & FLAT;
    const GVtx* v = fl ? flat(m, g) : g->v;
    const int32_t t0 = rFirst, ni = rangeCount(m);   // a range of the indices (worldDraw), else all
    for (int32_t at = 0; at < ni; at += 65535) {   // a draw takes at most 65535 vertices
      const int32_t k = ni - at < 65535 ? ni - at : 65535;
      if (fl) sceGuDrawArray(GU_TRIANGLES, kVtype, k, nullptr, v + t0 + at);
      else sceGuDrawArray(GU_TRIANGLES, kVtype | GU_INDEX_16BIT, k, m->idx + t0 + at, v);
    }
    tris += ni / 3;
  }

  bool gpu() override { return true; }
  /** Sends the frame's list (the GE draws it while the program goes on; gu_psp.cpp's frame waits for it), with gu_psp.cpp's 2D state back. */
  int32_t end() override {
    if (!gcur) return 0;
    raster::dyn_update(gcur->img, nullptr, 0);   // a new picture: the frame's diff redraws its box (the GPU writes no pixels the diff could see)
    gcur = nullptr;
    sceGuDisable(GU_DEPTH_TEST); sceGuDisable(GU_LIGHTING); sceGuDisable(GU_CULL_FACE); sceGuDisable(GU_CLIP_PLANES); sceGuDisable(GU_TEXTURE_2D);
    sceGuDisable(GU_FOG);
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
    times.span += now() - times.start;
    if (++times.n == 600) {
      char b[160];
      const double k = 1.0 / (1000.0 * times.n);
      const int len = snprintf(b, sizeof b, "psp 3d: %.2f ms a render: %.2f in the module (%.2f waiting for the GE), %.2f in the program, %d tris\n",
        times.span * k, times.native * k, times.wait * k, (times.span - times.native) * k, (int)tris);
      hal_log(b, (size_t)len);
      const struct mallinfo mi = mallinfo();   // the heap's bytes in use (the runtime's 16 MiB among them): with the core's own size, what a PSP-1000's 24 MiB must hold
      const int hl = snprintf(b, sizeof b, "psp heap: %.1f MB in use, %.1f MB taken; shadows %.2f ms a render\n", mi.uordblks / 1048576.0,
        mi.arena / 1048576.0, times.shadows * k);
      hal_log(b, (size_t)hl);
      times = Times{};
    }
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
