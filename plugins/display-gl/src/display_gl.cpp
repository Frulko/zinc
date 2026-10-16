// display-gl: GPU screen driver (HalDisplay). Every frame: GPU layers (zgl_layers, e.g. zinc:mapping), then the
// software UI framebuffer as an overlay texture (only damaged rows are uploaded); pixels equal to the key colour
// are transparent. The backend (sdl.cpp on macOS, kms.cpp on Raspberry Pi) owns the context and input.
#include "hal.h"
#include "zgl.h"
#include "render_bands.h"
#include <stdio.h>
#include <unistd.h>
#include <stdlib.h>
#include <string.h>

#ifndef ZP_DISPLAY_GL_KEY
#define ZP_DISPLAY_GL_KEY 0
#endif
// renderer: "cpu" (software UI, uploaded as a texture: the default), "gl" (the command lists are replayed by
// runtime/gl_replay.cpp) or "auto" (gl, else cpu). zinc.json: "display": { "driver": "gl", "renderer": "gl" }; ZINC_RENDERER overrides.
#ifndef ZP_DISPLAY_GL_RENDERER
#define ZP_DISPLAY_GL_RENDERER "cpu"
#endif

// backend
bool zgl_backend_init(const HalConfig* cfg);
int32_t zgl_backend_scale();                    // surface pixels per logical pixel: zoom x density in a desktop window, 1 on a panel
void zgl_backend_size(int32_t* w, int32_t* h);  // drawable pixels
void zgl_backend_native(int32_t* w, int32_t* h);  // before the init: the screen's own size for a program that names none; a window leaves them alone
void zgl_backend_swap();
void zgl_backend_poll(HalInput* in, int32_t w, int32_t h);  // buttons, pointer (logical), touch, quit
// The surface's logical size when the system changed it (a system keyboard, a rotation); a backend of a fixed surface leaves this weak one.
extern "C" __attribute__((weak)) void zgl_backend_surface(int32_t*, int32_t*) {}
// Where the surface's picture goes on the screen (top-left rectangle in screen pixels) and its quarter turns clockwise, when not the whole
// screen upright (webOS: the system keyboard's band, the program turned with the device); a backend that does not place leaves this weak one.
extern "C" __attribute__((weak)) int zgl_backend_place(int32_t*, int32_t*, int32_t*, int32_t*, int32_t*) { return 0; }
// The largest surface a backend will ask for (its turns, its keyboard): the GPU target is allocated once at that size; 0 when it never changes.
extern "C" __attribute__((weak)) void zgl_backend_reserve(int32_t*, int32_t*) {}
// The device's features (HalDisplay::device); a backend without them leaves this weak one.
extern "C" __attribute__((weak)) const char* zgl_backend_device(const char*, const char*) { return nullptr; }
// The context's EGL extensions for the GL replay's capability record (gl_caps.h); a backend without EGL leaves this weak one.
extern "C" __attribute__((weak)) const char* zgl_backend_egl() { return nullptr; }
void zgl_backend_shutdown();

extern "C" void (*zgl_layers)(int32_t, int32_t) = nullptr;

static int32_t W, H;          // logical size (input, zgl_logical_size)
static int32_t K = 1, PW, PH;  // the frames' pixels: W x H times K (Retina)
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
  // one vertex layout for every program: the replay draws a batch with several of them (gl_replay.cpp, A_BOX...)
  static const char* const attrs[] = {"a_pos", "a_uv", "a_box", "a_par", "a_c1", "a_c2", "a_z"};
  for (GLuint i = 0; i < 7; i++) glBindAttribLocation(p, i, attrs[i]);
  glLinkProgram(p);
  GLint ok = 0;
  glGetProgramiv(p, GL_LINK_STATUS, &ok);
  if (!ok) { char log[1024]; glGetProgramInfoLog(p, sizeof log, nullptr, log); fprintf(stderr, "display-gl: link: %s\n", log); glDeleteProgram(p); return 0; }
  return p;
}

// u_rot: cos and sin of the picture's turn on the screen (zgl_backend_place)
static const char* OVL_VS = "attribute vec2 a_pos; varying vec2 v_uv; uniform vec2 u_rot; uniform vec2 u_uv;\n"
  "void main() { v_uv = vec2(a_pos.x, 1.0 - a_pos.y) * u_uv; vec2 p = a_pos * 2.0 - 1.0; gl_Position = vec4(p.x * u_rot.x - p.y * u_rot.y, p.x * u_rot.y + p.y * u_rot.x, 0.0, 1.0); }\n";
