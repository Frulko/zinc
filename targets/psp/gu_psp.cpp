// PSP GPU path (ZN-468): the zinc:gfx command lists replayed on the GE with sceGu (targets/console/ff_replay.h), two 8888 buffers in VRAM
// (480x272, stride 512) swapped at vblank. Quads are GU_SPRITES in GU_TRANSFORM_2D (screen pixels, texel coordinates), float vertices so that a
// clipped or scaled image keeps its exact texels. Textures live in main memory (the GE reads it; one cache writeback per upload), at most
// 512x512 (the GE's limit): a frame with a larger image is the software raster's, shown as one texture. The coverage atlases (glyphs, shapes)
// are T8 with a CLUT of white at every alpha, modulated by the vertex colour.
// ponytail: linear textures (no swizzle) and one sceGuSync a frame (the CPU waits for the GE); swizzled atlases and a list built while the GE
// draws the last one are the upgrades when the hardware profile shows them.
#include <malloc.h>
#include <string.h>

#include <map>

#include <pspdisplay.h>
#include <pspgu.h>
#include <pspkernel.h>

#include "ff_replay.h"
#include "hal.h"
#include "zrt_raster.h"

extern "C" void zrt_prof_band(int32_t band, uint64_t t0, uint64_t t1);   // runtime/gfx.cpp: the raster phase of ZINC_PROFILE

using namespace zrt::raster;

namespace {
constexpr int32_t kW = 480, kH = 272, kStride = 512, kMaxTex = 512, kMaxQuads = 16384;
struct V { float u, v; uint32_t color; float x, y, z; };   // GU_TEXTURE_32BITF | GU_COLOR_8888 | GU_VERTEX_32BITF
constexpr int kVertex = GU_TEXTURE_32BITF | GU_COLOR_8888 | GU_VERTEX_32BITF | GU_TRANSFORM_2D;

unsigned int __attribute__((aligned(16))) list[256 * 1024 / 4];
V __attribute__((aligned(64))) pool[kMaxQuads * 2];
uint32_t nv, runFirst;      // vertices written this frame, the first of the run not drawn yet
bool ready, overflow;

struct Tex { void* mem; int32_t w, h, stride, tw, th, psm; uint32_t ver; bool ok; };
std::map<int32_t, Tex> texs;
Tex atlasTex[2], softTex;   // the coverage atlases (glyphs, shapes)
uint32_t __attribute__((aligned(16))) clut[256];   // T8 coverage -> white at that alpha
uint32_t* softRows;         // the software frame, 0x00RRGGBB
bool softValid;
const Tex* cur;             // the state of the run: its texture (null: colour) and filter
bool curLinear, curSet, curTris;   // curTris: the run is triangles (quads with a colour per corner), else sprites

int32_t pow2(int32_t v) { int32_t p = 8; while (p < v) p <<= 1; return p; }
void writeback(const void* p, size_t n) { sceKernelDcacheWritebackRange(p, (unsigned)n); }

bool alloc(Tex& e, int32_t w, int32_t h, int32_t bpp, int32_t psm) {
  e.stride = (w + 7) & ~7; e.tw = pow2(w); e.th = pow2(h); e.psm = psm; e.w = w; e.h = h;
  const size_t n = (size_t)e.stride * (h + 1) * bpp;   // a row below: the linear filter at the bottom edge reads it
  e.mem = memalign(16, n);
  if (e.mem) memset(e.mem, 0, n);
  return e.mem != nullptr;
}

void flush() {
  if (nv == runFirst) return;
  writeback(pool + runFirst, (nv - runFirst) * sizeof(V));
  sceGuDrawArray(curTris ? GU_TRIANGLES : GU_SPRITES, kVertex, (int)(nv - runFirst), nullptr, pool + runFirst);
  runFirst = nv;
}
void state(const Tex* t, bool linear, bool tris = false) {
  if (curSet && t == cur && (!t || linear == curLinear) && tris == curTris) return;
  flush();
  curTris = tris;
  if (curSet && t == cur && (!t || linear == curLinear)) return;
  curSet = true; cur = t; curLinear = linear;
  if (!t) { sceGuDisable(GU_TEXTURE_2D); return; }
  sceGuEnable(GU_TEXTURE_2D);
  if (t->psm == GU_PSM_T8) { sceGuClutMode(GU_PSM_8888, 0, 0xFF, 0); sceGuClutLoad(256 / 8, clut); }
  sceGuTexMode(t->psm, 0, 0, 0);
  sceGuTexImage(0, t->tw, t->th, t->stride, t->mem);
  sceGuTexFunc(GU_TFX_MODULATE, GU_TCC_RGBA);
  sceGuTexFilter(linear ? GU_LINEAR : GU_NEAREST, linear ? GU_LINEAR : GU_NEAREST);
  sceGuTexFlush();
}
}  // namespace

