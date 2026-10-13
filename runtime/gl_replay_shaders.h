// The GLSL sources of the GL replay (runtime/gl_replay.cpp), in the GLSL ES 1.00 dialect: display-gl and the SDL window compile them with their
// prelude (zgl_program: GLSL 1.50 core on macOS, `#version 100` on GLES 2). Included inside namespace glr by gl_replay.cpp, and by
// tests/native/gl_replay_es2.cpp, which checks them as GLSL ES 1.00 with glslang (D29's floor, the Pi 3: ZN-581).
#pragma once
// What a quad is, in a vertex's v_par.z. The fragment shader has a block per mode (FS_MODE): desktop GL compiles them all behind a ladder
// of ifs, GLES 2 one program per mode from that mode's block alone (fs_source, ZN-725).
enum Mode { FILL, BORDER_M, TEXT_M, IMAGE_RGBA, IMAGE_BGR, SOLID, RESTORE, SHADOW_M, STROKE_M, EDGE_M, CONVEX_M, RAMP_M, MODES };
static const char* VS =
  "attribute vec4 a_pos; attribute vec4 a_box; attribute vec4 a_par; attribute vec4 a_c1; attribute vec4 a_c2; attribute float a_z;\n"
  "uniform vec2 u_res; uniform float u_flip;\n"
  "varying vec4 v_pos; varying vec4 v_box; varying vec4 v_par; varying vec4 v_c1; varying vec4 v_c2;\n"
  "void main() { v_pos = a_pos; v_box = a_box; v_par = a_par; v_c1 = a_c1; v_c2 = a_c2;\n"
  "  gl_Position = vec4(a_pos.x / u_res.x * 2.0 - 1.0, (a_pos.y / u_res.y * 2.0 - 1.0) * u_flip, a_z, 1.0); }\n";  // row 0 = top, like the CPU (u_flip -1: drawn into the window)
static const char* const FS_HEAD =
  "varying vec4 v_pos; varying vec4 v_box; varying vec4 v_par; varying vec4 v_c1; varying vec4 v_c2;\n"
  "uniform sampler2D u_tex; uniform vec3 u_edge;\n"   // u_edge: the EDGE pass (side test, left side, inside); RAMP: z is the sign of |t|
  "uniform vec4 u_g0, u_g1, u_gc[8]; uniform float u_go[8];\n"   // a POLY's canvas gradient paint (ZN-590.04): (x0, y0, r0, kind), (x1, y1, r1, n), stops (rgb, alpha 0..255; offset)
  "uniform vec3 u_cv[8]; uniform float u_cvn;\n"   // a convex POLY (ZN-679): its edges as (nx, ny, c), the signed distance n.p + c positive inside
  "float sdf(vec2 p, vec2 c, vec2 h, float r) {\n"
  "  vec2 q = abs(p - c) - (h - r);\n"
  "  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }\n"
  "float cover(vec2 p, vec2 c, vec2 h, float r) { return clamp(0.5 - sdf(p, c, h, r), 0.0, 1.0); }\n"
  "float seg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; return length(pa - ba * clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0)); }\n"
  "void main() {\n"
  "  vec2 p = v_pos.xy, c = v_box.xy, h = v_box.zw;\n"
  "  float r = v_par.x, mode = v_par.z, grad = v_par.w;\n"
  "  if (mode > 15.5) { mode -= 16.0; p = v_pos.zw; }\n"   // a box drawn through a matrix (XFORM, ZN-263.01): the pixel in the box's own coordinates
  "  vec3 col = v_c1.rgb; float cov = 1.0, a = v_c1.a;\n";
// IMAGE: baked RGBA / runtime 0x00RRGGBB (grad 1: 0xAARRGGBB), times the sprite's tint in c1 (white: none, ZN-581); grad 2: premultiplied
// texels (a compressed texture, ZN-439)
static const char* const FS_IMAGE =
  "    vec4 t = texture2D(u_tex, v_pos.zw);\n"
  "    if (grad > 1.5 && t.a > 0.0) t.rgb /= t.a;\n"
  "    col = (mode < 3.5 ? t.rgb : t.bgr) * v_c1.rgb; cov = mode < 3.5 || grad > 0.5 ? t.a : 1.0;\n"
  "    if (r > 0.0) cov *= cover(p, c, h, r);\n";