// Texture bytes are B,G,R,0 (0x00RRGGBB little endian), hence .bgr.
static const char* OVL_FS = "varying vec2 v_uv; uniform sampler2D u_tex; uniform vec4 u_key; uniform float u_bgr;\n"
  "void main() { vec4 t = texture2D(u_tex, v_uv); vec3 c = u_bgr > 0.5 ? t.bgr : t.rgb; float a = (u_key.a > 0.5 && distance(c, u_key.rgb) < 0.01) ? 0.0 : 1.0;\n"
  "  gl_FragColor = vec4(c * a, a); }\n";

#include "gl_replay.cpp"   // runtime/gl_replay.cpp: the GL replay, shared with the SDL window (ZN-412.02)

/** First frame: which renderer (option / ZINC_RENDERER), and the GPU one is set up now that the surface size is known. */
static void choose_renderer(const HalFrame* f) {
  const char* r = getenv("ZINC_RENDERER");
  if (!r || !*r) r = ZP_DISPLAY_GL_RENDERER;
  bool gl = !strcmp(r, "gl"), autor = !strcmp(r, "auto");
  glr_state = -1;
  if (!gl && !autor) return;
  if (!f->frames) { fprintf(stderr, "display-gl: renderer %s: the runtime gives no command lists, using cpu\n", r); return; }
  int32_t rw = 0, rh = 0;
  zgl_backend_reserve(&rw, &rh);
  glr::reserve(rw, rh);
  if (!glr::init(f->w, f->h)) { fprintf(stderr, "display-gl: renderer %s: GL setup failed, using cpu\n", r); return; }
  glr_tex = glr::texture();
  glr_state = 1;
  zrt::gfx::gpu_strokes = true;   // strokes are recorded as polylines from the next frame on, drawn by the replay (ZN-590.01)
  zrt::gfx::shaders_drawn = true; glr::shader_source = zrt::gfx::shaderSource;   // and the programs' shaders (ZN-746)
}

static int init(const HalConfig* cfg) {
  W = cfg->width; H = cfg->height;
  if (!zgl_backend_init(cfg)) return 0;
  glr::egl_extensions = zgl_backend_egl();
  glr::probe();   // the context's capability record, read by every renderer (ZINC_GL_INFO prints it)
  K = zgl_backend_scale(); PW = W * K; PH = H * K;
#ifdef __APPLE__
  GLuint vao;  // core profile: one VAO bound for the whole program
  glGenVertexArrays(1, &vao);
  glBindVertexArray(vao);
#endif
  fb = (uint32_t*)calloc((size_t)PW * PH, 4);
  glGenTextures(1, &overlay);
  glBindTexture(GL_TEXTURE_2D, overlay);
  glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR);
  glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
  glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
  glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
  glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA, PW, PH, 0, GL_RGBA, GL_UNSIGNED_BYTE, fb);
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

