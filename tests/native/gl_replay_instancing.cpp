// Manual real-driver proof: gl_replay_instancing /path/to/libEGL (ANGLE Metal on macOS; default EGL elsewhere).
// No window, no timing: the actual replay solid pass, equal readbacks and bytes passed to glBufferData.
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <cstddef>
#include <initializer_list>
#include <vector>
#include <dlfcn.h>
#include "EGL/egl.h"
#include "EGL/eglext.h"
#include "glad/gl.h"

static GLuint zgl_program(const char* defines, const char* vs, const char* fs) {
  GLuint p = glCreateProgram();
  for (int i = 0; i < 2; ++i) {
    GLuint s = glCreateShader(i ? GL_FRAGMENT_SHADER : GL_VERTEX_SHADER);
    const char* source[] = {i ? "#version 100\nprecision highp float;\n" : "#version 100\n", defines, i ? fs : vs};
    glShaderSource(s, 3, source, nullptr); glCompileShader(s);
    GLint ok; glGetShaderiv(s, GL_COMPILE_STATUS, &ok);
    if (!ok) { char log[2048]; glGetShaderInfoLog(s, sizeof log, nullptr, log); fprintf(stderr, "%s\n", log); abort(); }
    glAttachShader(p, s); glDeleteShader(s);
  }
  const char* attrs[] = {"a_pos", "a_uv", "a_box", "a_par", "a_c1", "a_c2", "a_z"};
  for (GLuint i = 0; i < 7; ++i) glBindAttribLocation(p, i, attrs[i]);
  glLinkProgram(p);
  GLint ok; glGetProgramiv(p, GL_LINK_STATUS, &ok);
  if (!ok) { char log[2048]; glGetProgramInfoLog(p, sizeof log, nullptr, log); fprintf(stderr, "%s\n", log); abort(); }
  return p;
}
#include "../../include/zn/msdf.h"
#define GLR_CORE 0
#pragma GCC diagnostic push
#pragma GCC diagnostic ignored "-Wunused-function"
#include "gl_replay.cpp"
#pragma GCC diagnostic pop
namespace zrt::raster { const int image_count = 0; uint32_t strokes_built = 0; }
extern "C" { void (*zrt_gl_info_hook)(); void (*zrt_gl_info_reset_hook)(); void zrt_prof_info(const char*, const char*) {} }
#define REQUIRE(x) do { if (!(x)) { fprintf(stderr, "line %d: %s failed\n", __LINE__, #x); return 1; } } while (0)

static std::vector<uint32_t> draw(bool instances) {
  glr::instanced = instances;
  glDeleteProgram(glr::sprog);
  glr::sprog = zgl_program(instances ? "#define INSTANCED 1\n#define INSTANCE_CORNERS 1\n" : "", glr::SVS, glr::SFS);
  glr::s_res = glGetUniformLocation(glr::sprog, "u_res"); glr::s_flip = glGetUniformLocation(glr::sprog, "u_flip");
  glr::s_pos = glGetAttribLocation(glr::sprog, "a_pos"); glr::s_rect = glGetAttribLocation(glr::sprog, "a_rect");
  glr::s_col = glGetAttribLocation(glr::sprog, "a_col"); glr::s_z = glGetAttribLocation(glr::sprog, "a_z");
  glr::gl_info_reset();
  glr::clip = {2, 2, 62, 62}; glr::applied = {};
  glBindFramebuffer(GL_FRAMEBUFFER, glr::fbo);
  glViewport(0, 0, 64, 64); glDisable(GL_SCISSOR_TEST); glDisable(GL_BLEND);
  glClearColor(0, 0, 0, 1); glDepthMask(GL_TRUE); glClearDepthf(1);
  glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);
  glEnable(GL_SCISSOR_TEST); glEnable(GL_DEPTH_TEST); glDepthFunc(GL_LESS);
  for (int i = 0; i < 260; ++i) {
    glr::cur_z = 0.9f - i / 260.f;
    glr::solid({i % 53 - 2, i % 47 - 3, i % 53 + 11, i % 47 + 14}, (uint32_t)(i * 7919) & 0xffffff);
  }
  glr::sflush();
  glr::st.frames = 1;
  glr::report();
  std::vector<uint32_t> pixels(64 * 64);
  glReadPixels(0, 0, 64, 64, GL_RGBA, GL_UNSIGNED_BYTE, pixels.data());
  return pixels;
}

