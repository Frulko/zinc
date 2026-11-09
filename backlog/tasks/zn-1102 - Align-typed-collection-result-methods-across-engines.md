---
id: ZN-1102
title: Align typed collection result methods across engines
status: Done
assignee:
  - '@parallel'
created_date: '2026-11-09 21:34'
labels:
  - runtime
  - qjs
  - size-M
milestone: m-32
dependencies: []
ordinal: 1020
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found by1100 exact regression: lib/zinc.d.ts promises Map/Set values()/keys() arrays, while raw QuickJS returns native iterators so values().length is undefined. Minimal .worktrees/1100/.logs/1100/iterator-array.ts retained; join accidentally works only because modern iterator helpers exist. Current nullable-key feature is independently proved with standard for-of; no application rewrite was used. Confirm all public result signatures and recorded language/engine boundaries before choosing a fix. Preserve documented array clients and arbitrary unrelated methods; avoid blindly monkey-patching global native iterators and breaking third-party or embedded zinc:script JavaScript. Reuse typed lowering/QuickJS bridges and existing builtin metadata when possible, no component-specific adapter. New sole core batch after1100, along with1101 QuickJS cwd; one commit per task. Short primary research should compare ECMAScript Map/Set iterator contracts and Zinc's deliberate standard-library choices. No suite, exact T0 and small actual program only.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Public typed Map/Set keys, values and entries results match their documented Zinc types and observable behavior across interpreter, AOT and QuickJS, preserving insertion order and snapshot semantics
- [x] #2 A focused regression covers array length/index/map/join use where promised, standard for-of, empty collections, nullable contents and mutation after obtaining the result; arbitrary user methods with those names remain untouched
- [x] #3 The minimal values().length repro passes on all three engines, existing collection_infer/nullable_keys stay green, and actual compatibility boundaries for unsupported JavaScript or embedded Script are explicitly documented without a global native-JS behavior regression
<!-- AC:END -->

## Research and implementation

ECMAScript Map/Set keys, values and entries return iterators (primary: https://tc39.es/ecma262/multipage/keyed-collections.html#sec-map.prototype.values and #sec-set.prototype.values). Zinc deliberately documents arrays in lib/zinc.d.ts, including Array.keys/values/entries. Array.from consumes the iterator immediately, preserving its insertion order and snapshot boundary (https://tc39.es/ecma262/multipage/indexed-collections.html#sec-array.from). No dependency was added.

The QuickJS TypeScript pass now adapts direct zero-argument collection calls through one private shared leaf module. It captures native Map/Set/Array method identities, Reflect.apply and Array.from before entry dependencies (including the loading stage/CommonJS entry) can override them. Only calls of those captured native methods materialize arrays; user functions retain their results and this. Source receiver and method getters execute once. Optional chains retain their guard extent, parentheses, receiver binding and skipped continuations; await/yield remain in their async/generator scope using invocation-local temporaries, never a shared global slot. Generated guards preserve subsequent source line counts. No prototype, constructor or iterator is patched.

Plain JS/MJS, npm packages (including workspace-linked TypeScript through resolver packageFiles metadata), embedded Script code and arbitrary unrelated methods retain native JavaScript behavior. The cache key includes package/typed mode and entry/module identity. Existing typed boundaries remain explicit: bracket Map method access is Z0113 and extracted builtin methods are Z0005. The focused regression retains those diagnostics instead of promising unsupported typed syntax.

The all3 regression checks all six Map/Set methods, snapshots after mutation, empty/nullable values (D18 unchanged), array indexing/length/map/join and for-of, nested array result methods, custom method returns/this, receiver/getter counts, optional continuation and parenthesized chain boundaries. Additional QuickJS proofs cover suspended optional chains in async functions/parenthesized async arrows/generators, native raw entry/modules, symlinked npm TypeScript, overridden native method identity, linked/minified output and embedded Script live iterators. Existing collection_infer and nullable_keys pass.

Preexisting numeric-union limitation retained separately: .logs/1102/optional-length-original.ts returns m?.values().length as number|undefined. Pre1102 clean root binary SHA2561d4b213a4d72e5693b03c4aaaaa7b5c6dd09ccad78886facfcc33edeb690e0f1 fails with invalidIR refcast Box<i32>→Box<f64>, exit3; baseline log retained. The collection regression uses the actual length type i32|undefined. Coordinator routes numeric widening to a fresh batch; it is not claimed fixed here.

Proposed tests: owner-chosen broader browser/device collection replay and quiet-machine allocation/start-up measurement for eager snapshots. Snapshots intentionally allocate/copy according to the typed contract; no runtime speed claim. No suite, benchmark or device run.

Caller audit: cli_mqjs.cpp shares the collector with its nonempty board module registry. Its recorded ES5 contract excludes Map/Set/Reflect/iterators (docs/reports/zinc-next-mquickjs.md:38,142); that existing backend keeps the native transform and gains no private helper import. This task does not migrate mquickjs or relax its existing diagnostics.

Final combined size gate remains unchanged and passes: JS235831/238916/275608 B (unused3085<=8448; used4076/component<=4096, strict172 B total headroom). The shared bridge adds431 B to each bundle versus1103 and does not change either delta. AOT5325320/5374848/5926624 B (unused49528<=135168; used61308/component<=65536). Original Data gallery runs headlessly for3 frames on QuickJS, with no missing-icon warning or error; collection feature check passes. Logs .logs/1102/final-all.log and cache-boundary-final.log; provenance .logs/1102/provenance.json. No new runtime performance claim.
