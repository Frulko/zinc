// SDL3 HAL for macos and linux (TGT-MAC-02, D-05): window, renderer, keyboard/mouse input.
#include "hal.h"
#include "hal_window.h"
#include <SDL3/SDL.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <condition_variable>
#include <mutex>
#include <atomic>
#include <thread>

extern "C" { static void start_workers(); }   // parallel rasterization (hal_present); defined inside the extern "C" block below (GCC wants the same linkage)
static SDL_Window* win;
static SDL_Renderer* ren;
static SDL_Texture* tex;
static uint32_t* fb;
static int W = 320, H = 240;
static int K = 1, PW = 320, PH = 240;  // physical pixels per logical pixel (Retina x window magnification)
static int zoom = 1;
// Window behaviour (zinc.json targets.<id>: resize "fill" | "letterbox", fullscreen, kiosk; ZINC_RESIZE / ZINC_FULLSCREEN /
// ZINC_KIOSK override). fill: the logical surface follows the window (responsive layouts); letterbox: fixed surface, scaled.
static bool fill = false, kiosk = false;
// zinc.json targets.<id>.pixelScale "logical" (ZINC_PIXEL_SCALE): the surface is rendered at 1x and the window magnifies it with nearest filtering,
// for pixel art (a 320x240 program at zoom 2 on a Retina screen draws 76,800 pixels instead of 1.2 M); "density", the default, renders at the zoom
// times the screen density so text and shapes stay sharp (ZN-425).
static bool logical_px = false;
static bool resize_fixed = false;     // zinc.json resize / ZINC_RESIZE chose the mode: what the program asks (hal_set_resize) does not change it
static bool resize_pending = false;   // the mode changed: the surface follows at the next poll, between frames
// ZN-233: window properties from zinc.json app.window, the close veto and file drops (runtime/include/hal_window.h)
static int (*close_handler)(void) = nullptr;
static void (*drop_handler)(const char*, int) = nullptr;
extern "C" void hal_set_close_handler(int (*h)(void)) { close_handler = h; }
extern "C" void hal_set_drop_handler(void (*h)(const char*, int)) { drop_handler = h; }

#ifdef __APPLE__
extern "C" __attribute__((weak)) void hal_sdl_transparent_layers(void*) {}   // the real one is targets/macos/hal_cocoa.mm; this weak no-op keeps the prototype's CMake build (which does not link it) working
#endif
static HalWindowConfig wcfg;   // ZN-233 / ZN-249: window properties from zinc.json app.window
static bool wcfg_set = false;
extern "C" void hal_set_window_config(const HalWindowConfig* c) { wcfg = *c; wcfg_set = true; }
static uint32_t* tbuf;         // transparent windows: the rows being uploaded with their alpha
static size_t tbuf_n;
static bool surface_ok;        // the surface of the current size is allocated
static bool shown;             // the main window is created hidden and shown by its first present, so it never appears blank (ZN-446)

#ifdef ZN_HAL_GL
// The window presents with OpenGL and replays the frame's command lists on the GPU (ZN-412.02, runtime/gl_replay.cpp): no software raster
// per frame. The SDL_Renderer path stays for ZINC_RENDERER=cpu, transparent windows, display plugins, and when no hardware GL comes up
// (none, llvmpipe, Apple's software renderer); screenshots and tests keep the software raster of the runtime. macOS links OpenGL.framework; Linux loads
// its functions through SDL (ZN-412.06).
#ifdef __APPLE__
#include <OpenGL/gl3.h>
static bool zgl_load() { return true; }
#else
// Linux (ZN-412.06): glad's types and names with GLAD_API_CALL static, a private table of this file filled through SDL_GL_GetProcAddress. Nothing is
// exported, so the WebGL module's own glad (libzn_webgl, which resolves symbols against zinc) cannot interpose, and zinc does not link libGL.
#define GLAD_API_CALL static
#include <glad/gl.h>
#define ZGL_FUNCS(X) X(ActiveTexture) X(AttachShader) X(BindAttribLocation) X(BindBuffer) X(BindFramebuffer) X(BindRenderbuffer) X(BindTexture) \
  X(BindVertexArray) X(BlendFunc) X(BufferData) X(CheckFramebufferStatus) X(Clear) X(ClearColor) X(ClearDepth) X(CompileShader) X(CopyTexSubImage2D) \
  X(CreateProgram) X(CreateShader) X(DeleteProgram) X(DeleteShader) X(DeleteTextures) X(DepthFunc) X(DepthMask) X(Disable) X(DisableVertexAttribArray) \
  X(DrawArrays) X(DrawArraysInstanced) X(DrawElements) X(Enable) X(EnableVertexAttribArray) X(FramebufferRenderbuffer) X(FramebufferTexture2D) \
  X(GenBuffers) X(GenFramebuffers) X(GenRenderbuffers) X(GenTextures) X(GenVertexArrays) X(GetAttribLocation) X(GetFramebufferAttachmentParameteriv) \
  X(GetIntegerv) X(GetProgramiv) X(GetShaderInfoLog) X(GetShaderiv) X(GetString) X(GetUniformLocation) X(LinkProgram) X(PixelStorei) \
  X(RenderbufferStorage) X(Scissor) X(ShaderSource) X(TexImage2D) X(TexParameteri) X(TexSubImage2D) X(Uniform1f) X(Uniform1i) X(Uniform2f) X(UseProgram) \
  X(VertexAttribDivisor) X(VertexAttribPointer) X(Viewport)
/** After the context is current: false when a function is missing (the window then stays on SDL_Renderer). */
static bool zgl_load() {
  bool ok = true;
#define ZGL_LOAD(n) ok = (glad_gl##n = (decltype(glad_gl##n))SDL_GL_GetProcAddress("gl" #n)) != nullptr && ok;
  ZGL_FUNCS(ZGL_LOAD)
#undef ZGL_LOAD
  return ok;
}
#endif
#include "zrt_raster.h"
static GLuint zgl_program(const char* defines, const char* vs, const char* fs) {   // GLSL ES 1.00 sources as GLSL 1.50 core
  static const char* pre_vs = "#version 150\n#define attribute in\n#define varying out\n";
  static const char* pre_fs = "#version 150\n#define varying in\n#define texture2D texture\nout vec4 zgl_color;\n#define gl_FragColor zgl_color\n";
  GLuint p = glCreateProgram();
  const char* src[2][3] = {{pre_vs, defines, vs}, {pre_fs, defines, fs}};
  for (int i = 0; i < 2; i++) {
    GLuint sh = glCreateShader(i ? GL_FRAGMENT_SHADER : GL_VERTEX_SHADER);
    glShaderSource(sh, 3, src[i], nullptr);
    glCompileShader(sh);
    GLint ok = 0;
    glGetShaderiv(sh, GL_COMPILE_STATUS, &ok);
    if (!ok) { char log[1024]; glGetShaderInfoLog(sh, sizeof log, nullptr, log); fprintf(stderr, "zinc: window GL shader: %s\n", log); glDeleteShader(sh); glDeleteProgram(p); return 0; }
    glAttachShader(p, sh);
    glDeleteShader(sh);
  }
  // one vertex layout for every program: the replay draws a batch with several of them (gl_replay.cpp, A_BOX...)
  static const char* const attrs[] = {"a_pos", "a_uv", "a_box", "a_par", "a_c1", "a_c2", "a_z"};
  for (GLuint i = 0; i < 7; i++) glBindAttribLocation(p, i, attrs[i]);
  glLinkProgram(p);
  GLint ok = 0;
  glGetProgramiv(p, GL_LINK_STATUS, &ok);
  if (!ok) { glDeleteProgram(p); return 0; }
  return p;
}
#define GLR_CORE 1
#include "gl_replay.cpp"
static SDL_GLContext glctx;
static bool gl_on, glr_ok, glr_made, glr_stale, gl_tex_ok;   // the window presents with GL; the replay works; it was set up; its size is stale; its texture holds the last frame
static GLuint gl_prog, gl_quad, gl_upload, gl_vao;
static GLint gl_u_tex, gl_u_bgr;
// the present pass: a texture of the surface over the window (rows top first); u_bgr for the software rows (bytes B, G, R)
static const char* kPresentVS = "attribute vec2 a_pos; varying vec2 v_uv; void main() { v_uv = vec2(a_pos.x, 1.0 - a_pos.y); gl_Position = vec4(a_pos * 2.0 - 1.0, 0.0, 1.0); }\n";
static const char* kPresentFS = "varying vec2 v_uv; uniform sampler2D u_tex; uniform float u_bgr;\n"
  "void main() { vec4 t = texture2D(u_tex, v_uv); gl_FragColor = vec4(u_bgr > 0.5 ? t.bgr : t.rgb, 1.0); }\n";
