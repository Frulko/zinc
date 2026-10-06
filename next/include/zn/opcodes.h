#pragma once
// ZBC opcodes: typed register bytecode, defined once so the emitter, verifier, interpreter, AOT and disassembler cannot
// drift. Registers hold 64-bit slots of one of three classes: I (integers of every width, sign- or zero-extended to
// canonical form, and booleans), S (f32 bits), D (f64). Operations are typed, so the interpreter checks no tags; the
// verifier proves every register has the class its use expects.
//
// X(Name, Format, inB, inC, out): `inB`/`inC` are the classes read from operands B and C, `out` the class written to A
// ('_' none, 'M' special-cased by the verifier, e.g. Move, Call, Ret, and everything that touches references).
// Object operations: New A,class | GetField A,B,idx (A = B.field idx) | SetField A,B,idx (A.field idx = B) |
// CallVirt A,selector (receiver in r[A], window like Call) | Downcast A,class (r[A] = r[A] checked as the class; the
// register keeps the value and gains the class) | EqR/NeR compare references | LoadNull A,class (r[A] = null, typed as
// the class) | InstanceOf A,class (r[A] = r[A] is a non-null instance of the class, as an integer).
// Strings, arrays, Map and Set are objects of builtin classes: LoadStr A,string | New A,class (an empty array, Map or Set) |
// ArrGet A,B,C (A = B[C]) | ArrSet A,B,C (A[B] = C) | ArrLen A,B | ArrPush A,B,C (B.push(C), A = new length) | LogStr A |
// Rt A,id (the runtime call `id` of zn/runtime.h: arguments in r[A..], result in r[A], a call window like Call).
#include <cstdint>

