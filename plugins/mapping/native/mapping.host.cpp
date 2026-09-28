// zinc:mapping — GPU layer compositor for video mapping, drawn by display-gl (docs/plugins/mapping.md).
// Coordinates are normalized: output (0,0) top-left .. (1,1) bottom-right; a layer's surface space is its own unit
// square (texture, masks, crop and edge blend live there). Per layer, the vertex path is
//   surface (s,t) -> mesh warp (Catmull-Rom surface through the control grid) -> corner pin (homography)
//   -> transform (position/scale/rotation) -> output,
// with the homography applied in the vertex shader so texturing stays perspective-correct. Masks (feathered
// polygons, crop, edge blend, image mask) are rendered into a per-layer mask texture only when they change.
#include "zinc_native_mapping.h"
#include "zrt_raster.h"
#include "zgl.h"  // not found: zinc:mapping needs `"display": "gl"` in zinc.json
#include <math.h>
#include <stddef.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

namespace {
namespace raster = zrt::raster;

enum { MAX_LAYERS = 16, MAX_MESH = 16, MAX_MASKS = 4, MAX_PTS = 32, MAX_ARGS = 2 + MAX_MESH * MAX_MESH * 2, MAX_STRS = 4,
       MASK_PX = 512, GRID = 32 };
enum { PATTERN, SOLID, GRADIENT, IMAGE, BAKED, NPROG };  // BAKED: IMAGE from a baked (RGBA) asset
enum { NORMAL, ADD, MULTIPLY, SCREEN };
const char* SRC_NAMES[] = {"pattern", "solid", "gradient", "image"};
const char* BLEND_NAMES[] = {"normal", "add", "multiply", "screen"};
typedef char Str[64];

struct Mask { int n; float feather, invert, pts[MAX_PTS * 2]; };
struct Tex { GLuint id; int32_t image, w, h; uint32_t version; bool rgba; };
struct Layer {
  char name[32];
  int source, blend, cols, rows, image, maskimage;
  float visible, color[3], color2[3], angle, corners[8], position[2], scale, rotation, opacity;
  float brightness, contrast, saturation, hue, gamma, gain[3], crop[5], edge[5], grid;
  float mesh[MAX_MESH * MAX_MESH * 2];
  Mask masks[MAX_MASKS];
  GLuint vbo, mfbo;
  Tex tex, mtex, mimg;  // source, mask render target, mask image
  bool geom_dirty, mask_dirty;
};
Layer L[MAX_LAYERS];
int nl = 0, selected = -1;
float aspect = 16.f / 9.f;

// Plain float parameters: key = OSC address leaf = JSON key. dirty: 2 = mask texture.
struct Field { const char* key; size_t off; int n, dirty; };
#define F(k, n, d) {#k, offsetof(Layer, k), n, d}
const Field FIELDS[] = {
  F(visible, 1, 0), F(color, 3, 0), F(color2, 3, 0), F(angle, 1, 0), F(corners, 8, 0), F(position, 2, 0), F(scale, 1, 0),
  F(rotation, 1, 0), F(opacity, 1, 0), F(brightness, 1, 0), F(contrast, 1, 0), F(saturation, 1, 0), F(hue, 1, 0),
  F(gamma, 1, 0), F(gain, 3, 0), F(crop, 5, 2), F(edge, 5, 2), F(grid, 1, 0)};
#undef F

void identity_mesh(Layer& l) {
  for (int j = 0; j < l.rows; j++)
    for (int i = 0; i < l.cols; i++) { l.mesh[(j * l.cols + i) * 2] = (float)i / (l.cols - 1); l.mesh[(j * l.cols + i) * 2 + 1] = (float)j / (l.rows - 1); }
  l.geom_dirty = true;
}

void defaults(Layer& l, int idx) {
  static const float palette[6][3] = {{0.2f, 0.6f, 1}, {1, 0.45f, 0.2f}, {0.3f, 0.9f, 0.4f}, {0.9f, 0.3f, 0.8f}, {1, 0.85f, 0.2f}, {0.3f, 0.9f, 0.9f}};
  snprintf(l.name, sizeof l.name, "layer %d", idx);
  l.source = PATTERN; l.blend = NORMAL; l.image = -1; l.maskimage = -1;
  l.visible = 1; memcpy(l.color, palette[idx % 6], sizeof l.color); l.color2[0] = l.color2[1] = l.color2[2] = 0; l.angle = 0;
  const float c[8] = {0, 0, 1, 0, 1, 1, 0, 1};
  memcpy(l.corners, c, sizeof c);
  l.position[0] = l.position[1] = 0; l.scale = 1; l.rotation = 0; l.opacity = 1;
  l.brightness = 0; l.contrast = 1; l.saturation = 1; l.hue = 0; l.gamma = 1; l.gain[0] = l.gain[1] = l.gain[2] = 1;
  const float crop[5] = {0, 0, 1, 1, 0}, edge[5] = {0, 0, 0, 0, 2.2f};
  memcpy(l.crop, crop, sizeof crop); memcpy(l.edge, edge, sizeof edge);
  l.grid = 0;
  for (Mask& m : l.masks) m.n = 0;
  l.cols = l.rows = 2;
  identity_mesh(l);
  l.mask_dirty = true;
}

void free_gl(Layer& l) {
  if (l.vbo) glDeleteBuffers(1, &l.vbo);
  if (l.mfbo) glDeleteFramebuffers(1, &l.mfbo);
  GLuint t[3] = {l.tex.id, l.mtex.id, l.mimg.id};
  for (GLuint id : t) if (id) glDeleteTextures(1, &id);
}

// ---------- geometry ----------
// Control point with linear extrapolation past the border (keeps the edge rows of the surface straight-ish).
void cp(const Layer& l, int i, int j, float out[2]) {
  if (i < 0 || i >= l.cols) { float a[2], b[2]; int e = i < 0 ? 0 : l.cols - 1, f = i < 0 ? 1 : l.cols - 2; cp(l, e, j, a); cp(l, f, j, b); out[0] = 2 * a[0] - b[0]; out[1] = 2 * a[1] - b[1]; return; }
  if (j < 0 || j >= l.rows) { float a[2], b[2]; int e = j < 0 ? 0 : l.rows - 1, f = j < 0 ? 1 : l.rows - 2; cp(l, i, e, a); cp(l, i, f, b); out[0] = 2 * a[0] - b[0]; out[1] = 2 * a[1] - b[1]; return; }
  out[0] = l.mesh[(j * l.cols + i) * 2]; out[1] = l.mesh[(j * l.cols + i) * 2 + 1];
}
// Catmull-Rom: the cubic Bezier segment whose inner control points come from the neighbours, through every point.
float cr(float p0, float p1, float p2, float p3, float t) {
  return 0.5f * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
}
void warp(const Layer& l, float s, float t, float out[2]) {
  float fx = s * (l.cols - 1), fy = t * (l.rows - 1);
  int i = (int)fx, j = (int)fy;
  if (i > l.cols - 2) i = l.cols - 2;
  if (j > l.rows - 2) j = l.rows - 2;
  float u = fx - i, v = fy - j, row[4][2];
  for (int b = 0; b < 4; b++) {
    float p[4][2];
    for (int a = 0; a < 4; a++) cp(l, i - 1 + a, j - 1 + b, p[a]);
    for (int k = 0; k < 2; k++) row[b][k] = cr(p[0][k], p[1][k], p[2][k], p[3][k], u);
  }
  for (int k = 0; k < 2; k++) out[k] = cr(row[0][k], row[1][k], row[2][k], row[3][k], v);
}

void tessellate(Layer& l) {
  static float pts[(GRID + 1) * (GRID + 1)][4], tri[GRID * GRID * 6][4];
  for (int y = 0; y <= GRID; y++)
    for (int x = 0; x <= GRID; x++) {
      float* p = pts[y * (GRID + 1) + x];
      p[2] = (float)x / GRID; p[3] = (float)y / GRID;
      warp(l, p[2], p[3], p);
    }
  int n = 0;
  for (int y = 0; y < GRID; y++)
    for (int x = 0; x < GRID; x++) {
      const int q[6] = {y * (GRID + 1) + x, y * (GRID + 1) + x + 1, (y + 1) * (GRID + 1) + x, y * (GRID + 1) + x + 1, (y + 1) * (GRID + 1) + x + 1, (y + 1) * (GRID + 1) + x};
      for (int k : q) memcpy(tri[n++], pts[k], sizeof tri[0]);
    }
  if (!l.vbo) glGenBuffers(1, &l.vbo);
  glBindBuffer(GL_ARRAY_BUFFER, l.vbo);
  glBufferData(GL_ARRAY_BUFFER, sizeof tri, tri, GL_STATIC_DRAW);
  l.geom_dirty = false;
}

typedef float M3[9];  // row-major
void mul(const M3 a, const M3 b, M3 out) {
  M3 r;
  for (int i = 0; i < 3; i++) for (int j = 0; j < 3; j++) r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
  memcpy(out, r, sizeof r);
}
// Unit square -> quad (TL, TR, BR, BL) (Heckbert, "Fundamentals of Texture Mapping", 1989).
void homography(const float* c, M3 h) {
  float x0 = c[0], y0 = c[1], x1 = c[2], y1 = c[3], x2 = c[4], y2 = c[5], x3 = c[6], y3 = c[7];
  float dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3, dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
  float det = dx1 * dy2 - dx2 * dy1, g = 0, k = 0;
  if (fabsf(det) > 1e-9f) { g = (dx3 * dy2 - dx2 * dy3) / det; k = (dx1 * dy3 - dx3 * dy1) / det; }
  const M3 r = {x1 - x0 + g * x1, x3 - x0 + k * x3, x0, y1 - y0 + g * y1, y3 - y0 + k * y3, y0, g, k, 1};
  memcpy(h, r, sizeof r);
}
// Full vertex matrix: NDC * transform * homography, column-major for glUniformMatrix3fv.
void layer_matrix(const Layer& l, float out[9]) {
  M3 h, t, m;
  homography(l.corners, h);
  float cx = (l.corners[0] + l.corners[2] + l.corners[4] + l.corners[6]) / 4, cy = (l.corners[1] + l.corners[3] + l.corners[5] + l.corners[7]) / 4;
  float a = l.rotation * 3.14159265f / 180, cs = cosf(a) * l.scale, sn = sinf(a) * l.scale;
  // rotate/scale about the quad centre in aspect-corrected space, then move by position
  const M3 rs = {cs, -sn / aspect, 0, sn * aspect, cs, 0, 0, 0, 1};
  const M3 to = {1, 0, -cx, 0, 1, -cy, 0, 0, 1}, back = {1, 0, cx + l.position[0], 0, 1, cy + l.position[1], 0, 0, 1};
  const M3 ndc = {2, 0, -1, 0, -2, 1, 0, 0, 1};
  mul(rs, to, t); mul(back, t, t); mul(t, h, m); mul(ndc, m, m);
  for (int i = 0; i < 3; i++) for (int j = 0; j < 3; j++) out[j * 3 + i] = m[i * 3 + j];
}

// Colour: gains, hue rotation, saturation, contrast and brightness are affine -> one 4x4 matrix (column-major).
void color_matrix(const Layer& l, float out[16]) {
  float a = l.hue * 3.14159265f / 180, c = cosf(a), s = sinf(a), k = l.saturation;
  const M3 hue = {0.213f + c * 0.787f - s * 0.213f, 0.715f - c * 0.715f - s * 0.715f, 0.072f - c * 0.072f + s * 0.928f,
                  0.213f - c * 0.213f + s * 0.143f, 0.715f + c * 0.285f + s * 0.140f, 0.072f - c * 0.072f - s * 0.283f,
                  0.213f - c * 0.213f - s * 0.787f, 0.715f - c * 0.715f + s * 0.715f, 0.072f + c * 0.928f + s * 0.072f};
  const M3 sat = {0.213f + 0.787f * k, 0.715f - 0.715f * k, 0.072f - 0.072f * k, 0.213f - 0.213f * k, 0.715f + 0.285f * k,
                  0.072f - 0.072f * k, 0.213f - 0.213f * k, 0.715f - 0.715f * k, 0.072f + 0.928f * k};
  const M3 gain = {l.gain[0], 0, 0, 0, l.gain[1], 0, 0, 0, l.gain[2]};
  M3 m;
  mul(hue, gain, m); mul(sat, m, m);
  float off = 0.5f * (1 - l.contrast) + l.brightness;
  for (int i = 0; i < 3; i++) { for (int j = 0; j < 3; j++) out[j * 4 + i] = m[i * 3 + j] * l.contrast; out[12 + i] = off; out[i * 4 + 3] = 0; }
  out[15] = 1;
}

// ---------- GPU ----------
const char* LAYER_VS = R"(attribute vec2 a_pos; attribute vec2 a_uv; uniform mat3 u_m; varying vec2 v_uv;
void main() { vec3 q = u_m * vec3(a_pos, 1.0); v_uv = a_uv; gl_Position = vec4(q.xy, 0.0, q.z); }
)";
const char* LAYER_FS = R"(varying vec2 v_uv;
uniform sampler2D u_tex; uniform sampler2D u_mask;
uniform vec3 u_c1; uniform vec3 u_c2; uniform vec2 u_dir;
uniform mat4 u_cm; uniform float u_ig; uniform float u_alpha; uniform vec3 u_grid;
vec3 source(vec2 st) {
#if SRC == 0
  vec2 g = abs(fract(st * 8.0 + 0.5) - 0.5);
  vec3 c = u_c1 * (0.35 + 0.25 * mod(floor(st.x * 8.0) + floor(st.y * 8.0), 2.0));
  if (st.y > 0.42 && st.y < 0.58 && st.x > 0.1 && st.x < 0.9) {
    float k = floor((st.x - 0.1) / 0.1);
    c = vec3(1.0 - mod(floor(k / 2.0), 2.0), 1.0 - floor(k / 4.0), 1.0 - mod(k, 2.0));
  }
  float r = length(st - 0.5);
  if (min(g.x, g.y) < 0.012 || abs(r - 0.4) < 0.004 || abs(st.x - st.y) < 0.003 || abs(st.x + st.y - 1.0) < 0.003) c = vec3(1.0);
  return c;
#elif SRC == 1
  return u_c1;
#elif SRC == 2
  return mix(u_c1, u_c2, clamp(dot(st - 0.5, u_dir) + 0.5, 0.0, 1.0));
#elif SRC == 3
  return texture2D(u_tex, st).bgr;
#else
  return texture2D(u_tex, st).rgb;
#endif
}
void main() {
  vec3 c = (u_cm * vec4(source(v_uv), 1.0)).rgb;
  c = pow(clamp(c, 0.0, 1.0), vec3(u_ig));
  float a = u_alpha * texture2D(u_mask, v_uv).r;
#if SRC == 4
  a *= texture2D(u_tex, v_uv).a;
#endif
  if (u_grid.z > 0.5) {
    vec2 g = abs(fract(v_uv * u_grid.xy + 0.5) - 0.5) / u_grid.xy;
    if (min(g.x, g.y) < 0.002 || min(v_uv.x, v_uv.y) < 0.004 || max(v_uv.x, v_uv.y) > 0.996) { c = vec3(1.0, 0.85, 0.1); a = 1.0; }
  }
  gl_FragColor = vec4(c * a, a);
}
)";
const char* MASK_VS = R"(attribute vec2 a_pos; varying vec2 v_uv;
void main() { v_uv = a_pos; gl_Position = vec4(a_pos * 2.0 - 1.0, 0.0, 1.0); }
)";
// Feathered polygon: signed distance to the outline (even-odd inside test), smoothstep over the feather width.
const char* POLY_FS = R"(varying vec2 v_uv;
uniform vec2 u_p[32]; uniform vec2 u_last; uniform float u_n; uniform float u_feather;
void main() {
  vec2 p = v_uv, a = u_last;
  float d = 1e6, inside = 0.0;
  for (int i = 0; i < 32; i++) {
    if (float(i) < u_n) {
      vec2 b = u_p[i], e = b - a, w = p - a;
      vec2 q = w - e * clamp(dot(w, e) / max(dot(e, e), 1e-8), 0.0, 1.0);
      d = min(d, dot(q, q));
      if ((a.y > p.y) != (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = 1.0 - inside;
      a = b;
    }
  }
  float f = max(u_feather, 0.002);
  gl_FragColor = vec4(vec3(smoothstep(-0.5 * f, 0.5 * f, (inside > 0.5 ? 1.0 : -1.0) * sqrt(d))), 1.0);
}
)";
// Crop rectangle (feathered inwards), edge blending ramps (smoothstep ^ 1/gamma, so overlapping projectors sum to
// constant light) and the image mask's luminance.
const char* CROP_FS = R"(varying vec2 v_uv;
uniform vec4 u_crop; uniform float u_cf; uniform vec4 u_edge; uniform float u_eg; uniform sampler2D u_img; uniform float u_hasimg;
float ramp(float x, float w) { return w > 0.0 ? pow(smoothstep(0.0, 1.0, clamp(x / w, 0.0, 1.0)), 1.0 / u_eg) : 1.0; }
void main() {
  vec2 p = v_uv;
  float f = max(u_cf, 0.0001);
  float c = smoothstep(u_crop.x, u_crop.x + f, p.x) * smoothstep(u_crop.y, u_crop.y + f, p.y)
          * (1.0 - smoothstep(u_crop.z - f, u_crop.z, p.x)) * (1.0 - smoothstep(u_crop.w - f, u_crop.w, p.y));
  c *= ramp(p.x, u_edge.x) * ramp(1.0 - p.x, u_edge.y) * ramp(p.y, u_edge.z) * ramp(1.0 - p.y, u_edge.w);
  if (u_hasimg > 0.5) { vec3 m = texture2D(u_img, p).rgb; c *= (m.r + m.g + m.b) / 3.0; }
  gl_FragColor = vec4(vec3(c), 1.0);
}
)";

