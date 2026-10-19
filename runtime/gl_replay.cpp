// The GL replay: draws the frame's commands (zrt::raster::Cmd) with OpenGL instead of asking the software rasterizer for pixels
// (docs/reports/gpu-renderer-design.md, phase 1). The result goes to an RGBA texture of the surface size (or straight into the window),
// which the includer presents. The pixels follow runtime/raster.cpp: the coverage of a rounded box is 0.5 - sdf at the pixel centre,
// glyphs sit on integer pixels, rounded CLIPs restore the corners. GLSL ES 1.00 dialect.
// Included by its users, whose GL headers and `zgl_program` (shader preamble) it uses: plugins/display-gl/src/display_gl.cpp and the
// SDL window, targets/macos/hal_sdl.cpp (ZN-412.02). Everything is static: each user has its own copy. GLR_CORE: 1 on a desktop core
// profile (macOS, glad), 0 on GLES 2.
#ifndef GLR_CORE
#ifdef __APPLE__
#define GLR_CORE 1
#else
#define GLR_CORE 0
#endif
#endif
#include "zrt_raster.h"
#include "gl_caps.h"
#if __has_include("zn/resource_stats.h")
#include "zn/resource_stats.h"
#endif
#include <math.h>     // cosf, fabsf: libstdc++ does not bring it in through the headers above, as libc++ does
#include <string.h>
#include <thread>
#include <time.h>

namespace glr {
using namespace zrt::raster;

// vertex: position + uv, box (centre, half size), params (radius, border / blur, mode, gradient), two colours
struct V { float x, y, u, v, bx, by, bw, bh, r, p1, mode, grad; uint8_t c1[4], c2[4]; float z; };   // z: the command's depth (occlusion, ZN-412.01)
static const int MAXQ = 8192, ATLAS = 1024, CORNER = 32, LEVELS = 16;

#include "gl_replay_shaders.h"   // Mode, VS, FS (the commands), SVS, SFS (the occlusion pass), FVS, FFS (the stencil pass)
struct SV { float x0, y0, x1, y1; uint8_t c[4]; float z; };   // a rectangle (instanced) or, on GLES 2, x, y, c, z of one corner in its first 16 bytes

struct Tex2 { GLuint id; int32_t key; uint32_t ver; int32_t w, h; const void* px; int nearest, cmp; uint64_t bytes; };   // cmp: level 0 is GPU blocks (1), premultiplied ones (2)
static Tex2* texs;                  // by runtime image index (id - DYN_BASE), grown on demand (ZN-670: thousands of runtime images)
static int32_t ntexs = 0;
static Tex2* baked;                 // by baked image index
struct GSlot { uint64_t key; int16_t ax, ay; };
static GSlot gtab[8192];
static int gcount, gx, gy, growh;

#if __has_include("zn/resource_stats.h")
static ZnResourceStats replay_texture_stats(void*) {
  ZnResourceStats s{};
  for (int32_t i = 0; i < ntexs; ++i) if (texs[i].id) { ++s.objects; s.gpuBytes += texs[i].bytes; }
  if (baked) for (int32_t i = 0; i < image_count; ++i) if (baked[i].id) { ++s.objects; s.gpuBytes += baked[i].bytes; }
  return s;
}
static ZnResourceStatsRegistration replay_stats_registration("renderer.textures", replay_texture_stats);
#endif
static int32_t W, H;
// The render target's allocated size: at least the surface, more when a display reserves room to change size in place (reserve()): a GPU
// that cannot reallocate a texture attached to a framebuffer (the Adreno 220 of the TouchPad answers GL_OUT_OF_MEMORY) never has to.
static int32_t TW, TH, RW, RH;
static GLuint vbo, ibo, fbo, fbo_tex, fbo_depth, white, atlas, corner_tex, cur_tex;
// The programs that draw the commands. Desktop GL: one, with a branch per mode. GLES 2: one per mode, and one more with the gradient paint
// block, compiled at first use (ZN-725): a GPU without branches runs every mode of the single program for each pixel, VideoCore IV took
// 181 ms for a map frame that takes 65 this way (docs/reports/raspberry-pi.md). A batch is then drawn run by run, a run being its consecutive quads of one
// program, so the paint order stays. Uniforms belong to a program: use_prog() gives it the frame's (size, flip) at its first use in the
// frame, and the code that draws a mode sets that mode's own (edge, paint, convex) on the program use_prog() returns.
struct Prog { GLuint id; GLint u_res, u_flip, u_edge, u_g0, u_g1, u_gc, u_go, u_cv, u_cvn, u_ca0, u_ca1, u_cr; uint32_t stamp, cgen; bool tried; };
static Prog progs[64 + 40];    // by key (key_of): 0 on desktop GL; on GLES 2 the mode, + 16 with the paint block; from 32 the lean programs; + 64 with the rounded clips (rclip)
static bool lean_on;          // ZINC_GL_LEAN=1 (GLES 2): the lean programs for the quads they can draw (gl_replay_shaders.h)
static Prog* cur_prog;        // the program in use, nullptr after another one was (occlusion, stencil)
static uint32_t pstamp;       // the frame's number, for Prog::stamp
static bool paint_on;         // a gradient paint is set (set_paint): the quads take the program with the paint block
static int only = -1;         // ZINC_GL_ONLY=<mode>: every quad drawn as that mode (wrong pixels: what a mode's shader costs)
static bool strips = !GLR_CORE;   // the edges of STROKE and POLY as RAMP quads (below); ZINC_GL_STRIPS=0 / 1
struct Run { int first; uint8_t key; bool opaque; };   // opaque: every pixel of the run is written whole, no blending (a tiling GPU skips reading the destination)
enum { A_BOX = 2, A_PAR, A_C1, A_C2, A_Z };   // attribute locations, the same in every program (zgl_program binds the names; a_pos is 0)
static float cur_z;          // NDC depth of the command being drawn: later commands are nearer (GL_LESS)
static GLuint sprog, svbo;    // the occlusion pass's program and buffer
static GLuint fprog, fvbo, evbo;   // POLY on the GPU (ZN-590.02): the stencil pass's program (positions only) and buffer, the fringe quads' buffer
static GLint f_res, f_flip;
static bool stencil_ok;       // this frame: the framebuffer has 8 stencil bits
static GLint s_res, s_flip, s_rect, s_col, s_z, s_pos;
static bool instanced;
static SV* sverts; static size_t sverts_cap; static int ns;
static bool occl;            // this frame: opaque square RECTs and CLEARs outside clips drawn first, front to back, the rest depth-tested
static uint8_t* drawn; static size_t drawn_cap;   // per command of the first list: already drawn by the occlusion pass
static bool culled;
static Tiles cull_scratch;
static uint64_t* packed; static size_t packed_cap;   // cull_pack's output, filled by 4 threads
static uint32_t* vis; static size_t vis_cap; static uint32_t nvis;   // when culled: the visible commands of the first list, last first, kCullOpaque on the opaque ones
// the commands a pass walks in paint order: when culled the visible ones (with their kCullOpaque bit), else all of them
static inline uint32_t walk_count(const Frame& f, bool first) { return first && culled ? nvis : f.count; }
static inline uint32_t walk_entry(uint32_t k, bool first) { return first && culled ? vis[nvis - 1 - k] : k; }
static bool flipy, split = true;   // flipy: drawing into the window framebuffer (rows bottom-up); split: cheap quads for the interior of boxes
// A scroll area kept rotated in the surface texture (scroll(), ZN-744): its row y is at row ring.y0 + (y - ring.y0 + ring_off) mod its height;
// ring_ty: the rows the piece being replayed is shifted by
static Rect ring;
static int32_t ring_off, ring_ty;
static V verts[MAXQ * 4];
static int nq;
static Run runs[MAXQ];
static int nruns;
static Rect clip, applied, base;
static Rect cstack[16];
struct RC { float x, y, w, h, r; int R; bool on; bool an; };   // on: the corners are restored from a copy of the framebuffer; an: the shader clips them (rclip)
static RC rstack[16];
static int sp;
// Rounded clips drawn by the shader: up to two open at once (a card in a card); the quads of a run drawn while one is open take the program with the
// rclip block (key + 64) and their coverage is multiplied by the clips'. ZINC_GL_RCLIP=0|1, else the tuning table (a tiling GPU: the copy it replaces
// flushes the tile pass). A third open rounded clip, or the switch off, falls back to the copy of the corners.
struct RClip { float cx, cy, hw, hh, r; };
static RClip rcs[2];
static int nrc;
static uint32_t clip_gen = 1;   // changes when the set of open rounded clips does: a program re-reads its uniforms
static bool rclip_on;
static uint32_t warned, unsupported;
static struct { uint32_t frames, idle, occl_frames, draws, quads, glyphs, ptiles, blocks, decoded, progs, atlas_ups; double us, cull_us, prog_us, glyph_us; uint64_t hidden, block_bytes; } st;
// GPU time of the replays (ZINC_GL_STATS, ZN-679; ZINC_PROFILE=json publishes it). The sources, in the order they are tried, and the name each publishes as gl_timer_source:
//   GL_TIME_ELAPSED          desktop core GL (macOS): a timer query per frame, read four frames later so the CPU never waits for the GPU
//   EXT_disjoint_timer_query GLES 2 and 3 where the driver has the extension (found at run time through eglGetProcAddress): the same, plus the disjoint check
//   glFinish                 only when asked (ZINC_GL_TIMER=finish): the wall time from the start of the replay to glFinish. It is the CPU's submit time plus the GPU's completion with the
//                            pipeline serialised, an upper bound and not the same measure: a number from it must never share an axis with a query's
//   none                     no timer on this GPU (the Tegra 3 driver, probably others): gl_gpu_us is 0
// ZINC_GL_TIMER=query|finish|off forces one. A tile-based GPU (Adreno, Mali, PowerVR, VideoCore) times a frame or a pass, not a draw: the number is per replayed frame.
static double now_us_early() { timespec t; clock_gettime(CLOCK_MONOTONIC, &t); return t.tv_sec * 1e6 + t.tv_nsec / 1e3; }
static const char* gpu_source = "none";
static GLuint gq[4];
static uint32_t gq_n = 0, gpu_n = 0, gpu_lost = 0;
static double gpu_us = 0, gpu_t0 = 0;
static int gpu_mode = -1;   // -1 not decided, 0 none, 1 core query, 2 EXT query (GLES), 3 glFinish
static bool gpu_stats() { static const bool on = getenv("ZINC_GL_STATS") != nullptr || getenv("ZINC_GL_TIMER") != nullptr; return on; }
#if !GLR_CORE
#include <dlfcn.h>
static void (*pGenQ)(int, GLuint*);
static void (*pBeginQ)(GLenum, GLuint);
static void (*pEndQ)(GLenum);
static void (*pGetQ)(GLuint, GLenum, GLuint*);
static void (*pGetQ64)(GLuint, GLenum, unsigned long long*);
static void* gl_proc(const char* n) {
  typedef void* (*GP)(const char*);
  static GP gp = (GP)dlsym(RTLD_DEFAULT, "eglGetProcAddress");
  static bool tried;
  if (!gp && !tried) { tried = true; void* h = dlopen("libEGL.so", RTLD_LAZY); if (!h) h = dlopen("libEGL.so.1", RTLD_LAZY); if (h) gp = (GP)dlsym(h, "eglGetProcAddress"); }
  return gp ? gp(n) : nullptr;
}
#endif
static void gpu_init() {
  gpu_mode = 0;
  const char* want = getenv("ZINC_GL_TIMER");
  if (want && !strcmp(want, "off")) return;
  const bool finish = want && !strcmp(want, "finish");
#if GLR_CORE && defined(__APPLE__)
  if (!finish) { gpu_mode = 1; gpu_source = "GL_TIME_ELAPSED"; return; }
#elif !GLR_CORE   // a desktop core profile elsewhere (Linux, Windows) loads no query entry points: no GPU timer there
  const char* ext = (const char*)glGetString(GL_EXTENSIONS);
  if (!finish && ext && strstr(ext, "GL_EXT_disjoint_timer_query")) {
    pGenQ = (void (*)(int, GLuint*))gl_proc("glGenQueriesEXT"); pBeginQ = (void (*)(GLenum, GLuint))gl_proc("glBeginQueryEXT"); pEndQ = (void (*)(GLenum))gl_proc("glEndQueryEXT");
    pGetQ = (void (*)(GLuint, GLenum, GLuint*))gl_proc("glGetQueryObjectuivEXT"); pGetQ64 = (void (*)(GLuint, GLenum, unsigned long long*))gl_proc("glGetQueryObjectui64vEXT");
    if (pGenQ && pBeginQ && pEndQ && pGetQ && pGetQ64) { gpu_mode = 2; gpu_source = "EXT_disjoint_timer_query"; return; }
  }
#endif
  if (finish) { gpu_mode = 3; gpu_source = "glFinish"; }
}
static void gpu_begin() {
  if (!gpu_stats()) return;
  if (gpu_mode < 0) gpu_init();
  if (gpu_mode <= 0) return;
  gpu_t0 = now_us_early();
  if (gpu_mode == 3) return;
  const uint32_t k = gq_n % 4;
#if GLR_CORE && defined(__APPLE__)
  if (!gq[0]) glGenQueries(4, gq);
  if (gq_n >= 4) { GLuint64 ns = 0; glGetQueryObjectui64v(gq[k], GL_QUERY_RESULT, &ns); gpu_us += ns / 1000.0; gpu_n++; }
  glBeginQuery(GL_TIME_ELAPSED, gq[k]);
#elif !GLR_CORE
  const GLenum TIME_ELAPSED = 0x88BF, RESULT = 0x8866, AVAILABLE = 0x8867, DISJOINT = 0x8FBB;
  if (!gq[0]) pGenQ(4, gq);
  if (gq_n >= 4) {   // the query of four frames ago: read it when it is there and the GPU was not disjoint (a clock change, a context loss), else count it lost
    GLuint ok = 0; pGetQ(gq[k], AVAILABLE, &ok);
    GLint dis = 0; glGetIntegerv(DISJOINT, &dis);
    if (ok && !dis) { unsigned long long ns = 0; pGetQ64(gq[k], RESULT, &ns); gpu_us += ns / 1000.0; gpu_n++; } else gpu_lost++;
  }
  pBeginQ(TIME_ELAPSED, gq[k]);
#endif
}
static void gpu_end() {
  if (!gpu_stats() || gpu_mode <= 0) return;
  if (gpu_mode == 3) { glFinish(); gpu_us += now_us_early() - gpu_t0; gpu_n++; return; }
#if GLR_CORE && defined(__APPLE__)
  glEndQuery(GL_TIME_ELAPSED);
#elif !GLR_CORE
  pEndQ(0x88BF);
#endif
  gq_n++;
}
// ZINC_GL_TRACE=1: a line before each texture upload, framebuffer copy and clear of a frame, to tell which one a driver's own report
// follows (Mesa vc4: VC4_DEBUG=perf prints "Blocking on resource BO for bo map" when a call waits for the GPU)
static bool tracing;
static uint32_t trace_q0;   // st.quads at the start of the frame
#define GLR_TRACE(...) do { if (tracing) fprintf(stderr, "glr trace: " __VA_ARGS__); } while (0)
static double now_us() { timespec t; clock_gettime(CLOCK_MONOTONIC, &t); return t.tv_sec * 1e6 + t.tv_nsec / 1e3; }

// ---- helpers shared in spirit with runtime/raster.cpp (kept identical: the pixels must agree)
static inline int32_t f2i(float v) { return (int32_t)__builtin_fminf(__builtin_fmaxf(v, -134217728.0f), 134217728.0f); }
static inline int32_t ifloor(float v) { int32_t i = f2i(v); return (float)i > v ? i - 1 : i; }
static inline int32_t iceil(float v) { int32_t i = f2i(v); return (float)i < v ? i + 1 : i; }
static inline float clampf(float v, float a, float b) { return v < a ? a : v > b ? b : v; }
static Rect isect(Rect a, Rect b) { return Rect{a.x0 > b.x0 ? a.x0 : b.x0, a.y0 > b.y0 ? a.y0 : b.y0, a.x1 < b.x1 ? a.x1 : b.x1, a.y1 < b.y1 ? a.y1 : b.y1}; }
static Rect bounds(float x, float y, float w, float h, const Rect& lim) { return isect(Rect{ifloor(x), ifloor(y), iceil(x + w), iceil(y + h)}, lim); }
static const Rect HUGE_R = {-100000, -100000, 100000, 100000};

// ---- GL objects
static GLuint make_tex(int32_t w, int32_t h, GLenum ifmt, GLenum fmt, const void* px, bool nearest) {
  GLuint t;
  glGenTextures(1, &t);
  glBindTexture(GL_TEXTURE_2D, t);
  GLint f = nearest ? GL_NEAREST : GL_LINEAR;
  glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, f);
  glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, f);
  glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
  glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
  glPixelStorei(GL_UNPACK_ALIGNMENT, 1);
  glTexImage2D(GL_TEXTURE_2D, 0, (GLint)ifmt, w, h, 0, fmt, GL_UNSIGNED_BYTE, px);
  return t;
}
#if GLR_CORE
static const GLenum A_IFMT = GL_R8, A_FMT = GL_RED;   // core profile: no LUMINANCE; the shader reads .r
#else
static const GLenum A_IFMT = GL_LUMINANCE, A_FMT = GL_LUMINANCE;
#endif

// ---- the context's capability record (gl_caps.h), filled once by init(); the provider gives its EGL extensions first when it has EGL
extern "C" __attribute__((weak)) void zrt_prof_info(const char* key, const char* val);   // runtime/gfx.cpp
extern "C" { extern void (*zrt_gl_info_hook)(); }   // runtime/gfx.cpp: ZINC_PROFILE=json asks the renderer for its counters
static void gl_info_hook();
static GLint occl_bits;   // the depth bits of the target the last frame was drawn to (published: the occlusion pass needs 16)
extern "C" { extern void (*zrt_gl_info_reset_hook)(); }   // runtime/gfx.cpp: a profile section ended (zinc:gfx profSection): the counters start again
static void gl_info_reset() { st.frames = st.idle = st.occl_frames = st.draws = st.quads = 0; st.us = 0; gpu_us = 0; gpu_n = 0; gpu_lost = 0; }
static glcaps::Caps caps;
static const char* egl_extensions;
static void probe() {
  static bool probed;
  if (probed) return;
  probed = true;
  glcaps::Info in{};
  in.vendor = (const char*)glGetString(GL_VENDOR); in.renderer = (const char*)glGetString(GL_RENDERER); in.version = (const char*)glGetString(GL_VERSION);
  in.egl_extensions = egl_extensions;
  glGetIntegerv(GL_MAX_TEXTURE_SIZE, &in.max_texture);
#if GLR_CORE   // a core profile has no GL_EXTENSIONS string (what the record asks is core there) nor default-framebuffer bit queries
  glGetFramebufferAttachmentParameteriv(GL_FRAMEBUFFER, GL_DEPTH, GL_FRAMEBUFFER_ATTACHMENT_DEPTH_SIZE, &in.depth_bits);
  glGetFramebufferAttachmentParameteriv(GL_FRAMEBUFFER, GL_STENCIL, GL_FRAMEBUFFER_ATTACHMENT_STENCIL_SIZE, &in.stencil_bits);
#else
  in.extensions = (const char*)glGetString(GL_EXTENSIONS);
  GLint range[2] = {0, 0};
  glGetShaderPrecisionFormat(GL_FRAGMENT_SHADER, GL_HIGH_FLOAT, range, &in.highp_bits);
  glGetShaderPrecisionFormat(GL_FRAGMENT_SHADER, GL_MEDIUM_FLOAT, range, &in.mediump_bits);
  glGetIntegerv(GL_DEPTH_BITS, &in.depth_bits); glGetIntegerv(GL_STENCIL_BITS, &in.stencil_bits);
#endif
  glcaps::fill(caps, in);
  zrt_gl_info_hook = gl_info_hook; zrt_gl_info_reset_hook = gl_info_reset;
  if (zrt_prof_info) {   // ZINC_PROFILE=json prints what the GPU is with the numbers (weak: absent where the profiler is not linked)
    zrt_prof_info("gl_vendor", in.vendor ? in.vendor : "?"); zrt_prof_info("gl_renderer", in.renderer ? in.renderer : "?"); zrt_prof_info("gl_version", in.version ? in.version : "?");
    char b[16]; snprintf(b, sizeof b, "%d", in.max_texture); zrt_prof_info("gl_max_texture", b);
    zrt_prof_info("gl_family", glcaps::family_names[caps.family]);
  }
  if (getenv("ZINC_GL_INFO")) { char b[1024]; glcaps::print(caps, b, sizeof b); fputs(b, stderr); }
}
/** The FBO's depth (and stencil) storage at W x H: depth 24 / stencil 8 where the API has it (desktop GL, GLES 2 with
 *  OES_packed_depth_stencil), else depth only (24 or 16 bits) and POLY stays on the CPU tiles. */
