// The line breaking of a text node (ZN-284): a port of wrapText / wrapPara / ellipsize of lib/std/ui.ts, so a host layout engine measures text without calling
// back into the program. The width of a run comes from `TextMetric` (the baked fonts' raster::text_advance in the runtime, a fixed advance in tests).
#pragma once
#include <cstdint>
#include <string>
#include <string_view>
#include <vector>

namespace zn::host {

/** The advance of `s` in font `font` with `tracking` pixels between characters, in pixels. */
struct TextMetric {
  double (*width)(void* user, std::int32_t font, std::string_view s, double tracking) = nullptr;
  void* user = nullptr;
};

/** The fields of a UiNode that wrapping reads (the same names and encodings as lib/std/ui.ts). */
struct WrapStyle {
  std::int32_t font = 0, size = 0;
  double tracking = 0, wordSpacing = 0;
  std::int32_t whiteSpace = 0;   // ws: 0 normal, 1 nowrap, 2 pre, 3 and up: wrapped paragraphs
  std::int32_t wordBreak = 0;    // brk: 0 normal, 1 break-words, 2 break-all
  std::int32_t clamp = 0;        // line-clamp, 0: none
  bool ellipsis = false, balance = false;
};

/** `text` (already transformed: upper/lower/capitalize) broken into lines that fit `avail` pixels, and the width of each line. */
void wrapLines(const TextMetric& metric, const WrapStyle& style, std::string_view text, double avail, std::vector<std::string>& lines, std::vector<double>& widths);

}  // namespace zn::host
