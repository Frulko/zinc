// zrt/dyn — `Dyn`, the one dynamic type of the gradual typing profile (spec section 9, DYN-02..09).
// Header-only and included at the end of zrt.h: programs that never use Dyn pay nothing.
// Representation (DYN-03 `nanbox`): 8 bytes. A double is stored as itself (NaNs made canonical); the other values
// live in the negative quiet-NaN space, upper 16 bits = tag, lower 48 bits = pointer or payload.
// ponytail: the 4-byte `word` representation (DYN-03 default on ps1/esp32/ps2) is not written; those targets
// default to the strict profile, where Dyn only carries `unknown` values. Add it if a small target goes gradual.
// ponytail: no per-site inline caches (DYN-04): dynamic objects are insertion-ordered String-keyed maps (DYN-05)
// and typed objects answer through the virtual zrt_get/zrt_set generated per class. Keys are hashed, not interned.
// Runtime errors on Dyn (bad conversion, reading a property of null) panic with the message JS would print for
// an uncaught TypeError; they are not catchable (same policy as array bounds, docs/decisions/0006).
#pragma once

extern "C" double zrt_host_strtod(const char* s, int* consumed);

namespace zrt {

struct Dyn {
  static constexpr uint64_t UNDEF = 0xFFF9ull << 48, NUL = 0xFFFAull << 48, BOOL = 0xFFFBull << 48,
    STR = 0xFFFCull << 48, ARR = 0xFFFDull << 48, OBJ = 0xFFFEull << 48, TAG = 0xFFFFull << 48, PAY = ~TAG;
  uint64_t v = UNDEF;
  // explicit: a Dyn overload must never capture another type through an implicit conversion
  Dyn() {}
  explicit Dyn(decltype(nullptr)) : v(NUL) {}
  explicit Dyn(bool b) : v(BOOL | (b ? 1u : 0u)) {}
  explicit Dyn(double d) { if (d != d) v = 0x7FF8000000000000ull; else __builtin_memcpy(&v, &d, 8); }
  explicit Dyn(float d) : Dyn((double)d) {}
  explicit Dyn(int32_t d) : Dyn((double)d) {}
  explicit Dyn(uint32_t d) : Dyn((double)d) {}
  explicit Dyn(int64_t d) : Dyn((double)d) {}
  explicit Dyn(uint64_t d) : Dyn((double)d) {}
  template<class T, class = typename enable_if<is_intlike<T>::value>::type> explicit Dyn(T d) : Dyn((double)d) {}
  template<int F> explicit Dyn(Fx<F> d) : Dyn((double)d) {}
  explicit Dyn(const Unit&) {}
  explicit Dyn(const String& s) : v(STR | (uint64_t)(uintptr_t)s.s) { sretain(s.s); }
  explicit Dyn(const Array<Dyn>& a) : v(a.a ? ARR | (uint64_t)(uintptr_t)a.a : NUL) { if (a.a) a.a->rc++; }
  template<class T> explicit Dyn(const Ref<T>& r) : v(r.p ? OBJ | (uint64_t)(uintptr_t)static_cast<Object*>(r.p) : NUL) { retain(r.p); }
  Dyn(const Dyn& o) : v(o.v) { hold(); }
  Dyn(Dyn&& o) : v(o.v) { o.v = UNDEF; }
  ~Dyn() { drop(); }
  Dyn& operator=(Dyn o) { uint64_t t = v; v = o.v; o.v = t; return *this; }

