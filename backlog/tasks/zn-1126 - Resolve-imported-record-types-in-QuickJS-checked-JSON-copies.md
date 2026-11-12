---
id: ZN-1126
title: Resolve imported record types in QuickJS checked JSON copies
status: Done
assignee: []
created_date: '2026-11-12 10:10'
labels:
  - language
  - frontend
  - quickjs
  - size-M
milestone: m-7
dependencies: []
ordinal: 17503
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Blocks ZN-1037 AC3 and ZN-1125 production proof: WirePlaylist.rules?:ipod.SmartRules makes QuickJS schema acquisition empty, so the whole PlaylistsReply silently escapes checked conversion and a missing required playlist id is accepted. Actual interpreter and native AOT production wire pass; QuickJS genuine failure is retained in .worktrees/1037-remote-wire/.logs/HANDOFF-1037-BLOCKED.md and stage-1125-production/wire-quickjs.log. Read .logs/research-namespace-l.txt. Reuse existing ModuleResolver and import/export type bindings with module identity, not caller duplicated WireRules or global tail-name maps. Scope QJS strip/engine/private checked-schema acquisition, exact T0, fixtures/docs/mapping only; no RT/IR/ABI/host/HAL/UI/main edits. Native schemaOfType false and worker/native wire behavior remain unchanged.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Supported imported record types, including plugin namespace and type-only imported/local-reexported bindings, participate in QuickJS checked JSON copies; missing required fields and malformed nested records throw TypeError as on interpreter and native AOT.
- [x] #2 Focused relative namespace, named alias, local re-export, export-from/star, same local names in separate modules and recursive/import-cycle controls preserve module identity and terminate; native wire schemas stay byte-identical.
- [x] #3 The original production ZN-1037 wire, sender and atomic library-consumer fixtures pass on all three engines without caller type duplication, assertions, any casts or a daemon/network/device action.
<!-- AC:END -->


## Implementation Notes

2026-11-12: same isolated worker/tree chain after2b602f2e4 (1124), f8dd62be2 and877b265ef (1125); true base remains d81310863944332d2db392370c4c18aaf4150f08, no reset/rebase. The1126 task alone was copied from coordinator develop into this branch before implementation.

Implemented a checked-only type source context from the sole `toJavaScript` product caller. Existing Engine normalizer policy is extracted/reused; standard physical source bases and import maps are retained, and type-only resolution keeps native Specs. The read adapter retains interfaces/aliases and relevant type imports/local export bindings, filters bodies/side-effects, leaves resolver JSON configuration raw, and invokes existing type-only `loadProgram` once per transform. `Ast::modules` import/export bindings drive per-module Records with unique schema identities, rather than flat name concatenation. Export-cycle RAII/ambiguity handling and explicit parse/file/byte/type/schema-depth diagnostics prevent an unchecked whole target. Native schema false and old worker schema helper remain separate/unchanged.

Proof: all stage builds through relative tools/build zinc under work-run exit0; only existing NanoSVG/duplicate-library warnings, no changed-code warning. Exact checked_imports stage1/final/stage6 pass: real interpreter/nativeAOT/QuickJS relative namespace/named alias/local reexport/export-from/star, private same-named Item types, root local shadowing, recursive records and cyclic modules; injected physical mapped standard root/import-map callback, dormant function-only type import, malformed needed module,16MiB budget, depth bound, export cycle, ambiguous star, imported class unsupported and hidden-file prefix controls. Exact checked_nullish and try_flow affected regressions pass on all3 after the new path; native schema byte assertions remain unchanged. The actual namespace mini in .logs/namespace-schema-gap authentic before source had VM/AOT TypeError success but QuickJS101 missing-id acceptance; after stage3 all3 reject correctly.

Production proof .logs/production1037-stage6:622 imported app/lib/plugin/fixture source snapshots copied and hashed before; full unchanged remote wire.ts passes interpreter, QuickJS and actual native AOT (native executable/inputs/key preserved, no fallback). This includes old/current/default/presence/null/type/rules/opaque/403 cases and the missing required playlist id. Next exact prepared sender-roundtrip interpreter compilation reaches75s bound124 after cached ipod/sqlite; no execution or diagnostic, and no app rewrite. El-only one-method mini checks, while a pure no-import40-call Chain.next mini reaches5s bound124. Coordinator owns the separate fluent-call engine blocker. All622 source hashes match after the failed stage; original logs/scripts/sources are retained. Consumer proof is a separate unique stage, not yet claimed at this note. AC3 remains open until actual sender/consumer all3.

Archival limit: the original intermediate1125 caf3f97d CLI bytes were not copied before a later build replaced them. Authentic source/hash/compiler manifests/logs and the actual native decoder executable remain; no reconstruction is presented as original. The1124 fe291d candidate4artifacts and1126 stage3/final/stage6 candidates including all adjacent archives are retained. Original1037 baseline net fake loss/reconstruction is disclosed in its own handoff, not reclassified here. No suite/T1/T2/demo/pixel/conformance/fuzz/benchmark/CI or daemon/network/device/OS action; no performance claim.

Decision proposal: reuse existing read-only type-only frontend module graph plus Engine mapping, with per-declaring-module record identities; no new loader policy or global schema/module cache. Revisit startup overhead only on a selected measurement, not assumed.

### Proposed tests

- Owner-selected wider JSON shape/native record/typed-worker and package/import-map matrices (seconds to a minute, memory unmeasured); exact source/graph/all3 regressions already pass. Original daemon global check has inherited old90s/current60s compile timeouts; do not label it PASS or rerun as a suite. Complete the actual unchanged sender/consumer fixtures after the fluent checker fix.


2026-11-12 final production closure after1127 commit5771907c6: original wire decoder all3 `.logs/production1037-stage6/` and real atomic readLibrary consumer all3 `.logs/production1037-consumer-stage6/` were already proven with actual native under frozen CLI dd5c1e73c89a1468bf860bfe74a943f853b2a2fe4435abf259e35ec03d33a4f1. The original unchanged sender-roundtrip now passes interpreter/QuickJS/actual native after call-local receiver checking, `.logs/production1037-sender-1127-stage1/`, CLI8fb03ae2ff442a5d0958cf86b9d11f08457acf240a8c894bfbeed0584fa097de from preserved1127WIP over caa7e7155. Native C++ compilation/link/run and actual app+inputs/key/provider metadata are retained in each stage; no fallback counted. Each stage snapshots all622source/import/config/fixture payloads and proves hashes unchanged. No caller type duplication/chain splitting/assertion/any-cast workaround, daemon/network/device or application-cache write. Earlier wire/consumer proofs were not repeated. One specifically authorized original ipod-web check after sender passes18files under30-second bound, `.logs/production1037-web-1127-stage1/`; original ipod103 prior pass retained. Exact affected1127 try_flow/checked_nullish/checked_imports rechecks PASS. This closesAC3; all prior authentic failures, intermediate provenance limitations and original commit history remain unchanged.
