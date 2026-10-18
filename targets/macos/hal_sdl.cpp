// SDL3 HAL for macos and linux (TGT-MAC-02, D-05): window, renderer, keyboard/mouse input.
#include <string>
#include "hal.h"
#include "hal_window.h"
#include "zrt_raster.h"   // move_pixels (HalFrame.move, ZN-744)
#include <SDL3/SDL.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <condition_variable>
#include <mutex>
#include <algorithm>
#include <atomic>
#include <thread>
#include <vector>

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
extern "C" __attribute__((weak)) void hal_sdl_window_background(void*, uint32_t) {}   // the same: the window's own colour, behind the frame
#endif
static HalWindowConfig wcfg;   // ZN-233 / ZN-249: window properties from zinc.json app.window
static bool wcfg_set = false;
extern "C" void hal_set_window_config(const HalWindowConfig* c) { wcfg = *c; wcfg_set = true; }
// zinc.json app.window minWidth / minHeight / maxWidth / maxHeight / aspectRatio: the window manager holds the size there while it is dragged
static void window_limits(SDL_Window* w) {
  if (!wcfg_set) return;
  if (wcfg.min_w > 0 || wcfg.min_h > 0) SDL_SetWindowMinimumSize(w, wcfg.min_w, wcfg.min_h);
  if (wcfg.max_w > 0 || wcfg.max_h > 0) SDL_SetWindowMaximumSize(w, wcfg.max_w, wcfg.max_h);
  if (wcfg.aspect > 0) SDL_SetWindowAspectRatio(w, wcfg.aspect, wcfg.aspect);
}
static uint32_t* tbuf;         // transparent windows: the rows being uploaded with their alpha
static size_t tbuf_n;
static bool surface_ok;        // the surface of the current size is allocated
static bool shown;             // the main window is created hidden and shown by its first present, so it never appears blank (ZN-446)
#ifdef __ANDROID__
#include <android/native_window.h>
#include <sys/system_properties.h>
#include "zn/app.h"   // ZN_APP_ANDROID_SUSTAINED
static int anw_mode;          // present into the window's buffer (ZN-743, anw_present): 0 SDL_Renderer; 1 copied from fb; 2 RGB_565 packed from fb; 3 drawn in place (default)
static bool anw_bgra;         // ask for HAL format 5 (BGRA_8888, the raster's byte order): below API 26, or ZINC_PRESENT_BGRA=1 (0: RGBX_8888)
static ANativeWindow* anw;    // our reference to the window's surface (SDL releases its own when the surface goes away)
static bool anw_locked;       // the CPU is connected to the surface's buffer queue (a lock since the surface came or was let go, window_kind)
#endif
#ifdef SDL_PLATFORM_IOS
// The software raster draws into memory the GPU reads, shown through the window's CAMetalLayer (ZN-627, hal_metal.mm): no SDL_Renderer, no
// texture upload. ZINC_PRESENT=texture keeps SDL_Renderer.
extern "C" bool hal_mtl_open(SDL_Window* w);
extern "C" uint32_t* hal_mtl_pixels(int w, int h);
extern "C" void hal_mtl_wait(void);
extern "C" void hal_mtl_present(void);
extern "C" void hal_mtl_close(void);
static bool mtl_on;
#endif

#ifdef ZN_HAL_GL
// The window presents with OpenGL and replays the frame's command lists on the GPU (ZN-412.02, runtime/gl_replay.cpp): no software raster
// per frame. The SDL_Renderer path stays for ZINC_RENDERER=cpu, transparent windows, display plugins, and when no hardware GL comes up
// (none, llvmpipe, Apple's software renderer); screenshots and tests keep the software raster of the runtime. macOS links OpenGL.framework; Linux loads
// its functions through SDL (ZN-412.06).
#ifdef __APPLE__
#include <OpenGL/gl3.h>
static bool zgl_load() { return true; }
#elif defined(__ANDROID__)
// Android (Zinc Next, ZN-622): an OpenGL ES 2 context, libGLESv2 linked, the replay's GLES 2 path (GLR_CORE 0, as plugins/display-gl on the Pi
// and webOS): Tegra 3 (Nexus 7 2012) has no GLES 3
#include <GLES2/gl2.h>
#define ZGL_ES 1
static bool zgl_load() { return true; }
#else
// Linux (ZN-412.06): glad's types and names with GLAD_API_CALL static, a private table of this file filled through SDL_GL_GetProcAddress. Nothing is
// exported, so the WebGL module's own glad (libzn_webgl, which resolves symbols against zinc) cannot interpose, and zinc does not link libGL.
#define GLAD_API_CALL static
#include <glad/gl.h>
#define ZGL_FUNCS(X) X(ActiveTexture) X(AttachShader) X(BindAttribLocation) X(BindBuffer) X(BindFramebuffer) X(BindRenderbuffer) X(BindTexture) \
  X(BindVertexArray) X(BlendFunc) X(BufferData) X(BufferSubData) X(CheckFramebufferStatus) X(Clear) X(ClearColor) X(ClearDepth) X(ClearStencil) \
  X(ColorMask) X(CompileShader) X(CompressedTexImage2D) X(CopyTexSubImage2D) X(CreateProgram) X(CreateShader) X(DeleteProgram) X(DeleteShader) \
  X(DeleteTextures) X(DepthFunc) X(DepthMask) X(Disable) X(DisableVertexAttribArray) X(DrawArrays) X(DrawArraysInstanced) X(DrawElements) \
  X(Enable) X(EnableVertexAttribArray) X(Finish) X(FramebufferRenderbuffer) X(FramebufferTexture2D) X(GenBuffers) X(GenFramebuffers) \
  X(GenRenderbuffers) X(GenTextures) X(GenVertexArrays) X(GetAttribLocation) X(GetError) X(GetFramebufferAttachmentParameteriv) X(GetIntegerv) \
  X(GetProgramiv) X(GetShaderInfoLog) X(GetShaderiv) X(GetString) X(GetUniformLocation) X(LinkProgram) X(PixelStorei) X(ReadPixels) \
  X(RenderbufferStorage) X(Scissor) X(ShaderSource) X(StencilFunc) X(StencilMask) X(StencilOp) X(StencilOpSeparate) X(TexImage2D) \
  X(TexParameteri) X(TexSubImage2D) X(Uniform1f) X(Uniform1fv) X(Uniform1i) X(Uniform2f) X(Uniform3f) X(Uniform3fv) X(Uniform4f) X(Uniform4fv) \
  X(UseProgram) X(VertexAttribDivisor) X(VertexAttribPointer) X(Viewport)
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
#ifdef ZGL_ES   // the sources as they are, with display-gl's precision (Tegra 3 has no fragment highp)
  static const char* pre_vs = "#version 100\n";
  static const char* pre_fs = "#version 100\n#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\n";
#else
  static const char* pre_vs = "#version 150\n#define attribute in\n#define varying out\n";
  static const char* pre_fs = "#version 150\n#define varying in\n#define texture2D texture\nout vec4 zgl_color;\n#define gl_FragColor zgl_color\n";
#endif
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
#ifdef ZGL_ES
#define GLR_CORE 0
#else
#define GLR_CORE 1
#endif
#include "gl_replay.cpp"
static SDL_GLContext glctx;
static bool gl_on, glr_ok, glr_made, glr_stale, gl_tex_ok;   // the window presents with GL; the replay works; it was set up; its size is stale; its texture holds the last frame
static GLuint gl_prog, gl_quad, gl_upload, gl_vao;
static GLint gl_u_tex, gl_u_bgr, gl_u_rot, gl_u_alpha, gl_u_src;
// the present pass: a texture of the surface over the window (rows top first); u_bgr for the software rows (bytes B, G, R)
// u_rot: cos and sin of the picture's turn (a simulated device turned while its program keeps its orientation: zinc run --simulate)
static const char* kPresentVS = "attribute vec2 a_pos; varying vec2 v_uv; uniform vec2 u_rot; uniform vec4 u_src; void main() { v_uv = u_src.xy + vec2(a_pos.x, 1.0 - a_pos.y) * u_src.zw; vec2 p = a_pos * 2.0 - 1.0;\n"
  "  gl_Position = vec4(p.x * u_rot.x - p.y * u_rot.y, p.x * u_rot.y + p.y * u_rot.x, 0.0, 1.0); }\n";
// u_alpha: the GPU layers' frame (premultiplied), its transparency in the alpha byte (0: opaque, what the raster leaves there; layers_present)
static const char* kPresentFS = "varying vec2 v_uv; uniform sampler2D u_tex; uniform float u_bgr; uniform float u_alpha;\n"
  "void main() { vec4 t = texture2D(u_tex, v_uv); gl_FragColor = vec4(u_bgr > 0.5 ? t.bgr : t.rgb, u_alpha > 0.5 ? 1.0 - t.a : 1.0); }\n";
/** Creates the window with an OpenGL context; false (nothing left behind) without a hardware context, unless ZINC_RENDERER=gl. */
static bool gl_window(const char* title, int ww, int wh, bool full = false) {
  const char* rr = getenv("ZINC_RENDERER");
  const bool force = rr && !strcmp(rr, "gl");
#ifdef ZGL_ES
  SDL_GL_SetAttribute(SDL_GL_CONTEXT_MAJOR_VERSION, 2);
  SDL_GL_SetAttribute(SDL_GL_CONTEXT_MINOR_VERSION, 0);
  SDL_GL_SetAttribute(SDL_GL_CONTEXT_PROFILE_MASK, SDL_GL_CONTEXT_PROFILE_ES);
  SDL_GL_SetAttribute(SDL_GL_DEPTH_SIZE, 16);   // what Tegra 3's window surfaces offer
#else
  SDL_GL_SetAttribute(SDL_GL_CONTEXT_MAJOR_VERSION, 3);
  SDL_GL_SetAttribute(SDL_GL_CONTEXT_MINOR_VERSION, 2);
  SDL_GL_SetAttribute(SDL_GL_CONTEXT_PROFILE_MASK, SDL_GL_CONTEXT_PROFILE_CORE);
  SDL_GL_SetAttribute(SDL_GL_CONTEXT_FLAGS, SDL_GL_CONTEXT_FORWARD_COMPATIBLE_FLAG);
  SDL_GL_SetAttribute(SDL_GL_DEPTH_SIZE, 24);   // the replay's occlusion pass
#endif
  SDL_GL_SetAttribute(SDL_GL_DOUBLEBUFFER, 1);
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
  if (full) SDL_SetBooleanProperty(props, SDL_PROP_WINDOW_CREATE_FULLSCREEN_BOOLEAN, true);
  SDL_SetBooleanProperty(props, SDL_PROP_WINDOW_CREATE_HIDDEN_BOOLEAN, true);   // shown once a frame is in it: no blank window (ZN-446)
  win = SDL_CreateWindowWithProperties(props);
  SDL_DestroyProperties(props);
  if (!win) return false;
  if (glctx && gl_prog) {   // a window made again for the context kept, its programs and textures (Android's GPU layers, window_kind)
    if (SDL_GL_MakeCurrent(win, glctx)) { window_limits(win); SDL_GL_SetSwapInterval(getenv("ZINC_VSYNC") && atoi(getenv("ZINC_VSYNC")) == 0 ? 0 : 1); return true; }
    SDL_DestroyWindow(win);
    win = nullptr;
    return false;
  }
  glctx = SDL_GL_CreateContext(win);
  const char* r = glctx && SDL_GL_MakeCurrent(win, glctx) && zgl_load() ? (const char*)glGetString(GL_RENDERER) : nullptr;
  const bool soft = r && (strstr(r, "llvmpipe") || strstr(r, "softpipe") || strstr(r, "Software"));
  if (r && (!soft || force)) {
#ifndef ZGL_ES   // GLES 2 has no vertex array objects
    glGenVertexArrays(1, &gl_vao);   // core profile: one VAO bound for the whole program
    glBindVertexArray(gl_vao);
#endif
    gl_prog = zgl_program("", kPresentVS, kPresentFS);
  }
  if (!r || (soft && !force) || !gl_prog) {
    if (glctx) SDL_GL_DestroyContext(glctx);
    glctx = nullptr;
    SDL_DestroyWindow(win);
    win = nullptr;
    return false;
  }
  gl_u_tex = glGetUniformLocation(gl_prog, "u_tex"); gl_u_bgr = glGetUniformLocation(gl_prog, "u_bgr"); gl_u_rot = glGetUniformLocation(gl_prog, "u_rot");
  gl_u_alpha = glGetUniformLocation(gl_prog, "u_alpha"); gl_u_src = glGetUniformLocation(gl_prog, "u_src");
  glUseProgram(gl_prog); glUniform4f(gl_u_src, 0, 0, 1, 1);   // the whole texture (gl_show draws parts of it for a rotated scroll area)
  static const float q[] = {0, 0, 1, 0, 0, 1, 1, 1};
  glGenBuffers(1, &gl_quad);
  glBindBuffer(GL_ARRAY_BUFFER, gl_quad);
  glBufferData(GL_ARRAY_BUFFER, sizeof q, q, GL_STATIC_DRAW);
  glGenTextures(1, &gl_upload);
  glBindTexture(GL_TEXTURE_2D, gl_upload);
  glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR); glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
  glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE); glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
  window_limits(win);
  SDL_GL_SetSwapInterval(getenv("ZINC_VSYNC") && atoi(getenv("ZINC_VSYNC")) == 0 ? 0 : 1);   // shown by its first present (hal_present)
  if (getenv("ZINC_GL_STATS")) fprintf(stderr, "zinc: window renderer gl (%s, %s)\n", r, (const char*)glGetString(GL_VERSION));   // macOS: "4.1 Metal - ...", Apple's GL on Metal
