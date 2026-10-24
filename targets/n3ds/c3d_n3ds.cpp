// Nintendo 3DS GPU path (ZN-469): the zinc:gfx command lists replayed on the PICA200 with citro3d (targets/console/ff_replay.h) into a 240x400
// render target (the top panel is portrait: Mtx_OrthoTilt turns it) that a display transfer copies to the top screen. Quads are two triangles
// of float vertices; TEV stage 0 gives the colour, the texture times the colour, or the glyph atlas's coverage (A8) times the colour. Textures
// are tiled on the CPU (8x8 Morton tiles), power-of-two sides from 8 to 1024; a frame with a larger image is the software raster's, shown as one
// texture. Own batches rather than citro2d: the replay already batches and cuts its quads, citro2d would add its own vertex format and tint
// rules (multiply only in its newer tint modes) for no gain.
#include <string.h>

#include <map>

#include <3ds.h>
#include <citro3d.h>

#include "ff_replay.h"
#include "ff_shader_shbin.h"
#include "hal.h"
#include "zrt_raster.h"

extern "C" void zrt_prof_band(int32_t band, uint64_t t0, uint64_t t1);   // runtime/gfx.cpp: the raster phase of ZINC_PROFILE

using namespace zrt::raster;

namespace {
constexpr int32_t kW = 400, kH = 240, kMaxTex = 1024, kMaxQuads = 8192;
constexpr u32 kTransfer = GX_TRANSFER_FLIP_VERT(0) | GX_TRANSFER_OUT_TILED(0) | GX_TRANSFER_RAW_COPY(0) | GX_TRANSFER_IN_FORMAT(GX_TRANSFER_FMT_RGBA8) |
                          GX_TRANSFER_OUT_FORMAT(GX_TRANSFER_FMT_RGBA8) | GX_TRANSFER_SCALING(GX_TRANSFER_SCALE_NO);
struct V { float x, y, u, v, r, g, b, a; };

C3D_RenderTarget* top;
DVLB_s* dvlb;
shaderProgram_s program;
int projLoc;
C3D_Mtx proj;
V* pool;                    // linear memory, read by the GPU
uint32_t nv, runFirst;
bool ready, overflow, inFrame;

struct Tex { C3D_Tex t; int32_t w, h; uint32_t ver; bool ok; };
std::map<int32_t, Tex> texs;
Tex glyphTex, softTex;
uint8_t* glyphLinear;       // the atlas as rows (ff_replay writes there), tiled into glyphTex
bool glyphDirty;
uint32_t* softRows;         // the software frame, 0x00RRGGBB
bool softValid;
enum Mode { NONE, COLOUR, TEXTURE, GLYPH };
Mode curMode;
const Tex* cur;
bool curLinear;

int32_t pow2(int32_t v) { int32_t p = 8; while (p < v) p <<= 1; return p; }
// a texel's place in a tiled texture of width w: 8x8 tiles in rows, Morton order inside a tile
inline uint32_t tiled(int32_t x, int32_t y, int32_t w) {
  const uint32_t m = (x & 1) | (y & 1) << 1 | (x & 2) << 1 | (y & 2) << 2 | (x & 4) << 2 | (y & 4) << 3;
  return (uint32_t)((y >> 3) * (w >> 3) + (x >> 3)) * 64 + m;
}

void flush() {
  if (nv == runFirst) return;
  C3D_DrawArrays(GPU_TRIANGLES, (int)runFirst, (int)(nv - runFirst));
  runFirst = nv;
}
void state(const Tex* t, bool linear) {
  const Mode m = !t ? COLOUR : t == &glyphTex ? GLYPH : TEXTURE;
  if (m == curMode && t == cur && (!t || linear == curLinear)) return;
  flush();
  C3D_TexEnv* env = C3D_GetTexEnv(0);
  C3D_TexEnvInit(env);
  if (m == COLOUR) {
    C3D_TexEnvSrc(env, C3D_Both, GPU_PRIMARY_COLOR, GPU_PRIMARY_COLOR, GPU_PRIMARY_COLOR);
    C3D_TexEnvFunc(env, C3D_Both, GPU_REPLACE);
  } else if (m == GLYPH) {   // A8: the colour is the vertex's, the alpha the coverage times the vertex's
    C3D_TexEnvSrc(env, C3D_RGB, GPU_PRIMARY_COLOR, GPU_PRIMARY_COLOR, GPU_PRIMARY_COLOR);
    C3D_TexEnvFunc(env, C3D_RGB, GPU_REPLACE);
    C3D_TexEnvSrc(env, C3D_Alpha, GPU_TEXTURE0, GPU_PRIMARY_COLOR, GPU_PRIMARY_COLOR);
    C3D_TexEnvFunc(env, C3D_Alpha, GPU_MODULATE);
  } else {
    C3D_TexEnvSrc(env, C3D_Both, GPU_TEXTURE0, GPU_PRIMARY_COLOR, GPU_PRIMARY_COLOR);
    C3D_TexEnvFunc(env, C3D_Both, GPU_MODULATE);
  }
  if (t) {
    C3D_Tex* ct = const_cast<C3D_Tex*>(&t->t);
    const GPU_TEXTURE_FILTER_PARAM f = linear ? GPU_LINEAR : GPU_NEAREST;
    C3D_TexSetFilter(ct, f, f);
    C3D_TexBind(0, ct);
  }
  curMode = m; cur = t; curLinear = linear;
}
bool make(Tex& e, int32_t w, int32_t h, GPU_TEXCOLOR fmt) {
  if (!C3D_TexInit(&e.t, (u16)pow2(w), (u16)pow2(h), fmt)) return false;
  memset(e.t.data, 0, e.t.size);
  C3D_TexSetWrap(&e.t, GPU_CLAMP_TO_EDGE, GPU_CLAMP_TO_EDGE);
  e.w = w; e.h = h;
  return true;
}
}  // namespace

