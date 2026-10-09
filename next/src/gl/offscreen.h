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
  /** Starts reading the framebuffer, scaled down `ss` times (1 or 2) and flipped on the GPU, into the pixel pack buffer `pbo` (made when 0,
   *  dw x dh RGBA): what gl.zincPresent shows, without a full-size readback nor a wait for the GPU (ZN-411). The script's GL state is left
   *  as it was. False (nothing started): no framebuffer blit or pixel buffer (GLES 2) or another `ss`; the caller averages read() itself. */
  bool readScaledAsync(std::uint32_t& pbo, int dw, int dh, int ss) const;
  /** Waits for the read readScaledAsync started into `pbo` and copies it into `dst` as 0x00RRGGBB rows, top to bottom. */
  void finishRead(std::uint32_t pbo, std::uint32_t* dst, int dw, int dh) const;
  void deleteBuffer(std::uint32_t pbo) const;
  /** Reallocates the colour and depth storage at a new size (contents undefined; the caller clears). Bindings are left as they were. */
  void resize(int width, int height);
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
  mutable std::uint32_t small_ = 0, smallColor_ = 0;   // readScaled's target, made on first use
  mutable int sw_ = 0, sh_ = 0;
};

}  // namespace zn::gl