#ifdef __ANDROID__   // the EGL side of the capability record
  typedef const char* (*EglQuery)(void*, int);
  if (EglQuery query = (EglQuery)SDL_EGL_GetProcAddress("eglQueryString")) glr::egl_extensions = query(SDL_EGL_GetCurrentDisplay(), 0x3055 /* EGL_EXTENSIONS */);
#endif
  glr::probe();   // the context's capability record (ZINC_GL_INFO prints it)
  return true;
}
// zinc run --simulate (docs/guide/09-web-apis.md "Simulated devices"): the device turned in the panel, in quarter turns clockwise. A program
// that turns with it (screen.orientation.unlock()) gets a surface of the window's new shape; any other keeps its own and is shown turned.
static int sim_turn = 0;   // the picture's quarter turns clockwise (0 when the program follows)
static int turned_w() { return sim_turn & 1 ? PH : PW; }
static int turned_h() { return sim_turn & 1 ? PW : PH; }
// the surface's place in the window, letterboxed like SDL_LOGICAL_PRESENTATION_LETTERBOX: origin and scale in window points
static void letterbox(float* ox, float* oy, float* sc) {
  int ww = 1, wh = 1;
  SDL_GetWindowSize(win, &ww, &wh);
  const float s = SDL_min((float)ww / turned_w(), (float)wh / turned_h());
  *sc = s > 0 ? s : 1; *ox = (ww - turned_w() * *sc) * 0.5f; *oy = (wh - turned_h() * *sc) * 0.5f;
}
#endif
// window points <-> surface pixels (the SDL_Renderer's logical presentation, or the GL window's letterbox)
static void from_window(float wx, float wy, float* sx, float* sy) {
  if (ren) { SDL_RenderCoordinatesFromWindow(ren, wx, wy, sx, sy); return; }
#ifdef ZN_HAL_GL
  float ox, oy, sc;
  letterbox(&ox, &oy, &sc);
  const float dx = (wx - ox) / sc, dy = (wy - oy) / sc;   // in the turned picture, then back to the surface
  if (sim_turn == 1) { *sx = dy; *sy = PH - dx; }
  else if (sim_turn == 2) { *sx = PW - dx; *sy = PH - dy; }
  else if (sim_turn == 3) { *sx = PW - dy; *sy = dx; }
  else { *sx = dx; *sy = dy; }
#else   // no renderer and no GL (iOS's Metal present): the surface is shown aspect-fit in the window
  int ww = 1, wh = 1;
  SDL_GetWindowSize(win, &ww, &wh);
  const float s = SDL_min((float)ww / PW, (float)wh / PH);
  *sx = (wx - (ww - PW * s) * 0.5f) / s; *sy = (wy - (wh - PH * s) * 0.5f) / s;
#endif
}
static void to_window(float sx, float sy, float* wx, float* wy) {
  if (ren) { SDL_RenderCoordinatesToWindow(ren, sx, sy, wx, wy); return; }
#ifdef ZN_HAL_GL
  float ox, oy, sc;
  letterbox(&ox, &oy, &sc);
  *wx = sx * sc + ox; *wy = sy * sc + oy;
#else
  int ww = 1, wh = 1;
  SDL_GetWindowSize(win, &ww, &wh);
  const float s = SDL_min((float)ww / PW, (float)wh / PH);
  *wx = sx * s + (ww - PW * s) * 0.5f; *wy = sy * s + (wh - PH * s) * 0.5f;
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
#ifdef __ANDROID__
  if (anw_mode) { free(fb); fb = nullptr; return; }   // made by the first present at this size (anw_present)
#endif
#ifdef SDL_PLATFORM_IOS
  if (mtl_on) { fb = hal_mtl_pixels(PW, PH); return; }   // the buffer the GPU reads (hal_metal.mm); not freed here
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
// macOS blocks the event loop while the window's edge is dragged (AppKit's tracking loop runs inside SDL_PollEvent), and the zoom button and
// window tiling animate the same way: SDL calls this watcher from inside that loop, at each size change and at 60 Hz (the live-resize expose of
// SDL_OnWindowLiveResizeUpdate). The program draws a whole frame here (zrt_redraw: the engine runs its frame step), at the new size, so the
// layout follows the mouse and animations, timers and video keep going; the window server never has to stretch an old frame.
static bool in_watch;                     // a frame drawn from the watcher: its poll takes what is queued without pumping (no tracking loop inside one)
static int live_frames, live_w, live_h;   // frames presented from the watcher and the size of the last (ZINC_LIVE_RESIZE, tests)
static bool SDLCALL watch(void*, SDL_Event* e) {
  // only on the thread that draws: Android sends the size changes from its UI thread, where a redraw makes the GL context current on a second
  // thread (eglMakeCurrent crashed the Tegra 3 driver, ZN-622); the poll of the next frame applies them there
  if (!SDL_IsMainThread() || in_watch) return true;
  // the expose of SDL's 60 Hz timer keeps animations going while the mouse holds still; after a size change it has nothing new to show
  static bool sized;   // a frame was drawn for a size change since the timer's last expose
  const bool size = e->type == SDL_EVENT_WINDOW_PIXEL_SIZE_CHANGED;
  if (size || (e->type == SDL_EVENT_WINDOW_EXPOSED && !sized)) {
    in_watch = true;
    apply_size();
    zrt_redraw();
    in_watch = false;
  }
  if (e->type == SDL_EVENT_WINDOW_EXPOSED || size) sized = size;
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

// The window comes to the front with the keyboard when it is first shown: a program started from a terminal or from another
// app (Zinc Atelier) would open behind it. Not in a deterministic run (tests) nor in a kiosk (it is already above everything).
static void show_main() {
  SDL_ShowWindow(win);
  if (!det && !kiosk && !getenv("ZINC_NO_RAISE") && !(getenv("ZINC_BACKGROUND") && getenv("ZINC_BACKGROUND")[0] != '0')) SDL_RaiseWindow(win);
}

// An app shell on SDL's main callbacks (Zinc Next, ZN-620) takes the events off SDL's queue itself and hands them here (zn_app_event); the poll
// reads them first. A mutex: SDL delivers the lifecycle events from the platform's thread (Android's UI thread).
static std::mutex app_ev_mu;
static SDL_Event app_ev[256];
static int app_ev_head, app_ev_n;
extern "C" void zn_hal_sdl_event(const void* e) {
  std::lock_guard<std::mutex> g(app_ev_mu);
  if (app_ev_n < 256) app_ev[(app_ev_head + app_ev_n++) % 256] = *(const SDL_Event*)e;
}
// an app shell on SDL's main callbacks pumps between frames, never inside one (src/app/shell_sdl.cpp: Android's pump blocks once it has paused the app)
static bool no_pump;
extern "C" void zn_hal_sdl_no_pump(int on) { no_pump = on != 0; }
static bool next_event(SDL_Event* e) {
  {
    std::lock_guard<std::mutex> g(app_ev_mu);
    if (app_ev_n > 0) { *e = app_ev[app_ev_head]; app_ev_head = (app_ev_head + 1) % 256; app_ev_n--; return true; }
  }
  if (in_watch || no_pump) return SDL_PeepEvents(e, 1, SDL_GETEVENT, SDL_EVENT_FIRST, SDL_EVENT_LAST) > 0;   // inside AppKit's loop: what it queued, no pump
  return SDL_PollEvent(e);
}

// The system's signals (src/host/hal_dispatch.cpp zn_hal_signal; docs/ui.md "System signals"): the theme and the safe area at the start and when
// they change, the back key (Android), the on-screen keyboard hidden, the IME's composition, the display's orientation. Weak: the prototype's
// build links no dispatcher.
extern "C" __attribute__((weak)) void zn_hal_signal(const char*);
static void sys_signal(const char* line) { if (zn_hal_signal) zn_hal_signal(line); }
static void signal_theme() {
  const SDL_SystemTheme t = SDL_GetSystemTheme();
  if (t != SDL_SYSTEM_THEME_UNKNOWN) sys_signal(t == SDL_SYSTEM_THEME_DARK ? "theme dark" : "theme light");
}
static void signal_safe_area() {   // window points into the surface's units
  SDL_Rect r;
  int ww = 0, wh = 0;
  if (!win || !SDL_GetWindowSafeArea(win, &r)) return;
  SDL_GetWindowSize(win, &ww, &wh);
  if (ww <= 0 || wh <= 0) return;
  const float kx = (float)W / ww, ky = (float)H / wh;
  char b[96];
  snprintf(b, sizeof b, "safearea %d %d %d %d", (int)(r.y * ky + 0.5f), (int)((ww - r.x - r.w) * kx + 0.5f), (int)((wh - r.y - r.h) * ky + 0.5f), (int)(r.x * kx + 0.5f));
  sys_signal(b);
}
// A player started another program in the same window (Zinc Go, src/app/player.cpp): it hears the theme and the safe area again, as a
// program does when the window opens
extern "C" void zn_hal_sdl_resignal(void) { signal_theme(); signal_safe_area(); }
static void signal_event(const SDL_Event& e) {
  if (e.type == SDL_EVENT_SYSTEM_THEME_CHANGED) signal_theme();
  else if (e.type == SDL_EVENT_WINDOW_SAFE_AREA_CHANGED || e.type == SDL_EVENT_WINDOW_PIXEL_SIZE_CHANGED) signal_safe_area();
  else if (e.type == SDL_EVENT_KEY_DOWN && e.key.scancode == SDL_SCANCODE_AC_BACK && !e.key.repeat) sys_signal("back");
  else if (e.type == SDL_EVENT_SCREEN_KEYBOARD_HIDDEN) sys_signal("keyboard 0");   // its height comes from the phone's glue (src/app)
  else if (e.type == SDL_EVENT_TEXT_EDITING) { std::string c = "compose "; c += e.edit.text ? e.edit.text : ""; sys_signal(c.c_str()); }
  else if (e.type == SDL_EVENT_DISPLAY_ORIENTATION && e.display.data1 != SDL_ORIENTATION_UNKNOWN)
    sys_signal(e.display.data1 == SDL_ORIENTATION_PORTRAIT || e.display.data1 == SDL_ORIENTATION_PORTRAIT_FLIPPED ? "orientation portrait" : "orientation landscape");
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
  // the app's name for SDL (the items of the app menu it builds: About, Hide, Quit). The title the menu bar prints is the executable's
  // file name: `zinc run` starts the program through a link that carries it (ZN-733; NSProcessInfo's processName changes nothing there)
  if (cfg->title && cfg->title[0] && strcmp(cfg->title, "zinc")) SDL_SetAppMetadata(cfg->title, nullptr, nullptr);
  // ZINC_BACKGROUND=1 (zinc --background): a program started by a script, a test or an agent opens its window without taking the focus from what the person is doing
  if ((getenv("ZINC_BACKGROUND") && getenv("ZINC_BACKGROUND")[0] != '0')) {
#ifdef SDL_HINT_WINDOW_ACTIVATE_WHEN_SHOWN
    SDL_SetHint(SDL_HINT_WINDOW_ACTIVATE_WHEN_SHOWN, "0");
#endif
#ifdef SDL_HINT_WINDOW_ACTIVATE_WHEN_RAISED
    SDL_SetHint(SDL_HINT_WINDOW_ACTIVATE_WHEN_RAISED, "0");
#endif
#ifdef SDL_HINT_MAC_BACKGROUND_APP
    SDL_SetHint(SDL_HINT_MAC_BACKGROUND_APP, "1");   // no Dock icon, never the active application
#endif
  }
  SDL_SetHint(SDL_HINT_IME_IMPLEMENTED_UI, "composition");   // zinc:ui draws the composing text in the field (SDL_EVENT_TEXT_EDITING)
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
#ifdef ZGL_ES   // Android: the software raster unless ZINC_RENDERER=gl. On the Nexus 7 2012 (Tegra 3) the GLES 2 replay presents rn-showcase in 89 ms
    // (p50) against 15 ms for the raster uploaded through SDL_Renderer (ZN-622): the replay is not faster there yet
    const bool want_gl = rr && !strcmp(rr, "gl");
#else
    const bool want_gl = !(rr && !strcmp(rr, "cpu"));
#endif
    if (want_gl && !(wcfg_set && wcfg.transparent) && !hal_display) gl_on = gl_window(cfg->title, ww, wh);
    zrt::gfx::gpu_strokes = gl_on;   // the replay draws strokes on the GPU (ZN-590.01)
    zrt::gfx::shaders_drawn = gl_on; glr::shader_source = zrt::gfx::shaderSource;   // and the programs' shaders (ZN-746)
  }
  if (!gl_on) {
    if (getenv("ZINC_GL_STATS")) fprintf(stderr, "zinc: window renderer cpu\n");
#endif
#ifdef __ANDROID__
  { const char* p = getenv("ZINC_PRESENT"); anw_mode = p && !strcmp(p, "texture") ? 0 : p && !strcmp(p, "565") ? 2 : p && !strcmp(p, "shadow") ? 1 : 3; }
  if (const char* p = getenv("ZINC_PRESENT_BGRA")) anw_bgra = atoi(p) != 0;
  else { char v[PROP_VALUE_MAX] = ""; __system_property_get("ro.build.version.sdk", v); anw_bgra = atoi(v) > 0 && atoi(v) < 26; }
  if (anw_mode) {   // the raster draws into the window's buffer (anw_present): a window without a renderer
    if (!(win = SDL_CreateWindow(cfg->title, ww, wh, SDL_WINDOW_RESIZABLE | SDL_WINDOW_HIGH_PIXEL_DENSITY | SDL_WINDOW_HIDDEN))) hal_panic(SDL_GetError(), "hal_sdl", __LINE__);
  } else
#endif
#ifdef SDL_PLATFORM_IOS
  if (!(getenv("ZINC_PRESENT") && !strcmp(getenv("ZINC_PRESENT"), "texture"))) {
    if (!(win = SDL_CreateWindow(cfg->title, ww, wh, SDL_WINDOW_RESIZABLE | SDL_WINDOW_HIGH_PIXEL_DENSITY | SDL_WINDOW_HIDDEN | SDL_WINDOW_METAL))) hal_panic(SDL_GetError(), "hal_sdl", __LINE__);
    if (!(mtl_on = hal_mtl_open(win)) && !(ren = SDL_CreateRenderer(win, nullptr))) hal_panic(SDL_GetError(), "hal_sdl", __LINE__);
  } else
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
    window_limits(win);
#ifdef __APPLE__
    if (wcfg.transparent) hal_sdl_transparent_layers(SDL_GetPointerProperty(SDL_GetWindowProperties(win), SDL_PROP_WINDOW_COCOA_WINDOW_POINTER, nullptr));
#endif
  }
#ifdef ZN_HAL_GL
  }
#endif
#if defined(__ANDROID__) || defined(SDL_PLATFORM_IOS)
  // the window is the screen (Zinc Next, ZN-622; iOS ZN-624): the program follows it, in logical pixels of the screen's density (a whole zoom: the
  // Nexus 7 2012's 1.33 stays 1); a deterministic run keeps its fixed surface, letterboxed. The part of the scale the window's pixel density
  // does not already give: all of it on Android (sizes in pixels), none on iOS (sizes in points, density 3 on an iPhone)
  if (!det) fill = true;
  { const float ds = SDL_GetWindowDisplayScale(win) / SDL_GetWindowPixelDensity(win); zoom = ds >= 1.5f ? (int)(ds + 0.5f) : 1; }
#endif
  // a fixed surface (letterbox) keeps its proportions while the window is resized, so it never shows bars
  if (!fill) { const float a = (float)W / (float)H; SDL_SetWindowAspectRatio(win, a, a); }
  if (ren) SDL_SetRenderVSync(ren, 1);
  start_workers();
  if (full) { show_main(); shown = true; set_fullscreen(true); SDL_SyncWindow(win); }   // fullscreen applies to a shown window: no wait on a hidden one
  if (kiosk) { SDL_HideCursor(); SDL_SetWindowAlwaysOnTop(win, true); }
  // HiDPI: frames are rasterized at the window's pixel size, so text and shapes stay sharp (ZINC_SCALE overrides)
  apply_size();
  SDL_AddEventWatch(watch, nullptr);
  signal_theme();
  signal_safe_area();
}
void hal_shutdown(void) {
  if (!gfx_on) return;
#ifdef ZN_HAL_GL
  if (glctx) SDL_GL_DestroyContext(glctx);
#endif
#ifdef __ANDROID__
  if (anw) ANativeWindow_release(anw);
#endif
#ifdef SDL_PLATFORM_IOS
  if (mtl_on) hal_mtl_close();
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

// The simulated device's turn (its panel's state) and whether the program turns with it (what it asked, <state>.app), read five times a
// second: the window takes the device's shape, the surface follows it or the picture is turned.
// The control panel of the simulated device (ZINC_SIM_DOCK: the device's state file) stays docked under the program's window, as wide as
// it: the program's window writes where it is to <state>.win.
static void sim_dock(const char* st) {
  FILE* f = fopen((std::string(st) + ".win").c_str(), "r");
  if (!f) return;
  int x = 0, y = 0, w = 0, h = 0;
  const bool ok = fscanf(f, "%d %d %d %d", &x, &y, &w, &h) == 4;
  fclose(f);
  if (!ok || w <= 0) return;
  int top = 0, left = 0, bottom = 0, right = 0, mw = 0, mh = 0, mx = 0, my = 0;
  SDL_GetWindowBordersSize(win, &top, &left, &bottom, &right);
  SDL_GetWindowSize(win, &mw, &mh);
  SDL_GetWindowPosition(win, &mx, &my);
  if (mw != w) SDL_SetWindowSize(win, w, mh);
  if (mx != x || my != y + h + top + 4) SDL_SetWindowPosition(win, x, y + h + top + 4);
}
static void sim_turned() {
  static const char* st = getenv("ZINC_SIM_STATE");
  static const char* dock = getenv("ZINC_SIM_DOCK");
  static uint64_t at = 0;
  static int device = 0;
  static bool follows = false, base_fill = false, known = false;
  if ((!st && !dock) || !gfx_on || !win || SDL_GetTicks() - at < 200) return;
  at = SDL_GetTicks();
  if (dock) { sim_dock(dock); return; }
  {   // where this window is, for the panel docked under it
    static int last[4] = {-1, -1, -1, -1};
    int r[4] = {0, 0, 0, 0};
    SDL_GetWindowPosition(win, &r[0], &r[1]);
    SDL_GetWindowSize(win, &r[2], &r[3]);
    if (memcmp(r, last, sizeof r) != 0) {
      memcpy(last, r, sizeof r);
      const std::string path = std::string(st) + ".win";
      if (FILE* f = fopen((path + ".new").c_str(), "w")) { fprintf(f, "%d %d %d %d\n", r[0], r[1], r[2], r[3]); fclose(f); rename((path + ".new").c_str(), path.c_str()); }
    }
  }
  if (!known) { known = true; base_fill = fill; fill = false; }   // a simulated device's screen has its size: the window only scales it
  auto value = [](const std::string& path, const char* key) {
    FILE* f = fopen(path.c_str(), "r");
    std::string v;
    if (!f) return v;
    char line[256];
    const size_t n = strlen(key);
    while (fgets(line, sizeof line, f)) if (!strncmp(line, key, n) && line[n] == '=') { v = line + n + 1; while (!v.empty() && (v.back() == '\n' || v.back() == '\r')) v.pop_back(); }
    fclose(f);
    return v;
  };
  const std::string rot = value(st, "rotation"), want = value(std::string(st) + ".app", "orientation");
  const int turn = rot.empty() ? device : (atoi(rot.c_str()) / 90) & 3;
  const bool follow = want == "any";
  if (turn == device && follow == follows) return;
  static int base_w = 0, base_h = 0;   // the device's surface, untouched by turns (logical pixels)
  if (!base_w) { base_w = W; base_h = H; }
  device = turn; follows = follow;
#ifdef ZN_HAL_GL   // the GL window turns the picture; the SDL_Renderer path has no turn (and no sim_turn: a build without ZN_HAL_GL, Android's, ZN-622)
  sim_turn = follow ? 0 : turn;
#endif
  (void)base_fill;
  // the surface: the device's own size, its sides swapped when the program follows a quarter turn
  const int sw = follow && (turn & 1) ? base_h : base_w, sh = follow && (turn & 1) ? base_w : base_h;
  if (sw != W || sh != H) { W = sw; H = sh; PW = W * K; PH = H * K; alloc_surface(); }
  // the window: the picture as the device shows it (turned or not), scaled down to fit the screen, never from its current size
  const int pw = (turn & 1) ? base_h : base_w, ph = (turn & 1) ? base_w : base_h;
  float s = (float)zoom;
  SDL_Rect usable;
  if (SDL_GetDisplayUsableBounds(SDL_GetDisplayForWindow(win), &usable)) s = SDL_min(s, SDL_min((usable.w - 40) / (float)pw, (usable.h - 60) / (float)ph));
  SDL_SetWindowSize(win, (int)(pw * s), (int)(ph * s));
  zrt_redraw();
}

// ZINC_LIVE_RESIZE=n (tests/t1/window_live_resize.sh): a drag of the window's corner as AppKit runs it, without a mouse. Inside one poll, n size
// steps (out and back), each followed by the live-resize expose SDL's timer sends; each step must present a frame of the new size from the watcher.
static void live_resize_sim(int n) {
  int w0 = 0, h0 = 0, drawn = 0;
  SDL_GetWindowSize(win, &w0, &h0);
  uint64_t worst = 0, total = 0;
  const bool log = getenv("ZINC_LIVE_RESIZE_LOG") != nullptr;
  for (int i = 1; i <= n; i++) {
    const int d = i <= n / 2 ? i : n - i, w = w0 + 3 * d, h = h0 + 2 * d;
    const int before = live_frames;
    const uint64_t t0 = SDL_GetTicksNS();
    SDL_SetWindowSize(win, w, h);   // AppKit's setFrame: windowDidResize sends the size events to the watcher
    SDL_Event ev;
    SDL_zero(ev);
    ev.type = SDL_EVENT_WINDOW_EXPOSED; ev.window.windowID = SDL_GetWindowID(win); ev.window.data1 = 1;
    SDL_PushEvent(&ev);             // the 60 Hz expose of SDL_OnWindowLiveResizeUpdate
    const uint64_t dt = SDL_GetTicksNS() - t0;
    total += dt; if (dt > worst) worst = dt;
    int ww = 0, wh = 0;
    SDL_GetWindowSize(win, &ww, &wh);
    const bool ok = live_frames > before && live_w == PW && live_h == PH && (!fill || (W == ww / zoom && H == wh / zoom));
    drawn += ok;
    if (log) fprintf(stderr, "zinc: live resize step %d: window %dx%d, %d frames, last %dx%d%s\n", i, ww, wh, live_frames - before, live_w, live_h, ok ? "" : " (stale)");
  }
  fprintf(stderr, "zinc: live resize: %d of %d steps drawn at the new size, %.1f ms per step (worst %.1f)\n", drawn, n, total / 1e6 / (n ? n : 1), worst / 1e6);
  int lw = 0, lh = 0, hw = 0, hh = 0;   // the size limits of zinc.json hold: a drag far in and far out stops at them
  SDL_SetWindowSize(win, 1, 1); SDL_GetWindowSize(win, &lw, &lh);
  SDL_SetWindowSize(win, 100000, 100000); SDL_GetWindowSize(win, &hw, &hh);
  SDL_SetWindowSize(win, w0, h0);
  fprintf(stderr, "zinc: live resize: limits %dx%d to %dx%d\n", lw, lh, hw, hh);
  if (getenv("ZINC_LIVE_RESIZE_ZOOM")) {   // the green button: [NSWindow zoom:] animates the frame inside AppKit too
    const int before = live_frames;
    SDL_MaximizeWindow(win); SDL_SyncWindow(win);
    int zw = 0, zh = 0;
    SDL_GetWindowSize(win, &zw, &zh);
    fprintf(stderr, "zinc: live resize: zoom to %dx%d, %d frames from the watcher, last %dx%d\n", zw, zh, live_frames - before, live_w, live_h);
    SDL_RestoreWindow(win); SDL_SyncWindow(win);
  }
}

void hal_poll_input(HalInput* in) {
  in->nkeys = 0; in->ntext = 0; in->nbtn = 0; in->wheel_x = 0;
  if (resize_pending) { resize_pending = false; apply_size(); }
  sim_turned();
  static const int live_steps = getenv("ZINC_LIVE_RESIZE") ? atoi(getenv("ZINC_LIVE_RESIZE")) : 0;
  static int polls;
  if (live_steps > 0 && gfx_on && !in_watch && ++polls == 10) live_resize_sim(live_steps);
  // A display plugin with its own window (LED / OLED / e-ink emulators) still needs this HAL to pump the OS events,
  // unless it reads them itself (display-gl).
  if (!gfx_on && (!hal_display || hal_display->owns_input || !SDL_WasInit(SDL_INIT_VIDEO))) {
    if (frames_left >= 0 && frames_left-- == 0) quit = true;
    in->quit = quit;
    return;
  }
  SDL_Event e;
  const bool several = secs_open() > 0 || main_hidden;
  while (next_event(&e)) {
    if (several) {   // the events of the other windows are theirs; closing the main window hides it while they are open
      SDL_Window* ew = SDL_GetWindowFromEvent(&e);
      if (Sec* s = sec_of(ew)) { sec_event(*s, e); continue; }
      if (ew == win && e.type == SDL_EVENT_WINDOW_CLOSE_REQUESTED && secs_open()) { if (!close_handler || close_handler()) close_window(0); continue; }
    }
    if (e.type == SDL_EVENT_KEY_DOWN || e.type == SDL_EVENT_KEY_UP) {
      if (int32_t k = key_code(e.key.key)) key_push(in, k, e.type == SDL_EVENT_KEY_UP ? HAL_KEY_UP : e.key.repeat ? HAL_KEY_REPEAT : HAL_KEY_DOWN, e.key.mod, nullptr);
    }
    if (e.type == SDL_EVENT_TEXT_INPUT) key_push(in, 0, HAL_KEY_TEXT, SDL_GetModState(), e.text.text);
    signal_event(e);
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
static uint32_t* band_px;   // the buffer the bands write: fb, or the window's own (ZN-743); PW pixels per row
// The raster's pixel is 0x00RRGGBB (bytes B, G, R, 0); an RGBA window buffer takes R, G, B, A
static inline uint32_t to_rgba(uint32_t p) { return (p & 0x0000FF00u) | (p >> 16 & 0xFFu) | (p & 0xFFu) << 16 | 0xFF000000u; }
// An RGBA or RGBX window buffer (anw_present, ZN-750): each stripe is drawn into the thread's own cached rows, then written into the buffer
// once, red and blue swapped, columns swap_x0 to swap_x1 only (the rest of a damage box is the previous frame's)
static bool band_swap;
static int32_t swap_x0, swap_x1;
static void run_band(int i) {
  uint64_t t0 = band_prof ? hal_time_us() : 0;
  for (int32_t a; (a = band_y0 + band_next.fetch_add(1, std::memory_order_relaxed) * kStripe) < band_y1;) {
    const int32_t e = a + kStripe < band_y1 ? a + kStripe : band_y1;
    if (!band_swap) { band_fn(band_px + (size_t)a * PW, a, e); continue; }
    thread_local std::vector<uint32_t> rows;
    rows.resize((size_t)kStripe * PW);
    band_fn(rows.data(), a, e);
    for (int32_t y = a; y < e; y++) {
      const uint32_t* s = rows.data() + (size_t)(y - a) * PW;
      uint32_t* d = band_px + (size_t)y * PW;
      for (int32_t x = swap_x0; x < swap_x1; x++) d[x] = to_rgba(s[x]);
    }
  }
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
#ifdef _WIN32   // windows: SDL's own threads (_beginthreadex); zig's winpthreads std::thread errs here ("Bad file descriptor")
  if (getenv("ZN_USB_DEBUG")) fprintf(stderr, "start_workers n=%d stripe=%d\n", n, kStripe);
  for (int i = 1; i < n; i++) SDL_DetachThread(SDL_CreateThread([](void* p) -> int { band_worker(static_cast<int>((size_t)p)); return 0; }, "zinc-band", (void*)(size_t)i));
#else
  for (int i = 1; i < n; i++) std::thread(band_worker, i).detach();
#endif
  workers = n > 1 ? n - 1 : 0;
}
static void render_rows_parallel(void (*fn)(uint32_t*, int32_t, int32_t), int32_t y0, int32_t y1, uint32_t* px = nullptr) {
  band_prof = zrt_profiling() != 0;
  band_px = px ? px : fb;
  if (workers == 0 || y1 - y0 < 2 * kStripe) {
    if (band_swap) { band_fn = fn; band_y0 = y0; band_y1 = y1; band_next.store(0, std::memory_order_relaxed); run_band(0); return; }
    uint64_t t0 = band_prof ? hal_time_us() : 0;
    fn(band_px + (size_t)y0 * PW, y0, y1);
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

// ZINC_PRESENT_STATS=1 (ZN-743): where a present goes, step by step (raster the damaged rows, upload them, draw the window, swap or post), p50 and
// p99 over every 120 frames that drew something, on stderr (logcat on Android)
enum { PS_RASTER, PS_UPLOAD, PS_DRAW, PS_SWAP, PS_MOVE, PS_GAP, PS_N };   // gap: since the previous present began
static int ps_on = -1, ps_n;
static uint32_t ps_us[PS_N][120];
static uint64_t ps_t;
static void ps_begin() {
  if (ps_on < 0) { const char* e = getenv("ZINC_PRESENT_STATS"); ps_on = e && *e && *e != '0'; }
  if (!ps_on) return;
  for (int k = 0; k < PS_N; k++) ps_us[k][ps_n] = 0;
  static uint64_t prev;
  ps_t = hal_time_us();
  ps_us[PS_GAP][ps_n] = prev ? (uint32_t)(ps_t - prev) : 0;
  prev = ps_t;
}
static void ps_mark(int step) {
  if (!ps_on) return;
  const uint64_t t = hal_time_us();
  ps_us[step][ps_n] += (uint32_t)(t - ps_t);
  ps_t = t;
}
static void ps_end() {
  if (!ps_on) return;
  uint32_t total = 0;
  for (int k = 0; k < PS_N; k++) total += k == PS_SWAP || k == PS_GAP ? 0 : ps_us[k][ps_n];
  if (total < 50) return;   // a frame that drew nothing (its swap is the wait for the display): not counted
  if (++ps_n < 120) return;
  ps_n = 0;
  static const char* const names[PS_N] = {"raster", "upload", "draw", "swap", "move", "interval"};
  char b[320]; int n = snprintf(b, sizeof b, "zinc present:");
  for (int k = 0; k < PS_N; k++) {
    uint32_t* v = ps_us[k];
    std::sort(v, v + 120);
    n += snprintf(b + n, sizeof b - n, " %s p50 %.2f p99 %.2f", names[k], v[59] / 1000.0, v[118] / 1000.0);
  }
  n += snprintf(b + n, sizeof b - n, " ms\n");
  hal_log_err(b, (size_t)n);
}

// HalFrame.render_box on the band threads, into px (PW pixels per row)
static void (*box_fn)(uint32_t*, int32_t, int32_t, int32_t, int32_t);
static int32_t box_x0, box_x1;
static void box_rows(uint32_t* rows, int32_t y0, int32_t y1) { box_fn(rows, y0, y1, box_x0, box_x1); }
static void render_box_parallel(const HalFrame* f, const HalRect& r, uint32_t* px) {
  box_fn = f->render_box; box_x0 = SDL_max(r.x0, 0); box_x1 = SDL_min(r.x1, PW);
  if (box_x0 < box_x1 && r.y0 < r.y1) render_rows_parallel(box_rows, SDL_max(r.y0, 0), SDL_min(r.y1, PH), px);
}
// a scroll (HalFrame.move, ZN-744): the pixels of a buffer that holds the previous frame move, then what is left is drawn
static void apply_move(const HalFrame* f, uint32_t* px) {
  const HalMove& m = *f->move;
  ps_mark(PS_RASTER);
  zrt::raster::move_pixels(px, PW, zrt::raster::Move{{m.area.x0, m.area.y0, m.area.x1, m.area.y1}, m.dx, m.dy});
  ps_mark(PS_MOVE);
  for (int32_t k = 0; k < m.n; k++) render_box_parallel(f, m.damage[k], px);
}

#ifdef __ANDROID__
// Present into the window's own buffer (ZN-743): no SDL_Renderer, no texture, no GL context; SurfaceFlinger composes the buffer.
// ANativeWindow_lock gets the damage box as its dirty bounds and copies the rest from the previous buffer; the box it returns (the whole
// buffer after a new surface or size) is filled whole. Below API 26 the buffer is BGRA_8888 (HAL format 5), the raster's own byte order
// (0x00RRGGBB little-endian: B, G, R, 0), and the raster draws in it; from API 26 it is RGBX_8888, a format of the NDK, each stripe drawn
// in the thread's cached rows and written once with red and blue swapped (band_swap). Why (ZN-750): format 5 is not an NDK window format;
// the API 37 emulator takes it, reports it back from ANativeWindow_getFormat and the lock, and composes it as RGBA (red and blue swapped on
// screen), so no query tells a device that honours it from one that does not; the Nexus 7 (API 25) honours it, and the swap there costs
// 5 ms of raster a scrolled frame (p50 13.2 against 8.3 ms). ZINC_PRESENT_BGRA=1 or 0 forces one. The layer is opaque. The
// buffer is write-combined memory the CPU reads at a crawl (a scroll's pixel move inside it took 60 ms on a Nexus 7), so a scroll is drawn
// whole there; ZINC_PRESENT=shadow draws into fb, in cached memory, moves its pixels for a scroll (ZN-744) and copies the box into the buffer
// (on the Nexus 7: frame p50 better, p99 worse, the copy of a full box costs 8 to 10 ms of its memory bandwidth). ZINC_PRESENT=565 packs
// into RGB_565 from fb (half the bytes for the compositor, no dither), ZINC_PRESENT=texture keeps the SDL_Renderer path, a buffer whose stride
// is not the width goes through fb. ZINC_PRESENT_VERIFY=1 compares the whole buffer with a full redraw at every post (a screencap cannot:
// Tegra 3's compositor resamples at mediump precision).
static int anw_w, anw_h;      // the geometry set on it
static uint64_t anw_at;       // when the last frame was presented: frames without damage are paced from it
static void anw_idle() {   // nothing to post: one frame period since the last one (a post waits in the buffer queue instead)
  const uint64_t now = SDL_GetTicksNS();
  if (anw_at && now - anw_at < 16666666) SDL_DelayPrecise(16666666 - (now - anw_at));
  anw_at = SDL_GetTicksNS();
}
static void anw_present(const HalFrame* f) {
  ANativeWindow* nw = (ANativeWindow*)SDL_GetPointerProperty(SDL_GetWindowProperties(win), SDL_PROP_WINDOW_ANDROID_WINDOW_POINTER, nullptr);
  if (nw != anw) {   // the first frame, or a new surface (back from the background)
    if (anw) ANativeWindow_release(anw);
    if ((anw = nw)) ANativeWindow_acquire(anw);
    anw_w = anw_h = 0; anw_locked = false;
  }
  if (!anw) { anw_idle(); return; }
  ARect r = {f->x0, f->y0, f->x1, f->y1};
  if (anw_w != PW || anw_h != PH) {   // the lock answers with the whole buffer: nothing to copy back from a buffer of another size
    ANativeWindow_setBuffersGeometry(anw, PW, PH, anw_mode == 2 ? WINDOW_FORMAT_RGB_565 : anw_bgra ? 5 : WINDOW_FORMAT_RGBX_8888);
    anw_w = PW; anw_h = PH;
    r = ARect{0, 0, PW, PH};
  } else if (r.right <= r.left || r.bottom <= r.top) { anw_idle(); return; }
  ANativeWindow_Buffer b;
  ps_mark(PS_DRAW);
  if (ANativeWindow_lock(anw, &b, &r) != 0) { anw_w = 0; anw_idle(); return; }   // the surface is going away: set it up again next time
  anw_locked = true;
  ps_mark(PS_SWAP);   // dequeueing a buffer waits for the compositor: part of the swap
  if (b.width != PW || b.height != PH) { ANativeWindow_unlockAndPost(anw); anw_w = 0; return; }   // a resize on its way
  r.left = SDL_max(r.left, 0); r.top = SDL_max(r.top, 0); r.right = SDL_min(r.right, PW); r.bottom = SDL_min(r.bottom, PH);
  const bool rgba = b.format == WINDOW_FORMAT_RGBA_8888 || b.format == WINDOW_FORMAT_RGBX_8888;
  if (r.left < r.right && r.top < r.bottom) {
    static bool said;
    if (!said && !rgba && b.format != 5 && b.format != WINDOW_FORMAT_RGB_565) {   // a format nothing here writes: say it once
      said = true;
      char m[96]; const int n = snprintf(m, sizeof m, "zinc present: the window buffer is format %d, not RGBX_8888\n", b.format);
      hal_log_err(m, (size_t)n);
    }
    const bool direct = anw_mode == 3 && (b.format == 5 || rgba) && b.stride == PW;
    void (*rows)(uint32_t*, int32_t, int32_t) = f->render;
    if (f->render_box) { box_fn = f->render_box; box_x0 = r.left; box_x1 = r.right; rows = box_rows; }
    else { r.left = 0; r.right = PW; }   // whole rows: the box would hold stale pixels
    if (direct) {
      band_swap = rgba; swap_x0 = r.left; swap_x1 = r.right;
      render_rows_parallel(rows, r.top, r.bottom, (uint32_t*)b.bits);
      band_swap = false;
    }
    else {
      const bool fresh = !fb;
      if (fresh) { fb = (uint32_t*)calloc((size_t)PW * PH, 4); r = ARect{0, 0, PW, PH}; box_x0 = 0; box_x1 = PW; }
      if (f->move && f->render_box && !fresh) apply_move(f, fb);   // fb holds every frame: it moves, then the whole box is copied from it
      else render_rows_parallel(rows, r.top, r.bottom);
      ps_mark(PS_RASTER);
      for (int y = r.top; y < r.bottom; y++) {
        const uint32_t* s = fb + (size_t)y * PW + r.left;
        if (b.format == WINDOW_FORMAT_RGB_565) {
          uint16_t* d = (uint16_t*)b.bits + (size_t)y * b.stride + r.left;
          for (int x = 0; x < r.right - r.left; x++) d[x] = (uint16_t)(((s[x] >> 8) & 0xF800) | ((s[x] >> 5) & 0x07E0) | ((s[x] >> 3) & 0x001F));
        } else if (rgba) {
          uint32_t* d = (uint32_t*)b.bits + (size_t)y * b.stride + r.left;
          for (int x = 0; x < r.right - r.left; x++) d[x] = to_rgba(s[x]);
        } else memcpy((uint32_t*)b.bits + (size_t)y * b.stride + r.left, s, (size_t)(r.right - r.left) * 4);
      }
      ps_mark(PS_UPLOAD);
    }
    ps_mark(PS_RASTER);
  }
  static const bool verify = getenv("ZINC_PRESENT_VERIFY") && atoi(getenv("ZINC_PRESENT_VERIFY")) != 0;
  if (verify && (b.format == 5 || rgba)) {   // the whole buffer against a full redraw: the box drawn and the rest copied back hold no stale pixel
    uint32_t* full = (uint32_t*)malloc((size_t)PW * PH * 4);
    f->render(full, 0, PH);
    int bad = 0;
    for (int y = 0; y < PH; y++)
      for (int x = 0; x < PW; x++) {
        const uint32_t want = rgba ? to_rgba(full[(size_t)y * PW + x]) : full[(size_t)y * PW + x];
        bad += (((const uint32_t*)b.bits)[(size_t)y * b.stride + x] & 0xFFFFFF) != (want & 0xFFFFFF);
      }
    free(full);
    static int frames, frames_bad;
    frames++; frames_bad += bad != 0;
    char m[160]; const int n = snprintf(m, sizeof m, "zinc present verify: frame %d box %d,%d %d,%d: %d stale pixels (%d of %d frames had some)\n", frames, r.left, r.top, r.right, r.bottom, bad, frames_bad, frames);
    if (bad || frames % 60 == 0) hal_log_err(m, (size_t)n);
  }
  ANativeWindow_unlockAndPost(anw);
  ps_mark(PS_SWAP);
  anw_at = SDL_GetTicksNS();
}
#endif

#ifdef ZN_HAL_GL
// GL: the command lists replayed on the GPU into the replay's texture (or straight into the window when it has the surface's size and
// most of the frame changed), else the software rows uploaded; then the texture over the window, letterboxed.
#ifdef __ANDROID__
static bool layers_on;   // GPU layers under the frame (ZN-746): GL draws the SHADER commands, the software frame goes over them with its holes
static bool lay_full;    // the next frame is drawn whole: the window was just made (the texture holds nothing yet)
static uint32_t* lay_w;   // the rows rendered with white holes
static size_t lay_n;
static GLuint lay_tex;   // the software frame (two in turn uploaded no faster on Tegra 3: 11 to 12 ms for the screen either way)
static int lay_tw, lay_th;
static void (*lay_render)(uint32_t*, int32_t, int32_t);
static void holes_black(uint32_t* rows, int32_t y0, int32_t y1) { zrt::raster::set_layer_fill(0xFF000000); lay_render(rows, y0, y1); zrt::raster::set_layer_fill(HAL_LAYER_HOLE); }
static void holes_white(uint32_t* rows, int32_t y0, int32_t y1) { zrt::raster::set_layer_fill(0xFFFFFF); box_rows(rows, y0, y1); zrt::raster::set_layer_fill(HAL_LAYER_HOLE); }
constexpr int kLayOver = 16;
static HalRect pixel_box(float a0, float b0, float a1, float b1) {
  return HalRect{SDL_max((int32_t)SDL_floorf(a0) - 1, 0), SDL_max((int32_t)SDL_floorf(b0) - 1, 0), SDL_min((int32_t)SDL_ceilf(a1) + 1, PW), SDL_min((int32_t)SDL_ceilf(b1) + 1, PH)};
}
/** The union of the frame's SHADER boxes (physical pixels, within the surface), false when the frame draws none; `over` (at most kLayOver,
 *  `nover` of them): the rectangles of it that later commands may paint over (their boxes, and the rounded clips around a shader, whose
 *  corners are blended back), close ones joined. Several rectangles, not their union: over the music remote's lava lamp the time, the card
 *  and the status bar cover a fifth of the screen, their union all of it. */
static bool shader_box(const HalFrame* f, HalRect* out, HalRect* over = nullptr, int* nover = nullptr) {
  const HalCmdList* lists[8];
  const int32_t nl = f->frames ? f->frames(lists, 8) : 0;
  float x0 = 1e30f, y0 = 1e30f, x1 = -1e30f, y1 = -1e30f;
  int n = 0;
  auto area = [](const HalRect& a) { return (int64_t)(a.x1 - a.x0) * (a.y1 - a.y0); };
  auto join = [](const HalRect& a, const HalRect& b) { return HalRect{SDL_min(a.x0, b.x0), SDL_min(a.y0, b.y0), SDL_max(a.x1, b.x1), SDL_max(a.y1, b.y1)}; };
  auto grow = [&](float a0, float b0, float a1, float b1) {
    if (!over) return;
    HalRect r = pixel_box(a0, b0, a1, b1);
    if (r.x0 >= r.x1 || r.y0 >= r.y1) return;
    for (bool joined = true; joined;) {   // into a rectangle whose union with it costs little more than the two
      joined = false;
      for (int k = 0; k < n; k++)
        if (area(join(r, over[k])) <= area(r) + area(over[k]) + 16384) { r = join(r, over[k]); over[k] = over[--n]; joined = true; break; }
    }
    if (n < kLayOver) { over[n++] = r; return; }
    int best = 0;   // full: into the one it grows least
    for (int k = 1; k < n; k++) if (area(join(r, over[k])) - area(over[k]) < area(join(r, over[best])) - area(over[best])) best = k;
    over[best] = join(r, over[best]);
  };
  const zrt::raster::Cmd* clips[16];   // the rounded clips open
  int nclip = 0;
  bool seen = false;
  for (int32_t l = 0; l < nl; l++)
    for (uint32_t i = 0; i < lists[l]->count; i++) {
      const zrt::raster::Cmd& c = ((const zrt::raster::Cmd*)lists[l]->cmds)[i];
      if (c.kind == zrt::raster::CLIP) { if (nclip < 16) clips[nclip++] = &c; continue; }
      if (c.kind == zrt::raster::UNCLIP) { if (nclip > 0) nclip--; continue; }
      if (c.kind == zrt::raster::SHADER) {
        if (!(c.w > 0 && c.h > 0)) continue;
        seen = true;
        x0 = SDL_min(x0, c.x); y0 = SDL_min(y0, c.y); x1 = SDL_max(x1, c.x + c.w); y1 = SDL_max(y1, c.y + c.h);
        for (int k = 0; k < nclip; k++) if (clips[k]->r > 0) grow(clips[k]->x, clips[k]->y, clips[k]->x + clips[k]->w, clips[k]->y + clips[k]->h);
        continue;
      }
      if (!seen) continue;
      // what a command may paint around its box: a text line's overhang, a shadow's blur (raster.cpp cmd_bounds)
      const float e = (c.kind == zrt::raster::TEXT ? c.h * 0.5f : c.kind == zrt::raster::SHADOW ? c.s : 0) + 2;
      grow(c.x - e, c.y - e, c.x + c.w + e, c.y + c.h + e);
    }
  *out = pixel_box(x0, y0, x1, y1);
  if (nover) {   // within the shaders' box
    int m = 0;
    for (int k = 0; k < n; k++) {
      const HalRect r = {SDL_max(over[k].x0, out->x0), SDL_max(over[k].y0, out->y0), SDL_min(over[k].x1, out->x1), SDL_min(over[k].y1, out->y1)};
      if (r.x0 < r.x1 && r.y0 < r.y1) over[m++] = r;
    }
    *nover = m;
  }
  return out->x0 < out->x1 && out->y0 < out->y1;
}
static HalRect lay_wb;   // a box rendered with white holes too
/** The transparency of the pixels of lay_wb, from the two renders, into the alpha byte of fb: how much of the white showed through. */
static void lay_alpha(uint32_t* rows, int32_t y0, int32_t y1) {
  for (int32_t y = y0; y < y1; y++) {
    uint32_t* b = rows + (size_t)(y - y0) * PW;
    const uint32_t* w = lay_w + (size_t)y * PW;
    for (int32_t x = lay_wb.x0; x < lay_wb.x1; x++) b[x] = (b[x] & 0xFFFFFF) | ((((w[x] >> 8) & 255) - ((b[x] >> 8) & 255)) & 255) << 24;
  }
}
/** The damaged rows rendered once with black holes: a pixel's colour, premultiplied; a hole's alpha byte says transparent (255), what the
 *  raster paints leaves it at 0, opaque. Where later commands paint over a shader (a text, a translucent card), that box is rendered again
 *  with white holes and a pixel's transparency is how much of the white showed through. The rows go to a texture as they are (no copy: the
 *  shader takes B, G, R and 1 - A), which is drawn over the SHADER commands of the frame. */
static void layers_present(const HalFrame* f, int dw, int dh) {
  int32_t y0 = f->y0, y1 = f->y1;
  const bool whole = lay_full;
  lay_full = false;
  if (whole) { y0 = 0; y1 = PH; }
  if (y1 > y0 && (whole || f->x1 > f->x0)) {
    if (lay_n != (size_t)PW * PH) { free(lay_w); lay_n = (size_t)PW * PH; lay_w = (uint32_t*)calloc(lay_n, 4); }
    lay_render = f->render;
    render_rows_parallel(holes_black, y0, y1);
    HalRect sb, ov[kLayOver];
    int nov = 0;
    if (!shader_box(f, &sb, ov, &nov) || !f->render_box) nov = 0;
    for (int k = 0; k < nov; k++) {
      lay_wb = HalRect{ov[k].x0, SDL_max(y0, ov[k].y0), ov[k].x1, SDL_min(y1, ov[k].y1)};
      if (lay_wb.y0 >= lay_wb.y1) continue;
      box_fn = f->render_box; box_x0 = lay_wb.x0; box_x1 = lay_wb.x1;
      render_rows_parallel(holes_white, lay_wb.y0, lay_wb.y1, lay_w);
      render_rows_parallel(lay_alpha, lay_wb.y0, lay_wb.y1);
    }
    ps_mark(PS_RASTER);
    if (!lay_tex) glGenTextures(1, &lay_tex);
    glBindTexture(GL_TEXTURE_2D, lay_tex);
    if (lay_tw != PW || lay_th != PH) {
      glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA, PW, PH, 0, GL_RGBA, GL_UNSIGNED_BYTE, nullptr);
      glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_NEAREST); glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_NEAREST);
      glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE); glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
      lay_tw = PW; lay_th = PH;
      if (y0 > 0 || y1 < PH) { lay_full = true; return layers_present(f, dw, dh); }   // a new texture: the whole frame
    }
    glPixelStorei(GL_UNPACK_ALIGNMENT, 4);
    glTexSubImage2D(GL_TEXTURE_2D, 0, 0, y0, PW, y1 - y0, GL_RGBA, GL_UNSIGNED_BYTE, fb + (size_t)y0 * PW);
    ps_mark(PS_UPLOAD);
  }
  glBindFramebuffer(GL_FRAMEBUFFER, 0);
  glDisable(GL_SCISSOR_TEST); glDisable(GL_DEPTH_TEST); glDisable(GL_BLEND);
  glViewport(0, 0, dw, dh);
  glClearColor(0, 0, 0, 1);
  glClear(GL_COLOR_BUFFER_BIT);
  const HalCmdList* lists[8];
  const int32_t nl = f->frames ? f->frames(lists, 8) : 0;
  // the shaders at 1 / scale of the size, into a texture stretched linearly over the window, when their programs allow it (shaderProgram's
  // scale: a smooth picture loses nothing, and Tegra 3 shades the lava lamp's screen in 40 ms, a quarter of it in under 16); ZINC_SHADER_SCALE
  // overrides
  int sc = 8;
  for (int32_t l = 0; l < nl; l++)
    for (uint32_t i = 0; i < lists[l]->count; i++) {
      const zrt::raster::Cmd& c = ((const zrt::raster::Cmd*)lists[l]->cmds)[i];
      if (c.kind == zrt::raster::SHADER) sc = SDL_min(sc, zrt::gfx::shaderScale(c.res));
    }
  if (const char* e = getenv("ZINC_SHADER_SCALE")) sc = atoi(e);
  sc = SDL_max(1, SDL_min(sc, 8));
  static GLuint sfbo, stex;
  static int sw, sh;
  if (sc > 1 && (sw != (dw + sc - 1) / sc || sh != (dh + sc - 1) / sc)) {
    sw = (dw + sc - 1) / sc; sh = (dh + sc - 1) / sc;
    if (!stex) { glGenTextures(1, &stex); glGenFramebuffers(1, &sfbo); }
    glBindTexture(GL_TEXTURE_2D, stex);
    glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA, sw, sh, 0, GL_RGBA, GL_UNSIGNED_BYTE, nullptr);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE); glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
    glBindFramebuffer(GL_FRAMEBUFFER, sfbo);
    glFramebufferTexture2D(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_TEXTURE_2D, stex, 0);
    glClear(GL_COLOR_BUFFER_BIT);
  }
  if (sc > 1) { glBindFramebuffer(GL_FRAMEBUFFER, sfbo); glViewport(0, 0, sw, sh); }
  for (int32_t l = 0; l < nl; l++)
    for (uint32_t i = 0; i < lists[l]->count; i++) {
      const zrt::raster::Cmd& c = ((const zrt::raster::Cmd*)lists[l]->cmds)[i];
      if (c.kind == zrt::raster::SHADER) glr::shader_quad(c, lists[l]->pts + c.off, dw, dh, sc == 1, 0);
    }
  glUseProgram(gl_prog);
  glUniform2f(gl_u_rot, 1, 0);
  glActiveTexture(GL_TEXTURE0);
  glUniform1i(gl_u_tex, 0); glUniform1f(gl_u_bgr, 0);
  glBindBuffer(GL_ARRAY_BUFFER, gl_quad);
  glEnableVertexAttribArray(0);
  glVertexAttribPointer(0, 2, GL_FLOAT, GL_FALSE, 0, nullptr);
  if (sc > 1) {
    glBindFramebuffer(GL_FRAMEBUFFER, 0);
    glViewport(0, 0, dw, dh);
    glBindTexture(GL_TEXTURE_2D, stex);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR); glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
    glUniform1f(gl_u_alpha, 0);
    glDrawArrays(GL_TRIANGLE_STRIP, 0, 4);
  }
  ps_mark(PS_DRAW);
  glEnable(GL_BLEND);
  glBlendFunc(GL_ONE, GL_ONE_MINUS_SRC_ALPHA);
  glUseProgram(gl_prog);
  glBindBuffer(GL_ARRAY_BUFFER, gl_quad);
  glEnableVertexAttribArray(0);
  glVertexAttribPointer(0, 2, GL_FLOAT, GL_FALSE, 0, nullptr);
  glBindTexture(GL_TEXTURE_2D, lay_tex);
  glUniform1f(gl_u_alpha, 1); glUniform1f(gl_u_bgr, 1);
  glDrawArrays(GL_TRIANGLE_STRIP, 0, 4);
  glDisableVertexAttribArray(0);
  glDisable(GL_BLEND);
  SDL_GL_SwapWindow(win);
}
#endif
static void gl_mark(int step);
/** The texture `src` over the window (letterboxed, turned), then the swap. */
static void gl_show(GLuint src, float bgr, int dw, int dh) {
  const float sc = SDL_min((float)dw / turned_w(), (float)dh / turned_h());
  const int vw = (int)(turned_w() * sc + 0.5f), vh = (int)(turned_h() * sc + 0.5f);
  // a scroll area whose rows the texture keeps turned (glr::scroll): drawn in pieces when the window is the surface, else put back first
  const bool pieces = src == glr::texture() && glr::ring_off && vw == PW && vh == PH && vw == dw && vh == dh;
  if (src == glr::texture() && glr::ring_off && !pieces) glr::unrotate();
  glBindFramebuffer(GL_FRAMEBUFFER, 0);
  glDisable(GL_SCISSOR_TEST); glDisable(GL_DEPTH_TEST); glDisable(GL_BLEND);
  glViewport(0, 0, dw, dh);
  // the bars of a letterbox; a picture over the whole window needs no clear but on a tiler, where it spares loading the old pixels (an
  // immediate GPU writes the whole window twice with it: Tegra 3, ZN-741)
  if (vw != dw || vh != dh || glr::caps.tiler) { glClearColor(0, 0, 0, 1); glClear(GL_COLOR_BUFFER_BIT); }
  glViewport((dw - vw) / 2, (dh - vh) / 2, vw, vh);
  glUseProgram(gl_prog);
  static const float kCos[] = {1, 0, -1, 0}, kSin[] = {0, -1, 0, 1};   // clockwise on the screen: minus a quarter turn each
  glUniform2f(gl_u_rot, kCos[sim_turn & 3], kSin[sim_turn & 3]);
  glActiveTexture(GL_TEXTURE0);
  glBindTexture(GL_TEXTURE_2D, src);
  const GLint flt = logical_px ? GL_NEAREST : GL_LINEAR;   // pixel art keeps square pixels when the window magnifies it
  glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, flt); glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, flt);
  glUniform1i(gl_u_tex, 0);
  glUniform1f(gl_u_bgr, bgr); glUniform1f(gl_u_alpha, 0);
  glBindBuffer(GL_ARRAY_BUFFER, gl_quad);
  glEnableVertexAttribArray(0);
  glVertexAttribPointer(0, 2, GL_FLOAT, GL_FALSE, 0, nullptr);
  if (pieces) {   // the parts around the area as they are, the area's two runs of rows where they belong: each pixel once
    int32_t tw = 1, th = 1;
    glr::texture_size(&tw, &th);
    const glr::Rect R = glr::ring;
    const int32_t off = glr::ring_off, wrap = R.y1 - off, w = R.x1 - R.x0;
    auto piece = [&](int32_t x, int32_t y, int32_t pw, int32_t ph, int32_t sx, int32_t sy) {
      if (pw <= 0 || ph <= 0) return;
      glViewport(x, dh - y - ph, pw, ph);
      glUniform4f(gl_u_src, (float)sx / tw, (float)sy / th, (float)pw / tw, (float)ph / th);
      glDrawArrays(GL_TRIANGLE_STRIP, 0, 4);
    };
    piece(0, 0, PW, R.y0, 0, 0);
    piece(0, R.y1, PW, PH - R.y1, 0, R.y1);
    piece(0, R.y0, R.x0, R.y1 - R.y0, 0, R.y0);
    piece(R.x1, R.y0, PW - R.x1, R.y1 - R.y0, R.x1, R.y0);
    piece(R.x0, R.y0, w, wrap - R.y0, R.x0, R.y0 + off);
    piece(R.x0, wrap, w, R.y1 - wrap, R.x0, R.y0);
    glUniform4f(gl_u_src, 0, 0, 1, 1);
  } else glDrawArrays(GL_TRIANGLE_STRIP, 0, 4);
  glDisableVertexAttribArray(0);
  gl_mark(PS_DRAW);
  SDL_GL_SwapWindow(win);
}
// ZINC_PRESENT_STATS with ZINC_GL_FINISH=1: each step of a GL present waits for the GPU, so its time is the step's own (slower in all)
static void gl_mark(int step) {
  static const bool fin = getenv("ZINC_GL_FINISH") && atoi(getenv("ZINC_GL_FINISH")) != 0;
  if (fin && ps_on > 0) glFinish();
  ps_mark(step);
}
// A scroll (HalFrame.move, ZN-744): the replay's texture holds the previous frame, its pixels move on the GPU and only the rectangles left are
// replayed. ZINC_GL_MOVE=0|1 overrides the default below; ZINC_GL_VERIFY=1 compares each moved frame with a whole replay of it (logged).
static bool gl_moved(const HalFrame* f) {
  // on by default where a whole replay costs the GPU most (GLES 2: Tegra 3 replays rn-showcase in 90 to 130 ms); a desktop GPU replays a
  // frame in under 2 ms of CPU, less than the passes of the pieces (940 us each on Apple's GL), so there it is asked for (ZINC_GL_MOVE=1)
#ifdef ZGL_ES
  static const bool on = !getenv("ZINC_GL_MOVE") || atoi(getenv("ZINC_GL_MOVE")) != 0;
#else
  static const bool on = getenv("ZINC_GL_MOVE") && atoi(getenv("ZINC_GL_MOVE")) != 0;
#endif
  if (!on || !f->move || !gl_tex_ok) return false;
  const HalMove& m = *f->move;
  const uint64_t t0 = hal_time_us();
  if (!glr::scroll(glr::Rect{m.area.x0, m.area.y0, m.area.x1, m.area.y1}, m.dx, m.dy)) return false;
  gl_mark(PS_MOVE);
  const uint64_t t1 = hal_time_us();
  // each rectangle is a pass over the commands: overlapping or close ones (the perf panel at its old and new place, its own change) are
  // joined when their union costs little more than the two (a pass costs Tegra 3 about a millisecond before any pixel)
  HalRect r[16];
  int32_t n = 0;
  for (int32_t i = 0; i < m.n && n < 16; i++) r[n++] = m.damage[i];
  auto area = [](const HalRect& a) { return (int64_t)(a.x1 - a.x0) * (a.y1 - a.y0); };
  for (bool joined = true; joined;) {
    joined = false;
    for (int32_t i = 0; i < n && !joined; i++)
      for (int32_t j = i + 1; j < n; j++) {
        const HalRect u = {SDL_min(r[i].x0, r[j].x0), SDL_min(r[i].y0, r[j].y0), SDL_max(r[i].x1, r[j].x1), SDL_max(r[i].y1, r[j].y1)};
        if (area(u) > area(r[i]) + area(r[j]) + 16384) continue;
        r[i] = u; r[j] = r[--n]; joined = true;
        break;
      }
  }
  glr::frame_rects(f, r, n);
  gl_mark(PS_RASTER);
  static const bool log = getenv("ZINC_GL_MOVE_LOG") != nullptr;   // each moved frame: the delta and the rectangles replayed
  if (log) {
    char s[400];
    int k = snprintf(s, sizeof s, "zinc gl move: (%d, %d) move %.1f ms, %d rects %.1f ms:", m.dx, m.dy, (t1 - t0) / 1e3, n, (hal_time_us() - t1) / 1e3);
    for (int32_t i = 0; i < n && k < (int)sizeof s - 40; i++) k += snprintf(s + k, sizeof s - k, " %d,%d %dx%d", r[i].x0, r[i].y0, r[i].x1 - r[i].x0, r[i].y1 - r[i].y0);
    k += snprintf(s + k, sizeof s - k, "\n");
    hal_log_err(s, (size_t)k);
  }
  static const bool check = getenv("ZINC_GL_VERIFY") && atoi(getenv("ZINC_GL_VERIFY")) != 0;
  if (check) {
    static uint32_t moved, bad;
    glr::Rect b;
    const uint64_t d = glr::verify(f, &b);
    moved++; bad += d != 0;
    if (d || moved % 60 == 0) {
      char s[240];
      int k = snprintf(s, sizeof s, "zinc gl verify: %u moved frames, %u differ from a whole replay", moved, bad);
      if (d) k += snprintf(s + k, sizeof s - k, "; this one (%d, %d): %llu pixels in %d,%d %d,%d", m.dx, m.dy, (unsigned long long)d, b.x0, b.y0, b.x1, b.y1);
      if (d && getenv("ZINC_GL_VERIFY_PX")) {
        k += snprintf(s + k, sizeof s - k, "; area %d,%d %d,%d, drawn", m.area.x0, m.area.y0, m.area.x1, m.area.y1);
        for (int32_t i = 0; i < m.n && k < (int)sizeof s - 40; i++) k += snprintf(s + k, sizeof s - k, " %d,%d %d,%d", m.damage[i].x0, m.damage[i].y0, m.damage[i].x1, m.damage[i].y1);
      }
      k += snprintf(s + k, sizeof s - k, "\n");
      hal_log_err(s, (size_t)k);
    }
  }
  return true;
}
static void gl_present(const HalFrame* f) {
  GlCurrent cur;
#ifdef __ANDROID__
  if (layers_on) { int dw = PW, dh = PH; SDL_GetWindowSizeInPixels(win, &dw, &dh); layers_present(f, dw, dh); return; }
#endif
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
#ifdef ZGL_ES
    // GLES 2 (Android, ZN-741): only the damage is replayed, into the texture that keeps the frame (glr::dmg_default); a frame without damage
    // draws and posts nothing (the window keeps the last one), a sleep paces it
    glr::dmg_default = true;
    if (!damaged && gl_tex_ok) {
      static uint64_t idle_at;
      glr::warm();   // a program the next frames may need, built while nothing changes on the screen
      const uint64_t now = SDL_GetTicksNS();
      if (idle_at && now - idle_at < 16666666) SDL_DelayPrecise(16666666 - (now - idle_at));
      idle_at = SDL_GetTicksNS();
      glr::idle();
      return;
    }
    if (!gl_moved(f)) { glr::frame(f, false, gl_tex_ok ? glr::Rect{f->x0, f->y0, f->x1, f->y1} : glr::Rect{0, 0, PW, PH}); gl_mark(PS_RASTER); }
    gl_tex_ok = true;
#else
    const int64_t area = damaged ? (int64_t)(f->x1 - f->x0) * (f->y1 - f->y0) : 0;
    if (damaged && gl_moved(f)) {}   // a scroll: the texture's pixels moved, the rest replayed
    else if (dw == PW && dh == PH && !sim_turn && damaged && area * 2 >= (int64_t)PW * PH) {   // straight into the window: no texture, no copy
      glr::frame(f, true, glr::Rect{0, 0, PW, PH});
      gl_tex_ok = false;
      SDL_GL_SwapWindow(win);
      return;
    }
    else if (damaged || !gl_tex_ok) { glr::frame(f, false, glr::Rect{0, 0, PW, PH}); gl_tex_ok = true; }
    else glr::idle();
#endif
  } else {
    if (damaged) {
      render_rows_parallel(f->render_damage ? f->render_damage : f->render, f->y0, f->y1);   // fb keeps the previous frame
      glBindTexture(GL_TEXTURE_2D, gl_upload);
      glPixelStorei(GL_UNPACK_ALIGNMENT, 4);
      glTexSubImage2D(GL_TEXTURE_2D, 0, 0, f->y0, PW, f->y1 - f->y0, GL_RGBA, GL_UNSIGNED_BYTE, fb + (size_t)f->y0 * PW);
    }
    src = gl_upload; bgr = 1;   // 0x00RRGGBB in memory: B, G, R, 0
  }
  gl_show(src, bgr, dw, dh);
}
#endif
static void present_frame(const HalFrame* f);
#ifdef __ANDROID__
// zinc:gfx shaderProgram (ZN-746): the program's shaders are drawn by GL on a layer under the software frame, while a frame draws one. The
// window is the CPU's (anw_present: the raster straight into the window's buffer) the rest of the time, and becomes a GL window at the
// first frame that draws a shader, then the CPU's again once the screen rests after the last (layers_follow). Why: on the GL window every damaged frame is uploaded
// (Tegra 3: about 100 MB/s, 40 ms for the screen), where the CPU window costs no copy; the music remote's carousel swiped in 150 to 220 ms a
// frame on the GL window and in 40 ms on the CPU's (Nexus 7, 2026-10-17). The GL context, its programs and textures are kept across.
// ZINC_GPU_LAYERS=0: no GPU layer (shaderAvailable() is false and a program draws its own CPU picture).
static bool layers_wanted;   // the program made a shader
static int anw_cpu_mode;     // anw_mode of the CPU window
static int layers_quiet;     // frames without a shader since the last one
extern "C" void zn_hal_sdl_gpu_layers(void) {
  if (!gfx_on || layers_wanted || !anw_mode || (getenv("ZINC_GPU_LAYERS") && getenv("ZINC_GPU_LAYERS")[0] == '0')) return;
  layers_wanted = true; anw_cpu_mode = anw_mode;
  SDL_GL_LoadLibrary(nullptr);   // held: SDL unloads EGL (and loses the context) when its last GL window goes, at each return to the CPU
  zrt::gfx::shaders_drawn = true; glr::shader_source = zrt::gfx::shaderSource;
}
// ANativeWindow's own interface (AOSP system/window.h; stable, the GPU drivers are built against it). ANativeWindow_lock connects the CPU to
// the window's buffer queue and nothing public lets it go, while EGL connects only to a free queue: the GL window disconnects the CPU first.
struct AnwPriv {
  int magic, version; void* reserved[4]; void (*inc_ref)(void*); void (*dec_ref)(void*);
  const uint32_t flags; const int min_swap, max_swap; const float xdpi, ydpi; intptr_t oem[4];
  int (*set_swap_interval)(void*, int); void* deprecated[3]; int (*query)(const void*, int, int*); int (*perform)(void*, int, ...);
};
static bool anw_let_go() {
  const void* nw = SDL_GetPointerProperty(SDL_GetWindowProperties(win), SDL_PROP_WINDOW_ANDROID_WINDOW_POINTER, nullptr);
  if (!anw_locked || !anw || nw != anw) return true;   // a surface the CPU never locked (a new one since the background)
  AnwPriv* w = (AnwPriv*)anw;
  if (w->magic != ('_' << 24 | 'w' << 16 | 'n' << 8 | 'd')) return false;   // ANDROID_NATIVE_WINDOW_MAGIC
  if (w->perform(anw, 14 /* NATIVE_WINDOW_API_DISCONNECT */, 2 /* NATIVE_WINDOW_API_CPU */) != 0) return false;
  anw_locked = false;
  return true;
}
/** The window made again, for GL (with the GPU layer) or for the CPU; the next frame is drawn whole. */
static void window_kind(bool gl) {
  const uint64_t t0 = SDL_GetTicksNS();
  int ww = 0, wh = 0;
  SDL_GetWindowSize(win, &ww, &wh);
  if (gl && !anw_let_go()) {   // EGL could not take the window: no GPU layer, the program draws its own picture from now on
    layers_wanted = false; zrt::gfx::shaders_drawn = false;
    const char* m = "zinc: the window stays on the CPU (its buffer queue could not be let go): no GPU layer\n";
    hal_log_err(m, strlen(m));
    return;
  }
  // a window made without the fullscreen flag takes Android's immersive mode away (SDL applies the flags it is made with), and asking for it
  // again waits up to 500 ms for the surface to change back (SDLActivity.sendCommand)
  const SDL_WindowFlags full = SDL_GetWindowFlags(win) & SDL_WINDOW_FULLSCREEN;
  if (gl_on) SDL_GL_MakeCurrent(win, nullptr);   // EGL destroys a current surface only once it is no longer current
  SDL_DestroyWindow(win);
  win = nullptr;
  if (gl && gl_window("zinc", ww, wh, full != 0)) { anw_mode = 0; gl_on = layers_on = lay_full = true; }
  else {
    if (!(win = SDL_CreateWindow("zinc", ww, wh, SDL_WINDOW_RESIZABLE | SDL_WINDOW_HIGH_PIXEL_DENSITY | full))) hal_panic(SDL_GetError(), "hal_sdl", __LINE__);
    if (gl) { layers_wanted = false; zrt::gfx::shaders_drawn = false; }   // no GLES 2 context
    anw_mode = anw_cpu_mode; gl_on = layers_on = false; anw_w = 0;
  }
  zrt::raster::shader_holes = layers_on;
  surface_ok = false;
  apply_size();
  if (getenv("ZINC_GL_STATS")) {
    char m[96]; const int n = snprintf(m, sizeof m, "zinc: window renderer %s (%.1f ms)\n", layers_on ? "cpu with GPU layers" : "cpu", (SDL_GetTicksNS() - t0) / 1e6);
    hal_log_err(m, (size_t)n);
  }
}
/** A frame that draws a shader goes to the GL window at once. The CPU's comes back once frames without a shader rest (no damage), or after a
 *  second of them: the change shows nothing new for about 380 ms on the Nexus 7 (the switch 30 ms, the first CPU frame 70 to 110 ms, the
 *  compositor the rest), which a still screen hides and a moving carousel does not. */
