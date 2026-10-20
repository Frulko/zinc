#pragma once
// Colour glyphs from the `sbix` table (Apple Color Emoji): PNG strikes decoded with stb_image and scaled to the pixel size (ZN-225).
#include <cstddef>
#include <cstdint>
#include <vector>

namespace zn::text {

struct ColorBitmap { int w = 0, h = 0, left = 0, top = 0; std::vector<uint32_t> rgba; };   // top: pixels from the baseline up to the first row; rgba: 0xAABBGGRR, straight alpha

bool hasSbix(const uint8_t* font, size_t size);
// The glyph `gid` of a font file with an sbix table (first face of a collection) at `px` pixels per em; false when the glyph has no bitmap.
bool sbixGlyph(const uint8_t* font, size_t size, uint32_t gid, float px, ColorBitmap& out);

}  // namespace zn::text
