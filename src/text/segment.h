#pragma once
// Grapheme, word and line segmentation (ZN-165): libunibreak's UAX #29 and UAX #14 rules over UTF-8 or UTF-16 text.
// Each function returns the boundaries after the first character, in code units of the input, ending with the length: the segments are [0,b0), [b0,b1)...
#include <cstddef>
#include <cstdint>
#include <string_view>
#include <vector>

namespace zn::text {

enum class Seg { Grapheme, Word, Line };

std::vector<uint32_t> boundaries(std::string_view utf8, Seg kind, const char* lang = "");              // byte offsets
std::vector<uint32_t> boundaries(std::u16string_view utf16, Seg kind, const char* lang = "");          // UTF-16 unit offsets
// The next / previous cursor position (a grapheme boundary) after / before byte offset `at` of `utf8`; clamps to [0, size].
uint32_t nextGrapheme(std::string_view utf8, uint32_t at);
uint32_t prevGrapheme(std::string_view utf8, uint32_t at);

}  // namespace zn::text
