// zinc:3d on the GPU (ZN-563): the interface and the shading of the software renderer (render3d.host.cpp, included below: the fallback
// and the oracle) on OpenGL 3.2 core / OpenGL ES 3. One vertex array per mesh, one program per kind of material (lit or unlit, smooth or
// flat, textured or not, vertex colours or not), lighting per vertex like the software one, depth test, back faces culled. A target is a
// framebuffer read back at end() into the same runtime image the software renderer fills, presented the same way. The context is SDL3's
// (the host's), like zinc:gl and display-gl. Chosen by the option "renderer" (docs/plugins/3d.md). The read is asynchronous (a pixel buffer per
// target, mapped one frame later: the image shows the previous frame, as gl.zincPresent does) except in deterministic runs (ZINC_GL_PRESENT
// chooses, as for WebGL): a synchronous read waits for the GPU and costs 2 to 3 ms a frame at 800 x 500 on the Intel Mac (ZN-563).
#define ZP_3D_GPU 1
#include "render3d.host.cpp"

#include <SDL3/SDL.h>
#ifdef __APPLE__
#include <OpenGL/gl3.h>
#else
#include <GLES3/gl3.h>
#endif
#include <stdio.h>

#ifndef ZP_3D_RENDERER
#define ZP_3D_RENDERER "auto"
#endif
#ifndef ZP_3D_MSAA
#define ZP_3D_MSAA 4
#endif
#ifndef ZP_3D_FILTER
#define ZP_3D_FILTER "mipmap"
#endif

namespace {

// GLSL ES 1.00, made GLSL 1.50 core on desktop GL by the preamble (as display-gl's zgl_program). The colour is interpolated in screen space
// (noperspective) like the software renderer's Gouraud spans; GLSL ES has no such qualifier and interpolates it with perspective.
#ifdef __APPLE__
const char* kVsPre = "#version 150\n#define attribute in\n#define varying out\n#define SCREEN noperspective\n";
const char* kFsPre = "#version 150\n#define varying in\n#define texture2D texture\nout vec4 fragColor;\n#define gl_FragColor fragColor\n#define SCREEN noperspective\n";
#else
const char* kVsPre = "#version 100\n#define SCREEN\n";
const char* kFsPre = "#version 100\n#extension GL_OES_standard_derivatives : enable\nprecision highp float;\n#define SCREEN\n";
#endif
const char* kShade = R"(
uniform vec3 u_amb, u_ld[4], u_lc[4], u_eye, u_spec;
uniform float u_shin;
vec3 shade(vec3 n, vec3 base) {  // Engine::shade: ambient + directional lights, clamped to 1 per channel
  vec3 l = u_amb;
  for (int i = 0; i < 4; i++) l += max(-dot(n, u_ld[i]), 0.0) * u_lc[i];
  return base * min(l, vec3(1.0));
}
vec3 highlight(vec3 n, vec3 p) {  // Engine::shade's specular reflection: Blinn-Phong with three.js's factor, per pixel here
  vec3 v = normalize(u_eye - p), s = vec3(0.0);
  for (int i = 0; i < 4; i++) {
    vec3 l = -u_ld[i];
    float k = dot(n, l);
    if (k > 0.0) s += k * 0.25 * (u_shin * 0.5 + 1.0) * pow(max(dot(n, normalize(l + v)), 0.0), u_shin) * u_lc[i];
  }
  return s * u_spec;
}
)";
const char* kVs = R"(
attribute vec3 a_pos;
attribute vec3 a_nrm;
attribute vec2 a_uv;
attribute vec4 a_col;
uniform mat4 u_mvp, u_model;
uniform vec3 u_color;
SCREEN varying vec3 v_col;
varying vec2 v_uv;
varying vec3 v_pos, v_nrm;
void main() {
  gl_Position = u_mvp * vec4(a_pos, 1.0);
  v_nrm = (u_model * vec4(a_nrm, 0.0)).xyz;
#ifdef VCOL
  vec3 base = a_col.bgr;
#else
  vec3 base = u_color;
#endif
#if defined(LIT) && !defined(FLAT)
  v_col = shade(normalize((u_model * vec4(a_nrm, 0.0)).xyz), base);
#else
  v_col = base;
#endif
  v_uv = a_uv;
  v_pos = (u_model * vec4(a_pos, 1.0)).xyz;
}
)";
// Flat: the face normal from the derivatives of the world position (the projection flips y, hence the minus), turned away on a back face
// like the software renderer's winding-order normal. ponytail: flat faces with vertex colours interpolate them instead of averaging them.
const char* kFs = R"(
uniform sampler2D u_tex;
#ifdef EMIT
uniform vec3 u_emit;   // the emissive colour (ZN-696), added to the light before the texture, as the software renderer does
#endif
#ifdef BLEND
uniform float u_alpha;   // the opacity of a blended draw
#endif
SCREEN varying vec3 v_col;
varying vec2 v_uv;
varying vec3 v_pos, v_nrm;
void main() {
  vec3 c = v_col;
#if defined(LIT) && defined(FLAT)
  vec3 n = -normalize(cross(dFdx(v_pos), dFdy(v_pos)));
  if (!gl_FrontFacing) n = -n;
  c = shade(n, c);
#endif
#if defined(LIT) && defined(SPEC)   // before the texture, like the software renderer's per-vertex colour
#ifdef FLAT
  c = min(c + highlight(n, v_pos), vec3(1.0));
#else
  c = min(c + highlight(normalize(v_nrm), v_pos), vec3(1.0));
#endif
#endif
#ifdef EMIT
  c = min(c + u_emit, vec3(1.0));
#endif
#ifdef TEX
  c *= texture2D(u_tex, v_uv).rgb;
#endif
#ifdef BLEND
  gl_FragColor = vec4(c.bgr, u_alpha);  // blended with this alpha; the framebuffer's alpha is masked off and stays 0
#else
  gl_FragColor = vec4(c.bgr, 0.0);  // stored B, G, R, 0: read back as RGBA bytes, these are the runtime's 0x00RRGGBB words
#endif
}
)";

