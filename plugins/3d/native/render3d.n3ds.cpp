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
// A World (include/zn/zworld.h) is drawn as Pocket Tokyo's 3DS draws its city (docs/reports/pocket3d-techniques.md 2.2, pocket-nexus/pocket-tokyo
// n3ds/src/render.c, MIT): each batch keeps its vertices quantised in one of three layouts (worldMesh: 8 bytes for what looks up, 16 for the
// faces with a picture, 12 for the painted ones, positions s16 over the batch's box decoded by its matrix), drawn by a small vertex program
// each (render3d.n3ds.{top,wall,solid}.v.pica) that takes a face's light from 17 lights filled once a frame (the 16 sectors of the compass a
// face looks to, then up or down); worldDraw records the ranges worldSelect chose and render() draws them, setting a batch's state only when
// the batch changes. Three combiner stages: the light times the shadows (an 8-bit map swept from the heights of worldShadows, a few rows a
// frame when the light has moved), times the picture, then mixed into the night picture by how far the night has come; the haze is the fog table.
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
// a World's batch: its layout (FLOATS: GVtx), its vertices, its box (origin, size) and, for TOP, its uv as a function of the place (u = uvk0 qx
// + uvk1, v = uvk2 qz + uvk3, q the s16 position)
enum Layout : uint8_t { FLOATS = 0, TOP = 1, WALL = 2, SOLID = 3, LAYOUTS = 4 };
struct TopV { int16_t p[3]; uint8_t ao, pad; };                              // 8 bytes: the colour a grey (the sky the face sees)
struct WallV { int16_t p[3]; uint8_t ao, sector; uint8_t c[4]; int16_t uv[2]; };   // 16 bytes
struct SolidV { int16_t p[3]; uint8_t ao, sector; uint8_t c[4]; };          // 12 bytes
struct GMesh { GVtx* v; GVtx* flat; uint16_t* idx; int32_t ni; bool col; uint8_t lay; void* cv; float org[3], size[3], us, uvk[4]; };
struct Rec { int32_t mesh, flags; uint32_t color; C3Tex* tex; float tsc[2]; C3D_Mtx mvp, model; float spec[4], emit[3]; int32_t first, count, world; };   // first, count: the range of indices drawn (a world: of the target's items)
struct GTarget {
  int32_t img, w, h; uint32_t* px; C3Tex tex; C3D_RenderTarget* rt; uint32_t clear; bool dirty;
  Rec* recs; int32_t nrec, cap;
  float amb[3], ld[4][3], lc[4][3], eye[3]; int nl;
  bool fog; float fogC[3], fogN, fogF, camN, camF;   // the frame's fog (Engine::fog) and the camera's planes, for the PICA's fog table
  WItem* wi; int32_t nwi, wcap;   // the worlds' ranges of the frame (worldDraw)
  C3D_Mtx vp;                     // the frame's projection x view
  float lut[4];                   // the planes and fog the fog table was made for
};
struct Loc { int mvp, model, base, vk, amb, ld, lc, spec, eye, emit, tsc; };
struct WLoc { int mvp, a, b, light, emit, lights; };   // a World program's uniforms: top a = pic, b = map; wall a = tsc; wall, solid b = base
// The shadows of a World (Engine::sweep, render3d.host.cpp): the 8-bit map the top program reads at texcoord 2 (255 in the light).
struct Shade { C3D_Tex tex; bool ok = false; };

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
  shaderProgram_s wprog[LAYOUTS];   // a World's programs, by layout (DVLE 1 to 3)
  WLoc wloc[LAYOUTS];
  void** dead = nullptr; int32_t ndead = 0, deadCap = 0;   // linear memory the GPU may still read: freed at the next render()
  Shade shade;

  bool open() {
    dvlb = DVLB_ParseFile((u32*)r3d_shader_shbin, r3d_shader_shbin_size);
    if (!dvlb || dvlb->numDVLE < LAYOUTS) return false;
    shaderProgramInit(&prog);
    shaderProgramSetVsh(&prog, &dvlb->DVLE[0]);
    auto u = [&](const char* n) { return (int)shaderInstanceGetUniformLocation(prog.vertexShader, n); };
    loc = Loc{u("mvp"), u("model"), u("base"), u("vk"), u("amb"), u("ld"), u("lc"), u("spec"), u("eye"), u("emit"), u("tsc")};
    for (int l = TOP; l < LAYOUTS; l++) {
      shaderProgramInit(&wprog[l]);
      shaderProgramSetVsh(&wprog[l], &dvlb->DVLE[l]);
      auto v = [&](const char* n) { return (int)shaderInstanceGetUniformLocation(wprog[l].vertexShader, n); };
      wloc[l] = WLoc{v("mvp"), v(l == TOP ? "pic" : l == WALL ? "tsc" : "base"), v(l == TOP ? "map" : "base"), v("light"), v("emit"), v("lights")};
    }
    return true;
  }
  void later(void* p) {   // freed once the GPU has finished the frame that may read it
    if (!p) return;
    dead = (void**)grown(dead, ndead, &deadCap, ndead + 1, sizeof(void*));
    dead[ndead++] = p;
  }

  GMesh* gmesh(int32_t id) { return id >= 0 && id < ngm ? gm[id] : nullptr; }
  void room(int32_t sid) {
    if (sid >= ngm) { gm = (GMesh**)realloc(gm, sizeof(GMesh*) * (size_t)(sid + 1)); for (int32_t i = ngm; i <= sid; i++) gm[i] = nullptr; ngm = sid + 1; }
  }
  int32_t keep(int32_t sid) {
    Mesh* m = meshes.at(sid);
    if (!m) return -1;
    room(sid);
    GMesh* g = (GMesh*)mem(sizeof(GMesh));
    *g = GMesh{(GVtx*)linearAlloc(sizeof(GVtx) * (size_t)m->nv), nullptr, (uint16_t*)linearAlloc(sizeof(uint16_t) * (size_t)m->ni), m->ni, m->col != nullptr, FLOATS, nullptr, {}, {}, 0, {}};
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
    if (GMesh* g = gmesh(id)) { later(g->v); later(g->idx); later(g->flat); later(g->cv); mfree(g); gm[id] = nullptr; }
    Engine::meshDestroy(id);
  }

  /** A World's batch in its layout (TOP, WALL or SOLID), from the chunk's 20-byte vertices: the mesh handle (an Engine mesh of no arrays,
   *  for its counts), -1 when linear memory is short (the float mesh is tried). */
  int32_t worldMesh(const uint8_t* rec, const uint8_t* vtx, uint32_t nv, const uint8_t* idx, uint32_t ni) override {
    const uint32_t kind = rd32(rec), flags = rd32(rec + 4);
    const bool textured = (int32_t)rd32(rec + 20) >= 0, vcol = flags & VCOL;
    const float us = rdf(rec + 76);
    auto col = [&](uint32_t v, int c) { return vcol ? vtx[(size_t)v * zn::zworld::kVertex + 10 + c] : (uint8_t)255; };
    auto h16 = [&](uint32_t v, int a) { int16_t x; memcpy(&x, vtx + (size_t)v * zn::zworld::kVertex + 2 * a, 2); return x; };
    uint8_t lay = textured ? WALL : SOLID;
    float uvk[4] = {0, 0, 0, 0};
    if (kind == zn::zworld::Top) {   // grey vertices whose uv follow the place: TOP
      bool ok = true;
      for (uint32_t v = 0; v < nv && ok; v++) ok = col(v, 0) == col(v, 1) && col(v, 1) == col(v, 2);
      for (int a = 0; a < 2 && ok && textured; a++) {   // u from x (axis 0), v from z (axis 2)
        const int ax = a ? 2 : 0;
        uint32_t lo = 0, hi = 0;
        for (uint32_t v = 1; v < nv; v++) { if (h16(v, ax) < h16(lo, ax)) lo = v; if (h16(v, ax) > h16(hi, ax)) hi = v; }
        const float q0 = h16(lo, ax), q1 = h16(hi, ax), u0 = h16(lo, 3 + a) * us, u1 = h16(hi, 3 + a) * us;
        const float k = q1 > q0 ? (u1 - u0) / (q1 - q0) : 0, b = u0 - k * q0;
        for (uint32_t v = 0; v < nv && ok; v++) ok = fabsf(k * h16(v, ax) + b - h16(v, 3 + a) * us) <= us * 1.5f + 1e-6f;
        uvk[a * 2] = k; uvk[a * 2 + 1] = b;
      }
      if (ok) lay = TOP;
    }
    static const uint32_t bytes[LAYOUTS] = {0, sizeof(TopV), sizeof(WallV), sizeof(SolidV)};
    void* cv = linearAlloc((size_t)bytes[lay] * nv);
    uint16_t* ix = (uint16_t*)linearAlloc(2 * (size_t)ni);
    if (!cv || !ix) { if (cv) linearFree(cv); if (ix) linearFree(ix); return -1; }
    for (uint32_t v = 0; v < nv; v++) {
      const uint8_t* x = vtx + (size_t)v * zn::zworld::kVertex;
      int16_t p[3]; memcpy(p, x, 6);
      // the sector the face looks to (16 around from -pi, as atan2(z, x): tokyo-pack's), 16 for what looks up or down
      const float nx = (int8_t)x[14], ny = (int8_t)x[15], nz = (int8_t)x[16];
      int sector = 16;
      if (2 * ny * ny < nx * nx + ny * ny + nz * nz) { sector = (int)floorf((atan2f(nz, nx) + 3.14159265f) * (16 / 6.2831853f)); sector = sector < 0 ? 0 : sector > 15 ? 15 : sector; }
      if (lay == TOP) { TopV& o = ((TopV*)cv)[v]; memcpy(o.p, p, 6); o.ao = col(v, 0); o.pad = 0; }
      else if (lay == WALL) {
        WallV& o = ((WallV*)cv)[v]; memcpy(o.p, p, 6); o.ao = 255; o.sector = (uint8_t)sector;
        for (int c = 0; c < 3; c++) o.c[c] = col(v, c);
        o.c[3] = 255; memcpy(o.uv, x + 6, 4);
      } else {
        SolidV& o = ((SolidV*)cv)[v]; memcpy(o.p, p, 6); o.ao = 255; o.sector = (uint8_t)sector;
        for (int c = 0; c < 3; c++) o.c[c] = col(v, c);
        o.c[3] = 255;
      }
    }
    memcpy(ix, idx, 2 * (size_t)ni);
    GSPGPU_FlushDataCache(cv, (size_t)bytes[lay] * nv);
    GSPGPU_FlushDataCache(ix, 2 * (size_t)ni);
    Mesh* m = (Mesh*)mem(sizeof(Mesh));
    *m = Mesh{(int32_t)nv, (int32_t)ni, nullptr, nullptr, nullptr, nullptr, nullptr};
    const int32_t id = meshes.add(m);
    room(id);
    GMesh* g = (GMesh*)mem(sizeof(GMesh));
    *g = GMesh{nullptr, nullptr, ix, (int32_t)ni, vcol, lay, cv, {rdf(rec + 52), rdf(rec + 56), rdf(rec + 60)}, {rdf(rec + 64), rdf(rec + 68), rdf(rec + 72)}, us,
               {uvk[0], uvk[1], uvk[2], uvk[3]}};
    gm[id] = g;
    return id;
  }

  /** A chunk's pictures go to the GPU as it loads, behind the loading screen or within the frame's reading time, not in the first frame
   *  that draws it (the opening's first frame took 48 ms uploading the city's pictures). Its night pictures only once the dusk has begun
   *  (about 5 MB of GPU memory by day): then as it loads, else a few a frame (worldDraw), the night mixing in from nothing meanwhile. */
  uint8_t* nightUp = nullptr; int32_t nNight = 0;   // by image id: its night picture is on the GPU
  bool nightReady(int32_t img) const { return img >= 0 && img < nNight && nightUp[img]; }
  void nightUpload(int32_t img) {
    int32_t tw, th;
    if (img < 0 || !zn::ff::texture(img, &tw, &th)) return;
    if (img >= nNight) { nightUp = (uint8_t*)realloc(nightUp, (size_t)img + 64); memset(nightUp + nNight, 0, (size_t)(img + 64 - nNight)); nNight = img + 64; }
    nightUp[img] = 1;
  }
  int32_t worldLoad(int32_t id, int32_t chunk) override {
    const int32_t r = Engine::worldLoad(id, chunk);
    const World* w = worlds.at(id);
    if (r <= 0 || !w) return r;
    const WChunk& k = w->k[chunk];
    int32_t tw, th;
    for (int32_t i = 0; i < k.nb; i++) {
      if (k.b[i].tex >= 0) zn::ff::texture(k.b[i].tex, &tw, &th);
      if (w->dusk > 0 && k.b[i].ntex >= 0 && k.b[i].ntex != k.b[i].tex) nightUpload(k.b[i].ntex);
    }
    return r;
  }
  /** A freed chunk's night pictures: uploaded again if their ids come back (a streamed picture's id is reused). */
  void worldFree(int32_t id, int32_t chunk) override {
    const World* w = worlds.at(id);
    if (w && chunk >= 0 && chunk < w->nk && w->k[chunk].loaded)
      for (int32_t i = 0; i < w->k[chunk].nb; i++) { const int32_t n = w->k[chunk].b[i].ntex; if (n >= 0 && n < nNight) nightUp[n] = 0; }
    Engine::worldFree(id, chunk);
  }

  /** The ranges worldSelect chose, kept for render(): the frame draws them where this record stands among the draws. */
  void worldDraw(int32_t id) override {
    World* w = worlds.at(id);
    if (!w || !gcur || !gcur->rt || !w->ni) return;
    GTarget* t = gcur;
    t->wi = (WItem*)grown(t->wi, t->nwi, &t->wcap, t->nwi + w->ni, sizeof(WItem));
    memcpy(t->wi + t->nwi, w->items, sizeof(WItem) * (size_t)w->ni);
    if (t->nrec == t->cap) { t->cap = t->cap ? t->cap * 2 : 32; t->recs = (Rec*)realloc(t->recs, sizeof(Rec) * (size_t)t->cap); }
    Rec& r = t->recs[t->nrec++];
    memset(&r, 0, sizeof r);
    r.mesh = -1; r.world = id; r.first = t->nwi; r.count = w->ni;
    t->nwi += w->ni;
    const WBatch* last = nullptr;
    int nights = 3;   // night pictures a frame may upload (171 KB of ETC1 and its mipmaps each)
    for (int32_t i = 0; i < w->ni; i++) {
      const WItem& it = w->items[i];
      tris += (int32_t)(it.to - it.from) / 3;
      const WChunk& ch = w->k[it.chunk];
      if (!ch.loaded || it.batch >= ch.nb || &ch.b[it.batch] == last) continue;
      last = &ch.b[it.batch];
      int32_t tw, th;   // the batch's pictures uploaded now, outside the GPU frame (render() finds them there)
      if (last->tex >= 0) zn::ff::texture(last->tex, &tw, &th);
      if (w->dusk > 0 && nights > 0 && last->ntex >= 0 && last->ntex != last->tex && !nightReady(last->ntex)) { nightUpload(last->ntex); nights--; }
    }
  }

  /** The shadows' map of the heights in Engine::sweep (one World at a time), swept by render() whenever the light moves. */
  bool shadowsDrawn() const override { return true; }
  void shadowsOn() override {
    Shade& s = shade;
    s.ok = C3D_TexInit(&s.tex, (u16)pow2(sweep.w), (u16)pow2(sweep.h), GPU_L8);
    if (!s.ok) return;
    memset(s.tex.data, 255, s.tex.size);   // all in the light until the first sweep
    GSPGPU_FlushDataCache(s.tex.data, s.tex.size);
    C3D_TexSetFilter(&s.tex, GPU_LINEAR, GPU_LINEAR);
    C3D_TexSetWrap(&s.tex, GPU_CLAMP_TO_EDGE, GPU_CLAMP_TO_EDGE);
  }
  void shadowsOff() override {   // a frame sent may still read the map: freed after it (later)
    if (shade.ok) later(shade.tex.data);
    shade = Shade{};
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
    release(t); mfree(t->recs); mfree(t->wi); mfree(t);
    gtargets.p[id] = nullptr;
  }
  GTarget* byImage(int32_t img) { for (int32_t i = 0; i < gtargets.n; i++) if (GTarget* t = gtargets.p[i]) if (t->img == img) return t; return nullptr; }

  void begin(int32_t id, uint32_t clear, Array<N> view, N proj_, N nearN, N farN, bool ortho) override {
    gcur = gtargets.at(id);
    if (!gcur) return;
    GTarget* t = gcur;
    tris = 0; nl = 0; amb[0] = amb[1] = amb[2] = 0;
    spec[0] = spec[1] = spec[2] = 0; emit[0] = emit[1] = emit[2] = 0;
    camera(nearN, farN, ortho);
    eyeOf(view);
    t->nrec = 0; t->nwi = 0;
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
    t->vp = proj;
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
    r.mesh = id; r.flags = flags; r.color = color; r.world = -1;
    r.tex = nullptr;
    int32_t tw = 0, th = 0;
    if (tex >= 0 && m->uv) r.tex = (C3Tex*)zn::ff::texture(tex, &tw, &th);   // uploaded now, outside the GPU frame
    if (r.tex) { r.tsc[0] = (float)tw / r.tex->t.width; r.tsc[1] = (float)th / r.tex->t.height; }
    const bool sp = !(flags & UNLIT) && specOn();
    for (int i = 0; i < 3; i++) { r.spec[i] = sp ? spec[i] * specK : 0; r.emit[i] = emit[i] / 255; }
    r.spec[3] = shin;
    r.first = rFirst; r.count = rangeCount(m);   // a range of the indices (worldDraw), else all
    tris += r.count / 3;
  }

  bool gpu() override { return true; }
  int32_t end() override {
    GTarget* t = gcur;
    if (!t) return 0;
    gcur = nullptr;
    memcpy(t->amb, amb, sizeof amb); memcpy(t->ld, ld, sizeof ld); memcpy(t->lc, lc, sizeof lc); memcpy(t->eye, eye, sizeof eye);
    t->nl = nl;
    t->fog = fogOn; memcpy(t->fogC, fogC, sizeof fogC); t->fogN = fogN; t->fogF = fogF; t->camN = camN; t->camF = camF;
    t->dirty = true;
    raster::dyn_update(t->img, nullptr, 0);   // a new picture: the frame's diff redraws its box (the GPU writes no pixels the diff could see)
    return tris;
  }
  void present(int32_t id, N x, N y, N w, N h) override {
    GTarget* t = gtargets.at(id);
    if (t && t->img >= 0) presentImage(t->img, x, y, w, h);
  }

  /** The 17 lights of a World's faces (render3d.n3ds.wall.v.pica): the ambient and the lights on a face that looks to each of the 16 sectors
   *  of the compass (tokyo-pack's: the k-th at -pi + (k + 1/2) 2 pi / 16, as atan2(z, x)), then on one that looks up; clamped, as Engine::shade. */
  static void sectorLights(const GTarget* t, float (*L)[4]) {
    for (int k = 0; k <= 16; k++) {
      float n[3] = {0, 1, 0};
      if (k < 16) { const float a = -3.14159265f + (k + 0.5f) * (6.2831853f / 16); n[0] = cosf(a); n[2] = sinf(a); n[1] = 0; }
      for (int c = 0; c < 3; c++) L[k][c] = t->amb[c];
      for (int i = 0; i < t->nl; i++) {
        const float d = -(t->ld[i][0] * n[0] + t->ld[i][1] * n[1] + t->ld[i][2] * n[2]);
        if (d > 0) for (int c = 0; c < 3; c++) L[k][c] += d * t->lc[i][c];
      }
      for (int c = 0; c < 3; c++) L[k][c] = L[k][c] > 1 ? 1 : L[k][c];
      L[k][3] = 1;
    }
  }

  /** The shadows' map follows the scene's first light: a sweep starts when the light has turned by more than a degree or the darkness of its
   *  shade has changed by 3%, and goes on a few rows a frame (all of them the first time), each row written into the map as it is done. */
  void shadows(const GTarget* t) {
    float sun[3], dark;
    ShadowSweep::light(t->nl, t->ld, t->lc, t->amb, sun, dark);
    sweep.aim(sun, dark, 8);
    const int32_t tw = shade.tex.width;
    const uint32_t k = (uint32_t)(sweep.unit * 128 * 256), sdark = (uint32_t)sweep.dark;
    uint8_t* tex = (uint8_t*)shade.tex.data;
    int32_t lo = sweep.h, hi = -1;
    sweep.rows(24, [&](int32_t z, const uint16_t* top, const uint16_t* own) {
      for (int32_t x = 0; x < sweep.w; x++) {   // the light left: 255 in it, less the deeper under the shade (2 m and more: the darkest)
        const uint32_t d = (uint32_t)(top[x] - own[x]) * k >> 8, under = d > 255 ? 255 : d;
        const uint32_t m = (x & 1) | (z & 1) << 1 | (x & 2) << 1 | (z & 2) << 2 | (x & 4) << 2 | (z & 4) << 3;
        tex[(size_t)((z >> 3) * (tw >> 3) + (x >> 3)) * 64 + m] = (uint8_t)(255 - ((under * sdark) >> 8));
      }
      lo = z < lo ? z : lo; hi = z > hi ? z : hi;
    });
    if (hi >= lo) GSPGPU_FlushDataCache(tex + (size_t)(lo >> 3) * tw * 8, (size_t)((hi >> 3) - (lo >> 3) + 1) * tw * 8);
  }

  /** A World's ranges of the frame (worldDraw), in their order (by kind, then batch): a batch's state is set when the batch changes. */
  void renderWorld(GTarget* t, const Rec& rec) {
    World* w = worlds.at(rec.world);
    if (!w) return;
    float L[17][4];
    sectorLights(t, L);
    const float night = w->dusk < 0 ? 0 : w->dusk > 1 ? 1 : w->dusk;
    const bool shadowed = shade.ok && sweep.world == rec.world;
    if (shadowed) shadows(t);
    const uint32_t nightK = (uint32_t)(night * 255 + 0.5f) * 0x010101u | 0xFF000000u;
    int lay = -1, tev = -1, cull = -1, fogged = -1, white = -1;
    C3D_Tex* bound[3] = {nullptr, nullptr, nullptr};
    const WBatch* cur = nullptr;
    GMesh* g = nullptr;
    C3D_AlphaBlend(GPU_BLEND_ADD, GPU_BLEND_ADD, GPU_ONE, GPU_ZERO, GPU_ONE, GPU_ZERO);
    C3D_DepthTest(true, GPU_GREATER, GPU_WRITE_ALL);
    auto stage = [](int i, GPU_COMBINEFUNC fn, GPU_TEVSRC a, GPU_TEVSRC b, GPU_TEVSRC c, uint32_t k) {
      C3D_TexEnv* e = C3D_GetTexEnv(i);
      C3D_TexEnvInit(e);
      C3D_TexEnvSrc(e, C3D_RGB, a, b, c);
      C3D_TexEnvFunc(e, C3D_RGB, fn);
      C3D_TexEnvColor(e, k);
      C3D_TexEnvSrc(e, C3D_Alpha, i == 0 ? GPU_PRIMARY_COLOR : GPU_PREVIOUS, GPU_PRIMARY_COLOR, GPU_PRIMARY_COLOR);
      C3D_TexEnvFunc(e, C3D_Alpha, GPU_REPLACE);
    };
    auto pass = [](int i) { C3D_TexEnvInit(C3D_GetTexEnv(i)); };
    auto bind = [&](int unit, C3D_Tex* x) { if (bound[unit] != x) { bound[unit] = x; C3D_TexBind(unit, x); } };
    for (int32_t i = rec.first; i < rec.first + rec.count; i++) {
      const WItem& it = t->wi[i];
      if (it.chunk < 0 || it.chunk >= w->nk) continue;
      const WChunk& ch = w->k[it.chunk];
      if (!ch.loaded || it.batch >= ch.nb) continue;
      const WBatch& b = ch.b[it.batch];
      if (&b != cur) {
        cur = &b;
        g = gmesh(b.mesh);
        if (!g || !g->cv) { g = nullptr; continue; }   // ponytail: a batch left as a float mesh (linear memory was short) is not drawn
        const WLoc& u = wloc[g->lay];
        const bool lit = !(b.flags & UNLIT);
        if (g->lay != lay) {   // the layout's program and loaders
          lay = g->lay;
          C3D_BindProgram(&wprog[lay]);
          C3D_AttrInfo* a = C3D_GetAttrInfo();
          AttrInfo_Init(a);
          AttrInfo_AddLoader(a, 0, GPU_SHORT, 3);                                 // the place over the box
          AttrInfo_AddLoader(a, 1, GPU_UNSIGNED_BYTE, 2);                         // the grey of a top, or the sector
          if (lay != TOP) AttrInfo_AddLoader(a, 2, GPU_UNSIGNED_BYTE, 4);         // the colour
          if (lay == WALL) AttrInfo_AddLoader(a, 3, GPU_SHORT, 2);                // the uv over the batch's scale
          tev = -1; white = -1;
        }
        if (lay != TOP && white != (lit ? 0 : 1)) {   // the 17 lights (an unlit batch: white)
          white = lit ? 0 : 1;
          C3D_FVec* l = C3D_FVUnifWritePtr(GPU_VERTEX_SHADER, u.lights, 17);
          for (int k = 0; k < 17; k++) l[k] = lit ? FVec4_New(L[k][0], L[k][1], L[k][2], 1) : FVec4_New(1, 1, 1, 1);
        }
        // the place: clip = vp x T(origin + size 32768 / 65535) x S(size / 65535)
        C3D_Mtx M, mvp;
        Mtx_Identity(&M);
        const float qk = 1 / 65535.0f, qh = 32768.0f / 65535.0f;
        M.r[0].x = g->size[0] * qk; M.r[0].w = g->org[0] + g->size[0] * qh;
        M.r[1].y = g->size[1] * qk; M.r[1].w = g->org[1] + g->size[1] * qh;
        M.r[2].z = g->size[2] * qk; M.r[2].w = g->org[2] + g->size[2] * qh;
        Mtx_Multiply(&mvp, &t->vp, &M);
        C3D_FVUnifMtx4x4(GPU_VERTEX_SHADER, u.mvp, &mvp);
        const float bc[3] = {(b.color >> 16 & 255) / 255.0f, (b.color >> 8 & 255) / 255.0f, (b.color & 255) / 255.0f};
        // the night: a batch with a picture of its own for it mixes into that picture; the others' glow goes from the day's to the night's
        const bool own = b.tex >= 0 && b.ntex >= 0 && b.ntex != b.tex;
        float e[3];
        for (int c = 0; c < 3; c++) {
          const float d = (b.emis >> (16 - 8 * c) & 255) / 255.0f, nn = (b.nemis >> (16 - 8 * c) & 255) / 255.0f;
          e[c] = own ? d : d + (nn - d) * night;
        }
        C3D_FVUnifSet(GPU_VERTEX_SHADER, u.emit, e[0], e[1], e[2], 0);
        if (lay == TOP) C3D_FVUnifSet(GPU_VERTEX_SHADER, u.light, (lit ? L[16][0] : 1) * bc[0], (lit ? L[16][1] : 1) * bc[1], (lit ? L[16][2] : 1) * bc[2], 1 / 255.0f);
        else C3D_FVUnifSet(GPU_VERTEX_SHADER, u.b, bc[0] / 255, bc[1] / 255, bc[2] / 255, 1 / 255.0f);
        // the pictures: the day's on unit 0, the night's on 1 while it mixes in, the shadows on 2 (tops)
        int32_t tw = 0, th = 0, nw = 0, nh = 0;
        C3Tex* day = b.tex >= 0 && lay != SOLID ? (C3Tex*)zn::ff::texture(b.tex, &tw, &th) : nullptr;
        C3Tex* dark = day && own && night > 0 && nightReady(b.ntex) ? (C3Tex*)zn::ff::texture(b.ntex, &nw, &nh) : nullptr;
        const bool sh = shadowed && lay == TOP;
        const int key = lay | (day ? 4 : 0) | (dark ? 8 : 0) | (sh ? 16 : 0);
        if (day) {
          const int fm = (b.flags >> 4) & 3;
          const float sx = (float)tw / day->t.width, sy = (float)th / day->t.height;
          const bool whole = sx == 1 && sy == 1;   // a power-of-two picture repeats
          auto take = [&](int unit, C3Tex* x) {    // (the filter and the wrap go to the GPU when the unit is bound)
            if (!x || bound[unit] == &x->t) return;
            C3D_TexSetFilter(&x->t, fm == 1 ? GPU_NEAREST : GPU_LINEAR, fm == 1 ? GPU_NEAREST : GPU_LINEAR);
            C3D_TexSetWrap(&x->t, whole ? GPU_REPEAT : GPU_CLAMP_TO_EDGE, whole ? GPU_REPEAT : GPU_CLAMP_TO_EDGE);
            bind(unit, &x->t);
          };
          take(0, day);
          take(1, dark);
          if (lay == TOP) C3D_FVUnifSet(GPU_VERTEX_SHADER, u.a, g->uvk[0] * sx, g->uvk[1] * sx, -g->uvk[2] * sy, 1 - g->uvk[3] * sy);
          else C3D_FVUnifSet(GPU_VERTEX_SHADER, u.a, g->us * sx, -g->us * sy, 0, 1);
        }
        if (sh) {   // the shadows' map over the heights' grid, t from the top
          const ShadowSweep& s = sweep;
          const C3D_Tex& st = shade.tex;
          const float ax = g->size[0] * qk / (st.width * s.step), bx = (g->org[0] + g->size[0] * qh - s.x0) / (st.width * s.step);
          const float az = g->size[2] * qk / (st.height * s.step), bz = (g->org[2] + g->size[2] * qh - s.z0) / (st.height * s.step);
          C3D_FVUnifSet(GPU_VERTEX_SHADER, u.b, ax, bx, -az, 1 - bz);
          bind(2, &shade.tex);
        }
        if (key != tev) {   // the combiners: (light x shadow) x picture, mixed into the night's picture by the night
          tev = key;
          int k = 0;
          if (sh) { stage(k, GPU_MODULATE, GPU_PRIMARY_COLOR, GPU_TEXTURE2, GPU_PRIMARY_COLOR, 0); k++; }
          if (day) { stage(k, GPU_MODULATE, k ? GPU_PREVIOUS : GPU_PRIMARY_COLOR, GPU_TEXTURE0, GPU_PRIMARY_COLOR, 0); k++; }
          if (dark) { stage(k, GPU_INTERPOLATE, GPU_TEXTURE1, GPU_PREVIOUS, GPU_CONSTANT, nightK); k++; }
          if (!k) { stage(k, GPU_REPLACE, GPU_PRIMARY_COLOR, GPU_PRIMARY_COLOR, GPU_PRIMARY_COLOR, 0); k++; }
          while (k < 3) pass(k++);
        }
        const int c = b.flags & DOUBLE ? 0 : 1;
        if (c != cull) { cull = c; C3D_CullFace(c ? GPU_CULL_BACK_CCW : GPU_CULL_NONE); }
        const int fo = t->fog && !(b.flags & NOFOG) ? 1 : 0;
        if (t->fog && fo != fogged) { fogged = fo; C3D_FogGasMode(fo ? GPU_FOG : GPU_NO_FOG, GPU_PLAIN_DENSITY, false); }
        static const uint8_t stride[LAYOUTS] = {0, sizeof(TopV), sizeof(WallV), sizeof(SolidV)}, count[LAYOUTS] = {0, 2, 4, 3};
        static const uint64_t perm[LAYOUTS] = {0, 0x10, 0x3210, 0x210};
        C3D_BufInfo* bi = C3D_GetBufInfo();
        BufInfo_Init(bi);
        BufInfo_Add(bi, g->cv, stride[lay], count[lay], perm[lay]);
      }
      if (!g) continue;
      C3D_DrawElements(GPU_TRIANGLES, (int)(it.to - it.from), C3D_UNSIGNED_SHORT, g->idx + it.from);
    }
    pass(1); pass(2);   // what follows draws with one stage and one texture
    C3D_TexBind(1, nullptr);
    C3D_TexBind(2, nullptr);
  }

  /** The general program and its loaders (the meshes' floats), the eye; one combiner stage. */
  void general(const GTarget* t) {
    C3D_BindProgram(&prog);
    C3D_AttrInfo* a = C3D_GetAttrInfo();
    AttrInfo_Init(a);
    AttrInfo_AddLoader(a, 0, GPU_FLOAT, 3);           // position
    AttrInfo_AddLoader(a, 1, GPU_FLOAT, 3);           // normal
    AttrInfo_AddLoader(a, 2, GPU_FLOAT, 2);           // uv
    AttrInfo_AddLoader(a, 3, GPU_UNSIGNED_BYTE, 4);   // colour, 0..255
    C3D_FVUnifSet(GPU_VERTEX_SHADER, loc.eye, t->eye[0], t->eye[1], t->eye[2], 0);
    C3D_TexEnvInit(C3D_GetTexEnv(1));
    C3D_TexEnvInit(C3D_GetTexEnv(2));
  }

  /** The recorded frame of `t` into its texture, inside the open GPU frame; c3d_n3ds.cpp's state around it. */
  void render(GTarget* t) {
    t->dirty = false;
    for (int32_t i = 0; i < ndead; i++) linearFree(dead[i]);   // the GPU has finished the frames that drew them: this one began after them
    ndead = 0;
    zn_c3d_yield();
    const C3D_AttrInfo attrs = *C3D_GetAttrInfo();
    const C3D_BufInfo bufs = *C3D_GetBufInfo();
    C3D_RenderTargetClear(t->rt, C3D_CLEAR_ALL, t->clear, 0);
    C3D_FrameDrawOn(t->rt);
    if (t->fog) {   // the PICA's fog: a table over the depth buffer's values (citro3d's FogLut_Exp, linear here), the colour after the TEV
      static C3D_FogLut lut;
      static float made[4] = {-1, -1, -1, -1};
      const float want[4] = {t->camN, t->camF, t->fogN, t->fogF};
      if (memcmp(made, want, sizeof want)) {   // made again only when the planes or the fog change
        memcpy(made, want, sizeof want);
        float data[256];
        for (int i = 0; i <= 128; i++) {
          const float x = FogLut_CalcZ(i / 128.0f, t->camN, t->camF), k = (x - t->fogN) / (t->fogF - t->fogN);
          const float val = 1 - (k < 0 ? 0 : k > 1 ? 1 : k);   // the share of the colour kept
          if (i < 128) data[i] = val;
          if (i > 0) data[i + 127] = val - data[i - 1];
        }
        FogLut_FromArray(&lut, data);
      }
      C3D_FogGasMode(GPU_FOG, GPU_PLAIN_DENSITY, false);
      C3D_FogColor((uint32_t)t->fogC[2] << 16 | (uint32_t)t->fogC[1] << 8 | (uint32_t)t->fogC[0]);
      C3D_FogLutBind(&lut);
    }
    bool inGeneral = false;
    for (int32_t k = 0; k < t->nrec; k++) {
      const Rec& r = t->recs[k];
      if (r.world >= 0) { renderWorld(t, r); inGeneral = false; continue; }
      if (!inGeneral) { general(t); inGeneral = true; }
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
      if (t->fog) C3D_FogGasMode(r.flags & NOFOG ? GPU_NO_FOG : GPU_FOG, GPU_PLAIN_DENSITY, false);
      C3D_BufInfo* b = C3D_GetBufInfo();
      BufInfo_Init(b);
      BufInfo_Add(b, v, sizeof(GVtx), 4, 0x3210);
      if (fl) C3D_DrawArrays(GPU_TRIANGLES, r.first, r.count);
      else C3D_DrawElements(GPU_TRIANGLES, r.count, C3D_UNSIGNED_SHORT, g->idx + r.first);
      if (r.tex) C3D_TexSetWrap(&r.tex->t, GPU_CLAMP_TO_EDGE, GPU_CLAMP_TO_EDGE);   // the replay's (the draw above took its own)
    }
    if (t->fog) C3D_FogGasMode(GPU_NO_FOG, GPU_PLAIN_DENSITY, false);   // the 2D replay draws without it
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