static bool packed_ds;
static GLint target_bits[2][2] = {{-1, -1}, {-1, -1}};   // depth and stencil bits of the surface texture's framebuffer [0] and the window's [1], asked once
static void depth_storage() {
  const int32_t W = TW, H = TH;   // the allocation, not the surface
  glBindRenderbuffer(GL_RENDERBUFFER, fbo_depth);
#if GLR_CORE
  packed_ds = true;
  glRenderbufferStorage(GL_RENDERBUFFER, GL_DEPTH24_STENCIL8, W, H);   // 24 bits: 4M commands told apart
#else
  packed_ds = caps.packed_ds;
  glRenderbufferStorage(GL_RENDERBUFFER, packed_ds ? 0x88F0 /* DEPTH24_STENCIL8_OES */ : caps.depth24 ? 0x81A6 /* DEPTH_COMPONENT24_OES */ : GL_DEPTH_COMPONENT16, W, H);
#endif
}
// GLES 2: which program draws a mode. group[m] is the first mode of m's group, gmask[it] the modes of the group: one program holds them
// behind a ladder, so its quads stay in one run whatever their order, and each of its pixels pays for all of them.
// ZINC_GL_GROUPS="0,1,7;2;3,4" regroups them to measure (a mode it does not name stays alone).
static uint8_t group[16];
static unsigned gmask[16];
static void set_groups(const char* spec) {
  for (int m = 0; m < 16; m++) { group[m] = (uint8_t)m; gmask[m] = 1u << m; }
  for (const char* s = spec; s && *s;) {
    int first = -1;
    while (*s && *s != ';') {
      const int m = atoi(s) & 15;
      if (first < 0) first = m;
      group[m] = (uint8_t)first; gmask[first] |= 1u << m;
      while (*s && *s != ',' && *s != ';') s++;
      if (*s == ',') s++;
    }
    if (*s == ';') s++;
  }
}
static inline uint8_t key_of(int mode) {
#if GLR_CORE
  (void)mode;
  return nrc > 0 ? 64 : 0;
#else
  return (uint8_t)((only >= 0 ? only : group[mode & 15]) | (paint_on && only < 0 ? 16 : 0) | (nrc > 0 ? 64 : 0));   // & 15: a box drawn through a matrix has 16 added to its mode
#endif
}
static Prog& use_prog(uint8_t key) {
  Prog& p = progs[key];
  if (!p.tried) {
    p.tried = true;
    static char fs[8192];
    const double t0 = now_us();
    const uint8_t k0 = key & 63;   // 64: the rclip variant of k0
    const unsigned modes = k0 >= 32 ? 0 : only >= 0 ? 1u << only : GLR_CORE ? ~0u : gmask[k0 & 15];
    char defs[128];   // VS: positions absolute under a paint; FS: ZINC_GL_MEDIUMP's precision
    const char* mpb = getenv("ZINC_GL_MEDIUMP");
    snprintf(defs, sizeof defs, "%s%s%s%s%s", GLR_CORE ? "#define ZN_PAINT_UNIFORM 1\n" : k0 & 16 ? "#define ZN_PAINT 1\n" : "", key & 64 ? "#define ZN_RCLIP 1\n" : "",
             mpb ? "#define ZN_MP " : "", mpb ? mpb : "", mpb ? ".0\n" : "");
    p.id = k0 >= 32 ? zgl_program("", k0 - 32 < LEAN_FILL ? LVS : LBVS, LFS[k0 - 32]) : fs_source(modes, GLR_CORE ? only < 0 : (k0 & 16) != 0, fs, sizeof fs) ? zgl_program(defs, VS, fs) : 0;
    st.prog_us += now_us() - t0;
    if (getenv("ZINC_GL_STATS")) fprintf(stderr, "display-gl renderer gl: program of modes 0x%x%s built in %.0f ms (frame %u)\n", modes & ((1u << MODES) - 1), key & 16 ? (key & 64 ? " with paint and rounded clips" : " with paint") : key & 64 ? " with rounded clips" : "", (now_us() - t0) / 1e3, st.frames);
    if (!p.id) fprintf(stderr, "display-gl: renderer gl: the program of modes 0x%x does not build: their quads are not drawn\n", modes & ((1u << MODES) - 1));
    else {
      p.u_flip = glGetUniformLocation(p.id, "u_flip"); p.u_res = glGetUniformLocation(p.id, "u_res"); p.u_edge = glGetUniformLocation(p.id, "u_edge");
      p.u_g0 = glGetUniformLocation(p.id, "u_g0"); p.u_g1 = glGetUniformLocation(p.id, "u_g1"); p.u_gc = glGetUniformLocation(p.id, "u_gc"); p.u_go = glGetUniformLocation(p.id, "u_go");
      p.u_cv = glGetUniformLocation(p.id, "u_cv"); p.u_cvn = glGetUniformLocation(p.id, "u_cvn");
      p.u_ca0 = glGetUniformLocation(p.id, "u_ca0"); p.u_ca1 = glGetUniformLocation(p.id, "u_ca1"); p.u_cr = glGetUniformLocation(p.id, "u_cr"); p.cgen = 0;
      glUseProgram(p.id);
      glUniform1i(glGetUniformLocation(p.id, "u_tex"), 0);
      glUniform3f(p.u_edge, 0, 0, -1);   // RAMP: w - |t|, but in the pass over the pixels inside a fill (edge_draw)
      cur_prog = &p; p.stamp = pstamp - 1; st.progs++;
    }
  }
  if (cur_prog != &p) { glUseProgram(p.id); cur_prog = &p; }
  if (p.stamp != pstamp && p.id) { p.stamp = pstamp; glUniform1f(p.u_flip, flipy ? -1.f : 1.f); glUniform2f(p.u_res, (float)W, (float)H); }
  if (p.id && (key & 64) && p.cgen != clip_gen) {   // the open rounded clips; an unused slot is a box too big to touch a pixel
    p.cgen = clip_gen;
    static const RClip none = {0.f, 0.f, 16000.f, 16000.f, 0.f};
    const RClip& a = rcs[0], &b = nrc > 1 ? rcs[1] : none;
    glUniform4f(p.u_ca0, a.cx, a.cy, a.hw, a.hh); glUniform4f(p.u_ca1, b.cx, b.cy, b.hw, b.hh); glUniform2f(p.u_cr, a.r, b.r);
  }
  return p;
}
/** GLES 2: builds the next command program not built yet, the common modes first, then the lean ones when they are on, so no frame waits
 *  for the driver to compile one (the first tab switch of rn-showcase took 147 ms on a Nexus 7, Tegra 3, for the programs it met first).
 *  The includer calls it in frames without damage, one program each; false when nothing is left (desktop GL: one program, built at init). */
static bool warm() {
#if GLR_CORE
  return false;
#else
  static const uint8_t order[] = {FILL, TEXT_M, SOLID, IMAGE_RGBA, IMAGE_BGR, BORDER_M, SHADOW_M, RESTORE, RAMP_M, STROKE_M, EDGE_M, CONVEX_M};
  if (only >= 0) return false;
  for (uint8_t m : order) {
    const uint8_t k = group[m];
    if (progs[k].tried) continue;
    use_prog(k);
    return true;
  }
  for (int l = 0; lean_on && l < LEANS; l++) if (!progs[32 + l].tried) { use_prog((uint8_t)(32 + l)); return true; }
  static const uint8_t clipped[] = {FILL, TEXT_M, SOLID, IMAGE_RGBA, BORDER_M};   // the variants with the rounded clips, for the modes a card holds
  for (uint8_t m : clipped) {
    if (!rclip_on) break;
    const uint8_t k = (uint8_t)(group[m] | 64);
    if (progs[k].tried) continue;
    use_prog(k);
    return true;
  }
  return false;
#endif
}
static bool init(int32_t w, int32_t h) {
  W = w; H = h;
  if (const char* e = getenv("ZINC_GL_ONLY")) only = atoi(e) % MODES;
  probe();
  rclip_on = getenv("ZINC_GL_RCLIP") ? atoi(getenv("ZINC_GL_RCLIP")) != 0 : caps.tiler;
  lean_on = !GLR_CORE && (getenv("ZINC_GL_LEAN") ? atoi(getenv("ZINC_GL_LEAN")) != 0 : caps.lean);   // the tuning table's choice unless asked
  set_groups(getenv("ZINC_GL_GROUPS"));
  tracing = getenv("ZINC_GL_TRACE") != nullptr;
  if (const char* e = getenv("ZINC_GL_STRIPS")) strips = atoi(e) != 0;
  if (!use_prog(key_of(SOLID)).id) return false;
#if GLR_CORE
  instanced = true;   // GL 3.3+ core: instanced draws and attribute divisors
#endif
  const double t0 = now_us();
  sprog = zgl_program(instanced ? "#define INSTANCED 1\n" : "", SVS, SFS);
  if (!sprog) return false;
  fprog = zgl_program("", FVS, FFS);
  if (!fprog) return false;
  st.prog_us += now_us() - t0;
  glGenBuffers(1, &evbo);
  f_res = glGetUniformLocation(fprog, "u_res"); f_flip = glGetUniformLocation(fprog, "u_flip");
  glGenBuffers(1, &fvbo);
  s_res = glGetUniformLocation(sprog, "u_res"); s_flip = glGetUniformLocation(sprog, "u_flip");
  s_rect = glGetAttribLocation(sprog, "a_rect"); s_col = glGetAttribLocation(sprog, "a_col"); s_z = glGetAttribLocation(sprog, "a_z"); s_pos = glGetAttribLocation(sprog, "a_pos");
  glGenBuffers(1, &svbo);
  TW = W > RW ? W : RW; TH = H > RH ? H : RH;
  fbo_tex = make_tex(TW, TH, GL_RGBA, GL_RGBA, nullptr, false);
  glGenFramebuffers(1, &fbo);
  glBindFramebuffer(GL_FRAMEBUFFER, fbo);
  glFramebufferTexture2D(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_TEXTURE_2D, fbo_tex, 0);
  glGenRenderbuffers(1, &fbo_depth);
  depth_storage();
#if GLR_CORE
  glFramebufferRenderbuffer(GL_FRAMEBUFFER, GL_DEPTH_STENCIL_ATTACHMENT, GL_RENDERBUFFER, fbo_depth);   // 8 stencil bits: POLY on the GPU (ZN-590.02)
#else
  glFramebufferRenderbuffer(GL_FRAMEBUFFER, GL_DEPTH_ATTACHMENT, GL_RENDERBUFFER, fbo_depth);
  if (packed_ds) glFramebufferRenderbuffer(GL_FRAMEBUFFER, GL_STENCIL_ATTACHMENT, GL_RENDERBUFFER, fbo_depth);
#endif
  bool ok = glCheckFramebufferStatus(GL_FRAMEBUFFER) == GL_FRAMEBUFFER_COMPLETE;
  glBindFramebuffer(GL_FRAMEBUFFER, 0);
  if (!ok) { fprintf(stderr, "display-gl: renderer gl: framebuffer %dx%d is not complete\n", W, H); return false; }
  static const uint8_t px1[4] = {255, 255, 255, 255};
  white = make_tex(1, 1, GL_RGBA, GL_RGBA, px1, true);
  atlas = make_tex(ATLAS, ATLAS, A_IFMT, A_FMT, nullptr, true);
  corner_tex = make_tex(CORNER * 4, CORNER * LEVELS, GL_RGBA, GL_RGBA, nullptr, true);
  static uint16_t idx[MAXQ * 6];
  for (int i = 0; i < MAXQ; i++) { uint16_t b = (uint16_t)(i * 4); uint16_t q[6] = {b, (uint16_t)(b + 1), (uint16_t)(b + 2), b, (uint16_t)(b + 2), (uint16_t)(b + 3)}; memcpy(idx + i * 6, q, sizeof q); }
  glGenBuffers(1, &vbo);
  glGenBuffers(1, &ibo);
  glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, ibo);
  glBufferData(GL_ELEMENT_ARRAY_BUFFER, sizeof idx, idx, GL_STATIC_DRAW);
  if (const char* e = getenv("ZINC_GL_SPLIT")) split = atoi(e) != 0;
  baked = (Tex2*)calloc(image_count > 0 ? (size_t)image_count : 1, sizeof(Tex2));
  return true;
}
static GLuint texture() { return fbo_tex; }
/** The texture's allocated size: the frame fills its first W x H. */
static void texture_size(int32_t* w, int32_t* h) { *w = TW; *h = TH; }
/** Room to allocate at init for the sizes the surface will take (a keyboard's band, a turn): resize() then stays in place. */
static void reserve(int32_t w, int32_t h) { RW = w; RH = h; }
/** The surface changed size (a window resized): the render texture and its depth buffer follow, in place when they are large enough; the
 *  programs and atlases stay. */
static bool resize(int32_t w, int32_t h) {
  if (w == W && h == H) return true;
  W = w; H = h;
  ring_off = 0;   // the texture is drawn again whole
  if (W <= TW && H <= TH && (RW || RH)) return true;   // reserved: draw into the first W x H of the same target
  TW = W; TH = H;
  target_bits[0][0] = target_bits[1][0] = -1;   // asked again
  glBindTexture(GL_TEXTURE_2D, fbo_tex);
  glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA, TW, TH, 0, GL_RGBA, GL_UNSIGNED_BYTE, nullptr);
  depth_storage();
  glBindFramebuffer(GL_FRAMEBUFFER, fbo);
  const bool ok = glCheckFramebufferStatus(GL_FRAMEBUFFER) == GL_FRAMEBUFFER_COMPLETE;
  glBindFramebuffer(GL_FRAMEBUFFER, 0);
  return ok;
}

// ---- batching
static void apply_clip() {
  if (memcmp(&clip, &applied, sizeof clip) == 0) return;
  int32_t x0 = clip.x0 < 0 ? 0 : clip.x0, y0 = clip.y0 < 0 ? 0 : clip.y0, x1 = clip.x1 > W ? W : clip.x1, y1 = clip.y1 > H ? H : clip.y1;
  glScissor(x0, flipy ? H - (y1 > y0 ? y1 : y0) : y0 + ring_ty, x1 > x0 ? x1 - x0 : 0, y1 > y0 ? y1 - y0 : 0);
  applied = clip;
}
/** The layout of V in the bound buffer, from byte `base`. */
static void attribs(size_t base) {
  const GLsizei S = sizeof(V);
  glEnableVertexAttribArray(0); glVertexAttribPointer(0, 4, GL_FLOAT, GL_FALSE, S, (void*)(base + 0));
  glEnableVertexAttribArray(A_BOX); glVertexAttribPointer(A_BOX, 4, GL_FLOAT, GL_FALSE, S, (void*)(base + 16));
  glEnableVertexAttribArray(A_PAR); glVertexAttribPointer(A_PAR, 4, GL_FLOAT, GL_FALSE, S, (void*)(base + 32));
  glEnableVertexAttribArray(A_C1); glVertexAttribPointer(A_C1, 4, GL_UNSIGNED_BYTE, GL_TRUE, S, (void*)(base + 48));
  glEnableVertexAttribArray(A_C2); glVertexAttribPointer(A_C2, 4, GL_UNSIGNED_BYTE, GL_TRUE, S, (void*)(base + 52));
  glEnableVertexAttribArray(A_Z); glVertexAttribPointer(A_Z, 1, GL_FLOAT, GL_FALSE, S, (void*)(base + 56));
}
/** The quad about to be added to the batch is of `mode`: it starts a run when the last one is drawn by another program. */
static inline void run_of(int mode, int lean = -1, bool opaque = false) {
  const uint8_t k = lean >= 0 && nrc == 0 ? (uint8_t)(32 + lean) : key_of(mode);   // a lean program has no clip block
  if (!nruns || runs[nruns - 1].key != k || runs[nruns - 1].opaque != opaque) runs[nruns++] = Run{nq, k, opaque};
}
static void atlas_sync();
static bool blend_gl = true;   // GL_BLEND as flush() left it (it always leaves it on)
static void flush() {
  if (!nq) return;
  atlas_sync();
  glBindBuffer(GL_ARRAY_BUFFER, vbo);
  glBufferData(GL_ARRAY_BUFFER, (GLsizeiptr)nq * 4 * sizeof(V), verts, GL_STREAM_DRAW);
  attribs(0);
  glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, ibo);
  apply_clip();
  glBindTexture(GL_TEXTURE_2D, cur_tex);
  for (int r = 0; r < nruns; r++) {   // desktop GL: one run
    const int q0 = runs[r].first, q1 = r + 1 < nruns ? runs[r + 1].first : nq;
    if (!use_prog(runs[r].key).id) continue;
    if (runs[r].opaque == blend_gl) { if (runs[r].opaque) glDisable(GL_BLEND); else glEnable(GL_BLEND); blend_gl = !runs[r].opaque; }
    glDrawElements(GL_TRIANGLES, (q1 - q0) * 6, GL_UNSIGNED_SHORT, (void*)((size_t)q0 * 6 * sizeof(uint16_t)));
    st.draws++;
  }
  if (!blend_gl) { glEnable(GL_BLEND); blend_gl = true; }
  st.quads += (uint32_t)nq;
  nq = 0; nruns = 0;
}
static void use_tex(GLuint t) { if (t != cur_tex) { flush(); cur_tex = t; } }
// A sprite's blend mode (ZN-581) applied to the premultiplied colour the shader writes: normal, add, multiply, screen (raster.cpp blend_as).
// Every other command draws in normal mode; a change ends the batch.
static uint32_t cur_blend;
static void use_blend(uint32_t m) {
  if (m == cur_blend) return;
  flush();
  static const GLenum src[4] = {GL_ONE, GL_ONE, GL_DST_COLOR, GL_ONE}, dst[4] = {GL_ONE_MINUS_SRC_ALPHA, GL_ONE, GL_ONE_MINUS_SRC_ALPHA, GL_ONE_MINUS_SRC_COLOR};
  glBlendFunc(src[m & 3], dst[m & 3]);
  cur_blend = m & 3;
}
static void set_filter(Tex2& t, bool nearest) {
  if (t.nearest == (int)nearest) return;
  flush();
  glBindTexture(GL_TEXTURE_2D, t.id);
  GLint f = nearest ? GL_NEAREST : GL_LINEAR;
  glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, f);
  glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, f);
  t.nearest = nearest;
}
static void setc(uint8_t* o, uint32_t c, uint32_t a) { o[0] = (uint8_t)(c >> 16); o[1] = (uint8_t)(c >> 8); o[2] = (uint8_t)c; o[3] = (uint8_t)a; }
struct Q { float x0, y0, x1, y1, u0, v0, u1, v1, bx, by, bw, bh, r, p1; int mode, grad; uint32_t c1, c2; uint32_t alpha; bool full; };   // full: every pixel of the quad is inside its box (the interior of a split rounded rect)
// XFORM (ZN-263.01): while it is on, quads are given in a box's own coordinates and their corners go through this matrix; the boxes'
// distance functions get their own coordinates in (u, v), with 16 added to the mode, and images and glyphs keep their texture coordinates.
static bool xf_on;
static float xf_m[6];
static void quad(const Q& q) {
  float xs[4] = {q.x0, q.x1, q.x1, q.x0}, ys[4] = {q.y0, q.y0, q.y1, q.y1}, us[4] = {q.u0, q.u1, q.u1, q.u0}, vs[4] = {q.v0, q.v0, q.v1, q.v1};
  float x0 = q.x0, y0 = q.y0, x1 = q.x1, y1 = q.y1;
  int mode = q.mode;
  if (xf_on) {
    const bool local = mode == FILL || mode == BORDER_M || mode == SHADOW_M || mode == SOLID;
    x0 = y0 = 1e30f; x1 = y1 = -1e30f;
    for (int i = 0; i < 4; i++) {
      const float lx = xs[i], ly = ys[i];
      xs[i] = xf_m[0] * lx + xf_m[2] * ly + xf_m[4]; ys[i] = xf_m[1] * lx + xf_m[3] * ly + xf_m[5];
      if (local) { us[i] = lx; vs[i] = ly; }
      x0 = xs[i] < x0 ? xs[i] : x0; x1 = xs[i] > x1 ? xs[i] : x1; y0 = ys[i] < y0 ? ys[i] : y0; y1 = ys[i] > y1 ? ys[i] : y1;
    }
    if (local) mode += 16;
  }
  if (clip.x1 <= clip.x0 || clip.y1 <= clip.y0 || x1 <= (float)clip.x0 || x0 >= (float)clip.x1 || y1 <= (float)clip.y0 || y0 >= (float)clip.y1) return;   // outside the clip: nothing to draw (and no empty scissor for the GPU)
  if (nq == MAXQ) flush();
  V* v = &verts[nq * 4];
  const int m15 = mode & 15;
  int lean = -1;   // the lean program that draws this quad, when there is one (gl_replay_shaders.h)
  // A square box on whole pixels covers each of its pixels fully or not at all: no distance to work out, and when its colour is opaque no blending (a
  // tiling GPU then neither reads nor merges the destination: a Pi 3 fills 56 Mpixel/s of gradient with the distance and the blend, far more without)
  static const bool whole_on = !getenv("ZINC_GL_WHOLE") || atoi(getenv("ZINC_GL_WHOLE")) != 0;   // 0: every box through the general coverage maths (to compare)
  const bool whole = whole_on && !xf_on && !paint_on && only < 0 && nrc == 0 && (m15 == FILL || m15 == SOLID) && q.grad <= 2 &&
                     (q.full || (q.r <= 0 && q.bw > 0 && q.bh > 0 && q.bx - q.bw == floorf(q.bx - q.bw) && q.by - q.bh == floorf(q.by - q.bh) && q.bx + q.bw == floorf(q.bx + q.bw) && q.by + q.bh == floorf(q.by + q.bh)));
  static const bool whole_translucent = getenv("ZINC_GL_WHOLE_TRANSLUCENT") && atoi(getenv("ZINC_GL_WHOLE_TRANSLUCENT")) != 0;
  const bool opaque = whole && q.alpha >= 255;
  if (lean_on && only < 0 && !paint_on) {
    if (whole && (opaque || whole_translucent)) lean = LEAN_FILLSQ;   // a translucent one measured slower than LEAN_FILL on a Tegra 3 (16 fps against 22 for eight screens)
    else if (m15 == FILL) lean = q.grad <= 2 ? LEAN_FILL : q.grad == 3 ? LEAN_RADIAL : -1;
    else if (m15 == BORDER_M) lean = LEAN_BORDER;
    else if (m15 == SHADOW_M) lean = LEAN_SHADOW;
    else if (q.r <= 0) lean = m15 == SOLID ? LEAN_SOLID : m15 == TEXT_M ? LEAN_TEXT : (m15 == IMAGE_RGBA || m15 == IMAGE_BGR) && q.grad != 2 && q.p1 == 0 ? LEAN_IMAGE : -1;
  }
  run_of(mode, lean, opaque);
  nq++;
  for (int i = 0; i < 4; i++) {
    v[i] = V{xs[i], ys[i], us[i], vs[i], q.bx, q.by, q.bw, q.bh, q.r, q.p1, (float)mode, (float)q.grad, {0, 0, 0, 0}, {0, 0, 0, 0}, cur_z};
    setc(v[i].c1, q.c1, q.alpha); setc(v[i].c2, q.c2, 255);
  }
}
static Q box_q(const Cmd& c, const Rect& b, int mode) {
  float hw = c.w * 0.5f, hh = c.h * 0.5f;
  Q q = {};
  q.x0 = (float)b.x0; q.y0 = (float)b.y0; q.x1 = (float)b.x1; q.y1 = (float)b.y1;
  q.bx = c.x + hw; q.by = c.y + hh; q.bw = hw; q.bh = hh;
  q.r = clampf(c.r, 0, hw < hh ? hw : hh);
  q.mode = mode; q.c1 = c.c1; q.c2 = c.c2; q.alpha = c.alpha;
  return q;
}