// A block sets the coverage of the pixel, and its colour when that is not the vertex's.
static const char* const FS_MODE[MODES] = {
  // FILL: rounded box, gradients
  "    cov = cover(p, c, h, r);\n"
  "    if (grad > 0.5 && grad < 4.5) {\n"
  "      float t;\n"
  "      if (grad < 1.5) t = (p.y - (c.y - h.y)) / max(2.0 * h.y, 1e-6);\n"
  "      else if (grad < 2.5) t = (p.x - (c.x - h.x)) / max(2.0 * h.x, 1e-6);\n"
  "      else { vec2 d = (p - (c - h)) / max(2.0 * h, vec2(1e-6)) * 2.0 - 1.0; t = length(d); }\n"
  "      float k = floor(clamp(t * 256.0, 0.0, 256.0));\n"                         // raster.cpp lerp_color: a weight out of 256, channels rounded down
  "      col = floor((floor(v_c1.rgb * 255.0 + 0.5) * (256.0 - k) + floor(v_c2.rgb * 255.0 + 0.5) * k) / 256.0) / 255.0; }\n",
  // BORDER: ring between two boxes
  "    float bw = v_par.y;\n"
  "    cov = cover(p, c, h, r) - cover(p, c, h - bw, max(r - bw, 0.0));\n",
  // TEXT: alpha atlas
  "    cov = texture2D(u_tex, v_pos.zw).r;\n",
  FS_IMAGE, FS_IMAGE,
  // SOLID: whole pixels
  "    cov = 1.0;\n",
  // RESTORE: rounded clip corners
  "    col = texture2D(u_tex, v_pos.zw).rgb; a = 1.0 - cover(p, c, h, r); cov = 1.0;\n",
  // SHADOW: blurred rounded box
  "    float blur = v_par.y, k = clamp(1.0 - (sdf(p, c, h, r) + blur * 0.5) / (blur * 1.5), 0.0, 1.0);\n"
  "    cov = k * k * (3.0 - 2.0 * k);\n",
  // STROKE: the capsule of segment A-B (round joins and caps); the pixel is this segment's when no neighbour is nearer (ties to the
  // previous one): blended once
  "    float d = seg(p, v_pos.zw, c);\n"
  "    if ((v_c2.x > 0.5 && seg(p, v_box.zw, v_pos.zw) <= d) || (v_c2.y > 0.5 && seg(p, c, v_par.yw) < d)) discard;\n"
  "    cov = clamp(0.5 - (d - r), 0.0, 1.0);\n",
  // EDGE: the fringe of a POLY edge A-B (ZN-590.02), owned like a stroke segment; inside the fill (u_edge.z) the pixel covers 0.5 + d,
  // outside 0.5 - d; u_edge.x: only the pixels on one side (u_edge.y) of A-B
  "    float d = seg(p, v_pos.zw, c);\n"
  "    if (seg(p, v_box.zw, v_pos.zw) <= d || seg(p, c, v_par.yw) < d) discard;\n"
  "    if (u_edge.x > 0.5 && ((c.x - v_pos.z) * (p.y - v_pos.w) - (c.y - v_pos.w) * (p.x - v_pos.z) > 0.0) != (u_edge.y > 0.5)) discard;\n"
  "    cov = clamp(0.5 + (u_edge.z > 0.5 ? d : -d), 0.0, 1.0);\n",
  // CONVEX: 0.5 plus the smallest signed distance to the edges
  "    float m = 1e6;\n"
  "    for (int k = 0; k < 8; k++) if (float(k) < u_cvn) m = min(m, dot(u_cv[k].xy, p) + u_cv[k].z);\n"
  "    cov = clamp(0.5 + m, 0.0, 1.0);\n"
  "    if (cov <= 0.0) discard;\n",
  // RAMP (ZN-725): the coverage comes from the vertices, w - |t| (t in v_pos.z, w in v_pos.w): the width of a stroke's segment, the
  // fringe of a polygon's edge as a strip (u_edge.z 1: 0.5 + t, the pixels inside the fill), no distance to compute
  "    cov = clamp(v_pos.w + u_edge.z * abs(v_pos.z), 0.0, 1.0);\n",
};
// the paint of a POLY's cover and fringes and of a RECT with grad 5 (ZN-261): raster.cpp paint_at (t from the paint geometry, the stop
// interval, lerp_color's weight out of 256); kind 1 linear, 2 two circles, 3 ellipse, 4 conic, + 8 repeating
static const char* const FS_PAINT =
  "  if (u_g0.w > 0.5 && (mode > 8.5 || (mode > 4.5 && mode < 5.5) || (mode < 0.5 && grad > 4.5))) {\n"
  "    vec2 d = u_g1.xy - u_g0.xy, q = p - u_g0.xy; float t = 0.0, A0 = floor(a * 255.0 + 0.5), kind = mod(u_g0.w, 8.0);\n"
  "    if (kind < 1.5) { float l = dot(d, d); t = l > 0.0 ? dot(q, d) / l : 0.0; }\n"
  "    else if (kind > 3.5) { t = (atan(q.x, -q.y) - u_g0.z) * 0.15915494; t -= floor(t); }\n"
  "    else if (kind > 2.5) { vec2 e = vec2(u_g1.x > 0.0 ? q.x / u_g1.x : 1e9, u_g1.y > 0.0 ? q.y / u_g1.y : 1e9); t = length(e); }\n"
  "    else {\n"
  "      float dr = u_g1.z - u_g0.z, qa = dot(d, d) - dr * dr, qb = dot(q, d) + u_g0.z * dr, qc = dot(q, q) - u_g0.z * u_g0.z;\n"
  "      if (abs(qa) < 1e-4) t = qb != 0.0 ? qc / (2.0 * qb) : 0.0;\n"
  "      else {\n"
  "        float D = qb * qb - qa * qc, s = sqrt(max(D, 0.0)), t1 = (qb + s) / qa, t2 = (qb - s) / qa;\n"
  "        t = max(t1, t2);\n"
  "        if (u_g0.z + t * dr < 0.0) t = min(t1, t2);\n"
  "        if (D < 0.0 || u_g0.z + t * dr < 0.0) A0 = 0.0;\n"
  "      }\n"
  "    }\n"
  "    int n = int(u_g1.w), i = 0;\n"
  "    if (u_g0.w > 7.5) { float hi = u_go[0]; for (int k = 1; k < 8; k++) if (k == n - 1) hi = u_go[k];\n"   // repeating: t folded into [first, last)
  "      float per = hi - u_go[0]; if (per > 0.0) { float f = (t - u_go[0]) / per; t = u_go[0] + (f - floor(f)) * per; } }\n"
  "    for (int k = 0; k < 8; k++) if (k < n && t > u_go[k]) i++;\n"   // the offsets are sorted (canvas2d addColorStop)
  "    vec4 L = u_gc[0], R = u_gc[0]; float lo = 0.0, ro = 0.0;\n"
  "    for (int k = 0; k < 8; k++) { if (k == i - 1) { L = u_gc[k]; lo = u_go[k]; } if (k == i) { R = u_gc[k]; ro = u_go[k]; } }\n"
  "    if (i == 0 || i == n) { vec4 e = i == 0 ? R : L; col = e.rgb / 255.0; A0 = floor(A0 * e.a / 255.0); }\n"
  "    else {\n"
  "      float u = ro > lo ? (t - lo) / (ro - lo) : 1.0, k = floor(clamp(u * 256.0, 0.0, 256.0));\n"
  "      A0 = floor(A0 * floor(L.a + (R.a - L.a) * u) / 255.0);\n"
  "      col = floor((L.rgb * (256.0 - k) + R.rgb * k) / 256.0) / 255.0;\n"
  "    }\n"
  "    a = A0 / 255.0;\n"
  "  }\n";
