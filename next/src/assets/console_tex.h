#pragma once
#include <cstdint>
#include <vector>

namespace zn::assets {

/** PSP CLUT8 swizzle: reorder a width*height 8-bit buffer into the GE's swizzled layout (and back). Round-trips. */
void pspSwizzle8(std::vector<std::uint8_t>& buf, int width, int height);
void pspUnswizzle8(std::vector<std::uint8_t>& buf, int width, int height);

/** ETC1A4: encode a width*height RGBA buffer to ETC1 (RGB) + 4-bit alpha (16 bytes per 4x4 block). */
void encodeEtc1a4(const std::vector<std::uint8_t>& rgba, int width, int height, std::vector<std::uint8_t>& out);

/** CLUT8: quantize a width*height RGBA buffer to 8-bit palette indices. Palette is written to `palette` (256*4 bytes). */
void encodeClut8(const std::vector<std::uint8_t>& rgba, int width, int height, std::vector<std::uint8_t>& indices, std::vector<std::uint8_t>& palette);

}  // namespace zn::assets