/** Creates the window with an OpenGL context; false (nothing left behind) without a hardware context, unless ZINC_RENDERER=gl. */
static bool gl_window(const char* title, int ww, int wh) {
  const char* rr = getenv("ZINC_RENDERER");
  const bool force = rr && !strcmp(rr, "gl");
  SDL_GL_SetAttribute(SDL_GL_CONTEXT_MAJOR_VERSION, 3);
  SDL_GL_SetAttribute(SDL_GL_CONTEXT_MINOR_VERSION, 2);
  SDL_GL_SetAttribute(SDL_GL_CONTEXT_PROFILE_MASK, SDL_GL_CONTEXT_PROFILE_CORE);
  SDL_GL_SetAttribute(SDL_GL_CONTEXT_FLAGS, SDL_GL_CONTEXT_FORWARD_COMPATIBLE_FLAG);
  SDL_GL_SetAttribute(SDL_GL_DOUBLEBUFFER, 1);
  SDL_GL_SetAttribute(SDL_GL_DEPTH_SIZE, 24);   // the replay's occlusion pass
  SDL_GL_SetAttribute(SDL_GL_STENCIL_SIZE, 8);  // POLY fills on the GPU when the replay draws straight into the window (ZN-590.02)
  SDL_PropertiesID props = SDL_CreateProperties();
  SDL_SetStringProperty(props, SDL_PROP_WINDOW_CREATE_TITLE_STRING, wcfg_set && wcfg.title[0] ? wcfg.title : title);
  SDL_SetNumberProperty(props, SDL_PROP_WINDOW_CREATE_WIDTH_NUMBER, ww);
  SDL_SetNumberProperty(props, SDL_PROP_WINDOW_CREATE_HEIGHT_NUMBER, wh);
  SDL_SetBooleanProperty(props, SDL_PROP_WINDOW_CREATE_RESIZABLE_BOOLEAN, !(wcfg_set && wcfg.not_resizable));
  SDL_SetBooleanProperty(props, SDL_PROP_WINDOW_CREATE_HIGH_PIXEL_DENSITY_BOOLEAN, true);
  SDL_SetBooleanProperty(props, SDL_PROP_WINDOW_CREATE_BORDERLESS_BOOLEAN, wcfg_set && wcfg.borderless != 0);
  SDL_SetBooleanProperty(props, SDL_PROP_WINDOW_CREATE_ALWAYS_ON_TOP_BOOLEAN, wcfg_set && wcfg.always_on_top != 0);
  if (wcfg_set && wcfg.has_position) { SDL_SetNumberProperty(props, SDL_PROP_WINDOW_CREATE_X_NUMBER, wcfg.x); SDL_SetNumberProperty(props, SDL_PROP_WINDOW_CREATE_Y_NUMBER, wcfg.y); }
  SDL_SetBooleanProperty(props, SDL_PROP_WINDOW_CREATE_OPENGL_BOOLEAN, true);
  SDL_SetBooleanProperty(props, SDL_PROP_WINDOW_CREATE_HIDDEN_BOOLEAN, true);   // shown once a frame is in it: no blank window (ZN-446)
  win = SDL_CreateWindowWithProperties(props);
  SDL_DestroyProperties(props);
  if (!win) return false;
  glctx = SDL_GL_CreateContext(win);
  const char* r = glctx && SDL_GL_MakeCurrent(win, glctx) && zgl_load() ? (const char*)glGetString(GL_RENDERER) : nullptr;
  const bool soft = r && (strstr(r, "llvmpipe") || strstr(r, "softpipe") || strstr(r, "Software"));
  if (r && (!soft || force)) {
    glGenVertexArrays(1, &gl_vao);   // core profile: one VAO bound for the whole program
    glBindVertexArray(gl_vao);
    gl_prog = zgl_program("", kPresentVS, kPresentFS);
  }
  if (!r || (soft && !force) || !gl_prog) {
    if (glctx) SDL_GL_DestroyContext(glctx);
    glctx = nullptr;
    SDL_DestroyWindow(win);
    win = nullptr;
    return false;
  }
  gl_u_tex = glGetUniformLocation(gl_prog, "u_tex"); gl_u_bgr = glGetUniformLocation(gl_prog, "u_bgr");
  static const float q[] = {0, 0, 1, 0, 0, 1, 1, 1};
  glGenBuffers(1, &gl_quad);
  glBindBuffer(GL_ARRAY_BUFFER, gl_quad);
  glBufferData(GL_ARRAY_BUFFER, sizeof q, q, GL_STATIC_DRAW);
  glGenTextures(1, &gl_upload);
  glBindTexture(GL_TEXTURE_2D, gl_upload);
  glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR); glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
  glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE); glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
  if (wcfg_set && (wcfg.min_w > 0 || wcfg.min_h > 0)) SDL_SetWindowMinimumSize(win, wcfg.min_w, wcfg.min_h);
  SDL_GL_SetSwapInterval(getenv("ZINC_VSYNC") && atoi(getenv("ZINC_VSYNC")) == 0 ? 0 : 1);   // shown by its first present (hal_present)
  if (getenv("ZINC_GL_STATS")) fprintf(stderr, "zinc: window renderer gl (%s, %s)\n", r, (const char*)glGetString(GL_VERSION));   // macOS: "4.1 Metal - ...", Apple's GL on Metal
  return true;
}
// the surface's place in the window, letterboxed like SDL_LOGICAL_PRESENTATION_LETTERBOX: origin and scale in window points
static void letterbox(float* ox, float* oy, float* sc) {
  int ww = 1, wh = 1;
  SDL_GetWindowSize(win, &ww, &wh);
  const float s = SDL_min((float)ww / PW, (float)wh / PH);
  *sc = s > 0 ? s : 1; *ox = (ww - PW * *sc) * 0.5f; *oy = (wh - PH * *sc) * 0.5f;
}
#endif
// window points <-> surface pixels (the SDL_Renderer's logical presentation, or the GL window's letterbox)
static void from_window(float wx, float wy, float* sx, float* sy) {
  if (ren) { SDL_RenderCoordinatesFromWindow(ren, wx, wy, sx, sy); return; }
#ifdef ZN_HAL_GL
  float ox, oy, sc;
  letterbox(&ox, &oy, &sc);
  *sx = (wx - ox) / sc; *sy = (wy - oy) / sc;
#else
  *sx = wx; *sy = wy;
#endif
}
static void to_window(float sx, float sy, float* wx, float* wy) {
  if (ren) { SDL_RenderCoordinatesToWindow(ren, sx, sy, wx, wy); return; }
#ifdef ZN_HAL_GL
  float ox, oy, sc;
  letterbox(&ox, &oy, &sc);
  *wx = sx * sc + ox; *wy = sy * sc + oy;
#else
  *wx = sx; *wy = sy;
#endif
}

#ifdef ZN_HAL_GL
// Other GL contexts live in the process (zinc:gl's WebGL, zinc:3d's GPU renderer) and leave theirs current: the window's is made current around its
// own GL work and theirs put back, so their record of what is current stays true (ZN-563: the window swapped zinc:3d's hidden context, without vsync).
struct GlCurrent {
  SDL_Window* w = SDL_GL_GetCurrentWindow();
  SDL_GLContext c = SDL_GL_GetCurrentContext();
  GlCurrent() { if (c != glctx) SDL_GL_MakeCurrent(win, glctx); }
  ~GlCurrent() { if (c && c != glctx) SDL_GL_MakeCurrent(w, c); }
};
#endif

static void alloc_surface() {
  surface_ok = true;
#ifdef ZN_HAL_GL
  if (gl_on) {   // the software rows (frames without command lists) and the replay follow the surface
    GlCurrent cur;
    free(fb);
    fb = (uint32_t*)calloc((size_t)PW * PH, 4);
    glBindTexture(GL_TEXTURE_2D, gl_upload);
    glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA, PW, PH, 0, GL_RGBA, GL_UNSIGNED_BYTE, fb);
    glr_stale = true;   // the replay follows at the next present: set up once the program's fonts and images are installed
    gl_tex_ok = false;
    return;
  }
