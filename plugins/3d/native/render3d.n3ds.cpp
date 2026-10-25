// zinc:3d on the 3DS's PICA200 (citro3d): the interface and the meshes of the software renderer (render3d.host.cpp, included below: the
// fallback, ZINC_N3DS_GPU=0) drawn by the GPU. A mesh is one vertex buffer and its indices in linear memory, built at meshCreate, plus a
// de-indexed copy with face normals the first time it is drawn flat. Lighting is a vertex shader (render3d.n3ds.v.pica, assembled by picasso):
// the software renderer's per-vertex shading, ambient plus up to 4 directional lights, the specular reflection per vertex and the emissive
// colour; chosen over citro3d's fragment lighting, whose lookup tables and quaternion normals would not give the software renderer's colours.
// A target is a power-of-two RGBA8 texture in VRAM with its depth buffer, the whole texture drawn (the box's aspect, stretched back by the
// IMAGE command). draw() records the draw (mesh, matrices, material); the frame is drawn when c3d_n3ds.cpp's texture() first asks for the
// target's picture (the zn_3d_gpu_texture hook), inside the GPU frame c3d_n3ds.cpp opened (citro3d has one frame open at a time; in stereo the
// left eye opens it and the right one closes it, and each eye's frame draws the 3D view it was given), so the 3D view composes in the 2D
// order without a read back. present() emits the IMAGE command of the target's runtime image, as the software renderer does.
// ponytail: a frame whose 2D commands the replay cannot draw falls back to the software raster, which shows the target's runtime image (black)
// instead of the GPU's picture; one view for both eyes (no eye offset of the camera).
#define ZP_3D_GPU 1
#include "render3d.host.cpp"

#include <3ds.h>
#include <citro3d.h>

#include "ff_replay.h"
#include "r3d_shader_shbin.h"

extern "C" void zn_c3d_yield(void);    // c3d_n3ds.cpp: draws the quads it queued and forgets its state
extern "C" void zn_c3d_resume(void);   // c3d_n3ds.cpp: its shader and fixed state again

namespace {

// c3d_n3ds.cpp's texture, as zn::ff::texture returns it and its replay reads it (keep the two in step)
struct C3Tex { C3D_Tex t; int32_t w, h; uint32_t ver; bool ok; };
struct GVtx { float p[3], n[3], uv[2]; uint8_t c[4]; };
struct GMesh { GVtx* v; GVtx* flat; uint16_t* idx; int32_t ni; bool col; };
struct Rec { int32_t mesh, flags; uint32_t color; C3Tex* tex; float tsc[2]; C3D_Mtx mvp, model; float spec[4], emit[3]; };
struct GTarget {
  int32_t img, w, h; uint32_t* px; C3Tex tex; C3D_RenderTarget* rt; uint32_t clear; bool dirty;
  Rec* recs; int32_t nrec, cap;
  float amb[3], ld[4][3], lc[4][3], eye[3]; int nl;
};
struct Loc { int mvp, model, base, vk, amb, ld, lc, spec, eye, emit, tsc; };

int32_t pow2(int32_t v) { int32_t p = 8; while (p < v) p <<= 1; return p; }
/** A column-major 4x4 (the program's) as citro3d's rows. */
void rows(C3D_Mtx* o, const float* m) { for (int i = 0; i < 4; i++) for (int j = 0; j < 4; j++) o->r[i].c[3 - j] = m[j * 4 + i]; }

struct N3ds : Engine {
  GMesh** gm = nullptr; int32_t ngm = 0;   // by the software mesh's id
  Pool<GTarget> gtargets;
  GTarget* gcur = nullptr;
  C3D_Mtx proj;
  DVLB_s* dvlb = nullptr;
  shaderProgram_s prog;
  Loc loc;