// the raster's blend (raster.cpp blend): an integer alpha A = (uint32_t)(coverage * alpha), A >= 255 copies, 0 leaves the pixel, else
// (c * A + d * (255 - A)) >> 8: a premultiplied colour c * A / 256 over d * (255 - A) / 256 (GL_ONE, GL_ONE_MINUS_SRC_ALPHA with an
// alpha of (A + 1) / 256), less half a step so the framebuffer's rounding becomes the shift's truncation. Stacked translucent layers
// (hero's glows) then match the software frame instead of drifting a unit a layer (ZN-412.03). RESTORE keeps the plain mix (lerp_color).
static const char* const FS_BLEND =
  "  if (mode > 5.5 && mode < 6.5) { gl_FragColor = vec4(col * a, a); return; }\n"
  "  float A = floor(cov * floor(a * 255.0 + 0.5) + 0.001);\n"
  "  if (A >= 255.0) gl_FragColor = vec4(col, 1.0);\n"
  "  else if (A < 1.0) gl_FragColor = vec4(0.0);\n"
  "  else gl_FragColor = vec4(max(floor(col * 255.0 + 0.5) * (A / 256.0) / 255.0 - 0.499 / 255.0, 0.0), (A + 1.0) / 256.0);\n"
  "}\n";
// The lean programs (GLES 2, ZINC_GL_LEAN=1): what a square quad of one colour, a run of glyphs or an image without rounded corners needs
// and nothing else: two or three varyings in place of five vectors, no distance, no branch, a plain premultiplied blend in place of the
// raster's integer one (a unit of difference at most on a channel). On an Adreno 220 the general program takes 16 ms to fill 1024x768
// with one colour and 32 ms with an image; a program of this kind takes 2 ms (docs/reports/hardware/hp-touchpad-webos.md).
enum Lean { LEAN_SOLID, LEAN_TEXT, LEAN_IMAGE, LEAN_FILL, LEAN_RADIAL, LEAN_BORDER, LEAN_SHADOW, LEANS };
static const char* LVS =
  "attribute vec4 a_pos; attribute vec4 a_par; attribute vec4 a_c1; attribute float a_z;\n"
  "uniform vec2 u_res; uniform float u_flip;\n"
  "varying vec2 v_uv; varying vec4 v_col; varying vec2 v_k;\n"
  "void main() { v_uv = a_pos.zw; v_col = a_c1;\n"
  "  float m = a_par.z > 15.5 ? a_par.z - 16.0 : a_par.z;\n"
  "  v_k = vec2(m > 3.5 ? 1.0 : 0.0, m < 3.5 || a_par.w > 0.5 ? 1.0 : 0.0);\n"   // IMAGE: the texels are B, G, R; the texel's alpha counts
  "  gl_Position = vec4(a_pos.x / u_res.x * 2.0 - 1.0, (a_pos.y / u_res.y * 2.0 - 1.0) * u_flip, a_z, 1.0); }\n";
