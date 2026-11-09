#pragma once
// MSDF text (ZN-442): the atlas the font importer writes (src/assets/font.cpp, msdfgen) and ImageFlag.Msdf reads (runtime/raster.cpp, the
// GL replay's image shader). A texel's red, green and blue are three distances to the glyph's edges; their median is the distance to the
// outline, 0.5 on it, mapped over kMsdfRange atlas pixels (half inside, half outside).
namespace zn {
inline constexpr float kMsdfRange = 4;
/** The coverage of a pixel from the three channels (0..255, sampled bilinearly) and the range in screen pixels (kMsdfRange times the
 *  screen pixels a texel covers): one pixel of smooth edge at any scale. */
inline float msdfCoverage(float r, float g, float b, float screenRange) {
  const float lo = r < g ? r : g, hi = r < g ? g : r, mid = hi < b ? hi : b, m = mid > lo ? mid : lo;   // the median of the three
  const float c = (m / 255.0f - 0.5f) * screenRange + 0.5f;
  return c < 0 ? 0 : c > 1 ? 1 : c;
}
}  // namespace zn