  bool open() {
    dvlb = DVLB_ParseFile((u32*)r3d_shader_shbin, r3d_shader_shbin_size);
    if (!dvlb) return false;
    shaderProgramInit(&prog);
    shaderProgramSetVsh(&prog, &dvlb->DVLE[0]);
    auto u = [&](const char* n) { return (int)shaderInstanceGetUniformLocation(prog.vertexShader, n); };
    loc = Loc{u("mvp"), u("model"), u("base"), u("vk"), u("amb"), u("ld"), u("lc"), u("spec"), u("eye"), u("emit"), u("tsc")};
    return true;
  }

  GMesh* gmesh(int32_t id) { return id >= 0 && id < ngm ? gm[id] : nullptr; }
  int32_t keep(int32_t sid) {
    Mesh* m = meshes.at(sid);
    if (!m) return -1;
    if (sid >= ngm) { gm = (GMesh**)realloc(gm, sizeof(GMesh*) * (size_t)(sid + 1)); for (int32_t i = ngm; i <= sid; i++) gm[i] = nullptr; ngm = sid + 1; }
    GMesh* g = (GMesh*)mem(sizeof(GMesh));
    *g = GMesh{(GVtx*)linearAlloc(sizeof(GVtx) * (size_t)m->nv), nullptr, (uint16_t*)linearAlloc(sizeof(uint16_t) * (size_t)m->ni), m->ni, m->col != nullptr};
    if (!g->v || !g->idx) { if (g->v) linearFree(g->v); if (g->idx) linearFree(g->idx); mfree(g); Engine::meshDestroy(sid); return -1; }
    for (int32_t i = 0; i < m->nv; i++) {
      GVtx& v = g->v[i];
      memcpy(v.p, m->pos + i * 3, 12); memcpy(v.n, m->nrm + i * 3, 12);
      v.uv[0] = m->uv ? m->uv[i * 2] : 0; v.uv[1] = m->uv ? m->uv[i * 2 + 1] : 0;
      const uint32_t c = m->col ? m->col[i] : 0xFFFFFF;
      v.c[0] = c >> 16 & 255; v.c[1] = c >> 8 & 255; v.c[2] = c & 255; v.c[3] = 255;
    }
    memcpy(g->idx, m->idx, sizeof(uint16_t) * (size_t)m->ni);
    GSPGPU_FlushDataCache(g->v, sizeof(GVtx) * (size_t)m->nv);
    GSPGPU_FlushDataCache(g->idx, sizeof(uint16_t) * (size_t)m->ni);
    gm[sid] = g;
    return sid;
  }
  /** The flat copy: three vertices a triangle, the face's normal, the mean of its vertex colours (as the software renderer shades a face). */
  GVtx* flat(Mesh* m, GMesh* g) {
    if (g->flat) return g->flat;
    if (!(g->flat = (GVtx*)linearAlloc(sizeof(GVtx) * (size_t)m->ni))) return nullptr;
    for (int32_t t = 0; t < m->ni; t += 3) {
      const uint16_t* ix = m->idx + t;
      const float *p0 = m->pos + ix[0] * 3, *p1 = m->pos + ix[1] * 3, *p2 = m->pos + ix[2] * 3;
      float ax = p1[0] - p0[0], ay = p1[1] - p0[1], az = p1[2] - p0[2], bx = p2[0] - p0[0], by = p2[1] - p0[1], bz = p2[2] - p0[2];
      float nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx, l = sqrtf(nx * nx + ny * ny + nz * nz);
      if (l > 0) { nx /= l; ny /= l; nz /= l; }
      uint8_t c[4] = {255, 255, 255, 255};
      for (int j = 0; j < 3; j++) c[j] = (uint8_t)((g->v[ix[0]].c[j] + g->v[ix[1]].c[j] + g->v[ix[2]].c[j]) / 3);
      for (int k = 0; k < 3; k++) { GVtx v = g->v[ix[k]]; v.n[0] = nx; v.n[1] = ny; v.n[2] = nz; memcpy(v.c, c, 4); g->flat[t + k] = v; }
    }
    GSPGPU_FlushDataCache(g->flat, sizeof(GVtx) * (size_t)m->ni);
    return g->flat;
  }
  int32_t meshCreate(Array<N> pos, Array<N> nrm, Array<N> uv, Array<uint32_t> col, Array<int32_t> idx) override { return keep(Engine::meshCreate(pos, nrm, uv, col, idx)); }
  int32_t meshLoad(Array<uint8_t> data, int32_t at) override { return keep(Engine::meshLoad(data, at)); }
  void meshDestroy(int32_t id) override {
    if (GMesh* g = gmesh(id)) { linearFree(g->v); linearFree(g->idx); if (g->flat) linearFree(g->flat); mfree(g); gm[id] = nullptr; }
    Engine::meshDestroy(id);
  }