GLuint progs[NPROG], poly_prog, crop_prog, quad, white;  // white: bound to samplers a variant does not read

GLuint layer_prog(int src) {
  if (!progs[src]) { char def[32]; snprintf(def, sizeof def, "#define SRC %d\n", src); progs[src] = zgl_program(def, LAYER_VS, LAYER_FS); }
  return progs[src];
}

void tex_params(GLuint id) {
  glBindTexture(GL_TEXTURE_2D, id);
  glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR);
  glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
  glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
  glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
}

// Uploads image `id` (runtime image: video frame, camera, render-to-image; or baked asset) when its version changed.
// -1: no such image, 0: unchanged, 1: uploaded.
int sync_tex(Tex& t, int32_t id) {
  const uint32_t* px = nullptr;
  const uint8_t* rgba = nullptr;
  int32_t w, h, stride;
  uint32_t v = 1;
  if (id >= raster::DYN_BASE) { if (!raster::dyn_view(id, &px, &w, &h, &stride)) return -1; v = raster::image_version(id); }
  else if (id >= 0 && id < raster::image_count) { rgba = raster::images[id].rgba; w = raster::images[id].w; h = raster::images[id].h; stride = w; }
  else return -1;
  if (t.id && t.image == id && t.version == v) return 0;
  if (!t.id) { glGenTextures(1, &t.id); tex_params(t.id); }
  glBindTexture(GL_TEXTURE_2D, t.id);
  glPixelStorei(GL_UNPACK_ALIGNMENT, 4);
  const void* data = rgba ? (const void*)rgba : (const void*)px;
  if (w != t.w || h != t.h) glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA, w, h, 0, GL_RGBA, GL_UNSIGNED_BYTE, stride == w ? data : nullptr);
  else if (stride == w) glTexSubImage2D(GL_TEXTURE_2D, 0, 0, 0, w, h, GL_RGBA, GL_UNSIGNED_BYTE, data);
  if (stride != w)  // GLES2 has no UNPACK_ROW_LENGTH
    for (int32_t y = 0; y < h; y++) glTexSubImage2D(GL_TEXTURE_2D, 0, 0, y, w, 1, GL_RGBA, GL_UNSIGNED_BYTE, px + (size_t)y * stride);
  t.image = id; t.version = v; t.w = w; t.h = h; t.rgba = rgba != nullptr;
  return 1;
}

