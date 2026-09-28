// console.log formatting in the style of Node's util.inspect / LLRT (RT-07): `[ 1, 2.5, 3 ]`,
// `Counter { value: 5 }`, `Map(1) { 'x' => 1 }`, nested strings quoted, depth limited to 2, entries on one line when
// they fit in 72 columns, ANSI colours on terminals. sim/zinc.mjs implements the same algorithm (byte-exact oracle).
#pragma once

namespace zrt {

struct Insp {
  bool color;
  int32_t depth = 0;
  const void* stack[16];   // objects being printed (cycle detection)
  int32_t sp = 0;
};
/** Pre-rendered entries of a container. */
struct InspParts {
  String items[101];
  int32_t n = 0;
  void add(StrBuilder& sb) { if (n < 101) items[n++] = sb.build(); }
};

inline void insp_paint(StrBuilder& sb, const Insp& in, const char* code, const char* text, uint32_t len) {
  if (in.color) sb.cstr(code);
  sb.raw(text, len);
  if (in.color) sb.cstr("\033[39m");
}
inline void insp_paint(StrBuilder& sb, const Insp& in, const char* code, StrBuilder& tmp) { insp_paint(sb, in, code, tmp.buf, tmp.len); }
// colours as Node: numbers/booleans yellow, strings green, null bold, undefined grey, special [..] cyan
#define ZRT_YELLOW "\033[33m"
#define ZRT_GREEN "\033[32m"
#define ZRT_GREY "\033[90m"
#define ZRT_CYAN "\033[36m"

/** Visible width: code points, ANSI escapes excluded. */
inline int32_t insp_width(const String& s) {
  int32_t w = 0;
  const char* p = s.ptr();
  uint32_t n = s.bytes();
  for (uint32_t i = 0; i < n; i++) {
    unsigned char c = (unsigned char)p[i];
    if (c == 0x1b) { while (i < n && p[i] != 'm') i++; continue; }
    if ((c & 0xC0) != 0x80) w++;
  }
  return w;
}
inline bool insp_multiline(const String& s) {
  for (uint32_t i = 0; i < s.bytes(); i++) if (s.ptr()[i] == '\n') return true;
  return false;
}
/**
 * Node's util.inspect layout (lib/internal/util/inspect.js: groupArrayElements + reduceToSingleString, compact 3,
 * breakLength 80): arrays of more than 6 short entries are grouped in aligned columns; otherwise the entries go on one
 * line when they fit, else one per line. `indent` is the nesting level x 2, `numeric` right-aligns grouped numbers.
 */
inline void insp_join(StrBuilder& sb, const char* prefix, const char* open, const char* close, InspParts& p, int32_t indent, bool numeric = false, bool grouping = false) {
  sb.cstr(prefix);
  if (p.n == 0) { sb.cstr(open); sb.cstr(close); return; }
  int32_t pw = 0; while (prefix[pw]) pw++;
  if (pw > 0) pw--;  // Node counts the base name without the separating space
  int32_t ow = 0; while (open[ow]) ow++;
  const int32_t entries = p.n;
  String rows[101];
  int32_t nrows = 0;
  int32_t outLen = p.n;
  const bool extra = grouping && p.n > 0 && p.items[p.n - 1].bytes() > 4 && __builtin_memcmp(p.items[p.n - 1].ptr(), "... ", 4) == 0;
  if (extra) outLen--;
  bool grouped = false;
  if (grouping && p.n > 6) {
    int32_t len[101], total = 0, maxLen = 0;
    for (int32_t i = 0; i < outLen; i++) { len[i] = insp_width(p.items[i]); total += len[i] + 2; if (len[i] > maxLen) maxLen = len[i]; }
    const int32_t actualMax = maxLen + 2;
    if (actualMax * 3 + indent < 80 && ((double)total / actualMax > 5 || maxLen <= 6)) {
      const double averageBias = __builtin_sqrt(actualMax - (double)total / p.n);
      const double biasedMax = __builtin_fmax(actualMax - 3 - averageBias, 1);
      int32_t columns = (int32_t)__builtin_round(__builtin_sqrt(2.5 * biasedMax * outLen) / biasedMax);
      const int32_t byWidth = (80 - indent) / actualMax;
      if (byWidth < columns) columns = byWidth;
      if (12 < columns) columns = 12;  // compact (3) x 4
      if (15 < columns) columns = 15;
      if (columns > 1) {
        int32_t colMax[16];
        for (int32_t c = 0; c < columns; c++) {
          int32_t w = 0;
          for (int32_t j = c; j < p.n; j += columns) if (j < outLen && len[j] > w) w = len[j];
          colMax[c] = w + 2;
        }
        for (int32_t i = 0; i < outLen; i += columns) {
          const int32_t max = i + columns < outLen ? i + columns : outLen;
          StrBuilder row;
          for (int32_t j = i; j < max; j++) {
            const bool last = j == max - 1;
            const int32_t target = colMax[j - i] - (last && numeric ? 2 : 0), w = len[j] + (last ? 0 : 2);
            if (last && !numeric) { to_s(row, p.items[j]); break; }
            if (numeric) for (int32_t k = w; k < target; k++) row.ch(' ');
            to_s(row, p.items[j]);
            if (!last) row.cstr(", ");
            if (!numeric) for (int32_t k = w; k < target; k++) row.ch(' ');
          }
          rows[nrows++] = row.build();
        }
        if (extra) rows[nrows++] = p.items[p.n - 1];
        grouped = true;
      }
    }
  }
  if (!grouped) { for (int32_t i = 0; i < p.n; i++) rows[i] = p.items[i]; nrows = p.n; }
  if (!grouped || entries == nrows) {
    // one line when it fits: start = entries + indentation + brace + prefix + 10, like Node
    int32_t total = nrows;
    bool multi = false;
    for (int32_t i = 0; i < nrows; i++) { total += insp_width(rows[i]); multi = multi || insp_multiline(rows[i]); }
    if (!grouped && !multi && total + nrows + indent + ow + pw + 10 <= 80) {
      sb.cstr(open); sb.ch(' ');
      for (int32_t i = 0; i < nrows; i++) { if (i) sb.cstr(", "); to_s(sb, rows[i]); }
      sb.ch(' '); sb.cstr(close);
      return;
    }
  }
  sb.cstr(open); sb.ch('\n');
  for (int32_t i = 0; i < nrows; i++) {
    sb.cstr("  ");
    const char* s = rows[i].ptr();
    for (uint32_t k = 0; k < rows[i].bytes(); k++) { sb.ch(s[k]); if (s[k] == '\n') sb.cstr("  "); }
    sb.cstr(i + 1 < nrows ? ",\n" : "\n");
  }
  sb.cstr(close);
}

// ---- values ----
inline void insp(StrBuilder& sb, Insp& in, double v) {
  StrBuilder t;
  str_num(t, v);  // ponytail: -0 prints as 0 (literals are not always doubles in the generated C++)
  insp_paint(sb, in, ZRT_YELLOW, t);
}
inline void insp(StrBuilder& sb, Insp& in, float v) { insp(sb, in, (double)v); }
inline void insp(StrBuilder& sb, Insp& in, int64_t v) { StrBuilder t; to_s(t, v); insp_paint(sb, in, ZRT_YELLOW, t); }
inline void insp(StrBuilder& sb, Insp& in, int32_t v) { insp(sb, in, (int64_t)v); }
inline void insp(StrBuilder& sb, Insp& in, uint32_t v) { insp(sb, in, (int64_t)v); }
inline void insp(StrBuilder& sb, Insp& in, uint64_t v) { insp(sb, in, (int64_t)v); }
template<class T, class = typename enable_if<is_intlike<T>::value>::type> void insp(StrBuilder& sb, Insp& in, T v) { insp(sb, in, (int64_t)v); }
inline void insp(StrBuilder& sb, Insp& in, bool v) { insp_paint(sb, in, ZRT_YELLOW, v ? "true" : "false", v ? 4 : 5); }
/** Nested strings: single-quoted with JS escapes. */
inline void insp(StrBuilder& sb, Insp& in, const String& v) {
  StrBuilder t;
  t.ch('\'');
  const char* p = v.ptr();
  for (uint32_t i = 0; i < v.bytes(); i++) {
    char c = p[i];
    if (c == '\'') t.cstr("\\'"); else if (c == '\\') t.cstr("\\\\"); else if (c == '\n') t.cstr("\\n");
    else if (c == '\t') t.cstr("\\t"); else if (c == '\r') t.cstr("\\r"); else t.ch(c);
  }
  t.ch('\'');
  insp_paint(sb, in, ZRT_GREEN, t);
}
inline void insp_null(StrBuilder& sb, Insp& in) { if (in.color) sb.cstr("\033[1m"); sb.cstr("null"); if (in.color) sb.cstr("\033[22m"); }
inline void insp(StrBuilder& sb, Insp& in, decltype(nullptr)) { insp_null(sb, in); }
template<class T> void insp(StrBuilder& sb, Insp& in, const Ref<T>& v) { if (v.p) v.p->zrt_inspect(sb, in); else insp_null(sb, in); }
template<class R, class... A> void insp(StrBuilder& sb, Insp& in, const Fn<R(A...)>&) { insp_paint(sb, in, ZRT_CYAN, "[Function (anonymous)]", 22); }
// Node right-aligns grouped arrays whose values are all numbers
template<class T> inline bool insp_num(const T&) { return false; }
inline bool insp_num(double) { return true; }
inline bool insp_num(float) { return true; }
inline bool insp_num(int32_t) { return true; }
inline bool insp_num(uint32_t) { return true; }
inline bool insp_num(int64_t) { return true; }
inline bool insp_num(uint64_t) { return true; }
inline bool insp_num(int16_t) { return true; }
inline bool insp_num(uint16_t) { return true; }
inline bool insp_num(int8_t) { return true; }
inline bool insp_num(uint8_t) { return true; }
template<int F> inline bool insp_num(const Fx<F>&) { return true; }
template<class T> void insp(StrBuilder& sb, Insp& in, const Array<T>& a) {
  if (!a.a) { insp_null(sb, in); return; }
  if (in.depth > 2) { insp_paint(sb, in, ZRT_CYAN, "[Array]", 7); return; }
  InspParts p;
  in.depth++;
  int32_t n = a.length(), shown = n > 100 ? 100 : n;
  for (int32_t i = 0; i < shown; i++) { StrBuilder e; insp(e, in, a.get(i)); p.add(e); }
  in.depth--;
  if (n > shown) { StrBuilder e; e.cstr("... "); to_s(e, n - shown); e.cstr(n - shown == 1 ? " more item" : " more items"); p.add(e); }
  bool numeric = true;
  for (int32_t i = 0; i < shown && numeric; i++) numeric = insp_num(a.get(i));
  insp_join(sb, "", "[", "]", p, in.depth * 2, numeric, true);
}
template<class K, class V> void insp(StrBuilder& sb, Insp& in, const Map<K, V>& m) {
  if (!m.m) { insp_null(sb, in); return; }
  StrBuilder pre; pre.cstr("Map("); to_s(pre, m.size()); pre.cstr(") "); pre.ch('\0');
  if (in.depth > 2) { insp_paint(sb, in, ZRT_CYAN, "[Map]", 5); return; }
  InspParts p;
  in.depth++;
  for (int32_t i = 0; i < m.slots() && p.n < 100; i++) if (m.live_at(i)) { StrBuilder e; insp(e, in, m.key_at(i)); e.cstr(" => "); insp(e, in, m.val_at(i)); p.add(e); }
  in.depth--;
  insp_join(sb, pre.buf, "{", "}", p, in.depth * 2);
}
template<class T> void insp(StrBuilder& sb, Insp& in, const Set<T>& s) {
  if (!s.m.m) { insp_null(sb, in); return; }
  StrBuilder pre; pre.cstr("Set("); to_s(pre, s.size()); pre.cstr(") "); pre.ch('\0');
  if (in.depth > 2) { insp_paint(sb, in, ZRT_CYAN, "[Set]", 5); return; }
  InspParts p;
  in.depth++;
  for (int32_t i = 0; i < s.slots() && p.n < 100; i++) if (s.live_at(i)) { StrBuilder e; insp(e, in, s.key_at(i)); p.add(e); }
  in.depth--;
  insp_join(sb, pre.buf, "{", "}", p, in.depth * 2);
}

/** Object bodies (generated per class: zrt_inspect -> insp_object). `name` is null for plain objects (interfaces). */
template<class O> void insp_object(StrBuilder& sb, Insp& in, const O* self, const char* name) {
  for (int32_t i = 0; i < in.sp; i++) if (in.stack[i] == self) { insp_paint(sb, in, ZRT_CYAN, "[Circular]", 10); return; }
  if (in.depth > 2) {
    StrBuilder t; t.ch('['); t.cstr(name ? name : "Object"); t.ch(']');
    insp_paint(sb, in, ZRT_CYAN, t);
    return;
  }
  InspParts p;
  if (in.sp < 16) in.stack[in.sp++] = self;
  in.depth++;
  self->zrt_ifields(p, in);
  in.depth--;
  in.sp--;
  StrBuilder pre; if (name) { pre.cstr(name); pre.ch(' '); } pre.ch('\0');
  insp_join(sb, pre.buf, "{", "}", p, in.depth * 2);
}
template<class T> void insp_field(InspParts& p, Insp& in, const char* key, const T& v) {
  StrBuilder e; e.cstr(key); e.cstr(": "); insp(e, in, v); p.add(e);
}

/** Top-level console arguments: strings as they are, everything else inspected. */
template<class T> void log_arg(StrBuilder& sb, bool color, const T& v) { Insp in; in.color = color; insp(sb, in, v); }
inline void log_arg(StrBuilder& sb, bool, const String& v) { to_s(sb, v); }
inline void log_arg(StrBuilder& sb, bool, const char* v) { sb.cstr(v); }
inline void log_arg(StrBuilder& sb, bool color, decltype(nullptr)) { Insp in; in.color = color; insp_null(sb, in); }
bool log_color();
template<class... A> void log_plain(const A&... a) {
  StrBuilder sb; bool first = true;
  ((first ? (void)0 : sb.ch(' '), first = false, log_arg(sb, false, a)), ...);
  log_flush(sb);
}

}  // namespace zrt
