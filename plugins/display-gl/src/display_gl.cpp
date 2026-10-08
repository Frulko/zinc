// display-gl: GPU screen driver (HalDisplay). Every frame: GPU layers (zgl_layers, e.g. zinc:mapping), then the
// software UI framebuffer as an overlay texture (only damaged rows are uploaded); pixels equal to the key colour
// are transparent. The backend (sdl.cpp on macOS, kms.cpp on Raspberry Pi) owns the context and input.
#include "hal.h"
#include "zgl.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#ifndef ZP_DISPLAY_GL_KEY
#define ZP_DISPLAY_GL_KEY 0
#endif
// renderer: "cpu" (software UI, uploaded as a texture: the default), "gl" (the command lists are replayed by
// gl_renderer.cpp) or "auto" (gl, else cpu). zinc.json: "display": { "driver": "gl", "renderer": "gl" }; ZINC_RENDERER overrides.
#ifndef ZP_DISPLAY_GL_RENDERER
#define ZP_DISPLAY_GL_RENDERER "cpu"
#endif

// backend
bool zgl_backend_init(const HalConfig* cfg);
void zgl_backend_size(int32_t* w, int32_t* h);  // drawable pixels
void zgl_backend_swap();
void zgl_backend_poll(HalInput* in, int32_t w, int32_t h);  // buttons, pointer (logical), touch, quit
void zgl_backend_shutdown();

extern "C" void (*zgl_layers)(int32_t, int32_t) = nullptr;

static int32_t W, H;
static uint32_t* fb;
static GLuint overlay, prog, quad;
static long frames_left = -1;  // ZINC_FRAMES / ZINC_SHOT, as in hal_sdl
static const char* shot_path;
static int glr_state;          // GPU renderer: 0 not decided yet (first frame), 1 on, -1 off
static GLuint glr_tex;
static bool cpu_stats;         // ZINC_GL_STATS: CPU time of the software raster, to compare with the GPU submission
static double cpu_us;
static long cpu_n;

extern "C" void zgl_logical_size(int32_t* w, int32_t* h) { *w = W; *h = H; }

extern "C" GLuint zgl_program(const char* defines, const char* vs, const char* fs) {
#ifdef __APPLE__
  static const char* pre_vs = "#version 150\n#define attribute in\n#define varying out\n";
  static const char* pre_fs = "#version 150\n#define varying in\n#define texture2D texture\nout vec4 zgl_color;\n#define gl_FragColor zgl_color\n";
#else
  static const char* pre_vs = "#version 100\n";
  static const char* pre_fs = "#version 100\n#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\n";
#endif
  GLuint p = glCreateProgram();
  const char* src[2][3] = {{pre_vs, defines, vs}, {pre_fs, defines, fs}};
  for (int i = 0; i < 2; i++) {
    GLuint s = glCreateShader(i ? GL_FRAGMENT_SHADER : GL_VERTEX_SHADER);
    glShaderSource(s, 3, src[i], nullptr);
    glCompileShader(s);
    GLint ok = 0;
    glGetShaderiv(s, GL_COMPILE_STATUS, &ok);
    if (!ok) { char log[1024]; glGetShaderInfoLog(s, sizeof log, nullptr, log); fprintf(stderr, "display-gl: shader: %s\n", log); glDeleteShader(s); glDeleteProgram(p); return 0; }
    glAttachShader(p, s);
    glDeleteShader(s);
  }
  glBindAttribLocation(p, 0, "a_pos");
  glBindAttribLocation(p, 1, "a_uv");
  glLinkProgram(p);
  GLint ok = 0;
  glGetProgramiv(p, GL_LINK_STATUS, &ok);
  if (!ok) { char log[1024]; glGetProgramInfoLog(p, sizeof log, nullptr, log); fprintf(stderr, "display-gl: link: %s\n", log); glDeleteProgram(p); return 0; }
  return p;
}

static const char* OVL_VS = "attribute vec2 a_pos; varying vec2 v_uv;\n"
  "void main() { v_uv = vec2(a_pos.x, 1.0 - a_pos.y); gl_Position = vec4(a_pos * 2.0 - 1.0, 0.0, 1.0); }\n";
// Texture bytes are B,G,R,0 (0x00RRGGBB little endian), hence .bgr.
static const char* OVL_FS = "varying vec2 v_uv; uniform sampler2D u_tex; uniform vec4 u_key; uniform float u_bgr;\n"
  "void main() { vec4 t = texture2D(u_tex, v_uv); vec3 c = u_bgr > 0.5 ? t.bgr : t.rgb; float a = (u_key.a > 0.5 && distance(c, u_key.rgb) < 0.01) ? 0.0 : 1.0;\n"
  "  gl_FragColor = vec4(c * a, a); }\n";

