#pragma once
// The value semantics of every pure register operation of ZBC, defined once. The interpreter's dispatch loop and the C++
// the AOT emitter writes both call these functions, so the tiers cannot disagree on wrap-around, NaN, division or
// conversion rules (the design's `step<O,T>`: one definition per operation, specialised by the opcode's type).
#include <cmath>
#include <cstdint>
#include <bit>

#include "zn/value.h"

namespace zn::ops {

inline double asD(Slot s) { return std::bit_cast<double>(s); }
inline Slot fromD(double d) { return std::bit_cast<Slot>(d); }
inline float asF(Slot s) { return std::bit_cast<float>(static_cast<std::uint32_t>(s)); }
inline Slot fromF(float f) { return static_cast<Slot>(std::bit_cast<std::uint32_t>(f)); }
inline Slot sx(std::int64_t v) { return static_cast<Slot>(v); }
inline Slot sx32(std::int32_t v) { return static_cast<Slot>(static_cast<std::int64_t>(v)); }
inline Slot zx32(std::uint32_t v) { return static_cast<Slot>(v); }

inline std::int64_t toI64(double x) {
  if (x != x) return 0;
  if (x >= 9223372036854775807.0) return INT64_MAX;
  if (x <= -9223372036854775808.0) return INT64_MIN;
  return static_cast<std::int64_t>(x);
}
inline std::uint64_t toU64(double x) {
  if (x != x) return 0;
  if (x < 0) return static_cast<std::uint64_t>(toI64(x));
  if (x >= 18446744073709551616.0) return UINT64_MAX;
  return static_cast<std::uint64_t>(x);
}
inline double jsRound(double x) {  // round half toward +infinity
  double f = std::floor(x);
  return x - f >= 0.5 ? f + 1 : f;
}
inline double jsMin(double a, double b) { return (a != a || b != b) ? NAN : a == b ? (std::signbit(a) ? a : b) : (a < b ? a : b); }  // min(0, -0) is -0
inline double jsMax(double a, double b) { return (a != a || b != b) ? NAN : a == b ? (std::signbit(a) ? b : a) : (a > b ? a : b); }  // max(-0, 0) is 0

// X(Name, expression over the operand slots x and y): the register operations that cannot fail.
#define ZN_ARITH_OPS(X) \
  X(AddI32, sx32(static_cast<std::int32_t>(static_cast<std::uint32_t>(x) + static_cast<std::uint32_t>(y)))) \
  X(SubI32, sx32(static_cast<std::int32_t>(static_cast<std::uint32_t>(x) - static_cast<std::uint32_t>(y)))) \
  X(MulI32, sx32(static_cast<std::int32_t>(static_cast<std::uint32_t>(x) * static_cast<std::uint32_t>(y)))) \
  X(AddU32, zx32(static_cast<std::uint32_t>(x) + static_cast<std::uint32_t>(y))) \
  X(SubU32, zx32(static_cast<std::uint32_t>(x) - static_cast<std::uint32_t>(y))) \
  X(MulU32, zx32(static_cast<std::uint32_t>(x) * static_cast<std::uint32_t>(y))) \
  X(AddI64, x + y) \
  X(SubI64, x - y) \
  X(MulI64, x * y) \
  X(AddU64, x + y) \
  X(SubU64, x - y) \
  X(MulU64, x * y) \
  X(AddF32, fromF(asF(x) + asF(y))) \
  X(SubF32, fromF(asF(x) - asF(y))) \
  X(MulF32, fromF(asF(x) * asF(y))) \
  X(DivF32, fromF(asF(x) / asF(y))) \
  X(RemF32, fromF(std::fmod(asF(x), asF(y)))) \
  X(AddF64, fromD(asD(x) + asD(y))) \
  X(SubF64, fromD(asD(x) - asD(y))) \
  X(MulF64, fromD(asD(x) * asD(y))) \
  X(DivF64, fromD(asD(x) / asD(y))) \
  X(RemF64, fromD(std::fmod(asD(x), asD(y)))) \
  X(PowF64, fromD(std::pow(asD(x), asD(y)))) \
  X(Atan2F64, fromD(std::atan2(asD(x), asD(y)))) \
  X(HypotF64, fromD(std::hypot(asD(x), asD(y)))) \
  X(MinF64, fromD(jsMin(asD(x), asD(y)))) \
  X(MaxF64, fromD(jsMax(asD(x), asD(y)))) \
  X(NegI32, sx32(static_cast<std::int32_t>(0u - static_cast<std::uint32_t>(x)))) \
  X(NegU32, zx32(0u - static_cast<std::uint32_t>(x))) \
  X(NegI64, Slot{0} - x) \
  X(NegF32, fromF(-asF(x))) \
  X(NegF64, fromD(-asD(x))) \
  X(And, x & y) \
  X(Or, x | y) \
  X(Xor, x ^ y) \
  X(Not64, ~x) \
  X(NotB, Slot{x == 0}) \
  X(ShlI32, sx32(static_cast<std::int32_t>(static_cast<std::uint32_t>(x) << (y & 31)))) \
  X(ShrI32, sx32(static_cast<std::int32_t>(x) >> (y & 31))) \
  X(ShlU32, zx32(static_cast<std::uint32_t>(x) << (y & 31))) \
  X(ShrU32, zx32(static_cast<std::uint32_t>(x) >> (y & 31))) \
  X(ShlI64, x << (y & 63)) \
  X(ShrI64, sx(static_cast<std::int64_t>(x) >> (y & 63))) \
  X(ShlU64, x << (y & 63)) \
  X(ShrU64, x >> (y & 63)) \
  X(NarrowI8, sx(static_cast<std::int8_t>(x))) \
  X(NarrowI16, sx(static_cast<std::int16_t>(x))) \
  X(NarrowI32, sx32(static_cast<std::int32_t>(x))) \
  X(NarrowU8, Slot{static_cast<std::uint8_t>(x)}) \
  X(NarrowU16, Slot{static_cast<std::uint16_t>(x)}) \
  X(NarrowU32, zx32(static_cast<std::uint32_t>(x))) \
  X(EqI, Slot{x == y}) \
  X(NeI, Slot{x != y}) \
  X(LtI, Slot{static_cast<std::int64_t>(x) < static_cast<std::int64_t>(y)}) \
  X(LeI, Slot{static_cast<std::int64_t>(x) <= static_cast<std::int64_t>(y)}) \
  X(LtU, Slot{x < y}) \
  X(LeU, Slot{x <= y}) \
  X(EqF32, Slot{asF(x) == asF(y)}) \
  X(NeF32, Slot{asF(x) != asF(y)}) \
  X(LtF32, Slot{asF(x) < asF(y)}) \
  X(LeF32, Slot{asF(x) <= asF(y)}) \
  X(EqF64, Slot{asD(x) == asD(y)}) \
  X(NeF64, Slot{asD(x) != asD(y)}) \
  X(LtF64, Slot{asD(x) < asD(y)}) \
  X(LeF64, Slot{asD(x) <= asD(y)}) \
  X(I64ToF64, fromD(static_cast<double>(static_cast<std::int64_t>(x)))) \
  X(I64ToF32, fromF(static_cast<float>(static_cast<std::int64_t>(x)))) \
  X(U64ToF64, fromD(static_cast<double>(x))) \
  X(U64ToF32, fromF(static_cast<float>(x))) \
  X(F64ToI64, sx(toI64(asD(x)))) \
  X(F64ToU64, toU64(asD(x))) \
  X(F32ToI64, sx(toI64(static_cast<double>(asF(x))))) \
  X(F32ToU64, toU64(static_cast<double>(asF(x)))) \
  X(F32ToF64, fromD(static_cast<double>(asF(x)))) \
  X(F64ToF32, fromF(static_cast<float>(asD(x)))) \
  X(SqrtF64, fromD(std::sqrt(asD(x)))) \
  X(AbsF64, fromD(std::fabs(asD(x)))) \
  X(FloorF64, fromD(std::floor(asD(x)))) \
  X(CeilF64, fromD(std::ceil(asD(x)))) \
  X(RoundF64, fromD(jsRound(asD(x)))) \
  X(TruncF64, fromD(std::trunc(asD(x)))) \
  X(SinF64, fromD(std::sin(asD(x)))) \
  X(CosF64, fromD(std::cos(asD(x)))) \
  X(TanF64, fromD(std::tan(asD(x)))) \
  X(AtanF64, fromD(std::atan(asD(x)))) \
  X(ExpF64, fromD(std::exp(asD(x)))) \
  X(LnF64, fromD(std::log(asD(x)))) \
  X(CbrtF64, fromD(std::cbrt(asD(x)))) \
  X(Log2F64, fromD(std::log2(asD(x)))) \
  X(Log10F64, fromD(std::log10(asD(x)))) \
  X(Log1pF64, fromD(std::log1p(asD(x)))) \
  X(Expm1F64, fromD(std::expm1(asD(x)))) \
  X(AsinF64, fromD(std::asin(asD(x)))) \
  X(AcosF64, fromD(std::acos(asD(x)))) \
  X(SinhF64, fromD(std::sinh(asD(x)))) \
  X(CoshF64, fromD(std::cosh(asD(x)))) \
  X(TanhF64, fromD(std::tanh(asD(x))))

// X(Name, condition that the operation is defined, expression): division and remainder trap when the condition fails.
#define ZN_DIV_OPS(X) \
  X(DivI32, static_cast<std::int32_t>(y) != 0, (static_cast<std::int32_t>(x) == INT32_MIN && static_cast<std::int32_t>(y) == -1) ? sx32(INT32_MIN) : sx32(static_cast<std::int32_t>(x) / static_cast<std::int32_t>(y))) \
  X(RemI32, static_cast<std::int32_t>(y) != 0, (static_cast<std::int32_t>(y) == -1) ? Slot{0} : sx32(static_cast<std::int32_t>(x) % static_cast<std::int32_t>(y))) \
  X(DivU32, static_cast<std::uint32_t>(y) != 0, zx32(static_cast<std::uint32_t>(x) / static_cast<std::uint32_t>(y))) \
  X(RemU32, static_cast<std::uint32_t>(y) != 0, zx32(static_cast<std::uint32_t>(x) % static_cast<std::uint32_t>(y))) \
  X(DivI64, y != 0, (static_cast<std::int64_t>(x) == INT64_MIN && static_cast<std::int64_t>(y) == -1) ? x : sx(static_cast<std::int64_t>(x) / static_cast<std::int64_t>(y))) \
  X(RemI64, y != 0, (static_cast<std::int64_t>(y) == -1) ? Slot{0} : sx(static_cast<std::int64_t>(x) % static_cast<std::int64_t>(y))) \
  X(DivU64, y != 0, x / y) \
  X(RemU64, y != 0, x % y)

#define X(name, expr) inline Slot name([[maybe_unused]] Slot x, [[maybe_unused]] Slot y) { return expr; }
ZN_ARITH_OPS(X)
#undef X
#define X(name, zero, expr) inline bool name##Defined([[maybe_unused]] Slot x, [[maybe_unused]] Slot y) { return zero; } inline Slot name(Slot x, Slot y) { return expr; }
ZN_DIV_OPS(X)
#undef X

// Fused compare-and-jump conditions over two slots, and over a slot and an immediate.
#define ZN_JUMP_OPS(X) \
  X(JEqI, a == b) X(JNeI, a != b) X(JLtI, static_cast<std::int64_t>(a) < static_cast<std::int64_t>(b)) X(JLeI, static_cast<std::int64_t>(a) <= static_cast<std::int64_t>(b)) \
  X(JLtU, a < b) X(JLeU, a <= b) \
  /* f64 compares; the negated forms differ from the opposite compare when an operand is NaN */ \
  X(JEqF, asD(a) == asD(b)) X(JNeF, asD(a) != asD(b)) X(JLtF, asD(a) < asD(b)) X(JLeF, asD(a) <= asD(b)) \
  X(JNLtF, !(asD(a) < asD(b))) X(JNLeF, !(asD(a) <= asD(b)))
#define X(name, cond) inline bool name(Slot a, Slot b) { return cond; }
ZN_JUMP_OPS(X)
#undef X
#define ZN_JUMP_IMM_OPS(X) \
  X(JEqIK, static_cast<std::int64_t>(a) == k) X(JNeIK, static_cast<std::int64_t>(a) != k) X(JLtIK, static_cast<std::int64_t>(a) < k) \
  X(JLeIK, static_cast<std::int64_t>(a) <= k) X(JGtIK, static_cast<std::int64_t>(a) > k) X(JGeIK, static_cast<std::int64_t>(a) >= k)
#define X(name, cond) inline bool name(Slot a, std::int64_t k) { return cond; }
ZN_JUMP_IMM_OPS(X)
#undef X

inline Slot AddI32K(Slot x, std::int64_t k) { return sx32(static_cast<std::int32_t>(static_cast<std::uint32_t>(x) + static_cast<std::uint32_t>(static_cast<std::int32_t>(k)))); }

}  // namespace zn::ops