enum { P_LIT = 1, P_FLAT = 2, P_TEX = 4, P_VCOL = 8, P_SPEC = 16, P_EMIT = 32, P_BLEND = 64 };   // EMIT, BLEND: ZN-696; an opaque draw without them keeps the programs it had
struct Prog { GLuint id = 0; GLint mvp = -1, model = -1, color = -1, amb = -1, ld = -1, lc = -1, eye = -1, spec = -1, shin = -1, emit = -1, alpha = -1; uint32_t frame = 0; bool failed = false;
  float emitSet[3] = {0, 0, 0}, alphaSet = 0; };   // the values its uniforms hold (a program keeps them): sent again only when they change
struct GMesh { GLuint vao, vbo, ibo; int32_t ni; bool uv, col; };
// msfbo (ZN-657): the multisampled framebuffer the frame is drawn into, resolved into fbo (whose colour texture is read back) at end()
struct GTarget { int32_t img, w, h; uint32_t* px; GLuint fbo, color, depth, pbo[2], msfbo, mscolor, msdepth; int k, samples; bool pending[2]; };
struct GTex { GLuint id = 0; uint32_t version = 0; int filter = 0; bool mips = false; };   // filter: the one set on the texture (1 nearest, 2 linear, 3 mipmaps)

GLuint shader(GLenum kind, const char* pre, const char* defs, const char* body) {
  GLuint s = glCreateShader(kind);
  const char* src[4] = {pre, defs, kShade, body};
  glShaderSource(s, 4, src, nullptr);
  glCompileShader(s);
  GLint ok = 0;
  glGetShaderiv(s, GL_COMPILE_STATUS, &ok);
  if (!ok) { char log[512] = ""; glGetShaderInfoLog(s, sizeof log, nullptr, log); fprintf(stderr, "zinc:3d: shader: %s\n", log); }
  return s;
}

struct Gpu : Engine {
  SDL_Window* win = nullptr;
  SDL_GLContext ctx = nullptr;
  Pool<GMesh> gmeshes;
  Pool<GTarget> gtargets;
  GTarget* gcur = nullptr;
  Prog progs[128];
  GTex* texs = nullptr;  // by image: the baked ones, then the runtime ones (no STL here: zrt.h defines placement new)
  int32_t ntex = 0;
  uint32_t frame = 0;
  GLuint used = 0;
  int cull = -1;
  int blendOn = -1;   // the blend mode applied (ZN-696): -1 none yet this frame
  bool async = true;
  int samples = 0;       // multisampling of the targets (the `msaa` option or ZINC_3D_MSAA, at most GL_MAX_SAMPLES; 0 or 1 off)
  int filter = 3;        // the texture filter of a material that asks for none (the `filter` option or ZINC_3D_FILTER)