  int32_t target(int32_t id, int32_t w, int32_t h) override {
    const int32_t d = ZP_3D_SCALE > 0 ? ZP_3D_SCALE : 1;
    w = w / d < 1 ? 1 : w / d; h = h / d < 1 ? 1 : h / d;
    while (w > 1024 || h > 1024) { w /= 2; h /= 2; }   // the PICA's largest texture
    GTarget* t = gtargets.at(id);
    if (t && t->w == w && t->h == h) return id;
    if (t) release(t);
    else { t = (GTarget*)mem(sizeof(GTarget)); memset(t, 0, sizeof(GTarget)); id = gtargets.add(t); }
    t->w = w; t->h = h; t->dirty = false; t->nrec = 0;
    t->tex = C3Tex{};
    if (!C3D_TexInitVRAM(&t->tex.t, (u16)pow2(w), (u16)pow2(h), GPU_RGBA8)) return id;   // no picture: the hook declines, the image stays black
    C3D_TexSetFilter(&t->tex.t, GPU_LINEAR, GPU_LINEAR);
    C3D_TexSetWrap(&t->tex.t, GPU_CLAMP_TO_EDGE, GPU_CLAMP_TO_EDGE);
    t->tex.w = t->tex.t.width; t->tex.h = t->tex.t.height; t->tex.ok = true;
    t->rt = C3D_RenderTargetCreateFromTex(&t->tex.t, GPU_TEXFACE_2D, 0, GPU_RB_DEPTH24_STENCIL8);
    // the runtime image the IMAGE command names: its pixels are the GPU's texture (the hook); this copy only shows when the 2D frame falls back
    t->px = (uint32_t*)mem((size_t)w * h * 4);
    memset(t->px, 0, (size_t)w * h * 4);
    t->img = raster::dyn_wrap(w, h, t->px, w);
    return id;
  }
  void release(GTarget* t) {
    if (gcur == t) gcur = nullptr;
    raster::dyn_destroy(t->img); mfree(t->px);
    if (t->rt) C3D_RenderTargetDelete(t->rt);
    if (t->tex.t.data) C3D_TexDelete(&t->tex.t);
    t->rt = nullptr;
  }
  void targetDestroy(int32_t id) override {
    GTarget* t = gtargets.at(id);
    if (!t) return;
    release(t); mfree(t->recs); mfree(t);
    gtargets.p[id] = nullptr;
  }
  GTarget* byImage(int32_t img) { for (int32_t i = 0; i < gtargets.n; i++) if (GTarget* t = gtargets.p[i]) if (t->img == img) return t; return nullptr; }

