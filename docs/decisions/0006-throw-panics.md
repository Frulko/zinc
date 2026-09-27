# 0006 — `throw` panics; `try/catch` refused for now

**Context.** RT-05 lowers exceptions to status returns tested by callers, with `finally` and `using` on every path.
This touches every call site and is best done on MIR.

**Choice.** `throw new Error(msg)` compiles to a panic carrying the message and the `.ts` file and line (RT-06), identically
in sim (exit code 101). `try` produces diagnostic `Z9006`.

**Consequences.** Programs that recover from errors do not compile yet; nothing silently behaves differently.
