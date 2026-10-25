// zinc:3d on the PS Vita's GPU (GXM), beside the 2D replay of targets/vita/gxm_vita.cpp, on its context. The interface and the shading are
// the software renderer's (render3d.host.cpp, included below: the fallback and the oracle): lit per vertex, flat, unlit, vertex colours,
// specular and emissive, four directional lights and the ambient, computed per vertex on the CPU by Engine::shade into a colour stream of the
// draw, because the open GXP compiler (psp2spvc, targets/vita/shaders/README.md) compiles no branch, no division and no texture sampling and
// runs out of registers on the lighting. The GPU transforms (tex3d.vert), tests depth, culls, textures and blends (SDL's texture fragment
// program: texture x colour). Positions, uvs and indices live in GPU memory from meshCreate (a flat mesh gets one corner per triangle, made at
// its first flat draw). A target is a GXM colour surface with its own depth buffer, drawn in its own scene at begin()..end(); present() emits
// the IMAGE command of its runtime image as the software renderer does, and gxm_vita.cpp's texture() takes the surface itself through
// zn_3d_gpu_texture: the 3D frame is composed in the 2D order with no read back.
// ponytail: specular is per vertex (no fragment program to do it per pixel); textures filter nearest or linear (no mipmaps); a 2D frame that
// falls back to software shows the target's image black (its pixels never come back to the CPU).
#define ZP_3D_GPU 1
#include "render3d.host.cpp"

#include <psp2/gxm.h>
#include <stdio.h>

#include "SDL_render_vita_gxm_shaders.h"   // textureFragmentProgramGxp: texture x colour (third_party/SDL3, zlib)
#include "zn_gxp_tex3d.h"                  // the vertex program (targets/vita/shaders/tex3d.vert)

extern "C" {
// gxm_vita.cpp: its context, render target, patcher and depth surface (null when GXM did not start: the software renderer then); its CDRAM heap
SceGxmContext* zn_gxm_3d_context(SceGxmRenderTarget** target, SceGxmShaderPatcher** patcher, SceGxmDepthStencilSurface* depth) __attribute__((weak));
void* zn_gxm_alloc(uint32_t align, uint32_t size) __attribute__((weak));
void zn_gxm_free(void* p) __attribute__((weak));
void zn_vita_log(const char* line);
}
namespace zn::ff { const void* texture(int32_t image, int32_t* w, int32_t* h) __attribute__((weak)); }   // gxm_vita.cpp: an image as a GXM texture

namespace {
struct SV { float x, y, z, u, v; };   // the static stream: position, uv
struct VMesh { SV* vb; uint16_t* ib; SV* flat; };   // flat: the corners of each triangle, made at the first flat draw
struct VTarget { int32_t img, w, h, stride; uint32_t* px; void* color; void* depthMem; SceGxmRenderTarget* rt; SceGxmColorSurface surf;
                 SceGxmDepthStencilSurface depth; SceGxmTexture tex; };
constexpr uint32_t kRing = 3u << 20;   // the colour streams of the draws, written in a ring: a frame uses far less than a third of it
constexpr uint32_t kSeq = 65535;       // the sequential indices of the flat meshes' corners

void say(const char* what, int err) { char b[160]; snprintf(b, sizeof b, "vita gxm 3d: %s failed (0x%08X)\n", what, (unsigned)err); zn_vita_log(b); }
uint32_t align(uint32_t v, uint32_t a) { return (v + a - 1) & ~(a - 1); }

struct Vita : Engine {
  SceGxmContext* ctx = nullptr;
  SceGxmShaderPatcher* patcher = nullptr;
  SceGxmVertexProgram* vprog = nullptr;
  SceGxmFragmentProgram* fprog[3] = {};   // opaque, over, added
  const SceGxmProgramParameter* wvp = nullptr;
  Pool<VMesh> vmeshes;
  Pool<VTarget> vtargets;
  VTarget* vcur = nullptr;
  uint8_t* ring = nullptr;
  uint32_t ringAt = 0;
  uint16_t* seq = nullptr;
  SV* quad = nullptr;   // the clear: the whole target in clip space
  uint16_t* quadIdx = nullptr;
  SceGxmTexture white;
  bool told = false;
  int mode = 0;   // 0: not decided yet, 1: GXM, -1: the software renderer (GXM did not start)