#endif
  if (tex) SDL_DestroyTexture(tex);
  free(fb);
  SDL_SetRenderLogicalPresentation(ren, PW, PH, SDL_LOGICAL_PRESENTATION_LETTERBOX);
  // ARGB8888 even for an opaque window: SDL's Metal renderer has no XRGB texture, so an XRGB one was converted at every SDL_UpdateTexture (3.6% of
  // the main thread at 200k balls with ZINC_RENDERER=cpu, ZN-426); blending off makes the alpha byte, which the raster leaves at 0, irrelevant
  tex = SDL_CreateTexture(ren, SDL_PIXELFORMAT_ARGB8888, SDL_TEXTUREACCESS_STREAMING, PW, PH);
  SDL_SetTextureBlendMode(tex, wcfg_set && wcfg.transparent ? SDL_BLENDMODE_BLEND : SDL_BLENDMODE_NONE);
  SDL_SetTextureScaleMode(tex, logical_px ? SDL_SCALEMODE_NEAREST : SDL_SCALEMODE_LINEAR);
  fb = (uint32_t*)calloc((size_t)PW * PH, 4);
}
/** Recomputes the surface from the window: fill mode follows the window size; both follow the screen density. */
static void apply_size() {
  int ww = W * zoom, wh = H * zoom;
  SDL_GetWindowSize(win, &ww, &wh);
  int nw = W, nh = H;
  if (fill) { nw = ww / zoom > 0 ? ww / zoom : 1; nh = wh / zoom > 0 ? wh / zoom : 1; }
  float density = SDL_GetWindowPixelDensity(win);
  int k = logical_px ? 1 : (int)(zoom * (density > 0 ? density : 1) + 0.5f);
  if (const char* ks = getenv("ZINC_SCALE")) k = atoi(ks);
  if (k < 1) k = 1;
  while (k > 1 && (long)nw * k * nh * k > 3840L * 2400L) k--;
  if (nw == W && nh == H && k == K && surface_ok) return;
  W = nw; H = nh; K = k; PW = W * K; PH = H * K;
  alloc_surface();
}
// macOS blocks the event loop during a live resize: redraw from the event watcher so the layout follows the mouse
static bool SDLCALL watch(void*, SDL_Event* e) {
  if (e->type == SDL_EVENT_WINDOW_EXPOSED || e->type == SDL_EVENT_WINDOW_PIXEL_SIZE_CHANGED) { apply_size(); zrt_redraw(); }
  return true;
}
static void set_fullscreen(bool on) { SDL_SetWindowFullscreen(win, on); }
static bool gfx_on;
static bool quit;
static bool escape_app;   // zinc:ui handles Escape (hal_escape_by_app)
// Test hooks: ZINC_FRAMES=n quits after n frames (ZINC_SHOT captures are made by the runtime, runtime/gfx.cpp).
static long frames_left = -1;
// Deterministic runs (ZINC_DETERMINISTIC / ZINC_RECORD / ZINC_REPLAY): fixed surface size, private clipboard.
static bool det = false;
// ZN-608: the program follows the window (zinc:gfx onResize, so every zinc:ui app): fill, unless the project fixed the mode, the run is
// deterministic or a device panel is emulated (letterbox, a fixed surface scaled, is what a program that never asks keeps)
#ifdef ZN_WINDOW_SEPARATE
extern "C" int zn_window_load(void) { return 1; }   // Zinc Next (src/host/hal_dispatch.cpp, ZN-592.06): a program linked with this window host has a window
#endif
extern "C" void hal_set_resize(int32_t on) {
  if (!gfx_on || resize_fixed || det || hal_display || fill == (on != 0)) return;
  fill = on != 0;
  resize_pending = true;
}