namespace zn::ff {
const void* texture(int32_t id, int32_t* w, int32_t* h) {
  if (!image_size(id, w, h) || *w <= 0 || *h <= 0 || *w > kMaxTex || *h > kMaxTex) return nullptr;
  Tex& e = texs[id];
  const uint32_t ver = image_version(id);
  if (e.mem && e.ok && e.ver == ver && e.w == *w && e.h == *h) return &e;
  if (e.mem && (e.w != *w || e.h != *h)) { free(e.mem); e.mem = nullptr; }
  if (!e.mem && !alloc(e, *w, *h, 4, GU_PSM_8888)) { e.ok = false; return nullptr; }
  uint32_t* dst = static_cast<uint32_t*>(e.mem);
  const uint32_t* px; int32_t pw, ph, ps;
  if (dyn_view(id, &px, &pw, &ph, &ps)) {   // 0xAARRGGBB -> the GE's 0xAABBGGRR, opaque when the image says it has no alpha
    const uint32_t opaque = dyn_alpha(id) ? 0 : 0xFF000000u;
    for (int32_t y = 0; y < *h; y++)
      for (int32_t x = 0; x < *w; x++) { const uint32_t c = px[(size_t)y * ps + x]; dst[(size_t)y * e.stride + x] = (c & 0xFF00FF00u) | (c & 0xFF) << 16 | (c >> 16 & 0xFF) | opaque; }
  } else if (id >= 0 && id < image_count) {   // a baked image: R, G, B, A bytes, the GE's order
    for (int32_t y = 0; y < *h; y++) memcpy(dst + (size_t)y * e.stride, images[id].rgba + (size_t)y * *w * 4, (size_t)*w * 4);
  } else { e.ok = false; return nullptr; }
  // the last column and row again beyond the image: the linear filter at its right and bottom edges reads them, as the raster clamps
  if (*w < e.stride) for (int32_t y = 0; y < *h; y++) dst[(size_t)y * e.stride + *w] = dst[(size_t)y * e.stride + *w - 1];
  memcpy(dst + (size_t)*h * e.stride, dst + (size_t)(*h - 1) * e.stride, (size_t)e.stride * 4);
  writeback(e.mem, (size_t)e.stride * (*h + 1) * 4);
  e.ver = ver; e.ok = true;
  return &e;
}
bool quads_pending() { return nv > 0; }
const void* atlas(int i) { return &atlasTex[i]; }
uint8_t* atlas_memory(int i) { return static_cast<uint8_t*>(atlasTex[i].mem); }
void atlas_written(int i, int32_t, int32_t y, int32_t, int32_t h) { writeback(atlas_memory(i) + (size_t)y * kAtlasW, (size_t)h * kAtlasW); }
void draw_quad(const void* tex, bool linear, float x0, float y0, float x1, float y1, float u0, float v0, float u1, float v1, uint32_t rgb, float a) {
  if (nv + 2 > (uint32_t)kMaxQuads * 2) { overflow = true; return; }
  const Tex* t = static_cast<const Tex*>(tex);
  state(t, linear);
  const uint32_t ai = (uint32_t)(a * 255 + 0.5f);
  const uint32_t color = (ai > 255 ? 255 : ai) << 24 | (rgb & 0xFF) << 16 | (rgb & 0xFF00) | (rgb >> 16 & 0xFF);
  const float sw = t ? (float)t->w : 0, sh = t ? (float)t->h : 0;
  pool[nv++] = V{u0 * sw, v0 * sh, color, x0, y0, 0};
  pool[nv++] = V{u1 * sw, v1 * sh, color, x1, y1, 0};
}
void draw_quad4(const void* tex, bool linear, float x0, float y0, float x1, float y1, float u0, float v0, float u1, float v1, const uint32_t rgb[4], float a) {
  if (nv + 6 > (uint32_t)kMaxQuads * 2) { overflow = true; return; }
  const Tex* t = static_cast<const Tex*>(tex);
  state(t, linear, true);   // a sprite has one colour: two triangles blend the corners'
  const uint32_t ai = (uint32_t)(a * 255 + 0.5f), al = (ai > 255 ? 255 : ai) << 24;
  uint32_t c[4];
  for (int i = 0; i < 4; i++) c[i] = al | (rgb[i] & 0xFF) << 16 | (rgb[i] & 0xFF00) | (rgb[i] >> 16 & 0xFF);
  const float sw = t ? (float)t->w : 0, sh = t ? (float)t->h : 0;
  const V tl{u0 * sw, v0 * sh, c[0], x0, y0, 0}, tr{u1 * sw, v0 * sh, c[1], x1, y0, 0}, bl{u0 * sw, v1 * sh, c[2], x0, y1, 0}, br{u1 * sw, v1 * sh, c[3], x1, y1, 0};
  pool[nv++] = tl; pool[nv++] = bl; pool[nv++] = tr;
  pool[nv++] = tr; pool[nv++] = bl; pool[nv++] = br;
}
}  // namespace zn::ff