// ---- glyph atlas
static void atlas_reset() { flush(); memset(gtab, 0, sizeof gtab); gcount = gx = gy = growh = 0; }
#if !GLR_CORE
// GLES 2 (ZN-725): a new glyph is written into a copy of the atlas in memory, and the rows that changed go to the texture in one upload
// before the next draw (flush). An upload per glyph into a texture the frame had already drawn with made VideoCore IV's driver submit
// the frame so far and wait for the GPU, 1.9 to 3.7 ms a glyph on a throttled Pi 3: a stall at each new glyph.
// frame() looks the glyphs of its TEXT commands up first (glyphs_ahead), so the upload comes before the frame's first draw.
static uint8_t* ashadow;
static int32_t arow0 = ATLAS, arow1 = 0;   // the rows that the texture has not got yet
static void atlas_sync() {
  if (arow1 <= arow0) return;
  const double t0 = now_us();
  GLR_TRACE("glyph atlas rows %d to %d, %d quads drawn so far\n", arow0, arow1, st.quads - trace_q0);
  glBindTexture(GL_TEXTURE_2D, atlas);
  glPixelStorei(GL_UNPACK_ALIGNMENT, 1);
  glTexSubImage2D(GL_TEXTURE_2D, 0, 0, arow0, ATLAS, arow1 - arow0, A_FMT, GL_UNSIGNED_BYTE, ashadow + (size_t)arow0 * ATLAS);
  glBindTexture(GL_TEXTURE_2D, cur_tex);
  arow0 = ATLAS; arow1 = 0;
  st.glyph_us += now_us() - t0; st.atlas_ups++;
}
#else
static void atlas_sync() {}
#endif
static const GSlot* glyph_slot(int32_t font, const Font& f, const Glyph* g) {
  if (g->w > ATLAS || g->h > ATLAS) return nullptr;
  uint64_t key = ((uint64_t)(uint32_t)font << 32) | g->cp | (1ull << 63);
  for (;;) {
    uint32_t i = (uint32_t)((key * 0x9E3779B97F4A7C15ull) >> 51);
    while (gtab[i].key && gtab[i].key != key) i = (i + 1) & 8191;
    if (gtab[i].key == key) return &gtab[i];
    if (gcount > 6000 || gy + g->h > ATLAS) { atlas_reset(); continue; }   // ponytail: reset when full, glyphs come back lazily
    if (gx + g->w + 1 > ATLAS) { gy += growh + 1; gx = 0; growh = 0; if (gy + g->h > ATLAS) continue; }
#if GLR_CORE
    glBindTexture(GL_TEXTURE_2D, atlas);
    glPixelStorei(GL_UNPACK_ALIGNMENT, 1);
    glTexSubImage2D(GL_TEXTURE_2D, 0, gx, gy, g->w, g->h, A_FMT, GL_UNSIGNED_BYTE, f.bitmap + g->off);
    glBindTexture(GL_TEXTURE_2D, cur_tex);
#else
    if (!ashadow && !(ashadow = (uint8_t*)calloc(ATLAS, ATLAS))) return nullptr;
    for (int32_t y = 0; y < g->h; y++) memcpy(ashadow + (size_t)(gy + y) * ATLAS + gx, f.bitmap + g->off + (size_t)y * g->w, (size_t)g->w);
    if (gy < arow0) arow0 = gy;
    if (gy + g->h > arow1) arow1 = gy + g->h;
#endif
    gtab[i] = GSlot{key, (int16_t)gx, (int16_t)gy};
    gx += g->w + 1; if (g->h > growh) growh = g->h;
    gcount++; st.glyphs++;
    return &gtab[i];
  }
}
static const Glyph* glyph_of(int32_t font, const Font& f, uint32_t cp) {
  if (font >= RUNTIME_FONT_BASE) return runtime_glyph(font, cp);
  int32_t lo = 0, hi = f.count - 1;
  while (lo <= hi) { int32_t m = (lo + hi) >> 1; if (f.glyphs[m].cp == cp) return &f.glyphs[m]; if (f.glyphs[m].cp < cp) lo = m + 1; else hi = m - 1; }
  return nullptr;
}
static uint32_t next_cp(const char* s, uint32_t n, uint32_t& i) {
  uint8_t c = (uint8_t)s[i];
  uint32_t w = c < 0x80 ? 1 : c < 0xE0 ? 2 : c < 0xF0 ? 3 : 4, cp = c < 0x80 ? c : c < 0xE0 ? c & 0x1F : c < 0xF0 ? c & 0x0F : c & 0x07;
  for (uint32_t k = 1; k < w && i + k < n; k++) cp = (cp << 6) | ((uint8_t)s[i + k] & 0x3F);
  i += w;
  return cp;
}
/** The glyphs of a list's TEXT commands enter the atlas now, before the frame draws (GLES 2: see atlas_sync); those of a TEXT under a
 *  matrix (XFORM) too, in the font its glyphs are drawn from (draw_text). ponytail: not after the atlas filled up and was reset in this
 *  frame: they come as they are drawn. */
/** A command whose pixels all lie outside the clip (raster.cpp cmd_bounds, a pixel wider): a replay of a small rectangle (a scroll's strip,
 *  the perf panel) skips it before any work, a pass over 260 commands cost Tegra 3's CPU 2 to 5 ms when each was set up and then clipped. */
static inline bool outside(const Cmd& c) {
  float m;
  switch (c.kind) {
    case RECT: case BORDER: case STROKE: case POLY: m = 2; break;   // (a LINE keeps its end point in w, h)
    case SHADOW: m = c.s + 2; break;
    case TEXT: m = c.h * 0.5f + 2; break;
    case IMAGE: if (c.pad & kImageBox) return false; m = 2; break;
    default: return false;   // CLIP, UNCLIP and CLEAR keep their state; XFORM draws through its matrix
  }
  return c.x + c.w + m <= (float)clip.x0 || c.x - m >= (float)clip.x1 || c.y + c.h + m <= (float)clip.y0 || c.y - m >= (float)clip.y1;
}
static void glyphs_ahead(const Frame& f) {
  for (uint32_t i = 0; i < f.count; i++) {
    const Cmd& c = f.cmds[i];
    int32_t font = c.res;
    uint32_t off = c.off, n = c.n;
    if (c.kind == XFORM && f.pts && f.pts[c.off] == (float)TEXT) {
      const float* p = f.pts + c.off;
      if (p[11] >= 1) font = (int32_t)p[11] - 1;
      memcpy(&off, p + 13, 4); memcpy(&n, p + 14, 4);
    } else if (c.kind != TEXT || outside(c)) continue;
    const Font* fp = font_at(font);
    if (!fp) continue;
    const char* s = f.text + off;
    for (uint32_t k = 0; k < n;) {
      const uint32_t cp = next_cp(s, n, k);
      const Glyph* g = glyph_of(font, *fp, cp);
      if (!g && !ignorable_cp(cp)) g = glyph_of(font, *fp, '?');
      if (g && g->w > 0 && g->h > 0) glyph_slot(font, *fp, g);
    }
  }
}
static void draw_text(const Cmd& c, const char* s) {
  const Font* fp = font_at(c.res);
  if (!fp) return;
  const Font& f = *fp;
  int32_t pen = ifloor(c.x * 64), base = ifloor(c.y + 0.5f) + f.ascent;   // floor, not truncation: a line above the top or left edge lands where it would lower down (ZN-744)
  // Under a matrix that scales, r names the font of the glyphs (plus one): made for about the size on screen, k times this font's, and
  // drawn that much smaller, on this font's advances and unrounded as the software raster places them (raster.cpp xf_text).
  const int32_t gf = xf_on ? (int32_t)c.r - 1 : -1;
  const Font* gp = gf >= 0 ? font_at(gf) : nullptr;
  float fpen = c.x;
  for (uint32_t i = 0; i < c.n;) {
    const uint32_t cp = next_cp(s, c.n, i);
    const Glyph* g = glyph_of(c.res, f, cp);
    if (!g && !ignorable_cp(cp)) g = glyph_of(c.res, f, '?');
    if (!g) continue;
    int32_t px = ((pen + 32) >> 6) + g->x0, py = base + g->y0;
    const Glyph* b = gp ? glyph_of(gf, *gp, cp) : nullptr;
    if (b) {
      const GSlot* sl = b->w > 0 && b->h > 0 ? glyph_slot(gf, *gp, b) : nullptr;
      if (sl) {
        const float k = (float)gp->px / f.px;
        use_tex(atlas);
        Q q = {};
        q.x0 = fpen + b->x0 / k; q.y0 = c.y + f.ascent + b->y0 / k; q.x1 = q.x0 + b->w / k; q.y1 = q.y0 + b->h / k;
        q.u0 = (float)sl->ax / ATLAS; q.v0 = (float)sl->ay / ATLAS; q.u1 = (float)(sl->ax + b->w) / ATLAS; q.v1 = (float)(sl->ay + b->h) / ATLAS;
        q.mode = TEXT_M; q.c1 = c.c1; q.alpha = c.alpha;
        quad(q);
      }
    } else if (g->w > 0 && g->h > 0) {
      const GSlot* sl = glyph_slot(c.res, f, g);
      if (!sl) { pen += g->adv + f2i(c.s * 64); continue; }
      use_tex(atlas);
      Q q = {};
      q.x0 = (float)px; q.y0 = (float)py; q.x1 = (float)(px + g->w); q.y1 = (float)(py + g->h);
      q.u0 = (float)sl->ax / ATLAS; q.v0 = (float)sl->ay / ATLAS; q.u1 = (float)(sl->ax + g->w) / ATLAS; q.v1 = (float)(sl->ay + g->h) / ATLAS;
      q.mode = TEXT_M; q.c1 = c.c1; q.alpha = c.alpha;
      quad(q);
    }
    pen += g->adv + f2i(c.s * 64);
    fpen += (g->adv + f2i(c.s * 64)) / 64.0f;
  }
}

// ---- compressed textures (ZN-439): the internal format this context takes for blocks of OpenGL format `fmt`, 0 when it takes none. From
// GL_COMPRESSED_TEXTURE_FORMATS, and on GLES the extension string, where some drivers name ETC1 only; ETC1 data is also ETC2 RGB8 data.
static GLenum block_format(uint32_t fmt) {
  static GLint n = -1, *list;
  const bool etc1_ext = caps.etc1;
  if (n < 0) {
    glGetIntegerv(GL_NUM_COMPRESSED_TEXTURE_FORMATS, &n);
    list = (GLint*)calloc(n > 0 ? (size_t)n : 1, sizeof(GLint));
    if (n > 0 && list) glGetIntegerv(GL_COMPRESSED_TEXTURE_FORMATS, list);
    else n = 0;
    if (getenv("ZINC_GL_STATS")) {
      fprintf(stderr, "display-gl renderer gl: compressed formats");
      for (GLint i = 0; i < n; i++) fprintf(stderr, " 0x%04x", (unsigned)list[i]);
      fprintf(stderr, "%s\n", etc1_ext ? " (and ETC1 by extension)" : "");
    }
  }
  bool has = false, etc2 = false;
  for (GLint i = 0; i < n; i++) { has |= (uint32_t)list[i] == fmt; etc2 |= list[i] == 0x9274; }
  if (fmt == 0x8D64) return has || etc1_ext ? fmt : etc2 ? 0x9274 : 0;
  return has ? fmt : 0;
}

// ---- images: baked ones are uploaded once, runtime ones again when their version changes
static Tex2* dyn_tex(int32_t id) {
  Tex2* t = nullptr;
  const int32_t i = id - DYN_BASE;
  if (i < 0) return nullptr;
  if (i >= ntexs) {
    const int32_t n = i + 64;
    Tex2* a = (Tex2*)realloc(texs, sizeof(Tex2) * (size_t)n);
    if (!a) return nullptr;
    __builtin_memset((void*)(a + ntexs), 0, sizeof(Tex2) * (size_t)(n - ntexs));
    texs = a; ntexs = n;
  }
  t = &texs[i];
  if (!t->id) { t->key = id; t->nearest = -1; }
  if (!t) return nullptr;
  const uint32_t* px; int32_t w, h, stride;
  if (!dyn_view(id, &px, &w, &h, &stride)) return nullptr;
  uint32_t ver = image_version(id);
  if (!t->id || t->w != w || t->h != h) {
    if (t->id) glDeleteTextures(1, &t->id);
    t->id = make_tex(w, h, GL_RGBA, GL_RGBA, nullptr, true);
    t->bytes = (uint64_t)w * h * 4;
    t->w = w; t->h = h; t->nearest = 1; t->ver = ver - 1;
  }
  if (t->ver != ver || t->px != px) {
    GLR_TRACE("runtime image %d, %dx%d, version %u\n", id, w, h, ver);
    glBindTexture(GL_TEXTURE_2D, t->id);
    // a compressed texture (ZN-439): its blocks where the driver takes the format, else its decoded texels
    uint32_t bf, bn; const void* bd; bool pre;
    const bool blocks = dyn_blocks(id, &bf, &bd, &bn, &pre);
    GLenum cf = blocks ? block_format(bf) : 0;
    if (cf) {
      while (glGetError() != GL_NO_ERROR) {}
      glCompressedTexImage2D(GL_TEXTURE_2D, 0, cf, w, h, 0, (GLsizei)bn, bd);
      if (glGetError() == GL_NO_ERROR) { t->cmp = pre ? 2 : 1; st.blocks++; st.block_bytes += bn; t->bytes = bn; }
      else cf = 0;
    }
    if (!cf) t->bytes = (uint64_t)w * h * 4;
    if (!cf && blocks) st.decoded++;
    if (!cf && t->cmp) { glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA, w, h, 0, GL_RGBA, GL_UNSIGNED_BYTE, nullptr); t->cmp = 0; }   // texels again
    glPixelStorei(GL_UNPACK_ALIGNMENT, 4);
    if (cf) {}
    else if (stride == w) glTexSubImage2D(GL_TEXTURE_2D, 0, 0, 0, w, h, GL_RGBA, GL_UNSIGNED_BYTE, px);
    else for (int32_t y = 0; y < h; y++) glTexSubImage2D(GL_TEXTURE_2D, 0, 0, y, w, 1, GL_RGBA, GL_UNSIGNED_BYTE, px + (size_t)y * stride);
    glBindTexture(GL_TEXTURE_2D, cur_tex);
    t->ver = ver; t->px = px;
  }
  return t;
}
// The texture coordinates come from the image's box (zrt_raster.h image_box: the painted rectangle itself, or the box of a drawImageRect,
// whose negative size mirrors), the filter from raster.cpp's rules: draw_dyn's for a whole opaque runtime image, draw_boxed's otherwise.
static void draw_image(const Cmd& c) {
  if (!(c.w > 0 && c.h > 0 && c.w < 1e30f && c.h < 1e30f && c.x - c.x == 0 && c.y - c.y == 0)) return;
  const Box m = image_box(c);
  if (!(m.w != 0 && m.h != 0 && m.w - m.w == 0 && m.h - m.h == 0 && m.x - m.x == 0 && m.y - m.y == 0)) return;
  const float mw = m.w < 0 ? -m.w : m.w, mh = m.h < 0 ? -m.h : m.h;
  Tex2* t; int mode; bool nearest, alpha = false;
  if (c.res >= DYN_BASE) {
    // the image of the previous IMAGE command, whose version it records (c2), is resolved and uploaded already: sprites skip the lookups
    static struct { int32_t res; uint32_t ver, frame; Tex2* t; int32_t w, h; bool alpha; } last = {-1, 0, 0, nullptr, 0, 0, false};
    if (c.res != last.res || c.c2 != last.ver || st.frames != last.frame) {
      const uint32_t* px; int32_t stride;
      if (!dyn_view(c.res, &px, &last.w, &last.h, &stride)) { last.res = -1; return; }
      last.t = dyn_tex(c.res); last.alpha = dyn_alpha(c.res);
      last.res = c.res; last.ver = c.c2; last.frame = st.frames;
    }
    const int32_t w = last.w, h = last.h;
    if (!((float)w / mw < 1e6f && (float)h / mh < 1e6f)) return;
    t = last.t;
    alpha = last.alpha;
    int32_t sx = f2i((float)w / c.w * 65536), sy = f2i((float)h / c.h * 65536);
    nearest = c.grad == 1 || (sx == 65536 && sy == 65536);
    mode = t && t->cmp ? IMAGE_RGBA : IMAGE_BGR;   // blocks decode to RGBA, the pixels are 0xAARRGGBB
  } else {
    if (c.res < 0 || c.res >= image_count) return;
    const Image& im = images[c.res];
    if (!((float)im.w / mw < 1e6f && (float)im.h / mh < 1e6f)) return;
    t = &baked[c.res];
    if (!t->id) { GLR_TRACE("baked image %d, %dx%d\n", c.res, im.w, im.h); t->id = make_tex(im.w, im.h, GL_RGBA, GL_RGBA, im.rgba, false); t->bytes = (uint64_t)im.w * im.h * 4; t->nearest = 0; t->w = im.w; t->h = im.h; }
    nearest = false; mode = IMAGE_RGBA;
  }
  if (!t || !t->id) return;
  Rect b = bounds(c.x, c.y, c.w, c.h, HUGE_R);
  const bool boxed = (c.pad & kImageBox) || alpha;
  const float mx0 = m.w < 0 ? m.x + m.w : m.x, my0 = m.h < 0 ? m.y + m.h : m.y;
  bool copy = false;
  if (boxed) {
    // one texel a pixel on whole pixels is a copy; through a matrix (XFORM) the pixels are not the image's own any more
    copy = c.grad != 1 && !xf_on && mw == (float)t->w && mh == (float)t->h && m.x == (float)ifloor(m.x) && m.y == (float)ifloor(m.y);
    nearest = c.grad == 1 || copy;
    b = isect(b, bounds(mx0, my0, mw, mh, HUGE_R));   // nothing is painted outside the image
  }
  const bool smooth = c.grad == 2 && !copy && !alpha && c.res >= DYN_BASE;   // ImageFlag.Smooth: the spline of the image shader on linear taps (opaque pictures, as the CPU)
  if (smooth) nearest = false;
  if (b.x0 >= b.x1 || b.y0 >= b.y1) return;
  // a copy samples texel centres, where both filters give the texel: the texture keeps its filter, so the frames of an atlas page drawn
  // at their size and scaled stay in one batch (ZN-438)
  if (!copy) set_filter(*t, nearest);
  use_tex(t->id);
  Q q = box_q(c, b, mode);
  if (boxed && xf_on) {   // through a matrix the quad is the rectangle itself, not the pixels it touches: no texel of the frame beside it at its edges
    q.x0 = c.x > mx0 ? c.x : mx0; q.y0 = c.y > my0 ? c.y : my0;
    q.x1 = c.x + c.w < mx0 + mw ? c.x + c.w : mx0 + mw; q.y1 = c.y + c.h < my0 + mh ? c.y + c.h : my0 + mh;
    if (q.x0 >= q.x1 || q.y0 >= q.y1) return;
  }
  const float rad = image_radius(c);
  q.r = rad > 0 ? rad : 0;   // the CPU does not clamp an image's radius
  q.c1 = image_tint(c);
  q.grad = t->cmp == 2 ? 2 : alpha;   // the coverage is the texture's alpha; 2: its texels are premultiplied
  q.u0 = (q.x0 - m.x) / m.w; q.u1 = (q.x1 - m.x) / m.w; q.v0 = (q.y0 - m.y) / m.h; q.v1 = (q.y1 - m.y) / m.h;
  if (smooth) { q.p1 = 1; q.r = 0; q.bw = (float)t->w; q.bh = (float)t->h; }   // the shader's spline reads the texture's size there
  quad(q);
}