  // The program loads zinc:3d before it opens its window (and the HAL starts GXM): the choice is made at the first target, or gpu().
  bool on() {
    if (!mode) { mode = open() ? 1 : -1; if (mode < 0) zn_vita_log("vita gxm 3d: off, drawing with the software renderer\n"); }
    return mode > 0;
  }
  bool open() {
    SceGxmRenderTarget* rt;
    SceGxmDepthStencilSurface ds;
    ctx = zn_gxm_3d_context ? zn_gxm_3d_context(&rt, &patcher, &ds) : nullptr;
    if (!ctx || !zn_gxm_alloc || !zn::ff::texture) return false;
    const SceGxmProgram* vp = reinterpret_cast<const SceGxmProgram*>(zn::vita::gxp3d::tex3dVertexProgramGxp);
    if (sceGxmProgramCheck(vp) < 0 || sceGxmProgramCheck(textureFragmentProgramGxp) < 0) { say("sceGxmProgramCheck", 0); return false; }
    SceGxmShaderPatcherId idv, idf;
    int err;
    if ((err = sceGxmShaderPatcherRegisterProgram(patcher, vp, &idv)) < 0 || (err = sceGxmShaderPatcherRegisterProgram(patcher, textureFragmentProgramGxp, &idf)) < 0) {
      say("the program registration", err); return false;
    }
    // stream 0: position and uv of the mesh (static); stream 1: the draw's shaded colours, 4 bytes a vertex
    auto attr = [vp](SceGxmVertexAttribute& a, unsigned stream, const char* name, unsigned offset, SceGxmAttributeFormat fmt, unsigned n) {
      a.streamIndex = (uint16_t)stream; a.offset = (uint16_t)offset; a.format = (uint8_t)fmt; a.componentCount = (uint8_t)n;
      a.regIndex = (uint16_t)sceGxmProgramParameterGetResourceIndex(sceGxmProgramFindParameterByName(vp, name));
    };
    SceGxmVertexAttribute attrs[3];
    attr(attrs[0], 0, "aPosition", 0, SCE_GXM_ATTRIBUTE_FORMAT_F32, 3);
    attr(attrs[1], 0, "aTexcoord", 12, SCE_GXM_ATTRIBUTE_FORMAT_F32, 2);
    attr(attrs[2], 1, "aColor", 0, SCE_GXM_ATTRIBUTE_FORMAT_U8N, 4);
    SceGxmVertexStream streams[2];
    streams[0].stride = sizeof(SV); streams[0].indexSource = SCE_GXM_INDEX_SOURCE_INDEX_16BIT;
    streams[1].stride = 4; streams[1].indexSource = SCE_GXM_INDEX_SOURCE_INDEX_16BIT;
    if ((err = sceGxmShaderPatcherCreateVertexProgram(patcher, idv, attrs, 3, streams, 2, &vprog)) < 0) { say("the vertex program", err); return false; }
    static const SceGxmBlendInfo over = {SCE_GXM_COLOR_MASK_ALL, SCE_GXM_BLEND_FUNC_ADD, SCE_GXM_BLEND_FUNC_ADD, SCE_GXM_BLEND_FACTOR_SRC_ALPHA,
      SCE_GXM_BLEND_FACTOR_ONE_MINUS_SRC_ALPHA, SCE_GXM_BLEND_FACTOR_ZERO, SCE_GXM_BLEND_FACTOR_ONE};
    static const SceGxmBlendInfo add = {SCE_GXM_COLOR_MASK_ALL, SCE_GXM_BLEND_FUNC_ADD, SCE_GXM_BLEND_FUNC_ADD, SCE_GXM_BLEND_FACTOR_SRC_ALPHA,
      SCE_GXM_BLEND_FACTOR_ONE, SCE_GXM_BLEND_FACTOR_ZERO, SCE_GXM_BLEND_FACTOR_ONE};
    const SceGxmBlendInfo* blends[3] = {nullptr, &over, &add};
    for (int i = 0; i < 3; i++)
      if ((err = sceGxmShaderPatcherCreateFragmentProgram(patcher, idf, SCE_GXM_OUTPUT_REGISTER_FORMAT_UCHAR4, SCE_GXM_MULTISAMPLE_NONE, blends[i], vp, &fprog[i])) < 0) {
        say("the fragment program", err); return false;
      }
    wvp = sceGxmProgramFindParameterByName(vp, "Wvp");   // psp2spvc names a uniform block's parameter by its block name
    ring = static_cast<uint8_t*>(zn_gxm_alloc(16, kRing));
    seq = static_cast<uint16_t*>(zn_gxm_alloc(16, kSeq * 2));
    quad = static_cast<SV*>(zn_gxm_alloc(16, 4 * sizeof(SV)));
    quadIdx = static_cast<uint16_t*>(zn_gxm_alloc(16, 6 * 2));
    uint32_t* one = static_cast<uint32_t*>(zn_gxm_alloc(SCE_GXM_TEXTURE_ALIGNMENT, 4 * 8));
    if (!wvp || !ring || !seq || !quad || !quadIdx || !one) { say("the 3d buffers", 0); return false; }
    for (uint32_t i = 0; i < kSeq; i++) seq[i] = (uint16_t)i;
    const SV q[4] = {{-1, -1, 0.9999f, 0, 0}, {1, -1, 0.9999f, 0, 0}, {-1, 1, 0.9999f, 0, 0}, {1, 1, 0.9999f, 0, 0}};
    memcpy(quad, q, sizeof q);
    const uint16_t qi[6] = {0, 1, 2, 2, 1, 3};
    memcpy(quadIdx, qi, sizeof qi);
    one[0] = 0xFFFFFFFFu;
    sceGxmTextureInitLinear(&white, one, SCE_GXM_TEXTURE_FORMAT_U8U8U8U8_ABGR, 1, 1, 0);
    for (int32_t i = 0; i < meshes.n; i++) if (meshes.p[i]) upload(i);   // the meshes made before GXM started
    zn_vita_log("vita gxm 3d: on\n");
    return true;
  }