void draw_quad() {
  glBindBuffer(GL_ARRAY_BUFFER, quad);
  glEnableVertexAttribArray(0);
  glDisableVertexAttribArray(1);
  glVertexAttribPointer(0, 2, GL_FLOAT, GL_FALSE, 0, nullptr);
  glDrawArrays(GL_TRIANGLE_STRIP, 0, 4);
}

void build_mask(Layer& l) {
  if (!l.mfbo) {
    glGenTextures(1, &l.mtex.id);
    tex_params(l.mtex.id);
    glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA, MASK_PX, MASK_PX, 0, GL_RGBA, GL_UNSIGNED_BYTE, nullptr);
    glGenFramebuffers(1, &l.mfbo);
    glBindFramebuffer(GL_FRAMEBUFFER, l.mfbo);
    glFramebufferTexture2D(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_TEXTURE_2D, l.mtex.id, 0);
  }
  glBindFramebuffer(GL_FRAMEBUFFER, l.mfbo);
  glViewport(0, 0, MASK_PX, MASK_PX);
  bool include = false;
  for (const Mask& m : l.masks) include |= m.n >= 3 && m.invert < 0.5f;
  const float bg = include ? 0.f : 1.f;
  glClearColor(bg, bg, bg, 1);
  glClear(GL_COLOR_BUFFER_BIT);
  glEnable(GL_BLEND);
  glUseProgram(poly_prog);
  // includes are united (screen), then excludes cut out (multiply by 1 - coverage)
  for (int pass = 0; pass < 2; pass++)
    for (const Mask& m : l.masks) {
      if (m.n < 3 || (m.invert >= 0.5f) != (pass == 1)) continue;
      if (pass == 0) glBlendFunc(GL_ONE_MINUS_DST_COLOR, GL_ONE);
      else glBlendFunc(GL_ZERO, GL_ONE_MINUS_SRC_COLOR);
      glUniform2fv(glGetUniformLocation(poly_prog, "u_p"), m.n, m.pts);
      glUniform2f(glGetUniformLocation(poly_prog, "u_last"), m.pts[m.n * 2 - 2], m.pts[m.n * 2 - 1]);
      glUniform1f(glGetUniformLocation(poly_prog, "u_n"), (float)m.n);
      glUniform1f(glGetUniformLocation(poly_prog, "u_feather"), m.feather);
      draw_quad();
    }
  glBlendFunc(GL_ZERO, GL_SRC_COLOR);
  glUseProgram(crop_prog);
  glUniform4f(glGetUniformLocation(crop_prog, "u_crop"), l.crop[0], l.crop[1], l.crop[2], l.crop[3]);
  glUniform1f(glGetUniformLocation(crop_prog, "u_cf"), l.crop[4]);
  glUniform4f(glGetUniformLocation(crop_prog, "u_edge"), l.edge[0], l.edge[1], l.edge[2], l.edge[3]);
  glUniform1f(glGetUniformLocation(crop_prog, "u_eg"), l.edge[4] > 0.1f ? l.edge[4] : 1.f);
  glActiveTexture(GL_TEXTURE0);
  bool img = l.maskimage >= 0 && l.mimg.id && l.mimg.image == l.maskimage;
  glBindTexture(GL_TEXTURE_2D, img ? l.mimg.id : white);
  glUniform1i(glGetUniformLocation(crop_prog, "u_img"), 0);
  glUniform1f(glGetUniformLocation(crop_prog, "u_hasimg"), img ? 1.f : 0.f);
  draw_quad();
  l.mask_dirty = false;
}