int main(int argc, char** argv) {
  REQUIRE(argc == 2);
  void* library = dlopen(argv[1], RTLD_NOW | RTLD_GLOBAL);
  if (!library) fprintf(stderr, "%s\n", dlerror());
  REQUIRE(library);
#define EGL_FN(name, type) auto name = (type)dlsym(library, #name); REQUIRE(name)
  EGL_FN(eglGetProcAddress, PFNEGLGETPROCADDRESSPROC);
  EGL_FN(eglInitialize, PFNEGLINITIALIZEPROC);
  EGL_FN(eglChooseConfig, PFNEGLCHOOSECONFIGPROC);
  EGL_FN(eglCreatePbufferSurface, PFNEGLCREATEPBUFFERSURFACEPROC);
  EGL_FN(eglCreateContext, PFNEGLCREATECONTEXTPROC);
  EGL_FN(eglMakeCurrent, PFNEGLMAKECURRENTPROC);
  EGL_FN(eglDestroyContext, PFNEGLDESTROYCONTEXTPROC);
  EGL_FN(eglDestroySurface, PFNEGLDESTROYSURFACEPROC);
  EGL_FN(eglTerminate, PFNEGLTERMINATEPROC);
#ifdef __APPLE__
  auto platform = (PFNEGLGETPLATFORMDISPLAYEXTPROC)eglGetProcAddress("eglGetPlatformDisplayEXT");
  REQUIRE(platform);
  const EGLint backend[] = {0x3203 /* ANGLE_TYPE */, 0x3489 /* METAL */, EGL_NONE};
  EGLDisplay display = platform(0x3202 /* PLATFORM_ANGLE */, nullptr, backend);
#else
  EGL_FN(eglGetDisplay, PFNEGLGETDISPLAYPROC);
  EGLDisplay display = eglGetDisplay(EGL_DEFAULT_DISPLAY);
#endif
  EGLint major, minor; REQUIRE(eglInitialize(display, &major, &minor));
  const EGLint config_attrs[] = {EGL_SURFACE_TYPE, EGL_PBUFFER_BIT, EGL_RENDERABLE_TYPE, EGL_OPENGL_ES2_BIT, EGL_RED_SIZE, 8, EGL_GREEN_SIZE, 8, EGL_BLUE_SIZE, 8, EGL_ALPHA_SIZE, 8, EGL_DEPTH_SIZE, 24, EGL_STENCIL_SIZE, 8, EGL_NONE};
  EGLConfig config; EGLint count; REQUIRE(eglChooseConfig(display, config_attrs, &config, 1, &count) && count == 1);
  const EGLint surface_attrs[] = {EGL_WIDTH, 64, EGL_HEIGHT, 64, EGL_NONE};
  EGLSurface surface = eglCreatePbufferSurface(display, config, surface_attrs); REQUIRE(surface != EGL_NO_SURFACE);
  const EGLint context_attrs[] = {EGL_CONTEXT_CLIENT_VERSION, 2,
#ifdef __APPLE__
    0x3483 /* EGL_CONTEXT_OPENGL_BACKWARDS_COMPATIBLE_ANGLE */, EGL_FALSE,
#endif
    EGL_NONE};
  EGLContext context = eglCreateContext(display, config, EGL_NO_CONTEXT, context_attrs); REQUIRE(context != EGL_NO_CONTEXT);
  REQUIRE(eglMakeCurrent(display, surface, surface, context));
  REQUIRE(gladLoadGLES2((GLADloadfunc)eglGetProcAddress));
  printf("driver: %s | %s\n", glGetString(GL_VERSION), glGetString(GL_RENDERER));
  REQUIRE(glr::init(64, 64)); REQUIRE(glr::caps.es && glr::caps.major == 2 && glr::caps.instancing);
  const char* extensions = (const char*)glGetString(GL_EXTENSIONS);
  const auto expanded = draw(false);
  REQUIRE(glGetError() == GL_NO_ERROR && glr::st.solid_upload_bytes == 260 * 64);
  std::vector<uint32_t> expected(64 * 64, 0xff000000);
  for (int i = 0; i < 260; ++i) {
    const uint32_t c = (uint32_t)(i * 7919) & 0xffffff;
    const uint32_t rgba = 0xff000000 | ((c >> 16) & 255) | (c & 0xff00) | ((c & 255) << 16);
    for (int y = 2; y < 62; ++y) for (int x = 2; x < 62; ++x)
      if (x >= i % 53 - 2 && x < i % 53 + 11 && y >= i % 47 - 3 && y < i % 47 + 14) expected[y * 64 + x] = rgba;
  }
  REQUIRE(expanded == expected);
  uint64_t hash = 1469598103934665603ull;
  for (uint32_t p : expanded) { hash ^= p; hash *= 1099511628211ull; }
  int paths = 0;
  for (const char* ext : {"GL_EXT_instanced_arrays", "GL_ANGLE_instanced_arrays"}) if (glcaps::has(extensions, ext)) {
    glr::instance_procs = glcaps::load_instancing(glr::caps, ext, glr::gl_proc);
    REQUIRE(glr::caps.instancing);
    const auto instanced = draw(true);
    REQUIRE(glGetError() == GL_NO_ERROR && instanced == expanded && glr::st.solid_upload_bytes == 260 * 24);
    GLint attributes; glGetIntegerv(GL_MAX_VERTEX_ATTRIBS, &attributes);
    for (GLint a = 0; a < attributes; ++a) { GLint divisor; glGetVertexAttribiv(a, 0x88FE, &divisor); REQUIRE(divisor == 0); }
    REQUIRE(draw(false) == expanded && glGetError() == GL_NO_ERROR);
    printf("%s: hash %016llx, identical %zu bytes; rectangle uploads 16640 -> 6240 bytes (62.5%% less)\n", ext, (unsigned long long)hash, expanded.size() * 4);
    ++paths;
  }
  REQUIRE(paths > 0);
  REQUIRE(eglMakeCurrent(display, EGL_NO_SURFACE, EGL_NO_SURFACE, EGL_NO_CONTEXT));
  REQUIRE(eglDestroyContext(display, context) && eglDestroySurface(display, surface) && eglTerminate(display));
  dlclose(library);
  return 0;
}
