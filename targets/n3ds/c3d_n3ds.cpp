// Nintendo 3DS GPU path (ZN-469): the zinc:gfx command lists replayed on the PICA200 with citro3d (targets/console/ff_replay.h) into render
// targets that display transfers copy to the screens: the top screen's left eye, its right eye (stereoscopic 3D: the HAL's left frame opens
// the GPU frame, its right one closes it, so both eyes change together) and the bottom screen (the program's window, gfx.cpp hal_win_draw).
// The panels are portrait: Mtx_OrthoTilt turns them. Quads are two triangles of float vertices; TEV stage 0 gives the colour, the texture
// times the colour, or a coverage atlas's (A8: glyphs, shapes) coverage times the colour. Textures
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
enum Target { LEFT, RIGHT, BOTTOM };   // zn_c3d_draw's targets
constexpr u32 kTransfer = GX_TRANSFER_FLIP_VERT(0) | GX_TRANSFER_OUT_TILED(0) | GX_TRANSFER_RAW_COPY(0) | GX_TRANSFER_IN_FORMAT(GX_TRANSFER_FMT_RGBA8) |
                          GX_TRANSFER_OUT_FORMAT(GX_TRANSFER_FMT_RGBA8) | GX_TRANSFER_SCALING(GX_TRANSFER_SCALE_NO);
struct V { float x, y, u, v, r, g, b, a; };

C3D_RenderTarget* targets[3];
C3D_Mtx projs[3];
DVLB_s* dvlb;
shaderProgram_s program;
int projLoc;
V* pool;                    // linear memory, read by the GPU
uint32_t nv, runFirst;
bool ready, overflow, inFrame;

struct Tex { C3D_Tex t; int32_t w, h; uint32_t ver; bool ok; };
std::map<int32_t, Tex> texs;
Tex atlasTex[2], softTex[2];   // the coverage atlases (glyphs, shapes); a software frame per eye (a GPU frame may draw both)
uint8_t* atlasLinear[2];    // the atlases as rows (ff_replay writes there), tiled into atlasTex
bool atlasDirty[2];
uint32_t* softRows;         // the main surface's last software frame, 0x00RRGGBB
bool softValid;
int softLast = -1;          // the target whose texture holds softRows
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
  const Mode m = !t ? COLOUR : t == &atlasTex[0] || t == &atlasTex[1] ? GLYPH : TEXTURE;
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