  // The bytes of a draw's colour stream (n vertices); null when the ring cannot hold them.
  uint32_t* colours(uint32_t n) {
    const uint32_t bytes = align(n * 4, 16);
    if (bytes > kRing / 3) { if (!told) { told = true; zn_vita_log("vita gxm 3d: a draw has too many vertices for the colour ring: not drawn\n"); } return nullptr; }
    if (ringAt + bytes > kRing) ringAt = 0;
    uint32_t* p = reinterpret_cast<uint32_t*>(ring + ringAt);
    ringAt += bytes;
    return p;
  }
  static uint32_t rgba(const float* c, uint32_t a) {   // 0..255 floats -> R, G, B, A bytes
    uint32_t o = a << 24;
    for (int k = 0; k < 3; k++) { int32_t v = (int32_t)c[k]; o |= (uint32_t)(v > 255 ? 255 : v < 0 ? 0 : v) << (8 * k); }
    return o;
  }
  static uint32_t rgbaOf(uint32_t c, uint32_t a) { return a << 24 | (c & 255) << 16 | (c & 0xFF00) | (c >> 16 & 255); }

  void upload(int32_t id) {   // the mesh `id` of the software renderer into GPU memory
    Mesh* m = meshes.at(id);
    if (!m) return;
    VMesh* g = (VMesh*)mem(sizeof(VMesh));
    *g = VMesh{static_cast<SV*>(zn_gxm_alloc(16, (uint32_t)m->nv * sizeof(SV))), static_cast<uint16_t*>(zn_gxm_alloc(16, (uint32_t)m->ni * 2 + 2)), nullptr};
    if (g->vb && g->ib) {
      for (int32_t i = 0; i < m->nv; i++) g->vb[i] = SV{m->pos[i * 3], m->pos[i * 3 + 1], m->pos[i * 3 + 2], m->uv ? m->uv[i * 2] : 0, m->uv ? m->uv[i * 2 + 1] : 0};
      memcpy(g->ib, m->idx, (size_t)m->ni * 2);
    } else zn_vita_log("vita gxm 3d: out of video memory for a mesh\n");
    if (vmeshes.n <= id) {   // the same handle as the software renderer's mesh
      vmeshes.p = (VMesh**)realloc(vmeshes.p, sizeof(VMesh*) * (size_t)(id + 1));
      for (int32_t i = vmeshes.n; i <= id; i++) vmeshes.p[i] = nullptr;
      vmeshes.n = id + 1;
    }
    vmeshes.p[id] = g;
  }
  int32_t meshCreate(Array<N> pos, Array<N> nrm, Array<N> uv, Array<uint32_t> col, Array<int32_t> idx) override {
    const int32_t id = Engine::meshCreate(pos, nrm, uv, col, idx);
    if (id >= 0 && mode > 0) upload(id);
    return id;
  }
  int32_t meshLoad(Array<uint8_t> data, int32_t at) override {
    const int32_t id = Engine::meshLoad(data, at);
    if (id >= 0 && mode > 0) upload(id);
    return id;
  }
  void meshDestroy(int32_t id) override {
    if (VMesh* g = vmeshes.at(id)) {
      sceGxmFinish(ctx);   // no draw of the GPU still reads it
      zn_gxm_free(g->vb); zn_gxm_free(g->ib); zn_gxm_free(g->flat); mfree(g);
      vmeshes.p[id] = nullptr;
    }
    Engine::meshDestroy(id);
  }

