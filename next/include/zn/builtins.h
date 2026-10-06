#pragma once
// Builtins of the subset: the host/runtime surface the IR calls and the VM must implement. Defined once here so the
// compiler and the VM cannot disagree on names, order or arity.
// X(Id, "name", arity); arity -1 is variadic.
#define ZN_BUILTINS(X)                                                                                            \
  X(ConsoleLog, "console.log", -1) X(MathSqrt, "Math.sqrt", 1) X(MathAbs, "Math.abs", 1) X(MathFloor, "Math.floor", 1) \
  X(MathCeil, "Math.ceil", 1) X(MathRound, "Math.round", 1) X(MathTrunc, "Math.trunc", 1) X(MathSin, "Math.sin", 1)  \
  X(MathCos, "Math.cos", 1) X(MathTan, "Math.tan", 1) X(MathAtan, "Math.atan", 1) X(MathExp, "Math.exp", 1)          \
  X(MathLog, "Math.log", 1) X(MathPow, "Math.pow", 2) X(MathAtan2, "Math.atan2", 2) X(MathMin, "Math.min", 2)        \
  X(MathMax, "Math.max", 2) X(NumToFixed, "Number.toFixed", 2) \
  X(MathCbrt, "Math.cbrt", 1) X(MathLog2, "Math.log2", 1) X(MathLog10, "Math.log10", 1) X(MathLog1p, "Math.log1p", 1) X(MathExpm1, "Math.expm1", 1) X(MathAsin, "Math.asin", 1) X(MathAcos, "Math.acos", 1) X(MathSinh, "Math.sinh", 1) X(MathCosh, "Math.cosh", 1) X(MathTanh, "Math.tanh", 1) X(MathHypot, "Math.hypot", 2)