  bool open() {
    if (!SDL_WasInit(SDL_INIT_VIDEO) && !SDL_InitSubSystem(SDL_INIT_VIDEO)) return false;
    SDL_GL_ResetAttributes();
#ifdef __APPLE__
    SDL_GL_SetAttribute(SDL_GL_CONTEXT_PROFILE_MASK, SDL_GL_CONTEXT_PROFILE_CORE);
    SDL_GL_SetAttribute(SDL_GL_CONTEXT_MAJOR_VERSION, 3);
    SDL_GL_SetAttribute(SDL_GL_CONTEXT_MINOR_VERSION, 2);
    SDL_GL_SetAttribute(SDL_GL_CONTEXT_FLAGS, SDL_GL_CONTEXT_FORWARD_COMPATIBLE_FLAG);
#else
    SDL_GL_SetAttribute(SDL_GL_CONTEXT_PROFILE_MASK, SDL_GL_CONTEXT_PROFILE_ES);
    SDL_GL_SetAttribute(SDL_GL_CONTEXT_MAJOR_VERSION, 3);
    SDL_GL_SetAttribute(SDL_GL_CONTEXT_MINOR_VERSION, 0);
#endif
    win = SDL_CreateWindow("zinc:3d", 16, 16, SDL_WINDOW_OPENGL | SDL_WINDOW_HIDDEN);
    if (win) ctx = SDL_GL_CreateContext(win);
    if (!ctx) { if (win) SDL_DestroyWindow(win); win = nullptr; return false; }
    glEnable(GL_DEPTH_TEST);
    glDepthFunc(GL_LESS);
    glCullFace(GL_BACK);
    glFrontFace(GL_CW);  // counter-clockwise faces are the front ones; the projection flips y so that rows read back top first
    glPixelStorei(GL_PACK_ALIGNMENT, 4);
    const char* e = getenv("ZINC_GL_PRESENT");
    async = e && *e ? !strcmp(e, "async") : !getenv("ZINC_DETERMINISTIC");
    const char* ms = getenv("ZINC_3D_MSAA");
    GLint most = 0;
    glGetIntegerv(GL_MAX_SAMPLES, &most);
    samples = ms && *ms ? atoi(ms) : ZP_3D_MSAA;
    if (samples > most) samples = most;
    if (samples < 2) samples = 0;
    const char* fl = getenv("ZINC_3D_FILTER");
    const char* f = fl && *fl ? fl : ZP_3D_FILTER;
    filter = !strcmp(f, "nearest") ? 1 : !strcmp(f, "linear") ? 2 : 3;
    return true;
  }
  void current() { if (SDL_GL_GetCurrentContext() != ctx) SDL_GL_MakeCurrent(win, ctx); }  // zinc:gl's contexts live beside this one

  Prog& program(int k) {
    Prog& p = progs[k];
    if (p.id || p.failed) return p;
    char defs[128];
    snprintf(defs, sizeof defs, "%s%s%s%s%s%s%s", k & P_LIT ? "#define LIT\n" : "", k & P_FLAT ? "#define FLAT\n" : "", k & P_TEX ? "#define TEX\n" : "", k & P_VCOL ? "#define VCOL\n" : "", k & P_SPEC ? "#define SPEC\n" : "", k & P_EMIT ? "#define EMIT\n" : "", k & P_BLEND ? "#define BLEND\n" : "");
    GLuint vs = shader(GL_VERTEX_SHADER, kVsPre, defs, kVs), fs = shader(GL_FRAGMENT_SHADER, kFsPre, defs, kFs);
    p.id = glCreateProgram();
    glAttachShader(p.id, vs); glAttachShader(p.id, fs);
    glBindAttribLocation(p.id, 0, "a_pos"); glBindAttribLocation(p.id, 1, "a_nrm"); glBindAttribLocation(p.id, 2, "a_uv"); glBindAttribLocation(p.id, 3, "a_col");
    glLinkProgram(p.id);
    glDeleteShader(vs); glDeleteShader(fs);
    GLint ok = 0;
    glGetProgramiv(p.id, GL_LINK_STATUS, &ok);
    if (!ok) { char log[512] = ""; glGetProgramInfoLog(p.id, sizeof log, nullptr, log); fprintf(stderr, "zinc:3d: program: %s\n", log); glDeleteProgram(p.id); p.id = 0; p.failed = true; return p; }
    p.mvp = glGetUniformLocation(p.id, "u_mvp"); p.model = glGetUniformLocation(p.id, "u_model"); p.color = glGetUniformLocation(p.id, "u_color");
    p.amb = glGetUniformLocation(p.id, "u_amb"); p.ld = glGetUniformLocation(p.id, "u_ld"); p.lc = glGetUniformLocation(p.id, "u_lc");
    p.eye = glGetUniformLocation(p.id, "u_eye"); p.spec = glGetUniformLocation(p.id, "u_spec"); p.shin = glGetUniformLocation(p.id, "u_shin");
    p.emit = glGetUniformLocation(p.id, "u_emit"); p.alpha = glGetUniformLocation(p.id, "u_alpha");
    glUseProgram(p.id);
    glUniform1i(glGetUniformLocation(p.id, "u_tex"), 0);
    used = p.id;
    return p;
  }

