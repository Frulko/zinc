#pragma once
#include <cctype>
#include <cstdint>
#include <string>
#include <string_view>

namespace zn {

inline void appendUtf8(std::string& o, std::uint32_t c) {
  if (c < 0x80) o += static_cast<char>(c);
  else if (c < 0x800) { o += static_cast<char>(0xC0 | c >> 6); o += static_cast<char>(0x80 | (c & 0x3F)); }
  else if (c < 0x10000) { o += static_cast<char>(0xE0 | c >> 12); o += static_cast<char>(0x80 | ((c >> 6) & 0x3F)); o += static_cast<char>(0x80 | (c & 0x3F)); }
  else { o += static_cast<char>(0xF0 | c >> 18); o += static_cast<char>(0x80 | ((c >> 12) & 0x3F)); o += static_cast<char>(0x80 | ((c >> 6) & 0x3F)); o += static_cast<char>(0x80 | (c & 0x3F)); }
}

// The text of a string literal body: escapes resolved, \xNN and \uNNNN (with surrogate pairs) and \u{...} as UTF-8.
inline std::string stringLiteralBody(std::string_view s) {
  std::string o;
  auto hex = [&](std::size_t from, std::size_t n, std::uint32_t& v) {
    if (from + n > s.size()) return false;
    v = 0;
    for (std::size_t k = 0; k < n; ++k) { char h = s[from + k]; if (!std::isxdigit(static_cast<unsigned char>(h))) return false; v = v * 16 + static_cast<std::uint32_t>(h <= '9' ? h - '0' : (h | 32) - 'a' + 10); }
    return true;
  };
  for (std::size_t i = 0; i < s.size(); ++i) {
    if (s[i] != '\\' || i + 1 >= s.size()) { o += s[i]; continue; }
    char c = s[++i];
    std::uint32_t v;
    switch (c) {
      case 'n': o += '\n'; break;
      case 'r': o += '\r'; break;
      case 't': o += '\t'; break;
      case '0': o += '\0'; break;
      case 'b': o += '\b'; break;
      case 'f': o += '\f'; break;
      case 'v': o += '\v'; break;
      case '\n': break;  // line continuation
      case 'x': if (hex(i + 1, 2, v)) { appendUtf8(o, v); i += 2; } else o += c; break;
      case 'u':
        if (i + 1 < s.size() && s[i + 1] == '{') {
          std::size_t e = s.find('}', i);
          if (e != std::string_view::npos && hex(i + 2, e - i - 2, v)) { appendUtf8(o, v); i = e; break; }
        } else if (hex(i + 1, 4, v)) {
          i += 4;
          std::uint32_t lo;
          if (v >= 0xD800 && v < 0xDC00 && i + 2 < s.size() && s[i + 1] == '\\' && s[i + 2] == 'u' && hex(i + 3, 4, lo) && lo >= 0xDC00 && lo < 0xE000) { v = 0x10000 + ((v - 0xD800) << 10) + (lo - 0xDC00); i += 6; }
          appendUtf8(o, v >= 0xD800 && v < 0xE000 ? 0xFFFD : v);
          break;
        }
        o += c;
        break;
      default: o += c; break;
    }
  }
  return o;
}

}  // namespace zn