// ZINC_SHOT (a test, a capture): every frame is composed into this framebuffer of the surface's own pixels (PW x PH) in place of the
// window, and the screenshot reads it, so its size depends neither on the window nor on the screen (a small screen scales the window down
// to fit; macOS clamps a window to the screen). The window only lends its context; the frame is blitted to it to be seen. Colour only:
// the replay's depth and stencil passes run in glr's own framebuffer (no direct replay while shooting), and no layer uses depth.
// 0 when not shooting, or when the GPU cannot allocate the target (said once): the window is read, as before.
static GLuint shot_fb, shot_tex;
static int32_t shot_w, shot_h;
static GLuint shot_target() {
  static bool failed;
  if (!shot_path || failed) return 0;
  if (shot_fb && shot_w == PW && shot_h == PH) return shot_fb;
  const GLint max = glr::caps.max_texture;
  if (!shot_fb) { glGenTextures(1, &shot_tex); glGenFramebuffers(1, &shot_fb); }
  bool ok = PW <= max && PH <= max;
  if (ok) {
    glBindTexture(GL_TEXTURE_2D, shot_tex);
    glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA, PW, PH, 0, GL_RGBA, GL_UNSIGNED_BYTE, nullptr);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_NEAREST);   // never sampled; NEAREST keeps it complete without mipmaps
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_NEAREST);
    glBindFramebuffer(GL_FRAMEBUFFER, shot_fb);
    glFramebufferTexture2D(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_TEXTURE_2D, shot_tex, 0);
    ok = glCheckFramebufferStatus(GL_FRAMEBUFFER) == GL_FRAMEBUFFER_COMPLETE;
    glBindFramebuffer(GL_FRAMEBUFFER, 0);
  }
  if (!ok) {
    fprintf(stderr, "display-gl: no %dx%d offscreen target for the screenshot (GL limit %d): it reads the window, whose size may differ\n", PW, PH, max);
    failed = true;
    return 0;
  }
  shot_w = PW; shot_h = PH;
  return shot_fb;
}
static void show_shot(GLuint screen, int32_t ww, int32_t wh) {
#if GLR_CORE   // GL 3.2 has the blit; on GLES 2 the window stays black during a screenshot run
  if (!screen) return;
  glBindFramebuffer(GL_READ_FRAMEBUFFER, screen);
  glBindFramebuffer(GL_DRAW_FRAMEBUFFER, 0);
  glBlitFramebuffer(0, 0, PW, PH, 0, 0, ww, wh, GL_COLOR_BUFFER_BIT, GL_LINEAR);
  glBindFramebuffer(GL_FRAMEBUFFER, 0);
#else
  (void)screen; (void)ww; (void)wh;
#endif
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
static double t_rep, t_pas, t_swp, t_gpu; static long t_n;
#ifdef __APPLE__
static GLuint t_query;   // GL_TIME_ELAPSED of the replay and the present pass: the GPU's own time, without the driver's submission (ZN-412.01)
#endif
static void time_report() {   // also every 120 frames: a program the system stops (webOS) never reaches its exit
  if (t_n) fprintf(stderr, "display-gl time: per frame replay %.0f us (GPU done), present pass %.0f us (GPU done), swap %.0f us, GPU %.0f us (timer query) (%ld frames)\n", t_rep / t_n, t_pas / t_n, t_swp / t_n, t_gpu / t_n, t_n);
}
static void gpu_time(bool tm) {
#ifdef __APPLE__
  if (!tm) return;
  glEndQuery(GL_TIME_ELAPSED);
  GLuint64 ns = 0;
  glGetQueryObjectui64v(t_query, GL_QUERY_RESULT, &ns);   // the frame was finished above: no wait
  t_gpu += ns / 1000.0;
#else
  (void)tm;
#endif
}
// ZINC_GL_STATS: where the time of the first frame goes, the one a user waits for at start
static void first_mark(const char* what) {
  static double t0; static int n;
  if (!cpu_stats || n > 3) return;
  const double t = glr::now_us();
  if (n++) fprintf(stderr, "display-gl first frame: %s %.0f ms\n", what, (t - t0) / 1e3);
  t0 = t;
}
// The runtime follows zgl_backend_surface: a frame of another size reallocates the surface's buffer, texture and GPU target.
static void follow_size(const HalFrame* f) {
  if (f->w == PW && f->h == PH) return;   // the frame's buffer is physical
  PW = f->w; PH = f->h; W = PW / K; H = PH / K;
  if (glr_state <= 0) {   // the software frame's buffer and texture (the GPU renderer keeps its own target, glr::resize)
    free(fb);
    fb = (uint32_t*)calloc((size_t)PW * PH, 4);
    glBindTexture(GL_TEXTURE_2D, overlay);
    glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA, PW, PH, 0, GL_RGBA, GL_UNSIGNED_BYTE, fb);
  }
  if (glr_state > 0) {
    const bool ok = glr::resize(PW, PH);
    glr_tex = glr::texture();
    if (FILE* lf = access("/tmp/zinc/glinfo", F_OK) == 0 ? fopen("/tmp/zinc/glinfo.log", "a") : nullptr) { fprintf(lf, "follow_size: %dx%d glr::resize %s, GL error 0x%x\n", PW, PH, ok ? "complete" : "INCOMPLETE", glGetError()); fclose(lf); }
  }
}
static void surface(int32_t* w, int32_t* h) { zgl_backend_surface(w, h); }

