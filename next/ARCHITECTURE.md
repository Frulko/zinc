# Zinc Next: architecture rules

Binding for every task. Source of truth for the layout: `docs/reports/zinc-next-design.md` §7. A change that breaks a rule
below needs a maintainer decision first, not a silent exception.

## Layout

```
next/
  include/zn/     shared headers (opcodes, value layouts, limits, ABI): the only place a constant is defined
  src/frontend/   lexer, parser, binder, checker, diagnostics
  src/ir/         typed SSA IR and passes
  src/zbc/        bytecode emitter
  src/vm/         interpreter
  src/aot/        ZBC → C++ emitter
  src/main.cpp    CLI wiring only, no logic
  tests/<tier>/   one executable <name>.sh per test, see TESTING.md
```

## Dependency direction

`include/zn` ← `frontend` ← `ir` ← `zbc` ← `vm` and `aot`. A module includes only modules to its left; `vm` and `aot` never
include each other. No cycles. `main.cpp` may include any module's public header.

## Rules

- One public header per module (`src/<module>/<module>.h`); everything else is private to the module.
- A constant (opcode, limit, layout) is defined once in `include/zn/`. Never redefine it elsewhere.
- No logic in `main.cpp`. No globals, no singletons: pass state explicitly.
- C++20, builds warning-free with `-Wall -Wextra` on clang and `zig c++`, clean under ASan/UBSan.
- Every module ships a T0 test in `tests/t0/` in the same commit.
- Do not touch `compiler/` except for fixes. Reuse `runtime/` through its existing headers, never copy it.
- Commits: English, conventional (`type(scope): imperative description`, no final period, 72 chars max, scope `next` or
  the module), no co-author, explicit paths only, task file in the same commit as its code.