#include "gl_renderer.cpp"

/** First frame: which renderer (option / ZINC_RENDERER), and the GPU one is set up now that the surface size is known. */
static void choose_renderer(const HalFrame* f) {
  const char* r = getenv("ZINC_RENDERER");
  if (!r || !*r) r = ZP_DISPLAY_GL_RENDERER;
  bool gl = !strcmp(r, "gl"), autor = !strcmp(r, "auto");
  glr_state = -1;
  if (!gl && !autor) return;
  if (!f->frames) { fprintf(stderr, "display-gl: renderer %s: the runtime gives no command lists, using cpu\n", r); return; }
  if (!glr::init(f->w, f->h)) { fprintf(stderr, "display-gl: renderer %s: GL setup failed, using cpu\n", r); return; }
  glr_tex = glr::texture();
  glr_state = 1;
}

static int init(const HalConfig* cfg) {
  W = cfg->width; H = cfg->height;
  if (!zgl_backend_init(cfg)) return 0;
#ifdef __APPLE__
  GLuint vao;  // core profile: one VAO bound for the whole program
  glGenVertexArrays(1, &vao);
  glBindVertexArray(vao);
#endif
  fb = (uint32_t*)calloc((size_t)W * H, 4);
  glGenTextures(1, &overlay);
  glBindTexture(GL_TEXTURE_2D, overlay);
  glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR);
  glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
  glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
  glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
  glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA, W, H, 0, GL_RGBA, GL_UNSIGNED_BYTE, fb);
  prog = zgl_program("", OVL_VS, OVL_FS);
  if (!prog) return 0;
  static const float q[] = {0, 0, 1, 0, 0, 1, 1, 1};
  glGenBuffers(1, &quad);
  glBindBuffer(GL_ARRAY_BUFFER, quad);
  glBufferData(GL_ARRAY_BUFFER, sizeof q, q, GL_STATIC_DRAW);
  cpu_stats = getenv("ZINC_GL_STATS") != nullptr;
  if (const char* f = getenv("ZINC_FRAMES")) frames_left = atol(f);
  shot_path = getenv("ZINC_SHOT");
  return 1;
}

// glReadPixels rows are bottom-up, like BMP.
static void save_bmp(const char* path, int32_t w, int32_t h) {
  uint8_t* px = (uint8_t*)malloc((size_t)w * h * 4);
  glPixelStorei(GL_PACK_ALIGNMENT, 1);
  glReadPixels(0, 0, w, h, GL_RGBA, GL_UNSIGNED_BYTE, px);
  FILE* f = fopen(path, "wb");
  if (f) {
    int32_t row = (w * 3 + 3) & ~3;
    uint8_t hd[54] = {'B', 'M'};
    auto put = [&](int o, uint32_t v) { hd[o] = v & 255; hd[o + 1] = (v >> 8) & 255; hd[o + 2] = (v >> 16) & 255; hd[o + 3] = v >> 24; };
    put(2, 54 + row * h); put(10, 54); put(14, 40); put(18, w); put(22, h); hd[26] = 1; hd[28] = 24;
    fwrite(hd, 1, 54, f);
    uint8_t* line = (uint8_t*)calloc(row, 1);
    for (int32_t y = 0; y < h; y++) {
      const uint8_t* s = px + (size_t)y * w * 4;
      for (int32_t x = 0; x < w; x++) { line[x * 3] = s[x * 4 + 2]; line[x * 3 + 1] = s[x * 4 + 1]; line[x * 3 + 2] = s[x * 4]; }
      fwrite(line, 1, row, f);
    }
    free(line);
    fclose(f);
  }
  free(px);
}

