// Runtime calls of the VM (zn/runtime.h): strings, arrays, Map and Set. Strings are immutable UTF-8 objects with a
// JavaScript (UTF-16) view for lengths and indices; an ASCII string is indexed by byte.
#ifndef __wasi__
#include <thread>
#endif
#include <chrono>
#include <algorithm>
#include <unordered_map>
#include <bit>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <deque>

#include "rt/rt.h"
#include "rt/unicode.h"
#include "zn/host.h"
#include "zn/native.h"
#include "zn/native_sig.h"

namespace zn::host { HostCall hostGfx = nullptr; HostCall hostSys = nullptr; HostCall hostLayout = nullptr; HostFast hostFast[kHostFastRows] = {}; }
static_assert(static_cast<int>(zn::Rt::Count) <= zn::host::kHostFastRows);

namespace zn::rt {

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


// JSON text of a Dyn value, appended to `out`. False for what the native walker does not know (a typed object seen as a Dyn, a very deep tree).
void jsonQuote(std::string& out, const StrObj* s) {
  out += '"';
  const char* d = s->data();
  std::uint32_t start = 0;
  for (std::uint32_t i = 0; i < s->len; ++i) {
    unsigned char c = static_cast<unsigned char>(d[i]);
    if (c >= 32 && c != '"' && c != '\\') continue;
    out.append(d + start, i - start);
    start = i + 1;
    switch (c) {
      case '"': out += "\\\""; break;
      case '\\': out += "\\\\"; break;
      case '\n': out += "\\n"; break;
      case '\r': out += "\\r"; break;
      case '\t': out += "\\t"; break;
      case '\b': out += "\\b"; break;
      case '\f': out += "\\f"; break;
      default: { char b[8]; std::snprintf(b, sizeof b, "\\u%04x", c); out += b; }
    }
  }
  out.append(d + start, s->len - start);
  out += '"';
}
bool jsonOut(Machine& m, Obj* o, std::string& out, int depth) {
  if (depth > 1000) return false;
  const ClassRT* c = o->cls;
  if (c == m.dynNum) { double v = std::bit_cast<double>(o->fields()[0]); out += v - v == 0 ? numberToString(v) : "null"; return true; }
  if (c == m.dynStr) { jsonQuote(out, reinterpret_cast<const StrObj*>(o->fields()[0])); return true; }
  if (c == m.dynBool) { out += o->fields()[0] ? "true" : "false"; return true; }
  if (c == m.dynNull || c == m.dynUndef) { out += "null"; return true; }
  if (c == m.dynArr) {
    const auto* arr = reinterpret_cast<const ArrObj*>(o->fields()[0]);
    out += '[';
    for (std::size_t i = 0; i < arr->v.size(); ++i) {
      if (i) out += ',';
      if (!jsonOut(m, reinterpret_cast<Obj*>(arr->v[i]), out, depth + 1)) return false;
    }
    out += ']';
    return true;
  }
  if (c == m.dynObj) {
    const auto* mo = reinterpret_cast<const MapObj*>(o->fields()[0]);
    out += '{';
    bool first = true;
    for (std::size_t i = 0; i < mo->t.keys.size(); ++i) {
      if (mo->t.dead[i]) continue;
      Obj* v = reinterpret_cast<Obj*>(mo->t.vals[i]);
      if (v->cls == m.dynUndef) continue;
      if (!first) out += ',';
      first = false;
      jsonQuote(out, reinterpret_cast<const StrObj*>(mo->t.keys[i]));
      out += ':';
      if (!jsonOut(m, v, out, depth + 1)) return false;
    }
    out += '}';
    return true;
  }
  return false;
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

// Byte offset of UTF-16 index u (already clamped to [0, length]).
std::uint32_t byteOf(const StrObj* s, std::int64_t u) {
  if (s->ascii) return static_cast<std::uint32_t>(u);
  const auto* d = reinterpret_cast<const std::uint8_t*>(s->data());
  std::int64_t n = 0;
  std::uint32_t i = 0;
  while (i < s->len && n < u) { n += d[i] >= 0xF0 ? 2 : 1; ++i; while (i < s->len && (d[i] & 0xC0) == 0x80) ++i; }
  return i;
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

// Number(string): the whole string, trimmed, is a decimal literal, Infinity, or a 0x / 0o / 0b integer; "" is 0; else NaN.
double toNumberJs(const StrObj* s) {
  const auto* p = reinterpret_cast<const std::uint8_t*>(s->data());
  std::uint32_t lo = 0, hi = s->len, w;
  while (lo < hi && (w = wsAt(p + lo, hi - lo))) lo += w;
  for (bool more = true; more && hi > lo;) {
    more = false;
    for (std::uint32_t len = 1; len <= 3 && len <= hi - lo; ++len)
      if (wsAt(p + hi - len, len) == len) { hi -= len; more = true; break; }
  }
  if (lo == hi) return 0;
  std::string t(reinterpret_cast<const char*>(p) + lo, hi - lo);
  std::size_t i = 0;
  if (t.size() > 2 && t[0] == '0' && std::strchr("xXoObB", t[1])) {
    int radix = (t[1] | 32) == 'x' ? 16 : (t[1] | 32) == 'o' ? 8 : 2;
    double v = 0;
    for (std::size_t k = 2; k < t.size(); ++k) {
      int d = t[k] >= '0' && t[k] <= '9' ? t[k] - '0' : (t[k] | 32) >= 'a' && (t[k] | 32) <= 'z' ? (t[k] | 32) - 'a' + 10 : 99;
      if (d >= radix) return NAN;
      v = v * radix + d;
    }
    return v;
  }
  if (t[i] == '+' || t[i] == '-') ++i;
  if (t.compare(i, std::string::npos, "Infinity") == 0) return t[0] == '-' ? -INFINITY : INFINITY;
  std::size_t d0 = i;
  while (i < t.size() && t[i] >= '0' && t[i] <= '9') ++i;
  bool digits = i > d0;
  if (i < t.size() && t[i] == '.') { std::size_t f0 = ++i; while (i < t.size() && t[i] >= '0' && t[i] <= '9') ++i; digits = digits || i > f0; }
  if (!digits) return NAN;
  if (i < t.size() && (t[i] == 'e' || t[i] == 'E')) {
    std::size_t e = i + 1;
    if (e < t.size() && (t[e] == '+' || t[e] == '-')) ++e;
    std::size_t e0 = e;
    while (e < t.size() && t[e] >= '0' && t[e] <= '9') ++e;
    if (e == e0) return NAN;
    i = e;
  }
  if (i != t.size()) return NAN;
  return std::strtod(t.c_str(), nullptr);
}

// Stable merge sort; `cmp(a, b) > 0` puts b first. Fails when the comparator does.
bool mergeSort(Machine& m, ObjVec<Slot>& v, const Func* cmp, Obj* fn, bool refs, Slot* scratch) {
  std::size_t n = v.size();
  ObjVec<Slot> tmp(n);
  for (std::size_t width = 1; width < n; width *= 2) {
    for (std::size_t lo = 0; lo < n; lo += 2 * width) {
      std::size_t mid = std::min(lo + width, n), hi = std::min(lo + 2 * width, n), i = lo, j = mid, k = lo;
      while (i < mid && j < hi) {
        double c;
        if (!m.callComparator(cmp, fn, v[i], v[j], refs, scratch, c)) return false;
        tmp[k++] = c > 0 ? v[j++] : v[i++];
      }
      while (i < mid) tmp[k++] = v[i++];
      while (j < hi) tmp[k++] = v[j++];
    }
    v.swap(tmp);
  }
  return true;
}

// The same merge for an f64[] sorted by (a, b) => a - b (or b - a): the comparison is made here, no function is called. `sign` is 1 or -1.
void mergeSortNumbers(ObjVec<Slot>& v, double sign) {
  std::size_t n = v.size();
  bool nan = false;
  for (Slot x : v) if (std::isnan(std::bit_cast<double>(x))) { nan = true; break; }
  if (!nan) {  // a total order (a - b > 0 is a > b here): the library's stable sort gives the same permutation as the merge below
    if (sign > 0) std::stable_sort(v.begin(), v.end(), [](Slot x, Slot y) { return std::bit_cast<double>(x) < std::bit_cast<double>(y); });
    else std::stable_sort(v.begin(), v.end(), [](Slot x, Slot y) { return std::bit_cast<double>(x) > std::bit_cast<double>(y); });
    return;
  }
  ObjVec<Slot> tmp(n);
  auto gt = [&](Slot x, Slot y) { return sign * (std::bit_cast<double>(x) - std::bit_cast<double>(y)) > 0; };  // what `cmp(x, y) > 0` was
  for (std::size_t width = 1; width < n; width *= 2) {
    for (std::size_t lo = 0; lo < n; lo += 2 * width) {
      std::size_t mid = std::min(lo + width, n), hi = std::min(lo + 2 * width, n), i = lo, j = mid, k = lo;
      while (i < mid && j < hi) tmp[k++] = gt(v[i], v[j]) ? v[j++] : v[i++];
      while (i < mid) tmp[k++] = v[i++];
      while (j < hi) tmp[k++] = v[j++];
    }
    v.swap(tmp);
  }
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


// JSON.parse into the Dyn classes of the prelude (src/frontend/dyn.cpp): objects, arrays, numbers, strings and booleans are
// built directly, `null` is the singleton the caller passes. Returns an owned reference, or 0 when the text is not JSON.
struct JsonBuild {
  Machine& m;
  const char* p;
  const char* end;
  Slot nullv;
  JsonBuild(Machine& mm, const char* begin, const char* stop, Slot nul) : m(mm), p(begin), end(stop), nullv(nul) {}
  const ClassRT *num = nullptr, *str = nullptr, *boo = nullptr, *arr = nullptr, *obj = nullptr, *items = nullptr, *map = nullptr;
  // Immutable values that repeat in a document are made once and shared: keys, short strings, small integers, true and false.
  std::unordered_map<std::string_view, StrObj*> keyCache;  // views into the cached strings themselves
  std::unordered_map<std::string_view, Slot> strCache;
  Slot smallInts[256] = {};
  Slot trueNode = 0, falseNode = 0;
  void dropCaches() {
    for (auto& [k, v] : keyCache) m.release(v);
    for (auto& [k, v] : strCache) m.releaseSlot(v);
    for (Slot v : smallInts) if (v) m.releaseSlot(v);
    if (trueNode) m.releaseSlot(trueNode);
    if (falseNode) m.releaseSlot(falseNode);
  }
  Slot shared(Slot& cell, const ClassRT* cls, Slot field) {
    if (!cell) cell = node(cls, field);
    if (cell) m.retain(reinterpret_cast<Obj*>(cell));
    return cell;
  }

  bool classes() {
    if (!m.resolveDyn()) return false;
    num = m.dynNum; str = m.dynStr; boo = m.dynBool; arr = m.dynArr; obj = m.dynObj; items = m.dynItems; map = m.dynMap;
    return true;
  }
  void ws() { while (p < end && (*p == ' ' || *p == '\t' || *p == '\n' || *p == '\r')) ++p; }
  Slot node(const ClassRT* cls, Slot field) {
    Slot o = 0;
    if (op::newObject(m, cls->id, o)) return 0;
    reinterpret_cast<Obj*>(o)->fields()[0] = field;
    return o;
  }
  bool hex4(unsigned& v) {
    if (end - p < 4) return false;
    v = 0;
    for (int k = 0; k < 4; ++k) {
      char h = p[k];
      unsigned d = h >= '0' && h <= '9' ? h - '0' : h >= 'a' && h <= 'f' ? h - 'a' + 10 : h >= 'A' && h <= 'F' ? h - 'A' + 10 : 99;
      if (d > 15) return false;
      v = v * 16 + d;
    }
    p += 4;
    return true;
  }
  static void utf8(std::string& o, unsigned c) {
    if (c < 0x80) o += static_cast<char>(c);
    else if (c < 0x800) { o += static_cast<char>(0xC0 | c >> 6); o += static_cast<char>(0x80 | (c & 0x3F)); }
    else if (c < 0x10000) { o += static_cast<char>(0xE0 | c >> 12); o += static_cast<char>(0x80 | ((c >> 6) & 0x3F)); o += static_cast<char>(0x80 | (c & 0x3F)); }
    else { o += static_cast<char>(0xF0 | c >> 18); o += static_cast<char>(0x80 | ((c >> 12) & 0x3F)); o += static_cast<char>(0x80 | ((c >> 6) & 0x3F)); o += static_cast<char>(0x80 | (c & 0x3F)); }
  }
  // A string literal at p (after the opening quote) into a new string object, or null.
  StrObj* string() {
    std::string out;
    const char* start = p;
    bool plain = true;
    while (p < end && *p != '"') {
      auto c = static_cast<unsigned char>(*p);
      if (c < 32) return nullptr;
      if (c == '\\') {
        if (plain) { out.assign(start, p); plain = false; }
        ++p;
        if (p >= end) return nullptr;
        char e = *p++;
        switch (e) {
          case 'n': out += '\n'; break;
          case 't': out += '\t'; break;
          case 'r': out += '\r'; break;
          case 'b': out += '\b'; break;
          case 'f': out += '\f'; break;
          case '/': out += '/'; break;
          case '\\': out += '\\'; break;
          case '"': out += '"'; break;
          case 'u': {
            unsigned u;
            if (!hex4(u)) return nullptr;
            if (u >= 0xD800 && u < 0xDC00 && end - p >= 6 && p[0] == '\\' && p[1] == 'u') {
              const char* save = p;
              p += 2;
              unsigned lo;
              if (hex4(lo) && lo >= 0xDC00 && lo < 0xE000) u = 0x10000 + ((u - 0xD800) << 10) + (lo - 0xDC00); else p = save;
            }
            utf8(out, u >= 0xD800 && u < 0xE000 ? 0xFFFD : u);
            break;
          }
          default: return nullptr;
        }
      } else {
        if (!plain) out += static_cast<char>(c);
        ++p;
      }
    }
    if (p >= end) return nullptr;
    StrObj* r = plain ? m.newStr(start, static_cast<std::size_t>(p - start)) : m.newStr(out.data(), out.size());
    ++p;  // the closing quote
    return r;
  }
  bool lit(const char* w, std::size_t n) { if (static_cast<std::size_t>(end - p) < n || std::memcmp(p, w, n) != 0) return false; p += n; return true; }

  Slot value(int depth) {
    if (depth > 1000) return 0;
    ws();
    if (p >= end) return 0;
    char c = *p;
    if (c == '{') {
      ++p;
      Slot mapv = 0;
      if (op::newObject(m, map->id, mapv)) return 0;
      auto* mo = reinterpret_cast<MapObj*>(mapv);
      mo->t.kk = map->keyKind;
      mo->t.hasVals = true;
      mo->t.keys.reserve(4); mo->t.vals.reserve(4); mo->t.dead.reserve(4);  // most objects have a few keys: no regrowth
      auto fail = [&]() { m.release(mo); return Slot{0}; };
      ws();
      if (p < end && *p == '}') { ++p; return node(obj, mapv); }
      for (;;) {
        ws();
        if (p >= end || *p != '"') return fail();
        ++p;
        const char* keyStart = p;
        StrObj* k = string();
        if (!k) return fail();
        {  // the same key text is one string object for the whole document
          auto it = keyCache.find(std::string_view(k->data(), k->len));
          if (it == keyCache.end()) { m.retain(k); keyCache.emplace(std::string_view(k->data(), k->len), k); }
          else { m.release(k); k = it->second; m.retain(k); }
        }
        (void)keyStart;
        ws();
        if (p >= end || *p != ':') { m.release(k); return fail(); }
        ++p;
        Slot v = value(depth + 1);
        if (!v) { m.release(k); return fail(); }
        std::int32_t e = mo->t.find(reinterpret_cast<Slot>(k));
        if (e >= 0) {  // a repeated key: the last value wins
          m.releaseSlot(mo->t.vals[static_cast<std::size_t>(e)]);
          mo->t.vals[static_cast<std::size_t>(e)] = v;
          m.release(k);
        } else mo->t.put(reinterpret_cast<Slot>(k), v);
        ws();
        if (p < end && *p == ',') { ++p; continue; }
        if (p < end && *p == '}') { ++p; return node(obj, mapv); }
        return fail();
      }
    }
    if (c == '[') {
      ++p;
      ArrObj* a = m.newArr(items);
      a->v.reserve(4);
      auto fail = [&]() { m.release(a); return Slot{0}; };
      ws();
      if (p < end && *p == ']') { ++p; return node(arr, reinterpret_cast<Slot>(a)); }
      for (;;) {
        Slot v = value(depth + 1);
        if (!v) return fail();
        a->v.push_back(v);
        ws();
        if (p < end && *p == ',') { ++p; continue; }
        if (p < end && *p == ']') { ++p; return node(arr, reinterpret_cast<Slot>(a)); }
        return fail();
      }
    }
    if (c == '"') {
      ++p;
      StrObj* sv = string();
      if (!sv) return 0;
      if (sv->len <= 16) {  // short strings repeat (tags, enum-like values): share the node
        auto it = strCache.find(std::string_view(sv->data(), sv->len));
        if (it != strCache.end()) { m.release(sv); m.retain(reinterpret_cast<Obj*>(it->second)); return it->second; }
        Slot nd = node(str, reinterpret_cast<Slot>(sv));
        if (nd) { m.retain(reinterpret_cast<Obj*>(nd)); strCache.emplace(std::string_view(sv->data(), sv->len), nd); }
        return nd;
      }
      return node(str, reinterpret_cast<Slot>(sv));
    }
    if (c == 't') return lit("true", 4) ? shared(trueNode, boo, 1) : 0;
    if (c == 'f') return lit("false", 5) ? shared(falseNode, boo, 0) : 0;
    if (c == 'n') { if (!lit("null", 4)) return 0; m.retain(reinterpret_cast<Obj*>(nullv)); return nullv; }
    const char* st = p;
    if (p < end && *p == '-') ++p;
    if (p < end && *p == '0') ++p;
    else if (p < end && *p >= '1' && *p <= '9') while (p < end && *p >= '0' && *p <= '9') ++p;
    else return 0;
    if (p < end && *p == '.') { ++p; const char* d = p; while (p < end && *p >= '0' && *p <= '9') ++p; if (p == d) return 0; }
    if (p < end && (*p == 'e' || *p == 'E')) { ++p; if (p < end && (*p == '+' || *p == '-')) ++p; const char* d = p; while (p < end && *p >= '0' && *p <= '9') ++p; if (p == d) return 0; }
    double d = std::strtod(st, nullptr);  // the text is NUL-terminated and the grammar was checked: strtod stops where the number ends
    if (d >= 0 && d < 256 && d == static_cast<double>(static_cast<int>(d)) && !std::signbit(d)) return shared(smallInts[static_cast<int>(d)], num, std::bit_cast<Slot>(d));
    return node(num, std::bit_cast<Slot>(d));
  }
};

// ---- the host (zinc:gfx, zinc:sys, zinc:fs...): arguments decoded by their letters, the work done through the installed call (zn/host.h)
static const char* hostRt(Machine& m, Rt id, Slot* a) {
  const RtInfo& ri = rtInfo(id);
  bool sys = isSysRow(id);
  zn::host::HostCall call = isLayoutRow(id) ? zn::host::hostLayout : sys ? zn::host::hostSys : zn::host::hostGfx;
  // what needs the machine: the program's standard output is buffered in the machine, so writes and exit go through it
  if (id == Rt::HostSysWrite) { StrObj* s = S(a[0]); if (!s) return kNull; m.out->append(s->data(), s->len); return nullptr; }
  if (id == Rt::HostSysExit) {
    std::fwrite(m.out->data(), 1, m.out->size(), stdout);
    std::fflush(stdout);
    std::exit(static_cast<int>(static_cast<std::int32_t>(a[0])));
  }
  if (!call) return isLayoutRow(id) ? "the rn layout engine is not available in this build" : sys ? "the system modules are not available in this build" : "zinc:gfx is not available in this build";
  zn::host::HostArg args[12], res;
  for (unsigned k = 0; k < rtParamCount(ri); ++k) {
    zn::host::HostArg& h = args[k];
    switch (rtParam(ri, k)) {
      case 'd': h.d = std::bit_cast<double>(a[k]); break;
      case 's': { StrObj* s = S(a[k]); if (!s) return kNull; h.p = s->data(); h.n = s->len; break; }
      case 'D': case 'B': { ArrObj* arr = reinterpret_cast<ArrObj*>(a[k]); if (!arr) return kNull; h.p = arr->v.data(); h.n = static_cast<std::uint32_t>(arr->v.size()); break; }
      case 'u': h.i = static_cast<std::int64_t>(static_cast<std::uint32_t>(a[k])); break;
      default: h.i = static_cast<std::int64_t>(a[k]); break;  // i (sign-extended), b
    }
  }
  call(static_cast<int>(id), args, &res);
  switch (rtRet(ri)) {
    case 'd': a[0] = std::bit_cast<Slot>(res.d); break;
    case 'i': case 'b': a[0] = static_cast<Slot>(res.i); break;
    case 's': { StrObj* so = m.newStr(static_cast<const char*>(res.p), res.n); a[0] = P(so); break; }
    default: break;
  }
  return nullptr;
}

// ---- native modules (include/zn/native.h): the arguments are decoded by the signature of the table entry, the export is called through the registry.
// A Zinc closure passed to a native export gets a handle (ZnVal.h); the registry's sink runs it on the engine's thread when the module calls it (at once: cb_call, or from
// the loop: cb_post), and a promise result is two such closures that the sink calls when the module settles the promise.
namespace {

struct CbEntry {
  Obj* fn = nullptr;
  const Func* call = nullptr;
  std::string params;    // the callback's parameter letters
  char result = 'n';
  int rc = 1;            // the call's own reference, plus one while the module holds it
};
struct PromiseEntry { std::uint64_t resolve, reject; char of; };

std::unordered_map<std::uint64_t, CbEntry> gCbs;
std::unordered_map<std::uint64_t, PromiseEntry> gPromises;
std::uint64_t gCbNext = 1;
std::string gCbError;   // the message of the last closure that threw
const char* cbError(void*) { return gCbError.c_str(); }
Machine* gMachine = nullptr;
Slot* gScratch = nullptr;   // the frame above the running call: where a callback's own frame goes

void cbUnref(std::uint64_t h) {
  auto it = gCbs.find(h);
  if (it == gCbs.end()) return;
  if (--it->second.rc == 0) { Obj* fn = it->second.fn; gCbs.erase(it); if (gMachine) gMachine->release(fn); }
}

const ClassRT* arrayClassFor(Machine& m, char letter) {   // the array class whose elements are integers (B, I) or f64 (D)
  for (std::size_t c = 0; c < m.mod->classes.size(); ++c) {
    const zbc::ClassInfo& ci = m.mod->classes[c];
    if (ci.kind == zbc::CKind::Array && ci.elem.cls == (letter == 'D' ? zbc::Cls::D : zbc::Cls::I)) return &m.classes[c];
  }
  return nullptr;
}

bool toSlot(Machine& m, char letter, const ZnVal& v, Slot& out) {
  switch (letter) {
    case 'i': out = static_cast<Slot>(static_cast<std::int64_t>(static_cast<std::int32_t>(v.i))); return true;
    case 'u': out = static_cast<Slot>(static_cast<std::uint32_t>(v.i)); return true;
    case 'b': out = v.i != 0; return true;
    case 'd': out = std::bit_cast<Slot>(v.d); return true;
    case 's': out = reinterpret_cast<Slot>(m.newStr(v.s.p, v.s.n)); return true;
    default: {
      const ClassRT* cls = arrayClassFor(m, letter);
      if (!cls) return false;
      ArrObj* arr = m.newArr(cls);
      for (std::uint32_t j = 0; j < v.v.n; ++j) {
        if (letter == 'D') arr->v.push_back(std::bit_cast<Slot>(static_cast<const double*>(v.v.p)[j]));
        else if (letter == 'B') arr->v.push_back(static_cast<const std::uint8_t*>(v.v.p)[j]);
        else arr->v.push_back(static_cast<Slot>(static_cast<std::int64_t>(static_cast<const std::int32_t*>(v.v.p)[j])));
      }
      out = reinterpret_cast<Slot>(arr);
      return true;
    }
  }
}

// Runs closure `h` with the arguments of the module; false when it traps (the message is in the machine's error).
std::int32_t runClosure(void*, std::uint64_t h, const ZnVal* args, std::uint32_t n, ZnVal* ret) {
  auto it = gCbs.find(h);
  if (it == gCbs.end() || !gMachine || !gScratch) return -1;
  CbEntry e = it->second;   // a copy: the table may change while the closure runs
  Machine& m = *gMachine;
  m.retain(e.fn);
  Slot* frame = gScratch;
  frame[0] = reinterpret_cast<Slot>(e.fn);
  for (std::uint32_t k = 0; k < n && k < e.params.size(); ++k) if (!toSlot(m, e.params[k], args[k], frame[1 + k])) return -1;
  Slot* saved = gScratch;
  gScratch = frame + 1 + e.params.size() + 8;   // a nested call (the closure calls a native that calls back) starts above this frame
  std::size_t depth = m.depth;
  bool ok = m.exec(e.call, frame);
  gScratch = saved;
  if (!ok) {   // the closure threw: its message goes to the module, which may turn it into an error of its own; the machine carries on
    std::string msg = m.error;
    if (msg.rfind("panic: ", 0) == 0) msg = msg.substr(7);
    gCbError = msg;
    m.error.clear();
    m.depth = depth;
    return -1;
  }
  if (ret) {
    switch (e.result) {
      case 'd': ret->d = std::bit_cast<double>(frame[0]); break;
      case 'i': ret->i = static_cast<std::int32_t>(frame[0]); break;
      case 'u': ret->i = static_cast<std::uint32_t>(frame[0]); break;
      case 'b': ret->i = frame[0] != 0; break;
      case 's': { StrObj* s = S(frame[0]); static std::string keep; keep.assign(s ? s->data() : "", s ? s->len : 0); ret->s.p = keep.data(); ret->s.n = static_cast<std::uint32_t>(keep.size()); m.releaseSlot(frame[0]); break; }
      default: break;
    }
  }
  return 0;
}

void sinkHold(void*, std::uint64_t h) { auto it = gCbs.find(h); if (it != gCbs.end()) ++it->second.rc; }
void sinkRelease(void*, std::uint64_t h) { cbUnref(h); }

void settle(std::uint64_t promise, bool ok, const ZnVal* v, const char* message) {
  auto it = gPromises.find(promise);
  if (it == gPromises.end()) return;
  PromiseEntry pe = it->second;
  gPromises.erase(it);
  ZnVal arg{};
  if (ok) {
    if (pe.of != 'n' && v) runClosure(nullptr, pe.resolve, v, 1, nullptr);
    else runClosure(nullptr, pe.resolve, &arg, 0, nullptr);
  } else {
    arg.s.p = message ? message : "";
    arg.s.n = static_cast<std::uint32_t>(std::strlen(arg.s.p));
    runClosure(nullptr, pe.reject, &arg, 1, nullptr);
  }
  cbUnref(pe.resolve);
  cbUnref(pe.reject);
}
void sinkResolve(void*, std::uint64_t p, const ZnVal* v) { settle(p, true, v, nullptr); }
void sinkReject(void*, std::uint64_t p, const char* msg) { settle(p, false, nullptr, msg); }

void installSink(Machine& m) {
  if (gMachine == &m) return;
  gMachine = &m;
  ZnSink sink{&m, sinkResolve, sinkReject, runClosure, sinkRelease, cbError, sinkHold};
  zn_native_set_sink(&sink);
}

// Registers closure `fn` and returns its handle (0 when the closure has no call(...) of the right shape).
std::uint64_t cbRegister(Machine& m, Obj* fn, const std::string& inner) {
  nsig::Sig dummy;
  std::string params;
  char result;
  if (!fn || !nsig::parseCallback(inner, params, result)) return 0;
  const ClassRT& c = *fn->cls;
  const Func* call = nullptr;
  for (std::uint32_t sel : m.mod->classes[c.id].selectors)
    if (m.mod->selectors[sel].name == "call" && m.mod->selectors[sel].params.size() == params.size() && sel < c.vtable.size() && c.vtable[sel]) call = c.vtable[sel];
  if (!call) return 0;
  m.retain(fn);
  std::uint64_t h = gCbNext++;
  gCbs[h] = CbEntry{fn, call, params, result, 1};
  return h;
}

}  // namespace

void nativeEnd(Machine& m) {
  if (gMachine != &m) return;
  for (auto& kv : gPromises) { cbUnref(kv.second.resolve); cbUnref(kv.second.reject); }
  gPromises.clear();
  zn_native_drop_callbacks();
  std::vector<std::uint64_t> rest;
  for (auto& kv : gCbs) rest.push_back(kv.first);
  for (std::uint64_t h : rest) { auto it = gCbs.find(h); if (it != gCbs.end()) { it->second.rc = 1; cbUnref(h); } }
  gMachine = nullptr;
  gScratch = nullptr;
  zn_native_set_sink(nullptr);
}

// The loop's turn for the native modules: their pollers, the queued posts and completions (the callbacks run here); whether native work is still pending.
std::int32_t nativePoll(Machine& m, Slot* scratch, bool run) {
  installSink(m);
  gScratch = scratch;
  if (run) {
    zn_native_poll(0); zn_native_drain();
    // A deterministic run has no wall clock to race: an asynchronous native call (a camera scan on a thread) completes before the next frame, as it does in the prototype's runtime.
    // ZN-223: bounded by a budget for the whole run, so a promise that waits for the outside world cannot stall every frame.
    static const bool det = std::getenv("ZINC_DETERMINISTIC") && !std::getenv("ZINC_REALTIME");
    static std::int64_t budgetMs = 3000;
    for (; det && !gPromises.empty() && budgetMs > 0; --budgetMs) {
#ifndef __wasi__
      std::this_thread::sleep_for(std::chrono::milliseconds(1));
#endif
      zn_native_poll(0); zn_native_drain();
    }
  }
  return zn_native_pending() > 0 || !gPromises.empty() ? 1 : 0;
}

const char* nativeCall(Machine& m, std::uint32_t idx, Slot* a, Slot* scratch) {
  const zbc::Native& nt = m.mod->natives[idx];
  nsig::Sig sg;
  nsig::parse(nt.sig.c_str(), sg);   // the verifier checked the signature
  installSink(m);
  Slot* savedScratch = gScratch;
  gScratch = scratch;
  const std::string& ps = sg.params;
  ZnVal args[16], ret;
  std::deque<std::vector<std::uint8_t>> packed;   // u8 and i32 arrays are packed for the call
  std::deque<std::vector<ZnStr>> strViews;        // string[] arguments
  std::vector<std::uint64_t> handles;             // the closures of this call: its own reference ends when it returns
  std::size_t cbi = 0;
  auto fail = [&](const char* msg) { for (std::uint64_t h : handles) cbUnref(h); gScratch = savedScratch; return msg; };
  for (std::size_t k = 0; k < ps.size() && k < 12; ++k) {
    ZnVal& v = args[k];
    switch (ps[k]) {
      case 'd': v.d = std::bit_cast<double>(a[k]); break;
      case 'i': v.i = static_cast<std::int32_t>(a[k]); break;
      case 'u': v.i = static_cast<std::int64_t>(static_cast<std::uint32_t>(a[k])); break;
      case 'b': v.i = a[k] != 0; break;
      case 's': { StrObj* s = S(a[k]); if (!s) return fail(kNull); v.s.p = s->data(); v.s.n = s->len; break; }
      case 'c': {
        std::uint64_t h = cbRegister(m, reinterpret_cast<Obj*>(a[k]), sg.cbs[cbi++]);
        if (!h) return fail("native: a callback does not have the shape of the signature");
        handles.push_back(h);
        v.h = h;
        break;
      }
      default: {
        ArrObj* arr = reinterpret_cast<ArrObj*>(a[k]);
        if (!arr) return fail(kNull);
        v.v.n = static_cast<std::uint32_t>(arr->v.size());
        if (ps[k] == 'D') { v.v.p = arr->v.data(); break; }   // a slot holds the bits of the double
        if (ps[k] == 'S') {   // string[]: a view of ZnStr
          strViews.emplace_back();
          for (Slot sl : arr->v) { StrObj* so = S(sl); strViews.back().push_back(ZnStr{so ? so->data() : "", so ? so->len : 0}); }
          v.v.p = strViews.back().data();
          break;
        }
        std::size_t w = ps[k] == 'B' ? 1 : 4;   // B: bytes; I and U: 32-bit
        packed.emplace_back(arr->v.size() * w);
        for (std::size_t j = 0; j < arr->v.size(); ++j) {
          if (w == 1) packed.back()[j] = static_cast<std::uint8_t>(arr->v[j]);
          else { auto x = static_cast<std::int32_t>(arr->v[j]); std::memcpy(packed.back().data() + j * 4, &x, 4); }
        }
        v.v.p = packed.back().data();
      }
    }
  }
  const void* sent[12] = {};   // the views as they were sent: a module that changed an array points the view somewhere else
  for (std::size_t k = 0; k < ps.size() && k < 12; ++k) sent[k] = args[k].v.p;
  std::uint64_t resolveH = 0, rejectH = 0;
  if (sg.result == 'P') {   // the two closures that settle the promise follow the parameters
    std::string pr = sg.promiseOf == 'n' ? ">n" : std::string(1, sg.promiseOf) + ">n";
    resolveH = cbRegister(m, reinterpret_cast<Obj*>(a[ps.size()]), pr);
    rejectH = cbRegister(m, reinterpret_cast<Obj*>(a[ps.size() + 1]), "s>n");
    if (!resolveH || !rejectH) { if (resolveH) cbUnref(resolveH); if (rejectH) cbUnref(rejectH); return fail("native: the promise callbacks do not have the shape of the signature"); }
  }
  char err[256] = "";
  ret.u = 0;
  std::int32_t st = zn_native_call(nt.module.c_str(), nt.name.c_str(), nt.sig.c_str(), args, &ret, err, sizeof err);
  for (std::uint64_t h : handles) cbUnref(h);   // the call's own reference; a module that kept a callback holds another
  for (std::size_t k = 0; k < ps.size() && k < 12; ++k) {   // arrays the module filled or changed (out parameters): the program's array takes the new contents
    char l = ps[k];
    if ((l != 'B' && l != 'I' && l != 'U' && l != 'D') || args[k].v.p == sent[k]) continue;
    ArrObj* arr = reinterpret_cast<ArrObj*>(a[k]);
    arr->v.clear();
    for (std::uint32_t j = 0; j < args[k].v.n; ++j) {
      if (l == 'D') arr->v.push_back(std::bit_cast<Slot>(static_cast<const double*>(args[k].v.p)[j]));
      else if (l == 'B') arr->v.push_back(static_cast<const std::uint8_t*>(args[k].v.p)[j]);
      else if (l == 'U') arr->v.push_back(static_cast<Slot>(static_cast<const std::uint32_t*>(args[k].v.p)[j]));
      else arr->v.push_back(static_cast<Slot>(static_cast<std::int64_t>(static_cast<const std::int32_t*>(args[k].v.p)[j])));
    }
  }
  gScratch = savedScratch;
  if (sg.result == 'P') {
    if (st == ZN_PENDING) { gPromises[zn_native_last_promise()] = PromiseEntry{resolveH, rejectH, sg.promiseOf}; return nullptr; }
    cbUnref(resolveH);
    cbUnref(rejectH);
    if (st == ZN_OK) return "native: an export with a promise result did not take its promise";
  }
  if (st != ZN_OK) {
    m.error = "native " + nt.module + "." + nt.name + (st == ZN_PENDING ? ": a promise result needs a signature that says so" : ": " + std::string(err));
    return m.error.c_str();
  }
  switch (sg.result) {
    case 'd': a[0] = std::bit_cast<Slot>(ret.d); break;
    case 'i': a[0] = static_cast<Slot>(static_cast<std::int64_t>(static_cast<std::int32_t>(ret.i))); break;
    case 'u': a[0] = static_cast<Slot>(static_cast<std::uint32_t>(ret.i)); break;
    case 'b': a[0] = ret.i != 0; break;
    case 's': a[0] = P(m.newStr(ret.s.p, ret.s.n)); break;
    case 'n': break;
    default: {
      Slot out;
      if (!toSlot(m, sg.result, ret, out)) return "native: no array class for the result";
      a[0] = out;
    }
  }
  return nullptr;
}

const char* rtCall(Machine& m, Rt id, Slot* a, Slot* scratch) {
  if (zn::host::HostFast f = zn::host::hostFast[static_cast<unsigned>(id)]) { f(a); return nullptr; }   // a hot scalar host row (ZN-397)
  if (id == Rt::HostNativePoll) { a[0] = static_cast<Slot>(nativePoll(m, scratch, a[0] != 0)); return nullptr; }
#define NN(x) do { if (!(x)) return kNull; } while (0)
  if ((id >= Rt::HostGfxFrames && id <= Rt::HostHostLast) || id >= Rt::HostLoopWait) return hostRt(m, id, a);
  switch (id) {
    // ---- internal string operations
    case Rt::StrConcat: case Rt::StrConcatM: {
      StrObj *x = S(a[0]), *y = S(a[1]);
      NN(x && y);
      if (static_cast<std::uint64_t>(x->len) + y->len > 0x7fffffffu) return "RangeError: Invalid string length";
      std::string r(x->data(), x->len);
      r.append(y->data(), y->len);
      a[0] = P(m.newStr(r.data(), r.size()));
      return nullptr;
    }
    case Rt::StrEq: { StrObj *x = S(a[0]), *y = S(a[1]); if (!x || !y) { a[0] = boolSlot(x == y); return nullptr; } a[0] = boolSlot(x == y || (x->len == y->len && std::memcmp(x->data(), y->data(), x->len) == 0)); return nullptr; }
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
    case Rt::ObjId: return nullptr;  // the pointer itself is the identity (the verifier types the result as an integer)
    case Rt::ClassName: {
      auto* o = reinterpret_cast<Obj*>(a[0]);
      NN(o);
      auto* cls = const_cast<ClassRT*>(o->cls);
      if (!cls->nameStr) { cls->nameStr = m.newStr(cls->name.data(), cls->name.size()); cls->nameStr->rc = kImmortal; }
      a[0] = P(cls->nameStr);
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
    case Rt::ArrSetLength: {  // arr.length = n: shorter drops (and releases) the tail, longer pads with zero or null
      ArrObj* o = A(a[0]);
      NN(o);
      std::int64_t n = I(a[1]);
      if (n < 0 || n > 0x7fffffffLL) return "RangeError: Invalid array length";
      std::size_t keep = static_cast<std::size_t>(n);
      if (keep < o->v.size()) {
        std::vector<Slot> tail(o->v.begin() + static_cast<std::ptrdiff_t>(keep), o->v.end());
        o->v.resize(keep);
        if (o->cls->elemRef) for (Slot t : tail) m.releaseSlot(t);
      } else o->v.resize(keep, 0);
      return nullptr;
    }
    case Rt::StrAt: {  // s.at(i): a negative index counts from the end; out of range gives "" (not undefined)
      StrObj* s = S(a[0]);
      NN(s);
      std::int64_t i = I(a[1]);
      if (i < 0) i += s->u16len;
      a[0] = P(i < 0 || i >= s->u16len ? m.newStr("", 0) : subStr(m, s, i, i + 1));
      return nullptr;
    }
    case Rt::StrToUpperCase: case Rt::StrToLowerCase: {  // ASCII strings by a byte loop, the rest through libunicode (special casing: ß, İ, a final sigma)
      StrObj* s = S(a[0]);
      NN(s);
      std::string r;
      if (s->ascii) {
        r.assign(s->data(), s->len);
        for (char& c : r) {
          if (id == Rt::StrToUpperCase) { if (c >= 'a' && c <= 'z') c = static_cast<char>(c - 32); }
          else if (c >= 'A' && c <= 'Z') c = static_cast<char>(c + 32);
        }
      } else {
        std::u16string u = id == Rt::StrToUpperCase ? zn::uni::upper(toU16(s)) : zn::uni::lower(toU16(s));
        r = toUtf8(u.data(), u.size());
      }
      a[0] = P(m.newStr(r.data(), r.size()));
      return nullptr;
    }
    case Rt::StrCodePointAt: {  // -1 where JavaScript has undefined
      StrObj* s = S(a[0]);
      NN(s);
      std::int64_t i = I(a[1]);
      if (i < 0 || i >= s->u16len) { a[0] = static_cast<Slot>(-1); return nullptr; }
      if (s->ascii) { a[0] = static_cast<std::uint8_t>(s->data()[i]); return nullptr; }
      std::u16string u = toU16(s);
      std::uint32_t c = u[static_cast<std::size_t>(i)];
      if (c >= 0xD800 && c < 0xDC00 && static_cast<std::size_t>(i) + 1 < u.size() && u[static_cast<std::size_t>(i) + 1] >= 0xDC00 && u[static_cast<std::size_t>(i) + 1] < 0xE000) c = 0x10000 + ((c - 0xD800) << 10) + (u[static_cast<std::size_t>(i) + 1] - 0xDC00u);
      a[0] = c;
      return nullptr;
    }
    case Rt::FromCodePoint: {
      std::int64_t c = I(a[0]);
      if (c < 0 || c > 0x10FFFF) return "RangeError: Invalid code point";
      std::u16string u;
      if (c >= 0x10000) { std::uint32_t d = static_cast<std::uint32_t>(c) - 0x10000; u += static_cast<char16_t>(0xD800 + (d >> 10)); u += static_cast<char16_t>(0xDC00 + (d & 0x3FF)); }
      else u += static_cast<char16_t>(c);
      std::string r = toUtf8(u.data(), u.size());
      a[0] = P(m.newStr(r.data(), r.size()));
      return nullptr;
    }
    case Rt::StrNormalize: {
      StrObj *s = S(a[0]), *f = S(a[1]);
      NN(s && f);
      std::string form(f->data(), f->len);
      int k = form == " " || form == "NFC" ? 0 : form == "NFD" ? 1 : form == "NFKC" ? 2 : form == "NFKD" ? 3 : -1;
      if (k < 0) return "RangeError: The normalization form should be one of NFC, NFD, NFKC, NFKD.";
      if (s->ascii) { a[0] = P(s); return nullptr; }
      std::u16string u = zn::uni::normalize(toU16(s), k);
      std::string r = toUtf8(u.data(), u.size());
      a[0] = P(m.newStr(r.data(), r.size()));
      return nullptr;
    }
    case Rt::StrLocaleCompare: {  // the root collation (the locale argument is ignored)
      StrObj *s = S(a[0]), *t = S(a[1]);
      NN(s && t);
      a[0] = static_cast<Slot>(static_cast<std::int64_t>(zn::uni::collate(toU16(s), toU16(t))));
      return nullptr;
    }
    case Rt::StrChars: {  // the code points of a string, one string each (for-of, spread, Array.from)
      StrObj* s = S(a[0]);
      NN(s);
      ArrObj* r = m.newArr(m.strArray);
      if (s->ascii) { for (std::uint32_t i = 0; i < s->len; ++i) r->v.push_back(P(m.newStr(s->data() + i, 1))); }
      else {
        std::u16string u = toU16(s);
        for (std::size_t i = 0; i < u.size();) {
          std::size_t n = u[i] >= 0xD800 && u[i] < 0xDC00 && i + 1 < u.size() && u[i + 1] >= 0xDC00 && u[i + 1] < 0xE000 ? 2 : 1;
          std::string c = toUtf8(u.data() + i, n);
          r->v.push_back(P(m.newStr(c.data(), c.size())));
          i += n;
        }
      }
      a[0] = P(r);
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
      std::int64_t k = findBytes(s, n, byteOf(s, std::clamp<std::int64_t>(I(a[2]), 0, s->u16len)));
      a[0] = static_cast<Slot>(k < 0 ? -1 : u16Index(s, static_cast<std::uint32_t>(k)));
      return nullptr;
    }
    case Rt::StrLastIndexOf: {
      StrObj *s = S(a[0]), *n = S(a[1]);
      NN(s && n);
      std::uint32_t from = byteOf(s, std::clamp<std::int64_t>(I(a[2]), 0, s->u16len));  // the last match starting at or before `from`
      std::int64_t best = -1;
      if (n->len <= s->len) for (std::int64_t k = std::min<std::int64_t>(from, s->len - n->len); k >= 0; --k)
        if (std::memcmp(s->data() + k, n->data(), n->len) == 0) { best = k; break; }
      a[0] = static_cast<Slot>(best < 0 ? -1 : u16Index(s, static_cast<std::uint32_t>(best)));
      return nullptr;
    }
    case Rt::StrIncludes: { StrObj *s = S(a[0]), *n = S(a[1]); NN(s && n); a[0] = boolSlot(findBytes(s, n, byteOf(s, std::clamp<std::int64_t>(I(a[2]), 0, s->u16len))) >= 0); return nullptr; }
    case Rt::StrStartsWith: {
      StrObj *s = S(a[0]), *n = S(a[1]);
      NN(s && n);
      std::uint32_t at = byteOf(s, std::clamp<std::int64_t>(I(a[2]), 0, s->u16len));
      a[0] = boolSlot(n->len <= s->len - at && std::memcmp(s->data() + at, n->data(), n->len) == 0);
      return nullptr;
    }
    case Rt::StrEndsWith: {
      StrObj *s = S(a[0]), *n = S(a[1]);
      NN(s && n);
      std::uint32_t end = byteOf(s, std::clamp<std::int64_t>(I(a[2]), 0, s->u16len));
      a[0] = boolSlot(n->len <= end && std::memcmp(s->data() + end - n->len, n->data(), n->len) == 0);
      return nullptr;
    }
    case Rt::StrTrim: case Rt::StrTrimStart: case Rt::StrTrimEnd: {
      StrObj* s = S(a[0]);
      NN(s);
      const auto* p = reinterpret_cast<const std::uint8_t*>(s->data());
      std::uint32_t lo = 0, hi = s->len, w;
      while (id != Rt::StrTrimEnd && lo < hi && (w = wsAt(p + lo, hi - lo))) lo += w;
      for (bool more = id != Rt::StrTrimStart; more && hi > lo;) {  // a whitespace code point ends at hi: try each possible start
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
      if (target <= len || fill->len == 0) { m.retain(s); return nullptr; }  // the receiver is the result: a new reference to it (the caller releases its own)
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
      // the replacement with $$ $& $` $' expanded for a match of s at [at, at + pat->len)
      auto put = [&](std::uint32_t at) {
        for (std::uint32_t k = 0; k < rep->len; ++k) {
          char c = rep->data()[k];
          if (c != '$' || k + 1 >= rep->len) { r += c; continue; }
          char d = rep->data()[k + 1];
          if (d == '$') r += '$';
          else if (d == '&') r.append(s->data() + at, pat->len);
          else if (d == '`') r.append(s->data(), at);
          else if (d == '\'') r.append(s->data() + at + pat->len, s->len - at - pat->len);
          else { r += c; continue; }
          ++k;
        }
      };
      if (pat->len == 0) {  // between every character (replaceAll) or at the start (replace)
        const auto* d = reinterpret_cast<const std::uint8_t*>(s->data());
        for (std::uint32_t i = 0; i <= s->len;) {
          put(i);
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
          put(static_cast<std::uint32_t>(k));
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
    case Rt::JsonOut: {  // JSON.stringify of a Dyn tree without the interpreter: numbers as ECMAScript prints them, strings escaped like JSON.stringify, undefined skipped in objects
      Obj* root = reinterpret_cast<Obj*>(a[0]);
      NN(root);
      std::string out;
      bool ok = m.resolveDyn() && m.dynUndef && m.dynNull && jsonOut(m, root, out, 0);
      a[0] = P(m.newStr(ok ? out.data() : "", ok ? out.size() : 0));
      return nullptr;
    }
    case Rt::JsonParse: {
      StrObj* text = S(a[0]);
      NN(text);
      JsonBuild jb(m, text->data(), text->data() + text->len, a[1]);
      if (!jb.classes()) return "JSON.parse needs the Dyn classes of the prelude";
      Slot v = jb.value(0);
      if (v) { jb.ws(); if (jb.p != jb.end) { m.releaseSlot(v); v = 0; } }  // text after the value
      jb.dropCaches();
      a[0] = v;
      return nullptr;
    }
    case Rt::DynGetFast: {  // d.name on a plain Dyn object, or the length of a Dyn array: no allocation but the result; 0 for everything else
      Obj* o = reinterpret_cast<Obj*>(a[0]);
      a[0] = 0;
      if (!o || !m.resolveDyn()) return nullptr;
      StrObj* key = S(a[2]);
      NN(key);
      if (o->cls == m.dynObj) {
        auto* mo = reinterpret_cast<MapObj*>(o->fields()[0]);
        std::int32_t e = mo->t.find(reinterpret_cast<Slot>(key));
        Slot v = e >= 0 ? mo->t.vals[static_cast<std::size_t>(e)] : a[1];  // a missing property is the undefined the caller passed
        m.retain(reinterpret_cast<Obj*>(v));
        a[0] = v;
      } else if (o->cls == m.dynArr && key->len == 6 && std::memcmp(key->data(), "length", 6) == 0) {
        Slot nd = 0;
        if (op::newObject(m, m.dynNum->id, nd)) return "out of memory";
        reinterpret_cast<Obj*>(nd)->fields()[0] = std::bit_cast<Slot>(static_cast<double>(reinterpret_cast<ArrObj*>(o->fields()[0])->v.size()));
        a[0] = nd;
      }
      return nullptr;
    }
    case Rt::DynAddFast: {  // number + number; 0 for every other pair
      Obj *x = reinterpret_cast<Obj*>(a[0]), *y = reinterpret_cast<Obj*>(a[1]);
      a[0] = 0;
      if (!x || !y || !m.resolveDyn() || x->cls != m.dynNum || y->cls != m.dynNum) return nullptr;
      Slot nd = 0;
      if (op::newObject(m, m.dynNum->id, nd)) return "out of memory";
      reinterpret_cast<Obj*>(nd)->fields()[0] = std::bit_cast<Slot>(std::bit_cast<double>(x->fields()[0]) + std::bit_cast<double>(y->fields()[0]));
      a[0] = nd;
      return nullptr;
    }
    case Rt::ToNumber: { StrObj* s = S(a[0]); NN(s); a[0] = std::bit_cast<Slot>(toNumberJs(s)); return nullptr; }
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
      if (!mergeSort(m, o->v, cmp, fn, o->cls->elemRef, scratch)) return m.error.c_str();
      m.retain(o);  // the result is a new reference to the same array
      return nullptr;
    }
    case Rt::ArrSortAsc: case Rt::ArrSortDesc: {
      ArrObj* o = A(a[0]);
      NN(o);
      mergeSortNumbers(o->v, id == Rt::ArrSortAsc ? 1.0 : -1.0);
      m.retain(o);
      return nullptr;
    }
    case Rt::ArrSlice: {
      ArrObj* o = A(a[0]);
      NN(o);
      std::int64_t n = static_cast<std::int64_t>(o->v.size()), from = clampRel(I(a[1]), n), to = clampRel(I(a[2]), n);
      ArrObj* r = m.newArr(o->cls);
      if (to > from) r->v.assign(o->v.begin() + from, o->v.begin() + to);
      if (o->cls->elemRef) for (Slot e : r->v) m.retain(reinterpret_cast<Obj*>(e));
      a[0] = P(r);
      return nullptr;
    }
    case Rt::ArrReverse: { ArrObj* o = A(a[0]); NN(o); std::reverse(o->v.begin(), o->v.end()); m.retain(o); return nullptr; }
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
    case Rt::MapSet: {  // the key and the value are consumed: stored, or released when the key was already there
      MapObj* o = M(a[0]);
      NN(o);
      if (o->cls->keyKind == KeyKind::Str) NN(a[1]);
      std::int32_t e = o->t.find(a[1]);
      if (e >= 0) {
        Slot old = o->t.vals[static_cast<std::size_t>(e)];
        o->t.vals[static_cast<std::size_t>(e)] = a[2];
        if (o->cls->elemRef) m.releaseSlot(old);
        if (o->cls->keyRef) m.releaseSlot(a[1]);
      } else o->t.put(a[1], a[2]);
      m.retain(o);  // the result is a new reference to the same Map
      return nullptr;
    }
    case Rt::SetAdd: {
      MapObj* o = M(a[0]);
      NN(o);
      if (o->cls->keyKind == KeyKind::Str) NN(a[1]);
      if (o->t.find(a[1]) >= 0) { if (o->cls->keyRef) m.releaseSlot(a[1]); } else o->t.put(a[1], 0);
      m.retain(o);
      return nullptr;
    }
    case Rt::MapHas: case Rt::SetHas: { MapObj* o = M(a[0]); NN(o); if (o->cls->keyKind == KeyKind::Str) NN(a[1]); a[0] = boolSlot(o->t.find(a[1]) >= 0); return nullptr; }
    case Rt::MapDelete: case Rt::SetDelete: {
      MapObj* o = M(a[0]);
      NN(o);
      if (o->cls->keyKind == KeyKind::Str) NN(a[1]);
      std::int32_t e = o->t.find(a[1]);
      Slot key = 0, val = 0;
      if (e >= 0) { key = o->t.keys[static_cast<std::size_t>(e)]; if (o->t.hasVals) val = o->t.vals[static_cast<std::size_t>(e)]; o->t.erase(a[1]); }
      bool found = e >= 0;
      a[0] = boolSlot(found);
      if (found) { if (o->t.hasVals && o->cls->elemRef) m.releaseSlot(val); if (o->cls->keyRef) m.releaseSlot(key); }
      return nullptr;
    }
    case Rt::MapClear: case Rt::SetClear: {
      MapObj* o = M(a[0]);
      NN(o);
      Table old = std::move(o->t);
      o->t = Table();
      o->t.kk = old.kk; o->t.hasVals = old.hasVals;
      for (std::size_t i = 0; i < old.keys.size(); ++i) {
        if (old.dead[i]) continue;
        if (old.hasVals && o->cls->elemRef) m.releaseSlot(old.vals[i]);
        if (o->cls->keyRef) m.releaseSlot(old.keys[i]);
      }
      return nullptr;
    }
    case Rt::MapSize: case Rt::SetSize: { MapObj* o = M(a[0]); NN(o); a[0] = o->t.live; return nullptr; }
    case Rt::MapKeys: case Rt::MapValues: case Rt::SetValues: {
      MapObj* o = M(a[0]);
      NN(o);
      const Table& t = o->t;
      ArrObj* r = m.newArr(id == Rt::MapKeys ? o->cls->keysArray : o->cls->valuesArray);
      r->v.reserve(t.live);
      bool refs = id == Rt::MapValues ? o->cls->elemRef : o->cls->keyRef;
      for (std::size_t i = 0; i < t.keys.size(); ++i) {
        if (t.dead[i]) continue;
        Slot e = id == Rt::MapValues ? t.vals[i] : t.keys[i];
        if (refs) m.retain(reinterpret_cast<Obj*>(e));
        r->v.push_back(e);
      }
      a[0] = P(r);
      return nullptr;
    }
    case Rt::Count: break;
    default: break;  // the host entries (Rt::HostGfxFrames and after) were handled above
  }
#undef NN
  return "unknown runtime call";
}

}  // namespace zn::rt