// ---- STROKE (ZN-590.01): one box per segment, around its capsule. A vertex carries the segment (A in u, v; B in bx, by), its neighbours' far
// points (previous P in bw, bh; next N in p1, grad), the radius and, in c2, whether there is a previous and a next segment.
static void draw_stroke(const Cmd& c, const float* p) {
  const uint32_t n = c.n;
  if (n < 2 || !(c.s == c.s) || !c.alpha) return;
  const bool closed = (c.pad & 2) != 0;
  const float r = c.s * 0.5f, e = r + 1.0f;
  const uint32_t segs = closed ? n : n - 1;
  for (uint32_t i = 0; i < segs; i++) {
    const uint32_t ib = (i + 1) % n, ip = (i + n - 1) % n, in = (i + 2) % n;
    const bool hp = closed || i > 0, hn = closed || i + 1 < segs;
    const float ax = p[i * 2], ay = p[i * 2 + 1], bx = p[ib * 2], by = p[ib * 2 + 1];
    // whole pixels: a segment moved by whole pixels (a scroll) gets the same fragments with the same values (ZN-744)
    const float x0 = (float)ifloor((ax < bx ? ax : bx) - e), y0 = (float)ifloor((ay < by ? ay : by) - e), x1 = (float)iceil((ax > bx ? ax : bx) + e), y1 = (float)iceil((ay > by ? ay : by) + e);
    if (!(ax == ax && ay == ay && bx == bx && by == by)) continue;
    if (clip.x1 <= clip.x0 || clip.y1 <= clip.y0 || x1 <= (float)clip.x0 || x0 >= (float)clip.x1 || y1 <= (float)clip.y0 || y0 >= (float)clip.y1) continue;
    if (nq == MAXQ) flush();
    V* v = &verts[nq * 4];
    run_of(STROKE_M);
    nq++;
    const float xs[4] = {x0, x1, x1, x0}, ys[4] = {y0, y0, y1, y1};
    for (int k = 0; k < 4; k++) {
      v[k] = V{xs[k], ys[k], ax, ay, bx, by, hp ? p[ip * 2] : ax, hp ? p[ip * 2 + 1] : ay, r, hn ? p[in * 2] : bx, (float)STROKE_M, hn ? p[in * 2 + 1] : by, {0, 0, 0, 0}, {0, 0, 0, 0}, cur_z};
      setc(v[k].c1, c.c1, c.alpha);
      v[k].c2[0] = hp ? 255 : 0; v[k].c2[1] = hn ? 255 : 0;
    }
  }
}

// ---- LINE / POLY: the software rasterizer draws the shape (white on black, its own 4x4 supersampling and fill rules) into a tile that holds the coverage, and the tile is drawn like a glyph:
// a quad with the colour of the command. Tiles are cached by the content of the command, so a shape that does not change costs one upload and moves for free.
struct PolyTile { uint64_t key; GLuint id; uint32_t used; bool rgba; };
static PolyTile ptiles[64];
static uint32_t ptick;
static float* ptmp; static size_t ptmp_cap;
static uint8_t* pcov; static size_t pcov_cap; static uint8_t* pcol; static size_t pcol_cap; static uint32_t* pband; static size_t pband_cap;
static uint64_t fnv(uint64_t h, const void* p, size_t n) { const uint8_t* b = (const uint8_t*)p; for (size_t i = 0; i < n; i++) { h ^= b[i]; h *= 1099511628211ull; } return h; }
template<class T> static bool grow(T*& buf, size_t& cap, size_t need) {
  if (need <= cap) return true;
  size_t n = cap ? cap : 1024; while (n < need) n *= 2;
  T* nb = (T*)realloc(buf, n * sizeof(T));
  if (!nb) return false;
  buf = nb; cap = n; return true;
}
// ---- RAMP (ZN-725): antialiased edges as geometry, for a GPU where maths per pixel is the cost (GLES 2 tilers: VideoCore IV draws the
// navigation map in 30 ms with them, in 65 with the edge boxes and capsules). A RAMP quad's vertices carry (x, y, t, w) and a pixel covers
// clamp(w - |t|), both interpolated: thin quads along the edges, nothing to compute or discard per pixel. Default on GLES 2;
// ZINC_GL_STRIPS=0 goes back to the capsules and the edge boxes there, =1 draws the strips on desktop GL (tests/t1/gl_strips.sh).
static inline void ramp_set(V* v, const float q[4][3], float w, uint32_t c1, uint32_t alpha) {
  for (int k = 0; k < 4; k++) {
    v[k] = V{q[k][0], q[k][1], q[k][2], w, 0, 0, 0, 0, 0, 0, (float)RAMP_M, 0, {0, 0, 0, 0}, {0, 0, 0, 0}, cur_z};
    setc(v[k].c1, c1, alpha);
  }
}
static void ramp_quad(const float q[4][3], float w, uint32_t c1, uint32_t alpha) {
  float x0 = q[0][0], x1 = x0, y0 = q[0][1], y1 = y0;
  for (int k = 1; k < 4; k++) { x0 = q[k][0] < x0 ? q[k][0] : x0; x1 = q[k][0] > x1 ? q[k][0] : x1; y0 = q[k][1] < y0 ? q[k][1] : y0; y1 = q[k][1] > y1 ? q[k][1] : y1; }
  if (!(x0 == x0 && x1 == x1 && y0 == y0 && y1 == y1)) return;
  if (clip.x1 <= clip.x0 || clip.y1 <= clip.y0 || x1 <= (float)clip.x0 || x0 >= (float)clip.x1 || y1 <= (float)clip.y0 || y0 >= (float)clip.y1) return;
  if (nq == MAXQ) flush();
  run_of(RAMP_M);
  ramp_set(&verts[nq * 4], q, w, c1, alpha);
  nq++;
}
/** A disc of radius R - 0.5 with its antialiased rim (a round cap, a round join): a fan of n triangles around the circle, n such that
 *  its corners stand at most a quarter of a pixel outside. */
static void ramp_disc(float cx, float cy, float R, uint32_t c1, uint32_t alpha) {
  int n = (int)(4.443f * __builtin_sqrtf(R)) + 1;   // R (1 / cos(pi / n) - 1) <= 0.25: n >= pi sqrt(2 R)
  n = n < 8 ? 8 : n > 32 ? 32 : (n + 1) & ~1;
  const float a = 6.2831853f / (float)n, cs = cosf(a), sn = sinf(a), rho = R / cosf(a * 0.5f);
  float x = rho, y = 0;
  for (int k = 0; k < n; k += 2) {   // two triangles a quad: the centre and three points of the rim
    const float xa = x * cs - y * sn, ya = x * sn + y * cs, xb = xa * cs - ya * sn, yb = xa * sn + ya * cs;
    const float q[4][3] = {{cx, cy, 0}, {cx + x, cy + y, R}, {cx + xa, cy + ya, R}, {cx + xb, cy + yb, R}};
    ramp_quad(q, R, c1, alpha);
    x = xb; y = yb;
  }
}
static float* spts; static size_t spts_cap;
/** The points of a polyline without those that repeat the one before them (closed: nor the last when it repeats the first), in spts. */
static uint32_t distinct(const float* p, uint32_t n, bool closed) {
  if (!grow(spts, spts_cap, (size_t)n * 2 + 2)) return 0;
  uint32_t m = 0;
  for (uint32_t i = 0; i < n; i++) {
    const float x = p[i * 2], y = p[i * 2 + 1];
    if (!(x == x && y == y)) continue;
    if (m) { const float dx = x - spts[m * 2 - 2], dy = y - spts[m * 2 - 1]; if (dx * dx + dy * dy < 1e-6f) continue; }
    spts[m * 2] = x; spts[m * 2 + 1] = y; m++;
  }
  if (closed && m > 1) { const float dx = spts[0] - spts[m * 2 - 2], dy = spts[1] - spts[m * 2 - 1]; if (dx * dx + dy * dy < 1e-6f) m--; }
  return m;
}
/** An opaque STROKE as strips: one quad per segment across its width, t the signed distance to the centre line, w the half width + 0.5.
 *  Two segments that turn by less than 37 degrees share their corners (a miter: no gap and no overlap, the tip within 0.06 of the half
 *  width of the round join); a sharper turn and the ends of an open line get a disc. Where the pieces overlap the colour is blended
 *  twice, which an opaque stroke does not show: a translucent one keeps the capsules (draw_stroke), blended once. */
static void stroke_strips(const Cmd& c, const float* p0) {
  if (c.n < 2 || !(c.s == c.s)) return;
  bool closed = (c.pad & 2) != 0;
  const uint32_t n = distinct(p0, c.n, closed);
  const float* p = spts;
  const float R = c.s * 0.5f + 0.5f;
  if (!n) return;
  if (n == 1) { ramp_disc(p[0], p[1], R, c.c1, c.alpha); return; }
  if (n == 2) closed = false;
  const uint32_t segs = closed ? n : n - 1;
  auto dir = [p, n](uint32_t i, float& dx, float& dy) {   // of segment i, unit
    const uint32_t j = (i + 1) % n;
    dx = p[j * 2] - p[i * 2]; dy = p[j * 2 + 1] - p[i * 2 + 1];
    const float l = __builtin_sqrtf(dx * dx + dy * dy);
    dx /= l; dy /= l;
  };
  float pdx = 0, pdy = 0, dx, dy;
  if (closed) dir(n - 1, pdx, pdy);
  dir(0, dx, dy);
  for (uint32_t i = 0; i < segs; i++) {
    const uint32_t ib = (i + 1) % n;
    const float ax = p[i * 2], ay = p[i * 2 + 1], bx = p[ib * 2], by = p[ib * 2 + 1];
    float oax = -dy, oay = dx, obx = -dy, oby = dx, ndx = 0, ndy = 0;   // the corners' offsets for a radius of 1: the normal, or the miter
    const float cp = closed || i > 0 ? pdx * dx + pdy * dy : -1;
    if (cp >= 0.8f) { oax = (-pdy - dy) / (1 + cp); oay = (pdx + dx) / (1 + cp); }
    else ramp_disc(ax, ay, R, c.c1, c.alpha);   // a sharp join, or the cap of the start
    if (closed || i + 1 < segs) {
      dir(ib, ndx, ndy);
      const float cn = dx * ndx + dy * ndy;
      if (cn >= 0.8f) { obx = (-dy - ndy) / (1 + cn); oby = (dx + ndx) / (1 + cn); }   // else the next segment draws the join's disc
    } else ramp_disc(bx, by, R, c.c1, c.alpha);
    const float q[4][3] = {{ax + R * oax, ay + R * oay, R}, {bx + R * obx, by + R * oby, R}, {bx - R * obx, by - R * oby, -R}, {ax - R * oax, ay - R * oay, -R}};
    ramp_quad(q, R, c.c1, c.alpha);
    pdx = dx; pdy = dy; dx = ndx; dy = ndy;
  }
}
// ---- LINE / POLY on the GPU (ZN-590.02): stencil then cover, NanoVG's technique (docs/reports/gpu-renderer-design.md). The contours'
// triangle fans count the winding at the pixel centres in the stencil's low 7 bits (nonzero: +1 / -1 by facing; even-odd: bit 0 flips).
// The pixels near an edge take their coverage from the distance to it (EDGE mode, each owned by the nearest edge): inside the fill
// 0.5 + d, written once (the stencil becomes 0x80), outside 0.5 - d, once; the cover quad fills the rest of the inside; a last quad
// zeroes the stencil. The canvas gradient paint (grad 4) is computed by the shader from its geometry and stops (ZN-590.04); more than 8
// stops and a framebuffer without stencil keep the CPU tiles (draw_poly). Consecutive POLYs whose boxes are apart share one set of
// passes (a batch): their pixels never meet, so one stencil serves them all and 7 draw calls cover up to 64 shapes.
static float* fanv; static size_t fanv_cap, nfan;   // the batch's fan triangles (x, y), in floats
static V* edgev; static size_t edgev_cap; static uint32_t nedge;   // the batch's fringe quads, drawn by each pass (edge_draw)
struct PolyBox { Rect b; uint32_t c1, alpha; float z; };
static PolyBox pboxes[64]; static int npoly;
static bool pevenodd;
static const float* ppaint;   // the gradient paint record of a batch of one
static float* boxv; static size_t boxv_cap;
// raster.cpp's record [kind, x0, y0, r0, x1, y1, r1, n, (offset, 0xRRGGBB, alpha) * n] as the shader's uniforms (u_g0.w = 0: no paint)
static void set_paint(const float* g, int mode) {   // on the program that draws `mode` with a paint
  const int n = (int)g[7] < 8 ? (int)g[7] : 8;   // ponytail: a box turned by a matrix keeps its first 8 stops (unturned, more take a CPU tile)
  float gc[32] = {}, go[8] = {};
  for (int i = 0; i < n; i++) {
    const uint32_t col = (uint32_t)g[9 + i * 3];
    go[i] = g[8 + i * 3];
    gc[i * 4] = (float)(col >> 16 & 255); gc[i * 4 + 1] = (float)(col >> 8 & 255); gc[i * 4 + 2] = (float)(col & 255); gc[i * 4 + 3] = (float)(uint32_t)g[10 + i * 3];
  }
  paint_on = true;
  const Prog& p = use_prog(key_of(mode));
  glUniform4f(p.u_g0, g[1], g[2], g[3], g[0]); glUniform4f(p.u_g1, g[4], g[5], g[6], (float)n);
  glUniform4fv(p.u_gc, 8, gc); glUniform1fv(p.u_go, 8, go);
}
static void end_paint() {
  paint_on = false;
#if GLR_CORE
  glUniform4f(use_prog(0).u_g0, 0, 0, 0, 0);   // the single program: no paint (u_g0.w); on GLES 2 the programs without the paint block draw again
#endif
}
static double fringe_px;   // ZINC_GL_STATS: the pixels the fringe quads cover (each is the box of its edge, drawn by every pass)
static void edge_quads(const float* pts, uint32_t contours, uint32_t c1, uint32_t alpha) {
  static const bool on = !getenv("ZINC_GL_FRINGE") || atoi(getenv("ZINC_GL_FRINGE")) != 0;   // 0: no antialiased edges, to measure what they cost
  if (!on) return;
  static const bool stats = getenv("ZINC_GL_STATS") != nullptr;
  uint32_t at = 0;
  for (uint32_t k = 0; k < contours; k++) {
    const uint32_t cnt = (uint32_t)pts[at];
    const float* p = pts + at + 1;
    at += 1 + cnt * 2;
    if (cnt < 3) continue;
    for (uint32_t i = 0; i < cnt; i++) {
      const uint32_t ib = (i + 1) % cnt, ip = (i + cnt - 1) % cnt, in = (i + 2) % cnt;
      const float ax = p[i * 2], ay = p[i * 2 + 1], bx = p[ib * 2], by = p[ib * 2 + 1];
      const float x0 = (float)ifloor((ax < bx ? ax : bx) - 1), y0 = (float)ifloor((ay < by ? ay : by) - 1), x1 = (float)iceil((ax > bx ? ax : bx) + 1), y1 = (float)iceil((ay > by ? ay : by) + 1);   // whole pixels (ZN-744)
      if (x1 <= (float)clip.x0 || x0 >= (float)clip.x1 || y1 <= (float)clip.y0 || y0 >= (float)clip.y1) continue;
      if (stats) fringe_px += (double)((x1 < (float)clip.x1 ? x1 : (float)clip.x1) - (x0 > (float)clip.x0 ? x0 : (float)clip.x0)) * ((y1 < (float)clip.y1 ? y1 : (float)clip.y1) - (y0 > (float)clip.y0 ? y0 : (float)clip.y0));
      if (!grow(edgev, edgev_cap, ((size_t)nedge + 1) * 4)) return;
      V* v = &edgev[nedge * 4];
      nedge++;
      const float xs[4] = {x0, x1, x1, x0}, ys[4] = {y0, y0, y1, y1};
      for (int q = 0; q < 4; q++) {
        v[q] = V{xs[q], ys[q], ax, ay, bx, by, p[ip * 2], p[ip * 2 + 1], 0, p[in * 2], (float)EDGE_M, p[in * 2 + 1], {0, 0, 0, 0}, {0, 0, 0, 0}, cur_z};
        setc(v[q].c1, c1, alpha);
      }
    }
  }
}
// The fringes as strips (RAMP, ZN-725): each edge A-B gets two quads half a pixel wide, one on its left (edgev) and one on its right
// (edgev_r), t the distance to the edge: 0 along it, 0.5 at the far side. The passes of poly_flush pick the side by drawing one array
// instead of testing it per pixel. Neighbouring edges share their far corners on the bisector (no gap, no overlap; past a turn of 120
// degrees the corner stays within a pixel of the vertex, with the t it has there).
static V* edgev_r; static size_t edgev_r_cap;
static float* mit; static size_t mit_cap;   // per point of a contour: the unit normal of the edge that leaves it, its miter, the miter's t
static void edge_strips(const float* pts, uint32_t contours, uint32_t c1, uint32_t alpha) {
  static const bool on = !getenv("ZINC_GL_FRINGE") || atoi(getenv("ZINC_GL_FRINGE")) != 0;
  if (!on) return;
  static const bool stats = getenv("ZINC_GL_STATS") != nullptr;
  uint32_t at = 0;
  for (uint32_t k = 0; k < contours; k++) {
    const uint32_t cnt = (uint32_t)pts[at];
    const float* src = pts + at + 1;
    at += 1 + cnt * 2;
    if (cnt < 3) continue;
    const uint32_t m = distinct(src, cnt, true);
    const float* p = spts;
    if (m < 3 || !grow(mit, mit_cap, (size_t)m * 5)) continue;
    for (uint32_t i = 0; i < m; i++) {
      const uint32_t j = (i + 1) % m;
      const float dx = p[j * 2] - p[i * 2], dy = p[j * 2 + 1] - p[i * 2 + 1], l = __builtin_sqrtf(dx * dx + dy * dy);
      mit[i * 5] = -dy / l; mit[i * 5 + 1] = dx / l;   // on the left of A-B: cross > 0
    }
    for (uint32_t i = 0; i < m; i++) {
      const float* a = mit + ((i + m - 1) % m) * 5; const float* b = mit + i * 5;
      float mx = a[0] + b[0], my = a[1] + b[1];
      const float den = 1 + a[0] * b[0] + a[1] * b[1];
      if (den >= 0.5f) { mx /= den; my /= den; }
      else { const float l = __builtin_sqrtf(mx * mx + my * my); const float s = l > 1e-3f ? 2 / l : 0; mx *= s; my *= s; }
      mit[i * 5 + 2] = mx; mit[i * 5 + 3] = my; mit[i * 5 + 4] = 0.5f * (mx * b[0] + my * b[1]);
    }
    for (uint32_t i = 0; i < m; i++) {
      const uint32_t j = (i + 1) % m;
      const float ax = p[i * 2], ay = p[i * 2 + 1], bx = p[j * 2], by = p[j * 2 + 1];
      const float x0 = (ax < bx ? ax : bx) - 1, y0 = (ay < by ? ay : by) - 1, x1 = (ax > bx ? ax : bx) + 1, y1 = (ay > by ? ay : by) + 1;
      if (x1 <= (float)clip.x0 || x0 >= (float)clip.x1 || y1 <= (float)clip.y0 || y0 >= (float)clip.y1) continue;
      if (stats) fringe_px += __builtin_sqrtf((bx - ax) * (bx - ax) + (by - ay) * (by - ay));   // two halves, half a pixel wide each
      if (!grow(edgev, edgev_cap, ((size_t)nedge + 1) * 4) || !grow(edgev_r, edgev_r_cap, ((size_t)nedge + 1) * 4)) return;
      const float* ma = mit + i * 5 + 2; const float* mb = mit + j * 5 + 2;
      const float l[4][3] = {{ax, ay, 0}, {bx, by, 0}, {bx + 0.5f * mb[0], by + 0.5f * mb[1], mb[2]}, {ax + 0.5f * ma[0], ay + 0.5f * ma[1], ma[2]}};
      const float r[4][3] = {{ax, ay, 0}, {bx, by, 0}, {bx - 0.5f * mb[0], by - 0.5f * mb[1], mb[2]}, {ax - 0.5f * ma[0], ay - 0.5f * ma[1], ma[2]}};
      ramp_set(&edgev[nedge * 4], l, 0.5f, c1, alpha);
      ramp_set(&edgev_r[nedge * 4], r, 0.5f, c1, alpha);
      nedge++;
    }
  }
}
static void edge_range(uint32_t first, uint32_t count) {   // quads of the buffer edge_upload filled
  glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, ibo);
  apply_clip();
  glBindTexture(GL_TEXTURE_2D, cur_tex);
  glBindBuffer(GL_ARRAY_BUFFER, evbo);
  for (uint32_t q0 = first; q0 < first + count; q0 += MAXQ) {   // the index buffer holds MAXQ quads
    const uint32_t nq2 = first + count - q0 < (uint32_t)MAXQ ? first + count - q0 : (uint32_t)MAXQ;
    attribs((size_t)q0 * 4 * sizeof(V));
    glDrawElements(GL_TRIANGLES, (GLsizei)nq2 * 6, GL_UNSIGNED_SHORT, nullptr);
    st.draws++; st.quads += nq2;
  }
}
/** One pass over the fringes uploaded by edge_upload: side 0 every pixel near an edge, 1 only those left of A-B (cross > 0), 2 right of
 *  it; inside: the pixels cover 0.5 + their distance to the edge, else 0.5 - it. */