// The boxes (a rounded fill with its two-colour gradient, a border, a shadow): the pixel from the box's centre, the box's half size, radius
// and width or blur, and the gradient's place worked out per vertex (a linear gradient is an interpolation). Ten floats a pixel, one
// distance (two for a border), no integer blend.
static const char* LBVS =
  "attribute vec4 a_pos; attribute vec4 a_box; attribute vec4 a_par; attribute vec4 a_c1; attribute vec4 a_c2; attribute float a_z;\n"
  "uniform vec2 u_res; uniform float u_flip;\n"
  "varying vec2 v_q; varying vec4 v_h; varying vec4 v_col; varying vec4 v_c2;\n"
  "void main() { v_q = (a_par.z > 15.5 ? a_pos.zw : a_pos.xy) - a_box.xy; v_h = vec4(a_box.zw, a_par.x, a_par.y); v_col = a_c1;\n"
  "  float t = a_par.w < 0.5 ? 0.0 : a_par.w < 1.5 ? (v_q.y + a_box.w) / max(2.0 * a_box.w, 1e-6) : (v_q.x + a_box.z) / max(2.0 * a_box.z, 1e-6);\n"
  "  v_c2 = vec4(a_c2.rgb, t);\n"
  "  gl_Position = vec4(a_pos.x / u_res.x * 2.0 - 1.0, (a_pos.y / u_res.y * 2.0 - 1.0) * u_flip, a_z, 1.0); }\n";
#define LB_HEAD "varying vec2 v_q; varying vec4 v_h; varying vec4 v_col; varying vec4 v_c2;\n" \
  "float cover(vec2 h, float r) { vec2 d = abs(v_q) - (h - r); return clamp(0.5 - (length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r), 0.0, 1.0); }\n"
