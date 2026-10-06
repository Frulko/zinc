#include "vm/vm.h"

#include <bit>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <memory>
#include <vector>

namespace zn::vm {

std::string numberToString(double v) {
  if (v != v) return "NaN";
  if (v == 0) return "0";
  if (std::isinf(v)) return v > 0 ? "Infinity" : "-Infinity";
  std::string sign = v < 0 ? "-" : "";
  v = std::fabs(v);
  char buf[48];
  for (int p = 1; p <= 17; ++p) {  // shortest digit count that round-trips
    std::snprintf(buf, sizeof buf, "%.*e", p - 1, v);
    if (std::strtod(buf, nullptr) == v) break;
  }
  std::string s = buf;  // d.ddde[+-]XX
  std::size_t e = s.find('e');
  int exp10 = std::atoi(s.c_str() + e + 1);
  std::string digits;
  for (std::size_t i = 0; i < e; ++i) if (s[i] != '.') digits += s[i];
  while (digits.size() > 1 && digits.back() == '0') digits.pop_back();
  int k = static_cast<int>(digits.size()), n = exp10 + 1;
  std::string out;
  if (k <= n && n <= 21) out = digits + std::string(static_cast<std::size_t>(n - k), '0');
  else if (0 < n && n <= 21) out = digits.substr(0, static_cast<std::size_t>(n)) + "." + digits.substr(static_cast<std::size_t>(n));
  else if (-6 < n && n <= 0) out = "0." + std::string(static_cast<std::size_t>(-n), '0') + digits;
  else {
    int ex = n - 1;
    out = digits.substr(0, 1) + (k > 1 ? "." + digits.substr(1) : "") + "e" + (ex < 0 ? "-" : "+") + std::to_string(std::abs(ex));
  }
  return sign + out;
}

namespace {

using Slot = std::uint64_t;
// Every frame starts at most 255 slots above its caller's base and has at most 256 registers, so a depth check alone
// bounds the stack: no per-call stack-end check.
constexpr std::size_t kStackSlots = std::size_t{kMaxCallDepth} * kMaxRegisters + kMaxRegisters;

inline double asD(Slot s) { return std::bit_cast<double>(s); }
inline Slot fromD(double d) { return std::bit_cast<Slot>(d); }
inline float asF(Slot s) { return std::bit_cast<float>(static_cast<std::uint32_t>(s)); }
inline Slot fromF(float f) { return static_cast<Slot>(std::bit_cast<std::uint32_t>(f)); }
inline Slot sx(std::int64_t v) { return static_cast<Slot>(v); }
inline Slot sx32(std::int32_t v) { return static_cast<Slot>(static_cast<std::int64_t>(v)); }
inline Slot zx32(std::uint32_t v) { return static_cast<Slot>(v); }

std::int64_t toI64(double x) {
  if (x != x) return 0;
  if (x >= 9223372036854775807.0) return INT64_MAX;
  if (x <= -9223372036854775808.0) return INT64_MIN;
  return static_cast<std::int64_t>(x);
}
std::uint64_t toU64(double x) {
  if (x != x) return 0;
  if (x < 0) return static_cast<std::uint64_t>(toI64(x));
  if (x >= 18446744073709551616.0) return UINT64_MAX;
  return static_cast<std::uint64_t>(x);
}
double jsRound(double x) {  // round half toward +infinity
  double f = std::floor(x);
  return x - f >= 0.5 ? f + 1 : f;
}
double jsMin(double a, double b) { return (a != a || b != b) ? NAN : (a < b ? a : b); }
double jsMax(double a, double b) { return (a != a || b != b) ? NAN : (a > b ? a : b); }

struct Func {
  const std::uint32_t* code;
  const zbc::Const* consts;
  std::uint32_t nregs;
};
struct ClassRT {
  std::uint32_t id = 0;
  std::uint32_t nfields = 0;
  std::vector<std::uint32_t> supers;
  std::vector<const Func*> vtable;  // by selector id; empty for interfaces and abstract classes
};
// Objects: a header followed by one 64-bit slot per field. Memory is released at exit; reference counting is ZN-018.
struct Obj {
  const ClassRT* cls;
  std::uint32_t rc;
  std::uint32_t pad;
  Slot* fields() { return reinterpret_cast<Slot*>(this + 1); }
};
bool isSubclassRT(const ClassRT* c, std::uint32_t target) {
  if (c->id == target) return true;
  for (std::uint32_t s : c->supers) if (s == target) return true;
  return false;
}

struct Frame {
  const std::uint32_t* ret;  // instruction to resume in the caller
  const Func* fn;
  Slot* base;
};

}  // namespace

Result run(const zbc::Module& m, std::string& out) {
  std::vector<Func> funcs(m.functions.size());
  for (std::size_t i = 0; i < funcs.size(); ++i) funcs[i] = {m.functions[i].code.data(), m.functions[i].consts.data(), m.functions[i].nregs};
  // Verified code never reads a register before writing it, so the stack needs no initialisation; calloc hands out
  // lazily zeroed pages, so the 20 MB is not touched until used.
  std::unique_ptr<Slot[], decltype(&std::free)> stackMem(static_cast<Slot*>(std::calloc(kStackSlots, sizeof(Slot))), &std::free);
  if (!stackMem) return {false, "out of memory"};
  Slot* const stackBase = stackMem.get();
  std::vector<Slot> globals(m.globals.size(), 0);
  std::vector<ClassRT> classes(m.classes.size());
  for (std::size_t i = 0; i < classes.size(); ++i) {
    classes[i].id = static_cast<std::uint32_t>(i);
    classes[i].nfields = static_cast<std::uint32_t>(m.classes[i].fields.size());
    classes[i].supers = m.classes[i].supers;
    if (!m.classes[i].isInterface && !m.classes[i].isAbstract) {
      classes[i].vtable.assign(m.selectors.size(), nullptr);
      for (std::uint32_t sel : m.classes[i].selectors) classes[i].vtable[sel] = &funcs[m.classes[i].vtable[sel]];
    }
  }
  std::vector<Obj*> allocated;
  struct Releaser { std::vector<Obj*>& v; ~Releaser() { for (Obj* o : v) std::free(o); } } releaser{allocated};
  std::vector<Frame> frames(kMaxCallDepth);
  Frame* fp = frames.data();                      // next free frame
  Frame* const framesEnd = frames.data() + kMaxCallDepth;

  static const void* const labels[] = {
#define X(name, fmt, b, c, o) &&L_##name,
      ZN_OPCODES(X)
#undef X
  };

  const Func* fn = &funcs[0];
  const std::uint32_t* code = fn->code;
  const std::uint32_t* pc = code;
  Slot* r = stackBase;
  std::uint32_t w;
  Result res;
  const char* err = nullptr;

#define NEXT() do { w = *pc++; goto *labels[w & 0xFFu]; } while (0)
#define A aOf(w)
#define B bOf(w)
#define C cOf(w)
#define TRAP(msg) do { err = msg; goto fail; } while (0)
  NEXT();

L_Nop: NEXT();
L_Trap: TRAP("trap: unreachable code executed");
L_Move: r[A] = r[B]; NEXT();
L_LoadI: r[A] = sx(sdOf(w)); NEXT();
L_LoadK: r[A] = fn->consts[dOf(w)].bits; NEXT();

#define ARITH(name, expr) L_##name: { const Slot x = r[B], y = r[C]; (void)x; (void)y; r[A] = (expr); NEXT(); }
#define DIVLIKE(name, zero, expr) L_##name: { const Slot x = r[B], y = r[C]; if (!(zero)) TRAP("division by zero"); r[A] = (expr); NEXT(); }
  ARITH(AddI32, sx32(static_cast<std::int32_t>(static_cast<std::uint32_t>(x) + static_cast<std::uint32_t>(y))))
  ARITH(SubI32, sx32(static_cast<std::int32_t>(static_cast<std::uint32_t>(x) - static_cast<std::uint32_t>(y))))
  ARITH(MulI32, sx32(static_cast<std::int32_t>(static_cast<std::uint32_t>(x) * static_cast<std::uint32_t>(y))))
  DIVLIKE(DivI32, static_cast<std::int32_t>(y) != 0, (static_cast<std::int32_t>(x) == INT32_MIN && static_cast<std::int32_t>(y) == -1) ? sx32(INT32_MIN) : sx32(static_cast<std::int32_t>(x) / static_cast<std::int32_t>(y)))
  DIVLIKE(RemI32, static_cast<std::int32_t>(y) != 0, (static_cast<std::int32_t>(y) == -1) ? Slot{0} : sx32(static_cast<std::int32_t>(x) % static_cast<std::int32_t>(y)))
  ARITH(AddU32, zx32(static_cast<std::uint32_t>(x) + static_cast<std::uint32_t>(y)))
  ARITH(SubU32, zx32(static_cast<std::uint32_t>(x) - static_cast<std::uint32_t>(y)))
  ARITH(MulU32, zx32(static_cast<std::uint32_t>(x) * static_cast<std::uint32_t>(y)))
  DIVLIKE(DivU32, static_cast<std::uint32_t>(y) != 0, zx32(static_cast<std::uint32_t>(x) / static_cast<std::uint32_t>(y)))
  DIVLIKE(RemU32, static_cast<std::uint32_t>(y) != 0, zx32(static_cast<std::uint32_t>(x) % static_cast<std::uint32_t>(y)))
  ARITH(AddI64, x + y)
  ARITH(SubI64, x - y)
  ARITH(MulI64, x * y)
  DIVLIKE(DivI64, y != 0, (static_cast<std::int64_t>(x) == INT64_MIN && static_cast<std::int64_t>(y) == -1) ? x : sx(static_cast<std::int64_t>(x) / static_cast<std::int64_t>(y)))
  DIVLIKE(RemI64, y != 0, (static_cast<std::int64_t>(y) == -1) ? Slot{0} : sx(static_cast<std::int64_t>(x) % static_cast<std::int64_t>(y)))
  ARITH(AddU64, x + y)
  ARITH(SubU64, x - y)
  ARITH(MulU64, x * y)
  DIVLIKE(DivU64, y != 0, x / y)
  DIVLIKE(RemU64, y != 0, x % y)
  ARITH(AddF32, fromF(asF(x) + asF(y)))
  ARITH(SubF32, fromF(asF(x) - asF(y)))
  ARITH(MulF32, fromF(asF(x) * asF(y)))
  ARITH(DivF32, fromF(asF(x) / asF(y)))
  ARITH(RemF32, fromF(std::fmod(asF(x), asF(y))))
  ARITH(AddF64, fromD(asD(x) + asD(y)))
  ARITH(SubF64, fromD(asD(x) - asD(y)))
  ARITH(MulF64, fromD(asD(x) * asD(y)))
  ARITH(DivF64, fromD(asD(x) / asD(y)))
  ARITH(RemF64, fromD(std::fmod(asD(x), asD(y))))
  ARITH(PowF64, fromD(std::pow(asD(x), asD(y))))
  ARITH(Atan2F64, fromD(std::atan2(asD(x), asD(y))))
  ARITH(MinF64, fromD(jsMin(asD(x), asD(y))))
  ARITH(MaxF64, fromD(jsMax(asD(x), asD(y))))
  ARITH(NegI32, sx32(static_cast<std::int32_t>(0u - static_cast<std::uint32_t>(x))))
  ARITH(NegU32, zx32(0u - static_cast<std::uint32_t>(x)))
  ARITH(NegI64, Slot{0} - x)
  ARITH(NegF32, fromF(-asF(x)))
  ARITH(NegF64, fromD(-asD(x)))
  ARITH(And, x & y)
  ARITH(Or, x | y)
  ARITH(Xor, x ^ y)
  ARITH(Not64, ~x)
  ARITH(NotB, Slot{x == 0})
  ARITH(ShlI32, sx32(static_cast<std::int32_t>(static_cast<std::uint32_t>(x) << (y & 31))))
  ARITH(ShrI32, sx32(static_cast<std::int32_t>(x) >> (y & 31)))
  ARITH(ShlU32, zx32(static_cast<std::uint32_t>(x) << (y & 31)))
  ARITH(ShrU32, zx32(static_cast<std::uint32_t>(x) >> (y & 31)))
  ARITH(ShlI64, x << (y & 63))
  ARITH(ShrI64, sx(static_cast<std::int64_t>(x) >> (y & 63)))
  ARITH(ShlU64, x << (y & 63))
  ARITH(ShrU64, x >> (y & 63))
  ARITH(NarrowI8, sx(static_cast<std::int8_t>(x)))
  ARITH(NarrowI16, sx(static_cast<std::int16_t>(x)))
  ARITH(NarrowI32, sx32(static_cast<std::int32_t>(x)))
  ARITH(NarrowU8, Slot{static_cast<std::uint8_t>(x)})
  ARITH(NarrowU16, Slot{static_cast<std::uint16_t>(x)})
  ARITH(NarrowU32, zx32(static_cast<std::uint32_t>(x)))
  ARITH(EqI, Slot{x == y})
  ARITH(NeI, Slot{x != y})
  ARITH(LtI, Slot{static_cast<std::int64_t>(x) < static_cast<std::int64_t>(y)})
  ARITH(LeI, Slot{static_cast<std::int64_t>(x) <= static_cast<std::int64_t>(y)})
  ARITH(LtU, Slot{x < y})
  ARITH(LeU, Slot{x <= y})
  ARITH(EqF32, Slot{asF(x) == asF(y)})
  ARITH(NeF32, Slot{asF(x) != asF(y)})
  ARITH(LtF32, Slot{asF(x) < asF(y)})
  ARITH(LeF32, Slot{asF(x) <= asF(y)})
  ARITH(EqF64, Slot{asD(x) == asD(y)})
  ARITH(NeF64, Slot{asD(x) != asD(y)})
  ARITH(LtF64, Slot{asD(x) < asD(y)})
  ARITH(LeF64, Slot{asD(x) <= asD(y)})
  ARITH(I64ToF64, fromD(static_cast<double>(static_cast<std::int64_t>(x))))
  ARITH(I64ToF32, fromF(static_cast<float>(static_cast<std::int64_t>(x))))
  ARITH(U64ToF64, fromD(static_cast<double>(x)))
  ARITH(U64ToF32, fromF(static_cast<float>(x)))
  ARITH(F64ToI64, sx(toI64(asD(x))))
  ARITH(F64ToU64, toU64(asD(x)))
  ARITH(F32ToI64, sx(toI64(static_cast<double>(asF(x)))))
  ARITH(F32ToU64, toU64(static_cast<double>(asF(x))))
  ARITH(F32ToF64, fromD(static_cast<double>(asF(x))))
  ARITH(F64ToF32, fromF(static_cast<float>(asD(x))))
  ARITH(SqrtF64, fromD(std::sqrt(asD(x))))
  ARITH(AbsF64, fromD(std::fabs(asD(x))))
  ARITH(FloorF64, fromD(std::floor(asD(x))))
  ARITH(CeilF64, fromD(std::ceil(asD(x))))
  ARITH(RoundF64, fromD(jsRound(asD(x))))
  ARITH(TruncF64, fromD(std::trunc(asD(x))))
  ARITH(SinF64, fromD(std::sin(asD(x))))
  ARITH(CosF64, fromD(std::cos(asD(x))))
  ARITH(TanF64, fromD(std::tan(asD(x))))
  ARITH(AtanF64, fromD(std::atan(asD(x))))
  ARITH(ExpF64, fromD(std::exp(asD(x))))
  ARITH(LnF64, fromD(std::log(asD(x))))

L_AddI32K: r[A] = sx32(static_cast<std::int32_t>(static_cast<std::uint32_t>(r[B]) + static_cast<std::uint32_t>(static_cast<std::int32_t>(immOf(w))))); NEXT();

// Fused compare-and-jump: word 0 holds the operands, word 1 (now at *pc) the absolute target.
#define FJ(name, cond) L_##name: { if (cond) pc = code + *pc; else ++pc; NEXT(); }
#define SI(x) static_cast<std::int64_t>(x)
  FJ(JEqI, r[A] == r[B]) FJ(JNeI, r[A] != r[B]) FJ(JLtI, SI(r[A]) < SI(r[B])) FJ(JLeI, SI(r[A]) <= SI(r[B]))
  FJ(JLtU, r[A] < r[B]) FJ(JLeU, r[A] <= r[B])
  FJ(JEqIK, SI(r[A]) == immOf(w)) FJ(JNeIK, SI(r[A]) != immOf(w)) FJ(JLtIK, SI(r[A]) < immOf(w))
  FJ(JLeIK, SI(r[A]) <= immOf(w)) FJ(JGtIK, SI(r[A]) > immOf(w)) FJ(JGeIK, SI(r[A]) >= immOf(w))
#undef FJ
#undef SI

L_Jmp: pc = code + axOf(w); NEXT();
L_JmpIf: if (r[A]) pc = code + dOf(w); NEXT();
L_JmpIfNot: if (!r[A]) pc = code + dOf(w); NEXT();
L_Call: {
  const Func* callee = &funcs[dOf(w)];
  Slot* nb = r + A;
  if (__builtin_expect(fp == framesEnd, 0)) TRAP("stack overflow");
  *fp++ = {pc, fn, r};
  r = nb; fn = callee; code = callee->code; pc = code;
  NEXT();
}
L_Ret: {
  Slot v = r[A];
  if (fp == frames.data()) goto done;
  const Frame& f = *--fp;
  r[0] = v;
  r = f.base; fn = f.fn; code = fn->code; pc = f.ret;
  NEXT();
}
L_RetV: {
  if (fp == frames.data()) goto done;
  const Frame& f = *--fp;
  r = f.base; fn = f.fn; code = fn->code; pc = f.ret;
  NEXT();
}
L_Throw: TRAP("uncaught exception");
L_New: {
  const ClassRT* cr = &classes[dOf(w)];
  auto* o = static_cast<Obj*>(std::calloc(1, sizeof(Obj) + cr->nfields * sizeof(Slot)));
  if (!o) TRAP("out of memory");
  o->cls = cr;
  allocated.push_back(o);
  r[A] = reinterpret_cast<Slot>(o);
  NEXT();
}
L_GetField: {
  auto* o = reinterpret_cast<Obj*>(r[B]);
  if (__builtin_expect(!o, 0)) TRAP("null reference");
  r[A] = o->fields()[C];
  NEXT();
}
L_SetField: {
  auto* o = reinterpret_cast<Obj*>(r[A]);
  if (__builtin_expect(!o, 0)) TRAP("null reference");
  o->fields()[C] = r[B];
  NEXT();
}
L_CallVirt: {
  auto* o = reinterpret_cast<Obj*>(r[A]);
  if (__builtin_expect(!o, 0)) TRAP("null reference");
  const Func* callee = o->cls->vtable[dOf(w)];
  if (__builtin_expect(fp == framesEnd, 0)) TRAP("stack overflow");
  *fp++ = {pc, fn, r};
  r = r + A; fn = callee; code = callee->code; pc = code;
  NEXT();
}
L_Downcast: {
  auto* o = reinterpret_cast<Obj*>(r[A]);
  if (o && !isSubclassRT(o->cls, dOf(w))) TRAP("invalid cast");
  NEXT();
}
L_LoadNull: r[A] = 0; NEXT();
L_InstanceOf: {
  auto* o = reinterpret_cast<Obj*>(r[A]);
  r[A] = Slot{o && isSubclassRT(o->cls, dOf(w))};
  NEXT();
}
L_EqR: r[A] = Slot{r[B] == r[C]}; NEXT();
L_NeR: r[A] = Slot{r[B] != r[C]}; NEXT();
L_GetGlobal: r[A] = globals[dOf(w)]; NEXT();
L_SetGlobal: globals[dOf(w)] = r[A]; NEXT();
L_LogI: out += std::to_string(static_cast<std::int64_t>(r[A])); NEXT();
L_LogU: out += std::to_string(r[A]); NEXT();
L_LogF64: { double d = asD(r[A]); out += (d == 0 && std::signbit(d)) ? std::string("-0") : numberToString(d); NEXT(); }  // console.log prints -0
L_LogF32: out += numberToString(static_cast<double>(asF(r[A]))); NEXT();
L_LogBool: out += r[A] ? "true" : "false"; NEXT();
L_LogSep: out += ' '; NEXT();
L_LogEnd: out += '\n'; NEXT();

fail:
  res.ok = false;
  res.error = err;
done:
  return res;
#undef NEXT
#undef A
#undef B
#undef C
#undef TRAP
#undef ARITH
#undef DIVLIKE
}

}  // namespace zn::vm
