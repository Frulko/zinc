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
    if (small_) { glDeleteFramebuffers(1, &small_); glDeleteRenderbuffers(1, &smallColor_); }
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
    glScissor(0, 0, w_, h_);
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
    glScissor(0, 0, w_, h_);
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

void Offscreen::resize(int width, int height) {
  if (width < 1) width = 1;
  if (height < 1) height = 1;
  makeCurrent();
  w_ = width; h_ = height;
  GLint unit = 0, tex = 0, rb = 0;
  glGetIntegerv(GL_ACTIVE_TEXTURE, &unit);
  glActiveTexture(GL_TEXTURE0);
  glGetIntegerv(GL_TEXTURE_BINDING_2D, &tex);
  glGetIntegerv(GL_RENDERBUFFER_BINDING, &rb);
  const bool es = api_ != Api::Gl33;
  GLint pbo = 0;
  if (api_ != Api::Gles2) { glGetIntegerv(GL_PIXEL_UNPACK_BUFFER_BINDING, &pbo); glBindBuffer(GL_PIXEL_UNPACK_BUFFER, 0); }   // a pixel unpack buffer would turn the null into an offset
  glBindTexture(GL_TEXTURE_2D, color_);
  glTexImage2D(GL_TEXTURE_2D, 0, es ? GL_RGBA : GL_RGBA8, w_, h_, 0, GL_RGBA, GL_UNSIGNED_BYTE, nullptr);
  if (api_ != Api::Gles2) glBindBuffer(GL_PIXEL_UNPACK_BUFFER, static_cast<GLuint>(pbo));
  glBindTexture(GL_TEXTURE_2D, static_cast<GLuint>(tex));
  glActiveTexture(static_cast<GLenum>(unit));
  glBindRenderbuffer(GL_RENDERBUFFER, depth_);
  glRenderbufferStorage(GL_RENDERBUFFER, es ? GL_DEPTH_COMPONENT16 : GL_DEPTH24_STENCIL8, w_, h_);
  glBindRenderbuffer(GL_RENDERBUFFER, static_cast<GLuint>(rb));
}

std::vector<std::uint8_t> Offscreen::read() const {
  std::vector<std::uint8_t> px(static_cast<std::size_t>(w_) * h_ * 4);
  glReadPixels(0, 0, w_, h_, GL_RGBA, GL_UNSIGNED_BYTE, px.data());
  return px;
}

