// PS Vita GPU path (ZN-470, ZN-471; docs/reports/games/console-2d-3d-frameworks.md section 4.3): the zinc:gfx command lists replayed with GXM, one
// scene a frame at 960x544, three display buffers in CDRAM flipped by the display queue at vblank. The programs are SDL3's precompiled GXP
// (third_party/SDL3/src/render/vitagxm, zlib): a colour pair and a texture-times-colour pair, so users need no shader compiler and no module
// extracted from their console (vitaGL's libshacccg). What the replay draws: CLEAR, square RECTs of one colour, IMAGEs (atlas boxes, flips, tint,
// alpha, nearest or linear), TEXT of the glyph tables, rectangular CLIPs (cut on the CPU: exact, no stencil). A frame that holds anything else
// (rounded corners, gradients, borders, shadows, paths, matrices that turn) is rasterized in software into a texture the GPU shows scaled: the
// same pixels as before, without the CPU's doubling. Images and the glyph atlas live in CDRAM, uploaded once (again when a runtime image changes).
#include <psp2/display.h>
#include <psp2/gxm.h>
#include <psp2/kernel/clib.h>
#include <psp2/kernel/processmgr.h>
#include <psp2/kernel/sysmem.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include <map>

#include "SDL_render_vita_gxm_shaders.h"
#include "hal.h"
#include "zrt_raster.h"

extern "C" void zn_vita_log(const char* line);                       // hal_vita.cpp: the console's log and ux0:data/<id>/zinc.log
extern "C" void zrt_prof_band(int32_t band, uint64_t t0, uint64_t t1);  // runtime/gfx.cpp: the raster phase of ZINC_PROFILE

using namespace zrt::raster;

