---
id: ZN-1094
title: Implement Array.flatMap for typed arrays
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-11-09 16:31'
updated_date: '2026-11-09 18:12'
labels:
  - language
  - frontend
  - size-S
milestone: m-32
dependencies: []
ordinal: 1012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Blocks ZN-1078.12 PathBar children menu. Minimal /tmp/zinc-flatmap-repro/main.ts: `const rows: string[][] = [['a'], ['b', 'c']]; console.log(rows.flatMap((row: string[]): string[] => row).join(','));` fails Z0106 on string[][]. Preserve ordinary application source, implement in the shared frontend/IR path and existing QuickJS semantics. Old ZN-060 described this surface but its implementation omitted it; compatibility reports still mark it missing.

Data sub-agent primary research: https://tc39.es/ecma262/multipage/indexed-collections.html#sec-array.prototype.flatmap and #sec-flattenintoarray: captured initial length, ascending existing indices, callback(value,index,source), flatten returned arrays exactly one level, empty result contributes nothing, scalar result contributes one when expressible by existing types, errors propagate, new result leaves input untouched unless callback mutates. Existing vendored implementation: third_party/quickjs-ng/quickjs.c JS_FlattenIntoArray and js_array_flatten, upstream https://github.com/quickjs-ng/quickjs/blob/master/quickjs.c. No dependency. Respect deliberate dense-array/type restrictions; record unsupported cases rather than silently changing semantics. Do not hand-code a PathBar workaround or special-case a kit type.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Typed array flatMap works generically on numbers, strings and records through the shared compiler and all three engines, including inference and the original nested string array
- [x] #2 Exact regression covers one-level flattening, empty results, callback order/value/index/source, captured length and exception cleanup; existing supported dense-array and type boundaries remain explicit
- [ ] #3 Unchanged PathBar/Data source checks and a short original feature proof pass, with documented scope and proposed milestone checks
<!-- AC:END -->

## Private source checkpoint — 2026-11-09

Status **Backlog**, all criteria open. Coordinator authorized parking a separate source checkpoint while another owner's bounded Mapper process holds the shared heavy-command queue. No build, runtime success, integration or Done claim.

- Added flatMap to existing typed HOF and Dyn receiver recognition; reused arrayHof0 generated Zinc helpers, existing callbacks, aliases and RC. No opcode, VM/AOT-specific implementation, dependency or application workaround. Other HOF callback arities stay unchanged; flatMap accepts value/index/source (or fewer arguments).
- Captures source length before invoking callbacks, visits ascending still-present dense indices, sees later mutations, skips entries removed by shrinking and does not visit appends beyond the initial length. Allocates a fresh result, flattens statically-array returns once, contributes scalar returns once, and preserves the existing error/cleanup path.
- Mixed scalar/array unions and any results use existing Array.isArray plus checked Dyn conversions. These cases need the exact tests below before any compatibility claim; existing Dyn conversion/copy boundaries are not changed. Pure typed arrays and records do not go through that branch. The typed method keeps the existing one-callback calling convention: no thisArg, sparse holes, custom array species or proxy indexing added.
- Updated lib/zinc.d.ts, language guide, changelog and affected-test mapping. Exact regression written for nested strings, numeric/string/structural-record inference and identities, scalar strings, zero-argument callbacks, empties, callback value/index/source/order, captured length/appends/modification/shrink, exactly-one-level nested arrays, errors with a partial allocated result, mixed union/Dyn returns and unsupported thisArg diagnostics. Interpreter mem --check-leaks is part of that exact regression. All are **written, not run**.
- Primary guidance read before implementation: ECMA-262 Array.prototype.flatMap/FlattenIntoArray (https://tc39.es/ecma262/multipage/indexed-collections.html#sec-array.prototype.flatmap); inspected vendored QuickJS-ng JS_FlattenIntoArray/js_array_flatten and upstream source (https://github.com/quickjs-ng/quickjs/blob/master/quickjs.c). Initial length, actual arrays only and one flattening level determine the helper, not a map/concat shortcut.
- Static diff and shell syntax checks PASS. No worker process or queued build remains. Own build/zinc predates this source and ZN-1093/script-link changes.

### Remaining exact proof

1. Build own warm zinc target after the current unit; run exact tests/t0/array_flatmap.sh through work-run with own binary/root and bounded runs. Fix any type/lowering/cleanup errors in the generic helper.
2. Check unchanged Data/PathBar/barrel and run one short original feature proof, with ZN-1093 id support present. No UI rewrite or dropped menu children.
3. Update criteria only from those results and fold proof notes into this task's private commit before integration.

### Proposed tests and limits

- Broader array/callback, Dyn conversion, exception/RC and conformance runs remain owner-chosen milestone checks. No broad suite, benchmark, pixel comparison, T1/T2/demo or cross run. No speed or general ECMAScript sparse/proxy/species claim. Mixed-result Dyn boundaries and all new runtime cases remain unproved at this checkpoint.

### Source review fixup

Read-only review found that callback tuples are represented as TK::Object even though JavaScript/Dyn sees them as arrays. The helper now includes tuple positions in the output element type and emits one push per known position after a single callback evaluation. Numeric and record-identity tuple regressions are written. An empty tuple alone has no inferable output element type under the existing typed-array representation; it receives a clear diagnostic asking for an array callback return type (`(): number[] => []`), rather than silently contributing a tuple object. Dynamic unions recognize tuple array members too. All new cases remain unbuilt/unrun.

### Warm build and exact proof

- Own `tools/build zinc` PASS after explicit checked Dyn conversions fixed an IR arrpush mismatch in mixed scalar/array callbacks. Generated helpers bypass implicit Dyn rewriting, so they now invoke the established Dyn array/scalar conversion functions directly. No new conversion semantics.
- Exact `tests/t0/array_flatmap.sh` PASS: interpreter/AOT/QuickJS, tuple numbers/record identity, mixed union/Dyn callbacks, original nested strings, all mutation/order/error assertions, interpreter `mem --check-leaks`, unsupported thisArg and empty-tuple diagnostics. Retained log `.logs/core-proof/array_flatmap.log`. AC1/2 proven; original Data/PathBar feature proof AC3 remains pending.

### Minimal heterogeneous result proof

A clean callback returning scalar string or numeric array, with no any/unknown/JSON/assert imports or explicit union annotation, exposed absent generated Dyn support. FlatMap now requests the established Dyn prelude before checking inferred callback unions. Dynamic flattening iterates the existing Dyn array elements and converts each output element explicitly; already boxed heterogeneous unions retain their representation. Join on a Dyn-backed element union uses the established Dyn formatter instead of attempting a numeric to-string instruction on a reference.

Expanded exact `array_flatmap.sh` PASS on interpreter/AOT/QuickJS and interpreter leak check: heterogeneous scalar/array, array/array, tuple elements and mixed scalar/already-typed tuple results (`a,2,2`). The exact contextual `string | [number,number]` annotation with an inline conditional array literal is explicitly rejected by the existing checker as `string | number[]` (Z0103); negative assertion documents that boundary. It is not reported as supported. Separate no-explicit-union input preserves proof of the generated-prelude fix. Logs `.logs/core-proof/array_flatmap-final.log` and minimal failing-before input/log retained.

### Proposed later.md line

- ZN-1094: Contextually type array literals as tuple members in mixed scalar/tuple return unions; the existing checker reports Z0103 even when the intended tuple branch fits. Positive already-typed tuple semantics are proven; no general contextual-typing rewrite in this task.