  int32_t target(int32_t id, int32_t w, int32_t h) override {
    if (!on()) return Engine::target(id, w, h);
    const int32_t d = ZP_3D_SCALE > 0 ? ZP_3D_SCALE : 1;   // 0 (auto) is for the software renderer: the GPU draws the full size
    w = w / d; h = h / d;
    if (w < 1) w = 1;
    if (h < 1) h = 1;
    if (w > 2048) w = 2048;
    if (h > 2048) h = 2048;
    VTarget* t = vtargets.at(id);
    if (t && t->w == w && t->h == h) return id;
    if (t) release(t);
    else { t = (VTarget*)mem(sizeof(VTarget)); memset(t, 0, sizeof *t); id = vtargets.add(t); }
    t->w = w; t->h = h; t->stride = (int32_t)align((uint32_t)w, 64);
    t->px = (uint32_t*)mem((size_t)w * h * 4);   // the runtime image the IMAGE command names: black, the frame is the surface's
    memset(t->px, 0, (size_t)w * h * 4);
    t->img = raster::dyn_wrap(w, h, t->px, w);
    const uint32_t aw = align((uint32_t)w, SCE_GXM_TILE_SIZEX), ah = align((uint32_t)h, SCE_GXM_TILE_SIZEY);
    t->color = zn_gxm_alloc(SCE_GXM_TEXTURE_ALIGNMENT, (uint32_t)t->stride * (uint32_t)h * 4);
    t->depthMem = zn_gxm_alloc(SCE_GXM_DEPTHSTENCIL_SURFACE_ALIGNMENT, 4 * aw * ah);
    SceGxmRenderTargetParams rp;
    memset(&rp, 0, sizeof rp);
    rp.width = (uint16_t)w; rp.height = (uint16_t)h; rp.scenesPerFrame = 1; rp.multisampleMode = SCE_GXM_MULTISAMPLE_NONE; rp.driverMemBlock = -1;
    int err = 0;
    if (!t->color || !t->depthMem || (err = sceGxmCreateRenderTarget(&rp, &t->rt)) < 0 ||
        (err = sceGxmColorSurfaceInit(&t->surf, SCE_GXM_COLOR_FORMAT_U8U8U8U8_ABGR, SCE_GXM_COLOR_SURFACE_LINEAR, SCE_GXM_COLOR_SURFACE_SCALE_NONE,
                                      SCE_GXM_OUTPUT_REGISTER_SIZE_32BIT, (unsigned)w, (unsigned)h, (unsigned)t->stride, t->color)) < 0 ||
        (err = sceGxmDepthStencilSurfaceInit(&t->depth, SCE_GXM_DEPTH_STENCIL_FORMAT_S8D24, SCE_GXM_DEPTH_STENCIL_SURFACE_TILED, aw, t->depthMem, nullptr)) < 0 ||
        (err = sceGxmTextureInitLinearStrided(&t->tex, t->color, SCE_GXM_TEXTURE_FORMAT_X8U8U8U8_1BGR, (unsigned)w, (unsigned)h, (unsigned)t->stride * 4)) < 0) {
      say("a 3d target", err);
      if (t->rt) sceGxmDestroyRenderTarget(t->rt);
      zn_gxm_free(t->color); zn_gxm_free(t->depthMem);
      t->rt = nullptr; t->color = t->depthMem = nullptr;
      return id;
    }
    sceGxmDepthStencilSurfaceSetBackgroundDepth(&t->depth, 1.0f);   // each scene starts at the far plane
    memset(t->color, 0, (size_t)t->stride * h * 4);
    return id;
  }
  void release(VTarget* t) {
    if (vcur == t) vcur = nullptr;
    sceGxmFinish(ctx);
    raster::dyn_destroy(t->img); mfree(t->px);
    if (t->rt) sceGxmDestroyRenderTarget(t->rt);
    zn_gxm_free(t->color); zn_gxm_free(t->depthMem);
    t->rt = nullptr; t->color = t->depthMem = nullptr;
  }
  void targetDestroy(int32_t id) override {
    if (mode < 0) return Engine::targetDestroy(id);
    VTarget* t = vtargets.at(id);
    if (!t) return;
    release(t); mfree(t);
    vtargets.p[id] = nullptr;
  }
  const SceGxmTexture* surfaceOf(int32_t img, int32_t* w, int32_t* h) const {
    for (int32_t i = 0; i < vtargets.n; i++)
      if (const VTarget* t = vtargets.p[i]) if (t->img == img && t->rt) { *w = t->w; *h = t->h; return &t->tex; }
    return nullptr;
  }

