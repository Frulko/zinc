#pragma once
// ZIM1, the image entry of a pack (docs/reports/zinc-next-assets.md): written by the image and texture importers (src/assets), read by the host
// (src/host/sys_host.cpp). 16 bytes, little-endian: "ZIM1", u8 format, u8 scale, u16 flags, u32 width, u32 height; then the levels, the largest
// first, each its rows top to bottom (a block format: its rows of blocks). The one place the formats are defined.
#include <cstddef>
#include <cstdint>

namespace zn::zim {

inline constexpr std::size_t kHeader = 16;
enum Flags : std::uint16_t { Premultiplied = 1, Mipmaps = 2, Srgb = 4 };   // Mipmaps: every level down to 1 x 1 follows level 0

/** A pixel layout (1 x 1 blocks: red in the high bits of the 16-bit ones) or a GPU block format. `gl`: its internal format in OpenGL; ETC1 data
 *  is also valid ETC2 RGB8 (0x9274), the fallback upload where OES_compressed_ETC1_RGB8_texture is missing. */
struct Format { std::uint8_t id; const char* name; std::uint8_t bw, bh, bytes; bool alpha; std::uint32_t gl; };
inline constexpr Format kFormats[] = {
    {1, "rgba8", 1, 1, 4, true, 0x8058},     {2, "rgb565", 1, 1, 2, false, 0x8D62}, {3, "rgba4444", 1, 1, 2, true, 0x8056},
    {4, "rgba5551", 1, 1, 2, true, 0x8057},  {8, "bc1", 4, 4, 8, false, 0x83F0},    {9, "bc3", 4, 4, 16, true, 0x83F3},
    {10, "bc7", 4, 4, 16, true, 0x8E8C},     {11, "etc1", 4, 4, 8, false, 0x8D64},  {12, "etc2", 4, 4, 16, true, 0x9278},
    {13, "astc", 4, 4, 16, true, 0x93B0},    {14, "pvrtc", 4, 4, 8, false, 0x8C00}, {15, "pvrtca", 4, 4, 8, true, 0x8C02},
};

inline const Format* format(std::uint8_t id) {
  for (const Format& f : kFormats) if (f.id == id) return &f;
  return nullptr;
}
/** The bytes of one w x h level. PVRTC1 4 bpp counts at least 8 x 8 texels a level. */
inline std::size_t levelBytes(const Format& f, std::uint32_t w, std::uint32_t h) {
  if (f.id == 14 || f.id == 15) { w = w < 8 ? 8 : w; h = h < 8 ? 8 : h; }
  return static_cast<std::size_t>((w + f.bw - 1) / f.bw) * ((h + f.bh - 1) / f.bh) * f.bytes;
}
/** The bytes after the header: level 0, or every level when `mipmaps`. */
inline std::size_t dataBytes(const Format& f, std::uint32_t w, std::uint32_t h, bool mipmaps) {
  std::size_t n = levelBytes(f, w, h);
  while (mipmaps && (w > 1 || h > 1)) { w = w > 1 ? w / 2 : 1; h = h > 1 ? h / 2 : 1; n += levelBytes(f, w, h); }
  return n;
}

}  // namespace zn::zim
