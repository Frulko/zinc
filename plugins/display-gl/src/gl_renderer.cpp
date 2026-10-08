// display-gl GPU renderer: replays the frame's draw commands (zrt::raster::Cmd) with OpenGL instead of asking the
// software rasterizer for pixels (docs/reports/gpu-renderer-design.md, phase 1). The result goes to an RGBA
// texture of the surface size, which display_gl.cpp then presents exactly like the software overlay, so the layers,
// the key colour and the screenshots keep working. The pixels follow runtime/raster.cpp: the coverage of a rounded
// box is 0.5 - sdf at the pixel centre, glyphs sit on integer pixels, rounded CLIPs restore the corners.
// Included by display_gl.cpp (one translation unit: plugin.json needs no new source). GLSL ES 1.00 dialect.
#include "zrt_raster.h"
#include <string.h>
#include <time.h>

namespace glr {
using namespace zrt::raster;

// vertex: position + uv, box (centre, half size), params (radius, border / blur, mode, gradient), two colours
struct V { float x, y, u, v, bx, by, bw, bh, r, p1, mode, grad; uint8_t c1[4], c2[4]; };
enum Mode { FILL, BORDER_M, TEXT_M, IMAGE_RGBA, IMAGE_BGR, SOLID, RESTORE, SHADOW_M };
static const int MAXQ = 8192, ATLAS = 1024, CORNER = 32, LEVELS = 16, TEXS = 256;

static const char* VS =
  "attribute vec4 a_pos; attribute vec4 a_box; attribute vec4 a_par; attribute vec4 a_c1; attribute vec4 a_c2;\n"
  "uniform vec2 u_res; uniform float u_flip;\n"
  "varying vec4 v_pos; varying vec4 v_box; varying vec4 v_par; varying vec4 v_c1; varying vec4 v_c2;\n"
  "void main() { v_pos = a_pos; v_box = a_box; v_par = a_par; v_c1 = a_c1; v_c2 = a_c2;\n"
  "  gl_Position = vec4(a_pos.x / u_res.x * 2.0 - 1.0, (a_pos.y / u_res.y * 2.0 - 1.0) * u_flip, 0.0, 1.0); }\n";  // row 0 = top, like the CPU (u_flip -1: drawn into the window)
static const char* FS =
  "varying vec4 v_pos; varying vec4 v_box; varying vec4 v_par; varying vec4 v_c1; varying vec4 v_c2;\n"
  "uniform sampler2D u_tex;\n"
  "float sdf(vec2 p, vec2 c, vec2 h, float r) {\n"
  "  vec2 q = abs(p - c) - (h - r);\n"
  "  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }\n"
  "float cover(vec2 p, vec2 c, vec2 h, float r) { return clamp(0.5 - sdf(p, c, h, r), 0.0, 1.0); }\n"
  "void main() {\n"
  "  vec2 p = v_pos.xy, c = v_box.xy, h = v_box.zw;\n"
  "  float r = v_par.x, mode = v_par.z, grad = v_par.w;\n"
  "  vec3 col = v_c1.rgb; float cov = 1.0, a = v_c1.a;\n"
  "  if (mode < 0.5) {\n"                                                        // FILL: rounded box, gradients
  "    cov = cover(p, c, h, r);\n"
  "    if (grad > 0.5) {\n"
  "      float t;\n"
  "      if (grad < 1.5) t = (p.y - (c.y - h.y)) / max(2.0 * h.y, 1e-6);\n"
  "      else if (grad < 2.5) t = (p.x - (c.x - h.x)) / max(2.0 * h.x, 1e-6);\n"
  "      else { vec2 d = (p - (c - h)) / max(2.0 * h, vec2(1e-6)) * 2.0 - 1.0; t = length(d); }\n"
  "      col = mix(v_c1.rgb, v_c2.rgb, clamp(t, 0.0, 1.0)); }\n"
  "  } else if (mode < 1.5) {\n"                                                 // BORDER: ring between two boxes
  "    float bw = v_par.y;\n"
  "    cov = cover(p, c, h, r) - cover(p, c, h - bw, max(r - bw, 0.0));\n"
  "  } else if (mode < 2.5) {\n"                                                 // TEXT: alpha atlas
  "    cov = texture2D(u_tex, v_pos.zw).r;\n"
  "  } else if (mode < 4.5) {\n"                                                 // IMAGE: baked RGBA / runtime 0x00RRGGBB
  "    vec4 t = texture2D(u_tex, v_pos.zw);\n"
  "    col = mode < 3.5 ? t.rgb : t.bgr; cov = mode < 3.5 ? t.a : 1.0;\n"
  "    if (r > 0.0) cov *= cover(p, c, h, r);\n"
  "  } else if (mode < 5.5) {\n"                                                 // SOLID: whole pixels
  "    cov = 1.0;\n"
  "  } else if (mode < 6.5) {\n"                                                 // RESTORE: rounded clip corners
  "    col = texture2D(u_tex, v_pos.zw).rgb; a = 1.0 - cover(p, c, h, r); cov = 1.0;\n"
  "  } else {\n"                                                                 // SHADOW: blurred rounded box
  "    float blur = v_par.y, k = clamp(1.0 - (sdf(p, c, h, r) + blur * 0.5) / (blur * 1.5), 0.0, 1.0);\n"
  "    cov = k * k * (3.0 - 2.0 * k);\n"
  "  }\n"
  "  gl_FragColor = vec4(col, a * cov);\n"
  "}\n";

struct Tex2 { GLuint id; int32_t key; uint32_t ver; int32_t w, h; const void* px; int nearest; };
static Tex2 texs[TEXS];
static Tex2* baked;                 // by baked image index
struct GSlot { uint64_t key; int16_t ax, ay; };
static GSlot gtab[8192];
static int gcount, gx, gy, growh;

static int32_t W, H;
static GLuint prog, vbo, ibo, fbo, fbo_tex, white, atlas, corner_tex, cur_tex;
static GLint u_res, u_tex, u_flip, a_box, a_par, a_c1, a_c2;
static bool flipy, split = true;   // flipy: drawing into the window framebuffer (rows bottom-up); split: cheap quads for the interior of boxes
static V verts[MAXQ * 4];
static int nq;
static Rect clip, applied, base;
static Rect cstack[16];
struct RC { float x, y, w, h, r; int R; bool on; };
static RC rstack[16];
static int sp;
static uint32_t warned, unsupported;
static struct { uint32_t frames, idle, draws, quads, glyphs; double us; } st;
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
#ifdef __APPLE__
static const GLenum A_IFMT = GL_R8, A_FMT = GL_RED;   // core profile: no LUMINANCE; the shader reads .r
#else
static const GLenum A_IFMT = GL_LUMINANCE, A_FMT = GL_LUMINANCE;
#endif

bool init(int32_t w, int32_t h) {
  W = w; H = h;
  prog = zgl_program("", VS, FS);
  if (!prog) return false;
  u_flip = glGetUniformLocation(prog, "u_flip"); u_res = glGetUniformLocation(prog, "u_res"); u_tex = glGetUniformLocation(prog, "u_tex");
  a_box = glGetAttribLocation(prog, "a_box"); a_par = glGetAttribLocation(prog, "a_par");
  a_c1 = glGetAttribLocation(prog, "a_c1"); a_c2 = glGetAttribLocation(prog, "a_c2");
  fbo_tex = make_tex(W, H, GL_RGBA, GL_RGBA, nullptr, false);
  glGenFramebuffers(1, &fbo);
  glBindFramebuffer(GL_FRAMEBUFFER, fbo);
  glFramebufferTexture2D(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_TEXTURE_2D, fbo_tex, 0);
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
GLuint texture() { return fbo_tex; }

// ---- batching
static void apply_clip() {
  if (memcmp(&clip, &applied, sizeof clip) == 0) return;
  int32_t x0 = clip.x0 < 0 ? 0 : clip.x0, y0 = clip.y0 < 0 ? 0 : clip.y0, x1 = clip.x1 > W ? W : clip.x1, y1 = clip.y1 > H ? H : clip.y1;
  glScissor(x0, flipy ? H - (y1 > y0 ? y1 : y0) : y0, x1 > x0 ? x1 - x0 : 0, y1 > y0 ? y1 - y0 : 0);
  applied = clip;
}
static void flush() {
  if (!nq) return;
  glBindBuffer(GL_ARRAY_BUFFER, vbo);
  glBufferData(GL_ARRAY_BUFFER, (GLsizeiptr)nq * 4 * sizeof(V), verts, GL_STREAM_DRAW);
  const GLsizei S = sizeof(V);
  glEnableVertexAttribArray(0); glVertexAttribPointer(0, 4, GL_FLOAT, GL_FALSE, S, (void*)0);
  glEnableVertexAttribArray(a_box); glVertexAttribPointer(a_box, 4, GL_FLOAT, GL_FALSE, S, (void*)16);
  glEnableVertexAttribArray(a_par); glVertexAttribPointer(a_par, 4, GL_FLOAT, GL_FALSE, S, (void*)32);
  glEnableVertexAttribArray(a_c1); glVertexAttribPointer(a_c1, 4, GL_UNSIGNED_BYTE, GL_TRUE, S, (void*)48);
  glEnableVertexAttribArray(a_c2); glVertexAttribPointer(a_c2, 4, GL_UNSIGNED_BYTE, GL_TRUE, S, (void*)52);
  glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, ibo);
  apply_clip();
  glBindTexture(GL_TEXTURE_2D, cur_tex);
  glDrawElements(GL_TRIANGLES, nq * 6, GL_UNSIGNED_SHORT, nullptr);
  st.draws++; st.quads += (uint32_t)nq;
  nq = 0;
}
static void use_tex(GLuint t) { if (t != cur_tex) { flush(); cur_tex = t; } }
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
struct Q { float x0, y0, x1, y1, u0, v0, u1, v1, bx, by, bw, bh, r, p1; int mode, grad; uint32_t c1, c2; uint32_t alpha; };
static void quad(const Q& q) {
  if (clip.x1 <= clip.x0 || clip.y1 <= clip.y0 || q.x1 <= (float)clip.x0 || q.x0 >= (float)clip.x1 || q.y1 <= (float)clip.y0 || q.y0 >= (float)clip.y1) return;   // outside the clip: nothing to draw (and no empty scissor for the GPU)
  if (nq == MAXQ) flush();
  V* v = &verts[nq * 4];
  nq++;
  const float xs[4] = {q.x0, q.x1, q.x1, q.x0}, ys[4] = {q.y0, q.y0, q.y1, q.y1}, us[4] = {q.u0, q.u1, q.u1, q.u0}, vs[4] = {q.v0, q.v0, q.v1, q.v1};
  for (int i = 0; i < 4; i++) {
    v[i] = V{xs[i], ys[i], us[i], vs[i], q.bx, q.by, q.bw, q.bh, q.r, q.p1, (float)q.mode, (float)q.grad, {0, 0, 0, 0}, {0, 0, 0, 0}};
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
static const GSlot* glyph_slot(int32_t font, const Font& f, const Glyph* g) {
  if (g->w > ATLAS || g->h > ATLAS) return nullptr;
  uint64_t key = ((uint64_t)(uint32_t)font << 32) | g->cp | (1ull << 63);
  for (;;) {
    uint32_t i = (uint32_t)((key * 0x9E3779B97F4A7C15ull) >> 51);
    while (gtab[i].key && gtab[i].key != key) i = (i + 1) & 8191;
    if (gtab[i].key == key) return &gtab[i];
    if (gcount > 6000 || gy + g->h > ATLAS) { atlas_reset(); continue; }   // ponytail: reset when full, glyphs come back lazily
    if (gx + g->w + 1 > ATLAS) { gy += growh + 1; gx = 0; growh = 0; if (gy + g->h > ATLAS) continue; }
    glBindTexture(GL_TEXTURE_2D, atlas);
    glPixelStorei(GL_UNPACK_ALIGNMENT, 1);
    glTexSubImage2D(GL_TEXTURE_2D, 0, gx, gy, g->w, g->h, A_FMT, GL_UNSIGNED_BYTE, f.bitmap + g->off);
    glBindTexture(GL_TEXTURE_2D, cur_tex);
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
static void draw_text(const Cmd& c, const char* s) {
  const Font* fp = font_at(c.res);
  if (!fp) return;
  const Font& f = *fp;
  int32_t pen = f2i(c.x * 64), base = f2i(c.y + 0.5f) + f.ascent;
  for (uint32_t i = 0; i < c.n;) {
    const Glyph* g = glyph_of(c.res, f, next_cp(s, c.n, i));
    if (!g) g = glyph_of(c.res, f, '?');
    if (!g) continue;
    int32_t px = ((pen + 32) >> 6) + g->x0, py = base + g->y0;
    if (g->w > 0 && g->h > 0) {
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
  }
}

// ---- images: baked ones are uploaded once, runtime ones again when their version changes
static Tex2* dyn_tex(int32_t id) {
  Tex2* t = nullptr;
  for (int i = 0; i < TEXS; i++) { if (texs[i].id && texs[i].key == id) { t = &texs[i]; break; } }
  if (!t) for (int i = 0; i < TEXS; i++) if (!texs[i].id) { t = &texs[i]; t->key = id; t->nearest = -1; break; }
  if (!t) return nullptr;
  const uint32_t* px; int32_t w, h, stride;
  if (!dyn_view(id, &px, &w, &h, &stride)) return nullptr;
  uint32_t ver = image_version(id);
  if (!t->id || t->w != w || t->h != h) {
    if (t->id) glDeleteTextures(1, &t->id);
    t->id = make_tex(w, h, GL_RGBA, GL_RGBA, nullptr, true);
    t->w = w; t->h = h; t->nearest = 1; t->ver = ver - 1;
  }
  if (t->ver != ver || t->px != px) {
    glBindTexture(GL_TEXTURE_2D, t->id);
    glPixelStorei(GL_UNPACK_ALIGNMENT, 4);
    if (stride == w) glTexSubImage2D(GL_TEXTURE_2D, 0, 0, 0, w, h, GL_RGBA, GL_UNSIGNED_BYTE, px);
    else for (int32_t y = 0; y < h; y++) glTexSubImage2D(GL_TEXTURE_2D, 0, 0, y, w, 1, GL_RGBA, GL_UNSIGNED_BYTE, px + (size_t)y * stride);
    glBindTexture(GL_TEXTURE_2D, cur_tex);
    t->ver = ver; t->px = px;
  }
  return t;
}
static void draw_image(const Cmd& c) {
  if (!(c.w > 0 && c.h > 0 && c.w < 1e30f && c.h < 1e30f && c.x - c.x == 0 && c.y - c.y == 0)) return;
  Tex2* t; int mode; bool nearest;
  if (c.res >= DYN_BASE) {
    const uint32_t* px; int32_t w, h, stride;
    if (!dyn_view(c.res, &px, &w, &h, &stride) || !((float)w / c.w < 1e6f && (float)h / c.h < 1e6f)) return;
    t = dyn_tex(c.res);
    int32_t sx = f2i((float)w / c.w * 65536), sy = f2i((float)h / c.h * 65536);
    nearest = c.grad == 1 || (sx == 65536 && sy == 65536);
    mode = IMAGE_BGR;
  } else {
    if (c.res < 0 || c.res >= image_count) return;
    const Image& im = images[c.res];
    if (!((float)im.w / c.w < 1e6f && (float)im.h / c.h < 1e6f)) return;
    t = &baked[c.res];
    if (!t->id) { t->id = make_tex(im.w, im.h, GL_RGBA, GL_RGBA, im.rgba, false); t->nearest = 0; t->w = im.w; t->h = im.h; }
    nearest = false; mode = IMAGE_RGBA;
  }
  if (!t || !t->id) return;
  Rect b = bounds(c.x, c.y, c.w, c.h, HUGE_R);
  if (b.x0 >= b.x1 || b.y0 >= b.y1) return;
  set_filter(*t, nearest);
  use_tex(t->id);
  Q q = box_q(c, b, mode);
  q.r = c.r > 0 ? c.r : 0;   // the CPU does not clamp an image's radius
  q.c1 = 0xffffff;
  q.u0 = ((float)b.x0 - c.x) / c.w; q.u1 = ((float)b.x1 - c.x) / c.w; q.v0 = ((float)b.y0 - c.y) / c.h; q.v1 = ((float)b.y1 - c.y) / c.h;
  quad(q);
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
static void draw_poly(const Cmd& c, const float* pts) {
  if (!(c.w == c.w && c.h == c.h && c.x == c.x && c.y == c.y)) return;
  Rect b = bounds(c.x, c.y, c.w, c.h, Rect{0, 0, W, H});
  if (b.x0 >= b.x1 || b.y0 >= b.y1) return;
  const int32_t bw = b.x1 - b.x0, bh = b.y1 - b.y0;
  size_t nf = 0;   // floats of the contours
  for (uint32_t k = 0; k < c.n; k++) { float cnt = pts[nf]; if (!(cnt >= 0 && cnt < 1e7f)) return; nf += 1 + (size_t)cnt * 2; }
  const bool paint = c.grad == 4;   // a canvas gradient paint record follows the contours: [kind, x0, y0, r0, x1, y1, r1, n, (offset, colour, alpha) * n]
  size_t pf = 0;
  if (paint) { float n = pts[nf + 7]; if (!(n >= 0 && n < 4096)) return; pf = 8 + (size_t)n * 3; }
  if (!grow(ptmp, ptmp_cap, nf + pf)) return;
  size_t at = 0;
  for (uint32_t k = 0; k < c.n; k++) {   // the contours moved so that the tile starts at the origin: the key does not depend on where the shape is
    int32_t cnt = (int32_t)pts[at]; ptmp[at] = pts[at];
    for (int32_t i = 0; i < cnt; i++) { ptmp[at + 1 + i * 2] = pts[at + 1 + i * 2] - (float)b.x0; ptmp[at + 2 + i * 2] = pts[at + 2 + i * 2] - (float)b.y0; }
    at += 1 + (size_t)cnt * 2;
  }
  if (paint) { memcpy(ptmp + nf, pts + nf, pf * sizeof(float)); ptmp[nf + 1] -= (float)b.x0; ptmp[nf + 2] -= (float)b.y0; ptmp[nf + 4] -= (float)b.x0; ptmp[nf + 5] -= (float)b.y0; }
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
    Cmd tc = c; tc.kind = POLY; tc.x = ox; tc.y = oy; tc.off = 0;
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

// b minus in as four non-overlapping quads (top, bottom, left, right), drawn with `mode` and the box of c
static void bands(const Cmd& c, const Rect& b, const Rect& in, int mode, float p1) {
  const Rect r[4] = {{b.x0, b.y0, b.x1, in.y0}, {b.x0, in.y1, b.x1, b.y1}, {b.x0, in.y0, in.x0, in.y1}, {in.x1, in.y0, b.x1, in.y1}};
  for (const Rect& k : r) {
    if (k.x0 >= k.x1 || k.y0 >= k.y1) continue;
    Q q = box_q(c, k, mode);
    q.p1 = p1;
    quad(q);
  }
}
static void solid_and_bands(const Cmd& c, const Rect& b, const Rect& in, int mode, float p1) {
  Q q = box_q(c, in, SOLID);
  quad(q);
  bands(c, b, in, mode, p1);
}

// ---- one command list
static void run(const Frame& f) {
  sp = 0;
  clip = base;
  for (uint32_t i = 0; i < f.count; i++) {
    const Cmd& c = f.cmds[i];
    switch (c.kind) {
      case CLEAR:
        flush();
        apply_clip();
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
      case LINE: case POLY: draw_poly(c, f.pts + c.off); break;
      case CLIP: {
        if (sp >= 16) break;
        flush();
        RC k = {c.x, c.y, c.w, c.h, c.r, 0, false};
        float hw2 = c.w / 2, hh2 = c.h / 2;
        k.R = c.r > 0 ? iceil(c.r < hw2 ? (c.r < hh2 ? c.r : hh2) : (hw2 < hh2 ? hw2 : hh2)) : 0;
        int32_t x0 = ifloor(k.x), y0 = ifloor(k.y), x1 = iceil(k.x + k.w), y1 = iceil(k.y + k.h);
        if (k.R > 0 && k.R <= CORNER && x0 >= 0 && y0 >= 0 && x1 <= W && y1 <= H) {   // ponytail: larger radii or clips off screen stay square
          const int32_t cx[4] = {x0, x1 - k.R, x0, x1 - k.R}, cy[4] = {y0, y0, y1 - k.R, y1 - k.R};
          glBindFramebuffer(GL_FRAMEBUFFER, flipy ? 0 : fbo);
          glBindTexture(GL_TEXTURE_2D, corner_tex);
          for (int q = 0; q < 4; q++) glCopyTexSubImage2D(GL_TEXTURE_2D, 0, q * CORNER, sp * CORNER, cx[q], flipy ? H - cy[q] - k.R : cy[q], k.R, k.R);   // flipped copy: the restore quad flips v back
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
}

/** Replays every list of the frame. `direct`: into the window framebuffer (rows bottom-up; its content is undefined after
 *  a swap, so the whole surface is drawn); else into the surface texture, the whole surface too unless ZINC_GL_DMG=1
 *  limits it to `dmg`. ponytail: off by default, that scissored replay is the prime suspect of GPU hangs seen on the
 *  Pi 3B+ (Kit / Forms: partial damage, "Resetting GPU"); see docs/plugins/display-gl.md. */
void frame(const HalFrame* f, bool direct, Rect dmg) {
  static const bool dmg_on = getenv("ZINC_GL_DMG") && atoi(getenv("ZINC_GL_DMG")) != 0;
  double t0 = now_us();
  const HalCmdList* lists[8];
  int32_t n = f->frames ? f->frames(lists, 8) : 0;
  flipy = direct;
  base = direct || !dmg_on ? Rect{0, 0, W, H} : isect(dmg, Rect{0, 0, W, H});
  glBindFramebuffer(GL_FRAMEBUFFER, direct ? 0 : fbo);
  glViewport(0, 0, W, H);
  memset(&applied, 0xff, sizeof applied);
  glEnable(GL_SCISSOR_TEST);
  clip = base;
  apply_clip();   // the clear stays inside the base rectangle
  glClearColor(0, 0, 0, 1);
  glClear(GL_COLOR_BUFFER_BIT);
  glUseProgram(prog);
  glUniform1f(u_flip, direct ? -1.f : 1.f);
  glUniform2f(u_res, (float)W, (float)H);
  glUniform1i(u_tex, 0);
  glActiveTexture(GL_TEXTURE0);
  cur_tex = white;
  glEnable(GL_BLEND);
  glBlendFuncSeparate(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA, GL_ONE, GL_ONE_MINUS_SRC_ALPHA);
  for (int32_t i = 0; i < n; i++) run(Frame{(const Cmd*)lists[i]->cmds, lists[i]->count, lists[i]->text, lists[i]->pts});
  glDisableVertexAttribArray(a_box); glDisableVertexAttribArray(a_par); glDisableVertexAttribArray(a_c1); glDisableVertexAttribArray(a_c2);
  glDisable(GL_SCISSOR_TEST);
  glBindFramebuffer(GL_FRAMEBUFFER, 0);
  st.frames++;
  st.us += now_us() - t0;
}
void idle() { st.idle++; }
void report() {
  if (!getenv("ZINC_GL_STATS")) return;
  double n = st.frames ? st.frames : 1;
  fprintf(stderr, "display-gl renderer gl: %u frames replayed, %u idle (no damage), %.1f draw calls and %.0f quads per frame, %u glyphs in the atlas, %u LINE/POLY skipped; %.0f us of CPU per replayed frame to submit it\n",
          st.frames, st.idle, st.draws / n, st.quads / n, st.glyphs, unsupported, st.us / n);
}
}  // namespace glr