// ZINC_GL_TIME=1: glFinish after the replay and after the present pass, to see where the GPU time goes (serialises the
// pipeline: the sum is longer than a normal frame).
static double t_rep, t_pas, t_swp; static long t_n;
static void present(const HalFrame* f) {
  static const bool tm = getenv("ZINC_GL_TIME") != nullptr;
  double ta = tm ? glr::now_us() : 0, tb = ta;
  if (!glr_state) choose_renderer(f);
  glBindTexture(GL_TEXTURE_2D, overlay);
  bool damaged = f->y1 > f->y0 && f->x1 > f->x0;
  bool direct = false;
  int32_t dw, dh;
  zgl_backend_size(&dw, &dh);
  if (glr_state > 0) {
    // GPU: replay the command lists. Either straight into the window (when the surface is the screen and nothing draws
    // under it, and most of it changed: the window content is undefined after a swap, so the whole frame is drawn, and
    // the intermediate texture and the copy pass are skipped), or into the surface texture, then copied to the window.
    static const int mode = getenv("ZINC_GL_DIRECT") ? atoi(getenv("ZINC_GL_DIRECT")) : 2;   // 0 texture, 1 direct, 2 adaptive
    static bool tex_ok = false;   // the texture holds the last frame
    bool can = dw == W && dh == H && !zgl_layers;
    int64_t area = damaged ? (int64_t)(f->x1 - f->x0) * (f->y1 - f->y0) : 0;
    direct = can && damaged && (mode == 1 || (mode == 2 && area * 2 >= (int64_t)W * H));
    if (direct) { glr::frame(f, true, glr::Rect{0, 0, W, H}); tex_ok = false; }
    else if (damaged || !tex_ok) {
      glr::frame(f, false, tex_ok && damaged ? glr::Rect{f->x0, f->y0, f->x1, f->y1} : glr::Rect{0, 0, W, H});
      tex_ok = true;
    } else glr::idle();
    if (tm) { glFinish(); tb = glr::now_us(); t_rep += tb - ta; }
  } else if (damaged) {
    double t0 = cpu_stats ? glr::now_us() : 0;
    f->render(fb + (size_t)f->y0 * W, f->y0, f->y1);
    if (cpu_stats) { cpu_us += glr::now_us() - t0; cpu_n++; }
    glPixelStorei(GL_UNPACK_ALIGNMENT, 4);
    glTexSubImage2D(GL_TEXTURE_2D, 0, 0, f->y0, W, f->y1 - f->y0, GL_RGBA, GL_UNSIGNED_BYTE, fb + (size_t)f->y0 * W);
  }
  glBindFramebuffer(GL_FRAMEBUFFER, 0);
  glViewport(0, 0, dw, dh);
  glDisable(GL_SCISSOR_TEST);
  if (direct) {   // already in the window
    glDisable(GL_BLEND);
    if (shot_path && frames_left == 0) save_bmp(shot_path, dw, dh);
    double tc = 0;
    if (tm) { glFinish(); tc = glr::now_us(); t_pas += tc - tb; }
    zgl_backend_swap();
    if (tm) { t_swp += glr::now_us() - tc; t_n++; }
    return;
  }
  glDisable(GL_BLEND);
  glClearColor(0, 0, 0, 1);
  glClear(GL_COLOR_BUFFER_BIT);
  if (zgl_layers) zgl_layers(dw, dh);
  glBindFramebuffer(GL_FRAMEBUFFER, 0);
  glViewport(0, 0, dw, dh);
  glUseProgram(prog);
  glActiveTexture(GL_TEXTURE0);
  glBindTexture(GL_TEXTURE_2D, glr_state > 0 ? glr_tex : overlay);
  glUniform1i(glGetUniformLocation(prog, "u_tex"), 0);
  glUniform1f(glGetUniformLocation(prog, "u_bgr"), glr_state > 0 ? 0.f : 1.f);   // software pixels are B,G,R,0
  const int32_t key = ZP_DISPLAY_GL_KEY;
  glUniform4f(glGetUniformLocation(prog, "u_key"), ((key >> 16) & 255) / 255.f, ((key >> 8) & 255) / 255.f, (key & 255) / 255.f, key < 0 ? 0.f : 1.f);
  glBindBuffer(GL_ARRAY_BUFFER, quad);
  glEnableVertexAttribArray(0);
  glDisableVertexAttribArray(1);
  glVertexAttribPointer(0, 2, GL_FLOAT, GL_FALSE, 0, nullptr);
  glEnable(GL_BLEND);
  glBlendFunc(GL_ONE, GL_ONE_MINUS_SRC_ALPHA);
  glDrawArrays(GL_TRIANGLE_STRIP, 0, 4);
  if (shot_path && frames_left == 0) save_bmp(shot_path, dw, dh);
  double tc = 0;
  if (tm) { glFinish(); tc = glr::now_us(); t_pas += tc - tb; }
  zgl_backend_swap();
  if (tm) { t_swp += glr::now_us() - tc; t_n++; }
}

static void poll(HalInput* in) {
  zgl_backend_poll(in, W, H);
  if (frames_left >= 0 && frames_left-- == 0) in->quit = 1;
}

static void shutdown() {
  if (t_n) fprintf(stderr, "display-gl time: per frame replay %.0f us (GPU done), present pass %.0f us (GPU done), swap %.0f us (%ld frames)\n", t_rep / t_n, t_pas / t_n, t_swp / t_n, t_n);
  if (glr_state > 0) glr::report();
  else if (cpu_stats && cpu_n) fprintf(stderr, "display-gl renderer cpu: %ld damaged frames, %.0f us of CPU per frame in the software raster\n", cpu_n, cpu_us / cpu_n);
  zgl_backend_shutdown();
}

static HalDisplay display = {init, present, poll, shutdown, 1, 0};  // SDL events are read in src/sdl.cpp
static int registered = (hal_display = &display, 0);