  void begin(int32_t id, uint32_t clear, Array<N> view, N proj, N nearN, N farN, bool ortho) override {
    if (mode < 0) return Engine::begin(id, clear, view, proj, nearN, farN, ortho);
    vcur = vtargets.at(id);
    if (vcur && !vcur->rt) vcur = nullptr;
    if (!vcur) return;
    tris = 0; nl = 0; amb[0] = amb[1] = amb[2] = 0;
    viewProjection(vp, (float)vcur->w / vcur->h, view, proj, nearN, farN, ortho);
    eyeOf(view);
    spec[0] = spec[1] = spec[2] = 0;
    emit[0] = emit[1] = emit[2] = 0;
    const int err = sceGxmBeginScene(ctx, 0, vcur->rt, nullptr, nullptr, nullptr, &vcur->surf, &vcur->depth);
    if (err < 0) { say("sceGxmBeginScene (3d)", err); vcur = nullptr; return; }
    // GL's clip space (z in -w..w) into GXM's depth 0..1: the matrix makes z 0..w (wvp() below), the viewport keeps it
    sceGxmSetViewport(ctx, vcur->w / 2.0f, vcur->w / 2.0f, vcur->h / 2.0f, -(vcur->h / 2.0f), 0.0f, 1.0f);
    sceGxmSetFrontDepthFunc(ctx, SCE_GXM_DEPTH_FUNC_ALWAYS); sceGxmSetBackDepthFunc(ctx, SCE_GXM_DEPTH_FUNC_ALWAYS);
    sceGxmSetFrontDepthWriteEnable(ctx, SCE_GXM_DEPTH_WRITE_DISABLED); sceGxmSetBackDepthWriteEnable(ctx, SCE_GXM_DEPTH_WRITE_DISABLED);
    sceGxmSetCullMode(ctx, SCE_GXM_CULL_NONE);
    static const float id4[16] = {1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1};
    if (uint32_t* c = colours(4)) {   // the clear colour over the whole target
      for (int i = 0; i < 4; i++) c[i] = rgbaOf(clear, 255);
      submit(quad, quadIdx, 6, c, id4, &white, false, 0);
    }
    sceGxmSetFrontDepthFunc(ctx, SCE_GXM_DEPTH_FUNC_LESS_EQUAL); sceGxmSetBackDepthFunc(ctx, SCE_GXM_DEPTH_FUNC_LESS_EQUAL);
    for (int c = 0; c < 4; c++) vp[c * 4 + 2] = 0.5f * vp[c * 4 + 2] + 0.5f * vp[c * 4 + 3];   // z -> (z + w) / 2
  }

