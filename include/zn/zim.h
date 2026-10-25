#pragma once
// ZIM1, the image entry of a pack (docs/reports/zinc-next-assets.md): written by the image and texture importers (src/assets), read by the host
// (src/host/sys_host.cpp). 16 bytes, little-endian: "ZIM1", u8 format, u8 scale, u16 flags, u32 width, u32 height; then the levels, the largest
// first, each its rows top to bottom (a block format: its rows of blocks). The one place the formats are defined.
// clut8 (the PSP's T8 pictures) has one level after two palettes of 256 RGBA colours: the day's and the night's (the same when the image has
// no night picture). The GE mixes them by the hour; a renderer that does not draws the day's.
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
    {16, "clut8", 1, 1, 1, true, 0},
};
inline constexpr std::size_t kClut8Palettes = 2 * 256 * 4;   // clut8: the day's and the night's palettes before the indices

inline const Format* format(std::uint8_t id) {
  for (const Format& f : kFormats) if (f.id == id) return &f;
  return nullptr;
}
/** The bytes of one w x h level. PVRTC1 4 bpp counts at least 8 x 8 texels a level. */
inline std::size_t levelBytes(const Format& f, std::uint32_t w, std::uint32_t h) {
  if (f.id == 14 || f.id == 15) { w = w < 8 ? 8 : w; h = h < 8 ? 8 : h; }
  return static_cast<std::size_t>((w + f.bw - 1) / f.bw) * ((h + f.bh - 1) / f.bh) * f.bytes;
}
/** The bytes after the header: level 0, or every level when `mipmaps` (clut8: its palettes first). */
inline std::size_t dataBytes(const Format& f, std::uint32_t w, std::uint32_t h, bool mipmaps) {
  std::size_t n = levelBytes(f, w, h) + (f.id == 16 ? kClut8Palettes : 0);
  while (mipmaps && (w > 1 || h > 1)) { w = w > 1 ? w / 2 : 1; h = h > 1 ? h / 2 : 1; n += levelBytes(f, w, h); }
  return n;
}

/** Pixel `i` of an uncompressed level (rgba8, rgb565, rgba4444, rgba5551; clut8 by its day palette, `data` the bytes after the header) as
 *  0xAARRGGBB, straight alpha: what the software raster draws. */
inline std::uint32_t argb(const Format& f, const unsigned char* data, std::size_t i, bool premultiplied) {
  unsigned r, g, b, a = 255;
  if (f.id == 1 || f.id == 16) { const unsigned char* s = f.id == 1 ? data + i * 4 : data + data[kClut8Palettes + i] * 4; r = s[0]; g = s[1]; b = s[2]; a = s[3]; }
  else {
    const unsigned char* s = data + i * 2;
    const unsigned v = s[0] | s[1] << 8;
    if (f.id == 2) { r = ((v >> 11) * 255 + 15) / 31; g = (((v >> 5) & 63) * 255 + 31) / 63; b = ((v & 31) * 255 + 15) / 31; }
    else if (f.id == 3) { r = (v >> 12) * 17; g = ((v >> 8) & 15) * 17; b = ((v >> 4) & 15) * 17; a = (v & 15) * 17; }
    else { r = ((v >> 11) * 255 + 15) / 31; g = (((v >> 6) & 31) * 255 + 15) / 31; b = (((v >> 1) & 31) * 255 + 15) / 31; a = (v & 1) * 255; }
  }
  auto up = [a](unsigned c) { const unsigned u = (c * 255 + a / 2) / a; return u > 255 ? 255u : u; };
  if (premultiplied && a && a < 255) { r = up(r); g = up(g); b = up(b); }
  return a << 24 | r << 16 | g << 8 | b;
}

}  // namespace zn::zim
