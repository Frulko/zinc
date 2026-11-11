// WebGL allocations must not expose the driver's previous storage.
#pragma once
#include <algorithm>
#include <vector>
#include "glad/gl.h"
namespace zn::gl {
struct ZeroUpload {
  GLint buffer = 0, state[6] = {};
  static constexpr GLenum names[6] = {GL_UNPACK_ALIGNMENT, GL_UNPACK_ROW_LENGTH, GL_UNPACK_IMAGE_HEIGHT, GL_UNPACK_SKIP_PIXELS, GL_UNPACK_SKIP_ROWS, GL_UNPACK_SKIP_IMAGES};
  ZeroUpload() {
    glGetIntegerv(GL_PIXEL_UNPACK_BUFFER_BINDING, &buffer);
    glBindBuffer(GL_PIXEL_UNPACK_BUFFER, 0);
    for (int i = 0; i < 6; ++i) { glGetIntegerv(names[i], &state[i]); glPixelStorei(names[i], i == 0 ? 1 : 0); }
  }
  ~ZeroUpload() {
    for (int i = 0; i < 6; ++i) glPixelStorei(names[i], state[i]);
    glBindBuffer(GL_PIXEL_UNPACK_BUFFER, buffer);
  }
  ZeroUpload(const ZeroUpload&) = delete;
  ZeroUpload& operator=(const ZeroUpload&) = delete;
};
template<class Check>
bool zeroImage(GLenum target, int level, GLint internal, int w, int h, int d, GLenum format, GLenum type, int bpp, bool three, Check check) {
  check(); // Keep earlier driver errors visible, separately from this allocation.
  ZeroUpload unpack;
  const std::size_t rowBytes = static_cast<std::size_t>(w) * bpp;
  const int rows = std::max(1, std::min(h, int(65536 / std::max<std::size_t>(1, rowBytes))));
  const std::vector<unsigned char> zeros(rowBytes * rows, 0);
  if (three) glTexImage3D(target, level, internal, w, h, d, 0, format, type, nullptr);
  else glTexImage2D(target, level, internal, w, h, 0, format, type, nullptr);
  if (!check()) return false;
  if (!w || !h || !d) return true;
  for (int z = 0; z < d; ++z) for (int y = 0; y < h; y += rows) {
    const int count = std::min(rows, h - y);
    if (three) glTexSubImage3D(target, level, 0, y, z, w, count, 1, format, type, zeros.data());
    else glTexSubImage2D(target, level, 0, y, w, count, format, type, zeros.data());
    if (!check()) return false;
  }
  return true;
}
}