static void layers_follow(const HalFrame* f) {
  HalRect sb;
  const bool drawn = shader_box(f, &sb);
  layers_quiet = drawn ? 0 : layers_quiet + 1;
  const bool rest = f->y1 <= f->y0 || f->x1 <= f->x0;
  if (drawn && !layers_on) window_kind(true);
  else if (!drawn && layers_on && layers_quiet >= 3 && (rest || layers_quiet >= 60)) window_kind(false);
}
#endif
#ifdef __APPLE__
// The window's own colour follows the frame's background (its first command: a CLEAR, or an opaque rectangle over the whole surface): AppKit
// shows it at a growing edge before the frame of the new size is in, instead of white or black (Electron's backgroundColor)
static void window_background(const HalFrame* f) {
  static uint32_t bg = 0xFFFFFFFFu;
  if (!f->frames || (wcfg_set && wcfg.transparent)) return;
  const HalCmdList* l[1];
  if (f->frames(l, 1) < 1 || !l[0]->count) return;
  const zrt::raster::Cmd& c = *(const zrt::raster::Cmd*)l[0]->cmds;
  const bool whole = c.kind == zrt::raster::CLEAR || (c.kind == zrt::raster::RECT && c.alpha == 255 && !c.grad && c.x <= 0 && c.y <= 0 && c.x + c.w >= W && c.y + c.h >= H);
  if (!whole || (c.c1 & 0xFFFFFFu) == bg) return;
  bg = c.c1 & 0xFFFFFFu;
  hal_sdl_window_background(SDL_GetPointerProperty(SDL_GetWindowProperties(win), SDL_PROP_WINDOW_COCOA_WINDOW_POINTER, nullptr), bg);
}
#endif
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
#ifdef __APPLE__
  window_background(f);