extern "C" {
void hal_init(const HalConfig* cfg) {
  // a display plugin brings its own output, unless it draws through this window (host_window: the e-ink emulator)
  W = cfg->width; H = cfg->height; gfx_on = cfg->gfx != 0 && (!hal_display || hal_display->host_window);
  if (const char* f = getenv("ZINC_FRAMES")) frames_left = atol(f);
  const char* d = getenv("ZINC_DETERMINISTIC");
  det = (d && *d && *d != '0') || getenv("ZINC_RECORD") || getenv("ZINC_REPLAY");
  if (!gfx_on) return;
  // Trackpad scrolling: zinc:ui follows the fingers 1:1 and runs its own inertia from the release velocity, so the
  // OS momentum events are off, and trackpad touches are reported (without mouse emulation) to know when the
  // fingers lift (docs/ui.md, scrolling).
#ifdef SDL_HINT_MAC_SCROLL_MOMENTUM
  SDL_SetHint(SDL_HINT_MAC_SCROLL_MOMENTUM, "0");
#endif
#ifdef SDL_HINT_TRACKPAD_IS_TOUCH_ONLY
  SDL_SetHint(SDL_HINT_TRACKPAD_IS_TOUCH_ONLY, "1");
#endif
  if (!SDL_Init(SDL_INIT_VIDEO)) hal_panic(SDL_GetError(), "hal_sdl", __LINE__);
  // window size in points: zinc.json targets.<id>.zoom (ZINC_ZOOM overrides); auto only enlarges tiny surfaces
#ifdef ZINC_ZOOM
  int scale = ZINC_ZOOM;
#else
  int scale = W <= 400 ? 2 : 1;
#endif
  if (const char* z = getenv("ZINC_ZOOM")) scale = atoi(z);
  if (const char* ps = getenv("ZINC_PIXEL_SCALE")) logical_px = !strcmp(ps, "logical");
  if (scale < 1) scale = 1;
  zoom = scale;
#ifdef ZINC_RESIZE_FILL
  fill = true; resize_fixed = true;
#endif
  if (const char* r = getenv("ZINC_RESIZE")) { fill = r[0] == 'f'; resize_fixed = true; }
  if (det) fill = false;  // the layout must not follow the window
  if (hal_display) fill = false;   // an emulated device (host_window driver) has a fixed panel: letterbox it
  bool full = false;
#ifdef ZINC_FULLSCREEN
  full = true;
#endif
#ifdef ZINC_KIOSK
  kiosk = true;
#endif
  if (const char* v = getenv("ZINC_FULLSCREEN")) full = v[0] == '1';
  if (const char* v = getenv("ZINC_KIOSK")) kiosk = v[0] == '1';
  if (kiosk) full = true;
  // a surface taller or wider than the screen (a 1620x2160 tablet) opens scaled down to fit, keeping its proportions
  // (the OS would only clamp one side)
  int ww = W * scale, wh = H * scale;
  SDL_Rect usable;
  if (SDL_GetDisplayUsableBounds(SDL_GetPrimaryDisplay(), &usable) && usable.w > 0 && usable.h > 0) {
    const float fit = SDL_min(usable.w * 0.9f / ww, usable.h * 0.9f / wh);
    if (fit < 1) { ww = (int)(ww * fit); wh = (int)(wh * fit); }
  }
#ifdef ZN_HAL_GL
  {   // ZINC_RENDERER=cpu|gl|auto (default auto): GL when a hardware context comes up; transparent windows and display plugins stay on SDL_Renderer
    const char* rr = getenv("ZINC_RENDERER");
    if (!(rr && !strcmp(rr, "cpu")) && !(wcfg_set && wcfg.transparent) && !hal_display) gl_on = gl_window(cfg->title, ww, wh);
    zrt::gfx::gpu_strokes = gl_on;   // the replay draws strokes on the GPU (ZN-590.01)
  }
  if (!gl_on) {
    if (getenv("ZINC_GL_STATS")) fprintf(stderr, "zinc: window renderer cpu\n");
#endif
  if (!wcfg_set) {
    if (!SDL_CreateWindowAndRenderer(cfg->title, ww, wh, SDL_WINDOW_RESIZABLE | SDL_WINDOW_HIGH_PIXEL_DENSITY | SDL_WINDOW_HIDDEN, &win, &ren))
      hal_panic(SDL_GetError(), "hal_sdl", __LINE__);
  } else {   // window properties of the app (frameless, always on top, position, minimum size, transparent)
    SDL_PropertiesID props = SDL_CreateProperties();
    SDL_SetStringProperty(props, SDL_PROP_WINDOW_CREATE_TITLE_STRING, wcfg.title[0] ? wcfg.title : cfg->title);
    SDL_SetNumberProperty(props, SDL_PROP_WINDOW_CREATE_WIDTH_NUMBER, ww);
    SDL_SetNumberProperty(props, SDL_PROP_WINDOW_CREATE_HEIGHT_NUMBER, wh);
    SDL_SetBooleanProperty(props, SDL_PROP_WINDOW_CREATE_RESIZABLE_BOOLEAN, !wcfg.not_resizable);
    SDL_SetBooleanProperty(props, SDL_PROP_WINDOW_CREATE_HIGH_PIXEL_DENSITY_BOOLEAN, true);
    SDL_SetBooleanProperty(props, SDL_PROP_WINDOW_CREATE_BORDERLESS_BOOLEAN, wcfg.borderless != 0);
    SDL_SetBooleanProperty(props, SDL_PROP_WINDOW_CREATE_ALWAYS_ON_TOP_BOOLEAN, wcfg.always_on_top != 0);
    SDL_SetBooleanProperty(props, SDL_PROP_WINDOW_CREATE_TRANSPARENT_BOOLEAN, wcfg.transparent != 0);
    SDL_SetBooleanProperty(props, SDL_PROP_WINDOW_CREATE_HIDDEN_BOOLEAN, true);
    if (wcfg.has_position) { SDL_SetNumberProperty(props, SDL_PROP_WINDOW_CREATE_X_NUMBER, wcfg.x); SDL_SetNumberProperty(props, SDL_PROP_WINDOW_CREATE_Y_NUMBER, wcfg.y); }
    win = SDL_CreateWindowWithProperties(props);
    SDL_DestroyProperties(props);
    if (!win || !(ren = SDL_CreateRenderer(win, nullptr))) hal_panic(SDL_GetError(), "hal_sdl", __LINE__);
    if (wcfg.min_w > 0 || wcfg.min_h > 0) SDL_SetWindowMinimumSize(win, wcfg.min_w, wcfg.min_h);
#ifdef __APPLE__
    if (wcfg.transparent) hal_sdl_transparent_layers(SDL_GetPointerProperty(SDL_GetWindowProperties(win), SDL_PROP_WINDOW_COCOA_WINDOW_POINTER, nullptr));
#endif
  }
#ifdef ZN_HAL_GL
  }
#endif
  // a fixed surface (letterbox) keeps its proportions while the window is resized, so it never shows bars
  if (!fill) { const float a = (float)W / (float)H; SDL_SetWindowAspectRatio(win, a, a); }
  if (ren) SDL_SetRenderVSync(ren, 1);
  start_workers();
  if (full) { SDL_ShowWindow(win); shown = true; set_fullscreen(true); SDL_SyncWindow(win); }   // fullscreen applies to a shown window: no wait on a hidden one
  if (kiosk) { SDL_HideCursor(); SDL_SetWindowAlwaysOnTop(win, true); }
  // HiDPI: frames are rasterized at the window's pixel size, so text and shapes stay sharp (ZINC_SCALE overrides)
  apply_size();
  SDL_AddEventWatch(watch, nullptr);
}
void hal_shutdown(void) {
  if (!gfx_on) return;
#ifdef ZN_HAL_GL
  if (glctx) SDL_GL_DestroyContext(glctx);
#endif
  if (ren) SDL_DestroyRenderer(ren);
  SDL_DestroyWindow(win);
  SDL_Quit();
}
void hal_frame_begin(void) {}
void hal_frame_end(void) {}

// Pen: SDL pen events (Wacom, tablets); the mouse stands in for a pen (left = draw, right = eraser, pressure 0.5).
static HalPen pen;
static void pen_push(float wx, float wy, uint32_t flags) {
  from_window(wx, wy, &wx, &wy);
  pen.x = wx / K; pen.y = wy / K; pen.flags = flags;
  hal_pen_push(&pen);
}
static uint32_t pen_flags(SDL_PenInputFlags s) {
  return ((s & SDL_PEN_INPUT_DOWN) ? HAL_PEN_DOWN : HAL_PEN_HOVER) | ((s & SDL_PEN_INPUT_ERASER_TIP) ? HAL_PEN_ERASER : 0);
}

// Keyboard: SDL keycodes are layout-aware; printable keys are their (lowercase) ASCII code.
static int32_t key_code(SDL_Keycode k) {
  if (k >= 32 && k < 127) return (int32_t)k;
  switch (k) {
    case SDLK_BACKSPACE: return HAL_KEY_BACKSPACE;
    case SDLK_DELETE: return HAL_KEY_DELETE;
    case SDLK_RETURN: case SDLK_KP_ENTER: return HAL_KEY_ENTER;
    case SDLK_TAB: return HAL_KEY_TAB;
    case SDLK_ESCAPE: return HAL_KEY_ESCAPE;
    case SDLK_LEFT: return HAL_KEY_ARROW_LEFT;
    case SDLK_RIGHT: return HAL_KEY_ARROW_RIGHT;
    case SDLK_UP: return HAL_KEY_ARROW_UP;
    case SDLK_DOWN: return HAL_KEY_ARROW_DOWN;
    case SDLK_HOME: return HAL_KEY_HOME;
    case SDLK_END: return HAL_KEY_END;
    case SDLK_PAGEUP: return HAL_KEY_PAGEUP;
    case SDLK_PAGEDOWN: return HAL_KEY_PAGEDOWN;
    default: break;
  }
  if (k >= SDLK_F1 && k <= SDLK_F12) return HAL_KEY_F1 + (int32_t)(k - SDLK_F1);
  return 0;
}
static uint32_t mods_of(SDL_Keymod m) {
  return ((m & SDL_KMOD_SHIFT) ? HAL_MOD_SHIFT : 0) | ((m & SDL_KMOD_CTRL) ? HAL_MOD_CTRL : 0) | ((m & SDL_KMOD_ALT) ? HAL_MOD_ALT : 0) | ((m & SDL_KMOD_GUI) ? HAL_MOD_META : 0);
}
static void key_push(HalInput* in, int32_t key, int32_t kind, SDL_Keymod mod, const char* text) {
  if (in->nkeys == HAL_MAX_KEYS) return;
  HalKey& k = in->keys[in->nkeys];
  k = HalKey{key, mods_of(mod), kind, 0, 0};
  if (text) {
    size_t n = strlen(text);
    if (in->ntext + n > HAL_TEXT_BYTES) return;
    memcpy(in->text + in->ntext, text, n);
    k.off = (uint16_t)in->ntext; k.len = (uint16_t)n; in->ntext += (int32_t)n;
  }
  in->nkeys++;
}

// ---- precise scrolling: timestamped cumulative deltas, resampled at frame time (Chromium / Android style:
// sample time = now - 5 ms, linear between the two bracketing events, extrapolation capped at 8 ms)
struct ScrollSample { uint64_t t; double x, y; };
static ScrollSample ss[32];
static int nss = 0;
static double cum_x, cum_y, out_x, out_y;
static bool gesture = false, saw_fingers = false;
static int tp_fingers = 0, tp_fingers_prev = 0;
static uint64_t last_precise_us = 0;
static void scroll_push(uint64_t t, double dx, double dy) {
  cum_x += dx; cum_y += dy;
  if (nss == 32) { memmove(ss, ss + 1, sizeof(ss[0]) * 31); nss--; }
  ss[nss++] = ScrollSample{t, cum_x, cum_y};
}
static void scroll_resample(HalInput* in) {
  in->scroll_dx = in->scroll_dy = 0; in->scroll_phase = 0;
  const bool touched = tp_fingers > 0 && tp_fingers_prev == 0;
  tp_fingers_prev = tp_fingers;
  if (!gesture) { if (touched) in->scroll_phase = 3; return; }   // fingers landed: catches a running inertia
  const uint64_t now = SDL_GetTicksNS() / 1000;
  const bool lifted = saw_fingers ? (tp_fingers == 0) : (now - last_precise_us > 50000);
  double x = cum_x, y = cum_y;
  if (!lifted && nss > 0) {
    uint64_t ts = now > 5000 ? now - 5000 : 0;
    const ScrollSample& last = ss[nss - 1];
    if (nss >= 2 && ts > last.t) {   // extrapolate a little past the newest event
      const ScrollSample& prev = ss[nss - 2];
      uint64_t span = last.t - prev.t, ahead = ts - last.t, cap = span / 2 < 8000 ? span / 2 : 8000;
      if (ahead > cap) ahead = cap;
      double k = span ? (double)ahead / (double)span : 0;
      x = last.x + (last.x - prev.x) * k; y = last.y + (last.y - prev.y) * k;
    } else if (ts <= ss[0].t) {
      x = out_x; y = out_y;   // no event old enough yet
    } else {
      int i = nss - 1;
      while (i > 0 && ss[i - 1].t > ts) i--;
      const ScrollSample& a = ss[i > 0 ? i - 1 : 0]; const ScrollSample& b = ss[i];
      double k = b.t > a.t ? (double)(ts - a.t) / (double)(b.t - a.t) : 1;
      x = a.x + (b.x - a.x) * k; y = a.y + (b.y - a.y) * k;
    }
  }
  in->scroll_dx = (float)(x - out_x); in->scroll_dy = (float)(y - out_y);
  out_x = x; out_y = y;
  in->scroll_phase = lifted ? 2 : 1;
  if (lifted) { gesture = false; nss = 0; cum_x = cum_y = out_x = out_y = 0; }
}

// ---- more windows (ZN-663): windows beside the main one, each with an SDL_Renderer and a streaming texture of the pixels the runtime
// rasterized for it (the software path: the GL replay stays the main window's). Their events are routed by window; the main window's go
// on as before. Closing one keeps the others, a closed main window hides while others are open, closing the last one ends the program.
struct Sec { int32_t id; SDL_Window* w; SDL_Renderer* r; SDL_Texture* t; int tw, th; HalInput in; bool open; };
static Sec secs[8];
static bool main_hidden = false;
static SDL_Window* text_win = nullptr;   // the window being drawn (hal_win_current): text input follows it
static uint64_t hidden_at = 0;           // pacing while the main window is hidden (its present no longer waits for the display)
static Sec* sec_by_id(int32_t id) { for (Sec& s : secs) if (s.open && s.id == id) return &s; return nullptr; }
static Sec* sec_of(SDL_Window* w) { if (!w || w == win) return nullptr; for (Sec& s : secs) if (s.open && s.w == w) return &s; return nullptr; }
static int secs_open() { int n = 0; for (Sec& s : secs) n += s.open; return n; }
static void close_window(int32_t id) {
  if (id == 0) { if (secs_open()) { main_hidden = true; SDL_HideWindow(win); } else quit = true; return; }
  if (Sec* s = sec_by_id(id)) {
    if (text_win == s->w) text_win = nullptr;
    if (s->t) SDL_DestroyTexture(s->t);
    if (s->r) SDL_DestroyRenderer(s->r);
    if (s->w) SDL_DestroyWindow(s->w);
    *s = Sec{};
  }
  if (main_hidden && !secs_open()) quit = true;
}
static void sec_event(Sec& s, const SDL_Event& e) {
  HalInput* in = &s.in;
  switch (e.type) {
    case SDL_EVENT_KEY_DOWN: case SDL_EVENT_KEY_UP:
      if (int32_t k = key_code(e.key.key)) key_push(in, k, e.type == SDL_EVENT_KEY_UP ? HAL_KEY_UP : e.key.repeat ? HAL_KEY_REPEAT : HAL_KEY_DOWN, e.key.mod, nullptr);
      break;
    case SDL_EVENT_TEXT_INPUT: key_push(in, 0, HAL_KEY_TEXT, SDL_GetModState(), e.text.text); break;
    case SDL_EVENT_MOUSE_BUTTON_DOWN: case SDL_EVENT_MOUSE_BUTTON_UP:   // the surface is the window, in points: no letterbox
      if (in->nbtn < HAL_MAX_BUTTON_EVENTS)
        in->btn[in->nbtn++] = HalButtonEvent{e.button.x, e.button.y, e.button.button == SDL_BUTTON_RIGHT ? 2 : e.button.button == SDL_BUTTON_MIDDLE ? 1 : 0, e.button.down};
      break;
    case SDL_EVENT_MOUSE_WHEEL: in->wheel_x += e.wheel.x; in->wheel += e.wheel.y; break;   // ponytail: trackpad deltas as wheel steps, no precise-scroll resampling here
    case SDL_EVENT_PINCH_UPDATE: in->pinch *= e.pinch.scale; break;
    case SDL_EVENT_WINDOW_CLOSE_REQUESTED: close_window(s.id); break;
    default: break;
  }
}

// Gamepads (ZN-574): SDL's gamepad layer (its mapping database gives every known pad the same layout; more mappings: the file named by
// SDL_GAMECONTROLLERCONFIG_FILE) into the slots of HalInput, in the W3C "standard" order. Polled, not event driven: whichever loop pumps the
// events, the state is read here. Started at the second poll, so the first frame does not wait for the HID manager.
// ZINC_VIRTUAL_GAMEPAD=xbox|ps5 plugs an SDL virtual gamepad that holds one button after the other (SDL's order, two polls each), then pushes
// each axis: what the tests read, with no hardware.
static SDL_Gamepad* pads[HAL_MAX_GAMEPADS];
static int pads_on = 0;   // 0 not started, 1 running, -1 SDL has no gamepad support here
static long pads_poll = 0;
static SDL_Joystick* virtual_pad;
static void gamepads_poll(HalInput* in) {
  if (pads_on < 0 || pads_poll++ == 0) return;
  if (pads_on == 0) {
    pads_on = SDL_InitSubSystem(SDL_INIT_GAMEPAD) ? 1 : -1;
    if (pads_on < 0) return;
    if (const char* v = getenv("ZINC_VIRTUAL_GAMEPAD"); v && *v) {
      SDL_VirtualJoystickDesc d;
      SDL_INIT_INTERFACE(&d);
      const bool ps = !strcmp(v, "ps5");
      d.type = SDL_JOYSTICK_TYPE_GAMEPAD; d.naxes = SDL_GAMEPAD_AXIS_COUNT; d.nbuttons = SDL_GAMEPAD_BUTTON_DPAD_RIGHT + 1;
      d.vendor_id = ps ? 0x054c : 0x045e; d.product_id = ps ? 0x0ce6 : 0x0b12;   // a DualSense, an Xbox Series controller
      d.name = ps ? "Zinc virtual DualSense" : "Zinc virtual Xbox pad";
      virtual_pad = SDL_OpenJoystick(SDL_AttachVirtualJoystick(&d));
    }
  }
  if (virtual_pad) {
    const long step = (pads_poll - 2) / 2, nb = SDL_GAMEPAD_BUTTON_DPAD_RIGHT + 1;
    for (long b = 0; b < nb; b++) SDL_SetJoystickVirtualButton(virtual_pad, static_cast<int>(b), b == step);
    for (long a = 0; a < SDL_GAMEPAD_AXIS_COUNT; a++) {
      const bool trigger = a == SDL_GAMEPAD_AXIS_LEFT_TRIGGER || a == SDL_GAMEPAD_AXIS_RIGHT_TRIGGER;
      SDL_SetJoystickVirtualAxis(virtual_pad, static_cast<int>(a), a == step - nb ? 16384 : trigger ? SDL_JOYSTICK_AXIS_MIN : 0);   // a trigger at rest is the axis's minimum
    }
  }
  for (int k = 0; k < HAL_MAX_GAMEPADS; k++)
    if (pads[k] && !SDL_GamepadConnected(pads[k])) { SDL_CloseGamepad(pads[k]); pads[k] = nullptr; in->pad[k] = HalGamepad{}; }
  int n = 0;
  if (SDL_JoystickID* ids = SDL_GetGamepads(&n)) {   // ponytail: the list is read at every poll; SDL_EVENT_GAMEPAD_ADDED if it ever shows in a profile
    for (int i = 0; i < n; i++) {
      if (SDL_GetGamepadFromID(ids[i])) continue;   // already in a slot
      int k = 0;
      while (k < HAL_MAX_GAMEPADS && pads[k]) k++;
      if (k < HAL_MAX_GAMEPADS) pads[k] = SDL_OpenGamepad(ids[i]);
    }
    SDL_free(ids);
  }
  static const SDL_GamepadButton w3c[17] = {SDL_GAMEPAD_BUTTON_SOUTH, SDL_GAMEPAD_BUTTON_EAST, SDL_GAMEPAD_BUTTON_WEST, SDL_GAMEPAD_BUTTON_NORTH,
    SDL_GAMEPAD_BUTTON_LEFT_SHOULDER, SDL_GAMEPAD_BUTTON_RIGHT_SHOULDER, SDL_GAMEPAD_BUTTON_INVALID, SDL_GAMEPAD_BUTTON_INVALID,   // 6 and 7: the triggers, axes for SDL
    SDL_GAMEPAD_BUTTON_BACK, SDL_GAMEPAD_BUTTON_START, SDL_GAMEPAD_BUTTON_LEFT_STICK, SDL_GAMEPAD_BUTTON_RIGHT_STICK,
    SDL_GAMEPAD_BUTTON_DPAD_UP, SDL_GAMEPAD_BUTTON_DPAD_DOWN, SDL_GAMEPAD_BUTTON_DPAD_LEFT, SDL_GAMEPAD_BUTTON_DPAD_RIGHT, SDL_GAMEPAD_BUTTON_GUIDE};
  for (int k = 0; k < HAL_MAX_GAMEPADS; k++) {
    SDL_Gamepad* g = pads[k];
    if (!g) continue;
    HalGamepad& p = in->pad[k];
    if (p.connected && p.rumble_ms > 0)
      SDL_RumbleGamepad(g, static_cast<Uint16>(SDL_clamp(p.rumble_low, 0.f, 1.f) * 65535), static_cast<Uint16>(SDL_clamp(p.rumble_high, 0.f, 1.f) * 65535), static_cast<Uint32>(p.rumble_ms));
    p = HalGamepad{};
    p.connected = 1;
    const char* name = SDL_GetGamepadName(g);
    SDL_snprintf(p.name, sizeof p.name, "%s", name ? name : "Gamepad");
    for (int b = 0; b < 17; b++) if (w3c[b] != SDL_GAMEPAD_BUTTON_INVALID && SDL_GetGamepadButton(g, w3c[b])) p.buttons |= 1u << b;
    for (int t = 0; t < 2; t++) {
      p.trigger[t] = SDL_GetGamepadAxis(g, t ? SDL_GAMEPAD_AXIS_RIGHT_TRIGGER : SDL_GAMEPAD_AXIS_LEFT_TRIGGER) / 32767.f;
      if (p.trigger[t] > 0.12f) p.buttons |= 1u << (6 + t);   // held from 30/255 on, as Chrome's pads
    }
    static const SDL_GamepadAxis sticks[4] = {SDL_GAMEPAD_AXIS_LEFTX, SDL_GAMEPAD_AXIS_LEFTY, SDL_GAMEPAD_AXIS_RIGHTX, SDL_GAMEPAD_AXIS_RIGHTY};
    for (int a = 0; a < 4; a++) p.axes[a] = SDL_max(SDL_GetGamepadAxis(g, sticks[a]) / 32767.f, -1.f);
  }
}

void hal_poll_input(HalInput* in) {
  in->nkeys = 0; in->ntext = 0; in->nbtn = 0; in->wheel_x = 0;
  if (resize_pending) { resize_pending = false; apply_size(); }
  // A display plugin with its own window (LED / OLED / e-ink emulators) still needs this HAL to pump the OS events,
  // unless it reads them itself (display-gl).
  if (!gfx_on && (!hal_display || hal_display->owns_input || !SDL_WasInit(SDL_INIT_VIDEO))) {
    if (frames_left >= 0 && frames_left-- == 0) quit = true;
    in->quit = quit;
    return;
  }
  SDL_Event e;
  const bool several = secs_open() > 0 || main_hidden;
  while (SDL_PollEvent(&e)) {
    if (several) {   // the events of the other windows are theirs; closing the main window hides it while they are open
      SDL_Window* ew = SDL_GetWindowFromEvent(&e);
      if (Sec* s = sec_of(ew)) { sec_event(*s, e); continue; }
      if (ew == win && e.type == SDL_EVENT_WINDOW_CLOSE_REQUESTED && secs_open()) { if (!close_handler || close_handler()) close_window(0); continue; }
    }
    if (e.type == SDL_EVENT_KEY_DOWN || e.type == SDL_EVENT_KEY_UP) {
      if (int32_t k = key_code(e.key.key)) key_push(in, k, e.type == SDL_EVENT_KEY_UP ? HAL_KEY_UP : e.key.repeat ? HAL_KEY_REPEAT : HAL_KEY_DOWN, e.key.mod, nullptr);
    }
    if (e.type == SDL_EVENT_TEXT_INPUT) key_push(in, 0, HAL_KEY_TEXT, SDL_GetModState(), e.text.text);
    if ((e.type == SDL_EVENT_MOUSE_BUTTON_DOWN || e.type == SDL_EVENT_MOUSE_BUTTON_UP) && in->nbtn < HAL_MAX_BUTTON_EVENTS) {
      HalButtonEvent& b = in->btn[in->nbtn++];
      float bx = e.button.x, by = e.button.y;
      from_window(bx, by, &bx, &by);
      b.x = bx / K; b.y = by / K;
      b.button = e.button.button == SDL_BUTTON_RIGHT ? 2 : e.button.button == SDL_BUTTON_MIDDLE ? 1 : 0;
      b.down = e.button.down;
    }
    if (e.type == SDL_EVENT_MOUSE_WHEEL) {
      // notches are whole steps outside a trackpad gesture; anything else is precise (px = delta * 10 on macOS)
      const bool precise = tp_fingers > 0 || gesture || e.wheel.y != SDL_floorf(e.wheel.y) || e.wheel.x != SDL_floorf(e.wheel.x);
      if (precise) {
        const uint64_t t = e.wheel.timestamp / 1000;
        if (!gesture) { gesture = true; nss = 0; cum_x = cum_y = out_x = out_y = 0; scroll_push(t > 16000 ? t - 16000 : 0, 0, 0); }
        scroll_push(t, e.wheel.x * 10, e.wheel.y * 10);
        last_precise_us = SDL_GetTicksNS() / 1000;
      } else { in->wheel_x += e.wheel.x; in->wheel += e.wheel.y; }
    }
    // trackpad fingers (indirect touch devices, SDL_HINT_TRACKPAD_IS_TOUCH_ONLY): how many are down
    if ((e.type == SDL_EVENT_FINGER_DOWN || e.type == SDL_EVENT_FINGER_UP || e.type == SDL_EVENT_FINGER_CANCELED) &&
        SDL_GetTouchDeviceType(e.tfinger.touchID) != SDL_TOUCH_DEVICE_DIRECT) {
      int n = 0;
      if (SDL_Finger** f = SDL_GetTouchFingers(e.tfinger.touchID, &n)) SDL_free(f);
      tp_fingers = e.type == SDL_EVENT_FINGER_DOWN ? (n > 0 ? n : 1) : n;
      saw_fingers = true;
    }
    if (e.type == SDL_EVENT_PEN_AXIS) {
      if (e.paxis.axis == SDL_PEN_AXIS_PRESSURE) pen.pressure = e.paxis.value;
      if (e.paxis.axis == SDL_PEN_AXIS_XTILT) pen.tilt_x = e.paxis.value;
      if (e.paxis.axis == SDL_PEN_AXIS_YTILT) pen.tilt_y = e.paxis.value;
    }
    if (e.type == SDL_EVENT_PEN_MOTION) pen_push(e.pmotion.x, e.pmotion.y, pen_flags(e.pmotion.pen_state));
    if (e.type == SDL_EVENT_PEN_DOWN || e.type == SDL_EVENT_PEN_UP)
      pen_push(e.ptouch.x, e.ptouch.y, (e.ptouch.down ? HAL_PEN_DOWN : HAL_PEN_HOVER) | (e.ptouch.eraser ? HAL_PEN_ERASER : 0));
    if (e.type == SDL_EVENT_MOUSE_MOTION || e.type == SDL_EVENT_MOUSE_BUTTON_DOWN || e.type == SDL_EVENT_MOUSE_BUTTON_UP) {
      const bool motion = e.type == SDL_EVENT_MOUSE_MOTION;
      const SDL_MouseID which = motion ? e.motion.which : e.button.which;
      uint32_t f = motion ? ((e.motion.state & SDL_BUTTON_LMASK) ? HAL_PEN_DOWN : (e.motion.state & SDL_BUTTON_RMASK) ? HAL_PEN_DOWN | HAL_PEN_ERASER : 0)
                          : (e.button.button == SDL_BUTTON_LEFT || e.button.button == SDL_BUTTON_RIGHT)
                              ? (e.button.down ? HAL_PEN_DOWN : HAL_PEN_HOVER) | (e.button.button == SDL_BUTTON_RIGHT ? HAL_PEN_ERASER : 0) : 0;
      if (f && which != SDL_PEN_MOUSEID && which != SDL_TOUCH_MOUSEID) {
        pen.pressure = 0.5f; pen.tilt_x = pen.tilt_y = 0;
        pen_push(motion ? e.motion.x : e.button.x, motion ? e.motion.y : e.button.y, f);
      }
    }
    // kiosk: no way out from the keyboard or the window (stop the process or its service instead)
    if (e.type == SDL_EVENT_QUIT && !kiosk && (!close_handler || close_handler())) quit = true;   // a handler may veto (close to tray)
    if (drop_handler && (e.type == SDL_EVENT_DROP_FILE || e.type == SDL_EVENT_DROP_TEXT) && e.drop.data) drop_handler(e.drop.data, e.type == SDL_EVENT_DROP_TEXT);
    // not while a text field has the keyboard: Escape blurs the field first
    if (e.type == SDL_EVENT_KEY_DOWN && e.key.scancode == SDL_SCANCODE_ESCAPE && !escape_app && !(win && SDL_TextInputActive(win))) hal_escape();
    if (gfx_on && e.type == SDL_EVENT_KEY_DOWN && !kiosk && !e.key.repeat && (e.key.scancode == SDL_SCANCODE_F11 || (e.key.scancode == SDL_SCANCODE_F && (e.key.mod & SDL_KMOD_GUI) && (e.key.mod & SDL_KMOD_CTRL))))
      set_fullscreen(!(SDL_GetWindowFlags(win) & SDL_WINDOW_FULLSCREEN));
    if (gfx_on && (e.type == SDL_EVENT_WINDOW_PIXEL_SIZE_CHANGED || e.type == SDL_EVENT_WINDOW_RESIZED)) apply_size();
    if (e.type == SDL_EVENT_PINCH_UPDATE) in->pinch *= e.pinch.scale;
    // touch screens only: trackpad fingers (indirect devices) are the pointer, not screen touches
    if ((e.type == SDL_EVENT_FINGER_DOWN || e.type == SDL_EVENT_FINGER_MOTION) && SDL_GetTouchDeviceType(e.tfinger.touchID) == SDL_TOUCH_DEVICE_DIRECT) {
      int32_t id = (int32_t)e.tfinger.fingerID, k = 0;
      while (k < in->ntouch && in->touch[k].id != id) k++;
      if (k == in->ntouch && k < HAL_MAX_TOUCH) in->ntouch++;
      int ww, wh;
      float tx = e.tfinger.x * W, ty = e.tfinger.y * H;
      if (SDL_GetWindowSize(win, &ww, &wh)) { from_window(e.tfinger.x * ww, e.tfinger.y * wh, &tx, &ty); tx /= K; ty /= K; }  // letterbox
      if (k < HAL_MAX_TOUCH) in->touch[k] = HalTouch{id, tx, ty};
    }
    if (e.type == SDL_EVENT_FINGER_UP || e.type == SDL_EVENT_FINGER_CANCELED) {
      for (int32_t k = 0; k < in->ntouch; k++) if (in->touch[k].id == (int32_t)e.tfinger.fingerID) { in->touch[k] = in->touch[--in->ntouch]; break; }
    }
  }
  scroll_resample(in);
  gamepads_poll(in);
  const bool* k = SDL_GetKeyboardState(nullptr);
  uint32_t b = 0;
  if (k[SDL_SCANCODE_UP] || k[SDL_SCANCODE_W]) b |= HAL_UP;
  if (k[SDL_SCANCODE_DOWN] || k[SDL_SCANCODE_S]) b |= HAL_DOWN;
  if (k[SDL_SCANCODE_LEFT] || k[SDL_SCANCODE_A]) b |= HAL_LEFT;
  if (k[SDL_SCANCODE_RIGHT] || k[SDL_SCANCODE_D]) b |= HAL_RIGHT;
  if (k[SDL_SCANCODE_SPACE] || k[SDL_SCANCODE_Z]) b |= HAL_A;
  if (k[SDL_SCANCODE_X]) b |= HAL_B;
  if (k[SDL_SCANCODE_C]) b |= HAL_X;
  if (k[SDL_SCANCODE_V]) b |= HAL_Y;
  if (k[SDL_SCANCODE_Q]) b |= HAL_L;
  if (k[SDL_SCANCODE_E]) b |= HAL_R;
  if (k[SDL_SCANCODE_RETURN]) b |= HAL_START;
  if (k[SDL_SCANCODE_TAB]) b |= HAL_SELECT;
  if (several && SDL_GetKeyboardFocus() != win) b = 0;   // the keys held belong to the window that has the keyboard
  in->buttons = b;
  float mx, my;
  SDL_MouseButtonFlags mb = SDL_GetMouseState(&mx, &my);
  if (several && SDL_GetMouseFocus() != win) { mx = in->px; my = in->py; mb = 0; }   // the pointer is over another window: this one keeps its last position
  else if (win) { from_window(mx, my, &mx, &my); mx /= K; my /= K; }
  in->px = mx; in->py = my; in->pdown = (mb & SDL_BUTTON_LMASK) != 0;
  in->pbuttons = ((mb & SDL_BUTTON_LMASK) ? 1u : 0u) | ((mb & SDL_BUTTON_RMASK) ? 2u : 0u) | ((mb & SDL_BUTTON_MMASK) ? 4u : 0u);
  in->mods = mods_of(SDL_GetModState());
  if (frames_left >= 0 && frames_left-- == 0) quit = true;
  in->quit = quit;
}

// Parallel rasterization: the damaged rows are cut into stripes of kStripe rows that the threads take from a counter, so a
// dense region next to an empty one balances itself (one band per core left one core with 62% of the pixels of
// bouncing-ball, ZN-400). Each stripe renders the whole command list clipped to its rows (the rasterizer keeps its
// scratch buffers per thread), so the pixels are the same as a single-threaded render. ZINC_RENDER_THREADS=n
// overrides the count (1: no worker threads).
static void (*band_fn)(uint32_t*, int32_t, int32_t);
static int32_t band_y0, band_y1, workers, band_pending;
static std::atomic<int32_t> band_next;
static int32_t kStripe = 32;
static unsigned band_gen;
// never destroyed: at exit the detached workers still wait on band_go, and glibc's pthread_cond_destroy waits for its waiters, so a Linux window run hung
// in the static destructors after its last frame (ZN-412.06)
static std::mutex& band_mu = *new std::mutex;
static std::condition_variable &band_go = *new std::condition_variable, &band_done = *new std::condition_variable;
// profiler hooks (runtime/gfx.cpp): band spans for the raster phase and the trace; no-ops without zinc:gfx
extern "C" __attribute__((weak)) int32_t zrt_profiling(void) { return 0; }
extern "C" __attribute__((weak)) void zrt_prof_band(int32_t, uint64_t, uint64_t) {}
static bool band_prof;
static void run_band(int i) {
  uint64_t t0 = band_prof ? hal_time_us() : 0;
  for (int32_t a; (a = band_y0 + band_next.fetch_add(1, std::memory_order_relaxed) * kStripe) < band_y1;)
    band_fn(fb + (size_t)a * PW, a, a + kStripe < band_y1 ? a + kStripe : band_y1);
  if (band_prof) zrt_prof_band(i, t0, hal_time_us());
}
static void band_worker(int id) {
  unsigned seen = 0;
  for (;;) {
    std::unique_lock<std::mutex> l(band_mu);
    band_go.wait(l, [&] { return band_gen != seen; });
    seen = band_gen;
    l.unlock();
    run_band(id);
    l.lock();
    if (--band_pending == 0) band_done.notify_one();
  }
}
static void start_workers() {
  static bool started = false;
  if (started) return;
  started = true;
  const char* e = getenv("ZINC_RENDER_THREADS");
  int n = e ? atoi(e) : SDL_GetNumLogicalCPUCores();
  if (n > 8) n = 8;   // ponytail: memory bandwidth, not cores, limits past ~8 bands
  if (const char* st = getenv("ZINC_RENDER_STRIPE")) if (atoi(st) >= 8) kStripe = atoi(st);   // rows per stripe, for measuring
  for (int i = 1; i < n; i++) std::thread(band_worker, i).detach();
  workers = n > 1 ? n - 1 : 0;
}
static void render_rows_parallel(void (*fn)(uint32_t*, int32_t, int32_t), int32_t y0, int32_t y1) {
  band_prof = zrt_profiling() != 0;
  if (workers == 0 || y1 - y0 < 2 * kStripe) {
    uint64_t t0 = band_prof ? hal_time_us() : 0;
    fn(fb + (size_t)y0 * PW, y0, y1);
    if (band_prof) zrt_prof_band(0, t0, hal_time_us());
    return;
  }
  {
    std::lock_guard<std::mutex> l(band_mu);
    band_fn = fn; band_y0 = y0; band_y1 = y1; band_next.store(0, std::memory_order_relaxed); band_pending = workers; band_gen++;
  }
  band_go.notify_all();
  run_band(0);
  std::unique_lock<std::mutex> l(band_mu);
  band_done.wait(l, [] { return band_pending == 0; });
}

#ifdef ZN_HAL_GL
// GL: the command lists replayed on the GPU into the replay's texture (or straight into the window when it has the surface's size and
// most of the frame changed), else the software rows uploaded; then the texture over the window, letterboxed.
static void gl_present(const HalFrame* f) {
  GlCurrent cur;
  if (glr_stale && f->frames) {   // not for a frame of rows alone (the splash, ZN-446): the replay sizes its tables by the fonts and images installed
    if (!glr_made && getenv("ZINC_GL_STATS")) atexit([] { if (glr_ok) glr::report(); });   // at exit: the Next host never calls hal_shutdown
    glr_ok = glr_made ? glr::resize(PW, PH) : glr::init(PW, PH);
    glr_made = true; glr_stale = false;
  }
  int dw = PW, dh = PH;
  SDL_GetWindowSizeInPixels(win, &dw, &dh);
  const bool damaged = f->y1 > f->y0 && f->x1 > f->x0;
  GLuint src = glr::texture();
  float bgr = 0;
  if (glr_ok && f->frames) {
    const int64_t area = damaged ? (int64_t)(f->x1 - f->x0) * (f->y1 - f->y0) : 0;
    if (dw == PW && dh == PH && damaged && area * 2 >= (int64_t)PW * PH) {   // straight into the window: no texture, no copy
      glr::frame(f, true, glr::Rect{0, 0, PW, PH});
      gl_tex_ok = false;
      SDL_GL_SwapWindow(win);
      return;
    }
    if (damaged || !gl_tex_ok) { glr::frame(f, false, glr::Rect{0, 0, PW, PH}); gl_tex_ok = true; }
    else glr::idle();
  } else {
    if (damaged) {
      render_rows_parallel(f->render_damage ? f->render_damage : f->render, f->y0, f->y1);   // fb keeps the previous frame
      glBindTexture(GL_TEXTURE_2D, gl_upload);
      glPixelStorei(GL_UNPACK_ALIGNMENT, 4);
      glTexSubImage2D(GL_TEXTURE_2D, 0, 0, f->y0, PW, f->y1 - f->y0, GL_RGBA, GL_UNSIGNED_BYTE, fb + (size_t)f->y0 * PW);
    }
    src = gl_upload; bgr = 1;   // 0x00RRGGBB in memory: B, G, R, 0
  }
  glBindFramebuffer(GL_FRAMEBUFFER, 0);
  glDisable(GL_SCISSOR_TEST); glDisable(GL_DEPTH_TEST); glDisable(GL_BLEND);
  glViewport(0, 0, dw, dh);
  glClearColor(0, 0, 0, 1);
  glClear(GL_COLOR_BUFFER_BIT);
  const float sc = SDL_min((float)dw / PW, (float)dh / PH);
  const int vw = (int)(PW * sc + 0.5f), vh = (int)(PH * sc + 0.5f);
  glViewport((dw - vw) / 2, (dh - vh) / 2, vw, vh);
  glUseProgram(gl_prog);
  glActiveTexture(GL_TEXTURE0);
  glBindTexture(GL_TEXTURE_2D, src);
  const GLint flt = logical_px ? GL_NEAREST : GL_LINEAR;   // pixel art keeps square pixels when the window magnifies it
  glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, flt); glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, flt);
  glUniform1i(gl_u_tex, 0);
  glUniform1f(gl_u_bgr, bgr);
  glBindBuffer(GL_ARRAY_BUFFER, gl_quad);
  glEnableVertexAttribArray(0);
  glVertexAttribPointer(0, 2, GL_FLOAT, GL_FALSE, 0, nullptr);
  glDrawArrays(GL_TRIANGLE_STRIP, 0, 4);
  glDisableVertexAttribArray(0);
  SDL_GL_SwapWindow(win);
}
#endif
static void present_frame(const HalFrame* f);
// The shared rasterizer renders only the damaged rows; the texture is updated for those rows.
void hal_present(const HalFrame* f) {
  if (!gfx_on) return;
  if (main_hidden) {   // nothing to show: the frame rate of the other windows (about 60 per second) comes from here
    const uint64_t now = SDL_GetTicksNS();
    if (hidden_at && now - hidden_at < 16666666) SDL_DelayPrecise(16666666 - (now - hidden_at));
    hidden_at = SDL_GetTicksNS();
    return;
  }
  if (f->w != PW || f->h != PH) {   // a frame rendered for the previous size (live resize): expected once in a while
    static int dropped = 0;
    if (++dropped == 30) {   // many in a row means a size mismatch, not a resize: say so instead of a black window
      char b[160];
      snprintf(b, sizeof b, "zinc: frames of %dx%d do not fit the %dx%d window surface; nothing is shown\n", f->w, f->h, PW, PH);
      hal_log_err(b, strlen(b));
    }
    return;
  }
  present_frame(f);
  if (shown) return;
  shown = true;
  SDL_ShowWindow(win);
  present_frame(f);   // again into the shown window: what it composites first may be the buffer of before the show
}
static void present_frame(const HalFrame* f) {
#ifdef ZN_HAL_GL
  if (gl_on) { gl_present(f); return; }
#endif
  if (f->y1 > f->y0 && f->x1 > f->x0) {
    render_rows_parallel(f->render_damage ? f->render_damage : f->render, f->y0, f->y1);  // fb keeps the previous frame
    SDL_Rect r = {0, f->y0, PW, f->y1 - f->y0};
    if (wcfg_set && wcfg.transparent) {   // the key colour becomes alpha 0, everything else opaque
      size_t n = (size_t)PW * (size_t)(f->y1 - f->y0);
      if (tbuf_n < n) { free(tbuf); tbuf = (uint32_t*)malloc(n * 4); tbuf_n = n; }
      const uint32_t key = wcfg.transparent_key & 0xFFFFFF, *src = fb + (size_t)f->y0 * PW;
      for (size_t i = 0; i < n; i++) tbuf[i] = (src[i] & 0xFFFFFF) == key ? 0u : (src[i] | 0xFF000000u);
      SDL_UpdateTexture(tex, &r, tbuf, PW * 4);
    } else SDL_UpdateTexture(tex, &r, fb + (size_t)f->y0 * PW, PW * 4);
  }
  if (wcfg_set && wcfg.transparent) SDL_SetRenderDrawColor(ren, 0, 0, 0, 0);
  SDL_RenderClear(ren);
  SDL_RenderTexture(ren, tex, nullptr, nullptr);
  SDL_RenderPresent(ren);
}
void hal_surface_size(int* w, int* h) { *w = W; *h = H; }
// Text input (IME candidate window next to the field), clipboard, cursor shapes.
void hal_text_input(int32_t on, float x, float y, float w, float h) {
  if (!gfx_on) return;
  if (text_win && text_win != win) {   // a field of another window (ZN-663): its surface is the window, in points
    if (!on) { SDL_StopTextInput(text_win); return; }
    SDL_Rect r = {(int)x, (int)y, (int)w, (int)h};
    SDL_SetTextInputArea(text_win, &r, 0);
    SDL_StartTextInput(text_win);
    return;
  }
  if (!on) { SDL_StopTextInput(win); return; }
  float x0 = x * K, y0 = y * K, x1 = (x + w) * K, y1 = (y + h) * K;
  to_window(x0, y0, &x0, &y0);
  to_window(x1, y1, &x1, &y1);
  SDL_Rect r = {(int)x0, (int)y0, (int)(x1 - x0), (int)(y1 - y0)};
  SDL_SetTextInputArea(win, &r, 0);
  SDL_StartTextInput(win);
}
int32_t hal_win_open(int32_t id, const char* title, int32_t w, int32_t h) {
  if (!gfx_on) return 0;
  for (Sec& s : secs) {
    if (s.open) continue;
    if (!SDL_CreateWindowAndRenderer(title, w, h, SDL_WINDOW_RESIZABLE | SDL_WINDOW_HIGH_PIXEL_DENSITY, &s.w, &s.r)) { s = Sec{}; return 0; }
    SDL_SetRenderVSync(s.r, 0);   // the main window paces the frames
    s.id = id; s.open = true; s.in = HalInput{}; s.in.pinch = 1;
    return 1;
  }
  return 0;
}
void hal_win_close(int32_t id) { close_window(id); }
int32_t hal_win_state(int32_t id) { return id == 0 ? !main_hidden && !quit : sec_by_id(id) != nullptr; }
void hal_win_input(int32_t id, HalInput* in, int32_t* w, int32_t* h) {
  Sec* s = sec_by_id(id);
  if (!s) return;
  const float px = in->px, py = in->py;
  *in = s->in;
  s->in.nkeys = 0; s->in.ntext = 0; s->in.nbtn = 0; s->in.wheel = s->in.wheel_x = 0; s->in.pinch = 1;
  float mx, my;
  SDL_MouseButtonFlags mb = SDL_GetMouseState(&mx, &my);
  if (SDL_GetMouseFocus() != s->w) { mx = px; my = py; mb = 0; }   // over another window: the last position here
  in->px = mx; in->py = my; in->pdown = (mb & SDL_BUTTON_LMASK) != 0;
  in->pbuttons = ((mb & SDL_BUTTON_LMASK) ? 1u : 0u) | ((mb & SDL_BUTTON_RMASK) ? 2u : 0u) | ((mb & SDL_BUTTON_MMASK) ? 4u : 0u);
  in->mods = mods_of(SDL_GetModState());
  in->buttons = 0;   // ponytail: the arrow-key pad of hal_poll_input is the main window's
  int ww = *w, wh = *h;
  if (SDL_GetWindowSize(s->w, &ww, &wh) && ww > 0 && wh > 0) { *w = ww; *h = wh; }
}
void hal_win_present(int32_t id, const uint32_t* px, int32_t pw, int32_t ph) {
  Sec* s = sec_by_id(id);
  if (!s) return;
  if (!s->t || s->tw != pw || s->th != ph) {
    if (s->t) SDL_DestroyTexture(s->t);
    s->t = SDL_CreateTexture(s->r, SDL_PIXELFORMAT_ARGB8888, SDL_TEXTUREACCESS_STREAMING, pw, ph);
    SDL_SetTextureBlendMode(s->t, SDL_BLENDMODE_NONE);
    s->tw = pw; s->th = ph;
  }
  SDL_UpdateTexture(s->t, nullptr, px, pw * 4);
  SDL_RenderClear(s->r);
  SDL_RenderTexture(s->r, s->t, nullptr, nullptr);
  SDL_RenderPresent(s->r);
}
void hal_win_current(int32_t id) { Sec* s = id ? sec_by_id(id) : nullptr; text_win = s ? s->w : nullptr; }
// ZINC_CLIPBOARD=local (set by `zinc test`) or a deterministic run: a process-local clipboard, so test runs never
// touch the user's one
static char* clip_local;
static bool clip_is_local() { const char* c = getenv("ZINC_CLIPBOARD"); return !gfx_on || det || (c && !strcmp(c, "local")); }
const char* hal_clipboard_get(void) {
  static char* last;
  if (clip_is_local()) return clip_local ? clip_local : "";
  SDL_free(last);
  last = SDL_GetClipboardText();
  return last ? last : "";
}
void hal_clipboard_set(const char* s, size_t n) {
  char* t = (char*)malloc(n + 1);
  if (!t) return;
  memcpy(t, s, n); t[n] = 0;
  if (clip_is_local()) { free(clip_local); clip_local = t; return; }
  SDL_SetClipboardText(t);
  free(t);
}
void hal_escape_by_app(int32_t on) { escape_app = on != 0; }
void hal_escape(void) {
  if (kiosk) return;
  if (win && (SDL_GetWindowFlags(win) & SDL_WINDOW_FULLSCREEN)) set_fullscreen(false); else quit = true;
}
void hal_set_cursor(int32_t shape) {
  static SDL_Cursor* cache[10];
  static const SDL_SystemCursor sys[10] = {SDL_SYSTEM_CURSOR_DEFAULT, SDL_SYSTEM_CURSOR_TEXT, SDL_SYSTEM_CURSOR_POINTER, SDL_SYSTEM_CURSOR_MOVE,
    SDL_SYSTEM_CURSOR_EW_RESIZE, SDL_SYSTEM_CURSOR_NS_RESIZE, SDL_SYSTEM_CURSOR_CROSSHAIR,
    SDL_SYSTEM_CURSOR_MOVE, SDL_SYSTEM_CURSOR_MOVE,  // grab / grabbing: SDL has no hand-grab cursor
    SDL_SYSTEM_CURSOR_NOT_ALLOWED};
  if (!gfx_on || shape < 0 || shape >= 10) return;
  if (!cache[shape]) cache[shape] = SDL_CreateSystemCursor(sys[shape]);
  if (cache[shape]) SDL_SetCursor(cache[shape]);
}
int32_t hal_pixel_scale(void) { return gfx_on ? K : 1; }
void* hal_window_handle(void) { return win; }
double hal_fixed_dt(void) {
  static double v = getenv("ZINC_FIXED_DT") ? atof(getenv("ZINC_FIXED_DT")) : 0;
  return v;
}
}
