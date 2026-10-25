#include "assets/console_tex.h"
#include "rg_etc1.h"
#include <algorithm>
#include <array>
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

namespace {
// a texel's colours for the median cut, five bits a channel: the day's red, green, blue and alpha, then the night's red, green, blue
constexpr int kChannels = 7;
std::uint64_t clutKey(const std::uint8_t* d, const std::uint8_t* n) {
  std::uint64_t k = 0;
  for (int c = 0; c < 4; ++c) k |= static_cast<std::uint64_t>(d[c] >> 3) << (5 * c);
  for (int c = 0; c < 3; ++c) k |= static_cast<std::uint64_t>(n[c] >> 3) << (5 * (4 + c));
  return k;
}
unsigned clutChannel(std::uint64_t k, int c) { return static_cast<unsigned>(k >> (5 * c)) & 31; }
}  // namespace

void encodeClut8(const std::vector<std::uint8_t>& day, const std::vector<std::uint8_t>* night, int width, int height, int colors,
                 std::vector<std::uint8_t>& indices, std::vector<std::uint8_t>& palettes) {
  const std::size_t n = static_cast<std::size_t>(width) * height;
  const std::uint8_t* nt = night && night->size() >= n * 4 ? night->data() : day.data();
  colors = colors < 1 ? 1 : colors > 256 ? 256 : colors;
  std::map<std::uint64_t, std::uint32_t> count;   // ordered: the same palette on every machine
  for (std::size_t i = 0; i < n; ++i) ++count[clutKey(&day[i * 4], nt + i * 4)];
  struct Box { std::vector<std::pair<std::uint64_t, std::uint32_t>> e; std::uint64_t total = 0; unsigned range = 0; int widest = 0; };
  auto measure = [](Box& b) {
    b.total = 0; b.range = 0; b.widest = 0;
    for (const auto& e : b.e) b.total += e.second;
    for (int c = 0; c < kChannels; ++c) {
      unsigned lo = 31, hi = 0;
      for (const auto& e : b.e) { const unsigned v = clutChannel(e.first, c); lo = v < lo ? v : lo; hi = v > hi ? v : hi; }
      if (hi - lo > b.range || (c == 0 && hi >= lo)) { b.range = hi >= lo ? hi - lo : 0; b.widest = c; }
    }
  };
  std::vector<Box> boxes(1);
  boxes[0].e.assign(count.begin(), count.end());
  measure(boxes[0]);
  // median cut: the box with the most texels times its widest channel is split at its median texel along that channel
  while (static_cast<int>(boxes.size()) < colors) {
    int at = -1;
    std::uint64_t best = 0;
    for (std::size_t i = 0; i < boxes.size(); ++i) {
      const std::uint64_t score = boxes[i].e.size() > 1 ? boxes[i].total * boxes[i].range : 0;
      if (score > best) { best = score; at = static_cast<int>(i); }
    }
    if (at < 0) break;
    Box& b = boxes[static_cast<std::size_t>(at)];
    const int c = b.widest;
    std::stable_sort(b.e.begin(), b.e.end(), [c](const auto& x, const auto& y) { return clutChannel(x.first, c) < clutChannel(y.first, c); });
    std::uint64_t acc = 0;
    std::size_t cut = 1;
    for (std::size_t k = 0; k < b.e.size(); ++k) {
      acc += b.e[k].second;
      if (acc * 2 >= b.total) { cut = k + 1; break; }
    }
    cut = cut >= b.e.size() ? b.e.size() - 1 : cut;
    Box tail;
    tail.e.assign(b.e.begin() + static_cast<std::ptrdiff_t>(cut), b.e.end());
    b.e.resize(cut);
    measure(b); measure(tail);
    boxes.push_back(std::move(tail));
  }
  // each box's colour: the mean of its texels' (the 5-bit values at their centre)
  std::vector<std::array<int, kChannels>> pal(boxes.size());
  for (std::size_t i = 0; i < boxes.size(); ++i)
    for (int c = 0; c < kChannels; ++c) {
      std::uint64_t s = 0;
      for (const auto& e : boxes[i].e) s += static_cast<std::uint64_t>(clutChannel(e.first, c) * 8 + 4) * e.second;
      pal[i][c] = boxes[i].total ? static_cast<int>(s / boxes[i].total) : 0;
    }
  palettes.assign(2 * 256 * 4, 0);
  for (std::size_t i = 0; i < pal.size(); ++i) {
    for (int c = 0; c < 4; ++c) palettes[i * 4 + c] = static_cast<std::uint8_t>(pal[i][c] > 255 ? 255 : pal[i][c]);
    for (int c = 0; c < 3; ++c) palettes[1024 + i * 4 + c] = static_cast<std::uint8_t>(pal[i][4 + c] > 255 ? 255 : pal[i][4 + c]);
    palettes[1024 + i * 4 + 3] = palettes[i * 4 + 3];
  }
  // each texel: the nearest colour pair, found once for each distinct key
  std::map<std::uint64_t, std::uint8_t> nearest;
  indices.assign(n, 0);
  for (std::size_t i = 0; i < n; ++i) {
    const std::uint64_t k = clutKey(&day[i * 4], nt + i * 4);
    auto it = nearest.find(k);
    if (it == nearest.end()) {
      const int v[kChannels] = {day[i * 4], day[i * 4 + 1], day[i * 4 + 2], day[i * 4 + 3], nt[i * 4], nt[i * 4 + 1], nt[i * 4 + 2]};
      std::size_t best = 0;
      long bestD = -1;
      for (std::size_t j = 0; j < pal.size(); ++j) {
        long d = 0;
        for (int c = 0; c < kChannels; ++c) d += static_cast<long>(pal[j][c] - v[c]) * (pal[j][c] - v[c]);
        if (bestD < 0 || d < bestD) { bestD = d; best = j; }
      }
      it = nearest.emplace(k, static_cast<std::uint8_t>(best)).first;
    }
    indices[i] = it->second;
  }
}

