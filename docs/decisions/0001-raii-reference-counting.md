# 0001 — Reference counting through a C++ smart pointer (temporary)

**Context.** MEM-03 asks for non-atomic reference counting *inserted by the compiler*, with borrowed locals and
merged inc/dec pairs. That needs an IR where ownership can be analysed (MIR, CMP-08), which does not exist yet.

**Options.** (a) Build MIR first, then emit explicit retain/release. (b) Emit a `zrt::Ref<T>` smart pointer whose
copy/destroy adjust the count (RAII), and move to (a) later.

**Choice.** (b). Objects carry a 32-bit count (saturated value = immortal, MEM-02), start at 1 during construction and are
adopted by `zrt::make`. Strings and arrays use the same scheme with their own headers; string literals are constant-initialized
and immortal (MEM-05).

**Consequences.** Correct counting with little compiler work, but more inc/dec than necessary (parameters are passed by value,
no borrowing). Cycles leak, as in the target design, until `@weak` exists. The emitted C++ keeps the same shape, so switching
to explicit counting only changes `emit-cpp.ts` and `zrt.h`.
