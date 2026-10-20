---
id: ZN-009
title: ZBC emitter with register allocation
status: Done
assignee: []
created_date: '2026-10-05 14:21'
updated_date: '2026-10-05 22:18'
labels:
  - size-M
milestone: m-1
dependencies:
  - ZN-008
  - ZN-003
ordinal: 9000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
As a **Maintainer**, I want typed register bytecode with coalescing, so that the interpreter has no tag checks.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `fib` and `mandelbrot` emit valid ZBC; a verifier checks every file before execution.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
include/zn/{opcodes,bytecode}.h: ~110 typed opcodes (X-macro with operand classes) and 32-bit encoding; limits in limits.h. src/zbc: Module, binary format (encode/decode with bounds checks), disassembler, verifier = typed abstract interpretation over register classes I/S/D (operand ranges, jump targets, fall-off, class of every read, call windows, clobber by callee frame, joins), emit.cpp = RPO layout, liveness, linear scan with block-parameter coalescing and call windows, parallel moves on edges, JmpIfNot fallthrough. CLI: --emit=zbc (disassembly), --emit=zbc-bin <src> <out>, zbc --check|--dump <file>. fib and mandelbrot emit and verify; goldens in tests/golden/zbc. Unit test zbc_test: 21 malformed/valid cases + round trip + corrupted bytes. Heap ops (objects, arrays, strings), exceptions, fixed-point report 'no bytecode yet' per function (nbody: ZN-012/015). Risk: emitter VALUE correctness is only checked by the verifier's class/clobber rules until the interpreter (ZN-010) runs the goldens. console.log is emitted as LogI/LogU/LogF64/LogF32/LogBool/LogSep/LogEnd (no builtin call op). usage: 570887 in / 28169248 cached / 282555 out tokens, 160 turns (session total, estimate)
<!-- SECTION:NOTES:END -->