static void edge_draw(int side, bool inside) {
  if (!nedge) return;
  if (strips) {   // the side is an array: the left quads come first in the buffer
    glUniform3f(use_prog(key_of(RAMP_M)).u_edge, 0, 0, inside ? 1.f : -1.f);
    edge_range(side == 2 ? nedge : 0, side ? nedge : nedge * 2);
    return;
  }
  glUniform3f(use_prog(key_of(EDGE_M)).u_edge, side ? 1.f : 0.f, side == 1 ? 1.f : 0.f, inside ? 1.f : 0.f);
  edge_range(0, nedge);
}
static void edge_upload() {
  if (!nedge) return;
  glBindBuffer(GL_ARRAY_BUFFER, evbo);
  const GLsizeiptr half = (GLsizeiptr)nedge * 4 * sizeof(V);
  if (!strips) { glBufferData(GL_ARRAY_BUFFER, half, edgev, GL_STREAM_DRAW); return; }
  glBufferData(GL_ARRAY_BUFFER, half * 2, nullptr, GL_STREAM_DRAW);
  glBufferSubData(GL_ARRAY_BUFFER, 0, half, edgev);
  glBufferSubData(GL_ARRAY_BUFFER, half, half, edgev_r);
}
static void stencil_draw(const float* v, size_t n) {   // triangles (x, y) into the stencil only, depth ignored
  glColorMask(GL_FALSE, GL_FALSE, GL_FALSE, GL_FALSE);
  if (occl) glDisable(GL_DEPTH_TEST);
  glUseProgram(fprog);
  glUniform2f(f_res, (float)W, (float)H);
  glUniform1f(f_flip, flipy ? -1.f : 1.f);
  glBindBuffer(GL_ARRAY_BUFFER, fvbo);
  glBufferData(GL_ARRAY_BUFFER, (GLsizeiptr)(n * 2 * sizeof(float)), v, GL_STREAM_DRAW);
  glEnableVertexAttribArray(0); glVertexAttribPointer(0, 2, GL_FLOAT, GL_FALSE, 8, (void*)0);
  apply_clip();
  glDrawArrays(GL_TRIANGLES, 0, (GLsizei)n);
  st.draws++;
  cur_prog = nullptr;
  if (occl) glEnable(GL_DEPTH_TEST);
  glColorMask(GL_TRUE, GL_TRUE, GL_TRUE, GL_TRUE);
}
/** Adds a POLY to the batch, or says it cannot go there: false when it needs the CPU tiles, or when the batch already holds shapes that
 *  its box meets, another fill rule or a gradient (the caller draws the batch and starts another). Nothing to draw is accepted. */
static bool poly_add(const Cmd& c, const float* pts) {
  if (!stencil_ok) return false;
  if (!(c.w == c.w && c.h == c.h && c.x == c.x && c.y == c.y) || !c.alpha) return true;
  const Rect b = isect(bounds(c.x - 1, c.y - 1, c.w + 2, c.h + 2, HUGE_R), clip);
  if (b.x0 >= b.x1 || b.y0 >= b.y1) return true;
  size_t ntri = 0, nf = 0;
  for (uint32_t k = 0; k < c.n; k++) {   // counts as in draw_poly: a broken list ends here
    const float cnt = pts[nf];
    if (!(cnt >= 0 && cnt < 1e7f)) return true;
    if (cnt >= 3) ntri += (size_t)cnt - 2;
    nf += 1 + (size_t)cnt * 2;
  }
  if (!ntri) return true;
  const float* paint = nullptr;
  if (c.grad == 4) { const float n = pts[nf + 7]; if (!(n >= 1 && n <= 8)) return false; paint = pts + nf; }
  const bool evenodd = (c.pad & 1) != 0;
  if (npoly) {
    if (paint || ppaint || npoly == 64 || evenodd != pevenodd) return false;
    for (int i = 0; i < npoly; i++) {   // ponytail: every pair, at most 64 boxes
      const Rect& o = pboxes[i].b;
      if (b.x0 < o.x1 && o.x0 < b.x1 && b.y0 < o.y1 && o.y0 < b.y1) return false;
    }
  }
  if (!grow(fanv, fanv_cap, nfan + ntri * 6)) return true;
  size_t at = 0;
  for (uint32_t k = 0; k < c.n; k++) {
    const uint32_t cnt = (uint32_t)pts[at];
    const float* p = pts + at + 1;
    at += 1 + cnt * 2;
    for (uint32_t i = 1; i + 1 < cnt; i++) {
      float* o = fanv + nfan;
      o[0] = p[0]; o[1] = p[1]; o[2] = p[i * 2]; o[3] = p[i * 2 + 1]; o[4] = p[i * 2 + 2]; o[5] = p[i * 2 + 3];
      nfan += 6;
    }
  }
  if (strips) edge_strips(pts, c.n, c.c1, c.alpha); else edge_quads(pts, c.n, c.c1, c.alpha);
  pboxes[npoly++] = PolyBox{b, c.c1, c.alpha, cur_z};
  pevenodd = evenodd; ppaint = paint;
  return true;
}
static void poly_cover() {   // the boxes of the batch, each in its polygon's colour, where the stencil test passes
  const float z = cur_z;
  for (int i = 0; i < npoly; i++) {
    const PolyBox& pb = pboxes[i];
    Q q = {};
    q.x0 = (float)pb.b.x0; q.y0 = (float)pb.b.y0; q.x1 = (float)pb.b.x1; q.y1 = (float)pb.b.y1;
    q.mode = SOLID; q.c1 = pb.c1; q.alpha = pb.alpha;
    cur_z = pb.z;
    quad(q);
  }
  cur_z = z;
  flush();
}
/** Draws the batch: the fans count the winding, the fringes inside, the cover, the fringes outside, the stencil back to 0. */
static void poly_flush() {
  if (!npoly) return;
  flush();
  if (!grow(boxv, boxv_cap, (size_t)npoly * 12)) { npoly = 0; nfan = 0; nedge = 0; ppaint = nullptr; return; }
  for (int i = 0; i < npoly; i++) {
    const Rect& b = pboxes[i].b;
    const float q[12] = {(float)b.x0, (float)b.y0, (float)b.x1, (float)b.y0, (float)b.x1, (float)b.y1, (float)b.x0, (float)b.y0, (float)b.x1, (float)b.y1, (float)b.x0, (float)b.y1};
    memcpy(boxv + i * 12, q, sizeof q);
  }
  if (ppaint) {   // on the program of the cover and on the one of the fringes
    const int fringe = strips ? RAMP_M : EDGE_M;
    set_paint(ppaint, SOLID);
    if (key_of(fringe) != key_of(SOLID)) set_paint(ppaint, fringe);
  }
  glEnable(GL_STENCIL_TEST);
  glStencilFunc(GL_ALWAYS, 0, 0xFF);
  if (pevenodd) { glStencilMask(0x01); glStencilOp(GL_KEEP, GL_KEEP, GL_INVERT); }
  else {   // nonzero: the winding in 7 bits
    glStencilMask(0x7F);
    glStencilOpSeparate(GL_FRONT, GL_KEEP, GL_KEEP, GL_INCR_WRAP);
    glStencilOpSeparate(GL_BACK, GL_KEEP, GL_KEEP, GL_DECR_WRAP);
  }
  stencil_draw(fanv, nfan / 2);
  // the inside pixels near an edge that bounds the fill there: drawn, then marked by bit 7. Even-odd: every edge bounds it. Nonzero:
  // crossing A-B takes the winding of a pixel left of it (cross > 0 in our coordinates, front faces counting +1) down by 1 and of a
  // pixel right of it up by 1, so the edge bounds the fill for a winding of 1 on its left and -1 on its right (flipped window rows swap
  // the sides). Overlapping or touching contours therefore leave no seam where one covers the other's edge.
  glStencilOp(GL_KEEP, GL_KEEP, GL_INVERT);
  edge_upload();
  if (strips) {
    // GLES 2 (ZN-725): the same pixels in five draw calls, not seven. A drawn inside pixel loses its winding with the same write that
    // marks it (0x01 or 0x7F inverted under the right mask is 0x80), the outside pixels are drawn before the cover and marked the same
    // way, and the cover zeroes whatever it does not draw: the two stencil-only passes over the boxes are not needed.
    if (pevenodd) { glStencilMask(0x81); glStencilFunc(GL_EQUAL, 0x01, 0x81); edge_draw(0, true); }
    else {
      glStencilMask(0x81); glStencilFunc(GL_EQUAL, 0x01, 0xFF); edge_draw(flipy ? 2 : 1, true);
      glStencilMask(0xFF); glStencilFunc(GL_EQUAL, 0x7F, 0xFF); edge_draw(flipy ? 1 : 2, true);
    }
    glStencilMask(0x80); glStencilFunc(GL_EQUAL, 0, 0xFF); edge_draw(0, false);
    glStencilMask(0xFF); glStencilFunc(GL_NOTEQUAL, 0, 0x7F); glStencilOp(GL_ZERO, GL_ZERO, GL_ZERO);
    poly_cover();
    glDisable(GL_STENCIL_TEST);
    if (ppaint) end_paint();
    npoly = 0; nfan = 0; nedge = 0; ppaint = nullptr;
    return;
  }
  glStencilMask(0x80);
  if (pevenodd) {
    glStencilFunc(GL_EQUAL, 0x01, 0x81);
    edge_draw(0, true);
  } else {
    glStencilFunc(GL_EQUAL, 0x01, 0xFF);
    edge_draw(flipy ? 2 : 1, true);
    glStencilFunc(GL_EQUAL, 0x7F, 0xFF);
    edge_draw(flipy ? 1 : 2, true);
    glStencilMask(0x7F);   // the marked pixels lose their winding, so the cover skips them
    glStencilFunc(GL_EQUAL, 0x80, 0x80);
    glStencilOp(GL_KEEP, GL_ZERO, GL_ZERO);
    stencil_draw(boxv, (size_t)npoly * 6);
  }
  glStencilMask(0xFF);
  // the rest of the inside: drawn, then 0 (a hidden pixel too)
  if (pevenodd) glStencilFunc(GL_EQUAL, 0x01, 0x81); else glStencilFunc(GL_NOTEQUAL, 0, 0x7F);
  glStencilOp(GL_KEEP, GL_ZERO, GL_ZERO);
  poly_cover();
  // the outside pixels near an edge: stencil 0 -> drawn, then counted (once)
  glStencilFunc(GL_EQUAL, 0, 0xFF);
  glStencilOp(GL_KEEP, GL_INCR, GL_INCR);
  edge_draw(0, false);
  // back to 0 over the boxes
  glStencilFunc(GL_NOTEQUAL, 0, 0xFF);
  glStencilOp(GL_ZERO, GL_ZERO, GL_ZERO);
  stencil_draw(boxv, (size_t)npoly * 6);
  glDisable(GL_STENCIL_TEST);
  if (ppaint) end_paint();
  npoly = 0; nfan = 0; nedge = 0; ppaint = nullptr;
}

// A POLY of one convex contour of 3 to 8 points (a card with a folded corner, a triangle, an arrow head): one pass over its box, each pixel
// covering 0.5 plus its smallest signed distance to the edges, which is the coverage along an edge. The stencil path draws a polygon's box
// four to six times: 30 card-sized polygons took 9 ms of a 14 ms frame at 3104 x 1746 (ZN-679). Not one: false (no gradient paint either).
static bool convex_ok(const Cmd& c, const float* pts) { return c.kind == POLY && c.n == 1 && c.grad != 4 && pts[0] >= 3 && pts[0] <= 8; }
static bool draw_convex(const Cmd& c, const float* pts) {
  if (!convex_ok(c, pts)) return false;
  if (!(c.w == c.w && c.h == c.h && c.x == c.x && c.y == c.y) || !c.alpha) return true;
  const int n = (int)pts[0];
  const float* p = pts + 1;
  double area = 0;
  for (int i = 0; i < n; i++) { const int j = (i + 1) % n; area += (double)p[i * 2] * p[j * 2 + 1] - (double)p[j * 2] * p[i * 2 + 1]; }
  if (!(area > 1e-6 || area < -1e-6)) return true;   // no inside: nothing to draw
  const double s = area > 0 ? 1 : -1;
  float eq[24];
  int ne = 0;
  for (int i = 0; i < n; i++) {
    const int j = (i + 1) % n, k = (i + 2) % n;
    const double ax = p[i * 2], ay = p[i * 2 + 1], ex = p[j * 2] - ax, ey = p[j * 2 + 1] - ay, fx = p[k * 2] - p[j * 2], fy = p[k * 2 + 1] - p[j * 2 + 1];
    if ((ex * fy - ey * fx) * s < -1e-3) return false;   // a reflex corner: the stencil path
    const double len = __builtin_sqrt(ex * ex + ey * ey);
    if (len < 1e-6) continue;
    eq[ne * 3] = (float)(-s * ey / len); eq[ne * 3 + 1] = (float)(s * ex / len); eq[ne * 3 + 2] = (float)(s * (ey * ax - ex * ay) / len);
    ne++;
  }
  const Rect b = isect(bounds(c.x - 1, c.y - 1, c.w + 2, c.h + 2, HUGE_R), clip);
  if (b.x0 >= b.x1 || b.y0 >= b.y1) return true;
  flush();
  for (int k = 0; k < ne; k++) eq[k * 3 + 2] = (float)((double)eq[k * 3 + 2] + (double)eq[k * 3] * b.x0 + (double)eq[k * 3 + 1] * b.y0);   // relative to the quad's corner (the VS's origin)
  const Prog& cp = use_prog(key_of(CONVEX_M));
  glUniform3fv(cp.u_cv, 8, eq);
  glUniform1f(cp.u_cvn, (float)ne);
  Q q = {};
  q.x0 = (float)b.x0; q.y0 = (float)b.y0; q.x1 = (float)b.x1; q.y1 = (float)b.y1;
  q.bx = (float)b.x0; q.by = (float)b.y0;
  q.mode = CONVEX_M; q.c1 = c.c1; q.alpha = c.alpha;
  quad(q);
  flush();
  return true;
}
/** The same polygons as strips (RAMP, ZN-725), without the stencil and without a pass over the box: the polygon shrunk by half a pixel
 *  covers its pixels whole (a fan), and a quad along each edge goes from there (1) to half a pixel outside (0), which is the same
 *  0.5 + distance. Neighbouring quads share their corners on the bisector. False: a polygon too thin to shrink, a reflex or a very sharp
 *  corner (over 150 degrees of turn): the stencil path. */
