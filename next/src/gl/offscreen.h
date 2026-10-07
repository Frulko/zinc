// An offscreen OpenGL / OpenGL ES context for the WebGL implementation (ZN-203.01): a hidden SDL3 window, a context of the API the tier asks for,
// glad function pointers (third_party/glad) and a framebuffer object to draw into and read back. Independent of display-gl.
#pragma once
#include <cstdint>
#include <string>
#include <vector>

namespace zn::gl {

enum class Api { Gles2, Gles3, Gl33 };   // GLES2: WebGL1 on the Pi 3 (T2); GLES3: Pi 4/5 and mobile (T3); GL 3.3 core: desktop (T3/T4)

struct Info { std::string version, renderer, vendor; bool es = false; int major = 0, minor = 0; };

class Offscreen {
 public:
  Offscreen() = default;
  ~Offscreen();
  Offscreen(const Offscreen&) = delete;
  Offscreen& operator=(const Offscreen&) = delete;
  /** Creates the context and a width x height RGBA8 framebuffer (left bound). Asks for `api`; with `fallback` any API that works is accepted. False: `error()` says why. */
  bool create(Api api, int width, int height, bool fallback, std::string& error);
  bool makeCurrent();
  Api api() const { return api_; }
  const Info& info() const { return info_; }
  bool hasExtension(const char* name) const;
  /** RGBA8 pixels of the framebuffer, bottom row first like glReadPixels. */
  std::vector<std::uint8_t> read() const;
  std::uint32_t framebuffer() const { return fbo_; }   // the offscreen framebuffer: what WebGL calls the default framebuffer
  int width() const { return w_; }
  int height() const { return h_; }

 private:
  void* window_ = nullptr;
  void* context_ = nullptr;
  Api api_ = Api::Gl33;
  Info info_;
  std::uint32_t fbo_ = 0, color_ = 0, depth_ = 0;
  int w_ = 0, h_ = 0;
};

}  // namespace zn::gl