  // One indexed draw: the program, its matrix (column major; the program reads it by rows, so it goes up transposed), the texture, the streams.
  void submit(const SV* vb, const uint16_t* ib, uint32_t n, const uint32_t* col, const float* mvp, const SceGxmTexture* tex, bool linear, int blend) {
    sceGxmSetVertexProgram(ctx, vprog);
    sceGxmSetFragmentProgram(ctx, fprog[blend]);
    void* uniforms;
    sceGxmReserveVertexDefaultUniformBuffer(ctx, &uniforms);
    float t[16];
    for (int r = 0; r < 4; r++) for (int c = 0; c < 4; c++) t[r * 4 + c] = mvp[c * 4 + r];
    sceGxmSetUniformDataF(uniforms, wvp, 0, 16, t);
    SceGxmTexture tx = *tex;
    const SceGxmTextureFilter f = linear ? SCE_GXM_TEXTURE_FILTER_LINEAR : SCE_GXM_TEXTURE_FILTER_POINT;
    sceGxmTextureSetMinFilter(&tx, f); sceGxmTextureSetMagFilter(&tx, f);
    const unsigned tw = sceGxmTextureGetWidth(&tx), th = sceGxmTextureGetHeight(&tx);
    const bool pot = !(tw & (tw - 1)) && !(th & (th - 1));   // the software renderer repeats; a linear GXM texture repeats only with power-of-two sizes
    sceGxmTextureSetUAddrMode(&tx, pot ? SCE_GXM_TEXTURE_ADDR_REPEAT : SCE_GXM_TEXTURE_ADDR_CLAMP);
    sceGxmTextureSetVAddrMode(&tx, pot ? SCE_GXM_TEXTURE_ADDR_REPEAT : SCE_GXM_TEXTURE_ADDR_CLAMP);
    sceGxmSetFragmentTexture(ctx, 0, &tx);
    sceGxmSetVertexStream(ctx, 0, vb);
    sceGxmSetVertexStream(ctx, 1, col);
    sceGxmDraw(ctx, SCE_GXM_PRIMITIVE_TRIANGLES, SCE_GXM_INDEX_FORMAT_U16, ib, n);
  }