  // The software renderer builds the mesh (normals, index checks); its arrays go into one interleaved buffer, then are freed.
  int32_t meshCreate(Array<N> pos, Array<N> nrm, Array<N> uv, Array<uint32_t> col, Array<int32_t> idx) override {
    int32_t sid = Engine::meshCreate(pos, nrm, uv, col, idx);
    Mesh* m = meshes.at(sid);
    if (!m) return -1;
    current();
    struct Vtx { float p[3], n[3], t[2]; uint32_t c; };
    Vtx* v = (Vtx*)mem(sizeof(Vtx) * (size_t)m->nv);
    for (int32_t i = 0; i < m->nv; i++) {
      memcpy(v[i].p, m->pos + i * 3, 12); memcpy(v[i].n, m->nrm + i * 3, 12);
      v[i].t[0] = m->uv ? m->uv[i * 2] : 0; v[i].t[1] = m->uv ? m->uv[i * 2 + 1] : 0;
      v[i].c = m->col ? m->col[i] : 0;
    }
    GMesh* g = (GMesh*)mem(sizeof(GMesh));
    *g = GMesh{0, 0, 0, m->ni, m->uv != nullptr, m->col != nullptr};
    glGenVertexArrays(1, &g->vao); glBindVertexArray(g->vao);
    glGenBuffers(1, &g->vbo); glBindBuffer(GL_ARRAY_BUFFER, g->vbo);
    glBufferData(GL_ARRAY_BUFFER, (GLsizeiptr)(sizeof(Vtx) * (size_t)m->nv), v, GL_STATIC_DRAW);
    glGenBuffers(1, &g->ibo); glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, g->ibo);
    glBufferData(GL_ELEMENT_ARRAY_BUFFER, (GLsizeiptr)(sizeof(uint16_t) * (size_t)m->ni), m->idx, GL_STATIC_DRAW);
    glEnableVertexAttribArray(0); glVertexAttribPointer(0, 3, GL_FLOAT, GL_FALSE, sizeof(Vtx), (void*)0);
    glEnableVertexAttribArray(1); glVertexAttribPointer(1, 3, GL_FLOAT, GL_FALSE, sizeof(Vtx), (void*)12);
    glEnableVertexAttribArray(2); glVertexAttribPointer(2, 2, GL_FLOAT, GL_FALSE, sizeof(Vtx), (void*)24);
    glEnableVertexAttribArray(3); glVertexAttribPointer(3, 4, GL_UNSIGNED_BYTE, GL_TRUE, sizeof(Vtx), (void*)32);
    glBindVertexArray(0);
    mfree(v);
    Engine::meshDestroy(sid);
    return gmeshes.add(g);
  }
  // A .zmesh part (ZN-441): its vertex arrays go up as they are, one buffer with a range per attribute, then its indices.
  int32_t meshLoad(Array<uint8_t> data, int32_t at) override {
    uint32_t nv, ni, flags;
    const uint8_t* p = zpart(data, at, &nv, &ni, &flags);
    if (!p) return -1;
    current();
    const bool uv = flags & zn::zmesh::Uvs, col = flags & zn::zmesh::Colors;
    const size_t vb = zn::zmesh::vertexBytes(nv, flags);
    GMesh* g = (GMesh*)mem(sizeof(GMesh));
    *g = GMesh{0, 0, 0, (int32_t)ni, uv, col};
    glGenVertexArrays(1, &g->vao); glBindVertexArray(g->vao);
    glGenBuffers(1, &g->vbo); glBindBuffer(GL_ARRAY_BUFFER, g->vbo);
    glBufferData(GL_ARRAY_BUFFER, (GLsizeiptr)vb, p, GL_STATIC_DRAW);
    glGenBuffers(1, &g->ibo); glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, g->ibo);
    glBufferData(GL_ELEMENT_ARRAY_BUFFER, (GLsizeiptr)(2 * (size_t)ni), p + vb, GL_STATIC_DRAW);
    size_t o = 0;
    glEnableVertexAttribArray(0); glVertexAttribPointer(0, 3, GL_FLOAT, GL_FALSE, 12, (void*)o); o += 12 * (size_t)nv;
    glEnableVertexAttribArray(1); glVertexAttribPointer(1, 3, GL_FLOAT, GL_FALSE, 12, (void*)o); o += 12 * (size_t)nv;
    if (uv) { glEnableVertexAttribArray(2); glVertexAttribPointer(2, 2, GL_FLOAT, GL_FALSE, 8, (void*)o); o += 8 * (size_t)nv; }
    if (col) { glEnableVertexAttribArray(3); glVertexAttribPointer(3, 4, GL_UNSIGNED_BYTE, GL_TRUE, 4, (void*)o); }
    glBindVertexArray(0);
    return gmeshes.add(g);
  }
  void meshDestroy(int32_t id) override {
    GMesh* g = gmeshes.at(id);
    if (!g) return;
    current();
    glDeleteVertexArrays(1, &g->vao); glDeleteBuffers(1, &g->vbo); glDeleteBuffers(1, &g->ibo);
    mfree(g);
    gmeshes.p[id] = nullptr;
  }

  int32_t target(int32_t id, int32_t w, int32_t h) override {
    w = w / ZP_3D_SCALE; h = h / ZP_3D_SCALE;
    if (w < 1) w = 1;
    if (h < 1) h = 1;
    GTarget* t = gtargets.at(id);
    if (t && t->w == w && t->h == h) return id;
    current();
    if (t) release(t);
    else { t = (GTarget*)mem(sizeof(GTarget)); id = gtargets.add(t); }
    t->w = w; t->h = h;
    t->px = (uint32_t*)mem((size_t)w * h * 4);
    memset(t->px, 0, (size_t)w * h * 4);
    t->img = raster::dyn_wrap(w, h, t->px, w);
    // the colour in a texture: Apple's GL (on Metal, Intel Mac) fills a pixel buffer read from an RGBA8 renderbuffer with garbage
    glGenTextures(1, &t->color); glBindTexture(GL_TEXTURE_2D, t->color);
    glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA8, w, h, 0, GL_RGBA, GL_UNSIGNED_BYTE, nullptr);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_NEAREST);
    glGenRenderbuffers(1, &t->depth); glBindRenderbuffer(GL_RENDERBUFFER, t->depth); glRenderbufferStorage(GL_RENDERBUFFER, GL_DEPTH_COMPONENT24, w, h);
    glGenFramebuffers(1, &t->fbo); glBindFramebuffer(GL_FRAMEBUFFER, t->fbo);
    glFramebufferTexture2D(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_TEXTURE_2D, t->color, 0);
    glFramebufferRenderbuffer(GL_FRAMEBUFFER, GL_DEPTH_ATTACHMENT, GL_RENDERBUFFER, t->depth);
    t->samples = samples;
    t->msfbo = t->mscolor = t->msdepth = 0;
    if (t->samples) {   // drawn here, resolved into the texture above
      glGenRenderbuffers(1, &t->mscolor); glBindRenderbuffer(GL_RENDERBUFFER, t->mscolor); glRenderbufferStorageMultisample(GL_RENDERBUFFER, t->samples, GL_RGBA8, w, h);
      glGenRenderbuffers(1, &t->msdepth); glBindRenderbuffer(GL_RENDERBUFFER, t->msdepth); glRenderbufferStorageMultisample(GL_RENDERBUFFER, t->samples, GL_DEPTH_COMPONENT24, w, h);
      glGenFramebuffers(1, &t->msfbo); glBindFramebuffer(GL_FRAMEBUFFER, t->msfbo);
      glFramebufferRenderbuffer(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_RENDERBUFFER, t->mscolor);
      glFramebufferRenderbuffer(GL_FRAMEBUFFER, GL_DEPTH_ATTACHMENT, GL_RENDERBUFFER, t->msdepth);
      if (glCheckFramebufferStatus(GL_FRAMEBUFFER) != GL_FRAMEBUFFER_COMPLETE) {   // no multisampling for this size or format: the plain framebuffer
        glDeleteFramebuffers(1, &t->msfbo); glDeleteRenderbuffers(1, &t->mscolor); glDeleteRenderbuffers(1, &t->msdepth);
        t->msfbo = t->mscolor = t->msdepth = 0; t->samples = 0;
      }
    }
    glGenBuffers(2, t->pbo);
    for (GLuint b : t->pbo) { glBindBuffer(GL_PIXEL_PACK_BUFFER, b); glBufferData(GL_PIXEL_PACK_BUFFER, (GLsizeiptr)w * h * 4, nullptr, GL_STREAM_READ); }
    glBindBuffer(GL_PIXEL_PACK_BUFFER, 0);
    t->k = 0; t->pending[0] = t->pending[1] = false;
    return id;
  }
  void release(GTarget* t) {
    if (gcur == t) gcur = nullptr;
    raster::dyn_destroy(t->img); mfree(t->px);
    glDeleteFramebuffers(1, &t->fbo); glDeleteTextures(1, &t->color); glDeleteRenderbuffers(1, &t->depth); glDeleteBuffers(2, t->pbo);
    if (t->msfbo) { glDeleteFramebuffers(1, &t->msfbo); glDeleteRenderbuffers(1, &t->mscolor); glDeleteRenderbuffers(1, &t->msdepth); }
  }
  void targetDestroy(int32_t id) override {
    GTarget* t = gtargets.at(id);
    if (!t) return;
    current();
    release(t); mfree(t);
    gtargets.p[id] = nullptr;
  }

  void begin(int32_t id, uint32_t clear, Array<N> view, N proj, N nearN, N farN, bool ortho) override {
    gcur = gtargets.at(id);
    if (!gcur) return;
    current();
    tris = 0; nl = 0; amb[0] = amb[1] = amb[2] = 0;
    frame++;
    glBindFramebuffer(GL_FRAMEBUFFER, gcur->samples ? gcur->msfbo : gcur->fbo);
    glViewport(0, 0, gcur->w, gcur->h);
    if (blendOn > 0) { glDisable(GL_BLEND); glDepthMask(GL_TRUE); glColorMask(GL_TRUE, GL_TRUE, GL_TRUE, GL_TRUE); }   // the last frame's blended draws: the clear needs the masks on
    glClearColor((clear & 255) / 255.0f, (clear >> 8 & 255) / 255.0f, (clear >> 16 & 255) / 255.0f, 0);  // blue first, as the shaders write
    glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);
    viewProjection(vp, (float)gcur->w / gcur->h, view, proj, nearN, farN, ortho);
    eyeOf(view);
    spec[0] = spec[1] = spec[2] = 0;
    emit[0] = emit[1] = emit[2] = 0;
    blendOn = -1;
    for (int c = 0; c < 4; c++) vp[c * 4 + 1] = -vp[c * 4 + 1];  // y down: row 0 of the framebuffer is the top of the image
  }

  /** Binds image `id` (a baked image or a runtime one, re-uploaded when its version moves) to unit 0 with filter `f` (1 nearest, 2 linear,
   *  3 mipmaps, built when first needed after an upload); false when there is no such image. */
  bool texture(int32_t id, int f) {
    const bool baked = id < raster::image_count;
    const int32_t i = baked ? id : id - raster::DYN_BASE + raster::image_count;
    if (id < 0 || (!baked && id < raster::DYN_BASE)) return false;
    if (i >= ntex) {
      int32_t n = i + 16;
      texs = (GTex*)realloc(texs, sizeof(GTex) * (size_t)n);
      memset((void*)(texs + ntex), 0, sizeof(GTex) * (size_t)(n - ntex));
      ntex = n;
    }
    GTex& t = texs[i];
    const uint32_t version = baked ? 1 : raster::image_version(id) + 1;
    if (t.id && t.version == version) { glBindTexture(GL_TEXTURE_2D, t.id); filterOf(t, f); return true; }
    const uint32_t* px = nullptr;
    int32_t w = 0, h = 0, stride = 0;
    if (!baked && !(raster::dyn_view(id, &px, &w, &h, &stride) && w > 0 && h > 0)) { if (t.id) glDeleteTextures(1, &t.id); t = GTex{}; return false; }
    if (!t.id) {
      glGenTextures(1, &t.id);
      glBindTexture(GL_TEXTURE_2D, t.id);
      glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_NEAREST);  // the software renderer samples the nearest texel and repeats
      glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_NEAREST);
      glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_REPEAT);
      glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_REPEAT);
    } else glBindTexture(GL_TEXTURE_2D, t.id);
    if (baked) {
      const raster::Image& im = raster::images[id];
      glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA8, im.w, im.h, 0, GL_RGBA, GL_UNSIGNED_BYTE, im.rgba);
    } else {
#ifdef __APPLE__
      glPixelStorei(GL_UNPACK_ROW_LENGTH, stride);
      glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA8, w, h, 0, GL_BGRA, GL_UNSIGNED_INT_8_8_8_8_REV, px);
      glPixelStorei(GL_UNPACK_ROW_LENGTH, 0);