namespace {
constexpr unsigned kW = 960, kH = 544, kStride = 960, kBuffers = 3, kPool = 1u << 20, kGlyphW = 512, kGlyphH = 512;
struct V { float x, y, u, v, r, g, b, a; };
struct DisplayData { void* address; };

SceGxmContext* ctx;
SceGxmRenderTarget* target;
SceGxmShaderPatcher* patcher;
void* fbuf[kBuffers];
SceGxmColorSurface surf[kBuffers];
SceGxmSyncObject* sync[kBuffers];
SceGxmDepthStencilSurface depth;
SceGxmVertexProgram *vcol, *vtex;
SceGxmFragmentProgram *fcol, *ftex;
const SceGxmProgramParameter *wvpCol, *wvpTex;
float ortho[16];
uint16_t* quadIdx;        // 0 1 2 2 1 3 for each quad of a batch
V* pools[kBuffers];       // the vertices of a frame, one pool per display buffer: a pool is written again three frames later
uint32_t nq;              // quads written this frame
unsigned back, front;
SceClibMspace heap;       // textures in CDRAM
bool ready;

void say(const char* what, int err) { char b[160]; snprintf(b, sizeof b, "vita gxm: %s failed (0x%08X)\n", what, (unsigned)err); zn_vita_log(b); }

void* gpuAlloc(unsigned type, unsigned size, unsigned attribs) {
  size = type == SCE_KERNEL_MEMBLOCK_TYPE_USER_CDRAM_RW ? (size + 0x3FFFF) & ~0x3FFFFu : (size + 0xFFF) & ~0xFFFu;
  const SceUID uid = sceKernelAllocMemBlock("zinc gxm", type, size, nullptr);
  void* mem = nullptr;
  if (uid < 0 || sceKernelGetMemBlockBase(uid, &mem) < 0) { say("memory block", uid); return nullptr; }
  if (sceGxmMapMemory(mem, size, (SceGxmMemoryAttribFlags)attribs) < 0) { say("map memory", 0); return nullptr; }
  return mem;
}
void* usseAlloc(unsigned size, bool vertex, unsigned* offset) {
  size = (size + 0xFFF) & ~0xFFFu;
  const SceUID uid = sceKernelAllocMemBlock("zinc usse", SCE_KERNEL_MEMBLOCK_TYPE_USER_RW_UNCACHE, size, nullptr);
  void* mem = nullptr;
  if (uid < 0 || sceKernelGetMemBlockBase(uid, &mem) < 0) return nullptr;
  if ((vertex ? sceGxmMapVertexUsseMemory(mem, size, offset) : sceGxmMapFragmentUsseMemory(mem, size, offset)) < 0) return nullptr;
  return mem;
}
void* patcherHostAlloc(void*, unsigned size) { return malloc(size); }
void patcherHostFree(void*, void* p) { free(p); }
void displayCallback(const void* data) {
  SceDisplayFrameBuf fb;
  memset(&fb, 0, sizeof fb);
  fb.size = sizeof fb; fb.base = static_cast<const DisplayData*>(data)->address; fb.pitch = kStride;
  fb.pixelformat = SCE_DISPLAY_PIXELFORMAT_A8B8G8R8; fb.width = kW; fb.height = kH;
  static unsigned calls;
  static bool said;
  if (!said) { said = true; char b[96]; snprintf(b, sizeof b, "vita gxm display callback %u base=%p\n", ++calls, fb.base); zn_vita_log(b); }
  sceDisplaySetFrameBuf(&fb, SCE_DISPLAY_SETBUF_NEXTFRAME);
  sceDisplayWaitVblankStart();
}

// ---- textures: the images a frame draws, by image id, and one atlas of glyph coverage
struct Tex { SceGxmTexture t; void* mem; int32_t w, h; uint32_t ver; bool ok; };
std::map<int32_t, Tex> texs;
const Tex* texture(int32_t id) {
  Tex& e = texs[id];
  int32_t w, h;
  if (!image_size(id, &w, &h) || w <= 0 || h <= 0 || w > 4096 || h > 4096) return nullptr;
  const uint32_t ver = image_version(id);
  if (e.mem && e.ok && e.ver == ver && e.w == w && e.h == h) return &e;
  const uint32_t stride = ((uint32_t)w + 7) & ~7u;
  if (e.mem && (e.w != w || e.h != h)) { sceClibMspaceFree(heap, e.mem); e.mem = nullptr; }
  if (!e.mem) e.mem = sceClibMspaceMemalign(heap, SCE_GXM_TEXTURE_ALIGNMENT, stride * (uint32_t)h * 4);
  if (!e.mem) { e.ok = false; static bool told; if (!told) { told = true; zn_vita_log("vita gxm: out of video memory for images\n"); } return nullptr; }
  uint32_t* dst = static_cast<uint32_t*>(e.mem);
  SceGxmTextureFormat fmt;
  const uint32_t* px; int32_t pw, ph, ps;
  if (dyn_view(id, &px, &pw, &ph, &ps)) {   // 0xAARRGGBB, the alpha only when the image says it has one
    fmt = dyn_alpha(id) ? SCE_GXM_TEXTURE_FORMAT_U8U8U8U8_ARGB : SCE_GXM_TEXTURE_FORMAT_X8U8U8U8_1RGB;
    for (int32_t y = 0; y < h; y++) memcpy(dst + (size_t)y * stride, px + (size_t)y * ps, (size_t)w * 4);
  } else if (id >= 0 && id < image_count) {   // a baked image: R, G, B, A bytes
    fmt = SCE_GXM_TEXTURE_FORMAT_U8U8U8U8_ABGR;
    for (int32_t y = 0; y < h; y++) memcpy(dst + (size_t)y * stride, images[id].rgba + (size_t)y * w * 4, (size_t)w * 4);
  } else { e.ok = false; return nullptr; }
  e.ok = sceGxmTextureInitLinear(&e.t, e.mem, fmt, (unsigned)w, (unsigned)h, 0) >= 0;
  e.w = w; e.h = h; e.ver = ver;
  return e.ok ? &e : nullptr;
}

SceGxmTexture glyphTex, softTex;
uint8_t* glyphMem;
uint32_t* softMem;      // the software frame shown when the replay cannot draw a frame
int32_t softW, softH;
bool softValid;         // softMem holds the last software frame (render_damage may then draw only what changed)
uint32_t* softRows;     // the rows the rasterizer writes (cached memory: blends read it), copied to softMem
struct GSlot { int32_t font; uint32_t cp; int16_t x, y; };
GSlot gtab[4096];
int gx, gy, growH, gcount;
// A glyph's place in the atlas, uploaded on first use; null when the atlas is full. ponytail: never evicted, a reset when a program needs more
// than 512x512 of distinct glyphs is the upgrade.
const GSlot* glyph(int32_t font, uint32_t cp, const Glyph& g, const uint8_t* bitmap) {
  uint32_t h = ((uint32_t)font * 2654435761u) ^ (cp * 40503u);
  for (int probe = 0; probe < 4096; probe++, h++) {
    GSlot& s = gtab[h & 4095];
    if (s.font == font + 1 && s.cp == cp) return &s;
    if (s.font) continue;
    if (gcount >= 3072) return nullptr;
    const int w = g.w + 1, gh = g.h + 1;   // a texel of space between glyphs
    if (gx + w > (int)kGlyphW) { gx = 0; gy += growH; growH = 0; }
    if (gy + gh > (int)kGlyphH || w > (int)kGlyphW) return nullptr;
    for (int y = 0; y < g.h; y++) memcpy(glyphMem + (size_t)(gy + y) * kGlyphW + gx, bitmap + g.off + (size_t)y * g.w, g.w);
    s = GSlot{font + 1, cp, (int16_t)gx, (int16_t)gy};
    gx += w; if (gh > growH) growH = gh;
    gcount++;
    return &s;
  }
  return nullptr;
}
const Glyph* glyphOf(int32_t font, const Font& f, uint32_t cp) {   // raster.cpp glyph_of without its ASCII table
  if (font >= RUNTIME_FONT_BASE) return runtime_glyph(font, cp);
  int32_t lo = 0, hi = f.count - 1;
  while (lo <= hi) { const int32_t m = (lo + hi) >> 1; if (f.glyphs[m].cp == cp) return &f.glyphs[m]; if (f.glyphs[m].cp < cp) lo = m + 1; else hi = m - 1; }
  return nullptr;
}
uint32_t nextCp(const char* s, uint32_t n, uint32_t& i) {
  const uint8_t c = (uint8_t)s[i];
  const uint32_t w = c < 0x80 ? 1 : c < 0xE0 ? 2 : c < 0xF0 ? 3 : 4;
  uint32_t cp = c < 0x80 ? c : c < 0xE0 ? c & 0x1F : c < 0xF0 ? c & 0x0F : c & 0x07;
  for (uint32_t k = 1; k < w && i + k < n; k++) cp = (cp << 6) | ((uint8_t)s[i + k] & 0x3F);
  i += w;
  return cp;
}

// ---- the batch being built: consecutive quads of one program and texture
struct Batch { const SceGxmTexture* tex; bool linear; uint32_t first, count; };
Batch batches[1024];
uint32_t nb;
float K = 1, OX = 0, OY = 0;   // the program's surface to the screen: x' = OX + K x
struct Clip { float x0, y0, x1, y1; };
Clip clip;
bool overflow;

void quad(const SceGxmTexture* tex, bool linear, float x0, float y0, float x1, float y1, float u0, float v0, float u1, float v1, uint32_t rgb, float a) {
  // cut to the clip on the CPU, the texture coordinates with it: exact for the axis-aligned clips of zinc:gfx
  if (x0 < clip.x0) { u0 += (u1 - u0) * (clip.x0 - x0) / (x1 - x0); x0 = clip.x0; }
  if (x1 > clip.x1) { u1 -= (u1 - u0) * (x1 - clip.x1) / (x1 - x0); x1 = clip.x1; }
  if (y0 < clip.y0) { v0 += (v1 - v0) * (clip.y0 - y0) / (y1 - y0); y0 = clip.y0; }
  if (y1 > clip.y1) { v1 -= (v1 - v0) * (y1 - clip.y1) / (y1 - y0); y1 = clip.y1; }
  if (x0 >= x1 || y0 >= y1 || a <= 0) return;
  if (nq >= kPool / (4 * sizeof(V)) || nb >= 1024) { overflow = true; return; }
  if (!nb || batches[nb - 1].tex != tex || batches[nb - 1].linear != linear) batches[nb++] = Batch{tex, linear, nq, 0};
  batches[nb - 1].count++;
  V* v = pools[back] + nq++ * 4;
  const float r = (float)(rgb >> 16 & 255) / 255, g = (float)(rgb >> 8 & 255) / 255, b = (float)(rgb & 255) / 255;
  const float X0 = OX + K * x0, X1 = OX + K * x1, Y0 = OY + K * y0, Y1 = OY + K * y1;
  v[0] = V{X0, Y0, u0, v0, r, g, b, a}; v[1] = V{X1, Y0, u1, v0, r, g, b, a};
  v[2] = V{X0, Y1, u0, v1, r, g, b, a}; v[3] = V{X1, Y1, u1, v1, r, g, b, a};
}
float fl(float v) { const float i = (float)(int32_t)v; return i > v ? i - 1 : i; }
float ce(float v) { const float i = (float)(int32_t)v; return i < v ? i + 1 : i; }

// Whether every command of the lists is one the replay draws (else the frame is rasterized in software).
bool drawable(const HalCmdList* const* l, int32_t n) {
  for (int32_t k = 0; k < n; k++) {
    const Cmd* c = static_cast<const Cmd*>(l[k]->cmds);
    for (uint32_t i = 0; i < l[k]->count; i++) {
      const Cmd& m = c[i];
      switch (m.kind) {
        case CLEAR: case UNCLIP: break;
        case RECT: if (m.r > 0 || m.grad) return false; break;
        case CLIP: if (m.r > 0) return false; break;
        case TEXT: { const Font* f = font_at(m.res); if (f && f->count == 0 && m.res < font_count) return false; break; }   // an outline font the tables cannot read
        case IMAGE: if (image_radius(m) > 0 || image_blend(m) != BLEND_NORMAL || (m.pad & kImageLayer)) return false; break;
        default: return false;
      }
    }
  }
  return true;
}

void text(const Cmd& c, const char* s) {
  const Font* fp = font_at(c.res);
  if (!fp) return;
  const Font& f = *fp;
  // a baked font's ASCII glyphs go into the atlas at its first use, together: an emulator that caches textures (Vita3K) sees one upload
  static bool loaded[64];
  if (c.res >= 0 && c.res < 64 && !loaded[c.res]) {
    loaded[c.res] = true;
    for (int32_t i = 0; i < f.count; i++) if (f.glyphs[i].cp < 128 && f.glyphs[i].w && f.glyphs[i].h) glyph(c.res, f.glyphs[i].cp, f.glyphs[i], f.bitmap);
  }
  // raster.cpp draw_text: the pen in 26.6, glyphs on whole pixels, the baseline at the rounded y plus the ascent
  int32_t pen = (int32_t)fl(c.x * 64);
  const int32_t base = (int32_t)fl(c.y + 0.5f) + f.ascent, track = (int32_t)(c.s * 64);
  const float a = (float)c.alpha / 255;
  for (uint32_t i = 0; i < c.n;) {
    const uint32_t cp = nextCp(s, c.n, i);
    const Glyph* g = glyphOf(c.res, f, cp);
    if (!g && !ignorable_cp(cp)) g = glyphOf(c.res, f, '?');
    if (!g) continue;
    if (g->w && g->h) {
      const Font* bf = c.res >= RUNTIME_FONT_BASE ? font_at(c.res) : &f;
      if (const GSlot* s = glyph(c.res, cp, *g, bf->bitmap)) {
        const float gx = (float)(((pen + 32) >> 6) + g->x0), gy = (float)(base + g->y0);
        quad(&glyphTex, false, gx, gy, gx + g->w, gy + g->h, (float)s->x / kGlyphW, (float)s->y / kGlyphH, (float)(s->x + g->w) / kGlyphW,
             (float)(s->y + g->h) / kGlyphH, c.c1, a);
      }
    }
    pen += g->adv + track;
  }
}

void image(const Cmd& c) {
  if (!(c.w > 0 && c.h > 0 && c.w < 1e30f && c.h < 1e30f)) return;
  const Tex* t = texture(c.res);
  if (!t) return;
  const Box b = image_box(c);   // the box the whole image covers; what of it lies over the painted rectangle is drawn
  if (!(b.w != 0 && b.h != 0)) return;
  // the pixels the rasterizer paints: floor / ceil of the rectangle, within the box
  const float bx0 = b.w < 0 ? b.x + b.w : b.x, bx1 = b.w < 0 ? b.x : b.x + b.w, by0 = b.h < 0 ? b.y + b.h : b.y, by1 = b.h < 0 ? b.y : b.y + b.h;
  float x0 = fl(c.x), y0 = fl(c.y), x1 = ce(c.x + c.w), y1 = ce(c.y + c.h);
  if (fl(bx0) > x0) x0 = fl(bx0);
  if (fl(by0) > y0) y0 = fl(by0);
  if (ce(bx1) < x1) x1 = ce(bx1);
  if (ce(by1) < y1) y1 = ce(by1);
  if (x0 >= x1 || y0 >= y1) return;
  const float u0 = (x0 - b.x) / b.w, u1 = (x1 - b.x) / b.w, v0 = (y0 - b.y) / b.h, v1 = (y1 - b.y) / b.h;
  const bool whole = (b.w == (float)t->w || b.w == -(float)t->w) && (b.h == (float)t->h || b.h == -(float)t->h) && b.x == fl(b.x) && b.y == fl(b.y);
  quad(&t->t, !(c.grad == 1 || whole), x0, y0, x1, y1, u0, v0, u1, v1, image_tint(c), (float)c.alpha / 255);
}

void replay(const HalCmdList* l, int32_t w, int32_t h) {
  const Cmd* cmds = static_cast<const Cmd*>(l->cmds);
  Clip stack[16];
  int sp = 0;
  clip = Clip{0, 0, (float)w, (float)h};
  for (uint32_t i = 0; i < l->count; i++) {
    const Cmd& c = cmds[i];
    switch (c.kind) {
      case CLEAR: quad(nullptr, false, clip.x0, clip.y0, clip.x1, clip.y1, 0, 0, 0, 0, c.c1, 1); break;
      case RECT: {
        const float x0 = fl(c.x), y0 = fl(c.y), x1 = ce(c.x + c.w), y1 = ce(c.y + c.h);
        quad(nullptr, false, x0, y0, x1, y1, 0, 0, 0, 0, c.c1, (float)c.alpha / 255);
        break;
      }
      case TEXT: text(c, l->text + c.off); break;
      case IMAGE: image(c); break;
      case CLIP:
        if (sp < 16) {
          stack[sp++] = clip;
          const float x0 = fl(c.x), y0 = fl(c.y), x1 = ce(c.x + c.w), y1 = ce(c.y + c.h);
          clip = Clip{x0 > clip.x0 ? x0 : clip.x0, y0 > clip.y0 ? y0 : clip.y0, x1 < clip.x1 ? x1 : clip.x1, y1 < clip.y1 ? y1 : clip.y1};
        }
        break;
      case UNCLIP: if (sp > 0) clip = stack[--sp]; break;
      default: break;
    }
  }
}

void draw() {
  SceGxmTexture t;
  for (uint32_t i = 0; i < nb; i++) {
    const Batch& b = batches[i];
    void* uniforms;
    if (b.tex) {
      sceGxmSetVertexProgram(ctx, vtex);
      sceGxmSetFragmentProgram(ctx, ftex);
      sceGxmReserveVertexDefaultUniformBuffer(ctx, &uniforms);
      sceGxmSetUniformDataF(uniforms, wvpTex, 0, 16, ortho);
      t = *b.tex;
      const SceGxmTextureFilter filt = b.linear ? SCE_GXM_TEXTURE_FILTER_LINEAR : SCE_GXM_TEXTURE_FILTER_POINT;
      sceGxmTextureSetMinFilter(&t, filt); sceGxmTextureSetMagFilter(&t, filt);
      sceGxmTextureSetUAddrMode(&t, SCE_GXM_TEXTURE_ADDR_CLAMP); sceGxmTextureSetVAddrMode(&t, SCE_GXM_TEXTURE_ADDR_CLAMP);
      sceGxmSetFragmentTexture(ctx, 0, &t);
    } else {
      sceGxmSetVertexProgram(ctx, vcol);
      sceGxmSetFragmentProgram(ctx, fcol);
      sceGxmReserveVertexDefaultUniformBuffer(ctx, &uniforms);
      sceGxmSetUniformDataF(uniforms, wvpCol, 0, 16, ortho);
    }
    sceGxmSetVertexStream(ctx, 0, pools[back] + b.first * 4);
    sceGxmDraw(ctx, SCE_GXM_PRIMITIVE_TRIANGLES, SCE_GXM_INDEX_FORMAT_U16, quadIdx, b.count * 6);
  }
}
}  // namespace

