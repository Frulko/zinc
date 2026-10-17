#include "assets/console_tex.h"

namespace zn::assets {

void pspSwizzle8(std::vector<std::uint8_t>& buf, int width, int height) {
  std::vector<std::uint8_t> out(buf.size());
  for (int y = 0; y < height; ++y)
    for (int x = 0; x < width; ++x) {
      int bx = x >> 2, by = y >> 2;
      int wx = x & 3, wy = y & 3;
      int blockIndex = by * (width >> 2) + bx;
      int off = blockIndex * 16 + (wy << 2) + wx;
      if (off < (int)out.size()) out[off] = buf[y * width + x];
    }
  buf.swap(out);
}

void pspUnswizzle8(std::vector<std::uint8_t>& buf, int width, int height) {
  std::vector<std::uint8_t> out(buf.size());
  for (int y = 0; y < height; ++y)
    for (int x = 0; x < width; ++x) {
      int bx = x >> 2, by = y >> 2;
      int wx = x & 3, wy = y & 3;
      int blockIndex = by * (width >> 2) + bx;
      int off = blockIndex * 16 + (wy << 2) + wx;
      if (off < (int)buf.size()) out[y * width + x] = buf[off];
    }
  buf.swap(out);
}

}  // namespace zn::assets