#else
      uint8_t* rgba = (uint8_t*)mem((size_t)w * h * 4);  // GLES has no BGRA upload
      for (int32_t y = 0; y < h; y++)
        for (int32_t x = 0; x < w; x++) { uint32_t c = px[(size_t)y * stride + x]; uint8_t* o = rgba + ((size_t)y * w + x) * 4; o[0] = c >> 16; o[1] = c >> 8; o[2] = c; o[3] = 255; }
      glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA8, w, h, 0, GL_RGBA, GL_UNSIGNED_BYTE, rgba);
      mfree(rgba);
#endif
    }
    t.version = version;
    t.mips = false;
    t.filter = 0;
    filterOf(t, f);
    return true;
  }
  /** The bound texture `t` sampled with filter `f` (ZN-657). */
  static void filterOf(GTex& t, int f) {
    if (f == 3 && !t.mips) { glGenerateMipmap(GL_TEXTURE_2D); t.mips = true; }
    if (t.filter == f) return;
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, f == 1 ? GL_NEAREST : f == 2 ? GL_LINEAR : GL_LINEAR_MIPMAP_LINEAR);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, f == 1 ? GL_NEAREST : GL_LINEAR);
    t.filter = f;
  }

  void draw(int32_t id, Array<N> model, uint32_t color, int32_t tex, int32_t flags) override {
    GMesh* g = gmeshes.at(id);
    if (!g || !gcur) return;
    float M[16], MVP[16];
    for (int i = 0; i < 16; i++) M[i] = i < model.length() ? F(model.a->data[i]) : (i % 5 == 0 ? 1.0f : 0.0f);
    mul(MVP, vp, M);
    const int f = (flags >> 4) & 3;
    const bool textured = tex >= 0 && g->uv && texture(tex, f ? f : filter);
    const int bl = (flags >> 6) & 3;
    const int k = (flags & UNLIT ? 0 : P_LIT | (specOn() ? P_SPEC : 0)) | (flags & FLAT ? P_FLAT : 0) | (textured ? P_TEX : 0) | ((flags & VCOL) && g->col ? P_VCOL : 0) |
                  (emitOn() ? P_EMIT : 0) | (bl == ALPHA || bl == ADD ? P_BLEND : 0);
    Prog& p = program(k);
    if (!p.id) return;
    if (used != p.id) { glUseProgram(p.id); used = p.id; }
    if (p.frame != frame && (k & P_LIT)) {  // the lights of this frame, once per program
      float d[12] = {0}, c[12] = {0};
      for (int i = 0; i < nl; i++) for (int j = 0; j < 3; j++) { d[i * 3 + j] = ld[i][j]; c[i * 3 + j] = lc[i][j]; }
      glUniform3fv(p.amb, 1, amb); glUniform3fv(p.ld, 4, d); glUniform3fv(p.lc, 4, c);
      if (k & P_SPEC) glUniform3fv(p.eye, 1, eye);
      p.frame = frame;
    }
    if (k & P_SPEC) { glUniform3fv(p.spec, 1, spec); glUniform1f(p.shin, shin); }
    glUniformMatrix4fv(p.mvp, 1, GL_FALSE, MVP);
    glUniformMatrix4fv(p.model, 1, GL_FALSE, M);
    glUniform3f(p.color, (color >> 16 & 255) / 255.0f, (color >> 8 & 255) / 255.0f, (color & 255) / 255.0f);
    if ((k & P_EMIT) && (emit[0] != p.emitSet[0] || emit[1] != p.emitSet[1] || emit[2] != p.emitSet[2])) {
      glUniform3f(p.emit, emit[0] / 255.0f, emit[1] / 255.0f, emit[2] / 255.0f);
      p.emitSet[0] = emit[0]; p.emitSet[1] = emit[1]; p.emitSet[2] = emit[2];
    }
    // blending (ZN-696): over or added to the frame with the draw's opacity; depth tested, not written, and the framebuffer's alpha left at 0
    if (bl != blendOn) {
      if (bl == ALPHA || bl == ADD) { glEnable(GL_BLEND); glBlendFunc(GL_SRC_ALPHA, bl == ADD ? GL_ONE : GL_ONE_MINUS_SRC_ALPHA); glDepthMask(GL_FALSE); glColorMask(GL_TRUE, GL_TRUE, GL_TRUE, GL_FALSE); }
      else { glDisable(GL_BLEND); glDepthMask(GL_TRUE); glColorMask(GL_TRUE, GL_TRUE, GL_TRUE, GL_TRUE); }
      blendOn = bl;
    }
    if (k & P_BLEND) { const float alpha = ((flags >> 8) & 255) / 255.0f; if (alpha != p.alphaSet) { glUniform1f(p.alpha, alpha); p.alphaSet = alpha; } }
    const int c = flags & DOUBLE ? 0 : 1;
    if (c != cull) { if (c) glEnable(GL_CULL_FACE); else glDisable(GL_CULL_FACE); cull = c; }
    glBindVertexArray(g->vao);
    glDrawElements(GL_TRIANGLES, g->ni, GL_UNSIGNED_SHORT, (void*)0);
    tris += g->ni / 3;  // triangles drawn, before culling (three.js's renderer.info counts them so too)
  }

  /** The framebuffer into `dst` (a pixel buffer offset when one is bound): 0x00RRGGBB words, the shaders write blue first and alpha 0. RGBA bytes
   *  are the format every driver reads without converting: GL_BGRA made the Intel Mac's read synchronous (2.5 ms instead of 0.07 at 800 x 500). */
  static void read(GTarget* t, void* dst) { glReadPixels(0, 0, t->w, t->h, GL_RGBA, GL_UNSIGNED_BYTE, dst); }
  bool gpu() override { return true; }
  int32_t end() override {
    GTarget* t = gcur;
    if (!t) return 0;
    gcur = nullptr;
    if (t->samples) {   // the multisampled frame resolved into the texture that is read back
      glBindFramebuffer(GL_READ_FRAMEBUFFER, t->msfbo);
      glBindFramebuffer(GL_DRAW_FRAMEBUFFER, t->fbo);
      glBlitFramebuffer(0, 0, t->w, t->h, 0, 0, t->w, t->h, GL_COLOR_BUFFER_BIT, GL_NEAREST);
      glBindFramebuffer(GL_FRAMEBUFFER, t->fbo);
    }
    if (!async) {
      read(t, t->px);
      raster::dyn_update(t->img, nullptr, 0);
      return tris;
    }
    glBindBuffer(GL_PIXEL_PACK_BUFFER, t->pbo[t->k]);  // this frame's read starts; the previous one's is done by now
    read(t, nullptr);
    glFlush();  // the GPU starts on the frame now, not when the next frame maps it
    t->pending[t->k] = true;
    t->k ^= 1;
    if (t->pending[t->k]) {
      glBindBuffer(GL_PIXEL_PACK_BUFFER, t->pbo[t->k]);
      if (const void* p = glMapBufferRange(GL_PIXEL_PACK_BUFFER, 0, (GLsizeiptr)t->w * t->h * 4, GL_MAP_READ_BIT)) { memcpy(t->px, p, (size_t)t->w * t->h * 4); glUnmapBuffer(GL_PIXEL_PACK_BUFFER); }
      t->pending[t->k] = false;
      raster::dyn_update(t->img, nullptr, 0);
    }
    glBindBuffer(GL_PIXEL_PACK_BUFFER, 0);
    return tris;
  }
  void present(int32_t id, N x, N y, N w, N h) override {
    GTarget* t = gtargets.at(id);
    if (t && t->img >= 0) presentImage(t->img, x, y, w, h);
  }
};

}  // namespace

/** "renderer" (ZINC_3D overrides it): software, gpu, or auto = the GPU unless the run is deterministic (its goldens are the software frames). */
NativeRender3D* gpuRenderer() {
  const char* e = getenv("ZINC_3D");
  const char* want = e && *e ? e : ZP_3D_RENDERER;
  if (!strcmp(want, "software") || (!strcmp(want, "auto") && getenv("ZINC_DETERMINISTIC"))) return nullptr;
  static Gpu g;
  static bool tried = false, ok = false;
  if (!tried) {
    tried = true;
    ok = g.open();
    if (!ok) fprintf(stderr, "zinc:3d: no GPU context (%s); drawing with the software renderer\n", SDL_GetError());
  }
  if (!ok) return nullptr;
  g.rc = zrt::IMMORTAL;
  return &g;
}
