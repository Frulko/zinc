# 0004 — Emit C++ directly from the checked AST, in one translation unit

**Context.** CMP-06/08 describe HIR and MIR (SSA) stages; CMP-09 asks for one `.cpp`/`.h` pair per module. The first increment
aims at an end-to-end path.

**Choice.** `emit-cpp.ts` walks the TypeScript AST with the types computed by `sema.ts` and writes a single `zinc_main.cpp`:
string literal pool, forward declarations, classes in inheritance order, globals, prototypes, bodies, one `__init`/`__deinit`
per module (C++ namespace `m_<path>`), then `main`. Generics become C++ templates.

**Consequences.** No optimisation passes of our own (the C++ compiler does the work), no `--emit=hir|mir`, and whole-program
compilation comes for free (CMP-12 is approximated by `-ffunction-sections` + dead-strip). HIR/MIR will be introduced between
Sema and the emitters without changing the runtime.