  /** 0 for a number, else one of the tags. */
  uint64_t tag() const { return v < UNDEF ? 0 : v & TAG; }
  bool is_num() const { return v < UNDEF; }
  bool nullish() const { return v == UNDEF || v == NUL; }
  void* ptr() const { return (void*)(uintptr_t)(v & PAY); }
  double num() const { double d; __builtin_memcpy(&d, &v, 8); return d; }
  String str() const { return String((StrObj*)ptr()); }
  Array<Dyn> arr() const { Array<Dyn> a; a.a = (ArrObj<Dyn>*)ptr(); if (a.a) a.a->rc++; return a; }
  Object* obj() const { return (Object*)ptr(); }
  void hold() const {
    switch (v < UNDEF ? 0 : v & TAG) {
      case STR: sretain((StrObj*)ptr()); break;
      case ARR: ((ArrObj<Dyn>*)ptr())->rc++; break;
      case OBJ: retain((Object*)ptr()); break;
    }
  }
  void drop() {
    switch (v < UNDEF ? 0 : v & TAG) {
      case STR: srelease((StrObj*)ptr()); break;
      case ARR: Array<Dyn>::drop((ArrObj<Dyn>*)ptr()); break;
      case OBJ: release((Object*)ptr()); break;
    }
  }
};

// Dynamic objects (JSON, literals typed `any`): insertion-ordered dictionary (DYN-05).
// ponytail: JS lists integer-like keys first; here every key keeps insertion order.
struct DynObj : Object {
  static constexpr uint32_t ZRT_CID = 0xFFFF10;
  Map<String, Dyn> m = Map<String, Dyn>::make();
  bool zrt_isa(uint32_t id) const override { return id == ZRT_CID; }
  bool zrt_get(const String& k, Dyn& out) const override { int32_t e = m.find(k); if (e < 0) return false; out = m.m->vals[e]; return true; }
  bool zrt_set(const String& k, const Dyn& v) override { m.set(k, v); return true; }
  void zrt_json(StrBuilder& sb) const override;
  void zrt_ifields(InspParts& p, Insp& in) const override;
};

namespace dynlit {
inline StrObj undefined_ = {IMMORTAL, 9, 9, 1, "undefined", nullptr};
inline StrObj object_ = {IMMORTAL, 6, 6, 1, "object", nullptr};
inline StrObj boolean_ = {IMMORTAL, 7, 7, 1, "boolean", nullptr};
inline StrObj number_ = {IMMORTAL, 6, 6, 1, "number", nullptr};
inline StrObj string_ = {IMMORTAL, 6, 6, 1, "string", nullptr};
inline StrObj length_ = {IMMORTAL, 6, 6, 1, "length", nullptr};
}

inline bool key_is(const String& k, const char* s, uint32_t n) { return k.bytes() == n && __builtin_memcmp(k.ptr(), s, n) == 0; }

inline String dyn_typeof(const Dyn& d) {
  switch (d.tag()) {
    case 0: return String(&dynlit::number_);
    case Dyn::UNDEF: return String(&dynlit::undefined_);
    case Dyn::BOOL: return String(&dynlit::boolean_);
    case Dyn::STR: return String(&dynlit::string_);
    default: return String(&dynlit::object_);
  }
}
/** typeof, with null and arrays told apart: used by error messages (same words as sim/zinc.mjs). */
inline const char* dyn_kind(const Dyn& d) {
  switch (d.tag()) {
    case 0: return "number"; case Dyn::UNDEF: return "undefined"; case Dyn::NUL: return "null"; case Dyn::BOOL: return "boolean";
    case Dyn::STR: return "string"; case Dyn::ARR: return "array"; default: return "object";
  }
}

inline Dyn dyn_obj() { return Dyn(make<DynObj>()); }
inline bool dyn_nullish(const Dyn& d) { return d.nullish(); }
inline bool dyn_is_null(const Dyn& d) { return d.v == Dyn::NUL; }
inline bool dyn_is_undef(const Dyn& d) { return d.v == Dyn::UNDEF; }
inline bool dyn_is_array(const Dyn& d) { return d.tag() == Dyn::ARR; }
inline bool operator==(const Dyn& d, decltype(nullptr)) { return d.nullish(); }
inline bool operator!=(const Dyn& d, decltype(nullptr)) { return !d.nullish(); }
template<class T> bool isa(const Dyn& d) { return d.tag() == Dyn::OBJ && d.obj()->zrt_isa(T::ZRT_CID); }

inline bool truthy(const Dyn& d) {
  switch (d.tag()) {
    case 0: return truthy(d.num());
    case Dyn::UNDEF: case Dyn::NUL: return false;
    case Dyn::BOOL: return d.v & 1;
    case Dyn::STR: return d.ptr() && ((StrObj*)d.ptr())->len;
    default: return true;
  }
}

// String(x)
inline void to_s(StrBuilder& sb, const Dyn& d) {
  switch (d.tag()) {
    case 0: str_num(sb, d.num()); break;
    case Dyn::UNDEF: sb.cstr("undefined"); break;
    case Dyn::NUL: sb.cstr("null"); break;
    case Dyn::BOOL: sb.cstr(d.v & 1 ? "true" : "false"); break;
    case Dyn::STR: to_s(sb, d.str()); break;
    case Dyn::ARR: {
      ArrObj<Dyn>* a = (ArrObj<Dyn>*)d.ptr();
      for (int32_t i = 0; i < a->len; i++) { if (i) sb.ch(','); if (!a->data[i].nullish()) to_s(sb, a->data[i]); }
      break;
    }
    default: d.obj()->zrt_str(sb);
  }
}
template<> inline String Array<Dyn>::join(const String& sep) const {
  StrBuilder sb;
  for (int32_t i = 0; i < length(); i++) { if (i) to_s(sb, sep); if (!a->data[i].nullish()) to_s(sb, a->data[i]); }
  return sb.build();
}
inline String dyn_str_of(const Dyn& d) { StrBuilder sb; to_s(sb, d); return sb.build(); }

// JSON: `stringify` drops undefined object members like JSON.stringify; console output prints them as null (sim/zinc.mjs)
inline void dyn_json(StrBuilder& sb, const Dyn& d, bool stringify);
inline void dyn_obj_json(StrBuilder& sb, const DynObj* o, bool stringify) {
  sb.ch('{');
  bool first = true;
  for (int32_t i = 0; i < o->m.slots(); i++) {
    if (!o->m.live_at(i) || (stringify && o->m.m->vals[i].v == Dyn::UNDEF)) continue;
    if (!first) sb.ch(',');
    first = false;
    json_str(sb, o->m.m->keys[i]); sb.ch(':'); dyn_json(sb, o->m.m->vals[i], stringify);
  }
  sb.ch('}');
}
inline void dyn_json(StrBuilder& sb, const Dyn& d, bool stringify) {
  switch (d.tag()) {
    case 0: json(sb, d.num()); break;
    case Dyn::UNDEF: case Dyn::NUL: sb.cstr("null"); break;
    case Dyn::BOOL: sb.cstr(d.v & 1 ? "true" : "false"); break;
    case Dyn::STR: json_str(sb, d.str()); break;
    case Dyn::ARR: {
      ArrObj<Dyn>* a = (ArrObj<Dyn>*)d.ptr();
      sb.ch('[');
      for (int32_t i = 0; i < a->len; i++) { if (i) sb.ch(','); dyn_json(sb, a->data[i], stringify); }
      sb.ch(']');
      break;
    }
    default:
      if (d.obj()->zrt_isa(DynObj::ZRT_CID)) dyn_obj_json(sb, (const DynObj*)d.obj(), stringify);
      else d.obj()->zrt_json(sb);
  }
}
inline void DynObj::zrt_json(StrBuilder& sb) const { dyn_obj_json(sb, this, false); }
inline void json(StrBuilder& sb, const Dyn& d) { dyn_json(sb, d, false); }
inline String dyn_stringify(const Dyn& d) { StrBuilder sb; if (d.v == Dyn::UNDEF) sb.cstr("undefined"); else dyn_json(sb, d, true); return sb.build(); }
/** Keys print bare when they are identifiers, quoted otherwise (like Node). */
inline void insp_key(StrBuilder& e, const String& k) {
  bool ident = k.bytes() > 0;
  for (uint32_t i = 0; i < k.bytes() && ident; i++) {
    char c = k.ptr()[i];
    ident = c == '_' || c == '$' || (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (i > 0 && c >= '0' && c <= '9');
  }
  if (ident) to_s(e, k); else { e.ch('\''); to_s(e, k); e.ch('\''); }
}
inline bool insp_num(const Dyn& d) { return d.is_num(); }
inline void insp(StrBuilder& sb, Insp& in, const Dyn& d) {
  switch (d.tag()) {
    case 0: insp(sb, in, d.num()); return;
    case Dyn::UNDEF: if (in.color) sb.cstr("\033[90m"); sb.cstr("undefined"); if (in.color) sb.cstr("\033[39m"); return;
    case Dyn::NUL: insp_null(sb, in); return;
    case Dyn::BOOL: insp(sb, in, (bool)(d.v & 1)); return;
    case Dyn::STR: insp(sb, in, d.str()); return;
    case Dyn::ARR: insp(sb, in, d.arr()); return;
    default: d.obj()->zrt_inspect(sb, in);
  }
}
inline void DynObj::zrt_ifields(InspParts& p, Insp& in) const {
  for (int32_t i = 0; i < m.slots() && p.n < 100; i++) if (m.live_at(i)) {
    StrBuilder e; insp_key(e, m.m->keys[i]); e.cstr(": "); insp(e, in, m.m->vals[i]); p.add(e);
  }
}
inline void log_arg(StrBuilder& sb, bool color, const Dyn& d) {
  if (d.tag() == Dyn::STR) to_s(sb, d); else { Insp in; in.color = color; insp(sb, in, d); }
}

// ---------- errors ----------
[[noreturn]] inline void dyn_panic(StrBuilder& sb) { sb.ch('\0'); panic(sb.buf); }
[[noreturn]] inline void dyn_bad_conv(const Dyn& d, const char* to) {
  StrBuilder sb; sb.cstr("Uncaught TypeError: cannot convert Dyn ("); sb.cstr(dyn_kind(d)); sb.cstr(") to "); sb.cstr(to); dyn_panic(sb);
}
[[noreturn]] inline void dyn_bad_access(const Dyn& o, const String& k, bool set) {
  StrBuilder sb;
  sb.cstr(set ? "Uncaught TypeError: Cannot set properties of " : "Uncaught TypeError: Cannot read properties of ");
  sb.cstr(o.v == Dyn::NUL ? "null" : "undefined"); sb.cstr(set ? " (setting '" : " (reading '"); to_s(sb, k); sb.cstr("')");
  dyn_panic(sb);
}

// ---------- DYN-07: checked conversions to static types ----------
inline double dyn_to_num(const Dyn& d) { if (!d.is_num()) dyn_bad_conv(d, "number"); return d.num(); }
inline bool dyn_to_bool(const Dyn& d) { if (d.tag() != Dyn::BOOL) dyn_bad_conv(d, "boolean"); return d.v & 1; }
inline String dyn_to_str(const Dyn& d) { if (d.tag() != Dyn::STR) dyn_bad_conv(d, "string"); return d.str(); }
inline Array<Dyn> dyn_to_arr(const Dyn& d) {
  if (d.nullish()) return Array<Dyn>();
  if (d.tag() != Dyn::ARR) dyn_bad_conv(d, "array");
  return d.arr();
}
/** Dyn -> T[]: a checked copy (the typed array does not alias the dynamic one). */
template<class T, class F> Array<T> dyn_to_arr_of(const Dyn& d, F f) {
  Array<Dyn> a = dyn_to_arr(d);
  if (!a.a) return Array<T>();
  Array<T> r = Array<T>::with_cap(a.length());
  for (int32_t i = 0; i < a.length(); i++) r.push_raw(f(a.a->data[i]));
  return r;
}
template<class T> Ref<T> dyn_to_obj(const Dyn& d, const char* name) {
  if (d.nullish()) return Ref<T>();
  if (!isa<T>(d)) dyn_bad_conv(d, name);
  return Ref<T>(static_cast<T*>(d.obj()));
}
/** Dyn -> interface/struct: the generated converter reads the fields of any object (dynamic or typed). */
inline void dyn_need_obj(const Dyn& d, const char* name) { if (d.tag() != Dyn::OBJ) dyn_bad_conv(d, name); }
inline Array<Dyn> dyn_iter(const Dyn& d) { if (d.tag() != Dyn::ARR) dyn_bad_conv(d, "array"); return d.arr(); }

// ---------- DYN-06: ECMAScript operators ----------
/** Length of a StrDecimalLiteral at p (0 if none). */
inline uint32_t dyn_dec_len(const char* p, uint32_t n) {
  uint32_t i = 0, dig = 0;
  if (i < n && (p[i] == '+' || p[i] == '-')) i++;
  while (i < n && p[i] >= '0' && p[i] <= '9') { i++; dig++; }
  if (i < n && p[i] == '.') { i++; while (i < n && p[i] >= '0' && p[i] <= '9') { i++; dig++; } }
  if (!dig) return 0;
  if (i < n && (p[i] == 'e' || p[i] == 'E')) {
    uint32_t j = i + 1;
    if (j < n && (p[j] == '+' || p[j] == '-')) j++;
    if (j < n && p[j] >= '0' && p[j] <= '9') { while (j < n && p[j] >= '0' && p[j] <= '9') j++; i = j; }
  }
  return i;
}
inline double dyn_strtod(const char* p, uint32_t n) {
  char small[64];
  char* b = n < sizeof small ? small : (char*)alloc(n + 1);
  __builtin_memcpy(b, p, n); b[n] = 0;
  int used = 0;
  double v = zrt_host_strtod(b, &used);
  if (b != small) mfree(b);
  return v;
}
/** Number(s) */
inline double str_tonum(const String& s) {
  String t = s.trim();
  const char* p = t.ptr(); uint32_t n = t.bytes();
  if (!n) return 0;
  if (n > 2 && p[0] == '0' && ((p[1] | 32) == 'x' || (p[1] | 32) == 'o' || (p[1] | 32) == 'b')) {
    int radix = (p[1] | 32) == 'x' ? 16 : (p[1] | 32) == 'o' ? 8 : 2;
    double v = 0;
    for (uint32_t i = 2; i < n; i++) {
      char c = p[i]; int d = c >= '0' && c <= '9' ? c - '0' : (c | 32) >= 'a' && (c | 32) <= 'f' ? (c | 32) - 'a' + 10 : 99;
      if (d >= radix) return NaN;
      v = v * radix + d;
    }
    return v;
  }
  uint32_t sign = (p[0] == '+' || p[0] == '-') ? 1 : 0;
  if (n - sign == 8 && __builtin_memcmp(p + sign, "Infinity", 8) == 0) return p[0] == '-' ? -Inf : Inf;
  return dyn_dec_len(p, n) == n ? dyn_strtod(p, n) : NaN;
}
/** ToPrimitive: objects and arrays become their String(x). */
inline Dyn dyn_prim(const Dyn& d) { return d.tag() == Dyn::ARR || d.tag() == Dyn::OBJ ? Dyn(dyn_str_of(d)) : d; }
/** ToNumber */
inline double dyn_tonum(const Dyn& d) {
  switch (d.tag()) {
    case 0: return d.num();
    case Dyn::UNDEF: return NaN;
    case Dyn::NUL: return 0;
    case Dyn::BOOL: return d.v & 1 ? 1 : 0;
    case Dyn::STR: return str_tonum(d.str());
    default: return str_tonum(dyn_str_of(d));
  }
}
inline Dyn dyn_add(const Dyn& a, const Dyn& b) {
  if (a.is_num() && b.is_num()) return Dyn(a.num() + b.num());  // fast path
  Dyn x = dyn_prim(a), y = dyn_prim(b);
  if (x.tag() == Dyn::STR || y.tag() == Dyn::STR) { StrBuilder sb; to_s(sb, x); to_s(sb, y); return Dyn(sb.build()); }
  return Dyn(dyn_tonum(x) + dyn_tonum(y));
}
/** Compound assignment and ++/-- on Dyn: op is the operator's first character ('+', '-', '*', '/', '%', 'p' for **). */
inline Dyn dyn_arith(char op, const Dyn& a, const Dyn& b) {
  if (op == '+') return dyn_add(a, b);
  double x = dyn_tonum(a), y = dyn_tonum(b);
  switch (op) {
    case '-': return Dyn(x - y);
    case '*': return Dyn(x * y);
    case '/': return Dyn(x / y);
    case '%': return Dyn(math::fmod(x, y));
    default: return Dyn(math::pow(x, y));
  }
}
/** -1, 0, 1, or 2 when unordered (NaN) */
inline int dyn_cmp(const Dyn& a, const Dyn& b) {
  if (a.is_num() && b.is_num()) { double p = a.num(), q = b.num(); return p != p || q != q ? 2 : p < q ? -1 : p > q ? 1 : 0; }
  Dyn x = dyn_prim(a), y = dyn_prim(b);
  if (x.tag() == Dyn::STR && y.tag() == Dyn::STR) { int c = str_cmp(x.str(), y.str()); return c < 0 ? -1 : c > 0 ? 1 : 0; }
  double p = dyn_tonum(x), q = dyn_tonum(y);
  return p != p || q != q ? 2 : p < q ? -1 : p > q ? 1 : 0;
}
inline bool dyn_lt(const Dyn& a, const Dyn& b) { return dyn_cmp(a, b) == -1; }
inline bool dyn_gt(const Dyn& a, const Dyn& b) { return dyn_cmp(a, b) == 1; }
inline bool dyn_le(const Dyn& a, const Dyn& b) { int c = dyn_cmp(a, b); return c == -1 || c == 0; }
inline bool dyn_ge(const Dyn& a, const Dyn& b) { int c = dyn_cmp(a, b); return c == 1 || c == 0; }
/** === */
inline bool dyn_seq(const Dyn& a, const Dyn& b) {
  if (a.is_num() || b.is_num()) return a.is_num() && b.is_num() && a.num() == b.num();
  if (a.tag() != b.tag()) return false;
  if (a.tag() == Dyn::STR) return a.str() == b.str();
  return a.v == b.v;
}
inline bool operator==(const Dyn& a, const Dyn& b) { return dyn_seq(a, b); }
inline bool operator!=(const Dyn& a, const Dyn& b) { return !dyn_seq(a, b); }
// Map<any, V> / Set<any> keys: SameValueZero
inline bool same(const Dyn& a, const Dyn& b) { return dyn_seq(a, b) || (a.is_num() && b.is_num() && a.num() != a.num() && b.num() != b.num()); }
inline uint32_t hash(const Dyn& d) { return d.is_num() ? hash(d.num()) : d.tag() == Dyn::STR ? hash(d.str()) : hash_u64(d.v); }
/** == */
inline bool dyn_leq(const Dyn& a, const Dyn& b) {
  if (a.nullish() || b.nullish()) return a.nullish() && b.nullish();
  if (a.tag() == b.tag()) return dyn_seq(a, b);
  if (a.tag() == Dyn::BOOL) return dyn_leq(Dyn(dyn_tonum(a)), b);
  if (b.tag() == Dyn::BOOL) return dyn_leq(a, Dyn(dyn_tonum(b)));
  bool ao = a.tag() == Dyn::ARR || a.tag() == Dyn::OBJ, bo = b.tag() == Dyn::ARR || b.tag() == Dyn::OBJ;
  if (ao && bo) return false;
  if (ao || bo) return dyn_leq(dyn_prim(a), dyn_prim(b));
  return dyn_tonum(a) == dyn_tonum(b);  // number vs string
}

// ---------- property access (DYN-04/05) ----------
inline Dyn dyn_get(const Dyn& o, const String& k) {
  switch (o.tag()) {
    case Dyn::UNDEF: case Dyn::NUL: dyn_bad_access(o, k, false);
    case Dyn::STR: return key_is(k, "length", 6) ? Dyn(o.str().length()) : Dyn();
    case Dyn::ARR: return key_is(k, "length", 6) ? Dyn(((ArrObj<Dyn>*)o.ptr())->len) : Dyn();
    case Dyn::OBJ: { Dyn r; o.obj()->zrt_get(k, r); return r; }
    default: return Dyn();
  }
}
inline Dyn dyn_set(const Dyn& o, const String& k, const Dyn& v) {
  if (o.nullish()) dyn_bad_access(o, k, true);
  if (o.tag() == Dyn::OBJ && o.obj()->zrt_set(k, v)) return v;
  StrBuilder sb;
  if (o.tag() == Dyn::OBJ || o.tag() == Dyn::ARR) { sb.cstr("Uncaught TypeError: Cannot add property "); to_s(sb, k); sb.cstr(", object is not extensible"); }
  else { sb.cstr("Uncaught TypeError: Cannot create property '"); to_s(sb, k); sb.cstr("' on "); sb.cstr(dyn_kind(o)); sb.cstr(" '"); to_s(sb, o); sb.ch('\''); }
  dyn_panic(sb);
}
/** Integer index of a number key, or -1. */
inline int32_t dyn_idx(const Dyn& k) {
  if (!k.is_num()) return -1;
  double d = k.num(); int32_t i = (int32_t)d;
  return d >= 0 && d < 2147483647.0 && (double)i == d ? i : -1;
}
inline Dyn dyn_index(const Dyn& o, const Dyn& k) {
  int32_t i = dyn_idx(k);
  if (i >= 0 && o.tag() == Dyn::ARR) { ArrObj<Dyn>* a = (ArrObj<Dyn>*)o.ptr(); return i < a->len ? a->data[i] : Dyn(); }
  if (i >= 0 && o.tag() == Dyn::STR) { String s = o.str(); return i < s.length() ? Dyn(s.at(i)) : Dyn(); }
  return dyn_get(o, k.tag() == Dyn::STR ? k.str() : dyn_str_of(k));
}
inline Dyn dyn_set_index(const Dyn& o, const Dyn& k, const Dyn& v) {
  int32_t i = dyn_idx(k);
  if (o.tag() == Dyn::ARR && k.is_num()) {
    Array<Dyn> a = o.arr();
    if (i < 0 || i > a.length()) panic("Uncaught RangeError: arrays with holes are not supported");
    a.set(i, v);
    return v;
  }
  return dyn_set(o, k.tag() == Dyn::STR ? k.str() : dyn_str_of(k), v);
}
/** `key in o` */
inline bool dyn_has(const Dyn& o, const Dyn& k) {
  if (o.tag() == Dyn::ARR) { int32_t i = dyn_idx(k); return (i >= 0 && i < ((ArrObj<Dyn>*)o.ptr())->len) || (k.tag() == Dyn::STR && key_is(k.str(), "length", 6)); }
  if (o.tag() != Dyn::OBJ) {
    StrBuilder sb; sb.cstr("Uncaught TypeError: Cannot use 'in' operator to search for '"); to_s(sb, k); sb.cstr("' in "); to_s(sb, o); dyn_panic(sb);
  }
  Dyn r;
  return o.obj()->zrt_get(k.tag() == Dyn::STR ? k.str() : dyn_str_of(k), r);
}
/** o[k] op= rhs, o[k]++ (post: returns the old value as a number). */
template<class F> Dyn dyn_update(const Dyn& o, const Dyn& k, F f, bool post) {
  Dyn old = dyn_index(o, k);
  Dyn nv = f(old);
  dyn_set_index(o, k, nv);
  return post ? Dyn(dyn_tonum(old)) : nv;
}
inline Dyn dyn_post(Dyn& x, double delta) { double o = dyn_tonum(x); x = Dyn(o + delta); return Dyn(o); }
inline Dyn dyn_pre(Dyn& x, double delta) { x = Dyn(dyn_tonum(x) + delta); return x; }

// ---------- DYN-09: JSON.parse without a type ----------
struct JsonParser {
  const char* p; const char* e; bool ok = true;
  void ws() { while (p < e && (*p == ' ' || *p == '\t' || *p == '\n' || *p == '\r')) p++; }
  bool lit(const char* s, uint32_t n) { if ((uint32_t)(e - p) < n || __builtin_memcmp(p, s, n)) return ok = false; p += n; return true; }
  static void utf8(StrBuilder& sb, uint32_t c) {
    if (c < 0x80) sb.ch((char)c);
    else if (c < 0x800) { sb.ch((char)(0xC0 | c >> 6)); sb.ch((char)(0x80 | (c & 63))); }
    else if (c < 0x10000) { sb.ch((char)(0xE0 | c >> 12)); sb.ch((char)(0x80 | (c >> 6 & 63))); sb.ch((char)(0x80 | (c & 63))); }
    else { sb.ch((char)(0xF0 | c >> 18)); sb.ch((char)(0x80 | (c >> 12 & 63))); sb.ch((char)(0x80 | (c >> 6 & 63))); sb.ch((char)(0x80 | (c & 63))); }
  }
  int32_t hex4() {
    if (e - p < 4) return -1;
    int32_t v = 0;
    for (int i = 0; i < 4; i++) { char c = p[i] | 32; int d = c >= '0' && c <= '9' ? c - '0' : c >= 'a' && c <= 'f' ? c - 'a' + 10 : -1; if (d < 0) return -1; v = v * 16 + d; }
    p += 4;
    return v;
  }
  String str() {
    p++;  // opening quote
    StrBuilder sb;
    for (;;) {
      if (p >= e) { ok = false; return String(); }
      char c = *p++;
      if (c == '"') break;
      if ((uint8_t)c < 0x20) { ok = false; return String(); }
      if (c != '\\') { sb.ch(c); continue; }
      if (p >= e) { ok = false; return String(); }
      char x = *p++;
      switch (x) {
        case '"': sb.ch('"'); break; case '\\': sb.ch('\\'); break; case '/': sb.ch('/'); break;
        case 'b': sb.ch('\b'); break; case 'f': sb.ch('\f'); break; case 'n': sb.ch('\n'); break;
        case 'r': sb.ch('\r'); break; case 't': sb.ch('\t'); break;
        case 'u': {
          int32_t u = hex4();
          if (u < 0) { ok = false; return String(); }
          if (u >= 0xD800 && u < 0xDC00 && e - p >= 6 && p[0] == '\\' && p[1] == 'u') {
            const char* save = p; p += 2;
            int32_t lo = hex4();
            if (lo >= 0xDC00 && lo < 0xE000) u = 0x10000 + ((u - 0xD800) << 10) + (lo - 0xDC00); else p = save;
          }
          utf8(sb, (uint32_t)u);  // ponytail: a lone surrogate is stored as its 3-byte (WTF-8) form
          break;
        }
        default: ok = false; return String();
      }
    }
    return sb.build();
  }
  Dyn number() {
    const char* s = p;
    if (p < e && *p == '-') p++;
    if (p < e && *p == '0') p++;
    else if (p < e && *p >= '1' && *p <= '9') while (p < e && *p >= '0' && *p <= '9') p++;
    else { ok = false; return Dyn(); }
    bool simple = true;
    if (p < e && *p == '.') { p++; simple = false; if (p >= e || *p < '0' || *p > '9') { ok = false; return Dyn(); } while (p < e && *p >= '0' && *p <= '9') p++; }
    if (p < e && (*p == 'e' || *p == 'E')) {
      p++; simple = false;
      if (p < e && (*p == '+' || *p == '-')) p++;
      if (p >= e || *p < '0' || *p > '9') { ok = false; return Dyn(); }
      while (p < e && *p >= '0' && *p <= '9') p++;
    }
    uint32_t n = (uint32_t)(p - s);
    if (simple && n <= 15) {  // exact in a double
      double v = 0; const char* q = s + (*s == '-');
      for (; q < p; q++) v = v * 10 + (*q - '0');
      return Dyn(*s == '-' ? -v : v);
    }
    return Dyn(dyn_strtod(s, n));
  }
  Dyn value(int depth) {
    ws();
    if (p >= e || depth > 512) { ok = false; return Dyn(); }
    switch (*p) {
      case '{': {
        p++;
        Dyn o = dyn_obj();
        ws();
        if (p < e && *p == '}') { p++; return o; }
        for (;;) {
          ws();
          if (p >= e || *p != '"') { ok = false; return Dyn(); }
          String k = str();
          ws();
          if (!ok || p >= e || *p != ':') { ok = false; return Dyn(); }
          p++;
          Dyn v = value(depth + 1);
          if (!ok) return Dyn();
          o.obj()->zrt_set(k, v);
          ws();
          if (p < e && *p == ',') { p++; continue; }
          if (p < e && *p == '}') { p++; return o; }
          ok = false; return Dyn();
        }
      }
      case '[': {
        p++;
        Array<Dyn> a = Array<Dyn>::with_cap(0);
        ws();
        if (p < e && *p == ']') { p++; return Dyn(a); }
        for (;;) {
          Dyn v = value(depth + 1);
          if (!ok) return Dyn();
          a.push_raw(v);
          ws();
          if (p < e && *p == ',') { p++; continue; }
          if (p < e && *p == ']') { p++; return Dyn(a); }
          ok = false; return Dyn();
        }
      }
      case '"': { String s = str(); return ok ? Dyn(s) : Dyn(); }
      case 't': return lit("true", 4) ? Dyn(true) : Dyn();
      case 'f': return lit("false", 5) ? Dyn(false) : Dyn();
      case 'n': return lit("null", 4) ? Dyn(nullptr) : Dyn();
      default: return number();
    }
  }
};
/** Invalid input throws a catchable Error (the call is a @throws call site, RT-05). */
inline Dyn json_parse(const String& s) {
  JsonParser j{s.ptr(), s.ptr() + s.bytes()};
  Dyn r = j.value(0);
  j.ws();
  if (!j.ok || j.p != j.e) { g_err = make<Error>(String::from("JSON.parse: invalid JSON", 24)); return Dyn(); }
  return r;
}

}  // namespace zrt
