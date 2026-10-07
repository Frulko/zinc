#include "unicode.h"

#include <cstdint>
#include <cstdlib>
#include <vector>

extern "C" {
#include "libunicode.h"
}

namespace zn::uni {
namespace {

void* reallocFn(void*, void* p, size_t n) { if (n == 0) { std::free(p); return nullptr; } return std::realloc(p, n); }

std::vector<uint32_t> cps(const std::u16string& s) {
  std::vector<uint32_t> r;
  r.reserve(s.size());
  for (size_t i = 0; i < s.size(); ++i) {
    uint32_t c = s[i];
    if (c >= 0xD800 && c < 0xDC00 && i + 1 < s.size() && s[i + 1] >= 0xDC00 && s[i + 1] < 0xE000) { c = 0x10000 + ((c - 0xD800) << 10) + (s[i + 1] - 0xDC00u); ++i; }
    r.push_back(c);
  }
  return r;
}
void put(std::u16string& out, uint32_t c) {
  if (c >= 0x10000) { c -= 0x10000; out += static_cast<char16_t>(0xD800 + (c >> 10)); out += static_cast<char16_t>(0xDC00 + (c & 0x3FF)); }
  else out += static_cast<char16_t>(c);
}

// Whether the code point before / after position i (skipping case-ignorable ones) is a cased letter: the context of the final sigma.
bool casedBefore(const std::vector<uint32_t>& v, size_t i) {
  while (i > 0) { uint32_t c = v[--i]; if (lre_is_case_ignorable(c)) continue; return lre_is_cased(c); }
  return false;
}
bool casedAfter(const std::vector<uint32_t>& v, size_t i) {
  for (++i; i < v.size(); ++i) { if (lre_is_case_ignorable(v[i])) continue; return lre_is_cased(v[i]); }
  return false;
}

std::u16string convert(const std::u16string& s, bool toUpper) {
  std::vector<uint32_t> v = cps(s);
  std::u16string out;
  out.reserve(s.size());
  for (size_t i = 0; i < v.size(); ++i) {
    uint32_t c = v[i];
    if (!toUpper && c == 0x3A3) { put(out, casedBefore(v, i) && !casedAfter(v, i) ? 0x3C2 : 0x3C3); continue; }   // Σ: final sigma
    uint32_t res[LRE_CC_RES_LEN_MAX];
    int n = lre_case_conv(res, c, toUpper ? 0 : 1);
    for (int k = 0; k < n; ++k) put(out, res[k]);
  }
  return out;
}

bool isMark(uint32_t c) {   // Mn, Mc and Me
  static CharRange cr = [] {
    CharRange r;
    cr_init(&r, nullptr, reallocFn);
    CharRange t;
    for (const char* gc : {"Mn", "Mc", "Me"}) {
      cr_init(&t, nullptr, reallocFn);
      unicode_general_category(&t, gc);
      CharRange u;
      cr_init(&u, nullptr, reallocFn);
      cr_op(&u, r.points, r.len, t.points, t.len, CR_OP_UNION);
      cr_free(&r); cr_free(&t);
      r = u;
    }
    return r;
  }();
  int lo = 0, hi = cr.len / 2 - 1;
  while (lo <= hi) {
    int mid = (lo + hi) / 2;
    if (c < cr.points[2 * mid]) hi = mid - 1;
    else if (c >= cr.points[2 * mid + 1]) lo = mid + 1;
    else return true;
  }
  return false;
}

// The primary weight of a base character: CLDR root order for ASCII (whitespace, `_ - , ; : ! ? . ' " ( ) [ ] { } @ * / \ & # % ` ^ + < = > | ~ $`, digits, letters),
// then the rest by code point after the Latin letters. 0 means ignorable.
uint32_t primary(uint32_t c) {
  static const char kOrder[] = " _-,;:!?.'\"()[]{}@*/\\&#%`^+<=>|~$0123456789";
  if (c < 0x20 || (c >= 0x7F && c < 0xA0)) return 0;
  if (c >= 'a' && c <= 'z') return 100 + (c - 'a');
  for (size_t i = 0; kOrder[i]; ++i) if (static_cast<uint32_t>(kOrder[i]) == c) return 1 + static_cast<uint32_t>(i);
  if (c < 0x80) return 60 + c;   // not listed (cannot happen for printable ASCII): after the symbols
  return 1000 + c;
}

struct Key { std::vector<uint32_t> p; std::vector<std::vector<uint32_t>> marks; std::vector<uint8_t> upper; };

// The order of the common combining marks at the secondary level (what ICU's root collation gives: breathings, acute, grave, breve, circumflex, caron, ring, diaeresis, ...).
uint32_t markRank(uint32_t m) {
  static const uint32_t kOrder[] = {0x313, 0x314, 0x301, 0x300, 0x306, 0x302, 0x30c, 0x30a, 0x308, 0x30b, 0x303, 0x307, 0x338, 0x327, 0x328, 0x304, 0x30d, 0x30e, 0x312, 0x315, 0x335,
                                    0x309, 0x30f, 0x310, 0x311, 0x31b, 0x323, 0x324, 0x325, 0x326, 0x32d, 0x32e, 0x330, 0x331};
  for (uint32_t i = 0; i < sizeof kOrder / sizeof kOrder[0]; ++i) if (kOrder[i] == m) return i;
  return 100 + m;
}

Key keyOf(const std::u16string& s) {
  std::u16string d = normalize(s, 1);
  std::vector<uint32_t> v = cps(d);
  Key k;
  for (uint32_t c : v) {
    if (isMark(c)) { if (!k.marks.empty()) k.marks.back().push_back(markRank(c)); continue; }
    uint32_t res[LRE_CC_RES_LEN_MAX];
    int n = lre_case_conv(res, c, 1);   // the lowercase base
    bool up = n == 1 ? res[0] != c : false;
    uint32_t base = n >= 1 ? res[0] : c;
    // letters that decompose to nothing but sort as a base letter with a difference: expansions (ß ss, æ ae, œ oe: equal at the primary level, after at the tertiary one) and
    // stroked letters (the base letter with a secondary difference)
    uint32_t first = 0, second = 0, stroke = 0;
    switch (base) {
      case 0xDF: first = 's'; second = 's'; break;
      case 0xE6: first = 'a'; second = 'e'; break;
      case 0x153: first = 'o'; second = 'e'; break;
      case 0xF8: first = 'o'; stroke = 0x338; break;
      case 0x111: first = 'd'; stroke = 0x335; break;
      case 0x142: first = 'l'; stroke = 0x335; break;
      case 0x127: first = 'h'; stroke = 0x335; break;
      default: break;
    }
    if (first) {
      k.p.push_back(primary(first)); k.marks.emplace_back(); k.upper.push_back(second ? 2 : up ? 1 : 0);
      if (stroke) k.marks.back().push_back(markRank(stroke));
      if (second) { k.p.push_back(primary(second)); k.marks.emplace_back(); k.upper.push_back(0); }
      continue;
    }
    uint32_t w = primary(base);
    if (w == 0) continue;
    k.p.push_back(w); k.marks.emplace_back(); k.upper.push_back(up ? 1 : 0);
  }
  return k;
}

template <class T> int cmp(const std::vector<T>& a, const std::vector<T>& b) {
  size_t n = a.size() < b.size() ? a.size() : b.size();
  for (size_t i = 0; i < n; ++i) if (a[i] != b[i]) return a[i] < b[i] ? -1 : 1;
  return a.size() == b.size() ? 0 : a.size() < b.size() ? -1 : 1;
}

}  // namespace

std::u16string upper(const std::u16string& s) { return convert(s, true); }
std::u16string lower(const std::u16string& s) { return convert(s, false); }

std::u16string normalize(const std::u16string& s, int form) {
  std::vector<uint32_t> v = cps(s);
  uint32_t* dst = nullptr;
  int n = unicode_normalize(&dst, v.data(), static_cast<int>(v.size()), static_cast<UnicodeNormalizationEnum>(form), nullptr, reallocFn);
  std::u16string out;
  if (n < 0) return s;
  for (int i = 0; i < n; ++i) put(out, dst[i]);
  std::free(dst);
  return out;
}

int collate(const std::u16string& a, const std::u16string& b) {
  Key x = keyOf(a), y = keyOf(b);
  if (int r = cmp(x.p, y.p)) return r;
  size_t n = x.marks.size();
  for (size_t i = 0; i < n; ++i) if (int r = cmp(x.marks[i], y.marks[i])) return r;   // accents, in order
  return cmp(x.upper, y.upper);   // lowercase first
}

}  // namespace zn::uni