namespace zn::ff {
const void* texture(int32_t id, int32_t* w, int32_t* h) {
  if (!image_size(id, w, h) || *w <= 0 || *h <= 0 || *w > kMaxTex || *h > kMaxTex) return nullptr;
  Tex& e = texs[id];
  const uint32_t ver = image_version(id);
  if (e.ok && e.ver == ver && e.w == *w && e.h == *h) return &e;
  if (e.t.data && (e.w != *w || e.h != *h)) { C3D_TexDelete(&e.t); e.t.data = nullptr; }
  if (!e.t.data && !make(e, *w, *h, GPU_RGBA8)) { e.ok = false; return nullptr; }
  uint32_t* dst = static_cast<uint32_t*>(e.t.data);
  const int32_t tw = e.t.width;
  const uint32_t* px; int32_t pw, ph, ps;
  if (dyn_view(id, &px, &pw, &ph, &ps)) {   // 0xAARRGGBB -> the PICA's 0xRRGGBBAA, opaque when the image says it has no alpha
    const uint32_t opaque = dyn_alpha(id) ? 0 : 0xFFu;
    for (int32_t y = 0; y < *h; y++)
      for (int32_t x = 0; x < *w; x++) { const uint32_t c = px[(size_t)y * ps + x]; dst[tiled(x, y, tw)] = c << 8 | c >> 24 | opaque; }
  } else if (id >= 0 && id < image_count) {   // a baked image: R, G, B, A bytes
    const uint8_t* s = images[id].rgba;
    for (int32_t y = 0; y < *h; y++)
      for (int32_t x = 0; x < *w; x++, s += 4) dst[tiled(x, y, tw)] = (uint32_t)s[0] << 24 | (uint32_t)s[1] << 16 | (uint32_t)s[2] << 8 | s[3];
  } else { e.ok = false; return nullptr; }
  C3D_TexFlush(&e.t);
  e.ver = ver; e.ok = true;
  return &e;
}
const void* glyphs() { return &glyphTex; }
uint8_t* glyph_memory() { return glyphLinear; }
void glyphs_written(int32_t x0, int32_t y0, int32_t w, int32_t h) {
  uint8_t* dst = static_cast<uint8_t*>(glyphTex.t.data);
  for (int32_t y = y0; y < y0 + h; y++)
    for (int32_t x = x0; x < x0 + w; x++) dst[tiled(x, y, kGlyphW)] = glyphLinear[(size_t)y * kGlyphW + x];
  glyphDirty = true;
}
void draw_quad(const void* tex, bool linear, float x0, float y0, float x1, float y1, float u0, float v0, float u1, float v1, uint32_t rgb, float a) {
  if (nv + 6 > (uint32_t)kMaxQuads * 6) { overflow = true; return; }
  const Tex* t = static_cast<const Tex*>(tex);
  state(t, linear);
  // u, v over the image -> over the power-of-two texture, whose t runs from its last row in memory (0) to its first (1)
  const float su = t ? (float)t->w / t->t.width : 0, sv = t ? (float)t->h / t->t.height : 0;
  u0 *= su; u1 *= su; v0 = 1 - v0 * sv; v1 = 1 - v1 * sv;
  const float r = (float)(rgb >> 16 & 255) / 255, g = (float)(rgb >> 8 & 255) / 255, b = (float)(rgb & 255) / 255;
  V* v = pool + nv;
  v[0] = V{x0, y0, u0, v0, r, g, b, a}; v[1] = V{x0, y1, u0, v1, r, g, b, a}; v[2] = V{x1, y0, u1, v0, r, g, b, a};
  v[3] = V{x1, y0, u1, v0, r, g, b, a}; v[4] = V{x0, y1, u0, v1, r, g, b, a}; v[5] = V{x1, y1, u1, v1, r, g, b, a};
  nv += 6;
}
}  // namespace zn::ff

