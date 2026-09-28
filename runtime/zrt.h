// zrt — Zinc runtime. C++17 freestanding subset: no STL, no exceptions, no RTTI (RT-01, RT-02).
#pragma once
#include <stdint.h>
#include <stddef.h>
#include "hal.h"

static_assert(__BYTE_ORDER__ == __ORDER_LITTLE_ENDIAN__, "Zinc targets are little-endian");

inline void* operator new(size_t, void* p) noexcept { return p; }

namespace zrt {

#if __SIZEOF_POINTER__ == 8
typedef int64_t isize; typedef uint64_t usize;
#else
typedef int32_t isize; typedef uint32_t usize;
#endif

// ---------- tiny type traits (no <type_traits>) ----------
template<class A, class B> struct is_same { static constexpr bool value = false; };
template<class A> struct is_same<A, A> { static constexpr bool value = true; };
template<class T> struct rm_ref { typedef T type; };
template<class T> struct rm_ref<T&> { typedef T type; };
template<class T> struct rm_ref<T&&> { typedef T type; };
template<class T> struct rm_cv { typedef T type; };
template<class T> struct rm_cv<const T> { typedef T type; };
template<class T> using decay_t = typename rm_cv<typename rm_ref<T>::type>::type;
template<bool B, class T = void> struct enable_if {};
template<class T> struct enable_if<true, T> { typedef T type; };
template<class T> T&& declval();
// integer types not covered by the fixed-width overloads (e.g. `int` where int32_t is `long` on the PS2 EE)
template<class T> struct is_intlike { static constexpr bool value = false; };
#define ZRT_INTLIKE(T) template<> struct is_intlike<T> { static constexpr bool value = true; };
ZRT_INTLIKE(signed char) ZRT_INTLIKE(unsigned char) ZRT_INTLIKE(short) ZRT_INTLIKE(unsigned short) ZRT_INTLIKE(int) ZRT_INTLIKE(unsigned)
ZRT_INTLIKE(long) ZRT_INTLIKE(unsigned long) ZRT_INTLIKE(long long) ZRT_INTLIKE(unsigned long long)
#undef ZRT_INTLIKE

// ---------- memory ----------
extern uint32_t live_objects;
extern uint32_t alloc_count;
void* alloc(size_t n);
void mfree(void* p);
[[noreturn]] void panic(const char* msg);
[[noreturn]] void panic_at(const char* msg, const char* file, int line);

constexpr uint32_t IMMORTAL = 0xFFFFFFu;  // MEM-02: saturated count = immortal

struct StrBuilder;
struct String;
struct Dyn;

// Base of every class instance (MEM-02). rc starts at 1 during construction and is adopted by make().
struct Insp;
struct InspParts;
struct Object {
  uint32_t rc = 1;   // strong count; 0 after destruction (weak targets stay allocated)
  uint32_t wc = 0;   // weak references (MEM-13)
  Object() {}
  Object(const Object&) : rc(1), wc(0) {}  // copies (arena.promote) start fresh
  Object& operator=(const Object&) { return *this; }
  virtual ~Object() {}
  virtual bool zrt_isa(uint32_t) const { return false; }
  virtual void zrt_json(StrBuilder& sb) const;
  virtual void zrt_str(StrBuilder& sb) const;
  virtual void zrt_fields(StrBuilder&, bool&) const {}
  // console.log (zrt_inspect.h): Node-style `Name { field: value }`; generated per class
  virtual void zrt_inspect(StrBuilder& sb, Insp& in) const;
  virtual void zrt_ifields(InspParts&, Insp&) const {}
  // property access through Dyn (zrt_dyn.h): generated per class only when the program uses Dyn
  virtual bool zrt_get(const String&, Dyn&) const { return false; }
  virtual bool zrt_set(const String&, const Dyn&) { return false; }
  /** Destroys and frees; pooled classes override to return the slot (MEM-09). */
  virtual void zrt_delete();
};

inline void retain(Object* o) { if (o && o->rc < IMMORTAL) o->rc++; }
void destroy(Object* o);
inline void release(Object* o) { if (o && o->rc < IMMORTAL && --o->rc == 0) destroy(o); }

// Counted reference. ponytail: RAII-based counting, not compiler-inserted (docs/decisions/0001).
// Note: Fn objects (closures) count as live objects too.
template<class T> struct Ref {
  T* p = nullptr;
  constexpr Ref() {}
  constexpr Ref(decltype(nullptr)) {}
  Ref(T* x) : p(x) { retain(x); }
  Ref(const Ref& o) : p(o.p) { retain(p); }
  Ref(Ref&& o) : p(o.p) { o.p = nullptr; }
  template<class U> Ref(const Ref<U>& o) : p(o.p) { retain(p); }
  ~Ref() { release(p); }
  Ref& operator=(Ref o) { T* t = p; p = o.p; o.p = t; return *this; }
  T* operator->() const { if (!p) panic("null dereference"); return p; }
  T& operator*() const { if (!p) panic("null dereference"); return *p; }
  T* get() const { return p; }
  explicit operator bool() const { return p != nullptr; }
  static Ref adopt(T* x) { Ref r; r.p = x; return r; }
};
template<class A, class B> bool operator==(const Ref<A>& a, const Ref<B>& b) { return (const void*)a.p == (const void*)b.p; }
template<class A, class B> bool operator!=(const Ref<A>& a, const Ref<B>& b) { return !(a == b); }
template<class A> bool operator==(const Ref<A>& a, decltype(nullptr)) { return a.p == nullptr; }
template<class A> bool operator!=(const Ref<A>& a, decltype(nullptr)) { return a.p != nullptr; }

// Allocation cascade (MEM-01): arena if one is active, then class pool, then the heap.
void* arena_take(size_t n);
template<class T> auto obj_take(int) -> decltype(T::zrt_take()) { return T::zrt_take(); }
template<class T> void* obj_take(long) { return alloc(sizeof(T)); }
template<class T, class... A> Ref<T> make(A&&... a) {
  void* m = arena_take(sizeof(T));
  if (!m) m = obj_take<T>(0);
  live_objects++;
  return Ref<T>::adopt(new (m) T(static_cast<A&&>(a)...));
}
template<class T> T* heap_clone(const T& src) { void* m = alloc(sizeof(T)); live_objects++; return new (m) T(src); }
// DYN-07: checked downcast
template<class T, class U> Ref<T> cast(const Ref<U>& u) {
  if (u.p && !u.p->zrt_isa(T::ZRT_CID)) panic("TypeError: invalid downcast");
  return Ref<T>(static_cast<T*>(u.p));
}
template<class T, class U> bool isa(const Ref<U>& u) { return u.p && u.p->zrt_isa(T::ZRT_CID); }

// Mutable variable captured by a closure (LNG-13: capture by cell when reassigned).
struct Error;
extern Ref<Error> g_err;  // pending error (RT-05), checked after calls that may throw

template<class T> struct Cell : Object { T v; Cell(T x) : v(x) {} };
template<class T> Ref<Cell<T>> cell(T x) { return make<Cell<T>>(x); }

// ---------- strings (LNG-06, MEM-20) ----------
// Immutable UTF-8. Literals are constant-initialized and immortal; slices share the owner buffer.
struct StrObj {
  uint32_t rc;
  uint32_t len;      // bytes
  int32_t u16len;    // UTF-16 length
  uint32_t ascii;
  const char* data;
  StrObj* owner;     // slice parent, or null
};
void str_destroy(StrObj* s);
inline void sretain(StrObj* s) { if (s && s->rc < IMMORTAL) s->rc++; }
inline void srelease(StrObj* s) { if (s && s->rc < IMMORTAL && --s->rc == 0) str_destroy(s); }

template<class T> struct Array;

struct String {
  StrObj* s = nullptr;  // null == ""
  constexpr String() {}
  constexpr String(decltype(nullptr)) {}
  explicit String(StrObj* lit) : s(lit) { sretain(s); }
  String(const String& o) : s(o.s) { sretain(s); }
  String(String&& o) : s(o.s) { o.s = nullptr; }
  ~String() { srelease(s); }
  String& operator=(String o) { StrObj* t = s; s = o.s; o.s = t; return *this; }
  static String adopt(StrObj* x) { String r; r.s = x; return r; }
  static String from(const char* p, uint32_t n);