static void present(const HalFrame* f) {
  follow_size(f);
  static const bool tm = getenv("ZINC_GL_TIME") != nullptr;
  double ta = tm ? glr::now_us() : 0, tb = ta;
#ifdef __APPLE__
  if (tm) { if (!t_query) glGenQueries(1, &t_query); glBeginQuery(GL_TIME_ELAPSED, t_query); }
#endif
  first_mark("");
  if (!glr_state) choose_renderer(f);
  first_mark("renderer setup");
  const GLuint screen = shot_target();   // the window (0), or the screenshot's own target, upright and unplaced (before the bind below: it binds its texture)
  glBindTexture(GL_TEXTURE_2D, overlay);
  bool damaged = f->y1 > f->y0 && f->x1 > f->x0;
  bool direct = false;
  int32_t ww, wh, dw, dh;
  zgl_backend_size(&ww, &wh);
  dw = screen ? PW : ww; dh = screen ? PH : wh;
  int32_t px = 0, py = 0, pw = dw, ph = dh, turn = 0;
  const bool placed = !screen && zgl_backend_place(&px, &py, &pw, &ph, &turn) != 0;
  {   // each new size or placement, while /tmp/zinc/glinfo exists (the tablet's diagnosis)
    static int last[9] = {0};
    const int now[9] = {PW, PH, f->w, f->h, px, py, pw, ph, turn};
    if (memcmp(now, last, sizeof now) != 0) {
      memcpy(last, now, sizeof now);
      if (FILE* lf = access("/tmp/zinc/glinfo", F_OK) == 0 ? fopen("/tmp/zinc/glinfo.log", "a") : nullptr) {
        fprintf(lf, "present: surface %dx%d frame %dx%d screen %dx%d place %d,%d %dx%d turn %d renderer %d damaged %d\n", PW, PH, f->w, f->h, dw, dh, px, py, pw, ph, turn, glr_state, f->y1 > f->y0);
        fclose(lf);
      }
    }
  }
  if (glr_state > 0) {
    // GPU: replay the command lists. Either straight into the window (when the surface is the screen and nothing draws
    // under it, and most of it changed: the window content is undefined after a swap, so the whole frame is drawn, and
    // the intermediate texture and the copy pass are skipped), or into the surface texture, then copied to the window.
    static const int mode = getenv("ZINC_GL_DIRECT") ? atoi(getenv("ZINC_GL_DIRECT")) : 2;   // 0 texture, 1 direct, 2 adaptive
    static bool tex_ok = false;   // the texture holds the last frame
    bool can = !screen && dw == PW && dh == PH && !zgl_layers && !placed;
    int64_t area = damaged ? (int64_t)(f->x1 - f->x0) * (f->y1 - f->y0) : 0;
    direct = can && damaged && (mode == 1 || (mode == 2 && area * 2 >= (int64_t)PW * PH));
    if (direct) { glr::frame(f, true, glr::Rect{0, 0, PW, PH}); tex_ok = false; }
    else if (damaged || !tex_ok) {
      glr::frame(f, false, tex_ok && damaged ? glr::Rect{f->x0, f->y0, f->x1, f->y1} : glr::Rect{0, 0, PW, PH});
      tex_ok = true;
    } else { glr::idle(); glr::warm(); }   // a program the next frames may need, built while nothing changes (ZN-741)
    first_mark("replay");
    if (tm) { glFinish(); tb = glr::now_us(); t_rep += tb - ta; }
  } else if (damaged) {
    double t0 = cpu_stats ? glr::now_us() : 0;
    // the software frame, in bands on every core (as display-fbdev: the same pixels as one call)
    static zbands::Pool& pool = *([] { auto* p = new zbands::Pool; p->init(); return p; })();
    pool.run(f->y0, f->y1, 16, [](void* ctx, int32_t a, int32_t b) { ((const HalFrame*)ctx)->render(fb + (size_t)a * PW, a, b); }, (void*)f);
    if (cpu_stats) { cpu_us += glr::now_us() - t0; cpu_n++; }
    glPixelStorei(GL_UNPACK_ALIGNMENT, 4);
    glTexSubImage2D(GL_TEXTURE_2D, 0, 0, f->y0, PW, f->y1 - f->y0, GL_RGBA, GL_UNSIGNED_BYTE, fb + (size_t)f->y0 * PW);
  }
  glBindFramebuffer(GL_FRAMEBUFFER, screen);
  glViewport(0, 0, dw, dh);
  glDisable(GL_SCISSOR_TEST);
  if (direct) {   // already in the window
    glDisable(GL_BLEND);
    if (shot_path && frames_left == 0) save_bmp(shot_path, dw, dh);
    double tc = 0;
    if (tm) { glFinish(); tc = glr::now_us(); t_pas += tc - tb; }
    gpu_time(tm);
    zgl_backend_swap();
    first_mark("swap");
    if (tm) { t_swp += glr::now_us() - tc; if (++t_n % 120 == 0) { time_report(); if (glr_state > 0) glr::report(); } }
    return;
  }
  glDisable(GL_BLEND);
  glClearColor(0, 0, 0, 1);
  glClear(GL_COLOR_BUFFER_BIT);
  if (zgl_layers) zgl_layers(dw, dh);
  glBindFramebuffer(GL_FRAMEBUFFER, screen);
  if (placed) glViewport(px, dh - py - ph, pw, ph); else glViewport(0, 0, dw, dh);
  glUseProgram(prog);
  static const float kCos[] = {1, 0, -1, 0}, kSin[] = {0, -1, 0, 1};   // clockwise on the screen: minus a quarter turn each
  glUniform2f(glGetUniformLocation(prog, "u_rot"), kCos[turn & 3], kSin[turn & 3]);
  int32_t tw = PW, th = PH;
  if (glr_state > 0) glr::texture_size(&tw, &th);   // the frame fills the first PW x PH of the target
  glUniform2f(glGetUniformLocation(prog, "u_uv"), tw > 0 ? (float)PW / tw : 1.f, th > 0 ? (float)PH / th : 1.f);
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
  {   // the diagnosis of a placed or resized frame: a pixel of the surface's texture and of the screen, once per placement
    static int seen = -1;
    const int key = PW * 7 + PH * 13 + px * 3 + py * 5 + turn;
    if (key != seen && access("/tmp/zinc/glinfo", F_OK) == 0) {
      seen = key;
      unsigned char s[4] = {0}, t[4] = {0};
      glReadPixels(dw / 2, dh / 2, 1, 1, GL_RGBA, GL_UNSIGNED_BYTE, s);
      if (glr_state > 0) {
        GLuint fb2 = 0; glGenFramebuffers(1, &fb2); glBindFramebuffer(GL_FRAMEBUFFER, fb2);
        glFramebufferTexture2D(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_TEXTURE_2D, glr_tex, 0);
        glReadPixels(PW / 2, PH / 2, 1, 1, GL_RGBA, GL_UNSIGNED_BYTE, t);   // the frame's centre (it fills the first PW x PH)
        glBindFramebuffer(GL_FRAMEBUFFER, screen); glDeleteFramebuffers(1, &fb2);
      }
      if (FILE* lf = fopen("/tmp/zinc/glinfo.log", "a")) { fprintf(lf, "pixels: screen centre %d,%d,%d texture centre %d,%d,%d, GL error 0x%x\n", s[0], s[1], s[2], t[0], t[1], t[2], glGetError()); fclose(lf); }
    }
  }
  if (shot_path && frames_left == 0) save_bmp(shot_path, dw, dh);
  show_shot(screen, ww, wh);
  double tc = 0;
  if (tm) { glFinish(); tc = glr::now_us(); t_pas += tc - tb; }
  gpu_time(tm);
  zgl_backend_swap();
  first_mark("swap");
  if (tm) { t_swp += glr::now_us() - tc; if (++t_n % 120 == 0) { time_report(); if (glr_state > 0) glr::report(); } }
}

static void poll(HalInput* in) {
  zgl_backend_poll(in, W, H);
  if (frames_left >= 0 && frames_left-- == 0) in->quit = 1;
}

static void shutdown() {
  time_report();
  if (glr_state > 0) glr::report();
  else if (cpu_stats && cpu_n) fprintf(stderr, "display-gl renderer cpu: %ld damaged frames, %.0f us of CPU per frame in the software raster\n", cpu_n, cpu_us / cpu_n);
  zgl_backend_shutdown();
}

static int32_t scale() { return K; }
static HalDisplay display = {init, present, poll, shutdown, 1, 0, scale, nullptr, zgl_backend_native, zgl_backend_device, surface};  // SDL events are read in src/sdl.cpp
static int registered = (hal_display = &display, 0);
