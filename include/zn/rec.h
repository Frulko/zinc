#pragma once
// Native records (ZN-850): the bytes a record of a native spec crosses the native ABI in, on the u8[] letter. Plain C++ and the standard library only
// (no engine type, no Zinc heap), so a plugin's worker thread can encode its results and the engines can decode them.
//
// Wire: little-endian, no alignment, no keys. d: 8 bytes IEEE; i, u: 4 bytes; b: 1 byte; s and B: u32 byte count then the bytes (UTF-8, no NUL);
// *T (a list): u32 count then the items; ?T (optional): u8 0 or 1, then T when 1; a record: u32 body length then its fields in declaration order.
// Evolution, append-only: a field that starts past the end of its record's body takes its default (0, false, "", [], null, a record of defaults),
// and the bytes after the fields a reader knows are skipped. So a record grown by a trailing field reads in an older reader, and the other way round.
//
// Schema text (what the engines decode by, written by the frontend from the spec's interfaces): a record `{name:T,name:T}`, T one of d i u b s B,
// `*T`, `?T` or a nested record.
#include <cstdint>
#include <cstring>
#include <optional>
#include <string>
#include <type_traits>
#include <vector>

namespace zn::rec {

struct Writer {
  std::vector<std::uint8_t> out;
  void raw(const void* p, std::size_t n) { const auto* b = static_cast<const std::uint8_t*>(p); out.insert(out.end(), b, b + n); }
  void u8(std::uint8_t v) { out.push_back(v); }
  void u32(std::uint32_t v) { std::uint8_t b[4] = {std::uint8_t(v), std::uint8_t(v >> 8), std::uint8_t(v >> 16), std::uint8_t(v >> 24)}; raw(b, 4); }
  void i32(std::int32_t v) { u32(static_cast<std::uint32_t>(v)); }
  void f64(double v) { std::uint64_t x; std::memcpy(&x, &v, 8); u32(static_cast<std::uint32_t>(x)); u32(static_cast<std::uint32_t>(x >> 32)); }
  void bytes(const void* p, std::size_t n) { u32(static_cast<std::uint32_t>(n)); raw(p, n); }
  std::size_t begin() { std::size_t at = out.size(); u32(0); return at; }   // a record: its length is written by end()
  void end(std::size_t at) { std::uint32_t n = static_cast<std::uint32_t>(out.size() - at - 4); for (int k = 0; k < 4; ++k) out[at + k] = std::uint8_t(n >> (8 * k)); }
};

// Reads [p, end); every read fails (false) rather than reading past the end.
struct Reader {
  const std::uint8_t* p = nullptr;
  const std::uint8_t* end = nullptr;
  bool more() const { return p < end; }
  bool u8(std::uint8_t& v) { if (end - p < 1) return false; v = *p++; return true; }
  bool u32(std::uint32_t& v) { if (end - p < 4) return false; v = std::uint32_t(p[0]) | std::uint32_t(p[1]) << 8 | std::uint32_t(p[2]) << 16 | std::uint32_t(p[3]) << 24; p += 4; return true; }
  bool i32(std::int32_t& v) { std::uint32_t u; if (!u32(u)) return false; v = static_cast<std::int32_t>(u); return true; }
  bool f64(double& v) { std::uint32_t lo, hi; if (!u32(lo) || !u32(hi)) return false; std::uint64_t x = std::uint64_t(hi) << 32 | lo; std::memcpy(&v, &x, 8); return true; }
  bool bytes(const std::uint8_t*& at, std::uint32_t& n) { if (!u32(n) || std::uint64_t(end - p) < n) return false; at = p; p += n; return true; }
  // A record: `body` reads its fields; this reader moves past it, so the fields a newer writer appended are skipped.
  bool record(Reader& body) { const std::uint8_t* at; std::uint32_t n; if (!bytes(at, n)) return false; body = Reader{at, at + n}; return true; }
};

// The C++ side of each schema letter. A record type of a generated header has encode(Writer&) and decode(Reader&, T&).
inline void put(Writer& w, double v) { w.f64(v); }
inline void put(Writer& w, std::int32_t v) { w.i32(v); }
inline void put(Writer& w, std::uint32_t v) { w.u32(v); }
inline void put(Writer& w, bool v) { w.u8(v ? 1 : 0); }
inline void put(Writer& w, const std::string& v) { w.bytes(v.data(), v.size()); }
inline void put(Writer& w, const std::vector<std::uint8_t>& v) { w.bytes(v.data(), v.size()); }   // B: the same bytes as a list of u8
template <class T> void put(Writer& w, const std::optional<T>& v) { w.u8(v ? 1 : 0); if (v) put(w, *v); }
template <class T> void put(Writer& w, const std::vector<T>& v) { w.u32(static_cast<std::uint32_t>(v.size())); for (const T& x : v) put(w, x); }
template <class T, class = decltype(std::declval<const T&>().encode(std::declval<Writer&>()))> void put(Writer& w, const T& v) { v.encode(w); }

inline bool get(Reader& r, double& v) { return r.f64(v); }
inline bool get(Reader& r, std::int32_t& v) { return r.i32(v); }
inline bool get(Reader& r, std::uint32_t& v) { return r.u32(v); }
inline bool get(Reader& r, bool& v) { std::uint8_t b; if (!r.u8(b)) return false; v = b != 0; return true; }
inline bool get(Reader& r, std::string& v) { const std::uint8_t* at; std::uint32_t n; if (!r.bytes(at, n)) return false; v.assign(reinterpret_cast<const char*>(at), n); return true; }
inline bool get(Reader& r, std::vector<std::uint8_t>& v) { const std::uint8_t* at; std::uint32_t n; if (!r.bytes(at, n)) return false; v.assign(at, at + n); return true; }
template <class T> bool get(Reader& r, std::optional<T>& v) { std::uint8_t b; if (!r.u8(b)) return false; v.reset(); if (!b) return true; v.emplace(); return get(r, *v); }
template <class T> bool get(Reader& r, std::vector<T>& v) {
  std::uint32_t n;
  if (!r.u32(n) || n > std::uint64_t(r.end - r.p)) return false;   // every item is at least one byte: a count past the end is malformed
  v.clear();
  v.resize(n);
  for (T& x : v) if (!get(r, x)) return false;
  return true;
}
template <class T, class = decltype(T::decode(std::declval<Reader&>(), std::declval<T&>()))> bool get(Reader& r, T& v) { return T::decode(r, v); }

// The fields of a record body, in declaration order: one that starts past the end keeps its default.
inline bool fields(Reader&) { return true; }
template <class F, class... R> bool fields(Reader& b, F& f, R&... rest) { if (!b.more()) return true; return get(b, f) && fields(b, rest...); }

// A whole value (a record, a list of records...) as the bytes of a call or of a promise's result, and back.
template <class T> std::vector<std::uint8_t> encode(const T& v) { Writer w; put(w, v); return std::move(w.out); }
template <class T> bool decode(const std::uint8_t* p, std::size_t n, T& out) { Reader r{p, p + n}; return get(r, out); }

// A schema text as a tree, for the engines that decode by it (src/rt/rtcalls.cpp, src/qjs/native_js.cpp). k: d i u b s B, '*' (elem), '?' (elem),
// '{' (fields, in order).
struct Schema {
  char k = 0;
  std::vector<std::string> names;
  std::vector<Schema> kids;   // the fields of a record; the one element of * and ?
};
inline bool parse(const char*& s, const char* end, Schema& out, int depth = 0) {
  if (s >= end || depth > 64) return false;
  out = Schema{*s++, {}, {}};
  switch (out.k) {
    case 'd': case 'i': case 'u': case 'b': case 's': case 'B': return true;
    case '*': case '?': out.kids.emplace_back(); return parse(s, end, out.kids.back(), depth + 1);
    case '{':
      while (s < end && *s != '}') {
        const char* colon = static_cast<const char*>(std::memchr(s, ':', static_cast<std::size_t>(end - s)));
        if (!colon || colon == s) return false;
        out.names.emplace_back(s, colon);
        s = colon + 1;
        out.kids.emplace_back();
        if (!parse(s, end, out.kids.back(), depth + 1)) return false;
        if (s < end && *s == ',') ++s;
      }
      if (s >= end) return false;
      ++s;
      return true;
    default: return false;
  }
}
inline bool parse(const std::string& text, Schema& out) { const char* s = text.data(); return parse(s, s + text.size(), out) && s == text.data() + text.size(); }

}  // namespace zn::rec