void draw(int32_t w, int32_t h) {
  if (!quad) {
    static const float q[] = {0, 0, 1, 0, 0, 1, 1, 1};
    glGenBuffers(1, &quad);
    glBindBuffer(GL_ARRAY_BUFFER, quad);
    glBufferData(GL_ARRAY_BUFFER, sizeof q, q, GL_STATIC_DRAW);
    poly_prog = zgl_program("", MASK_VS, POLY_FS);
    crop_prog = zgl_program("", MASK_VS, CROP_FS);
    const uint32_t px = 0xFFFFFFFF;
    glGenTextures(1, &white);
    tex_params(white);
    glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA, 1, 1, 0, GL_RGBA, GL_UNSIGNED_BYTE, &px);
  }
  if (h > 0 && fabsf((float)w / h - aspect) > 1e-3f) { aspect = (float)w / h; for (int i = 0; i < nl; i++) L[i].geom_dirty = true; }
  for (int i = 0; i < nl; i++) {
    Layer& l = L[i];
    if (l.visible < 0.5f || l.opacity <= 0) continue;
    if (!l.vbo || l.geom_dirty) tessellate(l);
    if (l.maskimage >= 0 && sync_tex(l.mimg, l.maskimage) > 0) l.mask_dirty = true;
    if (!l.mfbo || l.mask_dirty) { build_mask(l); glBindFramebuffer(GL_FRAMEBUFFER, 0); glViewport(0, 0, w, h); }
    int src = l.source;
    if (src == IMAGE) src = sync_tex(l.tex, l.image) < 0 ? PATTERN : l.tex.rgba ? BAKED : IMAGE;  // missing image: test pattern
    GLuint p = layer_prog(src);
    if (!p) continue;
    glUseProgram(p);
    float m[9], cm[16];
    layer_matrix(l, m);
    color_matrix(l, cm);
    glUniformMatrix3fv(glGetUniformLocation(p, "u_m"), 1, GL_FALSE, m);
    glUniformMatrix4fv(glGetUniformLocation(p, "u_cm"), 1, GL_FALSE, cm);
    glUniform1f(glGetUniformLocation(p, "u_ig"), 1.f / (l.gamma > 0.01f ? l.gamma : 0.01f));
    glUniform1f(glGetUniformLocation(p, "u_alpha"), l.opacity > 1 ? 1 : l.opacity);
    glUniform3f(glGetUniformLocation(p, "u_c1"), l.color[0], l.color[1], l.color[2]);
    glUniform3f(glGetUniformLocation(p, "u_c2"), l.color2[0], l.color2[1], l.color2[2]);
    float a = l.angle * 3.14159265f / 180;
    glUniform2f(glGetUniformLocation(p, "u_dir"), cosf(a), sinf(a));
    glUniform3f(glGetUniformLocation(p, "u_grid"), (float)(l.cols - 1), (float)(l.rows - 1), (l.grid > 0.5f || i == selected) ? 1.f : 0.f);
    glActiveTexture(GL_TEXTURE0);
    glBindTexture(GL_TEXTURE_2D, src >= IMAGE ? l.tex.id : white);
    glUniform1i(glGetUniformLocation(p, "u_tex"), 0);
    glActiveTexture(GL_TEXTURE1);
    glBindTexture(GL_TEXTURE_2D, l.mtex.id);
    glUniform1i(glGetUniformLocation(p, "u_mask"), 1);
    glActiveTexture(GL_TEXTURE0);
    glEnable(GL_BLEND);  // premultiplied output
    if (l.blend == ADD) glBlendFunc(GL_ONE, GL_ONE);
    else if (l.blend == MULTIPLY) glBlendFunc(GL_DST_COLOR, GL_ONE_MINUS_SRC_ALPHA);
    else if (l.blend == SCREEN) glBlendFunc(GL_ONE, GL_ONE_MINUS_SRC_COLOR);
    else glBlendFunc(GL_ONE, GL_ONE_MINUS_SRC_ALPHA);
    glBindBuffer(GL_ARRAY_BUFFER, l.vbo);
    glEnableVertexAttribArray(0);
    glEnableVertexAttribArray(1);
    glVertexAttribPointer(0, 2, GL_FLOAT, GL_FALSE, 16, nullptr);
    glVertexAttribPointer(1, 2, GL_FLOAT, GL_FALSE, 16, (const void*)8);
    glDrawArrays(GL_TRIANGLES, 0, GRID * GRID * 6);
  }
  glDisableVertexAttribArray(1);
}

