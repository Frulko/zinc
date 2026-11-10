// The GPU capability record of the GL replay (ZN-741, D119): what a GL or GLES context offers, read once per context from its strings and
// limits, and the tuning table for what those do not say (a tiler or not, the lean programs), keyed by GPU family from the renderer
// string, the way ANGLE's feature flags and Chrome's GPU driver bug list key their workarounds. The replay (gl_replay.cpp) and its
// context providers (the SDL3 window on desktops and Android, display-gl's KMS/EGL and webOS SDL 1.2) read this record instead of probing
// the driver each on its own; ZINC_GL_INFO prints it. No GL call here: glr::probe() asks the driver and hands the answers to fill(), so
// the record is tested on fake strings (tests/native/gl_caps.cpp) and needs nothing of the runtime.
#pragma once
#include <stdio.h>
#include <stdint.h>
#include <string.h>

namespace glcaps {

enum Family { UNKNOWN, VC4, ADRENO2, ADRENO, TEGRA3, TEGRA, MALI_UTGARD, MALI, POWERVR, APPLE, INTEL, NVIDIA, AMD, SOFTWARE, FAMILIES };
static const char* const family_names[FAMILIES] = {"unknown", "VideoCore IV", "Adreno 2xx", "Adreno", "Tegra 3", "Tegra", "Mali Utgard", "Mali",
                                                   "PowerVR", "Apple", "Intel", "NVIDIA", "AMD", "software"};

/** What the driver answered: GL strings, the EGL extensions (null without EGL), limits and the fragment shader's float precision. */
struct Info {
  const char *vendor, *renderer, *version, *extensions, *egl_extensions;
  int max_texture, highp_bits, mediump_bits, depth_bits, stencil_bits;
};

struct Caps {
  Family family;
  bool es;                    // OpenGL ES (else desktop GL)
  int major, minor;
  char renderer[80];
  bool frag_highp;            // the fragment shader has highp floats (Tegra 3: no)
  int mediump_bits;           // mantissa bits of a fragment mediump float (Tegra 3: 13, fp16 GPUs: 10)
  int depth_bits, stencil_bits, max_texture;   // the context's surface; textures up to max_texture (Tegra 3: 2048)
  bool npot, vao, instancing, uint_index, fb_fetch, derivatives, depth24, packed_ds, etc1, s3tc, astc, half_float;
  bool buffer_age, partial_update, swap_damage;   // EGL: what the window keeps between frames, what a swap can be told
  // the tuning table (tune below): what the strings do not say
  bool tiler;                 // draws in tiles: a clear is free and saves loading the old pixels; reading the framebuffer mid-frame flushes
  bool lean;                  // the lean programs for plain quads (gl_replay_shaders.h): their fill rate is the limit
  uint32_t quirks;            // the quirks table's (Quirk bits, below), then ZINC_GL_QUIRK's
};

/** The quirks table (ZN-183): what a driver gets wrong or slow, keyed on the GPU family and a part of the renderer string, the way Chromium's
 *  gpu_driver_bug_list.json and ANGLE's feature overrides key theirs. ZINC_GL_QUIRK=name,-name turns a quirk on or off on any GPU: a test
 *  forces `no-replay` to see the fallback, a user with a broken driver turns the GPU replay off. */
enum Quirk : uint32_t {
  NO_REPLAY = 1,     // the GPU replay is not used: the frames are drawn by the software raster (the host prints one line)
  NO_GPU_POLY = 2,   // POLY on the CPU's coverage tiles instead of the stencil fill
  MASK_CLIP = 4,     // a rounded clip as a sampled mask texture instead of the shader's distance
  CLIP_DEPTH = 8,    // the occlusion pass also runs inside rectangular clips
};
static const int QUIRKS = 4;
static const char* const quirk_names[QUIRKS] = {"no-replay", "no-gpu-poly", "mask-clip", "clip-depth"};
struct QuirkRow { Family family; const char* renderer; uint32_t quirks; };   // renderer: a part of GL_RENDERER, null for the whole family
/** Why each row:
 *  - PowerVR SGX 535 (iPhone 4, iPad 1): its stencil fill shades the same translucent polygon box again and again (a coverage texture is
 *    reused instead), a rounded clip's distance costs more than a mask, and occlusion inside clips pays;
 *  - Intel HD: occlusion inside clips, 40 stacked gradients 29 -> 118 fps with the lean programs (Atom x5-Z8350, 2026-11-03). */
static const QuirkRow quirk_rows[] = {
  {POWERVR, "SGX 535", NO_GPU_POLY | MASK_CLIP | CLIP_DEPTH}, {POWERVR, "SGX535", NO_GPU_POLY | MASK_CLIP | CLIP_DEPTH},
  {INTEL, nullptr, CLIP_DEPTH},
};

static inline bool has(const char* list, const char* name) {
  if (!list) return false;
  const size_t n = strlen(name);
  for (const char* p = list; (p = strstr(p, name)); p += n)   // a whole word: GL_OES_depth24 is not GL_OES_depth24_stencil8
    if ((p == list || p[-1] == ' ') && (p[n] == 0 || p[n] == ' ')) return true;
  return false;
}
static inline bool contains(const char* s, const char* part) { return s && strstr(s, part); }

static inline Family family_of(const char* vendor, const char* renderer) {
  const char* r = renderer ? renderer : "";
  if (contains(r, "llvmpipe") || contains(r, "softpipe") || contains(r, "SwiftShader") || contains(r, "Software")) return SOFTWARE;
  if (contains(r, "VideoCore IV") || contains(r, "VC4")) return VC4;
  if (contains(r, "Adreno")) {
    const char* d = r + strcspn(r, "0123456789");
    return *d == '2' && d[1] >= '0' && d[1] <= '9' && d[2] >= '0' && d[2] <= '9' && (d[3] < '0' || d[3] > '9') ? ADRENO2 : ADRENO;
  }
  if (contains(r, "Tegra 3")) return TEGRA3;
  if (contains(r, "Tegra")) return TEGRA;
  if (contains(r, "Mali-4") || contains(r, "Mali-3") || contains(r, "Mali-2")) return MALI_UTGARD;
  if (contains(r, "Mali")) return MALI;
  if (contains(r, "PowerVR") || contains(r, "SGX")) return POWERVR;   // vitaGL names the PS Vita's GPU "SGX543MP4+"
  if (contains(r, "Apple")) return APPLE;
  if (contains(r, "Intel")) return INTEL;
  if (contains(r, "NVIDIA") || contains(r, "GeForce") || contains(r, "Quadro")) return NVIDIA;
  if (contains(r, "AMD") || contains(r, "Radeon") || contains(vendor, "ATI")) return AMD;
  return UNKNOWN;
}

/** The tuning table: a row per family that differs from the default (an immediate-mode GPU, the full programs). Why each row:
 *  - tilers: VideoCore IV, Adreno, Mali, PowerVR and Apple GPUs draw in tiles (a clear before a full draw costs nothing there);
 *  - lean: an Adreno 220 fills 1024x768 in 16 ms with the full program and 2 ms with a lean one (docs/reports/hardware/hp-touchpad-webos.md);
 *    Tegra 3 replays a scroll's strip and the perf panel in about half the GPU time with them (ZN-741 notes);
 *    VideoCore IV at 1080p (Pi 3B+, 2026-10-19): gradients 3 -> 20 fps, translucent full-screen layers 8 -> 20, shadows 30 -> 60, with at most 23 levels
 *    of difference from the software frame (docs/reports/pi-1080p.md);
 *    Intel HD (Atom x5-Z8350, 2026-11-03): gradients 29 -> 89 fps, nested clips 63 -> 88. */
struct Tune { Family family; bool tiler, lean; };
static const Tune tune[] = {
  {VC4, true, true}, {ADRENO2, true, true}, {ADRENO, true, false}, {TEGRA3, false, true}, {MALI_UTGARD, true, false}, {MALI, true, false},
  {POWERVR, true, false}, {APPLE, true, false}, {INTEL, false, true},
};

static inline void fill(Caps& c, const Info& in) {
  memset(&c, 0, sizeof c);
  const char* v = in.version ? in.version : "";
  c.es = contains(v, "OpenGL ES");
  const char* d = v + strcspn(v, "0123456789");
  c.major = *d ? d[0] - '0' : 0;
  c.minor = *d && d[1] == '.' ? d[2] - '0' : 0;
  snprintf(c.renderer, sizeof c.renderer, "%s", in.renderer ? in.renderer : "?");
  c.family = family_of(in.vendor, in.renderer);
  c.frag_highp = !c.es || in.highp_bits > 0;
  c.mediump_bits = c.es ? in.mediump_bits : 23;
  c.depth_bits = in.depth_bits; c.stencil_bits = in.stencil_bits; c.max_texture = in.max_texture;
  const char* e = in.extensions;
  const bool es3 = c.es && c.major >= 3, gl3 = !c.es && c.major >= 3;
  c.npot = !c.es || es3 || has(e, "GL_OES_texture_npot") || has(e, "GL_ARB_texture_non_power_of_two");
  c.vao = gl3 || es3 || has(e, "GL_OES_vertex_array_object");
  c.instancing = es3 || (!c.es && (c.major > 3 || (c.major == 3 && c.minor >= 3))) || has(e, "GL_ANGLE_instanced_arrays") || has(e, "GL_EXT_instanced_arrays");
  c.uint_index = !c.es || es3 || has(e, "GL_OES_element_index_uint");
  c.fb_fetch = has(e, "GL_EXT_shader_framebuffer_fetch") || has(e, "GL_NV_shader_framebuffer_fetch") || has(e, "GL_ARM_shader_framebuffer_fetch");
  c.derivatives = !c.es || es3 || has(e, "GL_OES_standard_derivatives");
  c.depth24 = !c.es || es3 || has(e, "GL_OES_depth24");
  c.packed_ds = !c.es || es3 || has(e, "GL_OES_packed_depth_stencil");
  c.etc1 = has(e, "GL_OES_compressed_ETC1_RGB8_texture");
  c.s3tc = has(e, "GL_EXT_texture_compression_s3tc") || has(e, "GL_EXT_texture_compression_dxt1");
  c.astc = has(e, "GL_KHR_texture_compression_astc_ldr");
  c.half_float = gl3 || es3 || has(e, "GL_OES_texture_half_float");
  c.buffer_age = has(in.egl_extensions, "EGL_EXT_buffer_age");
  c.partial_update = has(in.egl_extensions, "EGL_KHR_partial_update");
  c.swap_damage = has(in.egl_extensions, "EGL_KHR_swap_buffers_with_damage") || has(in.egl_extensions, "EGL_EXT_swap_buffers_with_damage");
  for (const Tune& t : tune) if (t.family == c.family) { c.tiler = t.tiler; c.lean = t.lean; }
  if (c.family == POWERVR && (contains(in.renderer, "SGX 535") || contains(in.renderer, "SGX535"))) c.lean = true;
  for (const QuirkRow& q : quirk_rows) if (q.family == c.family && (!q.renderer || contains(in.renderer, q.renderer))) c.quirks |= q.quirks;
}

/** Resolve both operations of an advertised API together: some EGL loaders return nonnull stubs for unsupported entry points. */
struct Instancing { void* divisor; void* draw; const char* api; };
static inline Instancing load_instancing(Caps& c, const char* extensions, void* (*proc)(const char*)) {
  const bool core = c.es ? c.major >= 3 : c.major > 3 || (c.major == 3 && c.minor >= 3);
  struct API { bool available; const char *divisor, *draw, *name; };
  const API apis[] = {
    {core, "glVertexAttribDivisor", "glDrawArraysInstanced", "core"},
    {has(extensions, "GL_EXT_instanced_arrays"), "glVertexAttribDivisorEXT", "glDrawArraysInstancedEXT", "EXT"},
    {has(extensions, "GL_ANGLE_instanced_arrays"), "glVertexAttribDivisorANGLE", "glDrawArraysInstancedANGLE", "ANGLE"},
  };
  c.instancing = false;
  for (const API& a : apis) if (a.available) {
    void* divisor = proc(a.divisor); void* draw = proc(a.draw);
    if (divisor && draw) { c.instancing = true; return {divisor, draw, a.name}; }
  }
  return {nullptr, nullptr, "none"};
}

/** ZINC_GL_QUIRK: a comma-separated list of quirk names, each turned on, or off with a leading '-'. False when a name is not a quirk: its
 *  text goes to `bad` (the rest is still applied). */
static inline bool override_quirks(Caps& c, const char* spec, char* bad, size_t cap) {
  bool ok = true;
  if (bad && cap) bad[0] = 0;
  for (const char* p = spec ? spec : ""; *p;) {
    const char* e = p + strcspn(p, ",");
    const bool off = *p == '-';
    const char* n = off ? p + 1 : p;
    int k = 0;
    while (k < QUIRKS && !(strlen(quirk_names[k]) == (size_t)(e - n) && !strncmp(quirk_names[k], n, (size_t)(e - n)))) k++;
    if (k < QUIRKS) { if (off) c.quirks &= ~(1u << k); else c.quirks |= 1u << k; }
    else if (e > p) { ok = false; if (bad && cap) snprintf(bad, cap, "%.*s", (int)(e - p), p); }
    p = *e ? e + 1 : e;
  }
  return ok;
}

/** The record as `gl-info:` lines (ZINC_GL_INFO), into out; the length written. */
static inline int print(const Caps& c, char* out, size_t cap) {
  return snprintf(out, cap,
    "gl-info: %s %d.%d, %s (family %s)\n"
    "gl-info: fragment highp %s, mediump %d bits; surface depth %d stencil %d; max texture %d\n"
    "gl-info: npot %d vao %d instancing %d uint-index %d fb-fetch %d derivatives %d depth24 %d packed-depth-stencil %d\n"
    "gl-info: etc1 %d s3tc %d astc %d half-float %d; egl buffer-age %d partial-update %d swap-damage %d\n"
    "gl-info: tuning: tiler %d, lean programs %d; quirks%s%s%s%s%s\n",
    c.es ? "OpenGL ES" : "OpenGL", c.major, c.minor, c.renderer, family_names[c.family], c.frag_highp ? "yes" : "no", c.mediump_bits, c.depth_bits,
    c.stencil_bits, c.max_texture, c.npot, c.vao, c.instancing, c.uint_index, c.fb_fetch, c.derivatives, c.depth24, c.packed_ds, c.etc1, c.s3tc, c.astc,
    c.half_float, c.buffer_age, c.partial_update, c.swap_damage, c.tiler, c.lean, c.quirks ? "" : " none",
    c.quirks & NO_REPLAY ? " no-replay" : "", c.quirks & NO_GPU_POLY ? " no-gpu-poly" : "", c.quirks & MASK_CLIP ? " mask-clip" : "",
    c.quirks & CLIP_DEPTH ? " clip-depth" : "");
}

}  // namespace glcaps