void encodeClut4(const std::vector<std::uint8_t>& rgba, int width, int height, std::vector<std::uint8_t>& packed, std::vector<std::uint8_t>& palette) {
  std::vector<std::uint32_t> pal;
  std::map<std::uint32_t, int> idx;
  auto key = [](const std::uint8_t* p) { return (p[0]) | (p[1] << 8) | (p[2] << 16) | (p[3] << 24); };
  for (std::size_t i = 0; i + 3 < rgba.size(); i += 4) {
    std::uint32_t k = key(&rgba[i]);
    if (idx.find(k) == idx.end()) { idx[k] = pal.size(); pal.push_back(k); if (pal.size() >= 16) break; }
  }
  while (pal.size() < 16) pal.push_back(0);
  palette.assign(16 * 4, 0);
  for (std::size_t i = 0; i < 16; ++i) {
    palette[i * 4 + 0] = pal[i] & 0xFF;
    palette[i * 4 + 1] = (pal[i] >> 8) & 0xFF;
    palette[i * 4 + 2] = (pal[i] >> 16) & 0xFF;
    palette[i * 4 + 3] = (pal[i] >> 24) & 0xFF;
  }
  int n = width * height;
  packed.assign((n + 1) / 2, 0);
  for (int i = 0; i < n; ++i) {
    std::uint32_t k = key(&rgba[i * 4]);
    auto it = idx.find(k);
    int pi = (it != idx.end()) ? it->second : 0;
    if (i % 2 == 0) packed[i / 2] = (packed[i / 2] & 0x0F) | (pi << 4);
    else packed[i / 2] = (packed[i / 2] & 0xF0) | (pi & 0x0F);
  }
}

static int morton2(int x, int y) {
  int z = 0;
  for (int i = 0; i < 8; ++i) {
    z |= ((x >> i) & 1) << (2 * i);
    z |= ((y >> i) & 1) << (2 * i + 1);
  }
  return z;
}

void n3dsTile8(std::vector<std::uint8_t>& buf, int width, int height) {
  std::vector<std::uint8_t> out(buf.size());
  for (int y = 0; y < height; ++y)
    for (int x = 0; x < width; ++x) {
      int bx = x >> 3, by = y >> 3;
      int withinX = x & 7, withinY = y & 7;
      int blockIndex = by * (width >> 3) + bx;
      int off = blockIndex * 64 + morton2(withinX, withinY);
      if (off < (int)out.size()) out[off] = buf[y * width + x];
    }
  buf.swap(out);
}

void n3dsUntile8(std::vector<std::uint8_t>& buf, int width, int height) {
  std::vector<std::uint8_t> out(buf.size());
  for (int y = 0; y < height; ++y)
    for (int x = 0; x < width; ++x) {
      int bx = x >> 3, by = y >> 3;
      int withinX = x & 7, withinY = y & 7;
      int blockIndex = by * (width >> 3) + bx;
      int off = blockIndex * 64 + morton2(withinX, withinY);
      if (off < (int)buf.size()) out[y * width + x] = buf[off];
    }
  buf.swap(out);
}

}  // namespace zn::assets