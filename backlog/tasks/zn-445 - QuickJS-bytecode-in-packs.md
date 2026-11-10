---
id: ZN-445
title: 'QuickJS bytecode: log line on version mismatch, bytecode in packs'
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-09 07:36'
updated_date: '2026-11-10 04:43'
labels:
  - games
  - assets
  - size-M
milestone: m-22
dependencies:
  - ZN-433
ordinal: 15400
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The review of 2026-11-07 retains two changes: include QuickJS bytecode in packs alongside source, and emit one actionable log line when incompatible or stale bytecode falls back to source. The earlier Pi 3 startup-time criterion is removed; no startup benchmark is part of this task.

Reuse the existing bundle/export writer, Zinc engine-build stamp and QuickJS-ng bytecode-version header. Preserve source fallback and the package trust boundary: a checksum is not authenticity, and QuickJS bytecode must not be deserialized from an unsigned pack.

Reference: docs/reports/games/toolchain-assets-loading.md §5 / G18.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 QuickJS bytecode is included in packs alongside source, with engine/version metadata and a working source fallback
- [x] #2 a version mismatch falls back to the source with one log line
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: done-partly. QuickJS bytecode is written at build and export for quickjs projects, and a stale or foreign-version file is skipped with the source as fallback. Not in packs, and the skipped file prints no log line. Left: the one log line on version mismatch and the Pi 3 start time (cross). Evidence: src/qjs/qjs.cpp:646 (JS_WriteObject, STRIP_SOURCE); tests/t1/qjs_build_bytecode.sh; CHANGELOG (zinc build writes build/<name>.qbc, export starts from it)
Review 2026-11-07: rewrite. Log line on QuickJS bytecode version mismatch and bytecode in packs; drop the Pi 3 start-time criterion.


Completed 2026-11-10 (work/445):
- Research: https://quickjs-ng.github.io/quickjs/developer-guide/intro/ says the format is version-bound and bytecode receives no security validation. The local pin is QuickJS-ng 0.17.0, BC_VERSION 28 (third_party/quickjs-ng/quickjs.c). Its native version/checksum header follows the existing `zinc-qbc <Zinc version including git commit>` engine-build stamp. Reused that metadata and writer unchanged; no extra archive format, esbuild option, dependency pin or signature system.
- `zinc pack` for a QuickJS project now reuses the existing bundler and writes `.zinc/app.js`, `.zinc/app.js.map` and `.zinc/app.qbc`; original sources, entry, import map and assets stay present. This requires the same pinned esbuild as build/export. Both criteria pass with the deliberate trust restriction below.
- The .zapp format has an empty signature slot. SHA-256 verifies integrity, not authenticity. Pack and fused launches disable every entry-bytecode sidecar and execute original source, with one distinct trust warning. A matching local stamp never authorizes a packed `main.qbc`. Fast loading of pack bytecode is deferred until authenticated provenance exists; stored bytecode is not a speed claim.
- Local build/export bytecode keeps its existing loading path. An engine-stamp mismatch, native QuickJS version mismatch, damaged/truncated bytecode or older source sidecar falls back with one always-visible warning, even with ZINC_STEPS=0. Warning includes `zinc build` as the repair; foreign lone bytecode remains an error. Foreign stamp text is bounded and escaped to keep the diagnostic to one line.
- Scope reviewed: qjs::run, compileBytecode, bundle writer, runWorker (source only), build/export, .zapp and fused argument rewriting, JS pack source/importmap copy, native library trust flag, existing qjs_bundle/qjs_build_bytecode/zapp callers. Bytecode trust is a separate immutable launch provenance value; native-library trust flags are unchanged.
- Proof on candidate build/zinc SHA256 d568744ecc5386dc99f3e04b480a3049f6ff4d642498d2d50e3623ebcaa01a68 (base11e972813 + this diff): tools/build zinc PASS, final touched-target rebuild warning-free. Initial full warm-cache build reports pre-existing warnings outside touched files (V8 SDK, asset cooker, vendored encoders, agent initializer, nanosvg); none from these qjs/main changes.
- Exact T0 `tests/run --only qjs_bytecode` PASS: valid local bytecode demonstrably runs instead of edited source; engine/native version mismatch, truncation and stale bytecode each run source with exactly one actionable line; lone foreign bytecode refused; archive contents/hashes/metadata checked; both a malicious source-sibling main.qbc and altered packaged bytecode with recalculated SHA stay on original source with exactly one trust warning. All subprocesses have 15s bounds; no tool downloads.
- Original unchanged `examples/fatty`: check (49 modules, zero warnings), headless direct run two frames, pack, and headless packed run two frames PASS. Packed run emits exactly one trust warning. Source main.ts SHA256 cc3f8a7bf9de65c675c54191aeece61d0ae39af1142c2f848097e12051a0afb0; zinc.json 574319c2ff693b7a8711ca518407e1bdfed8df29e44f0af98b94df9b8994ae3f; proof archive 05b4ffdb493cc7528a28deafd4720c4ff7a3ba0cd2f635f2a1eeb9c3af0add25.
- Logs: ../445-build.log, ../445-rebuild.log, ../445-t0.log, ../445-original-{check,run,pack,packed-run}.log relative to the worktree; original proof archive .logs/qjs445/fatty.zapp. All heavy commands use main tools/work-run. No process left running. No benchmark, Pi time run, suite, T1/T2 or demo test run.
- Proposed tests: tests/run --only qjs_build_bytecode (T1, build/export/moved source maps, about 30s and <500MB); tests/run --only zapp with the installed pin supplied in ZINC_ESBUILD (existing full package/importmap regressions, about 20s and <500MB); a fused QuickJS pack headless two-frame run (about 2s and <300MB). Owner chooses them at a milestone.
- Coordinator later.md line: ZN-445: authenticate pack publisher provenance before enabling QuickJS bytecode deserialization; file hashes and engine version are not trust.
- usage: n/a

<!-- SECTION:NOTES:END -->

Coordinator alignment: the explicit review2026-11-07 in this task drops the Pi3 start-time criterion and asks bytecode-in-packs plus mismatch logging. AC1 above now follows that recorded review; no performance benchmark or Pi run is authorized by this metadata correction. Existing source fallback/trust boundaries must be preserved.
