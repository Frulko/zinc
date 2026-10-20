#include "text/segment.h"
#include <mutex>
#include "graphemebreak.h"
#include "linebreak.h"
#include "wordbreak.h"

namespace zn::text {
namespace {

void init() {
  static std::once_flag once;
  std::call_once(once, [] { init_linebreak(); init_wordbreak(); init_graphemebreak(); });
}

// brk[i] says what lies after character i; a character spans several units (UTF-8 continuation, low surrogate) whose entries are INSIDEACHAR.
template <class Char>
std::vector<uint32_t> run(const Char* s, size_t n, Seg kind, const char* lang) {
  std::vector<uint32_t> out;
  if (n == 0) return out;
  init();
  std::vector<char> b(n);
  auto set = [&] {
    if constexpr (sizeof(Char) == 1) {
      auto p = reinterpret_cast<const utf8_t*>(s);
      if (kind == Seg::Grapheme) set_graphemebreaks_utf8(p, n, lang, b.data());
      else if (kind == Seg::Word) set_wordbreaks_utf8(p, n, lang, b.data());
      else set_linebreaks_utf8(p, n, lang, b.data());
    } else {
      auto p = reinterpret_cast<const utf16_t*>(s);
      if (kind == Seg::Grapheme) set_graphemebreaks_utf16(p, n, lang, b.data());
      else if (kind == Seg::Word) set_wordbreaks_utf16(p, n, lang, b.data());
      else set_linebreaks_utf16(p, n, lang, b.data());
    }
  };
  set();
  for (size_t i = 0; i + 1 < n; ++i) {   // NOBREAK and INSIDEACHAR do not end a segment
    if (kind == Seg::Line ? (b[i] == LINEBREAK_ALLOWBREAK || b[i] == LINEBREAK_MUSTBREAK) : b[i] == GRAPHEMEBREAK_BREAK) out.push_back(uint32_t(i + 1));
  }
  out.push_back(uint32_t(n));
  return out;
}

}  // namespace

std::vector<uint32_t> boundaries(std::string_view s, Seg k, const char* lang) { return run(s.data(), s.size(), k, lang ? lang : ""); }
std::vector<uint32_t> boundaries(std::u16string_view s, Seg k, const char* lang) { return run(s.data(), s.size(), k, lang ? lang : ""); }

uint32_t nextGrapheme(std::string_view s, uint32_t at) {
  if (at >= s.size()) return uint32_t(s.size());
  for (uint32_t b : boundaries(s, Seg::Grapheme)) if (b > at) return b;
  return uint32_t(s.size());
}

uint32_t prevGrapheme(std::string_view s, uint32_t at) {
  uint32_t prev = 0;
  for (uint32_t b : boundaries(s, Seg::Grapheme)) { if (b >= at) break; prev = b; }
  return prev;
}

}  // namespace zn::text