static bool convex_strips(const Cmd& c, const float* pts) {
  if (!convex_ok(c, pts)) return false;
  if (!(c.w == c.w && c.h == c.h && c.x == c.x && c.y == c.y) || !c.alpha) return true;
  const Rect b = isect(bounds(c.x - 1, c.y - 1, c.w + 2, c.h + 2, HUGE_R), clip);
  if (b.x0 >= b.x1 || b.y0 >= b.y1) return true;
  const uint32_t n = distinct(pts + 1, (uint32_t)pts[0], true);
  const float* p = spts;
  if (n < 3) return true;
  double area = 0;
  for (uint32_t i = 0; i < n; i++) { const uint32_t j = (i + 1) % n; area += (double)p[i * 2] * p[j * 2 + 1] - (double)p[j * 2] * p[i * 2 + 1]; }
  if (!(area > 1e-6 || area < -1e-6)) return true;   // no inside: nothing to draw
  const float s = area > 0 ? 1.f : -1.f;
  float nrm[8][2], in[8][2], out[8][3];   // the edges' unit normals towards the inside; per point, the shrunk corner and the outer one with its t
  for (uint32_t i = 0; i < n; i++) {
    const uint32_t j = (i + 1) % n, k = (i + 2) % n;
    const float ex = p[j * 2] - p[i * 2], ey = p[j * 2 + 1] - p[i * 2 + 1], fx = p[k * 2] - p[j * 2], fy = p[k * 2 + 1] - p[j * 2 + 1];
    if ((ex * fy - ey * fx) * s < -1e-3f) return false;   // a reflex corner
    const float l = __builtin_sqrtf(ex * ex + ey * ey);
    nrm[i][0] = -s * ey / l; nrm[i][1] = s * ex / l;
  }
  for (uint32_t i = 0; i < n; i++) {
    const float* a = nrm[(i + n - 1) % n]; const float* e = nrm[i];
    const float den = 1 + a[0] * e[0] + a[1] * e[1];
    if (den < 0.13f) return false;
    float mx = (a[0] + e[0]) / den, my = (a[1] + e[1]) / den;
    in[i][0] = p[i * 2] + 0.5f * mx; in[i][1] = p[i * 2 + 1] + 0.5f * my;
    const float l = __builtin_sqrtf(mx * mx + my * my);
    if (l > 2) { mx *= 2 / l; my *= 2 / l; }   // a sharp corner: its outer point stays within a pixel, where the coverage is not 0 yet
    out[i][0] = p[i * 2] - 0.5f * mx; out[i][1] = p[i * 2 + 1] - 0.5f * my; out[i][2] = 0.5f + 0.5f * (mx * e[0] + my * e[1]);
  }
  for (uint32_t i = 0; i < n; i++) {   // shrinking must leave every edge its direction
    const uint32_t j = (i + 1) % n;
    if ((in[j][0] - in[i][0]) * (p[j * 2] - p[i * 2]) + (in[j][1] - in[i][1]) * (p[j * 2 + 1] - p[i * 2 + 1]) <= 0) return false;
  }
  for (uint32_t k = 1; k + 1 < n; k += 2) {   // the inside: two triangles of the fan a quad
    const uint32_t k2 = k + 2 < n ? k + 2 : k + 1;
    const float q[4][3] = {{in[0][0], in[0][1], 0}, {in[k][0], in[k][1], 0}, {in[k + 1][0], in[k + 1][1], 0}, {in[k2][0], in[k2][1], 0}};
    ramp_quad(q, 1, c.c1, c.alpha);
  }
  for (uint32_t i = 0; i < n; i++) {
    const uint32_t j = (i + 1) % n;
    const float q[4][3] = {{in[i][0], in[i][1], 0}, {in[j][0], in[j][1], 0}, {out[j][0], out[j][1], out[j][2]}, {out[i][0], out[i][1], out[i][2]}};
    ramp_quad(q, 1, c.c1, c.alpha);
  }
  return true;
}
// A RECT with a paint record of more stops than the shader takes (grad 5) is drawn the same way: its box is the shape.
static void draw_poly(const Cmd& c, const float* pts) {
  if (!(c.w == c.w && c.h == c.h && c.x == c.x && c.y == c.y)) return;
  Rect b = bounds(c.x, c.y, c.w, c.h, Rect{0, 0, W, H});
  if (b.x0 >= b.x1 || b.y0 >= b.y1) return;
  const int32_t bw = b.x1 - b.x0, bh = b.y1 - b.y0;
  const bool rect = c.kind == RECT;
  const uint32_t contours = rect ? 0 : c.n;
  size_t nf = 0;   // floats of the contours
  for (uint32_t k = 0; k < contours; k++) { float cnt = pts[nf]; if (!(cnt >= 0 && cnt < 1e7f)) return; nf += 1 + (size_t)cnt * 2; }
  const bool paint = c.grad == 4 || rect;   // a gradient paint record follows the contours: [kind, x0, y0, r0, x1, y1, r1, n, (offset, colour, alpha) * n]
  size_t pf = 0;
  if (paint) { float n = pts[nf + 7]; if (!(n >= 0 && n < 4096)) return; pf = 8 + (size_t)n * 3; }
  if (!grow(ptmp, ptmp_cap, nf + pf)) return;
  size_t at = 0;
  for (uint32_t k = 0; k < contours; k++) {   // the contours moved so that the tile starts at the origin: the key does not depend on where the shape is
    int32_t cnt = (int32_t)pts[at]; ptmp[at] = pts[at];
    for (int32_t i = 0; i < cnt; i++) { ptmp[at + 1 + i * 2] = pts[at + 1 + i * 2] - (float)b.x0; ptmp[at + 2 + i * 2] = pts[at + 2 + i * 2] - (float)b.y0; }
    at += 1 + (size_t)cnt * 2;
  }
  if (paint) {   // its geometry moved too: points, except the radii of an ellipse (kind 3) and a conic's unused pair (4)
    memcpy(ptmp + nf, pts + nf, pf * sizeof(float)); ptmp[nf + 1] -= (float)b.x0; ptmp[nf + 2] -= (float)b.y0;
    if (((int32_t)ptmp[nf] & 7) <= 2) { ptmp[nf + 4] -= (float)b.x0; ptmp[nf + 5] -= (float)b.y0; }
  }
  uint64_t key = 1469598103934665603ull;
  const int32_t head[4] = {bw, bh, (int32_t)c.n, (int32_t)c.pad};
  key = fnv(key, head, sizeof head); key = fnv(key, ptmp, (nf + pf) * sizeof(float)); key = fnv(key, &c.alpha, 1);
  float ox = c.x - (float)b.x0, oy = c.y - (float)b.y0;
  key = fnv(key, &ox, 4); key = fnv(key, &oy, 4); key = fnv(key, &c.w, 4); key = fnv(key, &c.h, 4);
  if (!key) key = 1;
  PolyTile* t = nullptr; PolyTile* oldest = &ptiles[0];
  for (PolyTile& e : ptiles) { if (e.id && e.key == key) { t = &e; break; } if (!e.id || e.used < oldest->used) oldest = &e; if (!e.id) { oldest = &e; break; } }
  if (!t) {
    const size_t px = (size_t)bw * bh;
    if (!grow(pcov, pcov_cap, px) || !grow(pband, pband_cap, px)) return;
    Cmd tc = c; tc.kind = rect ? RECT : POLY; tc.x = ox; tc.y = oy; tc.off = 0;
    Frame f = {&tc, 1, nullptr, ptmp};
    memset(pband, 0, px * sizeof(uint32_t));
    if (!paint) {   // a colour: the coverage alone
      tc.c1 = 0xFFFFFF; tc.c2 = 0xFFFFFF; tc.alpha = 255; tc.grad = 0;
      render(f, pband, bw, 0, bh, Rect{0, 0, bw, bh});
      for (size_t i = 0; i < px; i++) pcov[i] = (uint8_t)(pband[i] & 255);
    } else {   // a gradient: the paint over black (colour x coverage), and the same shape painted white (coverage x alpha); colour = first / second, alpha = second
      if (!grow(pcol, pcol_cap, px * 4)) return;
      render(f, pband, bw, 0, bh, Rect{0, 0, bw, bh});
      for (size_t i = 0; i < px; i++) { uint32_t v = pband[i]; pcol[i * 4] = (uint8_t)(v >> 16); pcol[i * 4 + 1] = (uint8_t)(v >> 8); pcol[i * 4 + 2] = (uint8_t)v; }
      for (size_t k = 0; k < (size_t)ptmp[nf + 7]; k++) ptmp[nf + 8 + k * 3 + 1] = 16777215.0f;
      memset(pband, 0, px * sizeof(uint32_t));
      render(f, pband, bw, 0, bh, Rect{0, 0, bw, bh});
      for (size_t i = 0; i < px; i++) {
        const uint32_t w = pband[i] & 255;
        for (int k = 0; k < 3; k++) { uint32_t v = w ? (pcol[i * 4 + k] * 255u + w / 2) / w : 0; pcol[i * 4 + k] = (uint8_t)(v > 255 ? 255 : v); }
        pcol[i * 4 + 3] = (uint8_t)w;
      }
    }
    flush();
    st.ptiles++;
    GLR_TRACE("LINE/POLY tile %dx%d\n", bw, bh);
    if (oldest->id) glDeleteTextures(1, &oldest->id);
    oldest->id = paint ? make_tex(bw, bh, GL_RGBA, GL_RGBA, pcol, true) : make_tex(bw, bh, A_IFMT, A_FMT, pcov, true);
    oldest->key = key; oldest->rgba = paint; t = oldest;
    glBindTexture(GL_TEXTURE_2D, cur_tex);
  }
  t->used = ++ptick;
  use_tex(t->id);
  Q q = {};
  q.x0 = (float)b.x0; q.y0 = (float)b.y0; q.x1 = (float)b.x1; q.y1 = (float)b.y1; q.u0 = 0; q.v0 = 0; q.u1 = 1; q.v1 = 1;
  if (t->rgba) { q.mode = IMAGE_RGBA; q.c1 = 0xffffff; q.alpha = 255; } else { q.mode = TEXT_M; q.c1 = c.c1; q.alpha = c.alpha; }
  quad(q);
}

// RECT grad 5 (ZN-261): a box with a gradient paint record, computed by the shader from the POLY paint's uniforms (up to 8 stops; more:
// a CPU tile, draw_poly). b: the box's pixels; under a matrix (XFORM) the quad's corners and the paint are in the box's own coordinates.
static void draw_paint_rect(const Cmd& c, const float* g, const Rect& b) {
  if (!(g[7] >= 1)) return;
  if (g[7] > 8 && !xf_on) { draw_poly(c, g); return; }
  flush();
  set_paint(g, FILL);
  Q q = box_q(c, b, FILL);
  q.grad = 5;
  quad(q);
  flush();
  end_paint();
}

// XFORM (ZN-263.01): the command in its own coordinates (raster.cpp draw_xform has the payload), drawn by the paths of the untransformed
// commands with quad() taking the corners through the matrix. Boxes take one more pixel around them for their edges; FILL instead of SOLID
// for a plain rectangle, whose edges are no longer on pixel boundaries; glyphs are sampled linearly while turned.
static void draw_xform(const Cmd& c, const float* p, const char* text, const float* pool) {
  Cmd in = c;
  in.kind = (uint8_t)p[0]; in.x = p[7]; in.y = p[8]; in.w = p[9]; in.h = p[10]; in.r = p[11]; in.s = p[12];
  memcpy(&in.off, p + 13, 4); memcpy(&in.n, p + 14, 4);
  if (!(fabsf(p[1] * p[4] - p[2] * p[3]) > 1e-9f) || !(in.w >= 0 && in.h >= 0 && in.w < 1e7f && in.h < 1e7f)) return;
  for (int i = 0; i < 6; i++) xf_m[i] = p[1 + i];
  xf_on = true;
  switch (in.kind) {
    case RECT: {
      const Rect b = bounds(in.x - 1, in.y - 1, in.w + 2, in.h + 2, HUGE_R);
      if (in.grad == 5) { if (pool) draw_paint_rect(in, pool + in.off, b); break; }
      Q q = box_q(in, b, FILL); q.grad = in.grad; quad(q); break;
    }
    case BORDER: { Q q = box_q(in, bounds(in.x - 1, in.y - 1, in.w + 2, in.h + 2, HUGE_R), BORDER_M); q.p1 = in.s; quad(q); break; }
    case SHADOW: {
      const float blur = in.s > 0.5f ? in.s : 0.5f;
      Q q = box_q(in, bounds(in.x - blur - 1, in.y - blur - 1, in.w + 2 * blur + 2, in.h + 2 * blur + 2, HUGE_R), SHADOW_M);
      q.p1 = blur; quad(q); break;
    }
    case IMAGE: if (!(in.pad & kImageTint)) in.r = 0; draw_image(in); break;   // ponytail: no rounded corners on a turned image (r: or a tint)
    case TEXT:
      flush();
      glBindTexture(GL_TEXTURE_2D, atlas);
      glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR); glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
      glBindTexture(GL_TEXTURE_2D, cur_tex);
      draw_text(in, text + in.off);
      flush();
      glBindTexture(GL_TEXTURE_2D, atlas);
      glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_NEAREST); glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_NEAREST);
      glBindTexture(GL_TEXTURE_2D, cur_tex);
      break;
    default: break;
  }
  xf_on = false;
}

// b minus in as four non-overlapping quads (top, bottom, left, right), drawn with `mode` and the box of c
static void bands(const Cmd& c, const Rect& b, const Rect& in, int mode, float p1, int grad = 0) {
  const Rect r[4] = {{b.x0, b.y0, b.x1, in.y0}, {b.x0, in.y1, b.x1, b.y1}, {b.x0, in.y0, in.x0, in.y1}, {in.x1, in.y0, b.x1, in.y1}};
  for (const Rect& k : r) {
    if (k.x0 >= k.x1 || k.y0 >= k.y1) continue;
    Q q = box_q(c, k, mode);
    q.p1 = p1; q.grad = grad;
    quad(q);
  }
}
static void solid_and_bands(const Cmd& c, const Rect& b, const Rect& in, int mode, float p1) {
  Q q = box_q(c, in, SOLID);
  quad(q);
  bands(c, b, in, mode, p1);
}

// ---- one command list
// depth of command i of n in NDC: the first is farthest, the last nearest
static inline float depth_of(uint32_t i, uint32_t n) { return 1.0f - 2.0f * (float)(i + 1) / (float)(n + 1); }
// The occlusion pass: the opaque square RECTs and CLEARs outside any clip, from the last to the first with depth writes, so a pixel under
// them is shaded once and every later draw behind them fails the depth test early (the GPU side of the raster's tiles, ZN-410).
struct SV4 { float x, y; uint8_t c[4]; float z; };   // a corner (GLES 2: no instancing)
static SV4* sq; static size_t sq_cap;
static void sflush() {
  if (!ns) return;
  glUseProgram(sprog);
  glUniform2f(s_res, (float)W, (float)H);
  glUniform1f(s_flip, flipy ? -1.f : 1.f);
  glBindBuffer(GL_ARRAY_BUFFER, svbo);
  apply_clip();
  if (instanced) {
#if GLR_CORE
    glBufferData(GL_ARRAY_BUFFER, (GLsizeiptr)ns * sizeof(SV), sverts, GL_STREAM_DRAW);
    const GLint at[3] = {s_rect, s_col, s_z};
    glEnableVertexAttribArray(s_rect); glVertexAttribPointer(s_rect, 4, GL_FLOAT, GL_FALSE, sizeof(SV), (void*)0);
    glEnableVertexAttribArray(s_col); glVertexAttribPointer(s_col, 4, GL_UNSIGNED_BYTE, GL_TRUE, sizeof(SV), (void*)16);
    glEnableVertexAttribArray(s_z); glVertexAttribPointer(s_z, 1, GL_FLOAT, GL_FALSE, sizeof(SV), (void*)20);
    for (GLint a : at) glVertexAttribDivisor((GLuint)a, 1);
    glDrawArraysInstanced(GL_TRIANGLE_STRIP, 0, 4, ns);
    for (GLint a : at) { glVertexAttribDivisor((GLuint)a, 0); glDisableVertexAttribArray((GLuint)a); }
#endif
  } else {
    glBufferData(GL_ARRAY_BUFFER, (GLsizeiptr)ns * 4 * sizeof(SV4), sq, GL_STREAM_DRAW);
    glEnableVertexAttribArray(s_pos); glVertexAttribPointer(s_pos, 2, GL_FLOAT, GL_FALSE, sizeof(SV4), (void*)0);
    glEnableVertexAttribArray(s_col); glVertexAttribPointer(s_col, 4, GL_UNSIGNED_BYTE, GL_TRUE, sizeof(SV4), (void*)8);
    glEnableVertexAttribArray(s_z); glVertexAttribPointer(s_z, 1, GL_FLOAT, GL_FALSE, sizeof(SV4), (void*)12);
    glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, ibo);
    glDrawElements(GL_TRIANGLES, ns * 6, GL_UNSIGNED_SHORT, nullptr);
    glDisableVertexAttribArray(s_pos); glDisableVertexAttribArray(s_col); glDisableVertexAttribArray(s_z);
  }
  st.draws++; st.quads += (uint32_t)ns;
  ns = 0;
  cur_prog = nullptr;
}
static void solid(const Rect& b, uint32_t c) {
  if (instanced) {
    if (!grow(sverts, sverts_cap, (size_t)ns + 1)) return;
    SV& v = sverts[ns++];
    v = SV{(float)b.x0, (float)b.y0, (float)b.x1, (float)b.y1, {0, 0, 0, 255}, cur_z};
    setc(v.c, c, 255);
    return;
  }
  if (ns == MAXQ) sflush();
  if (!grow(sq, sq_cap, (size_t)(ns + 1) * 4)) return;
  SV4* v = sq + (size_t)ns++ * 4;
  const float xs[4] = {(float)b.x0, (float)b.x1, (float)b.x1, (float)b.x0}, ys[4] = {(float)b.y0, (float)b.y0, (float)b.y1, (float)b.y1};
  for (int k = 0; k < 4; k++) { v[k] = SV4{xs[k], ys[k], {0, 0, 0, 255}, cur_z}; setc(v[k].c, c, 255); }
}
// The occlusion pass: the opaque square RECTs and CLEARs outside any clip, from the last to the first with depth writes, so a pixel under
// them is shaded once and every later draw behind them fails the depth test early (the GPU side of the raster's tiles, ZN-410).
static void occlusion_pass(const Frame& f) {
  if (culled) {   // cull_list gave the visible commands front to back and flagged the opaque ones outside clips
    flush();
    glDepthMask(GL_TRUE);
    glDisable(GL_BLEND);
    clip = base;
    for (uint32_t k = 0; k < nvis; k++) {
      if (!(vis[k] & kCullOpaque)) continue;
      const uint32_t i = vis[k] & ~kCullOpaque;
      const Cmd& c = f.cmds[i];
      cur_z = depth_of(i, f.count);
      Rect b = isect(c.kind == CLEAR ? base : bounds(c.x, c.y, c.w, c.h, HUGE_R), base);
      if (b.x0 < b.x1 && b.y0 < b.y1) solid(b, c.c1);
    }
    sflush();
    glEnable(GL_BLEND);
    glDepthMask(GL_FALSE);
    return;
  }
  if (!grow(drawn, drawn_cap, (size_t)f.count + 1)) { occl = false; return; }
  int depth = 0;
  for (uint32_t i = 0; i < f.count; i++) {
    const Cmd& c = f.cmds[i];
    drawn[i] = 0;
    if (c.kind == CLIP) { if (depth < 16) depth++; else { occl = false; return; } }   // past 16, run() ignores the CLIP and pops a parent: no occlusion then
    else if (c.kind == UNCLIP) { if (depth > 0) depth--; }
    else if (depth == 0 && (c.kind == CLEAR || (c.kind == RECT && c.r <= 0 && !c.grad && c.alpha == 255))) drawn[i] = 1;
  }
  flush();
  glDepthMask(GL_TRUE);
  glDisable(GL_BLEND);
  clip = base;
  for (uint32_t i = f.count; i-- > 0;) {
    if (!drawn[i]) continue;
    const Cmd& c = f.cmds[i];
    cur_z = depth_of(i, f.count);
    Rect b = isect(c.kind == CLEAR ? base : bounds(c.x, c.y, c.w, c.h, HUGE_R), base);
    if (b.x0 < b.x1 && b.y0 < b.y1) solid(b, c.c1);
  }
  sflush();
  glEnable(GL_BLEND);
  glDepthMask(GL_FALSE);
}
// Culling hides what a later opaque square RECT covers: a frame without one (sprites over a clear) skips it. 20,000 sprites: 1 ms of
// CPU a frame for nothing, the threads included (ZN-581). ponytail: a CLEAR after other commands is not counted.
static bool any_occluder(const Frame& f) {
  for (uint32_t i = 0; i < f.count; i++) { const Cmd& c = f.cmds[i]; if (c.kind == RECT && c.r <= 0 && !c.grad && c.alpha == 255) return true; }
  return false;
}
// The occlusion pass pays for itself where opaque rectangles pile up: it writes and then stores a depth buffer (a tiling GPU stores it to memory
// every frame) and draws the rectangles twice. 300 small rectangles that hardly touch each other (a moving square over a static decoration)
// run 24 fps with it and 30 without on a Pi 3 at 1080p; eight full-screen panels run 40 fps with it and 15 without. So the pass starts when
// the opaque square RECTs, summed (each one at most the surface), cover at least half the surface (ZINC_GL_OCCLUDE_RATIO, default 0.5).
static float opaque_ratio(const Cmd* cmds, uint32_t count) {
  double area = 0;
  const double full = (double)W * H;
  for (uint32_t i = 0; i < count; i++) {
    const Cmd& c = cmds[i];
    if (c.kind == RECT && c.r <= 0 && !c.grad && c.alpha == 255) { const double a = (double)c.w * c.h; area += a < full ? a : full; if (area >= full) break; }
  }
  return (float)(area / full);
}
// ---- SHADER (ZN-746): a box filled by a program's own fragment shader (gfx::shaderProgram), compiled at its first use behind the varyings and
// uniforms every such program reads, and drawn alone in paint order. The includer gives the sources (shader_source); without it SHADER draws
// nothing. Also used outside a replay: the Android window's GPU layer under a software frame (hal_sdl.cpp).
static const char* (*shader_source)(int32_t id) = nullptr;
static const char* const SH_HEAD = "varying vec2 v_uv; uniform vec2 u_size; uniform vec4 u_p[8];\n";
static const char* const SH_VS = "attribute vec4 a_pos; uniform vec4 u_rect; uniform vec2 u_res; uniform float u_flip; uniform float u_zz;\n"
  "void main() { v_uv = a_pos.xy; vec2 p = u_rect.xy + a_pos.xy * u_rect.zw;\n"
  "  gl_Position = vec4(p.x / u_res.x * 2.0 - 1.0, (p.y / u_res.y * 2.0 - 1.0) * u_flip, u_zz, 1.0); }\n";