  const char* ptr() const { return s ? s->data : ""; }
  uint32_t bytes() const { return s ? s->len : 0; }
  bool is_ascii() const { return !s || s->ascii; }

  int32_t length() const { return s ? s->u16len : 0; }
  int32_t charCodeAt(int32_t i) const;
  String at(int32_t i) const;
  String slice(int32_t a) const { return slice(a, length()); }
  String slice(int32_t a, int32_t b) const;
  String substring(int32_t a) const { return substring(a, length()); }
  String substring(int32_t a, int32_t b) const;
  int32_t indexOf(const String& n, int32_t from = 0) const;
  bool includes(const String& n) const { return indexOf(n) >= 0; }
  bool startsWith(const String& n) const;
  bool endsWith(const String& n) const;
  Array<String> split(const String& sep) const;
  String trim() const;
  String padStart(int32_t n) const;
  String padStart(int32_t n, const String& f) const;
  String padEnd(int32_t n) const;
  String padEnd(int32_t n, const String& f) const;
  String repeat(int32_t n) const;
  String toUpperCase() const;
  String toLowerCase() const;
  String replace(const String& a, const String& b) const;
  String replaceAll(const String& a, const String& b) const;
};
bool operator==(const String& a, const String& b);
inline bool operator!=(const String& a, const String& b) { return !(a == b); }
int str_cmp(const String& a, const String& b);
String from_char_code(int32_t c);

// Growable byte buffer used by concatenation, templates and formatting.
struct StrBuilder {
  char* buf = nullptr;
  uint32_t len = 0, cap = 0;
  StrBuilder() {}
  StrBuilder(const StrBuilder&) = delete;
  ~StrBuilder() { if (buf) mfree(buf); }
  void raw(const char* p, uint32_t n);
  void ch(char c) { raw(&c, 1); }
  void cstr(const char* p) { uint32_t n = 0; while (p[n]) n++; raw(p, n); }
  String build();
};

// String(x) semantics
void str_num(StrBuilder& sb, double v);
inline void to_s(StrBuilder& sb, double v) { str_num(sb, v); }
inline void to_s(StrBuilder& sb, float v) { str_num(sb, (double)v); }
void to_s(StrBuilder& sb, int64_t v);
inline void to_s(StrBuilder& sb, int32_t v) { to_s(sb, (int64_t)v); }
inline void to_s(StrBuilder& sb, uint32_t v) { to_s(sb, (int64_t)v); }
inline void to_s(StrBuilder& sb, uint64_t v) { to_s(sb, (int64_t)v); }
inline void to_s(StrBuilder& sb, bool v) { sb.cstr(v ? "true" : "false"); }
inline void to_s(StrBuilder& sb, const String& v) { sb.raw(v.ptr(), v.bytes()); }
inline void to_s(StrBuilder& sb, const char* v) { sb.cstr(v); }
template<class T, class = typename enable_if<is_intlike<T>::value>::type> void to_s(StrBuilder& sb, T v) { to_s(sb, (int64_t)v); }
template<class T> void to_s(StrBuilder& sb, const Ref<T>& v) { if (v.p) v.p->zrt_str(sb); else sb.cstr("null"); }
template<class T> void to_s(StrBuilder& sb, const Array<T>& v);

// JSON compact (RT-07)
void json_str(StrBuilder& sb, const String& v);
inline void json(StrBuilder& sb, double v) { if (v - v == 0) str_num(sb, v); else sb.cstr("null"); }
inline void json(StrBuilder& sb, float v) { json(sb, (double)v); }
inline void json(StrBuilder& sb, int32_t v) { to_s(sb, v); }
inline void json(StrBuilder& sb, uint32_t v) { to_s(sb, v); }
inline void json(StrBuilder& sb, int64_t v) { to_s(sb, v); }
inline void json(StrBuilder& sb, uint64_t v) { to_s(sb, v); }
inline void json(StrBuilder& sb, bool v) { to_s(sb, v); }
inline void json(StrBuilder& sb, const String& v) { json_str(sb, v); }
template<class T, class = typename enable_if<is_intlike<T>::value>::type> void json(StrBuilder& sb, T v) { to_s(sb, (int64_t)v); }
template<class T> void json(StrBuilder& sb, const Ref<T>& v) { if (v.p) v.p->zrt_json(sb); else sb.cstr("null"); }
template<class T> void json(StrBuilder& sb, const Array<T>& v);
template<class T> void json_field(StrBuilder& sb, bool& first, const char* name, const T& v) {
  if (!first) sb.ch(',');
  first = false;
  sb.ch('"'); sb.cstr(name); sb.cstr("\":"); json(sb, v);
}

void log_flush(StrBuilder& sb);
template<class... A> void log_plain(const A&... a);  // defined in zrt_inspect.h

template<class... A> String cat(const A&... a) { StrBuilder sb; (to_s(sb, a), ...); return sb.build(); }

// ---------- numbers ----------
namespace math {
inline double abs(double x) { return __builtin_fabs(x); }
inline double floor(double x) { return __builtin_floor(x); }
inline double ceil(double x) { return __builtin_ceil(x); }
inline double trunc(double x) { return __builtin_trunc(x); }
inline double round(double x) { double f = __builtin_floor(x); return (x - f >= 0.5) ? f + 1 : f; }  // JS rounds .5 up
inline double sign(double x) { return x > 0 ? 1 : x < 0 ? -1 : x; }
inline double sqrt(double x) { return __builtin_sqrt(x); }
inline double pow(double x, double y) { return __builtin_pow(x, y); }
inline double sin(double x) { return __builtin_sin(x); }
inline double cos(double x) { return __builtin_cos(x); }
inline double tan(double x) { return __builtin_tan(x); }
inline double atan2(double y, double x) { return __builtin_atan2(y, x); }
inline double exp(double x) { return __builtin_exp(x); }
inline double log(double x) { return __builtin_log(x); }
inline double hypot(double a, double b) { return __builtin_hypot(a, b); }
inline double fmod(double a, double b) { return __builtin_fmod(a, b); }
inline double min(double a, double b) { return (a != a || b != b) ? a + b : (a < b || (a == b && __builtin_signbit(a))) ? a : b; }
inline double max(double a, double b) { return (a != a || b != b) ? a + b : (a > b || (a == b && !__builtin_signbit(a))) ? a : b; }
inline float fround(double x) { return (float)x; }
inline int32_t imul(int32_t a, int32_t b) { return (int32_t)((uint32_t)a * (uint32_t)b); }
inline int32_t clz32(int32_t x) { return x == 0 ? 32 : __builtin_clz((uint32_t)x); }
double random();
void seed(uint32_t s);
}
constexpr double PI = 3.141592653589793;
constexpr double E = 2.718281828459045;
constexpr double NaN = __builtin_nan("");
constexpr double Inf = __builtin_inf();

// JS ToInt32/ToUint32 family, then narrowed (LNG-05).
template<class T> inline T cvt(double x) {
  if (!(x - x == 0)) return 0;
  double t = __builtin_fmod(__builtin_trunc(x), 4294967296.0);
  if (t < 0) t += 4294967296.0;
  return (T)(uint32_t)t;
}
template<> inline float cvt<float>(double x) { return (float)x; }
template<> inline double cvt<double>(double x) { return x; }
template<> inline int64_t cvt<int64_t>(double x) { return (x - x == 0) ? (int64_t)x : 0; }
template<> inline uint64_t cvt<uint64_t>(double x) { return (x - x == 0 && x >= 0) ? (uint64_t)x : 0; }

inline double idiv(double a, double b) { if (b == 0) panic("integer division by zero"); return a / b; }
template<class T> inline T imod(T a, T b) { if (b == 0) panic("integer division by zero"); return a % b; }
inline int32_t shl(int32_t a, int32_t b) { return (int32_t)((uint32_t)a << (b & 31)); }
inline int32_t sar(int32_t a, int32_t b) { return a >> (b & 31); }
inline uint32_t shr(int32_t a, int32_t b) { return (uint32_t)a >> (b & 31); }

// truthiness
inline bool truthy(bool v) { return v; }
inline bool truthy(double v) { return v == v && v != 0; }
inline bool truthy(float v) { return v == v && v != 0; }
inline bool truthy(int32_t v) { return v != 0; }
inline bool truthy(uint32_t v) { return v != 0; }
inline bool truthy(int64_t v) { return v != 0; }
inline bool truthy(uint64_t v) { return v != 0; }
inline bool truthy(const String& v) { return v.bytes() != 0; }
template<class T, class = typename enable_if<is_intlike<T>::value>::type> inline bool truthy(T v) { return v != 0; }
template<class T> inline bool truthy(const Ref<T>& v) { return v.p != nullptr; }

inline bool is_nan(double v) { return v != v; }
inline bool is_finite(double v) { return v - v == 0; }
inline bool is_integer(double v) { return is_finite(v) && __builtin_trunc(v) == v; }
double parse_float(const String& s);
double parse_int(const String& s, int32_t radix = 10);
String to_fixed(double v, int32_t digits);
double now_ms();

// ---------- closures ----------
template<class Sig> struct FnObj;
template<class R, class... A> struct FnObj<R(A...)> : Object { virtual R call(A... a) = 0; };
template<class L, class R, class... A> struct FnImpl : FnObj<R(A...)> {
  L l;
  FnImpl(const L& x) : l(x) {}
  R call(A... a) override {
    if constexpr (is_same<R, void>::value) l(a...); else return l(a...);
  }
};
template<class Sig> struct Fn;
template<class R, class... A> struct Fn<R(A...)> {
  Ref<FnObj<R(A...)>> o;
  Fn() {}
  Fn(decltype(nullptr)) {}
  template<class L, class = typename enable_if<!is_same<decay_t<L>, Fn>::value>::type,
           class = decltype(declval<L&>()(declval<A>()...))>
  Fn(const L& l) : o(Ref<FnObj<R(A...)>>::adopt((live_objects++, new (alloc(sizeof(FnImpl<L, R, A...>))) FnImpl<L, R, A...>(l)))) {}
  R operator()(A... a) const { return o->call(a...); }
  explicit operator bool() const { return (bool)o; }
};
template<class R, class... A> bool operator==(const Fn<R(A...)>& f, decltype(nullptr)) { return !f.o; }
template<class R, class... A> bool operator!=(const Fn<R(A...)>& f, decltype(nullptr)) { return (bool)f.o; }
template<class R, class... A> inline bool truthy(const Fn<R(A...)>& f) { return (bool)f.o; }
template<class R, class... A> void json(StrBuilder& sb, const Fn<R(A...)>&) { sb.cstr("null"); }
template<class R, class... A> void to_s(StrBuilder& sb, const Fn<R(A...)>&) { sb.cstr("function"); }

// Callbacks may declare fewer parameters than JS passes (v, i).
template<class F, class A, class B> auto cb2(F& f, const A& a, const B& b, int) -> decltype(f(a, b)) { return f(a, b); }
template<class F, class A, class B> auto cb2(F& f, const A& a, const B&, long) -> decltype(f(a)) { return f(a); }
template<class F, class A, class B, class C> auto cb3(F& f, const A& a, const B& b, const C& c, int) -> decltype(f(a, b, c)) { return f(a, b, c); }
template<class F, class A, class B, class C> auto cb3(F& f, const A& a, const B& b, const C&, long) -> decltype(f(a, b)) { return f(a, b); }

// ---------- arrays (LNG-07) ----------
template<class X> inline bool is_neg(const X& x) { return x < 0; }
template<int F> struct Fx;
template<int F> inline bool is_neg(const Fx<F>& x) { return x.v < 0; }
template<class T> struct ArrObj { uint32_t rc; int32_t len, cap; T* data; };

template<class T> struct Array {
  ArrObj<T>* a = nullptr;
  constexpr Array() {}
  constexpr Array(decltype(nullptr)) {}
  Array(const Array& o) : a(o.a) { if (a) a->rc++; }
  Array(Array&& o) : a(o.a) { o.a = nullptr; }
  ~Array() { drop(a); }
  Array& operator=(Array o) { ArrObj<T>* t = a; a = o.a; o.a = t; return *this; }

  static void drop(ArrObj<T>* x) {
    if (!x || --x->rc) return;
    for (int32_t i = 0; i < x->len; i++) x->data[i].~T();
    if (x->data) mfree(x->data);
    mfree(x);
    live_objects--;
  }
  static Array with_cap(int32_t cap) {
    Array r; r.a = (ArrObj<T>*)alloc(sizeof(ArrObj<T>)); live_objects++;
    r.a->rc = 1; r.a->len = 0; r.a->cap = cap; r.a->data = cap ? (T*)alloc(sizeof(T) * (size_t)cap) : nullptr;
    return r;
  }
  template<class... X> static Array of(const X&... xs) { Array r = with_cap((int32_t)sizeof...(xs)); (r.push_raw(T(xs)), ...); return r; }

  ArrObj<T>* obj() const { if (!a) panic("null array"); return a; }
  void grow(int32_t need) const {
    ArrObj<T>* o = obj();
    if (need <= o->cap) return;
    int32_t nc = o->cap < 4 ? 4 : o->cap * 2; if (nc < need) nc = need;
    T* nd = (T*)alloc(sizeof(T) * (size_t)nc);
    for (int32_t i = 0; i < o->len; i++) { new (&nd[i]) T(static_cast<T&&>(o->data[i])); o->data[i].~T(); }
    if (o->data) mfree(o->data);
    o->data = nd; o->cap = nc;
  }
  void push_raw(const T& v) const { grow(obj()->len + 1); new (&a->data[a->len]) T(v); a->len++; }

  int32_t length() const { return obj()->len; }
  void set_length(int32_t n) const {
    ArrObj<T>* o = obj();
    if (n > o->len) panic("array length can only shrink (no holes)");
    while (o->len > n) o->data[--o->len].~T();
  }
  T& ref(int32_t i) const { ArrObj<T>* o = obj(); if ((uint32_t)i >= (uint32_t)o->len) panic("array index out of bounds"); return o->data[i]; }
  T& ref(double i) const { return ref(idx(i)); }
  static int32_t idx(double i) { int32_t k = (int32_t)i; if ((double)k != i) panic("non-integer array index"); return k; }
  T get(int32_t i) const { return ref(i); }
  T get(double i) const { return ref(idx(i)); }
  template<class I> T get(I i) const { return ref((int32_t)i); }
  void set(int32_t i, const T& v) const { if (i == obj()->len) push_raw(v); else ref(i) = v; }
  void set(double i, const T& v) const { set(idx(i), v); }
  template<class I> void set(I i, const T& v) const { set((int32_t)i, v); }

  int32_t push(const T& v) const { push_raw(v); return a->len; }
  int32_t push_all(const Array& o) const { int32_t n = o.length(); for (int32_t i = 0; i < n; i++) push_raw(o.a->data[i]); return a->len; }
  T pop() const { ArrObj<T>* o = obj(); if (!o->len) return T(); T v = static_cast<T&&>(o->data[o->len - 1]); o->data[--o->len].~T(); return v; }
  T shift() const {
    ArrObj<T>* o = obj(); if (!o->len) return T();
    T v = static_cast<T&&>(o->data[0]);
    for (int32_t i = 1; i < o->len; i++) o->data[i - 1] = static_cast<T&&>(o->data[i]);
    o->data[--o->len].~T();
    return v;
  }
  int32_t unshift(const T& v) const {
    push_raw(v);
    for (int32_t i = a->len - 1; i > 0; i--) a->data[i] = static_cast<T&&>(a->data[i - 1]);
    a->data[0] = v;
    return a->len;
  }
  static int32_t clampi(int32_t i, int32_t n) { if (i < 0) { i += n; if (i < 0) i = 0; } return i > n ? n : i; }
  Array slice() const { return slice(0, length()); }
  Array slice(int32_t s) const { return slice(s, length()); }
  Array slice(int32_t s, int32_t e) const {
    int32_t n = length(); s = clampi(s, n); e = clampi(e, n);
    Array r = with_cap(e > s ? e - s : 0);
    for (int32_t i = s; i < e; i++) r.push_raw(a->data[i]);
    return r;
  }
  Array splice(int32_t s, int32_t cnt) const {
    int32_t n = length(); s = clampi(s, n); if (cnt < 0) cnt = 0; if (cnt > n - s) cnt = n - s;
    Array r = slice(s, s + cnt);
    for (int32_t i = s; i + cnt < n; i++) a->data[i] = static_cast<T&&>(a->data[i + cnt]);
    set_length(n - cnt);
    return r;
  }
  int32_t indexOf(const T& v) const { ArrObj<T>* o = obj(); for (int32_t i = 0; i < o->len; i++) if (o->data[i] == v) return i; return -1; }
  bool includes(const T& v) const { return indexOf(v) >= 0; }
  T at(int32_t i) const { int32_t n = length(); if (i < 0) i += n; if (i < 0 || i >= n) return T(); return a->data[i]; }
  template<class F> T find(F f) const { for (int32_t i = 0; i < length() && !g_err.p; i++) if (cb2(f, a->data[i], i, 0)) return a->data[i]; return T(); }
  template<class F> int32_t findIndex(F f) const { for (int32_t i = 0; i < length() && !g_err.p; i++) if (cb2(f, a->data[i], i, 0)) return i; return -1; }
  template<class F> bool some(F f) const { for (int32_t i = 0; i < length() && !g_err.p; i++) if (cb2(f, a->data[i], i, 0)) return true; return false; }
  template<class F> bool every(F f) const { for (int32_t i = 0; i < length() && !g_err.p; i++) if (!cb2(f, a->data[i], i, 0)) return false; return true; }
  template<class F> void forEach(F f) const { for (int32_t i = 0; i < length() && !g_err.p; i++) cb2(f, T(a->data[i]), i, 0); }
  template<class F> auto map(F f) const -> Array<decay_t<decltype(cb2(f, declval<const T&>(), int32_t(0), 0))>> {
    Array<decay_t<decltype(cb2(f, declval<const T&>(), int32_t(0), 0))>> r;
    r = decltype(r)::with_cap(length());
    for (int32_t i = 0; i < length() && !g_err.p; i++) r.push_raw(cb2(f, a->data[i], i, 0));
    return r;
  }
  template<class F> Array filter(F f) const { Array r = with_cap(0); for (int32_t i = 0; i < length() && !g_err.p; i++) if (cb2(f, a->data[i], i, 0)) r.push_raw(a->data[i]); return r; }
  template<class F, class U> U reduce(F f, U acc) const { for (int32_t i = 0; i < length() && !g_err.p; i++) acc = cb3(f, acc, a->data[i], i, 0); return acc; }
  // RT-11: stable merge sort
  template<class F> Array sort(F f) const {
    int32_t n = length(); if (n < 2) return *this;
    T* tmp = (T*)alloc(sizeof(T) * (size_t)n);
    for (int32_t i = 0; i < n; i++) new (&tmp[i]) T();
    for (int32_t w = 1; w < n; w *= 2) {
      for (int32_t lo = 0; lo < n; lo += 2 * w) {
        int32_t mid = lo + w < n ? lo + w : n, hi = lo + 2 * w < n ? lo + 2 * w : n, i = lo, j = mid, k = lo;
        while (i < mid && j < hi) tmp[k++] = is_neg(f(a->data[j], a->data[i])) ? a->data[j++] : a->data[i++];
        while (i < mid) tmp[k++] = a->data[i++];
        while (j < hi) tmp[k++] = a->data[j++];
      }
      for (int32_t i = 0; i < n; i++) a->data[i] = tmp[i];
    }
    for (int32_t i = 0; i < n; i++) tmp[i].~T();
    mfree(tmp);
    return *this;
  }
  Array reverse() const { int32_t n = length(); for (int32_t i = 0; i < n / 2; i++) { T t = a->data[i]; a->data[i] = a->data[n - 1 - i]; a->data[n - 1 - i] = t; } return *this; }
  Array concat(const Array& o) const { Array r = slice(); for (int32_t i = 0; i < o.length(); i++) r.push_raw(o.a->data[i]); return r; }
  Array fill(const T& v) const { for (int32_t i = 0; i < length(); i++) a->data[i] = v; return *this; }
  String join() const;
  String join(const String& sep) const {
    StrBuilder sb;
    for (int32_t i = 0; i < length(); i++) { if (i) to_s(sb, sep); to_s(sb, a->data[i]); }
    return sb.build();
  }
};
extern StrObj lit_comma;
template<class T> String Array<T>::join() const { return join(String(&lit_comma)); }
template<class T> bool operator==(const Array<T>& x, const Array<T>& y) { return x.a == y.a; }
template<class T> bool operator!=(const Array<T>& x, const Array<T>& y) { return x.a != y.a; }
template<class T> inline bool truthy(const Array<T>& v) { return v.a != nullptr; }
template<class T> bool operator==(const Array<T>& v, decltype(nullptr)) { return !v.a; }
template<class T> bool operator!=(const Array<T>& v, decltype(nullptr)) { return v.a; }
template<class T> void to_s(StrBuilder& sb, const Array<T>& v) { to_s(sb, v.join()); }
template<class T> void json(StrBuilder& sb, const Array<T>& v) {
  if (!v.a) { sb.cstr("null"); return; }
  sb.ch('[');
  for (int32_t i = 0; i < v.a->len; i++) { if (i) sb.ch(','); json(sb, v.a->data[i]); }
  sb.ch(']');
}

// ---------- Map / Set (LNG-19): open-addressing index + dense insertion-ordered entries ----------
inline uint32_t hash_u64(uint64_t x) { x ^= x >> 33; x *= 0xff51afd7ed558ccdULL; x ^= x >> 33; return (uint32_t)x; }
inline uint32_t hash(double v) { if (v == 0) v = 0; uint64_t b; __builtin_memcpy(&b, &v, 8); return hash_u64(b); }
inline uint32_t hash(float v) { return hash((double)v); }
inline uint32_t hash(int32_t v) { return hash((double)v); }
inline uint32_t hash(uint32_t v) { return hash((double)v); }
inline uint32_t hash(int64_t v) { return hash_u64((uint64_t)v); }
inline uint32_t hash(bool v) { return v; }
template<class T, class = typename enable_if<is_intlike<T>::value>::type> inline uint32_t hash(T v) { return hash_u64((uint64_t)(int64_t)v); }
uint32_t hash(const String& s);
template<class T> uint32_t hash(const Ref<T>& r) { return hash_u64((uint64_t)(uintptr_t)r.p); }
template<class T> inline bool same(const T& a, const T& b) { return a == b; }
inline bool same(double a, double b) { return a == b || (a != a && b != b); }

template<class K, class V> struct MapObj {
  uint32_t rc;
  int32_t n, cap, live;    // entries used, entries capacity, live count
  int32_t icap;            // index capacity (power of two)
  K* keys; V* vals; uint8_t* dead; int32_t* index;
};

template<class K, class V> struct Map {
  typedef MapObj<K, V> O;
  O* m = nullptr;
  constexpr Map() {}
  Map(const Map& o) : m(o.m) { if (m) m->rc++; }
  Map(Map&& o) : m(o.m) { o.m = nullptr; }
  ~Map() { drop(m); }
  Map& operator=(Map o) { O* t = m; m = o.m; o.m = t; return *this; }
  static void wipe(O* x) {
    for (int32_t i = 0; i < x->n; i++) if (!x->dead[i]) { x->keys[i].~K(); x->vals[i].~V(); }
    if (x->keys) { mfree(x->keys); mfree(x->vals); mfree(x->dead); mfree(x->index); }
    x->keys = nullptr; x->vals = nullptr; x->dead = nullptr; x->index = nullptr;
    x->n = x->cap = x->live = x->icap = 0;
  }
  static void drop(O* x) { if (!x || --x->rc) return; wipe(x); mfree(x); live_objects--; }
  static Map make() {
    Map r; r.m = (O*)alloc(sizeof(O)); live_objects++;
    r.m->rc = 1; r.m->n = r.m->cap = r.m->live = r.m->icap = 0;
    r.m->keys = nullptr; r.m->vals = nullptr; r.m->dead = nullptr; r.m->index = nullptr;
    return r;
  }
  O* obj() const { if (!m) panic("null map"); return m; }
  int32_t find(const K& k) const {
    O* o = obj(); if (!o->icap) return -1;
    uint32_t mask = (uint32_t)o->icap - 1, h = hash(k) & mask;
    for (;;) {
      int32_t e = o->index[h];
      if (e == -1) return -1;
      if (e >= 0 && !o->dead[e] && same(o->keys[e], k)) return e;
      h = (h + 1) & mask;
    }
  }
  void rehash(int32_t ncap) const {
    O* o = m;
    // compact entries, then rebuild index
    int32_t j = 0;
    for (int32_t i = 0; i < o->n; i++) {
      if (o->dead[i]) continue;
      if (i != j) { new (&o->keys[j]) K(static_cast<K&&>(o->keys[i])); new (&o->vals[j]) V(static_cast<V&&>(o->vals[i])); o->keys[i].~K(); o->vals[i].~V(); }
      o->dead[j++] = 0;
    }
    o->n = j;
    K* nk = (K*)alloc(sizeof(K) * (size_t)ncap); V* nv = (V*)alloc(sizeof(V) * (size_t)ncap); uint8_t* nd = (uint8_t*)alloc((size_t)ncap);
    for (int32_t i = 0; i < o->n; i++) {
      new (&nk[i]) K(static_cast<K&&>(o->keys[i])); new (&nv[i]) V(static_cast<V&&>(o->vals[i])); o->keys[i].~K(); o->vals[i].~V(); nd[i] = 0;
    }
    if (o->keys) { mfree(o->keys); mfree(o->vals); mfree(o->dead); mfree(o->index); }
    o->keys = nk; o->vals = nv; o->dead = nd; o->cap = ncap;
    // the index is probed with `& (icap - 1)`: it must be a power of two (>= 2 x entries)
    o->icap = 16;
    while (o->icap < ncap * 2) o->icap *= 2;
    o->index = (int32_t*)alloc(sizeof(int32_t) * (size_t)o->icap);
    for (int32_t i = 0; i < o->icap; i++) o->index[i] = -1;
    uint32_t mask = (uint32_t)o->icap - 1;
    for (int32_t i = 0; i < o->n; i++) { uint32_t h = hash(o->keys[i]) & mask; while (o->index[h] != -1) h = (h + 1) & mask; o->index[h] = i; }
  }
  int32_t size() const { return obj()->live; }
  bool has(const K& k) const { return find(k) >= 0; }
  V get(const K& k) const { int32_t e = find(k); return e < 0 ? V() : m->vals[e]; }
  V get_or(const K& k, const V& d) const { int32_t e = find(k); return e < 0 ? d : m->vals[e]; }
  Map set(const K& k, const V& v) const {
    int32_t e = find(k);
    if (e >= 0) { m->vals[e] = v; return *this; }
    O* o = m;
    if (o->n == o->cap) rehash(o->live * 2 < 8 ? 8 : o->live * 2);
    e = o->n++;
    new (&o->keys[e]) K(k); new (&o->vals[e]) V(v); o->dead[e] = 0; o->live++;
    uint32_t mask = (uint32_t)o->icap - 1, h = hash(k) & mask;
    while (o->index[h] >= 0) h = (h + 1) & mask;
    o->index[h] = e;
    return *this;
  }
  bool del(const K& k) const {
    int32_t e = find(k); if (e < 0) return false;
    O* o = m;
    uint32_t mask = (uint32_t)o->icap - 1, h = hash(k) & mask;
    while (o->index[h] != e) h = (h + 1) & mask;
    o->index[h] = -2;  // tombstone
    o->keys[e].~K(); o->vals[e].~V(); new (&o->keys[e]) K(); new (&o->vals[e]) V();
    o->dead[e] = 1; o->live--;
    return true;
  }
  void clear() const { wipe(obj()); }
  // iteration by slot (for-of and forEach see entries appended during iteration, like JS)
  int32_t slots() const { return obj()->n; }
  bool live_at(int32_t i) const { return !m->dead[i]; }
  K key_at(int32_t i) const { return m->keys[i]; }
  V val_at(int32_t i) const { return m->vals[i]; }
  template<class F> void forEach(F f) const { for (int32_t i = 0; i < slots() && !g_err.p; i++) if (live_at(i)) cb2(f, val_at(i), key_at(i), 0); }
  Array<K> keys() const { Array<K> r = Array<K>::with_cap(size()); for (int32_t i = 0; i < slots(); i++) if (live_at(i)) r.push_raw(m->keys[i]); return r; }
  Array<V> values() const { Array<V> r = Array<V>::with_cap(size()); for (int32_t i = 0; i < slots(); i++) if (live_at(i)) r.push_raw(m->vals[i]); return r; }
};
template<class K, class V> void json(StrBuilder& sb, const Map<K, V>&) { sb.cstr("{}"); }
template<class K, class V> bool operator==(const Map<K, V>& v, decltype(nullptr)) { return !v.m; }
template<class K, class V> bool operator!=(const Map<K, V>& v, decltype(nullptr)) { return v.m; }
template<class K, class V> inline bool truthy(const Map<K, V>& v) { return v.m; }
template<class K, class V> void to_s(StrBuilder& sb, const Map<K, V>&) { sb.cstr("[object Map]"); }

template<class T> struct Set {
  Map<T, uint8_t> m;
  static Set make() { Set s; s.m = Map<T, uint8_t>::make(); return s; }
  int32_t size() const { return m.size(); }
  Set add(const T& v) const { m.set(v, 1); return *this; }
  bool has(const T& v) const { return m.has(v); }
  bool del(const T& v) const { return m.del(v); }
  void clear() const { m.clear(); }
  int32_t slots() const { return m.slots(); }
  bool live_at(int32_t i) const { return m.live_at(i); }
  T key_at(int32_t i) const { return m.key_at(i); }
  template<class F> void forEach(F f) const { for (int32_t i = 0; i < slots(); i++) if (live_at(i)) f(key_at(i)); }
  Array<T> values() const { return m.keys(); }
};
template<class T> void json(StrBuilder& sb, const Set<T>&) { sb.cstr("{}"); }
template<class T> bool operator==(const Set<T>& v, decltype(nullptr)) { return !v.m.m; }
template<class T> bool operator!=(const Set<T>& v, decltype(nullptr)) { return v.m.m; }
template<class T> inline bool truthy(const Set<T>& v) { return v.m.m; }
template<class T> void to_s(StrBuilder& sb, const Set<T>&) { sb.cstr("[object Set]"); }

// ---------- event loop (RT-10) ----------
int32_t set_timer(Fn<void()> f, double ms, bool repeat);
void clear_timer(int32_t id);
void start(const HalConfig& cfg, int argc = 0, char** argv = nullptr);
void run_loop();
bool loop_once();
void finish();
/** Program entry used by generated code: start, init, event loop, deinit, finish; crash policy (ZRT_CRASH). */
int app_main(const HalConfig& cfg, int argc, char** argv, void (*init)(), void (*deinit)());

// ---------- source locations (dev builds, docs/dev-mode.md) ----------
// Each Zinc function keeps a LocFrame whose `loc` is the current statement (index into loc_names); the chain from
// loc_top down is the Zinc stack shown by the red box. Code outside a function writes to loc_root.
struct LocFrame {
  uint32_t loc = 0;
  LocFrame* up;
  LocFrame();
  explicit LocFrame(decltype(nullptr)) : up(nullptr) {}
  LocFrame(const LocFrame&) = delete;
  ~LocFrame();
};
extern LocFrame loc_root;
extern LocFrame* loc_top;
inline LocFrame::LocFrame() : up(loc_top) { loc_top = this; }
inline LocFrame::~LocFrame() { if (up) loc_top = up; }
extern const char* const* loc_names;  // "fn (file.ts:12)", set by generated dev builds
void loc_throw();                     // remembers the stack of a `throw` for the uncaught-error report

// ---------- zinc:gfx (UI-12) ----------
namespace gfx {
void onFrame(Fn<void(double)> cb);
int32_t width();
int32_t height();
void clear(uint32_t color);
void rect(double x, double y, double w, double h, uint32_t color);
void rrect(double x, double y, double w, double h, double r, uint32_t color, int32_t alpha);
void gradient(double x, double y, double w, double h, double r, uint32_t c1, uint32_t c2, bool vertical, int32_t alpha);
void border(double x, double y, double w, double h, double r, double width, uint32_t color, int32_t alpha);
void shadow(double x, double y, double w, double h, double r, double blur, uint32_t color, int32_t alpha);
void polygon(const Array<double>& pts, uint32_t color, int32_t alpha);
void path(const Array<double>& contours, uint32_t color, int32_t alpha);
void line(double x1, double y1, double x2, double y2, uint32_t color);
int32_t font(const String& name, int32_t px);
int32_t fontAscent(int32_t f);
int32_t lineHeight(int32_t f);
double textWidth(int32_t f, const String& s, double tracking);
void drawText(int32_t f, double x, double y, const String& s, uint32_t color, int32_t alpha, double tracking);
void text(double x, double y, const String& s, uint32_t color, int32_t scale);
int32_t image(const String& name);
int32_t imageWidth(int32_t i);
int32_t imageHeight(int32_t i);
void drawImage(int32_t i, double x, double y, double w, double h, int32_t alpha, double radius);
void clip(double x, double y, double w, double h);
void unclip();
void translate(double x, double y);
void keep();
void stroke(const Array<double>& pts, double width, uint32_t color, int32_t alpha, bool closed);
int32_t createImage(int32_t w, int32_t h);
void destroyImage(int32_t i);
void beginImage(int32_t i);
void endImage();
double wheel();
double pinch();
int32_t touchCount();
double touchX(int32_t i);
double touchY(int32_t i);
int32_t touchId(int32_t i);
int32_t penCount();
double penX(int32_t i);
double penY(int32_t i);
double penPressure(int32_t i);
double penTiltX(int32_t i);
double penTiltY(int32_t i);
int32_t penFlags(int32_t i);
bool isDown(int32_t b);
bool wasPressed(int32_t b);
double pointerX();
double pointerY();
bool pointerDown();
int32_t frame();
void quit();
}

}  // namespace zrt

#include "zrt_inspect.h"
#include "zrt_ext.h"
#include "zrt_dyn.h"