extern "C" {
uint64_t zn_gxm_cpu_us;   // the CPU time of the last frame's replay (or software raster), for the HAL's frame times
#ifdef ZN_VITA_GXP_3D
// the 3D path (gxm_3d.cpp, ZN_VITA_GXP_3D) draws on this context: no second GXM context, no
// second display queue. Null when the 2D replay did not come up; the caller keeps its path.
extern "C" SceGxmContext* zn_gxm_3d_context(SceGxmRenderTarget** targetOut, SceGxmShaderPatcher** patcherOut, SceGxmDepthStencilSurface* depthOut) {
  if (!ready) return nullptr;
  if (targetOut) *targetOut = target;
  if (patcherOut) *patcherOut = patcher;
  if (depthOut) *depthOut = depth;
  return ctx;
}
extern "C" void zn_gxm_3d_draw(const float* mvp, const float* vbo, uint32_t vcount, const uint16_t* ibo, uint32_t icount);
// ZINC_VITA_3D_TRIS=1: one triangle of the smoketest's own vertex array, drawn after the 2D replay
// (the proof the pair loads and the draw entrypoint runs on the device; the HAL 2D path is unchanged).
static void draw3dTris() {
  static bool on;
  if (!on) {
    on = getenv("ZINC_VITA_3D_TRIS") && *getenv("ZINC_VITA_3D_TRIS") != '0';
    if (!on) return;
  }
  static const float mvp[16] = {1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1};
  static const float vbo[7 * 3] = {
    -0.5f, -0.5f, 0.0f, 1.0f, 0, 0, 1,
    0.5f, -0.5f, 0.0f, 0, 1.0f, 0, 1,
    0.0f, 0.5f, 0.0f, 0, 0, 1.0f, 1,
  };
  static const uint16_t ibo[3] = {0, 1, 2};
  zn_gxm_3d_draw(mvp, vbo, 3, ibo, 3);
}
#endif
// Starts GXM: false (with the reason on the log) when the console refuses something; the HAL then keeps its software path.
bool zn_gxm_init(int32_t w, int32_t h) {
  SceGxmInitializeParams ip;
  memset(&ip, 0, sizeof ip);
  ip.displayQueueMaxPendingCount = 2;
  ip.displayQueueCallback = displayCallback;
  ip.displayQueueCallbackDataSize = sizeof(DisplayData);
  ip.parameterBufferSize = SCE_GXM_DEFAULT_PARAMETER_BUFFER_SIZE;
  SceKernelFreeMemorySizeInfo fm;
  memset(&fm, 0, sizeof fm);
  fm.size = sizeof fm;
  sceKernelGetFreeMemorySize(&fm);
  char line[200];
  snprintf(line, sizeof line, "vita gxm: free memory: main %d KiB, cdram %d KiB, phycont %d KiB\n", fm.size_user >> 10, fm.size_cdram >> 10, fm.size_phycont >> 10);
  zn_vita_log(line);
  int err = sceGxmInitialize(&ip);
  if (err < 0) { say("sceGxmInitialize", err); return false; }
  const unsigned R = SCE_GXM_MEMORY_ATTRIB_READ, RW = SCE_GXM_MEMORY_ATTRIB_READ | SCE_GXM_MEMORY_ATTRIB_WRITE, U = SCE_KERNEL_MEMBLOCK_TYPE_USER_RW_UNCACHE;
  void* vdm = gpuAlloc(U, SCE_GXM_DEFAULT_VDM_RING_BUFFER_SIZE, R);
  void* vring = gpuAlloc(U, SCE_GXM_DEFAULT_VERTEX_RING_BUFFER_SIZE, R);
  void* fring = gpuAlloc(U, SCE_GXM_DEFAULT_FRAGMENT_RING_BUFFER_SIZE, R);
  unsigned fusseOff = 0;
  void* fusse = usseAlloc(SCE_GXM_DEFAULT_FRAGMENT_USSE_RING_BUFFER_SIZE, false, &fusseOff);
  if (!vdm || !vring || !fring || !fusse) return false;
  static SceGxmContextParams cp;
  memset(&cp, 0, sizeof cp);
  cp.hostMem = malloc(SCE_GXM_MINIMUM_CONTEXT_HOST_MEM_SIZE); cp.hostMemSize = SCE_GXM_MINIMUM_CONTEXT_HOST_MEM_SIZE;
  cp.vdmRingBufferMem = vdm; cp.vdmRingBufferMemSize = SCE_GXM_DEFAULT_VDM_RING_BUFFER_SIZE;
  cp.vertexRingBufferMem = vring; cp.vertexRingBufferMemSize = SCE_GXM_DEFAULT_VERTEX_RING_BUFFER_SIZE;
  cp.fragmentRingBufferMem = fring; cp.fragmentRingBufferMemSize = SCE_GXM_DEFAULT_FRAGMENT_RING_BUFFER_SIZE;
  cp.fragmentUsseRingBufferMem = fusse; cp.fragmentUsseRingBufferMemSize = SCE_GXM_DEFAULT_FRAGMENT_USSE_RING_BUFFER_SIZE; cp.fragmentUsseRingBufferOffset = fusseOff;
  if ((err = sceGxmCreateContext(&cp, &ctx)) < 0) { say("sceGxmCreateContext", err); return false; }
  SceGxmRenderTargetParams rp;
  memset(&rp, 0, sizeof rp);
  rp.width = kW; rp.height = kH; rp.scenesPerFrame = 1; rp.multisampleMode = SCE_GXM_MULTISAMPLE_NONE; rp.driverMemBlock = -1;
  if ((err = sceGxmCreateRenderTarget(&rp, &target)) < 0) { say("sceGxmCreateRenderTarget", err); return false; }
  for (unsigned i = 0; i < kBuffers; i++) {
    fbuf[i] = gpuAlloc(SCE_KERNEL_MEMBLOCK_TYPE_USER_CDRAM_RW, 4 * kStride * kH, RW);
    if (!fbuf[i]) return false;
    for (unsigned k = 0; k < kStride * kH; k++) static_cast<uint32_t*>(fbuf[i])[k] = 0xFF000000u;
    if ((err = sceGxmColorSurfaceInit(&surf[i], SCE_GXM_COLOR_FORMAT_U8U8U8U8_ABGR, SCE_GXM_COLOR_SURFACE_LINEAR, SCE_GXM_COLOR_SURFACE_SCALE_NONE,
                                      SCE_GXM_OUTPUT_REGISTER_SIZE_32BIT, kW, kH, kStride, fbuf[i])) < 0) { say("sceGxmColorSurfaceInit", err); return false; }
    if ((err = sceGxmSyncObjectCreate(&sync[i])) < 0) { say("sceGxmSyncObjectCreate", err); return false; }
    pools[i] = static_cast<V*>(gpuAlloc(U, kPool, R));
    if (!pools[i]) return false;
  }
  const unsigned aw = (kW + SCE_GXM_TILE_SIZEX - 1) & ~(SCE_GXM_TILE_SIZEX - 1), ah = (kH + SCE_GXM_TILE_SIZEY - 1) & ~(SCE_GXM_TILE_SIZEY - 1);
  void* dmem = gpuAlloc(U, 4 * aw * ah, RW);
  void* smem = gpuAlloc(U, 4 * aw * ah, RW);
  if (!dmem || !smem) return false;
  sceGxmDepthStencilSurfaceInit(&depth, SCE_GXM_DEPTH_STENCIL_FORMAT_S8D24, SCE_GXM_DEPTH_STENCIL_SURFACE_TILED, aw, dmem, smem);
  // the shader patcher and SDL's programs
  unsigned vuOff = 0, fuOff = 0;
  void* pbuf = gpuAlloc(U, 64 * 1024, RW);
  void* vu = usseAlloc(64 * 1024, true, &vuOff);
  void* fu = usseAlloc(64 * 1024, false, &fuOff);
  if (!pbuf || !vu || !fu) return false;
  SceGxmShaderPatcherParams pp;
  memset(&pp, 0, sizeof pp);
  pp.hostAllocCallback = patcherHostAlloc; pp.hostFreeCallback = patcherHostFree;
  pp.bufferMem = pbuf; pp.bufferMemSize = 64 * 1024;
  pp.vertexUsseMem = vu; pp.vertexUsseMemSize = 64 * 1024; pp.vertexUsseOffset = vuOff;
  pp.fragmentUsseMem = fu; pp.fragmentUsseMemSize = 64 * 1024; pp.fragmentUsseOffset = fuOff;
  if ((err = sceGxmShaderPatcherCreate(&pp, &patcher)) < 0) { say("sceGxmShaderPatcherCreate", err); return false; }
  SceGxmShaderPatcherId idVc, idFc, idVt, idFt;
  if (sceGxmProgramCheck(colorVertexProgramGxp) < 0 || sceGxmProgramCheck(colorFragmentProgramGxp) < 0 || sceGxmProgramCheck(textureVertexProgramGxp) < 0 ||
      sceGxmProgramCheck(textureFragmentProgramGxp) < 0) { say("sceGxmProgramCheck", 0); return false; }
  sceGxmShaderPatcherRegisterProgram(patcher, colorVertexProgramGxp, &idVc);
  sceGxmShaderPatcherRegisterProgram(patcher, colorFragmentProgramGxp, &idFc);
  sceGxmShaderPatcherRegisterProgram(patcher, textureVertexProgramGxp, &idVt);
  sceGxmShaderPatcherRegisterProgram(patcher, textureFragmentProgramGxp, &idFt);
  // one vertex layout for both pairs: x, y, u, v, r, g, b, a (the colour pair skips u, v)
  auto attr = [](SceGxmVertexAttribute& a, const SceGxmProgram* p, const char* name, unsigned offset, unsigned n) {
    a.streamIndex = 0; a.offset = (uint16_t)offset; a.format = SCE_GXM_ATTRIBUTE_FORMAT_F32; a.componentCount = (uint8_t)n;
    a.regIndex = (uint16_t)sceGxmProgramParameterGetResourceIndex(sceGxmProgramFindParameterByName(p, name));
  };
  SceGxmVertexStream stream;
  stream.stride = sizeof(V); stream.indexSource = SCE_GXM_INDEX_SOURCE_INDEX_16BIT;
  SceGxmVertexAttribute ca[2], ta[3];
  attr(ca[0], colorVertexProgramGxp, "aPosition", 0, 2); attr(ca[1], colorVertexProgramGxp, "aColor", 16, 4);
  attr(ta[0], textureVertexProgramGxp, "aPosition", 0, 2); attr(ta[1], textureVertexProgramGxp, "aTexcoord", 8, 2); attr(ta[2], textureVertexProgramGxp, "aColor", 16, 4);
  if ((err = sceGxmShaderPatcherCreateVertexProgram(patcher, idVc, ca, 2, &stream, 1, &vcol)) < 0) { say("colour vertex program", err); return false; }
  if ((err = sceGxmShaderPatcherCreateVertexProgram(patcher, idVt, ta, 3, &stream, 1, &vtex)) < 0) { say("texture vertex program", err); return false; }
  static const SceGxmBlendInfo blend = {SCE_GXM_COLOR_MASK_ALL, SCE_GXM_BLEND_FUNC_ADD, SCE_GXM_BLEND_FUNC_ADD, SCE_GXM_BLEND_FACTOR_SRC_ALPHA,
    SCE_GXM_BLEND_FACTOR_ONE_MINUS_SRC_ALPHA, SCE_GXM_BLEND_FACTOR_ONE, SCE_GXM_BLEND_FACTOR_ONE_MINUS_SRC_ALPHA};
  if ((err = sceGxmShaderPatcherCreateFragmentProgram(patcher, idFc, SCE_GXM_OUTPUT_REGISTER_FORMAT_UCHAR4, SCE_GXM_MULTISAMPLE_NONE, &blend, colorVertexProgramGxp, &fcol)) < 0) { say("colour fragment program", err); return false; }
  if ((err = sceGxmShaderPatcherCreateFragmentProgram(patcher, idFt, SCE_GXM_OUTPUT_REGISTER_FORMAT_UCHAR4, SCE_GXM_MULTISAMPLE_NONE, &blend, textureVertexProgramGxp, &ftex)) < 0) { say("texture fragment program", err); return false; }
  wvpCol = sceGxmProgramFindParameterByName(colorVertexProgramGxp, "wvp");
  wvpTex = sceGxmProgramFindParameterByName(textureVertexProgramGxp, "wvp");
  // SDL's orthographic matrix for (0, 960) x (544, 0): positions in screen pixels
  memset(ortho, 0, sizeof ortho);
  ortho[0x0] = 2.0f / kW; ortho[0xC] = -1; ortho[0x5] = -2.0f / kH; ortho[0xD] = 1; ortho[0xA] = -2; ortho[0xE] = 1; ortho[0xF] = 1;
  quadIdx = static_cast<uint16_t*>(gpuAlloc(U, 6 * 16384 * 2, R));
  if (!quadIdx) return false;
  for (unsigned q = 0; q < 16384 && q * 4 + 3 < 65536; q++) {
    uint16_t* p = quadIdx + q * 6;
    p[0] = (uint16_t)(q * 4); p[1] = (uint16_t)(q * 4 + 1); p[2] = (uint16_t)(q * 4 + 2); p[3] = (uint16_t)(q * 4 + 2); p[4] = (uint16_t)(q * 4 + 1); p[5] = (uint16_t)(q * 4 + 3);
  }
  // textures: the CDRAM left after the display buffers, less a reserve, up to 64 MiB
  sceKernelGetFreeMemorySize(&fm);
  unsigned heapSize = fm.size_cdram > (4 << 20) ? (unsigned)fm.size_cdram - (2 << 20) : 0;
  if (heapSize > (64u << 20)) heapSize = 64u << 20;
  heapSize &= ~0x3FFFFu;
  void* hmem = heapSize ? gpuAlloc(SCE_KERNEL_MEMBLOCK_TYPE_USER_CDRAM_RW, heapSize, RW) : nullptr;
  if (!hmem || !(heap = sceClibMspaceCreate(hmem, heapSize))) { say("the texture heap in CDRAM", (int)fm.size_cdram); return false; }
  glyphMem = static_cast<uint8_t*>(sceClibMspaceMemalign(heap, SCE_GXM_TEXTURE_ALIGNMENT, kGlyphW * kGlyphH));
  softW = w; softH = h;
  softMem = static_cast<uint32_t*>(sceClibMspaceMemalign(heap, SCE_GXM_TEXTURE_ALIGNMENT, (((unsigned)w + 7) & ~7u) * (unsigned)h * 4));
  softRows = static_cast<uint32_t*>(malloc((size_t)w * h * 4));
  if (!glyphMem || !softMem || !softRows) { say("the glyph atlas and software frame", 0); return false; }
  memset(glyphMem, 0, kGlyphW * kGlyphH);
  sceGxmTextureInitLinear(&glyphTex, glyphMem, SCE_GXM_TEXTURE_FORMAT_U8_R111, kGlyphW, kGlyphH, 0);   // coverage as alpha over white
  sceGxmTextureInitLinear(&softTex, softMem, SCE_GXM_TEXTURE_FORMAT_X8U8U8U8_1RGB, (unsigned)w, (unsigned)h, 0);
  // the program's surface on the screen: a whole factor, centred (a 480x272 surface doubled), as the software path shows it
  const int32_t k = (int32_t)kW / w < (int32_t)kH / h ? (int32_t)kW / w : (int32_t)kH / h;
  K = (float)(k > 0 ? k : 1); OX = (float)(((int32_t)kW - w * (int32_t)K) / 2); OY = (float)(((int32_t)kH - h * (int32_t)K) / 2);
  back = 0; front = kBuffers - 1;
  snprintf(line, sizeof line, "vita gxm: on, %dx%d shown x%d, %u KiB of CDRAM for textures\n", (int)w, (int)h, (int)K, heapSize >> 10);
  zn_vita_log(line);
  ready = true;
  return true;
}

// One frame on the GPU: the replay when it draws every command, else the software frame as a texture. Returns false when nothing was queued.
bool zn_gxm_present(const HalFrame* f) {
  if (!ready) return false;
  const bool changed = f->y1 > f->y0 && f->x1 > f->x0;
  if (!changed) return false;   // the screen keeps the last frame; the HAL waits for the vblank itself
  const uint64_t t0 = sceKernelGetProcessTimeWide();
  const HalCmdList* lists[6];
  const int32_t n = f->frames ? f->frames(lists, 6) : 0;
  nq = 0; nb = 0; overflow = false;
  if (n > 0 && drawable(lists, n)) {
    for (int32_t k = 0; k < n; k++) replay(lists[k], f->w, f->h);
    softValid = false;
  } else {   // software: the damaged rows (all of them when the last frame was the GPU's), copied into the texture the quad shows
    static bool told;
    if (!told) { told = true; zn_vita_log("vita gxm: a frame the replay does not draw (rounded, gradient, path or turned commands): rasterized in software\n"); }
    int32_t y0 = f->y0, y1 = f->y1;
    if (!softValid || !f->render_damage) { y0 = 0; y1 = f->h; f->render(softRows, 0, f->h); }
    else f->render_damage(softRows + (size_t)y0 * f->w, y0, y1);
    const uint32_t stride = ((uint32_t)f->w + 7) & ~7u;
    for (int32_t y = y0; y < y1; y++) memcpy(softMem + (size_t)y * stride, softRows + (size_t)y * f->w, (size_t)f->w * 4);
    softValid = true;
    clip = Clip{0, 0, (float)f->w, (float)f->h};
    quad(&softTex, false, 0, 0, (float)f->w, (float)f->h, 0, 0, 1, 1, 0xFFFFFF, 1);
  }
  if (overflow) { static bool told; if (!told) { told = true; zn_vita_log("vita gxm: a frame has more quads than the vertex pool: the rest is not drawn\n"); } }
  const uint64_t t1 = sceKernelGetProcessTimeWide();
  zrt_prof_band(0, t0, t1);
  zn_gxm_cpu_us = t1 - t0;
  static unsigned probe;   // ZINC_VITA_GPU_PROBE=1: two pixels of the buffer GXM drew, in the log (a device debug: 3 lines in 90 frames)
  if (getenv("ZINC_VITA_GPU_PROBE") && probe++ % 30 == 0) {
    char b[160];
    snprintf(b, sizeof b, "vita gxm probe: a %08x, b %08x, c %08x, lists %d, quads %u, batches %u, back %u (frame %u)\n",
      ((const uint32_t*)fbuf[0])[kH / 2 * kStride + kW / 2], ((const uint32_t*)fbuf[1])[kH / 2 * kStride + kW / 2],
      ((const uint32_t*)fbuf[2])[kH / 2 * kStride + kW / 2], (int)n, nq, nb, back, probe);
    zn_vita_log(b);
  }
  const int eBegin = sceGxmBeginScene(ctx, 0, target, nullptr, nullptr, sync[back], &surf[back], &depth);
  sceGxmSetViewport(ctx, kW / 2.0f, kW / 2.0f, kH / 2.0f, -(kH / 2.0f), 0.5f, 0.5f);   // SDL's viewport with its matrix: screen pixels in
  draw();
#ifdef ZN_VITA_GXP_3D
  draw3dTris();   // the smoketest's own proof triangle; other 3D callers drive the same entrypoint inside their begin/end scenes
#endif
  const int eEnd = sceGxmEndScene(ctx, nullptr, nullptr);
  const int ePad = sceGxmPadHeartbeat(&surf[back], sync[back]);
  DisplayData d = {fbuf[back]};
  const int eQueue = sceGxmDisplayQueueAddEntry(sync[front], sync[back], &d);
  front = back;
  back = (back + 1) % kBuffers;
  static bool said;
  if (getenv("ZINC_VITA_GPU_PROBE") && !said) {
    said = true;
    char b[160];
    snprintf(b, sizeof b, "vita gxm probe: begin %08x end %08x pad %08x queue %08x\n", (unsigned)eBegin, (unsigned)eEnd, (unsigned)ePad, (unsigned)eQueue);
    zn_vita_log(b);
  }
  return true;
}
}
