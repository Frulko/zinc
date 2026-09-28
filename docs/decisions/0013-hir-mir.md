# 0013 — HIR and MIR as inspection stages beside the direct emitter

**Context.** The spec orders the passes Frontend → Sema → HIR → monomorphisation → MIR (SSA) → optimisations →
emitter (section 6), with CMP-06 (typed, desugared HIR, golden tests on `--emit=hir`), CMP-08 (MIR in SSA with a
flow graph and passes: constants, dead code, inlining, devirtualisation, ranges, bounds, escape, RC optimisation)
and CMP-16 (`--emit=hir|mir|cpp|js`). Decision 0004 chose a direct AST → C++ emitter; it is 1500 lines, passes every
conformance program on seven targets, and leaves optimisation to Clang/GCC. Rewriting it over a MIR would be the
largest change of the prototype for no measured gain: the C++ compiler already folds constants, removes dead
code and inlines on the code we emit.

**Choice.** Build both stages for real, but as inspection stages the emitters do not consume yet:

- `compiler/src/hir.ts` lowers every user module into a typed tree using the same Sema queries as `emit-cpp.ts`.
  What the C++ emitter decides implicitly is explicit in HIR: conversions at coercion points (`num<f64->i32>`,
  `dyn.check`, `dyn.box`, `downcast`), cells for mutated captures, calls followed by an error check (`check call`,
  RT-05), static/method/virtual/closure/builtin calls, parameter properties as field stores, and desugaring of
  for-of (index loop, slot loop, `step()`), destructuring, templates (`concat`), `?.`/`??`/`&&`/`||` (conditionals on
  temporaries), compound assignment, switch without fall-through (if chain), async/generators (numbered suspend
  points, the state machine of decision 0007). Unsupported corners print as `opaque{...}` instead of failing.
- `compiler/src/mir.ts` lowers HIR functions to SSA on a CFG (Braun et al., on-the-fly phis with sealed blocks and
  trivial-phi removal), then runs constant folding with branch pruning, unreachable-block removal, straight-line
  block merging and dead code elimination, and reports what each pass did per function.
- `zinc build --emit=hir|mir` prints them; `tests/golden/ir.ts` keeps golden dumps checked by `zinc test`
  (`--update-golden` rewrites them, TST-03).

**Not done, and why.** MIR skips functions with `try/catch`, `async` or generators (listed with a note): modelling
the error edges of RT-05 and the resume edges of 0007 costs more than the dump is worth while the C++ path owns
them. Monomorphisation stays C++ templates (0004). The remaining CMP-08 passes (inlining, devirtualisation,
ranges `number → i32`, bounds, escape, RC optimisation) are not written; LNG-04 loop counters and arena escape
checks keep their current homes in Sema and the runtime.

**Path to real stages.** HIR is a pure function of Sema, so the emitter can switch one construct at a time: first
statements and control flow (the HIR shapes match what `stmtInner` builds), then expressions with their explicit
conversions, deleting the matching AST code in `emit-cpp.ts` and `emit-js.ts` as it goes. MIR becomes worth feeding
to the emitters when a pass pays for itself where Clang cannot help: RC elision (0001) and escape analysis for
arenas are the candidates.
