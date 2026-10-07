#include "gl/offscreen.h"

#include <SDL3/SDL.h>

#include <cstring>

#include "glad/gl.h"

// One merged glad loader (third_party/glad: desktop core 3.3 and GLES 3.0): the function pointers of the API that is not loaded stay null.
namespace zn::gl {
namespace {

bool tryCreate(Api api, SDL_Window*& window, SDL_GLContext& ctx, std::string& error) {
  SDL_GL_ResetAttributes();
  if (api == Api::Gl33) {
    SDL_GL_SetAttribute(SDL_GL_CONTEXT_PROFILE_MASK, SDL_GL_CONTEXT_PROFILE_CORE);
    SDL_GL_SetAttribute(SDL_GL_CONTEXT_MAJOR_VERSION, 3);
    SDL_GL_SetAttribute(SDL_GL_CONTEXT_MINOR_VERSION, 3);
    SDL_GL_SetAttribute(SDL_GL_CONTEXT_FLAGS, SDL_GL_CONTEXT_FORWARD_COMPATIBLE_FLAG);
  } else {
    SDL_GL_SetAttribute(SDL_GL_CONTEXT_PROFILE_MASK, SDL_GL_CONTEXT_PROFILE_ES);
    SDL_GL_SetAttribute(SDL_GL_CONTEXT_MAJOR_VERSION, api == Api::Gles3 ? 3 : 2);
    SDL_GL_SetAttribute(SDL_GL_CONTEXT_MINOR_VERSION, 0);
  }
  window = SDL_CreateWindow("zinc offscreen", 16, 16, SDL_WINDOW_OPENGL | SDL_WINDOW_HIDDEN);
  if (!window) { error = std::string("SDL_CreateWindow: ") + SDL_GetError(); return false; }
  ctx = SDL_GL_CreateContext(window);
  if (!ctx) { error = std::string("SDL_GL_CreateContext: ") + SDL_GetError(); SDL_DestroyWindow(window); window = nullptr; return false; }
  return true;
}

}  // namespace

Offscreen::~Offscreen() {
  if (context_) {
    SDL_GL_MakeCurrent(static_cast<SDL_Window*>(window_), static_cast<SDL_GLContext>(context_));
    glDeleteFramebuffers(1, &fbo_); glDeleteTextures(1, &color_); glDeleteRenderbuffers(1, &depth_);
    SDL_GL_DestroyContext(static_cast<SDL_GLContext>(context_));
  }
  if (window_) SDL_DestroyWindow(static_cast<SDL_Window*>(window_));
}

bool Offscreen::makeCurrent() { return SDL_GL_MakeCurrent(static_cast<SDL_Window*>(window_), static_cast<SDL_GLContext>(context_)); }

bool Offscreen::create(Api want, int width, int height, bool fallback, std::string& error) {
  if (!SDL_WasInit(SDL_INIT_VIDEO) && !SDL_InitSubSystem(SDL_INIT_VIDEO)) { error = std::string("SDL video: ") + SDL_GetError(); return false; }
  const Api order[] = {want, Api::Gl33, Api::Gles3, Api::Gles2};
  SDL_Window* win = nullptr;
  SDL_GLContext ctx = nullptr;
  std::string why;
  bool ok = false;
  for (Api a : order) {
    if (a != want && !fallback) break;
    if (a != want && a == want) continue;
    if (tryCreate(a, win, ctx, why)) { api_ = a; ok = true; break; }
  }
  if (!ok) { error = why; return false; }
  window_ = win;
  context_ = ctx;
  w_ = width;
  h_ = height;
  if (api_ == Api::Gl33) {
    if (!gladLoadGL(reinterpret_cast<GLADloadfunc>(SDL_GL_GetProcAddress))) { error = "gladLoadGL failed"; return false; }
    info_.es = false;
    const char* v = reinterpret_cast<const char*>(glGetString(GL_VERSION));
    info_.version = v ? v : "";
    info_.renderer = reinterpret_cast<const char*>(glGetString(GL_RENDERER));
    info_.vendor = reinterpret_cast<const char*>(glGetString(GL_VENDOR));
    glGetIntegerv(GL_MAJOR_VERSION, &info_.major);
    glGetIntegerv(GL_MINOR_VERSION, &info_.minor);
    glGenTextures(1, &color_);
    glBindTexture(GL_TEXTURE_2D, color_);
    glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA8, w_, h_, 0, GL_RGBA, GL_UNSIGNED_BYTE, nullptr);
    glGenRenderbuffers(1, &depth_);
    glBindRenderbuffer(GL_RENDERBUFFER, depth_);
    glRenderbufferStorage(GL_RENDERBUFFER, GL_DEPTH24_STENCIL8, w_, h_);
    glGenFramebuffers(1, &fbo_);
    glBindFramebuffer(GL_FRAMEBUFFER, fbo_);
    glFramebufferTexture2D(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_TEXTURE_2D, color_, 0);
    glFramebufferRenderbuffer(GL_FRAMEBUFFER, GL_DEPTH_STENCIL_ATTACHMENT, GL_RENDERBUFFER, depth_);
    if (glCheckFramebufferStatus(GL_FRAMEBUFFER) != GL_FRAMEBUFFER_COMPLETE) { error = "offscreen framebuffer incomplete"; return false; }
    glViewport(0, 0, w_, h_);
  } else {
    if (!gladLoadGL(reinterpret_cast<GLADloadfunc>(SDL_GL_GetProcAddress))) { error = "gladLoadGLES2 failed"; return false; }
    info_.es = true;
    const char* v = reinterpret_cast<const char*>(glGetString(GL_VERSION));
    info_.version = v ? v : "";
    info_.renderer = reinterpret_cast<const char*>(glGetString(GL_RENDERER));
    info_.vendor = reinterpret_cast<const char*>(glGetString(GL_VENDOR));
    info_.major = api_ == Api::Gles3 ? 3 : 2;
    glGenTextures(1, &color_);
    glBindTexture(GL_TEXTURE_2D, color_);
    glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA, w_, h_, 0, GL_RGBA, GL_UNSIGNED_BYTE, nullptr);
    glGenRenderbuffers(1, &depth_);
    glBindRenderbuffer(GL_RENDERBUFFER, depth_);
    glRenderbufferStorage(GL_RENDERBUFFER, GL_DEPTH_COMPONENT16, w_, h_);
    glGenFramebuffers(1, &fbo_);
    glBindFramebuffer(GL_FRAMEBUFFER, fbo_);
    glFramebufferTexture2D(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_TEXTURE_2D, color_, 0);
    glFramebufferRenderbuffer(GL_FRAMEBUFFER, GL_DEPTH_ATTACHMENT, GL_RENDERBUFFER, depth_);
    if (glCheckFramebufferStatus(GL_FRAMEBUFFER) != GL_FRAMEBUFFER_COMPLETE) { error = "offscreen framebuffer incomplete"; return false; }
    glViewport(0, 0, w_, h_);
  }
  return true;
}

bool Offscreen::hasExtension(const char* name) const {
  if (api_ == Api::Gl33) {
    GLint n = 0;
    glGetIntegerv(GL_NUM_EXTENSIONS, &n);
    for (GLint i = 0; i < n; ++i) if (!std::strcmp(reinterpret_cast<const char*>(glGetStringi(GL_EXTENSIONS, static_cast<GLuint>(i))), name)) return true;
    return false;
  }
  const char* e = reinterpret_cast<const char*>(glGetString(GL_EXTENSIONS));
  if (!e) return false;
  const std::size_t len = std::strlen(name);
  for (const char* p = e; (p = std::strstr(p, name)); p += len) if ((p == e || p[-1] == ' ') && (p[len] == ' ' || !p[len])) return true;
  return false;
}

std::vector<std::uint8_t> Offscreen::read() const {
  std::vector<std::uint8_t> px(static_cast<std::size_t>(w_) * h_ * 4);
  glReadPixels(0, 0, w_, h_, GL_RGBA, GL_UNSIGNED_BYTE, px.data());
  return px;
}

}  // namespace zn::gl