struct ShProg { GLuint id; GLint u_rect, u_res, u_flip, u_zz, u_size, u_p; bool tried; };
static ShProg sh_progs[64];   // ponytail: the first 64 programs of a run are drawn; more would need a table that grows
static GLuint sh_vbo;
/** Draws one SHADER command over a target of w x h pixels (flip: the window's rows bottom-up) at depth z; the caller's program, buffer and
 *  attributes are left changed. */
static void shader_quad(const Cmd& c, const float* u, int32_t w, int32_t h, bool flip, float z) {
  if (c.res < 0 || c.res >= 64 || !shader_source) return;
  ShProg& p = sh_progs[c.res];
  if (!p.tried) {
    p.tried = true;
    const char* src = shader_source(c.res);
    p.id = src ? zgl_program(SH_HEAD, SH_VS, src) : 0;
    if (!p.id) { fprintf(stderr, "zinc: shader program %d does not compile: its boxes are not drawn\n", c.res); return; }
    p.u_rect = glGetUniformLocation(p.id, "u_rect"); p.u_res = glGetUniformLocation(p.id, "u_res"); p.u_flip = glGetUniformLocation(p.id, "u_flip");
    p.u_zz = glGetUniformLocation(p.id, "u_zz"); p.u_size = glGetUniformLocation(p.id, "u_size"); p.u_p = glGetUniformLocation(p.id, "u_p");
  }
  if (!p.id) return;
  if (!sh_vbo) {
    static const float q[] = {0, 0, 1, 0, 0, 1, 1, 1};
    glGenBuffers(1, &sh_vbo);
    glBindBuffer(GL_ARRAY_BUFFER, sh_vbo);
    glBufferData(GL_ARRAY_BUFFER, sizeof q, q, GL_STATIC_DRAW);
  }
  float up[32] = {0};
  for (uint32_t i = 0; i < c.n && i < 32; i++) up[i] = u[i];
  glUseProgram(p.id);
  glUniform4f(p.u_rect, c.x, c.y, c.w, c.h); glUniform2f(p.u_res, (float)w, (float)h); glUniform1f(p.u_flip, flip ? -1.f : 1.f);
  glUniform1f(p.u_zz, z); glUniform2f(p.u_size, c.w, c.h); glUniform4fv(p.u_p, 8, up);
  glBindBuffer(GL_ARRAY_BUFFER, sh_vbo);
  for (GLuint i = 1; i < 7; i++) glDisableVertexAttribArray(i);
  glEnableVertexAttribArray(0);
  glVertexAttribPointer(0, 2, GL_FLOAT, GL_FALSE, 0, nullptr);
  glDrawArrays(GL_TRIANGLE_STRIP, 0, 4);
}

// ---- a scroll (HalFrame.move, ZN-744): the content of a scroll view moved by whole pixels; the pixels the surface texture already has move
// on the GPU, and the includer replays only the rectangles left (frame_rects): the rows that came into view, what changed, what is drawn
// over the area. The area is copied into a scratch texture, then drawn back shifted: two passes over the area, no command replayed, where
// Tegra 3 takes 90 to 130 ms to replay a whole rn-showcase frame. A layer of the whole content (taller than the view, in tiles) would also
// keep what scrolls back into view; the move needs no tiles and no content recorded apart, and diff_move already says what it carries wrongly.
static const char* const MVS = "attribute vec4 a_pos; uniform vec2 u_res; varying vec2 v_uv;\n"
  "void main() { v_uv = a_pos.zw; gl_Position = vec4(a_pos.x / u_res.x * 2.0 - 1.0, a_pos.y / u_res.y * 2.0 - 1.0, 0.0, 1.0); }\n";
static const char* const MFS = "varying vec2 v_uv; uniform sampler2D u_tex; void main() { gl_FragColor = texture2D(u_tex, v_uv); }\n";
static GLuint mprog, mtex, mvbo;
static GLint m_res, m_tex;
static int32_t mtw, mth;
static struct { uint32_t moves; double px; } mst;
static bool blit_ready() {
  if (mprog) return true;
  if (!(mprog = zgl_program("", MVS, MFS))) return false;
  m_res = glGetUniformLocation(mprog, "u_res"); m_tex = glGetUniformLocation(mprog, "u_tex");
  glGenBuffers(1, &mvbo);
  return true;
}
/** The texels `src` of texture `tex` (tw x th allocated) copied as they are to (x, y) of framebuffer `target` (sw x sh pixels): no blend,
 *  nearest texels. Rows count from the top in both, as the replay's surface texture and the uploads of rows do. */
static void blit_on(GLuint target, int32_t sw, int32_t sh, GLuint tex, int32_t tw, int32_t th, Rect src, int32_t x, int32_t y) {
  if (!blit_ready()) return;
  glBindFramebuffer(GL_FRAMEBUFFER, target);
  glDisable(GL_SCISSOR_TEST); glDisable(GL_BLEND); glDisable(GL_DEPTH_TEST);
  glViewport(0, 0, sw, sh);
  glActiveTexture(GL_TEXTURE0);
  glBindTexture(GL_TEXTURE_2D, tex);
  glUseProgram(mprog);
  cur_prog = nullptr;
  glUniform2f(m_res, (float)sw, (float)sh); glUniform1i(m_tex, 0);
  const float x0 = (float)x, y0 = (float)y, x1 = x0 + (float)(src.x1 - src.x0), y1 = y0 + (float)(src.y1 - src.y0);
  const float u0 = (float)src.x0 / (float)tw, v0 = (float)src.y0 / (float)th, u1 = (float)src.x1 / (float)tw, v1 = (float)src.y1 / (float)th;
  const float q[16] = {x0, y0, u0, v0, x1, y0, u1, v0, x0, y1, u0, v1, x1, y1, u1, v1};
  glBindBuffer(GL_ARRAY_BUFFER, mvbo);
  glBufferData(GL_ARRAY_BUFFER, sizeof q, q, GL_STREAM_DRAW);
  for (GLuint i = 1; i < 7; i++) glDisableVertexAttribArray(i);
  glEnableVertexAttribArray(0);
  glVertexAttribPointer(0, 4, GL_FLOAT, GL_FALSE, 16, nullptr);
  glDrawArrays(GL_TRIANGLE_STRIP, 0, 4);
  glDisableVertexAttribArray(0);
}
/** Moves the pixels of `area` in the texture of framebuffer `target` (sw x sh pixels used, tw x th allocated) by (dx, dy), as
 *  raster::move_pixels does in memory: a pixel at p goes to p + (dx, dy), what would come from outside the area stays. False: the GL objects
 *  could not be made (the includer draws the whole damage instead). */
static bool move_on(GLuint target, int32_t sw, int32_t sh, int32_t tw, int32_t th, Rect area, int32_t dx, int32_t dy) {
  area = isect(area, Rect{0, 0, sw, sh});
  const Rect src = isect(area, Rect{area.x0 - dx, area.y0 - dy, area.x1 - dx, area.y1 - dy});
  if (src.x0 >= src.x1 || src.y0 >= src.y1) return true;   // nothing that was in view stays in view
  if (!blit_ready()) return false;
  if (mtw < tw || mth < th) {   // the target's allocation: any area fits
    if (mtex) glDeleteTextures(1, &mtex);
    mtw = mtw > tw ? mtw : tw; mth = mth > th ? mth : th;
    mtex = make_tex(mtw, mth, GL_RGBA, GL_RGBA, nullptr, true);
  }
  const int32_t w = src.x1 - src.x0, h = src.y1 - src.y0;
  glBindFramebuffer(GL_FRAMEBUFFER, target);   // its rows are the surface's from the top: y is the same in both
  glDisable(GL_SCISSOR_TEST); glDisable(GL_BLEND); glDisable(GL_DEPTH_TEST);
  glActiveTexture(GL_TEXTURE0);
  glBindTexture(GL_TEXTURE_2D, mtex);
  glCopyTexSubImage2D(GL_TEXTURE_2D, 0, 0, 0, src.x0, src.y0, w, h);
  blit_on(target, sw, sh, mtex, mtw, mth, Rect{0, 0, w, h}, src.x0 + dx, src.y0 + dy);
  mst.moves++; mst.px += (double)w * h;
  return true;   // the target stays bound: the rectangles are drawn into it next
}
/** move_on() over the replay's own surface texture. */
static bool move(Rect area, int32_t dx, int32_t dy) { return move_on(fbo, W, H, TW, TH, area, dx, dy); }
static void frame_in(const HalFrame* f, bool direct, Rect box, int32_t ty = 0);
/** The rows of the rotated scroll area back in place (a copy through the scratch texture and two blits): before a plain picture is needed
 *  (another area scrolls, a horizontal scroll, a check, a window that is not the surface). */
static void unrotate() {
  if (!ring_off) return;
  const int32_t h = ring.y1 - ring.y0, w = ring.x1 - ring.x0, off = ring_off;
  ring_off = 0;
  if (!blit_ready()) return;
  if (mtw < TW || mth < TH) {
    if (mtex) glDeleteTextures(1, &mtex);
    mtw = mtw > TW ? mtw : TW; mth = mth > TH ? mth : TH;
    mtex = make_tex(mtw, mth, GL_RGBA, GL_RGBA, nullptr, true);
  }
  glBindFramebuffer(GL_FRAMEBUFFER, fbo);
  glActiveTexture(GL_TEXTURE0);
  glBindTexture(GL_TEXTURE_2D, mtex);
  glCopyTexSubImage2D(GL_TEXTURE_2D, 0, 0, 0, ring.x0, ring.y0, w, h);
  blit_on(fbo, W, H, mtex, mtw, mth, Rect{0, off, w, h}, ring.x0, ring.y0);   // the rows of y0.. are off rows down
  blit_on(fbo, W, H, mtex, mtw, mth, Rect{0, 0, w, off}, ring.x0, ring.y1 - off);
}
/** A scroll of `area` by (dx, dy) whole pixels: a vertical one only turns the area's rows in the surface texture (no pixel moves; the window
 *  picture is drawn from the turned rows, present_pieces()), anything else moves the pixels (move()). The rows that came into view and the
 *  rest are replayed next (frame_rects). On Tegra 3 the move cost 3.7 to 5 ms of GPU a frame, two passes over the area. */
static bool scroll(Rect area, int32_t dx, int32_t dy) {
  area = isect(area, Rect{0, 0, W, H});
  static const bool on = !getenv("ZINC_GL_RING") || atoi(getenv("ZINC_GL_RING")) != 0;
  if (!on || dx || area.y1 - area.y0 < 2 || (ring_off && memcmp(&area, &ring, sizeof area))) { unrotate(); return move(area, dx, dy); }
  const int32_t h = area.y1 - area.y0;
  ring = area;
  ring_off = ((ring_off - dy) % h + h) % h;
  mst.moves++; mst.px += (double)(area.x1 - area.x0) * h;
  return true;
}
/** Replays `b` of the surface: its parts outside the rotated area as they are, its part inside in at most two pieces shifted to where those
 *  rows are kept. */
static void frame_box(const HalFrame* f, Rect b) {
  b = isect(b, Rect{0, 0, W, H});
  if (b.x0 >= b.x1 || b.y0 >= b.y1) return;
  const Rect in = isect(b, ring);
  if (!ring_off || in.x0 >= in.x1 || in.y0 >= in.y1) { frame_in(f, false, b); return; }
  frame_in(f, false, Rect{b.x0, b.y0, b.x1, in.y0});   // above, below, left, right of the area (empty ones return at once)
  frame_in(f, false, Rect{b.x0, in.y1, b.x1, b.y1});
  frame_in(f, false, Rect{b.x0, in.y0, in.x0, in.y1});
  frame_in(f, false, Rect{in.x1, in.y0, b.x1, in.y1});
  const int32_t h = ring.y1 - ring.y0, wrap = ring.y1 - ring_off;   // rows above `wrap` are kept ring_off rows lower, the others h - ring_off higher
  frame_in(f, false, Rect{in.x0, in.y0, in.x1, in.y1 < wrap ? in.y1 : wrap}, ring_off);
  frame_in(f, false, Rect{in.x0, in.y0 > wrap ? in.y0 : wrap, in.x1, in.y1}, ring_off - h);
}
/** ZINC_GL_VERIFY (ZN-744): the surface texture as a partial replay left it, against a full replay of the same frame, which it keeps: the
 *  number of pixels that differ (0: the move and the rectangles drew what a whole replay draws); `box` gets their bounds. */
static uint64_t verify(const HalFrame* f, Rect* box) {
  static uint32_t *a, *b;
  static size_t cap;
  const size_t n = (size_t)W * H;
  if (cap < n) { free(a); free(b); a = (uint32_t*)malloc(n * 4); b = (uint32_t*)malloc(n * 4); cap = a && b ? n : 0; }
  if (!cap) return 0;
  unrotate();
  glBindFramebuffer(GL_FRAMEBUFFER, fbo);
  glPixelStorei(GL_PACK_ALIGNMENT, 4);
  glReadPixels(0, 0, W, H, GL_RGBA, GL_UNSIGNED_BYTE, a);
  frame_in(f, false, Rect{0, 0, W, H});
  glBindFramebuffer(GL_FRAMEBUFFER, fbo);
  glReadPixels(0, 0, W, H, GL_RGBA, GL_UNSIGNED_BYTE, b);
  glBindFramebuffer(GL_FRAMEBUFFER, 0);
  uint64_t d = 0;
  *box = Rect{W, H, 0, 0};
  for (size_t i = 0; i < n; i++) {
    if (a[i] == b[i]) continue;
    if (d++ < 3 && getenv("ZINC_GL_VERIFY_PX")) {
      const float px = (float)(i % (size_t)W) + 0.5f, py = (float)(i / (size_t)W) + 0.5f;
      fprintf(stderr, "zinc gl verify: pixel %d,%d moved %08x replayed %08x, under:", (int)px, (int)py, a[i], b[i]);
      const HalCmdList* lists[8];
      const int32_t nl = f->frames ? f->frames(lists, 8) : 0;
      for (int32_t l = 0; l < nl; l++)
        for (uint32_t k = 0; k < lists[l]->count; k++) {
          const Cmd& c = ((const Cmd*)lists[l]->cmds)[k];
          if (c.kind != CLIP && c.kind != UNCLIP && px >= c.x - 2 && px <= c.x + c.w + 2 && py >= c.y - 2 && py <= c.y + c.h + 2)
            fprintf(stderr, " [%u kind %d %.2f,%.2f %.2fx%.2f r %.2f s %.2f grad %d pad %d]", k, c.kind, c.x, c.y, c.w, c.h, c.r, c.s, c.grad, c.pad);
        }
      fprintf(stderr, "\n");
    }
    const int32_t x = (int32_t)(i % (size_t)W), y = (int32_t)(i / (size_t)W);
    if (x < box->x0) box->x0 = x; if (y < box->y0) box->y0 = y; if (x >= box->x1) box->x1 = x + 1; if (y >= box->y1) box->y1 = y + 1;
  }
  return d;
}