  void begin(int32_t id, uint32_t clear, Array<N> view, N proj_, N nearN, N farN, bool ortho) override {
    gcur = gtargets.at(id);
    if (!gcur) return;
    GTarget* t = gcur;
    tris = 0; nl = 0; amb[0] = amb[1] = amb[2] = 0;
    spec[0] = spec[1] = spec[2] = 0; emit[0] = emit[1] = emit[2] = 0;
    eyeOf(view);
    t->nrec = 0;
    t->clear = (clear & 0xFFFFFF) << 8 | 0xFF;
    const float n = F(nearN), f = F(farN), asp = (float)t->w / t->h;
    C3D_Mtx P;
    if (ortho) { const float hh = F(proj_) * 0.5f; Mtx_Ortho(&P, -hh * asp, hh * asp, -hh, hh, n, f, false); }
    else Mtx_Persp(&P, F(proj_), asp, n, f, false);
    float V[16];
    for (int i = 0; i < 16; i++) V[i] = i < view.length() ? F(view.a->data[i]) : (i % 5 == 0 ? 1.0f : 0.0f);
    C3D_Mtx Vm;
    rows(&Vm, V);
    Mtx_Multiply(&proj, &P, &Vm);   // projection x view
  }

  void draw(int32_t id, Array<N> model, uint32_t color, int32_t tex, int32_t flags) override {
    Mesh* m = meshes.at(id);
    if (!m || !gmesh(id) || !gcur || !gcur->rt) return;
    const int bl = (flags >> 6) & 3;
    if ((bl == ALPHA || bl == ADD) && !((flags >> 8) & 255)) return;
    GTarget* t = gcur;
    if (t->nrec == t->cap) { t->cap = t->cap ? t->cap * 2 : 32; t->recs = (Rec*)realloc(t->recs, sizeof(Rec) * (size_t)t->cap); }
    Rec& r = t->recs[t->nrec++];
    float M[16];
    for (int i = 0; i < 16; i++) M[i] = i < model.length() ? F(model.a->data[i]) : (i % 5 == 0 ? 1.0f : 0.0f);
    rows(&r.model, M);
    Mtx_Multiply(&r.mvp, &proj, &r.model);
    r.mesh = id; r.flags = flags; r.color = color;
    r.tex = nullptr;
    int32_t tw = 0, th = 0;
    if (tex >= 0 && m->uv) r.tex = (C3Tex*)zn::ff::texture(tex, &tw, &th);   // uploaded now, outside the GPU frame
    if (r.tex) { r.tsc[0] = (float)tw / r.tex->t.width; r.tsc[1] = (float)th / r.tex->t.height; }
    const bool sp = !(flags & UNLIT) && specOn();
    for (int i = 0; i < 3; i++) { r.spec[i] = sp ? spec[i] * specK : 0; r.emit[i] = emit[i] / 255; }
    r.spec[3] = shin;
    tris += m->ni / 3;
  }

  bool gpu() override { return true; }
  int32_t end() override {
    GTarget* t = gcur;
    if (!t) return 0;
    gcur = nullptr;
    memcpy(t->amb, amb, sizeof amb); memcpy(t->ld, ld, sizeof ld); memcpy(t->lc, lc, sizeof lc); memcpy(t->eye, eye, sizeof eye);
    t->nl = nl;
    t->dirty = true;
    raster::dyn_update(t->img, nullptr, 0);   // a new picture: the frame's diff redraws its box (the GPU writes no pixels the diff could see)
    return tris;
  }
  void present(int32_t id, N x, N y, N w, N h) override {
    GTarget* t = gtargets.at(id);
    if (t && t->img >= 0) presentImage(t->img, x, y, w, h);
  }

