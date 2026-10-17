#include "assets/console_tex.h"
#include "rg_etc1.h"
#include <map>

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

void encodeEtc1a4(const std::vector<std::uint8_t>& rgba, int width, int height, std::vector<std::uint8_t>& out) {
  rg_etc1::pack_etc1_block_init();
  int blocksX = (width + 3) / 4, blocksY = (height + 3) / 4;
  out.assign(blocksX * blocksY * 16, 0);
  for (int by = 0; by < blocksY; ++by)
    for (int bx = 0; bx < blocksX; ++bx) {
      unsigned int src[16];
      for (int py = 0; py < 4; ++py)
        for (int px = 0; px < 4; ++px) {
          int x = bx * 4 + px, y = by * 4 + py;
          if (x >= width || y >= height) { src[py * 4 + px] = 0; continue; }
          int i = (y * width + x) * 4;
          src[py * 4 + px] = rgba[i] | (rgba[i+1] << 8) | (rgba[i+2] << 16) | (rgba[i+3] << 24);
        }
      rg_etc1::etc1_pack_params p;
      unsigned char* block = &out[(by * blocksX + bx) * 16];
      rg_etc1::pack_etc1_block(block, src, p);
      // 4-bit alpha in the second 8 bytes
      for (int py = 0; py < 4; ++py)
        for (int px = 0; px < 4; ++px) {
          int x = bx * 4 + px, y = by * 4 + py;
          unsigned char a = 0;
          if (x < width && y < height) a = rgba[(y * width + x) * 4 + 3] >> 4;
          int idx = py * 4 + px;
          if (idx % 2 == 0) block[8 + idx / 2] = (block[8 + idx / 2] & 0x0F) | (a << 4);
          else block[8 + idx / 2] = (block[8 + idx / 2] & 0xF0) | (a & 0x0F);
        }
    }
}

void encodeClut8(const std::vector<std::uint8_t>& rgba, int width, int height, std::vector<std::uint8_t>& indices, std::vector<std::uint8_t>& palette) {
  // Build a palette of up to 256 unique colors (first-seen order), padded with black.
  std::vector<std::uint32_t> pal;
  std::map<std::uint32_t, int> idx;
  auto key = [](const std::uint8_t* p) { return (p[0]) | (p[1] << 8) | (p[2] << 16) | (p[3] << 24); };
  for (std::size_t i = 0; i + 3 < rgba.size(); i += 4) {
    std::uint32_t k = key(&rgba[i]);
    if (idx.find(k) == idx.end()) { idx[k] = pal.size(); pal.push_back(k); if (pal.size() >= 256) break; }
  }
  palette.assign(256 * 4, 0);
  for (std::size_t i = 0; i < pal.size(); ++i) {
    palette[i * 4 + 0] = pal[i] & 0xFF;
    palette[i * 4 + 1] = (pal[i] >> 8) & 0xFF;
    palette[i * 4 + 2] = (pal[i] >> 16) & 0xFF;
    palette[i * 4 + 3] = (pal[i] >> 24) & 0xFF;
  }
  indices.assign(width * height, 0);
  for (int y = 0; y < height; ++y)
    for (int x = 0; x < width; ++x) {
      int i = (y * width + x) * 4;
      std::uint32_t k = key(&rgba[i]);
      auto it = idx.find(k);
      indices[y * width + x] = (it != idx.end()) ? (std::uint8_t)it->second : 0;
    }
}

}  // namespace zn::assets