  void draw(int32_t id, Array<N> model, uint32_t color, int32_t tex, int32_t flags) override {
    if (mode < 0) return Engine::draw(id, model, color, tex, flags);
    Mesh* m = meshes.at(id);
    VMesh* g = vmeshes.at(id);
    if (!m || !g || !g->vb || !vcur) return;
    float M[16], MVP[16];
    for (int i = 0; i < 16; i++) M[i] = i < model.length() ? F(model.a->data[i]) : (i % 5 == 0 ? 1.0f : 0.0f);
    mul(MVP, vp, M);
    const int bl = (flags >> 6) & 3, blend = bl == ALPHA || bl == ADD ? bl : 0;
    const uint32_t alpha = blend ? (uint32_t)((flags >> 8) & 255) : 255;
    if (blend && !alpha) return;
    int32_t tw, th;
    const SceGxmTexture* t = tex >= 0 && m->uv ? static_cast<const SceGxmTexture*>(zn::ff::texture(tex, &tw, &th)) : nullptr;   // gxm_vita.cpp's Tex starts with its SceGxmTexture
    const int f = (flags >> 4) & 3;
    const bool lit = !(flags & UNLIT), flat = flags & FLAT, vcol = (flags & VCOL) && m->col, em = emitOn(), sp = lit && specOn();
    const bool smooth = !flat && (lit || vcol || em);
    // the colours, as Engine::draw computes them
    uint32_t* c;
    if (!flat) {
      if (!(c = colours((uint32_t)m->nv))) return;
      for (int32_t i = 0; i < m->nv; i++) {
        if (!smooth) { c[i] = rgbaOf(color, alpha); continue; }
        const float* p = m->pos + i * 3;
        const uint32_t base = vcol ? m->col[i] : color;
        float o[3];
        if (lit && sp) {
          const float wp[3] = {M[0] * p[0] + M[4] * p[1] + M[8] * p[2] + M[12], M[1] * p[0] + M[5] * p[1] + M[9] * p[2] + M[13], M[2] * p[0] + M[6] * p[1] + M[10] * p[2] + M[14]};
          shade(M, m->nrm[i * 3], m->nrm[i * 3 + 1], m->nrm[i * 3 + 2], base, o, wp);
        } else if (lit) shade(M, m->nrm[i * 3], m->nrm[i * 3 + 1], m->nrm[i * 3 + 2], base, o);
        else { o[0] = (float)(base >> 16 & 255); o[1] = (float)(base >> 8 & 255); o[2] = (float)(base & 255); }
        if (em) glow(o);
        c[i] = rgba(o, alpha);
      }
    } else {
      if (!g->flat) {   // one corner per triangle corner, in GPU memory from the first flat draw
        g->flat = static_cast<SV*>(zn_gxm_alloc(16, (uint32_t)m->ni * sizeof(SV) + 16));
        if (!g->flat) return;
        for (int32_t k = 0; k < m->ni; k++) g->flat[k] = g->vb[m->idx[k]];
      }
      if (!(c = colours((uint32_t)m->ni))) return;
      for (int32_t k = 0; k < m->ni; k += 3) {
        const int32_t i0 = m->idx[k], i1 = m->idx[k + 1], i2 = m->idx[k + 2];
        uint32_t base = color;
        if (vcol) {
          const uint32_t a = m->col[i0], b = m->col[i1], d = m->col[i2];
          base = (((a >> 16 & 255) + (b >> 16 & 255) + (d >> 16 & 255)) / 3) << 16 | (((a >> 8 & 255) + (b >> 8 & 255) + (d >> 8 & 255)) / 3) << 8 | ((a & 255) + (b & 255) + (d & 255)) / 3;
        }
        float s[3] = {(float)(base >> 16 & 255), (float)(base >> 8 & 255), (float)(base & 255)};
        if (lit) {
          const float *p0 = m->pos + i0 * 3, *p1 = m->pos + i1 * 3, *p2 = m->pos + i2 * 3;
          const float ax = p1[0] - p0[0], ay = p1[1] - p0[1], az = p1[2] - p0[2], bx = p2[0] - p0[0], by = p2[1] - p0[1], bz = p2[2] - p0[2];
          if (sp) {
            const float cx = (p0[0] + p1[0] + p2[0]) / 3, cy = (p0[1] + p1[1] + p2[1]) / 3, cz = (p0[2] + p1[2] + p2[2]) / 3;
            const float wp[3] = {M[0] * cx + M[4] * cy + M[8] * cz + M[12], M[1] * cx + M[5] * cy + M[9] * cz + M[13], M[2] * cx + M[6] * cy + M[10] * cz + M[14]};
            shade(M, ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx, base, s, wp);
          } else shade(M, ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx, base, s);
        }
        if (em) glow(s);
        c[k] = c[k + 1] = c[k + 2] = rgba(s, alpha);
      }
    }
    sceGxmSetCullMode(ctx, flags & DOUBLE ? SCE_GXM_CULL_NONE : SCE_GXM_CULL_CW);
    const SceGxmDepthWriteMode dw = blend ? SCE_GXM_DEPTH_WRITE_DISABLED : SCE_GXM_DEPTH_WRITE_ENABLED;   // a blended draw is tested, writes no depth
    sceGxmSetFrontDepthWriteEnable(ctx, dw); sceGxmSetBackDepthWriteEnable(ctx, dw);
    const SceGxmTexture* tx = t ? t : &white;
    const bool linear = t && (f == 2 || f == 3);
    if (!flat) submit(g->vb, g->ib, (uint32_t)m->ni, c, MVP, tx, linear, blend);
    else for (uint32_t k = 0; k < (uint32_t)m->ni; k += kSeq) {   // the corners in runs the 16-bit indices reach
      const uint32_t n = (uint32_t)m->ni - k < kSeq ? (uint32_t)m->ni - k : kSeq;
      submit(g->flat + k, seq, n, c + k, MVP, tx, linear, blend);
    }
    tris += m->ni / 3;
  }

