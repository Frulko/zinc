// zrt extensions: errors (RT-05), promises and async frames (LNG-16, RT-10), generators, fixed point (RT-04),
// weak references (MEM-13), pools (MEM-09), arenas (MEM-07), console (RT-07). Included at the end of zrt.h.
#pragma once
#include "fx_sin.h"

namespace zrt {

// ---------- errors ----------
struct Error : Object {
  static constexpr uint32_t ZRT_CID = 0xFFFF00;
  String message, name;
  Error(String m = String()) : message(m), name(String::from("Error", 5)) {}
  bool zrt_isa(uint32_t id) const override { return id == ZRT_CID; }
  void zrt_str(StrBuilder& sb) const override { to_s(sb, name); if (message.bytes()) { sb.cstr(": "); to_s(sb, message); } }
  void zrt_fields(StrBuilder&, bool&) const override {}
  void zrt_json(StrBuilder& sb) const override { sb.ch('{'); bool first = true; zrt_fields(sb, first); sb.ch('}'); }
};
struct TypeError : Error {
  static constexpr uint32_t ZRT_CID = 0xFFFF01;
  TypeError(String m = String()) : Error(m) { name = String::from("TypeError", 9); }
  bool zrt_isa(uint32_t id) const override { return id == ZRT_CID || Error::zrt_isa(id); }
};
struct RangeError : Error {
  static constexpr uint32_t ZRT_CID = 0xFFFF02;
  RangeError(String m = String()) : Error(m) { name = String::from("RangeError", 10); }
  bool zrt_isa(uint32_t id) const override { return id == ZRT_CID || Error::zrt_isa(id); }
};
inline Ref<Error> take_error() { Ref<Error> e = g_err; g_err = nullptr; return e; }
[[noreturn]] void uncaught(const Ref<Error>& e);
inline void check_uncaught() { if (g_err.p) uncaught(g_err); }

// `finally` and `using`: runs on every exit path; a pending error survives unless the body throws (RT-05, LNG-17).
template<class F> struct Defer {
  F f;
  Defer(F x) : f(x) {}
  Defer(const Defer&) = delete;
  ~Defer() { Ref<Error> saved = take_error(); f(); if (!g_err.p) g_err = saved; }
};
template<class F> Defer<F> defer(F f) { return Defer<F>(f); }

template<class T> String json_stringify(const T& v) { StrBuilder sb; json(sb, v); return sb.build(); }

// ---------- tuples ----------
template<class A, class B> struct Tup2 { A v0; B v1; };
template<class A, class B, class C> struct Tup3 { A v0; B v1; C v2; };
template<class A, class B, class C, class D> struct Tup4 { A v0; B v1; C v2; D v3; };
template<class A, class B> void json(StrBuilder& sb, const Tup2<A, B>& t) { sb.ch('['); json(sb, t.v0); sb.ch(','); json(sb, t.v1); sb.ch(']'); }
template<class A, class B> void log_one(StrBuilder& sb, const Tup2<A, B>& t) { json(sb, t); }
template<class A, class B, class C> void json(StrBuilder& sb, const Tup3<A, B, C>& t) { sb.ch('['); json(sb, t.v0); sb.ch(','); json(sb, t.v1); sb.ch(','); json(sb, t.v2); sb.ch(']'); }
template<class A, class B, class C> void log_one(StrBuilder& sb, const Tup3<A, B, C>& t) { json(sb, t); }

// ---------- weak references (MEM-13) ----------
template<class T> struct Weak {
  T* p = nullptr;
  Weak() {}
  Weak(decltype(nullptr)) {}
  Weak(const Ref<T>& r) : p(r.p) { if (p) p->wc++; }
  Weak(const Weak& o) : p(o.p) { if (p) p->wc++; }
  ~Weak() { drop(); }
  Weak& operator=(const Weak& o) { if (o.p) o.p->wc++; drop(); p = o.p; return *this; }
  Weak& operator=(const Ref<T>& r) { if (r.p) r.p->wc++; drop(); p = r.p; return *this; }
  Weak& operator=(decltype(nullptr)) { drop(); return *this; }
  void drop() { if (p && --p->wc == 0 && p->rc == 0) mfree(p); p = nullptr; }
  Ref<T> get() const { return (p && p->rc) ? Ref<T>(p) : Ref<T>(); }
};
template<class T> void json(StrBuilder& sb, const Weak<T>& w) { json(sb, w.get()); }

// ---------- pools (MEM-09): N preallocated slots, O(1), heap fallback when exhausted ----------
template<class T, int N> struct Pool {
  alignas(16) static inline unsigned char mem[(size_t)N * sizeof(T)];
  static inline void* free_list = nullptr;
  static inline bool ready = false;
  static void* take() {
    if (!ready) { ready = true; for (int i = N - 1; i >= 0; i--) { void* s = mem + (size_t)i * sizeof(T); *(void**)s = free_list; free_list = s; } }
    if (!free_list) return alloc(sizeof(T));
    void* s = free_list; free_list = *(void**)s; return s;
  }
  static void give(void* s) {
    if ((unsigned char*)s >= mem && (unsigned char*)s < mem + sizeof(mem)) { *(void**)s = free_list; free_list = s; }
    else mfree(s);
  }
};

// ---------- fixed point Q(32-F).F (RT-04): bit-identical with sim/zinc.mjs ----------
template<int F> struct Fx {
  int32_t v = 0;
  static constexpr int64_t ONE = (int64_t)1 << F;
  constexpr Fx() {}
  static constexpr Fx raw(int32_t r) { Fx x; x.v = r; return x; }
  static int32_t from_d(double d) { return cvt<int32_t>(__builtin_floor(d * (double)ONE + 0.5)); }
  Fx(double d) : v(from_d(d)) {}  // implicit: host APIs pass f64 across the boundary
  explicit Fx(float d) : v(from_d(d)) {}
  explicit Fx(int32_t i) : v((int32_t)((uint32_t)i << F)) {}
  explicit Fx(uint32_t i) : v((int32_t)(i << F)) {}
  explicit Fx(int64_t i) : v(from_d((double)i)) {}
  template<int G> explicit Fx(Fx<G> o) : v(from_d((double)o)) {}
  explicit operator double() const { return (double)v / (double)ONE; }
  explicit operator float() const { return (float)((double)v / (double)ONE); }
  Fx operator+(Fx o) const { return raw((int32_t)((uint32_t)v + (uint32_t)o.v)); }
  Fx operator-(Fx o) const { return raw((int32_t)((uint32_t)v - (uint32_t)o.v)); }
  Fx operator-() const { return raw((int32_t)(0u - (uint32_t)v)); }
  Fx operator*(Fx o) const { return raw((int32_t)(((int64_t)v * o.v) >> F)); }
  Fx operator/(Fx o) const { if (!o.v) panic("fixed-point division by zero"); return raw((int32_t)(((int64_t)v * ONE) / o.v)); }
  Fx operator%(Fx o) const { if (!o.v) panic("fixed-point division by zero"); return raw(v % o.v); }
  Fx& operator+=(Fx o) { return *this = *this + o; }
  Fx& operator-=(Fx o) { return *this = *this - o; }
  Fx& operator*=(Fx o) { return *this = *this * o; }
  Fx& operator/=(Fx o) { return *this = *this / o; }
  Fx& operator++() { return *this = *this + Fx(1); }
  Fx& operator--() { return *this = *this - Fx(1); }
  Fx operator++(int) { Fx t = *this; ++*this; return t; }
  Fx operator--(int) { Fx t = *this; --*this; return t; }
  bool operator==(Fx o) const { return v == o.v; }
  bool operator!=(Fx o) const { return v != o.v; }
  bool operator<(Fx o) const { return v < o.v; }
  bool operator>(Fx o) const { return v > o.v; }
  bool operator<=(Fx o) const { return v <= o.v; }
  bool operator>=(Fx o) const { return v >= o.v; }
};
typedef Fx<12> fx12;
typedef Fx<16> fx16;
template<int F> inline bool truthy(Fx<F> x) { return x.v != 0; }
template<int F> inline void to_s(StrBuilder& sb, Fx<F> x) { str_num(sb, (double)x); }
template<int F> inline void json(StrBuilder& sb, Fx<F> x) { str_num(sb, (double)x); }
template<int F> inline uint32_t hash(Fx<F> x) { return hash((double)x); }
template<> inline fx12 cvt<fx12>(double x) { return fx12(x); }
template<> inline fx16 cvt<fx16>(double x) { return fx16(x); }

namespace fxm {
template<int F> Fx<F> abs(Fx<F> a) { return a.v < 0 ? -a : a; }
template<int F> Fx<F> floor(Fx<F> a) { return Fx<F>::raw((int32_t)((uint32_t)a.v & ~(uint32_t)(Fx<F>::ONE - 1))); }
template<int F> Fx<F> ceil(Fx<F> a) { return -floor(-a); }
template<int F> Fx<F> round(Fx<F> a) { return floor(Fx<F>::raw((int32_t)((uint32_t)a.v + (uint32_t)(Fx<F>::ONE / 2)))); }
template<int F> Fx<F> trunc(Fx<F> a) { return a.v >= 0 ? floor(a) : ceil(a); }
template<int F> Fx<F> sign(Fx<F> a) { return Fx<F>(a.v > 0 ? 1 : a.v < 0 ? -1 : 0); }
template<int F> Fx<F> min(Fx<F> a, Fx<F> b) { return a.v < b.v ? a : b; }
template<int F> Fx<F> max(Fx<F> a, Fx<F> b) { return a.v > b.v ? a : b; }
template<int F> Fx<F> sqrt(Fx<F> a) {
  if (a.v <= 0) return Fx<F>();
  uint64_t n = (uint64_t)a.v << F, r = 0, bit = (uint64_t)1 << 62;
  while (bit > n) bit >>= 2;
  while (bit) { if (n >= r + bit) { n -= r + bit; r = (r >> 1) + bit; } else r >>= 1; bit >>= 2; }
  return Fx<F>::raw((int32_t)r);
}
template<int F> Fx<F> sin(Fx<F> a) {
  int32_t i = (int32_t)(((int64_t)a.v * zrt_fx_idx_k) >> (F + 16)) & 4095;
  int32_t s = zrt_fx_sin[i];
  return Fx<F>::raw(F >= 16 ? s << (F - 16) : s >> (16 - F));
}
template<int F> Fx<F> cos(Fx<F> a) {
  int32_t i = ((int32_t)(((int64_t)a.v * zrt_fx_idx_k) >> (F + 16)) + 1024) & 4095;
  int32_t s = zrt_fx_sin[i];
  return Fx<F>::raw(F >= 16 ? s << (F - 16) : s >> (16 - F));
}
template<int F> Fx<F> pow(Fx<F> a, Fx<F> b) { return Fx<F>(math::pow((double)a, (double)b)); }
template<int F> Fx<F> tan(Fx<F> a, Fx<F> = Fx<F>()) { return Fx<F>(math::tan((double)a)); }
template<int F> Fx<F> atan2(Fx<F> a, Fx<F> b) { return Fx<F>(math::atan2((double)a, (double)b)); }
template<int F> Fx<F> exp(Fx<F> a, Fx<F> = Fx<F>()) { return Fx<F>(math::exp((double)a)); }
template<int F> Fx<F> log(Fx<F> a, Fx<F> = Fx<F>()) { return Fx<F>(math::log((double)a)); }
template<int F> Fx<F> hypot(Fx<F> a, Fx<F> b) { return sqrt(a * a + b * b); }
template<int F> Fx<F> fround(Fx<F> a, Fx<F> = Fx<F>()) { return a; }
template<int F> Fx<F> abs(Fx<F> a, Fx<F>) { return abs(a); }
template<int F> Fx<F> floor(Fx<F> a, Fx<F>) { return floor(a); }
template<int F> Fx<F> ceil(Fx<F> a, Fx<F>) { return ceil(a); }
template<int F> Fx<F> round(Fx<F> a, Fx<F>) { return round(a); }
template<int F> Fx<F> trunc(Fx<F> a, Fx<F>) { return trunc(a); }
template<int F> Fx<F> sign(Fx<F> a, Fx<F>) { return sign(a); }
template<int F> Fx<F> sqrt(Fx<F> a, Fx<F>) { return sqrt(a); }
template<int F> Fx<F> sin(Fx<F> a, Fx<F>) { return sin(a); }
template<int F> Fx<F> cos(Fx<F> a, Fx<F>) { return cos(a); }
}

// ---------- event loop hooks for native modules (NAT-06): polled between frames ----------
struct Poller { Poller* next = nullptr; virtual bool poll() = 0; virtual void shutdown() {} virtual ~Poller() {} };
void add_poller(Poller* p);
/** Called by finish() before the leak report (TST-09): modules drop the callbacks they hold. */
void at_finish(void (*f)());

// ---------- promises and microtasks (LNG-16, RT-10) ----------
void microtask(Fn<void()> f);
void drain_microtasks();

struct Unit { bool operator==(const Unit&) const { return true; } };
inline void to_s(StrBuilder& sb, const Unit&) { sb.cstr("undefined"); }
inline void json(StrBuilder& sb, const Unit&) { sb.cstr("null"); }
inline bool truthy(const Unit&) { return false; }

struct PromiseBase : Object {
  uint8_t st = 0;        // 0 pending, 1 fulfilled, 2 rejected
  bool handled = false;
  Ref<Error> err;
  Array<Fn<void()>> conts;
  PromiseBase() : conts(Array<Fn<void()>>::with_cap(0)) {}
  void on_settle(Fn<void()> k) { handled = true; if (st) microtask(k); else conts.push(k); }
  void flush() { Array<Fn<void()>> ks = conts; conts = Array<Fn<void()>>::with_cap(0); for (int32_t i = 0; i < ks.length(); i++) microtask(ks.get(i)); }
  void reject(const Ref<Error>& e);
};
void track_rejection(PromiseBase* p);
inline void PromiseBase::reject(const Ref<Error>& e) { if (st) return; st = 2; err = e; if (!conts.length()) track_rejection(this); flush(); }

template<class T> struct PromiseObj : PromiseBase {
  T val{};
  void resolve(const T& v) { if (st) return; st = 1; val = v; flush(); }
};
template<class T> struct Resolver {
  Ref<PromiseObj<T>> p;
  void operator()(const T& v) const { p->resolve(v); }
  void operator()() const { p->resolve(T{}); }
};
struct Rejecter {
  Ref<PromiseBase> p;
  void operator()(const Ref<Error>& e) const { p->reject(e); }
};
template<class F, class A> auto cb1(F& f, const A& a, int) -> decltype(f(a)) { return f(a); }
template<class F, class A> auto cb1(F& f, const A&, long) -> decltype(f()) { return f(); }

template<class T> struct Promise {
  Ref<PromiseObj<T>> p;
  static Promise make_pending() { Promise r; r.p = zrt::make<PromiseObj<T>>(); return r; }
  static Promise resolved(const T& v = T{}) { Promise r = make_pending(); r.p->resolve(v); return r; }
  static Promise rejected(const Ref<Error>& e) { Promise r = make_pending(); r.p->reject(e); return r; }
  template<class F> static Promise create(F executor) {
    Promise r = make_pending();
    cb2(executor, Resolver<T>{r.p}, Rejecter{Ref<PromiseBase>(r.p.p)}, 0);
    if (g_err.p) r.p->reject(take_error());  // executor threw
    return r;
  }
  bool rejected() const { return p->st == 2; }
  Ref<Error> error() const { return p->err; }
  T value() const { return p->val; }
  template<class F> Promise<Unit> then(F f) const {
    Promise<Unit> r = Promise<Unit>::make_pending();
    Ref<PromiseObj<T>> self = p;
    self->on_settle([self, f, r]() mutable {
      if (self->st == 2) { r.p->reject(self->err); return; }
      cb1(f, self->val, 0);
      if (g_err.p) r.p->reject(take_error()); else r.p->resolve(Unit{});
    });
    return r;
  }
};
template<class T> inline bool truthy(const Promise<T>& v) { return (bool)v.p; }
template<class T> void to_s(StrBuilder& sb, const Promise<T>&) { sb.cstr("[object Promise]"); }
template<class T> void json(StrBuilder& sb, const Promise<T>&) { sb.cstr("{}"); }
template<class T> void log_one(StrBuilder& sb, const Promise<T>&) { sb.cstr("Promise {}"); }

template<class T> Promise<Array<T>> promise_all(const Array<Promise<T>>& ps) {
  Promise<Array<T>> r = Promise<Array<T>>::make_pending();
  int32_t n = ps.length();
  Array<T> out = Array<T>::with_cap(n);
  for (int32_t i = 0; i < n; i++) out.push_raw(T{});
  if (!n) { r.p->resolve(out); return r; }
  Ref<Cell<int32_t>> left = cell<int32_t>(n);
  for (int32_t i = 0; i < n; i++) {
    Ref<PromiseObj<T>> pi = ps.get(i).p;
    pi->on_settle([pi, r, out, left, i]() {
      if (pi->st == 2) { r.p->reject(pi->err); return; }
      out.set(i, pi->val);
      if (--left->v == 0) r.p->resolve(out);
    });
  }
  return r;
}

// async function frame: step() resumes at `state` (protothread).
struct AsyncBase : Object { int32_t state = 0; virtual void step() = 0; };
template<class T> struct AsyncFrame : AsyncBase {
  Ref<PromiseObj<T>> prom = zrt::make<PromiseObj<T>>();
  void zrt_resolve(const T& v) { state = -1; prom->resolve(v); }
  void zrt_done() { zrt_resolve(T{}); }
  void zrt_reject(const Ref<Error>& e) { state = -1; prom->reject(e); }
  Promise<T> zrt_promise() { Promise<T> r; r.p = prom; return r; }
};
template<class T> void await_(AsyncBase* self, const Promise<T>& p) {
  Ref<AsyncBase> keep(self);
  p.p->on_settle([keep]() { keep->step(); });
}

// generator frame: step() runs to the next yield (true) or the end (false).
template<class T> struct GenFrame : Object { int32_t state = 0; T cur{}; virtual bool step() = 0; };
template<class T> using Gen = Ref<GenFrame<T>>;

// ---------- arenas (MEM-07/08): bump allocation, O(1) release, escape checked at dispose ----------
namespace mem {
struct Arena : Object {
  char* base = nullptr;
  size_t size = 0, used = 0;
  uint32_t live = 0;
  Arena* prev = nullptr;
  static Ref<Arena> frame(double bytes = 65536);
  void zrt_dispose();
  ~Arena() override;
};
}
bool arena_owns(const void* p);
void arena_forget(Object* o);
template<class T> Ref<T> promote(const Ref<T>& x) { return x.p ? Ref<T>::adopt(heap_clone(*x.p)) : Ref<T>(); }

// ---------- console (RT-07) ----------
enum LogLevel { LOG_LOG, LOG_INFO, LOG_DEBUG, LOG_WARN, LOG_ERROR, LOG_TRACE };
void log_emit(int level, StrBuilder& sb);
template<class... A> void console(int level, const A&... a) {
  StrBuilder sb; bool first = true;
  ((first ? (void)0 : sb.ch(' '), first = false, log_one(sb, a)), ...);
  log_emit(level, sb);
}
template<class... A> void log(const A&... a) { console(LOG_LOG, a...); }
void console_time(const String& label);
void console_timeEnd(const String& label);
void console_timeLog(const String& label);
void console_count(const String& label);
template<class... A> void console_assert(bool ok, const A&... a) {
  if (ok) return;
  StrBuilder sb; sb.cstr("Assertion failed");
  if (sizeof...(a)) sb.cstr(":");
  ((sb.ch(' '), log_one(sb, a)), ...);
  log_emit(LOG_ERROR, sb);
}
template<class T> void console_table(const Array<T>& rows) {
  StrBuilder sb; sb.cstr("(index)\tvalues\n");
  for (int32_t i = 0; i < rows.length(); i++) { to_s(sb, i); sb.ch('\t'); log_one(sb, rows.get(i)); if (i + 1 < rows.length()) sb.ch('\n'); }
  log_emit(LOG_LOG, sb);
}
// runtime metrics exposed to zinc:telemetry
struct Stats { uint64_t frame_us; uint32_t frames; uint32_t draw_cmds; };
extern Stats stats;
// hooks installed by zinc:telemetry (null when the module is not linked)
extern void (*telemetry_frame)();
extern void (*telemetry_log)(int level, const char* s, uint32_t n);

}  // namespace zrt