// ---------- commands ----------
int find(const char* s, const char* const* names, int n) { for (int i = 0; i < n; i++) if (!strcmp(s, names[i])) return i; return -1; }

int add_layer() {
  if (nl == MAX_LAYERS) return -1;
  memset(&L[nl], 0, sizeof(Layer));
  defaults(L[nl], nl);
  return nl++;
}
void remove_layer(int i) {
  free_gl(L[i]);
  memmove(&L[i], &L[i + 1], sizeof(Layer) * (nl - i - 1));
  memset(&L[--nl], 0, sizeof(Layer));
  if (selected >= nl) selected = -1;
}

bool apply(Layer& l, const char* key, const double* v, int nn, const Str* s, int ns) {
  for (const Field& f : FIELDS)
    if (!strcmp(key, f.key)) {
      float* dst = (float*)((char*)&l + f.off);
      for (int i = 0; i < nn && i < f.n; i++) dst[i] = (float)v[i];
      if (f.dirty) l.mask_dirty = true;
      return nn > 0;
    }
  if (!strcmp(key, "name")) { if (ns < 1) return false; snprintf(l.name, sizeof l.name, "%s", s[0]); return true; }
  if (!strcmp(key, "source")) {
    int k = ns > 0 ? find(s[0], SRC_NAMES, 4) : -1;
    if (k < 0) return false;
    l.source = k;
    if (nn > 0) l.image = (int)v[0];
    return true;
  }
  if (!strcmp(key, "blend")) { int k = ns > 0 ? find(s[0], BLEND_NAMES, 4) : -1; if (k < 0) return false; l.blend = k; return true; }
  if (!strcmp(key, "image")) { if (nn < 1) return false; l.image = (int)v[0]; return true; }
  if (!strcmp(key, "maskimage")) { if (nn < 1) return false; l.maskimage = (int)v[0]; l.mimg.image = -2; l.mask_dirty = true; return true; }
  if (!strcmp(key, "corner")) {
    int i = nn >= 3 ? (int)v[0] : -1;
    if (i < 0 || i > 3) return false;
    l.corners[i * 2] = (float)v[1]; l.corners[i * 2 + 1] = (float)v[2];
    return true;
  }
  if (!strcmp(key, "point")) {
    int i = nn >= 4 ? (int)v[0] : -1, j = nn >= 4 ? (int)v[1] : -1;
    if (i < 0 || j < 0 || i >= l.cols || j >= l.rows) return false;
    l.mesh[(j * l.cols + i) * 2] = (float)v[2]; l.mesh[(j * l.cols + i) * 2 + 1] = (float)v[3];
    l.geom_dirty = true;
    return true;
  }
  if (!strcmp(key, "mesh")) {  // cols rows [points]: without points the current warp is resampled on the new grid
    int c = nn >= 2 ? (int)v[0] : 0, r = nn >= 2 ? (int)v[1] : 0;
    if (c < 2 || r < 2 || c > MAX_MESH || r > MAX_MESH) return false;
    static float tmp[MAX_MESH * MAX_MESH * 2];
    for (int j = 0; j < r; j++)
      for (int i = 0; i < c; i++) {
        float* p = tmp + (j * c + i) * 2;
        int k = 2 + (j * c + i) * 2;
        if (nn >= 2 + c * r * 2) { p[0] = (float)v[k]; p[1] = (float)v[k + 1]; }
        else warp(l, (float)i / (c - 1), (float)j / (r - 1), p);
      }
    l.cols = c; l.rows = r;
    memcpy(l.mesh, tmp, sizeof(float) * c * r * 2);
    l.geom_dirty = true;
    return true;
  }
  if (!strcmp(key, "meshreset")) { identity_mesh(l); return true; }
  if (!strcmp(key, "reset")) { char name[32]; memcpy(name, l.name, sizeof name); defaults(l, (int)(&l - L)); memcpy(l.name, name, sizeof name); return true; }
  if (!strncmp(key, "mask/", 5)) {  // mask/<k> feather invert x0 y0 x1 y1 ... (fewer than 3 points removes it)
    int k = atoi(key + 5);
    if (k < 0 || k >= MAX_MASKS) return false;
    Mask& m = l.masks[k];
    m.n = nn >= 8 ? (nn - 2) / 2 : 0;
    if (m.n > MAX_PTS) m.n = MAX_PTS;
    if (m.n) { m.feather = (float)v[0]; m.invert = (float)v[1]; for (int i = 0; i < m.n * 2; i++) m.pts[i] = (float)v[2 + i]; }
    l.mask_dirty = true;
    return true;
  }
  return false;
}

