// Runtime calls of the VM (zn/runtime.h): strings, arrays, Map and Set. Strings are immutable UTF-8 objects with a
// JavaScript (UTF-16) view for lengths and indices; an ASCII string is indexed by byte.
#include <algorithm>
#include <bit>
#include <cstdio>
#include <cstdlib>
#include <cstring>

#include "vm/machine.h"

namespace zn::vm {

namespace {

constexpr const char* kNull = "null reference";

inline StrObj* S(Slot s) { return reinterpret_cast<StrObj*>(s); }
inline ArrObj* A(Slot s) { return reinterpret_cast<ArrObj*>(s); }
inline MapObj* M(Slot s) { return reinterpret_cast<MapObj*>(s); }
inline Slot P(const Obj* o) { return reinterpret_cast<Slot>(o); }

std::u16string toU16(const StrObj* s) {
  std::u16string r;
  const auto* d = reinterpret_cast<const std::uint8_t*>(s->data());
  for (std::uint32_t i = 0; i < s->len;) {
    std::uint32_t c = d[i], n = c < 0x80 ? 1 : c < 0xE0 ? 2 : c < 0xF0 ? 3 : 4;
    if (c >= 0x80) c &= n == 2 ? 0x1Fu : n == 3 ? 0x0Fu : 0x07u;
    for (std::uint32_t k = 1; k < n && i + k < s->len; ++k) c = c << 6 | (d[i + k] & 0x3Fu);
    i += n;
    if (c >= 0x10000) { c -= 0x10000; r += static_cast<char16_t>(0xD800 + (c >> 10)); r += static_cast<char16_t>(0xDC00 + (c & 0x3FF)); }
    else r += static_cast<char16_t>(c);
  }
  return r;
}

std::string toUtf8(const char16_t* p, std::size_t n) {
  std::string r;
  for (std::size_t i = 0; i < n; ++i) {
    std::uint32_t c = p[i];
    if (c >= 0xD800 && c < 0xDC00 && i + 1 < n && p[i + 1] >= 0xDC00 && p[i + 1] < 0xE000) { c = 0x10000 + ((c - 0xD800) << 10) + (p[i + 1] - 0xDC00u); ++i; }
    else if (c >= 0xD800 && c < 0xE000) c = 0xFFFD;  // a lone surrogate
    if (c < 0x80) r += static_cast<char>(c);
    else if (c < 0x800) { r += static_cast<char>(0xC0 | c >> 6); r += static_cast<char>(0x80 | (c & 0x3F)); }
    else if (c < 0x10000) { r += static_cast<char>(0xE0 | c >> 12); r += static_cast<char>(0x80 | ((c >> 6) & 0x3F)); r += static_cast<char>(0x80 | (c & 0x3F)); }
    else { r += static_cast<char>(0xF0 | c >> 18); r += static_cast<char>(0x80 | ((c >> 12) & 0x3F)); r += static_cast<char>(0x80 | ((c >> 6) & 0x3F)); r += static_cast<char>(0x80 | (c & 0x3F)); }
  }
  return r;
}

// The substring covering UTF-16 units [from, to) of a string, both already clamped to [0, length].
StrObj* subStr(Machine& m, const StrObj* s, std::int64_t from, std::int64_t to) {
  if (to <= from) return m.newStr("", 0);
  if (s->ascii) return m.newStr(s->data() + from, static_cast<std::size_t>(to - from));
  std::u16string u = toU16(s);
  std::string r = toUtf8(u.data() + from, static_cast<std::size_t>(to - from));
  return m.newStr(r.data(), r.size());
}

// UTF-16 index of a byte offset.
std::int32_t u16Index(const StrObj* s, std::uint32_t byteOff) {
  if (s->ascii) return static_cast<std::int32_t>(byteOff);
  std::int32_t n = 0;
  const auto* d = reinterpret_cast<const std::uint8_t*>(s->data());
  for (std::uint32_t i = 0; i < byteOff; ++i) if ((d[i] & 0xC0) != 0x80) n += d[i] >= 0xF0 ? 2 : 1;
  return n;
}

std::int64_t findBytes(const StrObj* h, const StrObj* n, std::uint32_t from) {
  if (n->len == 0) return from <= h->len ? from : -1;
  if (n->len > h->len) return -1;
  for (std::uint32_t i = from; i + n->len <= h->len; ++i)
    if (h->data()[i] == n->data()[0] && std::memcmp(h->data() + i, n->data(), n->len) == 0) return i;
  return -1;
}

// Bytes of the JavaScript whitespace code point at p, 0 if none (like String.prototype.trim).
std::uint32_t wsAt(const std::uint8_t* p, std::uint32_t n) {
  if (!n) return 0;
  if (p[0] < 0x80) return (p[0] == ' ' || (p[0] >= 9 && p[0] <= 13)) ? 1 : 0;
  if (n >= 2 && p[0] == 0xC2 && p[1] == 0xA0) return 2;
  if (n < 3 || (p[0] & 0xF0) != 0xE0 || (p[1] & 0xC0) != 0x80 || (p[2] & 0xC0) != 0x80) return 0;
  std::uint32_t c = (p[0] & 0x0Fu) << 12 | (p[1] & 0x3Fu) << 6 | (p[2] & 0x3Fu);
  return c == 0x1680 || (c >= 0x2000 && c <= 0x200A) || c == 0x2028 || c == 0x2029 || c == 0x202F || c == 0x205F || c == 0x3000 || c == 0xFEFF ? 3 : 0;
}

inline std::int64_t clampRel(std::int64_t i, std::int64_t n) { if (i < 0) { i += n; if (i < 0) i = 0; } return i > n ? n : i; }

Slot boolSlot(bool b) { return b ? 1 : 0; }
inline std::int64_t I(Slot s) { return static_cast<std::int64_t>(s); }

// Element equality for indexOf (strict: NaN differs from itself) and includes (SameValueZero).
bool elemEq(KeyKind k, Slot a, Slot b, bool nanEqual) {
  switch (k) {
    case KeyKind::F64: { double x = std::bit_cast<double>(a), y = std::bit_cast<double>(b); return x == y || (nanEqual && x != x && y != y); }
    case KeyKind::F32: { float x = std::bit_cast<float>(static_cast<std::uint32_t>(a)), y = std::bit_cast<float>(static_cast<std::uint32_t>(b)); return x == y || (nanEqual && x != x && y != y); }
    case KeyKind::Str: { const StrObj *x = S(a), *y = S(b); return x == y || (x && y && x->len == y->len && std::memcmp(x->data(), y->data(), x->len) == 0); }
    default: return a == b;
  }
}

std::uint64_t mix(std::uint64_t x) { x ^= x >> 33; x *= 0xff51afd7ed558ccdULL; x ^= x >> 33; x *= 0xc4ceb9fe1a85ec53ULL; x ^= x >> 33; return x; }
std::uint64_t hashDouble(double d) { if (d != d) return 0x7ff8; if (d == 0) d = 0; return mix(std::bit_cast<std::uint64_t>(d)); }

// parseInt: leading whitespace, a sign, an optional 0x prefix when the radix is 0 or 16, then digits of the radix; NaN when none.
double parseIntJs(const StrObj* s, std::int64_t radix) {
  const auto* p = reinterpret_cast<const std::uint8_t*>(s->data());
  std::uint32_t i = 0, n = s->len, w;
  while (i < n && (w = wsAt(p + i, n - i))) i += w;
  bool neg = false;
  if (i < n && (p[i] == '+' || p[i] == '-')) neg = p[i++] == '-';
  if (radix != 0 && (radix < 2 || radix > 36)) return NAN;
  if ((radix == 0 || radix == 16) && i + 1 < n && p[i] == '0' && (p[i + 1] == 'x' || p[i + 1] == 'X')) { i += 2; radix = 16; }
  if (radix == 0) radix = 10;
  double v = 0;
  bool any = false;
  for (; i < n; ++i) {
    int d = p[i] >= '0' && p[i] <= '9' ? p[i] - '0' : p[i] >= 'a' && p[i] <= 'z' ? p[i] - 'a' + 10 : p[i] >= 'A' && p[i] <= 'Z' ? p[i] - 'A' + 10 : 99;
    if (d >= radix) break;
    v = v * static_cast<double>(radix) + d;
    any = true;
  }
  return any ? (neg ? -v : v) : NAN;
}

// parseFloat: the longest prefix that is a decimal literal (or Infinity) after leading whitespace.
double parseFloatJs(const StrObj* s) {
  const auto* p = reinterpret_cast<const std::uint8_t*>(s->data());
  std::uint32_t i = 0, n = s->len, w;
  while (i < n && (w = wsAt(p + i, n - i))) i += w;
  std::uint32_t st = i;
  if (i < n && (p[i] == '+' || p[i] == '-')) ++i;
  if (n - i >= 8 && std::memcmp(p + i, "Infinity", 8) == 0) return p[st] == '-' ? -INFINITY : INFINITY;
  std::uint32_t d0 = i;
  while (i < n && p[i] >= '0' && p[i] <= '9') ++i;
  bool digits = i > d0;
  if (i < n && p[i] == '.') { std::uint32_t f0 = ++i; while (i < n && p[i] >= '0' && p[i] <= '9') ++i; digits = digits || i > f0; }
  if (!digits) return NAN;
  if (i < n && (p[i] == 'e' || p[i] == 'E')) {
    std::uint32_t e = i + 1;
    if (e < n && (p[e] == '+' || p[e] == '-')) ++e;
    std::uint32_t e0 = e;
    while (e < n && p[e] >= '0' && p[e] <= '9') ++e;
    if (e > e0) i = e;
  }
  return std::strtod(std::string(reinterpret_cast<const char*>(p) + st, i - st).c_str(), nullptr);
}

// Stable merge sort; `cmp(a, b) > 0` puts b first. Fails when the comparator does.
bool mergeSort(Machine& m, std::vector<Slot>& v, const Func* cmp, Obj* fn, Slot* scratch) {
  std::size_t n = v.size();
  std::vector<Slot> tmp(n);
  for (std::size_t width = 1; width < n; width *= 2) {
    for (std::size_t lo = 0; lo < n; lo += 2 * width) {
      std::size_t mid = std::min(lo + width, n), hi = std::min(lo + 2 * width, n), i = lo, j = mid, k = lo;
      while (i < mid && j < hi) {
        double c;
        if (!m.callComparator(cmp, fn, v[i], v[j], scratch, c)) return false;
        tmp[k++] = c > 0 ? v[j++] : v[i++];
      }
      while (i < mid) tmp[k++] = v[i++];
      while (j < hi) tmp[k++] = v[j++];
    }
    v.swap(tmp);
  }
  return true;
}

// Number.prototype.toFixed for finite |v| < 1e21. printf rounds an exact tie to even where JavaScript takes the larger
// magnitude ((2.5).toFixed(0) is "3"); ties are found on the exact decimal expansion, so 1.005 keeps printf's result.
std::string toFixed(double v, int digits) {
  char b[512];
  std::snprintf(b, sizeof b, "%.*f", digits, v);
  double m = v < 0 ? -v : v, p = 1;
  for (int i = 0; i < digits && i < 22; i++) p *= 10;
  double y = m * p;  // an exact tie gives exactly k + 0.5 here
  if (digits <= 22 && y < 4503599627370496.0 && y - static_cast<double>(static_cast<long long>(y)) != 0.5) return b;
  static char ex[1100];
  int en = std::snprintf(ex, sizeof ex, "%.1074f", m);
  const char* dot = std::strchr(ex, '.');
  if (en <= 0 || en >= static_cast<int>(sizeof ex) || !dot) return b;
  const char* d = dot + 1 + digits;
  if (*d != '5') return b;
  for (const char* q = d + 1; *q; q++) if (*q != '0') return b;
  std::string r(ex, static_cast<std::size_t>(digits ? d - ex : dot - ex));  // the truncated magnitude, plus one unit in the last place
  std::size_t i = r.size();
  for (; i > 0; --i) {
    if (r[i - 1] == '.') continue;
    if (r[i - 1] != '9') { r[i - 1]++; break; }
    r[i - 1] = '0';
  }
  if (i == 0) r.insert(r.begin(), '1');  // 9.5 -> 10
  return (v < 0 ? "-" : "") + r;
}

}  // namespace

std::uint64_t Table::hash(Slot k) const {
  switch (kk) {
    case KeyKind::F64: return hashDouble(std::bit_cast<double>(k));
    case KeyKind::F32: return hashDouble(static_cast<double>(std::bit_cast<float>(static_cast<std::uint32_t>(k))));
    case KeyKind::Str: {
      const StrObj* s = S(k);
      std::uint64_t h = 1469598103934665603ULL;
      for (std::uint32_t i = 0; i < s->len; ++i) h = (h ^ static_cast<std::uint8_t>(s->data()[i])) * 1099511628211ULL;
      return mix(h);
    }
    default: return mix(k);
  }
}
bool Table::same(Slot a, Slot b) const { return elemEq(kk, a, b, true); }

std::int32_t Table::find(Slot k) const {
  if (index.empty()) return -1;
  std::size_t mask = index.size() - 1, h = hash(k) & mask;
  for (;; h = (h + 1) & mask) {
    std::int32_t e = index[h];
    if (e < 0) return -1;
    if (!dead[static_cast<std::size_t>(e)] && same(keys[static_cast<std::size_t>(e)], k)) return e;
  }
}

void Table::rehash() {
  std::size_t w = 0;
  for (std::size_t i = 0; i < keys.size(); ++i) {
    if (dead[i]) continue;
    keys[w] = keys[i];
    if (hasVals) vals[w] = vals[i];
    ++w;
  }
  keys.resize(w);
  if (hasVals) vals.resize(w);
  dead.assign(w, 0);
  std::size_t size = 16;
  while (size < (w + 1) * 4) size *= 2;
  index.assign(size, -1);
  for (std::size_t e = 0; e < w; ++e) {
    std::size_t h = hash(keys[e]) & (size - 1);
    while (index[h] >= 0) h = (h + 1) & (size - 1);
    index[h] = static_cast<std::int32_t>(e);
  }
}

void Table::put(Slot k, Slot v) {
  std::int32_t e = find(k);
  if (e >= 0) { if (hasVals) vals[static_cast<std::size_t>(e)] = v; return; }
  if ((keys.size() + 1) * 2 > index.size()) rehash();
  std::size_t h = hash(k) & (index.size() - 1);
  while (index[h] >= 0) h = (h + 1) & (index.size() - 1);
  index[h] = static_cast<std::int32_t>(keys.size());
  keys.push_back(k);
  if (hasVals) vals.push_back(v);
  dead.push_back(0);
  ++live;
}

bool Table::erase(Slot k) {
  std::int32_t e = find(k);
  if (e < 0) return false;
  dead[static_cast<std::size_t>(e)] = 1;
  --live;
  return true;
}

void Table::clear() { keys.clear(); vals.clear(); dead.clear(); index.clear(); live = 0; }

const char* rtCall(Machine& m, Rt id, Slot* a, Slot* scratch) {
#define NN(x) do { if (!(x)) return kNull; } while (0)
  switch (id) {
    // ---- internal string operations
    case Rt::StrConcat: {
      StrObj *x = S(a[0]), *y = S(a[1]);
      NN(x && y);
      if (static_cast<std::uint64_t>(x->len) + y->len > 0x7fffffffu) return "RangeError: Invalid string length";
      std::string r(x->data(), x->len);
      r.append(y->data(), y->len);
      a[0] = P(m.newStr(r.data(), r.size()));
      return nullptr;
    }
    case Rt::StrEq: { StrObj *x = S(a[0]), *y = S(a[1]); NN(x && y); a[0] = boolSlot(x == y || (x->len == y->len && std::memcmp(x->data(), y->data(), x->len) == 0)); return nullptr; }
    case Rt::StrLt: case Rt::StrLe: {
      StrObj *x = S(a[0]), *y = S(a[1]);
      NN(x && y);
      std::uint32_t n = std::min(x->len, y->len);
      int c = std::memcmp(x->data(), y->data(), n);
      if (c == 0) c = x->len < y->len ? -1 : x->len > y->len ? 1 : 0;
      a[0] = boolSlot(id == Rt::StrLt ? c < 0 : c <= 0);
      return nullptr;
    }
    case Rt::NumToStrI: case Rt::NumToStrU: {
      char buf[24];
      int n = id == Rt::NumToStrI ? std::snprintf(buf, sizeof buf, "%lld", static_cast<long long>(I(a[0]))) : std::snprintf(buf, sizeof buf, "%llu", static_cast<unsigned long long>(a[0]));
      a[0] = P(m.newStr(buf, static_cast<std::size_t>(n)));
      return nullptr;
    }
    case Rt::NumToStrD: { std::string s = numberToString(std::bit_cast<double>(a[0])); a[0] = P(m.newStr(s.data(), s.size())); return nullptr; }
    case Rt::NumToFixed: {
      double v = std::bit_cast<double>(a[0]);
      std::int64_t digits = I(a[1]);
      if (digits < 0 || digits > 100) return "RangeError: toFixed() digits argument must be between 0 and 100";
      std::string s = !(v > -1e21 && v < 1e21) ? numberToString(v) : toFixed(v == 0 ? 0.0 : v, static_cast<int>(digits));  // (-0).toFixed(1) is "0.0"
      a[0] = P(m.newStr(s.data(), s.size()));
      return nullptr;
    }
    case Rt::BoolToStr: a[0] = P(a[0] ? m.newStr("true", 4) : m.newStr("false", 5)); return nullptr;

    // ---- strings
    case Rt::StrLength: NN(a[0]); a[0] = S(a[0])->u16len; return nullptr;
    case Rt::StrCharCodeAt: {
      StrObj* s = S(a[0]);
      NN(s);
      std::int64_t i = I(a[1]);
      if (i < 0 || i >= s->u16len) { a[0] = 0; return nullptr; }  // JavaScript gives NaN; i32 has none
      a[0] = s->ascii ? static_cast<std::uint8_t>(s->data()[i]) : static_cast<Slot>(toU16(s)[static_cast<std::size_t>(i)]);
      return nullptr;
    }
    case Rt::StrSlice: case Rt::StrSubstring: {
      StrObj* s = S(a[0]);
      NN(s);
      std::int64_t n = s->u16len, from, to;
      if (id == Rt::StrSlice) { from = clampRel(I(a[1]), n); to = clampRel(I(a[2]), n); }
      else { from = std::clamp<std::int64_t>(I(a[1]), 0, n); to = std::clamp<std::int64_t>(I(a[2]), 0, n); if (from > to) std::swap(from, to); }
      a[0] = P(subStr(m, s, from, to));
      return nullptr;
    }
    case Rt::StrCharAt: {
      StrObj* s = S(a[0]);
      NN(s);
      std::int64_t i = I(a[1]);
      a[0] = P(i < 0 || i >= s->u16len ? m.newStr("", 0) : subStr(m, s, i, i + 1));
      return nullptr;
    }
    case Rt::StrToUpperCase: case Rt::StrToLowerCase: {  // ASCII letters only
      StrObj* s = S(a[0]);
      NN(s);
      std::string r(s->data(), s->len);
      for (char& c : r) {
        if (id == Rt::StrToUpperCase) { if (c >= 'a' && c <= 'z') c = static_cast<char>(c - 32); }
        else if (c >= 'A' && c <= 'Z') c = static_cast<char>(c + 32);
      }
      a[0] = P(m.newStr(r.data(), r.size()));
      return nullptr;
    }
    case Rt::StrSplit: {
      StrObj *s = S(a[0]), *sep = S(a[1]);
      NN(s && sep);
      ArrObj* r = m.newArr(m.strArray);
      if (sep->len == 0) {
        std::int64_t n = s->u16len;
        for (std::int64_t i = 0; i < n; ++i) r->v.push_back(P(subStr(m, s, i, i + 1)));
      } else {
        std::uint32_t b = 0;
        for (;;) {
          std::int64_t k = findBytes(s, sep, b);
          if (k < 0) { r->v.push_back(P(m.newStr(s->data() + b, s->len - b))); break; }
          r->v.push_back(P(m.newStr(s->data() + b, static_cast<std::size_t>(k) - b)));
          b = static_cast<std::uint32_t>(k) + sep->len;
        }
      }
      a[0] = P(r);
      return nullptr;
    }
    case Rt::StrIndexOf: {
      StrObj *s = S(a[0]), *n = S(a[1]);
      NN(s && n);
      std::int64_t k = findBytes(s, n, 0);
      a[0] = static_cast<Slot>(k < 0 ? -1 : u16Index(s, static_cast<std::uint32_t>(k)));
      return nullptr;
    }
    case Rt::StrIncludes: { StrObj *s = S(a[0]), *n = S(a[1]); NN(s && n); a[0] = boolSlot(findBytes(s, n, 0) >= 0); return nullptr; }
    case Rt::StrStartsWith: { StrObj *s = S(a[0]), *n = S(a[1]); NN(s && n); a[0] = boolSlot(n->len <= s->len && std::memcmp(s->data(), n->data(), n->len) == 0); return nullptr; }
    case Rt::StrEndsWith: { StrObj *s = S(a[0]), *n = S(a[1]); NN(s && n); a[0] = boolSlot(n->len <= s->len && std::memcmp(s->data() + s->len - n->len, n->data(), n->len) == 0); return nullptr; }
    case Rt::StrTrim: {
      StrObj* s = S(a[0]);
      NN(s);
      const auto* p = reinterpret_cast<const std::uint8_t*>(s->data());
      std::uint32_t lo = 0, hi = s->len, w;
      while (lo < hi && (w = wsAt(p + lo, hi - lo))) lo += w;
      for (bool more = true; more && hi > lo;) {  // a whitespace code point ends at hi: try each possible start
        more = false;
        for (std::uint32_t len = 1; len <= 3 && len <= hi - lo; ++len)
          if (wsAt(p + hi - len, len) == len) { hi -= len; more = true; break; }
      }
      a[0] = P(m.newStr(s->data() + lo, hi - lo));
      return nullptr;
    }
    case Rt::StrRepeat: {
      StrObj* s = S(a[0]);
      NN(s);
      std::int64_t n = I(a[1]);
      if (n < 0) return "RangeError: Invalid count value";
      if (n > 0 && static_cast<std::uint64_t>(s->len) * static_cast<std::uint64_t>(n) > 0x7fffffffu) return "RangeError: Invalid string length";
      std::string r;
      for (std::int64_t i = 0; i < n; ++i) r.append(s->data(), s->len);
      a[0] = P(m.newStr(r.data(), r.size()));
      return nullptr;
    }

    case Rt::StrPadStart: case Rt::StrPadEnd: {
      StrObj *s = S(a[0]), *fill = S(a[2]);
      NN(s && fill);
      std::int64_t target = I(a[1]), len = s->u16len;
      if (target <= len || fill->len == 0) return nullptr;  // a[0] is already the result
      if (target > 0x7fffffff) return "RangeError: Invalid string length";
      std::u16string pad, f = toU16(fill);
      while (static_cast<std::int64_t>(pad.size()) < target - len) pad += f;
      pad.resize(static_cast<std::size_t>(target - len));
      std::string padUtf8 = toUtf8(pad.data(), pad.size());
      std::string r = id == Rt::StrPadStart ? padUtf8 + std::string(s->data(), s->len) : std::string(s->data(), s->len) + padUtf8;
      a[0] = P(m.newStr(r.data(), r.size()));
      return nullptr;
    }
    case Rt::StrReplace: case Rt::StrReplaceAll: {
      StrObj *s = S(a[0]), *pat = S(a[1]), *rep = S(a[2]);
      NN(s && pat && rep);
      std::string r;
      std::uint32_t from = 0;
      bool all = id == Rt::StrReplaceAll;
      if (pat->len == 0) {  // between every character (replaceAll) or at the start (replace)
        const auto* d = reinterpret_cast<const std::uint8_t*>(s->data());
        for (std::uint32_t i = 0; i <= s->len;) {
          r.append(rep->data(), rep->len);
          if (!all) { r.append(s->data(), s->len); break; }
          if (i == s->len) break;
          std::uint32_t k = i + 1;
          while (k < s->len && (d[k] & 0xC0) == 0x80) ++k;
          r.append(s->data() + i, k - i);
          i = k;
        }
      } else {
        for (;;) {
          std::int64_t k = findBytes(s, pat, from);
          if (k < 0) break;
          r.append(s->data() + from, static_cast<std::size_t>(k) - from);
          r.append(rep->data(), rep->len);
          from = static_cast<std::uint32_t>(k) + pat->len;
          if (!all) break;
        }
        r.append(s->data() + from, s->len - from);
      }
      if (r.size() > 0x7fffffffu) return "RangeError: Invalid string length";
      a[0] = P(m.newStr(r.data(), r.size()));
      return nullptr;
    }
    case Rt::ParseInt: { StrObj* s = S(a[0]); NN(s); a[0] = std::bit_cast<Slot>(parseIntJs(s, I(a[1]))); return nullptr; }
    case Rt::ParseFloat: { StrObj* s = S(a[0]); NN(s); a[0] = std::bit_cast<Slot>(parseFloatJs(s)); return nullptr; }
    case Rt::FromCharCode: {
      char16_t u = static_cast<char16_t>(a[0] & 0xFFFF);
      std::string r = toUtf8(&u, 1);
      a[0] = P(m.newStr(r.data(), r.size()));
      return nullptr;
    }

    // ---- arrays
    case Rt::ArrJoin: {
      ArrObj* o = A(a[0]);
      StrObj* sep = S(a[1]);
      NN(o && sep);
      std::string r;
      for (std::size_t i = 0; i < o->v.size(); ++i) {
        StrObj* e = S(o->v[i]);
        NN(e);
        if (i) r.append(sep->data(), sep->len);
        r.append(e->data(), e->len);
      }
      if (r.size() > 0x7fffffffu) return "RangeError: Invalid string length";
      a[0] = P(m.newStr(r.data(), r.size()));
      return nullptr;
    }
    case Rt::ArrSort: {
      ArrObj* o = A(a[0]);
      NN(o && a[1]);
      auto* fn = reinterpret_cast<Obj*>(a[1]);
      const Func* cmp = m.findComparator(fn, m.mod->classes[o->cls->id].elem);
      if (!cmp) return "not a comparator";
      if (!mergeSort(m, o->v, cmp, fn, scratch)) return m.error.c_str();
      return nullptr;
    }
    case Rt::ArrSlice: {
      ArrObj* o = A(a[0]);
      NN(o);
      std::int64_t n = static_cast<std::int64_t>(o->v.size()), from = clampRel(I(a[1]), n), to = clampRel(I(a[2]), n);
      ArrObj* r = m.newArr(o->cls);
      if (to > from) r->v.assign(o->v.begin() + from, o->v.begin() + to);
      a[0] = P(r);
      return nullptr;
    }
    case Rt::ArrReverse: { ArrObj* o = A(a[0]); NN(o); std::reverse(o->v.begin(), o->v.end()); return nullptr; }
    case Rt::ArrIndexOf: case Rt::ArrIncludes: {
      ArrObj* o = A(a[0]);
      NN(o);
      KeyKind k = o->cls->elemKind;
      if (k == KeyKind::Str) NN(a[1]);
      std::int64_t at = -1;
      for (std::size_t i = 0; i < o->v.size() && at < 0; ++i) if (elemEq(k, o->v[i], a[1], id == Rt::ArrIncludes)) at = static_cast<std::int64_t>(i);
      a[0] = id == Rt::ArrIndexOf ? static_cast<Slot>(at) : boolSlot(at >= 0);
      return nullptr;
    }
    case Rt::ArrPop: {
      ArrObj* o = A(a[0]);
      NN(o);
      if (o->v.empty()) a[0] = 0;  // like the native runtime: the element type's default
      else { a[0] = o->v.back(); o->v.pop_back(); }
      return nullptr;
    }

    // ---- Map and Set
    case Rt::MapGet: { MapObj* o = M(a[0]); NN(o); if (o->cls->keyKind == KeyKind::Str) NN(a[1]); std::int32_t e = o->t.find(a[1]); a[0] = e < 0 ? 0 : o->t.vals[static_cast<std::size_t>(e)]; return nullptr; }
    case Rt::MapSet: { MapObj* o = M(a[0]); NN(o); if (o->cls->keyKind == KeyKind::Str) NN(a[1]); o->t.put(a[1], a[2]); return nullptr; }
    case Rt::SetAdd: { MapObj* o = M(a[0]); NN(o); if (o->cls->keyKind == KeyKind::Str) NN(a[1]); o->t.put(a[1], 0); return nullptr; }
    case Rt::MapHas: case Rt::SetHas: { MapObj* o = M(a[0]); NN(o); if (o->cls->keyKind == KeyKind::Str) NN(a[1]); a[0] = boolSlot(o->t.find(a[1]) >= 0); return nullptr; }
    case Rt::MapDelete: case Rt::SetDelete: { MapObj* o = M(a[0]); NN(o); if (o->cls->keyKind == KeyKind::Str) NN(a[1]); a[0] = boolSlot(o->t.erase(a[1])); return nullptr; }
    case Rt::MapClear: case Rt::SetClear: { MapObj* o = M(a[0]); NN(o); o->t.clear(); return nullptr; }
    case Rt::MapSize: case Rt::SetSize: { MapObj* o = M(a[0]); NN(o); a[0] = o->t.live; return nullptr; }
    case Rt::MapKeys: case Rt::MapValues: case Rt::SetValues: {
      MapObj* o = M(a[0]);
      NN(o);
      const Table& t = o->t;
      ArrObj* r = m.newArr(id == Rt::MapKeys ? o->cls->keysArray : o->cls->valuesArray);
      r->v.reserve(t.live);
      for (std::size_t i = 0; i < t.keys.size(); ++i) if (!t.dead[i]) r->v.push_back(id == Rt::MapValues ? t.vals[i] : t.keys[i]);
      a[0] = P(r);
      return nullptr;
    }
    case Rt::Count: break;
  }
#undef NN
  return "unknown runtime call";
}

}  // namespace zn::vm