  bool gpu() override { return on(); }
  int32_t end() override {
    if (mode < 0) return Engine::end();
    if (!vcur) return 0;
    vcur = nullptr;
    sceGxmEndScene(ctx, nullptr, nullptr);
    // the 2D replay's state: no depth, no culling
    sceGxmSetFrontDepthFunc(ctx, SCE_GXM_DEPTH_FUNC_ALWAYS); sceGxmSetBackDepthFunc(ctx, SCE_GXM_DEPTH_FUNC_ALWAYS);
    sceGxmSetFrontDepthWriteEnable(ctx, SCE_GXM_DEPTH_WRITE_DISABLED); sceGxmSetBackDepthWriteEnable(ctx, SCE_GXM_DEPTH_WRITE_DISABLED);
    sceGxmSetCullMode(ctx, SCE_GXM_CULL_NONE);
    return tris;
  }
  void present(int32_t id, N x, N y, N w, N h) override {
    if (mode < 0) return Engine::present(id, x, y, w, h);
    VTarget* t = vtargets.at(id);
    if (t && t->img >= 0) presentImage(t->img, x, y, w, h);
  }
};

Vita* vita;
}  // namespace

// gxm_vita.cpp's texture() asks here first: the colour surface of a target, by the runtime image its IMAGE command names
extern "C" const void* zn_3d_gpu_texture(int32_t id, int32_t* w, int32_t* h) { return vita ? vita->surfaceOf(id, w, h) : nullptr; }

/** The GXM renderer (ZINC_3D=software, or a deterministic run with the "auto" renderer, keeps the software one). */
NativeRender3D* gpuRenderer() {
  const char* e = getenv("ZINC_3D");
  const char* want = e && *e ? e : "auto";
  if (!strcmp(want, "software") || (!strcmp(want, "auto") && getenv("ZINC_DETERMINISTIC"))) return nullptr;
  static Vita g;   // GXM or, when it does not start, the software renderer it extends (Vita::on)
  vita = &g;
  g.rc = zrt::IMMORTAL;
  return &g;
}