#define ZN_OPCODES(X)                                                                                           \
  X(Nop, OP, _, _, _) X(Trap, OP, _, _, _)                                                                      \
  X(Move, ABC, M, _, M) X(LoadI, AD, _, _, I) X(LoadK, AD, _, _, M)                                             \
  X(AddI32, ABC, I, I, I) X(SubI32, ABC, I, I, I) X(MulI32, ABC, I, I, I) X(DivI32, ABC, I, I, I) X(RemI32, ABC, I, I, I) \
  X(AddU32, ABC, I, I, I) X(SubU32, ABC, I, I, I) X(MulU32, ABC, I, I, I) X(DivU32, ABC, I, I, I) X(RemU32, ABC, I, I, I) \
  X(AddI64, ABC, I, I, I) X(SubI64, ABC, I, I, I) X(MulI64, ABC, I, I, I) X(DivI64, ABC, I, I, I) X(RemI64, ABC, I, I, I) \
  X(AddU64, ABC, I, I, I) X(SubU64, ABC, I, I, I) X(MulU64, ABC, I, I, I) X(DivU64, ABC, I, I, I) X(RemU64, ABC, I, I, I) \
  X(AddF32, ABC, S, S, S) X(SubF32, ABC, S, S, S) X(MulF32, ABC, S, S, S) X(DivF32, ABC, S, S, S) X(RemF32, ABC, S, S, S) \
  X(AddF64, ABC, D, D, D) X(SubF64, ABC, D, D, D) X(MulF64, ABC, D, D, D) X(DivF64, ABC, D, D, D) X(RemF64, ABC, D, D, D) \
  X(PowF64, ABC, D, D, D) X(Atan2F64, ABC, D, D, D) X(MinF64, ABC, D, D, D) X(MaxF64, ABC, D, D, D)             \
  X(NegI32, ABC, I, _, I) X(NegU32, ABC, I, _, I) X(NegI64, ABC, I, _, I) X(NegF32, ABC, S, _, S) X(NegF64, ABC, D, _, D) \
  X(And, ABC, I, I, I) X(Or, ABC, I, I, I) X(Xor, ABC, I, I, I) X(Not64, ABC, I, _, I) X(NotB, ABC, I, _, I)   \
  X(ShlI32, ABC, I, I, I) X(ShrI32, ABC, I, I, I) X(ShlU32, ABC, I, I, I) X(ShrU32, ABC, I, I, I)             \
  X(ShlI64, ABC, I, I, I) X(ShrI64, ABC, I, I, I) X(ShlU64, ABC, I, I, I) X(ShrU64, ABC, I, I, I)             \
  X(NarrowI8, ABC, I, _, I) X(NarrowI16, ABC, I, _, I) X(NarrowI32, ABC, I, _, I)                              \
  X(NarrowU8, ABC, I, _, I) X(NarrowU16, ABC, I, _, I) X(NarrowU32, ABC, I, _, I)                              \
  X(EqI, ABC, I, I, I) X(NeI, ABC, I, I, I) X(LtI, ABC, I, I, I) X(LeI, ABC, I, I, I) X(LtU, ABC, I, I, I) X(LeU, ABC, I, I, I) \
  X(EqF32, ABC, S, S, I) X(NeF32, ABC, S, S, I) X(LtF32, ABC, S, S, I) X(LeF32, ABC, S, S, I)                  \
  X(EqF64, ABC, D, D, I) X(NeF64, ABC, D, D, I) X(LtF64, ABC, D, D, I) X(LeF64, ABC, D, D, I)                  \
  X(I64ToF64, ABC, I, _, D) X(I64ToF32, ABC, I, _, S) X(U64ToF64, ABC, I, _, D) X(U64ToF32, ABC, I, _, S)       \
  X(F64ToI64, ABC, D, _, I) X(F64ToU64, ABC, D, _, I) X(F32ToI64, ABC, S, _, I) X(F32ToU64, ABC, S, _, I)       \
  X(F32ToF64, ABC, S, _, D) X(F64ToF32, ABC, D, _, S)                                                           \
  X(SqrtF64, ABC, D, _, D) X(AbsF64, ABC, D, _, D) X(FloorF64, ABC, D, _, D) X(CeilF64, ABC, D, _, D)           \
  X(RoundF64, ABC, D, _, D) X(TruncF64, ABC, D, _, D) X(SinF64, ABC, D, _, D) X(CosF64, ABC, D, _, D)           \
  X(TanF64, ABC, D, _, D) X(AtanF64, ABC, D, _, D) X(ExpF64, ABC, D, _, D) X(LnF64, ABC, D, _, D)              \
  X(AddI32K, ABK, I, _, I)                                                                                      \
  X(Jmp, AX, _, _, _) X(JmpIf, AD, _, _, _) X(JmpIfNot, AD, _, _, _)                                           \
  X(JEqI, AB2, _, _, _) X(JNeI, AB2, _, _, _) X(JLtI, AB2, _, _, _) X(JLeI, AB2, _, _, _)                      \
  X(JLtU, AB2, _, _, _) X(JLeU, AB2, _, _, _)                                                                   \
  X(JEqIK, AK2, _, _, _) X(JNeIK, AK2, _, _, _) X(JLtIK, AK2, _, _, _) X(JLeIK, AK2, _, _, _)                  \
  X(JGtIK, AK2, _, _, _) X(JGeIK, AK2, _, _, _)                                                                 \
  X(Call, AD, _, _, M) X(Ret, ABC, _, _, M) X(RetV, OP, _, _, _) X(Throw, ABC, _, _, _)                         \
  X(New, AD, _, _, M) X(GetField, ABC, M, _, M) X(SetField, ABC, M, _, _) X(CallVirt, AD, _, _, M)               \
  X(Downcast, AD, _, _, M) X(EqR, ABC, M, M, I) X(NeR, ABC, M, M, I) X(LoadNull, AD, _, _, M) X(InstanceOf, AD, _, _, M)                                            \
  X(GetGlobal, AD, _, _, M) X(SetGlobal, AD, _, _, M)                                                           \
  X(LoadStr, AD, _, _, M) X(ArrGet, ABC, M, I, M) X(ArrSet, ABC, I, M, _) X(ArrLen, ABC, M, _, I) X(ArrPush, ABC, M, M, I) \
  X(Rt, AD, _, _, M) X(LogStr, ABC, _, _, _)                                                                    \
  X(LogI, ABC, _, _, _) X(LogU, ABC, _, _, _) X(LogF64, ABC, _, _, _) X(LogF32, ABC, _, _, _) X(LogBool, ABC, _, _, _) \
  X(LogSep, OP, _, _, _) X(LogEnd, OP, _, _, _)

namespace zn {

enum class Op : std::uint8_t {
#define X(name, fmt, b, c, out) name,
  ZN_OPCODES(X)
#undef X
  Count
};

// OP: no operands. ABC: three registers. AD: register + 16-bit. AX: 24-bit. ABK: registers A,B + signed 8-bit immediate C.
// AB2 and AK2 are two-word fused compare-and-jump: word 0 holds the compared registers A,B (AB2) or A and an 8-bit
// immediate C (AK2), word 1 the absolute jump target.
enum class Fmt : std::uint8_t { OP, ABC, AD, AX, ABK, AB2, AK2 };
enum class RC : std::uint8_t { None, I, S, D, M };  // register class expected or produced

struct OpInfo {
  const char* name;
  Fmt fmt;
  RC inB, inC, out;
};

namespace detail {
inline constexpr RC _ = RC::None;
inline constexpr RC I = RC::I;
inline constexpr RC S = RC::S;
inline constexpr RC D = RC::D;
inline constexpr RC M = RC::M;
}  // namespace detail

inline constexpr OpInfo kOpInfo[] = {
#define X(name, fmt, b, c, out) {#name, Fmt::fmt, detail::b, detail::c, detail::out},
    ZN_OPCODES(X)
#undef X
};

inline constexpr const OpInfo& opInfo(Op o) { return kOpInfo[static_cast<unsigned>(o)]; }

// Instruction length in 32-bit words.
inline constexpr unsigned instrLen(Op o) { return (opInfo(o).fmt == Fmt::AB2 || opInfo(o).fmt == Fmt::AK2) ? 2 : 1; }

}  // namespace zn
