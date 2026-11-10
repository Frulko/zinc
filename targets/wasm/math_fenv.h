#pragma once
// WebAssembly always rounds to nearest and has no floating-point exception flags. Keep CORE-MATH's other rounding cases unreachable.
#include <fenv.h>
#define FE_DOWNWARD 1
#define FE_UPWARD 2
#define FE_TOWARDZERO 3
#define FE_INEXACT 0
#define FE_UNDERFLOW 0
#define FE_DIVBYZERO 0
#define FE_INVALID 0
