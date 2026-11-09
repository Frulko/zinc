---
id: ZN-796
title: Typed numbers agree on --engine quickjs
status: Review
assignee:
  - '@parallel'
created_date: '2026-10-24 23:55'
updated_date: '2026-11-09 01:15'
labels:
  - size-M
milestone: m-13
dependencies: []
ordinal: 8500
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From backlog/later.md, promoted by the review of 2026-10-25 (docs/reports/backlog-review-2026-10-25.md). The lines it carries:

- ZN-724: a typed program gives other numbers on `--engine quickjs` than on the interpreter: `i32` 2147483647 + 1 prints 2147483648 (interpreter -2147483648), `u8` 250 + 10 prints 260 (4), `f32` 0.1 + 0.2 prints 0.30000000000000004 (0.30000001192092896); `src/qjs/strip.cpp` blanks the types and emits no wrap or rounding. The engines are meant to agree; MicroTS wraps and rounds in its emitted JavaScript (docs/reports/microts-vs-zinc.md).
- From ZN-1009 (2026-11-08): a number assigned to an i32 is not truncated on QuickJS (`let z: i32 = 1; z = 7 / 2` prints 3.5, the interpreter and AOT 3); inferred i32 locals need the checker's types in the transform, the same mechanism as the wraps above.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 i32/u8 overflow wraps and f32 rounds on QuickJS as on the interpreter (2147483647+1, 250+10, 0.1f+0.2f), and i32 division truncates (`z = 7 / 2` is 3)
- [ ] #2 tools/diff-matrix shows no numeric DIFF for the QuickJS column on a new numeric fixture
- [ ] #3 no slowdown measured with bench-gate on the QuickJS kernels
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-09 (worktree agent). Web search: AssemblyScript portable output and asm.js use the same coercions (`|0`, `>>>0`, `&0xff`, `<<24>>24`, `Math.fround`); `(a*b)|0` loses low bits past 2^53, so i32/u32 multiply is `Math.imul` (https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Math/imul, https://app.unpkg.com/assemblyscript@0.28.2/files/std/portable/index.d.ts, https://chromium.googlesource.com/external/github.com/WebAssembly/binaryen/+/HEAD/test/wasm2js/conversions-modified.2asm.js). QuickJS keeps int32 tagged, so `|0` on an int is one fast opcode; Math.imul/Math.fround are C calls with a property lookup each.

Done: `numberKindsForJs` in src/qjs/strip.cpp runs before the types are erased (only on a file naming i8/i16/i32/u8/u16/u32/f32). It follows check.cpp's `arith` and `assignable`: i32/u32 `+ - %` and unary minus wrap (`((a + 1)|0)`, dropped under a bitwise operator, a same-kind `+`/`-` chain, Math.imul or an integer store), i32/u32 `*` is `Math.imul`, f32 arithmetic `Math.fround`, every store into an integer or f32 slot converts (declarations, `=`, compound assignments rewritten `c = ((c + (v))&255)`, narrow `++`/`--`, returns, arguments of the file's functions and `this` methods, `as i32`, elements of a `T[]` literal). Kinds are syntactic, scoped: annotated variables, params, returns, `this` fields, `T[]` variables, the file's functions and `const f = (..) => ..`, and unannotated variables from a typed initialiser. Decision (for the record): syntactic kinds in the transform rather than the checker's types: the checker works on the whole merged program and rewrites nodes, the QuickJS bundle transforms file by file and accepts code the checker refuses (npm TypeScript). Left alone (ponytail): i32/u32 `++`/`--` (wrap only past 2^31; keeps QuickJS's fast increment), other objects' fields, imported functions, compound assignments to targets with side effects, out-of-range doubles (1e20, Infinity: JavaScript's ToInt32 gives 0, the interpreter's conversion saturates to -1 on arm64).

Proof: tests/golden/run/typed_numbers.ts (.out from the interpreter; AOT prints the same) passes on QuickJS (`tests/run --only qjs_numbers`), probes of parenthesised operands, comments, template literals, compound ops, loops agree; examples/hero renders on --engine quickjs. AC2 and AC3 wait for the owner's run: `tools/diff-matrix --qjs run:typed_numbers` (the new opt-in QuickJS column) and `tools/bench-gate` on the QuickJS kernels (the wraps add an opcode per i32 `+`, a call per i32 `*`).

later.md: - ZN-796: the QuickJS numeric wraps know only the kinds one file shows (no fields of other objects, no imported signatures); the checker's types in the transform would cover them.

Second look: a field, a return or a default parameter typed i32[] was converted like an i32 (an empty array became 0), found by tests/data/ipod-foryou on QuickJS; stores now convert only scalar slots, and typed_numbers covers it. The iPod For you bench on QuickJS with and without the pass: mixes 6440 / 6467 ms, Genius 100 58 / 58 ms (indicative, one run while another tree built).
<!-- SECTION:NOTES:END -->
