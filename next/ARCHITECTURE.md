# Zinc Next: architecture rules

Binding for every task. Source of truth for the layout: `docs/reports/zinc-next-design.md` §7. A change that breaks a rule
below needs a maintainer decision first, not a silent exception.

## Layout

```
next/
  include/zn/     shared headers (opcodes, value layouts, limits, ABI, ops.h: the value semantics of every pure operation): the only place a constant or an operation is defined
  src/frontend/   lexer, parser, binder, checker, diagnostics
  src/ir/         typed SSA IR and passes
  src/zbc/        bytecode emitter
  src/rt/         the runtime both engines share: machine, objects, reference counting, runtime calls (ZN-022)
  src/vm/         interpreter (provides Machine::exec by dispatching bytecode)
  src/aot/        ZBC → C++ emitter; the C++ it writes calls include/zn/ops.h and links src/rt
  src/host/       the graphics host (ZN-027): the existing runtime (runtime/: zrt, raster, gfx) behind the `zn::host::Gfx` table of include/zn/host.h; optional (ZN_HOST_GFX), built with the runtime's own flags
  src/prof/       the profilers of the interpreter (zinc profile, zinc mem, ZN-046); includes rt and vm, only main includes it
  src/tc/         the toolchain manager (ZN-029): the pinned `zig c++`, its checksum-verified download, cross builds; depends on nothing of the engine
  src/main.cpp    CLI wiring only, no logic
  tests/<tier>/   one executable <name>.sh per test, see TESTING.md
```

## Dependency direction

`include/zn` ← `frontend` ← `ir` ← `zbc` ← `rt` ← `vm`, and `zbc` ← `aot`. `host` includes only `include/zn` (the table) and the old `runtime/` headers; `rt` calls it through the table, never links it. A module includes only modules to its left; `vm` and `aot`
never include each other. The programs `aot` writes include `include/zn` and `rt` (they are not part of `aot`). No cycles. `main.cpp` may include any module's public header.

## Rules

- One public header per module (`src/<module>/<module>.h`); everything else is private to the module.
- A constant (opcode, limit, layout) or the semantics of a pure operation is defined once in `include/zn/`. Never redefine it elsewhere: the interpreter and the AOT output call `zn::ops`.
- No logic in `main.cpp`. No globals, no singletons: pass state explicitly.
- C++20, builds warning-free with `-Wall -Wextra` on clang and `zig c++`, clean under ASan/UBSan.
- Every module ships a T0 test in `tests/t0/` in the same commit.
- Prefer a proven library to our own code (JSON, number formatting, allocator, regex, Unicode, hashing, compression...). A dependency is vendored under `third_party/<name>/` with its licence and a pinned version, builds with clang and `zig c++`, needs no install step for the user, and is listed in `third_party/README.md`. Write our own only when no mature library fits, and say why in the task notes.
- Do not touch `compiler/` except for fixes. Reuse `runtime/` through its existing headers, never copy it.
- Commits: English, conventional (`type(scope): imperative description`, no final period, 72 chars max, scope `next` or
  the module), no co-author, explicit paths only, task file in the same commit as its code.

## Harness (used by /zn-start, /zn-end and loops)

- `next/tools/next-task`: prints `TASK ZN-xxx <title>` or `STOP <reason>` (gate, decision, nothing left). Never pick a task any other way.
- `next/tools/usage`: prints the session token usage line to paste into the task notes (estimate, not `/usage`).
- `next/tests/run --tier t0|t1|t2 [--only name]`: quiet runner, details in `next/.logs/`.
- Loop contract: one invocation = one task, ending with `NEXT: ZN-xxx` or `STOP: <reason>` on the last line.