bool command(const char* a, const double* v, int nn, const Str* s, int ns) {
  if (!strncmp(a, "/layer/", 7)) {
    char* end;
    long i = strtol(a + 7, &end, 10);
    if (end == a + 7 || *end != '/' || i < 0 || i >= nl) return false;
    return apply(L[i], end + 1, v, nn, s, ns);
  }
  if (!strcmp(a, "/add")) {
    int i = add_layer();
    if (i < 0) return false;
    if (ns > 0 && !apply(L[i], "source", v, nn, s, ns)) { remove_layer(i); return false; }
    if (ns > 1 && s[1][0]) snprintf(L[i].name, sizeof L[i].name, "%s", s[1]);
    return true;
  }
  if (!strcmp(a, "/remove")) { int i = nn > 0 ? (int)v[0] : -1; if (i < 0 || i >= nl) return false; remove_layer(i); return true; }
  if (!strcmp(a, "/clear")) { while (nl) remove_layer(nl - 1); return true; }
  if (!strcmp(a, "/select")) { selected = nn > 0 && v[0] >= 0 && v[0] < nl ? (int)v[0] : -1; return true; }
  if (!strcmp(a, "/move")) {  // from to (draw order: later layers are on top)
    int f = nn > 1 ? (int)v[0] : -1, t = nn > 1 ? (int)v[1] : -1;
    if (f < 0 || t < 0 || f >= nl || t >= nl) return false;
    Layer tmp = L[f];
    if (f < t) memmove(&L[f], &L[f + 1], sizeof(Layer) * (t - f));
    else memmove(&L[t + 1], &L[t], sizeof(Layer) * (f - t));
    L[t] = tmp;
    return true;
  }
  return false;
}

