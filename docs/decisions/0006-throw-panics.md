# 0006 — Exceptions as status returns (superseded the initial "throw panics")

**Choice.** A thrown `Error` is stored in `zrt::g_err`; after every call that *may* throw (whole-program analysis of
throwing functions, `@throws` library functions, dynamic calls when some lambda throws) the emitter inserts a check
that jumps to the innermost `catch` label or returns early (GCC/Clang statement expressions). `finally` and `using`
are C++ scope guards that preserve a pending error. Runtime faults (bounds, null, division by zero) still panic.

**Consequences.** No C++ exceptions, zero cost in programs that never throw, precise JS semantics for the covered cases.
Array callbacks stop at the first error. `finally` is not supported inside async functions yet.
