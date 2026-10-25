#pragma once
#include <cstdint>
#include <vector>

namespace zn::assets {

/** PSP CLUT8 swizzle: reorder a width*height 8-bit buffer into the GE's swizzled layout (and back). Round-trips. */
void pspSwizzle8(std::vector<std::uint8_t>& buf, int width, int height);
void pspUnswizzle8(std::vector<std::uint8_t>& buf, int width, int height);

/** ETC1A4: encode a width*height RGBA buffer to ETC1 (RGB) + 4-bit alpha (16 bytes per 4x4 block). */
void encodeEtc1a4(const std::vector<std::uint8_t>& rgba, int width, int height, std::vector<std::uint8_t>& out);

/** CLUT8: a width*height RGBA picture and its night (the same size; null: none) quantised together by a median cut over each texel's day RGBA
 *  and night RGB, to at most `colors` (<= 256) pairs. `palettes`: the day's 256 RGBA colours, then the night's (include/zn/zim.h clut8);
 *  `indices`: width*height, row-major, each below `colors` (128: the PSP keeps the upper half for the same colours in shadow). */
void encodeClut8(const std::vector<std::uint8_t>& day, const std::vector<std::uint8_t>* night, int width, int height, int colors,
                 std::vector<std::uint8_t>& indices, std::vector<std::uint8_t>& palettes);

/** CLUT4: quantize to 16-color palette, indices packed two per byte (high nibble first). */
void encodeClut4(const std::vector<std::uint8_t>& rgba, int width, int height, std::vector<std::uint8_t>& packed, std::vector<std::uint8_t>& palette);

/** 3DS Morton (Z-order) tiling for 8-bit buffers: reorder linear -> tiled and back. */
void n3dsTile8(std::vector<std::uint8_t>& buf, int width, int height);
void n3dsUntile8(std::vector<std::uint8_t>& buf, int width, int height);

}  // namespace zn::assets