#endif
  present_frame(f);
  if (in_watch) { live_frames++; live_w = f->w; live_h = f->h; }
  if (shown) return;
  shown = true;
  show_main();
  present_frame(f);   // again into the shown window: what it composites first may be the buffer of before the show
}
#ifdef __ANDROID__
// Steady clocks while frames move (ZN-750): the activity asks for Window.setSustainedPerformanceMode where the device has it, and lets it go
// a second after the last frame with damage (the activity drops it while paused and asks again on resume).
static void steady_clocks(bool moving) {
  static bool on;
  static uint64_t moved;
  const uint64_t now = SDL_GetTicksNS();
  if (moving) moved = now;
  const bool want = moving || (on && now - moved < 1000000000ull);
  if (want != on) SDL_SendAndroidMessage(ZN_APP_ANDROID_SUSTAINED, (on = want) ? 1 : 0);
}
#endif
static void present_frame(const HalFrame* f) {
#ifdef __ANDROID__
  steady_clocks(f->y1 > f->y0 && f->x1 > f->x0);
#endif
#if defined(__ANDROID__) && defined(ZN_HAL_GL)
  if (layers_wanted) layers_follow(f);
#endif
  ps_begin();
#ifdef ZN_HAL_GL
  if (gl_on) { gl_present(f); ps_mark(PS_SWAP); ps_end(); return; }
#endif
#ifdef __ANDROID__
  if (anw_mode) { anw_present(f); ps_end(); return; }
#endif
#ifdef SDL_PLATFORM_IOS
  if (mtl_on) {   // a frame without damage presents nothing: the layer keeps the last one and the display link paces the loop
    if (f->y1 <= f->y0 || f->x1 <= f->x0) return;
    hal_mtl_wait();   // the GPU is still copying the previous frame out of fb: almost never, a blit takes a fraction of a frame
    ps_mark(PS_SWAP);
    if (f->move && f->render_box) apply_move(f, fb);
    else render_rows_parallel(f->render_damage ? f->render_damage : f->render, f->y0, f->y1);
    ps_mark(PS_RASTER);
    hal_mtl_present();
    ps_mark(PS_DRAW);
    ps_end();
    return;
  }
#endif
  if (f->y1 > f->y0 && f->x1 > f->x0) {
    if (f->move && f->render_box) apply_move(f, fb);   // fb keeps the previous frame: its pixels move
    else render_rows_parallel(f->render_damage ? f->render_damage : f->render, f->y0, f->y1);  // fb keeps the previous frame
    ps_mark(PS_RASTER);
    SDL_Rect r = {0, f->y0, PW, f->y1 - f->y0};
    if (wcfg_set && wcfg.transparent) {   // the key colour becomes alpha 0, everything else opaque
      size_t n = (size_t)PW * (size_t)(f->y1 - f->y0);
      if (tbuf_n < n) { free(tbuf); tbuf = (uint32_t*)malloc(n * 4); tbuf_n = n; }
      const uint32_t key = wcfg.transparent_key & 0xFFFFFF, *src = fb + (size_t)f->y0 * PW;
      for (size_t i = 0; i < n; i++) tbuf[i] = (src[i] & 0xFFFFFF) == key ? 0u : (src[i] | 0xFF000000u);
      SDL_UpdateTexture(tex, &r, tbuf, PW * 4);
    } else SDL_UpdateTexture(tex, &r, fb + (size_t)f->y0 * PW, PW * 4);
    ps_mark(PS_UPLOAD);
  }
  if (wcfg_set && wcfg.transparent) SDL_SetRenderDrawColor(ren, 0, 0, 0, 0);
  SDL_RenderClear(ren);
  SDL_RenderTexture(ren, tex, nullptr, nullptr);
  ps_mark(PS_DRAW);
  SDL_RenderPresent(ren);
  ps_mark(PS_SWAP);
  ps_end();
}
void hal_surface_size(int* w, int* h) { *w = W; *h = H; }
// The keyboard the focused field asks for (zinc:ui, src/host/hal_dispatch.cpp zn_hal_text_traits: `type=email cap=none autocorrect=0 multiline=0
// secure=1`): SDL's text input properties, which choose the phone's keyboard (a desktop's IME ignores them). Restarted when they change.
extern "C" __attribute__((weak)) const char* zn_hal_text_traits(void);
static std::string traits_on;
static void start_text_input() {
  const std::string t = zn_hal_text_traits ? zn_hal_text_traits() : "";
  if (t.empty()) { SDL_StartTextInput(win); traits_on.clear(); return; }
  auto has = [&](const char* kv) { return (" " + t + " ").find(std::string(" ") + kv + " ") != std::string::npos; };
  if (SDL_TextInputActive(win) && t != traits_on) SDL_StopTextInput(win);   // another field, another keyboard
  traits_on = t;
  SDL_PropertiesID p = SDL_CreateProperties();
  const bool secure = has("secure=1"), number = has("type=number") || has("type=phone") || has("type=decimal");
  SDL_SetNumberProperty(p, SDL_PROP_TEXTINPUT_TYPE_NUMBER, number ? (secure ? SDL_TEXTINPUT_TYPE_NUMBER_PASSWORD_HIDDEN : SDL_TEXTINPUT_TYPE_NUMBER) :
                        secure ? SDL_TEXTINPUT_TYPE_TEXT_PASSWORD_HIDDEN : has("type=email") ? SDL_TEXTINPUT_TYPE_TEXT_EMAIL :
                        has("type=name") ? SDL_TEXTINPUT_TYPE_TEXT_NAME : has("type=username") ? SDL_TEXTINPUT_TYPE_TEXT_USERNAME : SDL_TEXTINPUT_TYPE_TEXT);
  SDL_SetNumberProperty(p, SDL_PROP_TEXTINPUT_CAPITALIZATION_NUMBER, has("cap=none") ? SDL_CAPITALIZE_NONE : has("cap=words") ? SDL_CAPITALIZE_WORDS :
                        has("cap=characters") ? SDL_CAPITALIZE_LETTERS : SDL_CAPITALIZE_SENTENCES);
  SDL_SetBooleanProperty(p, SDL_PROP_TEXTINPUT_AUTOCORRECT_BOOLEAN, !has("autocorrect=0") && !secure);
  SDL_SetBooleanProperty(p, SDL_PROP_TEXTINPUT_MULTILINE_BOOLEAN, has("multiline=1"));
  SDL_StartTextInputWithProperties(win, p);
  SDL_DestroyProperties(p);
}
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
  start_text_input();
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