  /** The recorded frame of `t` into its texture, inside the open GPU frame; c3d_n3ds.cpp's state around it. */
  void render(GTarget* t) {
    t->dirty = false;
    zn_c3d_yield();
    const C3D_AttrInfo attrs = *C3D_GetAttrInfo();
    const C3D_BufInfo bufs = *C3D_GetBufInfo();
    C3D_RenderTargetClear(t->rt, C3D_CLEAR_ALL, t->clear, 0);
    C3D_FrameDrawOn(t->rt);
    C3D_BindProgram(&prog);
    C3D_AttrInfo* a = C3D_GetAttrInfo();
    AttrInfo_Init(a);
    AttrInfo_AddLoader(a, 0, GPU_FLOAT, 3);           // position
    AttrInfo_AddLoader(a, 1, GPU_FLOAT, 3);           // normal
    AttrInfo_AddLoader(a, 2, GPU_FLOAT, 2);           // uv
    AttrInfo_AddLoader(a, 3, GPU_UNSIGNED_BYTE, 4);   // colour, 0..255
    C3D_FVUnifSet(GPU_VERTEX_SHADER, loc.eye, t->eye[0], t->eye[1], t->eye[2], 0);
    for (int32_t k = 0; k < t->nrec; k++) {
      const Rec& r = t->recs[k];
      Mesh* m = meshes.at(r.mesh);
      GMesh* g = gmesh(r.mesh);
      if (!m || !g) continue;
      const bool fl = r.flags & FLAT;
      const GVtx* v = fl ? flat(m, g) : g->v;
      if (!v) continue;
      // lighting: an unlit draw is a white ambient and no light
      const bool lit = !(r.flags & UNLIT);
      if (lit) C3D_FVUnifSet(GPU_VERTEX_SHADER, loc.amb, t->amb[0], t->amb[1], t->amb[2], 0);
      else C3D_FVUnifSet(GPU_VERTEX_SHADER, loc.amb, 1, 1, 1, 0);
      for (int i = 0; i < 4; i++) {
        const bool on = lit && i < t->nl;
        C3D_FVUnifSet(GPU_VERTEX_SHADER, loc.ld + i, on ? t->ld[i][0] : 0, on ? t->ld[i][1] : 0, on ? t->ld[i][2] : 1, 0);
        C3D_FVUnifSet(GPU_VERTEX_SHADER, loc.lc + i, on ? t->lc[i][0] : 0, on ? t->lc[i][1] : 0, on ? t->lc[i][2] : 0, 0);
      }
      C3D_FVUnifMtx4x4(GPU_VERTEX_SHADER, loc.mvp, &r.mvp);
      C3D_FVUnifMtx3x4(GPU_VERTEX_SHADER, loc.model, &r.model);
      C3D_FVUnifSet(GPU_VERTEX_SHADER, loc.base, (r.color >> 16 & 255) / 255.0f, (r.color >> 8 & 255) / 255.0f, (r.color & 255) / 255.0f, 1);
      const bool vcol = (r.flags & VCOL) && g->col;
      C3D_FVUnifSet(GPU_VERTEX_SHADER, loc.vk, vcol ? 1 / 255.0f : 0, vcol ? 0 : 1, 0, 0);
      C3D_FVUnifSet(GPU_VERTEX_SHADER, loc.spec, r.spec[0], r.spec[1], r.spec[2], r.spec[3]);
      C3D_FVUnifSet(GPU_VERTEX_SHADER, loc.emit, r.emit[0], r.emit[1], r.emit[2], 0);
      // TEV stage 0: the lit colour, times the texture; alpha 1 (the target is shown opaque)
      C3D_TexEnv* env = C3D_GetTexEnv(0);   // each draw: getting it marks it for upload
      C3D_TexEnvInit(env);
      if (r.tex) {
        C3D_TexEnvSrc(env, C3D_RGB, GPU_TEXTURE0, GPU_PRIMARY_COLOR, GPU_PRIMARY_COLOR);
        C3D_TexEnvFunc(env, C3D_RGB, GPU_MODULATE);
        C3D_FVUnifSet(GPU_VERTEX_SHADER, loc.tsc, r.tsc[0], -r.tsc[1], 0, 1);
        const int f = (r.flags >> 4) & 3;
        C3D_Tex* ct = &r.tex->t;
        const bool whole = r.tsc[0] == 1 && r.tsc[1] == 1;   // a power-of-two image repeats, as in the software renderer
        C3D_TexSetFilter(ct, f == 1 ? GPU_NEAREST : GPU_LINEAR, f == 1 ? GPU_NEAREST : GPU_LINEAR);
        C3D_TexSetWrap(ct, whole ? GPU_REPEAT : GPU_CLAMP_TO_EDGE, whole ? GPU_REPEAT : GPU_CLAMP_TO_EDGE);
        C3D_TexBind(0, ct);
      } else {
        C3D_TexEnvSrc(env, C3D_RGB, GPU_PRIMARY_COLOR, GPU_PRIMARY_COLOR, GPU_PRIMARY_COLOR);
        C3D_TexEnvFunc(env, C3D_RGB, GPU_REPLACE);
      }
      C3D_TexEnvSrc(env, C3D_Alpha, GPU_PRIMARY_COLOR, GPU_PRIMARY_COLOR, GPU_PRIMARY_COLOR);
      C3D_TexEnvFunc(env, C3D_Alpha, GPU_REPLACE);
      // blending (ZN-696): over or added with the draw's opacity, depth tested, no depth written
      const int bl = (r.flags >> 6) & 3;
      if (bl == ALPHA || bl == ADD) {
        C3D_BlendingColor(((uint32_t)r.flags >> 8 & 255) << 24);
        C3D_AlphaBlend(GPU_BLEND_ADD, GPU_BLEND_ADD, GPU_CONSTANT_ALPHA, bl == ADD ? GPU_ONE : GPU_ONE_MINUS_CONSTANT_ALPHA, GPU_ZERO, GPU_ONE);
        C3D_DepthTest(true, GPU_GREATER, GPU_WRITE_COLOR);
      } else {
        C3D_AlphaBlend(GPU_BLEND_ADD, GPU_BLEND_ADD, GPU_ONE, GPU_ZERO, GPU_ONE, GPU_ZERO);
        C3D_DepthTest(true, GPU_GREATER, GPU_WRITE_ALL);
      }
      C3D_CullFace(r.flags & DOUBLE ? GPU_CULL_NONE : GPU_CULL_BACK_CCW);
      C3D_BufInfo* b = C3D_GetBufInfo();
      BufInfo_Init(b);
      BufInfo_Add(b, v, sizeof(GVtx), 4, 0x3210);
      if (fl) C3D_DrawArrays(GPU_TRIANGLES, 0, m->ni);
      else C3D_DrawElements(GPU_TRIANGLES, m->ni, C3D_UNSIGNED_SHORT, g->idx);
      if (r.tex) C3D_TexSetWrap(&r.tex->t, GPU_CLAMP_TO_EDGE, GPU_CLAMP_TO_EDGE);   // the replay's (the draw above took its own)
    }
    C3D_SetAttrInfo(const_cast<C3D_AttrInfo*>(&attrs));
    C3D_SetBufInfo(const_cast<C3D_BufInfo*>(&bufs));
    zn_c3d_resume();
  }
};

N3ds* n3ds;

}  // namespace

/** c3d_n3ds.cpp's texture() asks first: a zinc:3d target's texture, its recorded frame drawn on the first ask after end(). */
extern "C" const void* zn_3d_gpu_texture(int32_t id, int32_t* w, int32_t* h) {
  GTarget* t = n3ds ? n3ds->byImage(id) : nullptr;
  if (!t || !t->tex.ok || !t->rt) return nullptr;
  if (t->dirty) n3ds->render(t);
  *w = t->tex.w; *h = t->tex.h;   // the whole texture: the frame is drawn over all of it
  return &t->tex;
}

/** The PICA draws unless ZINC_N3DS_GPU=0, the switch of the 2D path whose frame draws the picture. */
NativeRender3D* gpuRenderer() {
  const char* g = getenv("ZINC_N3DS_GPU");
  if (g && *g == '0') return nullptr;
  static N3ds e;
  static bool ok = e.open();
  if (!ok) return nullptr;
  e.rc = zrt::IMMORTAL;
  n3ds = &e;
  return &e;
}