static void run(const Frame& f, bool first) {
  sp = 0; nrc = 0; clip_gen++;
  clip = base;
  const uint32_t nw = walk_count(f, first);
  for (uint32_t k = 0; k < nw; k++) {
    const uint32_t e = walk_entry(k, first), i = e & ~kCullOpaque;
    const Cmd& c = f.cmds[i];
    if (outside(c)) continue;
    if (occl && first) { if (culled ? (e & kCullOpaque) != 0 : drawn[i] != 0) continue; cur_z = depth_of(i, f.count); }
    use_blend(c.kind == IMAGE || (c.kind == XFORM && f.pts && f.pts[c.off] == (float)IMAGE) ? image_blend(c) : BLEND_NORMAL);
    switch (c.kind) {
      case CLEAR:
        if (occl && first) {   // inside a clip: a quad at its depth (glClear would ignore the depth test)
          Q q = box_q(c, clip, SOLID);
          q.alpha = 255;
          quad(q);
          break;
        }
        flush();
        apply_clip();
        GLR_TRACE("clear by a CLEAR command, %d quads drawn so far\n", st.quads - trace_q0);
        glClearColor(((c.c1 >> 16) & 255) / 255.f, ((c.c1 >> 8) & 255) / 255.f, (c.c1 & 255) / 255.f, 1.f);
        glClear(GL_COLOR_BUFFER_BIT);
        break;
      case RECT: {
        bool plain = c.r <= 0 && !c.grad && c.alpha == 255;
        Rect b = bounds(c.x, c.y, c.w, c.h, HUGE_R);
        if (b.x0 >= b.x1 || b.y0 >= b.y1) break;
        if (!plain && !c.grad && split) {   // the interior needs no coverage maths: a solid quad, and the rim as four bands
          float r = clampf(c.r, 0, c.w < c.h ? c.w * 0.5f : c.h * 0.5f);
          Rect in = isect(Rect{iceil(c.x + r), iceil(c.y + r), ifloor(c.x + c.w - r), ifloor(c.y + c.h - r)}, b);
          if (in.x0 < in.x1 && in.y0 < in.y1) { solid_and_bands(c, b, in, FILL, 0); break; }
        }
        if (c.grad >= 1 && c.grad <= 2 && split && !paint_on) {   // a linear gradient: the interior is covered whole (no distance), only the rim needs the coverage maths
          const float r = clampf(c.r, 0, c.w < c.h ? c.w * 0.5f : c.h * 0.5f);
          const Rect in = isect(Rect{iceil(c.x + r), iceil(c.y + r), ifloor(c.x + c.w - r), ifloor(c.y + c.h - r)}, b);
          if (in.x1 - in.x0 >= 16 && in.y1 - in.y0 >= 16) {   // a small box costs more in quads than it saves
            Q q = box_q(c, in, FILL); q.grad = c.grad; q.full = true; quad(q);
            bands(c, b, in, FILL, 0, c.grad);
            break;
          }
        }
        if (c.grad == 5) { draw_paint_rect(c, f.pts + c.off, b); break; }
        Q q = box_q(c, b, plain ? SOLID : FILL);
        q.grad = c.grad;
        quad(q);
        break;
      }
      case BORDER: {
        Rect b = bounds(c.x, c.y, c.w, c.h, HUGE_R);
        if (b.x0 >= b.x1 || b.y0 >= b.y1) break;
        if (split) {   // only the rim of the box can be covered: four bands, no quad over the interior
          float r = clampf(c.r, 0, c.w < c.h ? c.w * 0.5f : c.h * 0.5f);
          int32_t k = iceil(r > c.s ? r : c.s) + 1;
          Rect in = {b.x0 + k, b.y0 + k, b.x1 - k, b.y1 - k};
          if (in.x0 < in.x1 && in.y0 < in.y1) { bands(c, b, in, BORDER_M, c.s); break; }
        }
        Q q = box_q(c, b, BORDER_M);
        q.p1 = c.s;
        quad(q);
        break;
      }
      case SHADOW: {
        float blur = c.s > 0.5f ? c.s : 0.5f;
        Rect b = bounds(c.x - blur, c.y - blur, c.w + 2 * blur, c.h + 2 * blur, HUGE_R);
        if (b.x0 >= b.x1 || b.y0 >= b.y1) break;
        if (split) {   // the box shrunk by blur / 2 is fully shadowed: solid inside, the falloff only in four bands around it
          float r = clampf(c.r, 0, c.w < c.h ? c.w * 0.5f : c.h * 0.5f), q = r > blur * 0.5f ? r : blur * 0.5f;
          Rect in = isect(Rect{iceil(c.x + q), iceil(c.y + q), ifloor(c.x + c.w - q), ifloor(c.y + c.h - q)}, b);
          if (in.x0 < in.x1 && in.y0 < in.y1) { solid_and_bands(c, b, in, SHADOW_M, blur); break; }
        }
        Q q = box_q(c, b, SHADOW_M);
        q.p1 = blur;
        quad(q);
        break;
      }
      case TEXT: draw_text(c, f.text + c.off); break;
      case IMAGE: draw_image(c); break;
      case LINE: case POLY: {
        if (strips ? convex_strips(c, f.pts + c.off) : stencil_ok && draw_convex(c, f.pts + c.off)) break;
        if (!poly_add(c, f.pts + c.off)) { draw_poly(c, f.pts + c.off); break; }
        while (k + 1 < nw) {   // the next POLYs join the batch while their boxes stay apart from it
          const uint32_t e2 = walk_entry(k + 1, first), i2 = e2 & ~kCullOpaque;
          const Cmd& c2 = f.cmds[i2];
          if (c2.kind != LINE && c2.kind != POLY) break;
          if (convex_ok(c2, f.pts + c2.off)) break;   // drawn in one pass of its own
          if (occl && first) cur_z = depth_of(i2, f.count);
          if (!poly_add(c2, f.pts + c2.off)) break;
          k++;
        }
        poly_flush();
        break;
      }
      case STROKE: if (strips && c.alpha == 255) stroke_strips(c, f.pts + c.off); else draw_stroke(c, f.pts + c.off); break;
      case XFORM: draw_xform(c, f.pts + c.off, f.text, f.pts); break;
      case SHADER:
        flush();
        apply_clip();
        shader_quad(c, f.pts + c.off, W, H, flipy, cur_z);
        cur_prog = nullptr;   // the next run binds its program again
        st.draws++;
        break;
      case CLIP: {
        if (sp >= 16) break;
        flush();
        RC k = {c.x, c.y, c.w, c.h, c.r, 0, false};
        float hw2 = c.w / 2, hh2 = c.h / 2;
        k.R = c.r > 0 ? iceil(c.r < hw2 ? (c.r < hh2 ? c.r : hh2) : (hw2 < hh2 ? hw2 : hh2)) : 0;
        int32_t x0 = ifloor(k.x), y0 = ifloor(k.y), x1 = iceil(k.x + k.w), y1 = iceil(k.y + k.h);
        // ZINC_GL_CORNERS=0: every clip is square. The copies below read the framebuffer in the middle of a frame; a GPU that draws in tiles
        // (Adreno, Mali, VideoCore) then draws everything recorded so far and loads it back for what follows: a whole pass per rounded clip
        static const bool corners = !getenv("ZINC_GL_CORNERS") || atoi(getenv("ZINC_GL_CORNERS")) != 0;
        if (rclip_on && corners && c.r > 0 && nrc < 2) {   // no copy of the framebuffer: the shader clips the corners of what is drawn from here to the UNCLIP
          const float rr = c.r < hw2 ? (c.r < hh2 ? c.r : hh2) : (hw2 < hh2 ? hw2 : hh2);
          rcs[nrc++] = RClip{c.x + hw2, c.y + hh2, hw2, hh2, rr};
          k.an = true; clip_gen++;
        } else if (corners && k.R > 0 && k.R <= CORNER && x0 >= 0 && y0 >= 0 && x1 <= W && y1 <= H) {   // ponytail: larger radii or clips off screen stay square
          const int32_t cx[4] = {x0, x1 - k.R, x0, x1 - k.R}, cy[4] = {y0, y0, y1 - k.R, y1 - k.R};
          GLR_TRACE("corners of a rounded CLIP copied from the framebuffer, radius %d, %d quads drawn so far\n", k.R, st.quads - trace_q0);
          glBindFramebuffer(GL_FRAMEBUFFER, flipy ? 0 : fbo);
          glBindTexture(GL_TEXTURE_2D, corner_tex);
          for (int q = 0; q < 4; q++) glCopyTexSubImage2D(GL_TEXTURE_2D, 0, q * CORNER, sp * CORNER, cx[q], flipy ? H - cy[q] - k.R : cy[q] + ring_ty, k.R, k.R);   // flipped copy: the restore quad flips v back
          glBindTexture(GL_TEXTURE_2D, cur_tex);
          k.on = true;
        }
        rstack[sp] = k;
        cstack[sp++] = clip;
        clip = isect(clip, bounds(c.x, c.y, c.w, c.h, HUGE_R));
        break;
      }
      case UNCLIP: {
        if (sp <= 0) break;
        flush();
        const RC k = rstack[--sp];
        clip = cstack[sp];
        if (k.an) { nrc--; clip_gen++; }
        if (k.on) {
          float hw = k.w / 2, hh = k.h / 2;
          int32_t x0 = ifloor(k.x), y0 = ifloor(k.y), x1 = iceil(k.x + k.w), y1 = iceil(k.y + k.h);
          const int32_t cx[4] = {x0, x1 - k.R, x0, x1 - k.R}, cy[4] = {y0, y0, y1 - k.R, y1 - k.R};
          use_tex(corner_tex);
          for (int q = 0; q < 4; q++) {
            Q r = {};
            r.x0 = (float)cx[q]; r.y0 = (float)cy[q]; r.x1 = (float)(cx[q] + k.R); r.y1 = (float)(cy[q] + k.R);
            r.u0 = (float)(q * CORNER) / (CORNER * 4); r.u1 = (float)(q * CORNER + k.R) / (CORNER * 4);
            r.v0 = (float)(sp * CORNER + (flipy ? k.R : 0)) / (CORNER * LEVELS); r.v1 = (float)(sp * CORNER + (flipy ? 0 : k.R)) / (CORNER * LEVELS);
            r.bx = k.x + hw; r.by = k.y + hh; r.bw = hw; r.bh = hh; r.r = k.r;
            r.mode = RESTORE; r.alpha = 255;
            quad(r);
          }
          flush();
        }
        break;
      }
    }
  }
  flush();
  use_blend(BLEND_NORMAL);
}

/** Replays every list of the frame. `direct`: into the window framebuffer (rows bottom-up; its content is undefined after
 *  a swap, so the whole surface is drawn); else into the surface texture, the whole surface too unless ZINC_GL_DMG=1
 *  limits it to `dmg`. ponytail: off by default, that scissored replay is the prime suspect of GPU hangs seen on the
 *  Pi 3B+ (Kit / Forms: partial damage, "Resetting GPU"); see docs/plugins/display-gl.md. */
static bool dmg_default = false;   // the includer's choice when ZINC_GL_DMG is not set (the Android window, ZN-741)
/** Whether a replay into the surface texture is limited to the damage. When it is not, the texture keeps nothing the next frame needs, and drawing
 *  into it and then copying it to the window is a full-surface pass for nothing (3 GPU jobs a frame on a Pi 3, 33 ms at 1080p for a square that moves). */
static bool damage_limited() { return getenv("ZINC_GL_DMG") ? atoi(getenv("ZINC_GL_DMG")) != 0 : dmg_default; }
static void frame(const HalFrame* f, bool direct, Rect dmg) {
  static const bool dmg_on = getenv("ZINC_GL_DMG") ? atoi(getenv("ZINC_GL_DMG")) != 0 : dmg_default;
  if (direct) ring_off = 0;   // the window gets the whole frame: the texture is drawn again whole after it
  if (direct) frame_in(f, true, Rect{0, 0, W, H});
  else frame_box(f, !dmg_on ? Rect{0, 0, W, H} : dmg);
}
/** Replays the frame into the surface texture inside each of the `n` rectangles only: what a scroll leaves to draw once move() moved the
 *  pixels (HalFrame.move). A pass per rectangle (one pass over their union with the depth buffer as a mask was slower on Tegra 3: the GPU
 *  still shades every command's quad there before the test). */
static void frame_rects(const HalFrame* f, const HalRect* r, int32_t n) {
  static const int log = getenv("ZINC_GL_MOVE_LOG") ? atoi(getenv("ZINC_GL_MOVE_LOG")) : 0;   // 2: each pass's time, the GPU waited for
  for (int32_t i = 0; i < n; i++) {
    const double t0 = log > 1 ? now_us() : 0;
    frame_box(f, Rect{r[i].x0, r[i].y0, r[i].x1, r[i].y1});
    if (log > 1) { const double t1 = now_us(); glFinish(); fprintf(stderr, "zinc gl pass %dx%d: cpu %.2f gpu %.2f ms\n", r[i].x1 - r[i].x0, r[i].y1 - r[i].y0, (t1 - t0) / 1e3, (now_us() - t1) / 1e3); }
  }
}
/** The replay of the frame's lists into the window (`direct`) or the surface texture, inside `box` only, drawn `ty` rows lower in the texture
 *  (a piece of the rotated scroll area). */
static void frame_in(const HalFrame* f, bool direct, Rect box, int32_t ty) {
  base = isect(box, Rect{0, 0, W, H});
  if (base.x0 >= base.x1 || base.y0 >= base.y1) return;
  ring_ty = direct ? 0 : ty;
  double t0 = now_us();
  gpu_begin();
  const HalCmdList* lists[8];
  int32_t n = f->frames ? f->frames(lists, 8) : 0;
  flipy = direct;
  glBindFramebuffer(GL_FRAMEBUFFER, direct ? 0 : fbo);
  glViewport(0, direct ? 0 : ring_ty, W, H);   // a piece of a rotated scroll area is drawn shifted (scroll())
  memset(&applied, 0xff, sizeof applied);
  glEnable(GL_SCISSOR_TEST);
  clip = base;
  apply_clip();   // the clear stays inside the base rectangle
  // occlusion (ZN-412.01) when the framebuffer has a depth buffer that tells the commands apart (16 bits: up to 16k commands); ZINC_GL_OCCLUDE=0 turns it off
  static const float occl_ratio = getenv("ZINC_GL_OCCLUDE_RATIO") ? (float)atof(getenv("ZINC_GL_OCCLUDE_RATIO")) : 0.5f;
  static const bool occl_on = !getenv("ZINC_GL_OCCLUDE") || atoi(getenv("ZINC_GL_OCCLUDE")) != 0;
  // asked once per target (a query each pass made a driver validate the framebuffer: a scroll replays several rectangles a frame)
  GLint& bits = target_bits[direct][0];
  GLint& sbits = target_bits[direct][1];
  if (bits < 0) {
#if GLR_CORE
    glGetFramebufferAttachmentParameteriv(GL_FRAMEBUFFER, direct ? GL_DEPTH : GL_DEPTH_ATTACHMENT, GL_FRAMEBUFFER_ATTACHMENT_DEPTH_SIZE, &bits);
    glGetFramebufferAttachmentParameteriv(GL_FRAMEBUFFER, direct ? GL_STENCIL : GL_STENCIL_ATTACHMENT, GL_FRAMEBUFFER_ATTACHMENT_STENCIL_SIZE, &sbits);
#else
    glGetIntegerv(GL_DEPTH_BITS, &bits);
    glGetIntegerv(GL_STENCIL_BITS, &sbits);
#endif
  }
  static const bool gpu_poly = !getenv("ZINC_GL_POLY") || atoi(getenv("ZINC_GL_POLY")) != 0;   // 0: LINE/POLY on the CPU tiles, to compare
  stencil_ok = gpu_poly && sbits >= 8;
  const uint32_t first_n = n > 0 ? lists[0]->count : 0;
  // and only over most of the surface: for a small rectangle (a scroll's strip) the pass costs more than the overdraw it saves
  occl = occl_on && bits >= 16 && (first_n >= 2 && opaque_ratio((const Cmd*)lists[0]->cmds, lists[0]->count) >= occl_ratio) && (uint64_t)first_n * 4 < (1ull << (bits > 24 ? 24 : bits)) && (int64_t)(base.x1 - base.x0) * (base.y1 - base.y0) * 4 >= (int64_t)W * H;
  if (occl) st.occl_frames++;
  occl_bits = bits;
  glClearColor(0, 0, 0, 1);
#if GLR_CORE
  glClearDepth(1.0);
#else
  glClearDepthf(1.0f);
#endif
  glDepthMask(GL_TRUE);   // the occlusion pass leaves it off: a depth clear needs it on
  if (stencil_ok) { glStencilMask(0xFF); glClearStencil(0); }
  glClear(GL_COLOR_BUFFER_BIT | (occl ? GL_DEPTH_BUFFER_BIT : 0) | (stencil_ok ? GL_STENCIL_BUFFER_BIT : 0));
  cur_z = 0;
  trace_q0 = st.quads;
  GLR_TRACE("frame %u, %s\n", st.frames, direct ? "into the window" : "into the surface texture");
  pstamp++; cur_prog = nullptr;   // another user of the context may have bound its program since the last frame
  glActiveTexture(GL_TEXTURE0);
  cur_tex = white;
  glEnable(GL_BLEND); blend_gl = true;
  glBlendFunc(GL_ONE, GL_ONE_MINUS_SRC_ALPHA);   // premultiplied: the fragment shader writes the raster's blend (ZN-412.03)
  cur_blend = BLEND_NORMAL;
#if !GLR_CORE
  for (int32_t i = 0; i < n; i++) glyphs_ahead(Frame{(const Cmd*)lists[i]->cmds, lists[i]->count, lists[i]->text, lists[i]->pts});
  atlas_sync();
#endif
  for (int32_t i = 0; i < n; i++) {
    const Frame fr{(const Cmd*)lists[i]->cmds, lists[i]->count, lists[i]->text, lists[i]->pts};
    // a large first list: the commands that later opaque rectangles cover whole are not drawn at all (on a tiling GPU the primitives
    // cost, not the hidden pixels: 200k balls 4 ms of GPU, 17k of them visible)
    const double tc = now_us();
    static const bool cull_on = !getenv("ZINC_GL_CULL") || atoi(getenv("ZINC_GL_CULL")) != 0;
    culled = false;
    // tiles sized from the frame's opaque rectangles; one thread (bands of tile rows on 4 threads were slower: every band reads every command)
    // the packing reads every command (the memory-bound half): 4 threads; the walk over the packed array is serial
    if (cull_on && i == 0 && fr.count >= kTilesMin && any_occluder(fr) && grow(vis, vis_cap, (size_t)fr.count + 1) && grow(packed, packed_cap, (size_t)fr.count)) {
      const int32_t tile = cull_tile(fr);
      const uint32_t per = (fr.count + 3) / 4;
      std::thread workers[3];
      for (int t = 1; t < 4; t++) workers[t - 1] = std::thread([&fr, t, per, tile] { cull_pack(fr, t * per, (t + 1) * per, W, H, tile, packed); });
      cull_pack(fr, 0, per, W, H, tile, packed);
      for (std::thread& t : workers) t.join();
      nvis = cull_walk(fr, packed, W, H, tile, cull_scratch, vis);
      culled = nvis > 0;
    }
    if (i == 0) { st.cull_us += now_us() - tc; st.hidden += culled ? fr.count - nvis : 0; }
    if (i == 0 && occl) {
      glEnable(GL_DEPTH_TEST);
      glDepthFunc(GL_LESS);
      occlusion_pass(fr);
      if (!occl) { glDisable(GL_DEPTH_TEST); glDepthMask(GL_TRUE); }   // too deep in clips: painted in order
    }
    run(fr, i == 0);
    culled = false;
    if (i == 0 && occl) { glDisable(GL_DEPTH_TEST); occl = false; cur_z = 0; }   // the overlays (warnings, the profiler) go on top
  }
  glDisableVertexAttribArray(A_BOX); glDisableVertexAttribArray(A_PAR); glDisableVertexAttribArray(A_C1); glDisableVertexAttribArray(A_C2); glDisableVertexAttribArray(A_Z);
  glDisable(GL_SCISSOR_TEST);
  glBindFramebuffer(GL_FRAMEBUFFER, 0);
  ring_ty = 0;
  gpu_end();
  st.frames++;
  st.us += now_us() - t0;
}
static void idle() { st.idle++; }
// ZINC_PROFILE=json: what the GL renderer did, published just before the summary prints (runtime/gfx.cpp). gl_gpu_us is the GL_TIME_ELAPSED average where the GPU has the query (0: it has not).
static void gl_info_hook() {
  if (!zrt_prof_info || !st.frames) return;
  double n = st.frames;
  char b[40];
  auto put = [&](const char* k, double v, const char* f) { snprintf(b, sizeof b, f, v); zrt_prof_info(k, b); };
  put("gl_frames_replayed", st.frames, "%.0f"); put("gl_frames_idle", st.idle, "%.0f"); put("gl_draw_calls_per_frame", st.draws / n, "%.1f"); put("gl_quads_per_frame", st.quads / n, "%.0f");
  put("gl_cpu_submit_us", st.us / n, "%.0f"); put("gl_gpu_us", gpu_n ? gpu_us / gpu_n : 0.0, "%.0f"); zrt_prof_info("gl_timer_source", gpu_source); put("gl_gpu_samples", gpu_n, "%.0f"); put("gl_gpu_samples_lost", gpu_lost, "%.0f"); put("gl_programs_built", st.progs, "%.0f"); put("gl_program_build_ms", st.prog_us / 1e3, "%.1f");
  put("gl_occlusion_frames", st.occl_frames, "%.0f"); put("gl_depth_bits", occl_bits, "%.0f");
  put("gl_glyph_uploads", GLR_CORE ? st.glyphs : st.atlas_ups, "%.0f");
}
static void report() {
  if (!getenv("ZINC_GL_STATS")) return;
  double n = st.frames ? st.frames : 1;
  fprintf(stderr, "display-gl renderer gl: %u frames replayed, %u idle (no damage), %.1f draw calls and %.0f quads per frame, %u glyphs in the atlas, %u LINE/POLY skipped; %.0f us of CPU per replayed frame to submit it, %.0f us of it culling %.0f hidden commands; per frame %.1f LINE/POLY tiles rasterized on the CPU, %.1f strokes tessellated; %.0f us of GPU per frame; %u compressed textures uploaded as blocks (%llu bytes), %u decoded\n",
          st.frames, st.idle, st.draws / n, st.quads / n, st.glyphs, unsupported, st.us / n, st.cull_us / n, (double)st.hidden / n, st.ptiles / n, zrt::raster::strokes_built / n, gpu_n ? gpu_us / gpu_n : 0.0,
          st.blocks, (unsigned long long)st.block_bytes, st.decoded);
  fprintf(stderr, "display-gl renderer gl: %u command programs, %.0f ms to build them and the two of the occlusion and stencil passes; %u uploads of new glyphs, %.0f ms\n", st.progs, st.prog_us / 1e3, GLR_CORE ? st.glyphs : st.atlas_ups, st.glyph_us / 1e3);
  if (mst.moves) fprintf(stderr, "display-gl renderer gl: %u scrolls moved on the GPU, %.0f pixels each\n", mst.moves, mst.px / mst.moves);
  fprintf(stderr, "display-gl renderer gl: the fringe quads of POLY cover %.0f pixels per frame in each of their passes (the surface has %d)\n", fringe_px / n, W * H);
}
}  // namespace glr