// ---------- JSON ----------
struct Out {
  char* p = nullptr; size_t n = 0, cap = 0;
  void put(const char* s, size_t k) { if (n + k > cap) { cap = (n + k) * 2; p = (char*)realloc(p, cap); } memcpy(p + n, s, k); n += k; }
  void str(const char* s) { put(s, strlen(s)); }
  void num(double v) { char t[32]; put(t, (size_t)(v == (double)(long long)v ? snprintf(t, sizeof t, "%lld", (long long)v) : snprintf(t, sizeof t, "%.5g", v))); }  // ids stay exact
  void nums(const float* v, int k) { for (int i = 0; i < k; i++) { if (i) put(",", 1); num(v[i]); } }
  void quoted(const char* s) { put("\"", 1); for (; *s; s++) { if (*s == '"' || *s == '\\') put("\\", 1); if ((unsigned char)*s >= 0x20) put(s, 1); } put("\"", 1); }
  void key(const char* k) { str(",\""); str(k); str("\":["); }
};

void layer_json(Out& o, const Layer& l) {
  o.str("{\"name\":["); o.quoted(l.name); o.str("],\"source\":["); o.quoted(SRC_NAMES[l.source]); o.str("]");
  o.key("image"); o.num(l.image); o.str("]");
  o.key("blend"); o.quoted(BLEND_NAMES[l.blend]); o.str("]");
  for (const Field& f : FIELDS) { o.key(f.key); o.nums((const float*)((const char*)&l + f.off), f.n); o.str("]"); }
  o.key("mesh"); o.num(l.cols); o.str(","); o.num(l.rows); o.str(","); o.nums(l.mesh, l.cols * l.rows * 2); o.str("]");
  o.key("maskimage"); o.num(l.maskimage); o.str("]");
  for (int k = 0; k < MAX_MASKS; k++) {
    const Mask& m = l.masks[k];
    if (m.n < 3) continue;
    char key[16];
    snprintf(key, sizeof key, "mask/%d", k);
    o.key(key); o.num(m.feather); o.str(","); o.num(m.invert); o.str(","); o.nums(m.pts, m.n * 2); o.str("]");
  }
  o.str("}");
}