extern "C" const void* zn_3d_gpu_texture(int32_t id, int32_t* w, int32_t* h) __attribute__((weak));   // zinc:3d's GPU picture
namespace zn::ff {
const void* texture(int32_t id, int32_t* w, int32_t* h) {
  if (zn_3d_gpu_texture) if (const void* t = zn_3d_gpu_texture(id, w, h)) return t;
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
  // the last column and row again beyond the image: the linear filter at its right and bottom edges reads them, as the raster clamps
  if (*w < tw) for (int32_t y = 0; y < *h; y++) dst[tiled(*w, y, tw)] = dst[tiled(*w - 1, y, tw)];
  if (*h < e.t.height) for (int32_t x = 0; x <= *w && x < tw; x++) dst[tiled(x, *h, tw)] = dst[tiled(x, *h - 1, tw)];
  C3D_TexFlush(&e.t);
  e.ver = ver; e.ok = true;
  return &e;
}
bool quads_pending() { return nv > 0; }
const void* atlas(int i) { return &atlasTex[i]; }
uint8_t* atlas_memory(int i) { return atlasLinear[i]; }
void atlas_written(int i, int32_t x0, int32_t y0, int32_t w, int32_t h) {
  uint8_t* dst = static_cast<uint8_t*>(atlasTex[i].t.data);
  for (int32_t y = y0; y < y0 + h; y++)
    for (int32_t x = x0; x < x0 + w; x++) dst[tiled(x, y, kAtlasW)] = atlasLinear[i][(size_t)y * kAtlasW + x];
  atlasDirty[i] = true;
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
void draw_quad4(const void* tex, bool linear, float x0, float y0, float x1, float y1, float u0, float v0, float u1, float v1, const uint32_t rgb[4], float a) {
  const uint32_t first = nv;
  draw_quad(tex, linear, x0, y0, x1, y1, u0, v0, u1, v1, rgb[0], a);
  if (nv == first) return;
  static const int corner[6] = {0, 2, 1, 1, 2, 3};   // the vertices' corners: x0 y0, x0 y1, x1 y0, x1 y0, x0 y1, x1 y1
  for (int i = 0; i < 6; i++) {
    V& v = pool[first + i];
    const uint32_t c = rgb[corner[i]];
    v.r = (float)(c >> 16 & 255) / 255; v.g = (float)(c >> 8 & 255) / 255; v.b = (float)(c & 255) / 255;
  }
}
}  // namespace zn::ff

extern "C" {
// Starts citro3d (after gfxInitDefault): false when memory is short; the HAL then keeps its software path.
bool zn_c3d_init(int32_t w, int32_t h) {
  if (!C3D_Init(C3D_DEFAULT_CMDBUF_SIZE)) return false;
  static const int dims[3][2] = {{kW, kH}, {kW, kH}, {320, 240}};
  static const gfxScreen_t screens[3] = {GFX_TOP, GFX_TOP, GFX_BOTTOM};
  static const gfx3dSide_t sides[3] = {GFX_LEFT, GFX_RIGHT, GFX_LEFT};
  for (int i = 0; i < 3; i++) {
    if (!(targets[i] = C3D_RenderTargetCreate(dims[i][1], dims[i][0], GPU_RB_RGBA8, -1))) return false;
    C3D_RenderTargetSetOutput(targets[i], screens[i], sides[i], kTransfer);
    Mtx_OrthoTilt(&projs[i], 0, dims[i][0], dims[i][1], 0, 0, 1, true);
  }
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
  softRows = static_cast<uint32_t*>(malloc((size_t)w * h * 4));
  if (!pool || !softRows) return false;
  for (int i = 0; i < 2; i++) {
    atlasLinear[i] = static_cast<uint8_t*>(calloc((size_t)zn::ff::kAtlasW, zn::ff::kAtlasH));
    if (!atlasLinear[i] || !make(atlasTex[i], zn::ff::kAtlasW, zn::ff::kAtlasH, GPU_A8)) return false;
  }
  for (Tex& t : softTex) if (!make(t, w, h, GPU_RGBA8)) return false;
  C3D_BufInfo* buf = C3D_GetBufInfo();
  BufInfo_Init(buf);
  BufInfo_Add(buf, pool, sizeof(V), 3, 0x210);
  C3D_DepthTest(false, GPU_ALWAYS, GPU_WRITE_COLOR);
  C3D_CullFace(GPU_CULL_NONE);
  C3D_AlphaBlend(GPU_BLEND_ADD, GPU_BLEND_ADD, GPU_SRC_ALPHA, GPU_ONE_MINUS_SRC_ALPHA, GPU_SRC_ALPHA, GPU_ONE_MINUS_SRC_ALPHA);
  static const char on[] = "n3ds c3d: on\n";
  hal_log(on, sizeof on - 1);
  ready = true;
  return true;
}

// Opens the GPU frame when none is: waits for the last one (its display transfers included), then the quads of every target of this frame go
// in one pool, submitted by zn_c3d_end.
void zn_c3d_begin(void) {
  if (!ready || inFrame) return;
  inFrame = C3D_FrameBegin(C3D_FRAME_SYNCDRAW);
  nv = runFirst = 0; overflow = false; curMode = NONE; cur = nullptr;
}
void zn_c3d_end(void);
// Submits the open frame (a left eye waiting for its right one included) and waits for it: the HAL reads the screens back for a shot.
void zn_c3d_wait(void) { zn_c3d_end(); zn_c3d_begin(); }
// Submits the open frame: the targets drawn are transferred to their screens and shown at the next vblank.
void zn_c3d_end(void) {
  if (!inFrame) return;
  flush();
  for (int i = 0; i < 2; i++) if (atlasDirty[i]) { C3D_TexFlush(&atlasTex[i].t); atlasDirty[i] = false; }
  GSPGPU_FlushDataCache(pool, nv * sizeof(V));
  C3D_FrameEnd(0);
  inFrame = false;
  if (overflow) { static bool told; if (!told) { told = true; static const char m[] = "n3ds c3d: a frame has more quads than the vertex pool: the rest is not drawn\n"; hal_log(m, sizeof m - 1); } }
}
// Stops citro3d before gfxExit: the open frame submitted, the GPU's work waited for, its threads and buffers released. Without it a console
// crashed on the way back to the Homebrew Launcher after a heavy run (a 3DS XL, 600 sprites).
void zn_c3d_fini(void) {
  if (!ready) return;
  zn_c3d_end();
  C3D_Fini();
  ready = false;
}
static void drawOn(int target) {
  flush();
  C3D_FrameDrawOn(targets[target]);
  C3D_FVUnifMtx4x4(GPU_VERTEX_SHADER, projLoc, &projs[target]);
}
static void fit(int target, int32_t w, int32_t h, float* K, float* OX, float* OY) {   // a whole factor, centred, as the software path shows it
  const int32_t sw = target == BOTTOM ? 320 : kW, sh = kH;
  const int32_t k0 = sw / w < sh / h ? sw / w : sh / h, k = k0 > 0 ? k0 : 1;
  *K = (float)k; *OX = (float)((sw - w * k) / 2); *OY = (float)((sh - h * k) / 2);
}

// The program's window on the bottom screen, from its command list: false when the replay cannot draw it (the runtime rasterizes it and
// hal_win_present shows the pixels).
bool zn_c3d_window(const HalCmdList* l, int32_t w, int32_t h) {
  if (!ready) return false;
  zn_c3d_begin();
  if (!zn::ff::drawable(&l, 1)) return false;
  drawOn(BOTTOM);
  float K, OX, OY;
  fit(BOTTOM, w, h, &K, &OX, &OY);
  zn::ff::replay(l, w, h, K, OX, OY);
  return true;
}

// The main surface's frame on `target` (LEFT, or RIGHT for the right eye): the replay when it draws every command, else the software frame
// as a texture. `always`: drawn even when nothing changed since the last frame (a stereo eye: the last frame was the other eye's). False when
// nothing was drawn (the screen keeps the last frame).
bool zn_c3d_draw(const HalFrame* f, int target, bool always) {
  if (!ready || (!always && (f->y1 <= f->y0 || f->x1 <= f->x0))) return false;
  const HalCmdList* lists[6];
  const int32_t n = f->frames ? f->frames(lists, 6) : 0;
  float K, OX, OY;
  fit(target, f->w, f->h, &K, &OX, &OY);
  zn_c3d_begin();
  const uint64_t t0 = svcGetSystemTick();   // after the wait for the GPU's last frame: the replay's CPU time, ZINC_PROFILE's raster
  auto done = [&] { zrt_prof_band(0, t0 * 1000000ull / SYSCLOCK_ARM11, svcGetSystemTick() * 1000000ull / SYSCLOCK_ARM11); return true; };
  if (n > 0 && zn::ff::drawable(lists, n)) {
    drawOn(target);
    for (int32_t i = 0; i < n; i++) zn::ff::replay(lists[i], f->w, f->h, K, OX, OY);
    softValid = false;
    return done();
  }
  // software: the damaged rows into softRows (all of them when the last frame was the GPU's), tiled into this target's texture (all rows when
  // it last showed another frame than softRows)
  int32_t y0 = f->y0, y1 = f->y1;
  if (!softValid || !f->render_damage) { y0 = 0; y1 = f->h; f->render(softRows, 0, f->h); }
  else if (y1 > y0) f->render_damage(softRows + (size_t)y0 * f->w, y0, y1);
  if (softLast != target) { y0 = 0; y1 = f->h; }
  Tex& st = softTex[target];
  uint32_t* dst = static_cast<uint32_t*>(st.t.data);
  for (int32_t y = y0; y < y1; y++)
    for (int32_t x = 0; x < f->w; x++) dst[tiled(x, y, st.t.width)] = softRows[(size_t)y * f->w + x] << 8 | 0xFF;
  C3D_TexFlush(&st.t);
  softValid = true; softLast = target;
  drawOn(target);
  zn::ff::full(&st, f->w, f->h, K, OX, OY);
  return done();
}
}

// zinc:3d (plugins/3d/native/render3d.n3ds.cpp) draws its target inside the frame when the replay first asks for its picture: the quads queued
// before it go first, and the replay's shader and fixed state are set again after it.
extern "C" void zn_c3d_yield(void) { flush(); curMode = NONE; cur = nullptr; }
extern "C" void zn_c3d_resume(void) {
  C3D_BindProgram(&program);
  C3D_DepthTest(false, GPU_ALWAYS, GPU_WRITE_COLOR);
  C3D_CullFace(GPU_CULL_NONE);
  C3D_AlphaBlend(GPU_BLEND_ADD, GPU_BLEND_ADD, GPU_SRC_ALPHA, GPU_ONE_MINUS_SRC_ALPHA, GPU_SRC_ALPHA, GPU_ONE_MINUS_SRC_ALPHA);
}