extern "C" {
uint64_t zn_c3d_cpu_us;   // the CPU time of the last frame's replay (or software raster)
// Starts citro3d (after gfxInitDefault): false when memory is short; the HAL then keeps its software path.
bool zn_c3d_init(int32_t w, int32_t h) {
  if (!C3D_Init(C3D_DEFAULT_CMDBUF_SIZE)) return false;
  top = C3D_RenderTargetCreate(kH, kW, GPU_RB_RGBA8, -1);
  if (!top) return false;
  C3D_RenderTargetSetOutput(top, GFX_TOP, GFX_LEFT, kTransfer);
  dvlb = DVLB_ParseFile((u32*)ff_shader_shbin, ff_shader_shbin_size);
  shaderProgramInit(&program);
  shaderProgramSetVsh(&program, &dvlb->DVLE[0]);
  C3D_BindProgram(&program);
  projLoc = shaderInstanceGetUniformLocation(program.vertexShader, "projection");
  C3D_AttrInfo* attr = C3D_GetAttrInfo();
  AttrInfo_Init(attr);
  AttrInfo_AddLoader(attr, 0, GPU_FLOAT, 2);   // x, y
  AttrInfo_AddLoader(attr, 1, GPU_FLOAT, 2);   // u, v
  AttrInfo_AddLoader(attr, 2, GPU_FLOAT, 4);   // r, g, b, a
  pool = static_cast<V*>(linearAlloc(sizeof(V) * 6 * kMaxQuads));
  glyphLinear = static_cast<uint8_t*>(malloc((size_t)zn::ff::kGlyphW * zn::ff::kGlyphH));
  softRows = static_cast<uint32_t*>(malloc((size_t)w * h * 4));
  if (!pool || !glyphLinear || !softRows || !make(glyphTex, zn::ff::kGlyphW, zn::ff::kGlyphH, GPU_A8) || !make(softTex, w, h, GPU_RGBA8)) return false;
  memset(glyphLinear, 0, (size_t)zn::ff::kGlyphW * zn::ff::kGlyphH);
  C3D_BufInfo* buf = C3D_GetBufInfo();
  BufInfo_Init(buf);
  BufInfo_Add(buf, pool, sizeof(V), 3, 0x210);
  Mtx_OrthoTilt(&proj, 0, kW, kH, 0, 0, 1, true);
  C3D_DepthTest(false, GPU_ALWAYS, GPU_WRITE_COLOR);
  C3D_CullFace(GPU_CULL_NONE);
  C3D_AlphaBlend(GPU_BLEND_ADD, GPU_BLEND_ADD, GPU_SRC_ALPHA, GPU_ONE_MINUS_SRC_ALPHA, GPU_SRC_ALPHA, GPU_ONE_MINUS_SRC_ALPHA);
  static const char on[] = "n3ds c3d: on\n";
  hal_log(on, sizeof on - 1);
  ready = true;
  return true;
}

// Waits for the GPU's last frame (its display transfer included): the HAL reads the screen back for a shot.
void zn_c3d_wait(void) {
  if (ready && !inFrame) inFrame = C3D_FrameBegin(C3D_FRAME_SYNCDRAW);
}

// One frame on the PICA200: the replay when it draws every command, else the software frame as a texture. False when nothing was drawn (the
// screen keeps the last frame).
bool zn_c3d_present(const HalFrame* f) {
  if (!ready || f->y1 <= f->y0 || f->x1 <= f->x0) return false;
  const HalCmdList* lists[6];
  const int32_t n = f->frames ? f->frames(lists, 6) : 0;
  const int32_t k0 = kW / f->w < kH / f->h ? kW / f->w : kH / f->h, k = k0 > 0 ? k0 : 1;
  const float K = (float)k, OX = (float)((kW - f->w * k) / 2), OY = (float)((kH - f->h * k) / 2);
  if (!inFrame) C3D_FrameBegin(C3D_FRAME_SYNCDRAW);
  inFrame = false;
  const uint64_t t0 = svcGetSystemTick();   // after the wait for the GPU's last frame
  C3D_FrameDrawOn(top);
  C3D_FVUnifMtx4x4(GPU_VERTEX_SHADER, projLoc, &proj);
  nv = runFirst = 0; overflow = false; curMode = NONE; cur = nullptr;
  if (n > 0 && zn::ff::drawable(lists, n)) {
    for (int32_t i = 0; i < n; i++) zn::ff::replay(lists[i], f->w, f->h, K, OX, OY);
    softValid = false;
  } else {   // software: the damaged rows (all of them when the last frame was the GPU's), tiled into the texture the quad shows
    int32_t y0 = f->y0, y1 = f->y1;
    if (!softValid || !f->render_damage) { y0 = 0; y1 = f->h; f->render(softRows, 0, f->h); }
    else f->render_damage(softRows + (size_t)y0 * f->w, y0, y1);
    uint32_t* dst = static_cast<uint32_t*>(softTex.t.data);
    for (int32_t y = y0; y < y1; y++)
      for (int32_t x = 0; x < f->w; x++) dst[tiled(x, y, softTex.t.width)] = softRows[(size_t)y * f->w + x] << 8 | 0xFF;
    C3D_TexFlush(&softTex.t);
    softValid = true;
    zn::ff::full(&softTex, f->w, f->h, K, OX, OY);
  }
  flush();
  if (glyphDirty) { C3D_TexFlush(&glyphTex.t); glyphDirty = false; }
  GSPGPU_FlushDataCache(pool, nv * sizeof(V));
  const uint64_t t1 = svcGetSystemTick();
  C3D_FrameEnd(0);
  zrt_prof_band(0, t0 * 1000000ull / SYSCLOCK_ARM11, t1 * 1000000ull / SYSCLOCK_ARM11);
  zn_c3d_cpu_us = (t1 - t0) * 1000000ull / SYSCLOCK_ARM11;
  if (overflow) { static bool told; if (!told) { told = true; static const char m[] = "n3ds c3d: a frame has more quads than the vertex pool: the rest is not drawn\n"; hal_log(m, sizeof m - 1); } }
  return true;
}
}