// Minimal reader for this shape: {"layers":[{"key":[number|string|bool, ...], ...}, ...], other keys skipped}.
struct J {
  const char* s; const char* e;
  void sp() { while (s < e && (*s == ' ' || *s == '\n' || *s == '\r' || *s == '\t')) s++; }
  bool eat(char c) { sp(); if (s < e && *s == c) { s++; return true; } return false; }
  bool str(char* out, int cap) {
    if (!eat('"')) return false;
    int n = 0;
    while (s < e && *s != '"') {
      char c = *s++;
      if (c == '\\' && s < e) { c = *s++; if (c == 'n') c = '\n'; else if (c == 't') c = '\t'; else if (c == 'u') { s += e - s < 4 ? e - s : 4; c = '?'; } }
      if (n < cap - 1) out[n++] = c;
    }
    out[n] = 0;
    return s < e && *s++ == '"';
  }
  bool skip() {
    sp();
    if (s >= e) return false;
    if (*s == '"') { char t[2]; return str(t, 2); }
    if (*s == '[' || *s == '{') {
      const bool obj = *s == '{';
      const char close = obj ? '}' : ']';
      s++;
      if (eat(close)) return true;
      do { char t[2]; if (obj && (!str(t, 2) || !eat(':'))) return false; if (!skip()) return false; } while (eat(','));
      return eat(close);
    }
    const char* b = s;
    while (s < e && !strchr(",]} \n\r\t", *s)) s++;
    return s > b;
  }
  bool layer(bool dry) {
    if (!eat('{')) return false;
    int li = dry ? 0 : add_layer();
    if (li < 0) return false;
    if (eat('}')) return true;
    static double v[MAX_ARGS];
    Str sv[MAX_STRS];
    do {
      char key[32];
      if (!str(key, sizeof key) || !eat(':') || !eat('[')) return false;
      int nn = 0, ns = 0;
      if (!eat(']')) {
        do {
          sp();
          if (s < e && *s == '"') { Str t; if (!str(t, sizeof t)) return false; if (ns < MAX_STRS) memcpy(sv[ns++], t, sizeof t); }
          else if (e - s >= 4 && !strncmp(s, "true", 4)) { s += 4; if (nn < MAX_ARGS) v[nn++] = 1; }
          else if (e - s >= 5 && !strncmp(s, "false", 5)) { s += 5; if (nn < MAX_ARGS) v[nn++] = 0; }
          else { char* end; double x = strtod(s, &end); if (end == s) return false; s = end; if (nn < MAX_ARGS) v[nn++] = x; }
        } while (eat(','));
        if (!eat(']')) return false;
      }
      if (!dry) apply(L[li], key, v, nn, sv, ns);  // unknown keys are ignored (forward compatible)
    } while (eat(','));
    return eat('}');
  }
  bool doc(bool dry) {
    if (!eat('{')) return false;
    if (eat('}')) return true;
    do {
      char key[32];
      if (!str(key, sizeof key) || !eat(':')) return false;
      if (strcmp(key, "layers")) { if (!skip()) return false; continue; }
      if (!eat('[')) return false;
      if (eat(']')) continue;
      do { if (!layer(dry)) return false; } while (eat(','));
      if (!eat(']')) return false;
    } while (eat(','));
    return eat('}');
  }
};

zrt::String take(Out& o) { zrt::String r = zrt::String::from(o.p ? o.p : "", (uint32_t)o.n); free(o.p); return r; }

struct Mapping : NativeMapping {
  bool command(zrt::String address, zrt::Array<double> numbers, zrt::Array<zrt::String> strings) override {
    char a[128];
    snprintf(a, sizeof a, "%.*s", (int)address.bytes(), address.ptr());
    static double v[MAX_ARGS];
    Str s[MAX_STRS];
    int nn = numbers.a ? numbers.length() : 0, ns = strings.a ? strings.length() : 0;
    if (nn > MAX_ARGS) nn = MAX_ARGS;
    if (ns > MAX_STRS) ns = MAX_STRS;
    for (int i = 0; i < nn; i++) v[i] = numbers.get(i);
    for (int i = 0; i < ns; i++) { zrt::String x = strings.get(i); snprintf(s[i], sizeof s[i], "%.*s", (int)x.bytes(), x.ptr()); }
    return ::command(a, v, nn, s, ns);
  }
  zrt::String toJson() override {
    Out o;
    o.str("{\"version\":1,\"layers\":[");
    for (int i = 0; i < nl; i++) { if (i) o.str(",\n"); layer_json(o, L[i]); }
    o.str("]}\n");
    return take(o);
  }
  bool fromJson(zrt::String json) override {
    char* buf = (char*)malloc(json.bytes() + 1);  // NUL-terminated for strtod
    memcpy(buf, json.ptr(), json.bytes());
    buf[json.bytes()] = 0;
    J dry{buf, buf + json.bytes()};
    bool ok = dry.doc(true);
    if (ok) { ::command("/clear", nullptr, 0, nullptr, 0); J j{buf, buf + json.bytes()}; j.doc(false); }
    free(buf);
    return ok;
  }
  zrt::String layerJson(int32_t i) override {
    Out o;
    if (i >= 0 && i < nl) layer_json(o, L[i]); else o.str("{}");
    return take(o);
  }
  zrt::String info() override {
    char t[96];
    int n = snprintf(t, sizeof t, "{\"layers\":%d,\"selected\":%d,\"aspect\":%.5g}", nl, selected, aspect);
    return zrt::String::from(t, (uint32_t)n);
  }
  int32_t layerCount() override { return nl; }
};
}  // namespace

NativeMapping* zinc_create_Mapping() {
  static Mapping m;
  m.rc = zrt::IMMORTAL;
  zgl_layers = draw;
  return &m;
}