bool Offscreen::readScaledAsync(std::uint32_t& pbo, int dw, int dh, int ss) const {
  if (api_ == Api::Gles2 || (ss != 1 && ss != 2) || dw * ss != w_ || dh * ss != h_) return false;
  GLint read = 0, draw = 0, rb = 0, pack = 0, align = 0, rowLen = 0, skipRows = 0, skipPx = 0;
  glGetIntegerv(GL_READ_FRAMEBUFFER_BINDING, &read);
  glGetIntegerv(GL_DRAW_FRAMEBUFFER_BINDING, &draw);
  glGetIntegerv(GL_RENDERBUFFER_BINDING, &rb);
  glGetIntegerv(GL_PIXEL_PACK_BUFFER_BINDING, &pack);
  glGetIntegerv(GL_PACK_ALIGNMENT, &align); glGetIntegerv(GL_PACK_ROW_LENGTH, &rowLen); glGetIntegerv(GL_PACK_SKIP_ROWS, &skipRows); glGetIntegerv(GL_PACK_SKIP_PIXELS, &skipPx);
  const GLboolean scissor = glIsEnabled(GL_SCISSOR_TEST), discard = glIsEnabled(GL_RASTERIZER_DISCARD);
  if (!small_ || sw_ != dw || sh_ != dh) {
    if (!small_) { glGenFramebuffers(1, &small_); glGenRenderbuffers(1, &smallColor_); }
    glBindRenderbuffer(GL_RENDERBUFFER, smallColor_);
    glRenderbufferStorage(GL_RENDERBUFFER, GL_RGBA8, dw, dh);
    glBindFramebuffer(GL_DRAW_FRAMEBUFFER, small_);
    glFramebufferRenderbuffer(GL_DRAW_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_RENDERBUFFER, smallColor_);
    sw_ = dw; sh_ = dh;
  }
  if (!pbo) glGenBuffers(1, &pbo);
  glBindBuffer(GL_PIXEL_PACK_BUFFER, pbo);
  glBufferData(GL_PIXEL_PACK_BUFFER, static_cast<GLsizeiptr>(dw) * dh * 4, nullptr, GL_STREAM_READ);   // a new store: the GPU need not wait for a previous read of it
  glDisable(GL_SCISSOR_TEST); glDisable(GL_RASTERIZER_DISCARD);   // a blit ignores the write masks, not the scissor
  glBindFramebuffer(GL_READ_FRAMEBUFFER, fbo_);
  glBindFramebuffer(GL_DRAW_FRAMEBUFFER, small_);
  // dw x dh, rows flipped (the destination's y runs down); halving with LINEAR samples between 4 texels: their average
  glBlitFramebuffer(0, 0, w_, h_, 0, dh, dw, 0, GL_COLOR_BUFFER_BIT, ss == 2 ? GL_LINEAR : GL_NEAREST);
  glBindFramebuffer(GL_READ_FRAMEBUFFER, small_);
  glPixelStorei(GL_PACK_ALIGNMENT, 4); glPixelStorei(GL_PACK_ROW_LENGTH, 0); glPixelStorei(GL_PACK_SKIP_ROWS, 0); glPixelStorei(GL_PACK_SKIP_PIXELS, 0);
  glReadPixels(0, 0, dw, dh, GL_RGBA, GL_UNSIGNED_BYTE, nullptr);   // into the buffer: the GPU copies, the call returns at once
  glPixelStorei(GL_PACK_ALIGNMENT, align); glPixelStorei(GL_PACK_ROW_LENGTH, rowLen); glPixelStorei(GL_PACK_SKIP_ROWS, skipRows); glPixelStorei(GL_PACK_SKIP_PIXELS, skipPx);
  glBindBuffer(GL_PIXEL_PACK_BUFFER, static_cast<GLuint>(pack));
  if (scissor) glEnable(GL_SCISSOR_TEST);
  if (discard) glEnable(GL_RASTERIZER_DISCARD);
  glBindRenderbuffer(GL_RENDERBUFFER, static_cast<GLuint>(rb));
  glBindFramebuffer(GL_READ_FRAMEBUFFER, static_cast<GLuint>(read));
  glBindFramebuffer(GL_DRAW_FRAMEBUFFER, static_cast<GLuint>(draw));
  return true;
}

void Offscreen::finishRead(std::uint32_t pbo, std::uint32_t* dst, int dw, int dh) const {
  GLint pack = 0;
  glGetIntegerv(GL_PIXEL_PACK_BUFFER_BINDING, &pack);
  glBindBuffer(GL_PIXEL_PACK_BUFFER, pbo);
  const std::size_t n = static_cast<std::size_t>(dw) * dh;
  if (const auto* src = static_cast<const std::uint32_t*>(glMapBufferRange(GL_PIXEL_PACK_BUFFER, 0, static_cast<GLsizeiptr>(n * 4), GL_MAP_READ_BIT))) {
    for (std::size_t i = 0; i < n; ++i) { const std::uint32_t p = src[i]; dst[i] = (p & 0x00FF00u) | ((p & 0xFF) << 16) | ((p >> 16) & 0xFF); }   // RGBA bytes -> 0x00RRGGBB
    glUnmapBuffer(GL_PIXEL_PACK_BUFFER);
  }
  glBindBuffer(GL_PIXEL_PACK_BUFFER, static_cast<GLuint>(pack));
}

void Offscreen::deleteBuffer(std::uint32_t pbo) const { if (pbo) glDeleteBuffers(1, &pbo); }

}  // namespace zn::gl