extern "C" {
// Starts the GE: false when memory is short; the HAL then keeps its software path.
bool zn_gu_init(int32_t w, int32_t h) {
  for (Tex& a : atlasTex) if (!alloc(a, zn::ff::kAtlasW, zn::ff::kAtlasH, 1, GU_PSM_T8)) return false;
  if (!alloc(softTex, w, h, 4, GU_PSM_8888)) return false;
  softRows = static_cast<uint32_t*>(memalign(64, (size_t)w * h * 4));
  if (!softRows) return false;
  for (int i = 0; i < 256; i++) clut[i] = (uint32_t)i << 24 | 0xFFFFFFu;
  writeback(clut, sizeof clut);
  sceGuInit();
  sceGuStart(GU_DIRECT, list);
  sceGuDrawBuffer(GU_PSM_8888, (void*)0, kStride);
  sceGuDispBuffer(kW, kH, (void*)(kStride * kH * 4), kStride);
  sceGuOffset(2048 - kW / 2, 2048 - kH / 2);
  sceGuViewport(2048, 2048, kW, kH);
  sceGuScissor(0, 0, kW, kH);
  sceGuEnable(GU_SCISSOR_TEST);
  sceGuDisable(GU_DEPTH_TEST);
  sceGuShadeModel(GU_SMOOTH);
  sceGuEnable(GU_BLEND);
  sceGuBlendFunc(GU_ADD, GU_SRC_ALPHA, GU_ONE_MINUS_SRC_ALPHA, 0, 0);
  sceGuTexWrap(GU_CLAMP, GU_CLAMP);
  sceGuClearColor(0xFF000000u);
  sceGuClear(GU_COLOR_BUFFER_BIT);
  sceGuFinish();
  sceGuSync(GU_SYNC_FINISH, GU_SYNC_WHAT_DONE);
  sceDisplayWaitVblankStart();
  sceGuDisplay(GU_TRUE);
  static const char on[] = "psp gu: on\n";
  hal_log(on, sizeof on - 1);
  ready = true;
  return true;
}

// One frame on the GE: the replay when it draws every command, else the software frame as a texture. False when nothing was drawn (the
// screen keeps the last frame and the HAL does not swap).
bool zn_gu_present(const HalFrame* f) {
  if (!ready || f->y1 <= f->y0 || f->x1 <= f->x0) return false;
  const uint64_t t0 = sceKernelGetSystemTimeWide();
  const HalCmdList* lists[6];
  const int32_t n = f->frames ? f->frames(lists, 6) : 0;
  // the program's surface on the screen: a whole factor, centred, as the software path shows it
  const int32_t k0 = kW / f->w < kH / f->h ? kW / f->w : kH / f->h, k = k0 > 0 ? k0 : 1;
  const float K = (float)k, OX = (float)((kW - f->w * k) / 2), OY = (float)((kH - f->h * k) / 2);
  nv = runFirst = 0; overflow = false; curSet = false;
  sceGuStart(GU_DIRECT, list);
  if (n > 0 && zn::ff::drawable(lists, n)) {
    for (int32_t i = 0; i < n; i++) zn::ff::replay(lists[i], f->w, f->h, K, OX, OY);
    softValid = false;
  } else {   // software: the damaged rows (all of them when the last frame was the GE's), converted into the texture the sprite shows
    int32_t y0 = f->y0, y1 = f->y1;
    if (!softValid || !f->render_damage) { y0 = 0; y1 = f->h; f->render(softRows, 0, f->h); }
    else f->render_damage(softRows + (size_t)y0 * f->w, y0, y1);
    uint32_t* dst = static_cast<uint32_t*>(softTex.mem);
    for (int32_t y = y0; y < y1; y++) {   // 0x00RRGGBB -> 0xFFBBGGRR
      const uint32_t* s = softRows + (size_t)y * f->w;
      uint32_t* d = dst + (size_t)y * softTex.stride;
      for (int32_t x = 0; x < f->w; x++) { const uint32_t c = s[x]; d[x] = 0xFF000000u | (c & 0xFF) << 16 | (c & 0xFF00) | (c >> 16 & 0xFF); }
    }
    writeback(dst + (size_t)y0 * softTex.stride, (size_t)(y1 - y0) * softTex.stride * 4);
    softValid = true;
    zn::ff::full(&softTex, f->w, f->h, K, OX, OY);
  }
  flush();
  sceGuFinish();
  const uint64_t t1 = sceKernelGetSystemTimeWide();
  sceGuSync(GU_SYNC_FINISH, GU_SYNC_WHAT_DONE);
  zrt_prof_band(0, t0, t1);
  if (overflow) { static bool told; if (!told) { told = true; hal_log("psp gu: a frame has more quads than the vertex pool: the rest is not drawn\n", 74); } }
  return true;
}
void zn_gu_swap(void) { sceGuSwapBuffers(); }
}