static const char* const LFS[LEANS] = {
  "varying vec4 v_col; void main() { gl_FragColor = vec4(v_col.rgb * v_col.a, v_col.a); }\n",
  "varying vec2 v_uv; varying vec4 v_col; uniform sampler2D u_tex;\n"
  "void main() { float a = texture2D(u_tex, v_uv).r * v_col.a; gl_FragColor = vec4(v_col.rgb * a, a); }\n",
  "varying vec2 v_uv; varying vec4 v_col; varying vec2 v_k; uniform sampler2D u_tex;\n"
  "void main() { vec4 t = texture2D(u_tex, v_uv); float a = mix(1.0, t.a, v_k.y) * v_col.a;\n"
  "  gl_FragColor = vec4(mix(t.rgb, t.bgr, v_k.x) * v_col.rgb * a, a); }\n",
  // FILL, one colour or a linear gradient
  LB_HEAD "void main() { float a = cover(v_h.xy, v_h.z) * v_col.a; gl_FragColor = vec4(mix(v_col.rgb, v_c2.rgb, clamp(v_c2.a, 0.0, 1.0)) * a, a); }\n",
  // FILL, a radial gradient
  LB_HEAD "void main() { float a = cover(v_h.xy, v_h.z) * v_col.a;\n"
  "  gl_FragColor = vec4(mix(v_col.rgb, v_c2.rgb, clamp(length(v_q / max(v_h.xy, vec2(1e-6))), 0.0, 1.0)) * a, a); }\n",
  // BORDER: the ring between two boxes
  LB_HEAD "void main() { float a = (cover(v_h.xy, v_h.z) - cover(v_h.xy - v_h.w, max(v_h.z - v_h.w, 0.0))) * v_col.a; gl_FragColor = vec4(v_col.rgb * a, a); }\n",
  // SHADOW: a blurred box
  LB_HEAD "void main() { vec2 d = abs(v_q) - (v_h.xy - v_h.z); float s = length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - v_h.z;\n"
  "  float k = clamp(1.0 - (s + v_h.w * 0.5) / (v_h.w * 1.5), 0.0, 1.0), a = k * k * (3.0 - 2.0 * k) * v_col.a; gl_FragColor = vec4(v_col.rgb * a, a); }\n",
};
/** The fragment shader of the modes of `mask` (bit m: mode m), with the paint block or not, into `out`: one mode's block alone, or the
 *  blocks behind a ladder of ifs on the vertex's mode (every mode: desktop GL). A GPU without branches runs every block of a ladder
 *  for each pixel, and its driver takes as long to build the whole ladder whatever is kept of it (100 ms on a Pi 3 at 600 MHz, 30 to
 *  66 ms for one block): there a program holds the modes it draws and nothing else. False: `out` is too small. */
static bool fs_source(unsigned mask, bool paint, char* out, size_t cap) {
  size_t n = (size_t)snprintf(out, cap, "%s", FS_HEAD);
  if ((mask & (1u << IMAGE_BGR)) && (mask & (1u << IMAGE_RGBA))) mask &= ~(1u << IMAGE_RGBA);   // one block for both images, under IMAGE_BGR's test
  int last = -1, first = -1;
  for (int m = 0; m < MODES; m++) if (mask & (1u << m)) { if (first < 0) first = m; last = m; }
  if (first == last && first >= 0 && n < cap) n += (size_t)snprintf(out + n, cap - n, "  mode = %d.0;\n  {\n%s  }\n", first, FS_MODE[first]);
  for (int m = 0; first != last && m < MODES && n < cap; m++) {
    if (!(mask & (1u << m))) continue;
    char test[32] = "";
    if (m != last) snprintf(test, sizeof test, "if (mode < %d.5) ", m);
    n += (size_t)snprintf(out + n, cap - n, "  %s%s{\n%s  }\n", m != first ? "else " : "", test, FS_MODE[m]);
  }
  if (n < cap) n += (size_t)snprintf(out + n, cap - n, "%s%s", paint ? FS_PAINT : "", FS_BLEND);
  return n < cap;
}

// The occlusion pass draws only opaque square rectangles: a program of its own, 24 bytes a rectangle (bounds, colour, depth), one instance
// each where the API has instancing (desktop GL), else four 16-byte vertices (GLES 2), instead of four 60-byte vertices (ZN-412.01)
static const char* SVS =
  "uniform vec2 u_res; uniform float u_flip; varying vec4 v_col;\n"
  "#ifdef INSTANCED\n"
  "attribute vec4 a_rect; attribute vec4 a_col; attribute float a_z;\n"
  "void main() { vec2 k = vec2(float(gl_VertexID & 1), float(gl_VertexID >> 1)); vec2 p = mix(a_rect.xy, a_rect.zw, k);\n"
  "#else\n"
  "attribute vec2 a_pos; attribute vec4 a_col; attribute float a_z;\n"
  "void main() { vec2 p = a_pos;\n"
  "#endif\n"
  "  v_col = a_col; gl_Position = vec4(p.x / u_res.x * 2.0 - 1.0, (p.y / u_res.y * 2.0 - 1.0) * u_flip, a_z, 1.0); }\n";
static const char* SFS = "varying vec4 v_col; void main() { gl_FragColor = v_col; }\n";
// POLY's stencil pass: triangles that count the winding, no colour
static const char* FVS = "attribute vec2 a_pos; uniform vec2 u_res; uniform float u_flip;\n"
  "void main() { gl_Position = vec4(a_pos.x / u_res.x * 2.0 - 1.0, (a_pos.y / u_res.y * 2.0 - 1.0) * u_flip, 0.0, 1.0); }\n";
static const char* FFS = "void main() { gl_FragColor = vec4(0.0); }\n";
