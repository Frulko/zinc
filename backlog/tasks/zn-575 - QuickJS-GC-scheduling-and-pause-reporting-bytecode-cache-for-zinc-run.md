---
id: ZN-575
title: QuickJS GC scheduling and pause reporting; bytecode cache for zinc run
status: Review
assignee:
  - '@parallel'
created_date: '2026-10-09 08:12'
updated_date: '2026-11-10 05:28'
labels:
  - games
  - js
  - size-M
milestone: m-22
dependencies:
  - ZN-566
  - ZN-445
ordinal: 14500
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**What is left (review 2026-11-07):** Verify the run-time bytecode cache against Phaser/Babylon (record numbers); then run the cycle collector at frame boundaries within a budget and show GC as a phase in ZINC_PROFILE=1.

QuickJS-ng frees acyclic garbage at once but cyclic garbage waits for a whole-heap cycle scan: measured p99 11.8 ms with 100k live objects and 99-171 ms with 1M (Node stays under 6 ms); matter-js frames reached 166 ms. Run the cycle collector at frame boundaries within a budget, raise the threshold while a level loads, show GC pauses as a phase in zinc profile / zinc mem. Start-up: Phaser 3 evaluates in 450-640 ms and Babylon.js in 1.3 s; reuse ZN-445's JS_WriteObject writer for a content-hash bytecode cache in ~/.zinc/cache so zinc run (not only packs) skips parsing. (From docs/reports/games/js-game-libraries.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 gc test with 100k live objects and cyclic temporaries: p99 frame <= 4 ms (today 11.8 ms)
- [x] #2 GC pauses appear as a phase in ZINC_PROFILE=1 output
- [ ] #3 second zinc run of Phaser 3.90 evaluates in <= 100 ms (today 450-640 ms) and Babylon.js 9.30 in <= 250 ms (today 1.3 s)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-11-07: done-partly. A bytecode cache for zinc run appears to exist already; GC scheduling at frame boundaries and the GC phase in profile output do not. Evidence: src/qjs/qjs.cpp:759 JS_WriteObject; tests/t1/launch_time.sh (cached bytecode for zinc run)


2026-11-10 isolated worker (`work/575`): implemented boundary cycle scheduling and the existing integrated frame-profiler GC phase. AC2 passes; AC1 and AC3 remain open, status Review for owner-picked quiet measurements. No latency/startup gate was run or weakened.

Research: [QuickJS-ng internals](https://quickjs-ng.github.io/quickjs/developer-guide/internals/) and [the upstream public API](https://github.com/quickjs-ng/quickjs/blob/master/quickjs.h) provide a full `JS_RunGC` and threshold controls; [maintainer guidance](https://github.com/quickjs-ng/quickjs/discussions/828) recommends these for cycle collection. The pinned local 0.17 source confirms three synchronous whole-heap passes, no incremental/time-budget API. No library or collector fork added. Its only cheap memory getter is the GC trigger threshold; `JS_ComputeMemoryUsage` walks the heap. Patch 0006 therefore exposes only the existing allocator byte counter, with pinned release/patch-queue metadata and reversibility proof.

Scope/callers read: qjs main/worker/script runtimes, module loader and trusted bytecode paths; all profMark callers and numeric UI phase constants; runtime work percentiles, JSON, late-frame counts, trace spans, Info view and HUD; tools/zbench consumers. Added append-compatible GC ID9 (present stays8) in one shared header; all work totals exclude present explicitly and include GC. HUD gets its tenth legend entry and enough height. `host/loop.cpp`, process_family, runtime headers, rt, main, UI, HAL and all external WIP remain untouched; coordinator authorized only the narrow clean runtime/gfx.cpp profiler carveout.

Policy: entry loading gets 16MiB of initial headroom. In the main gfx frame loop, +8MiB net allocator growth schedules a boundary scan when the preceding pause estimate (25% headroom, minimum1ms) fits a 16.7ms work estimate; +32MiB triggers regardless. The automatic threshold at baseline+32MiB remains a fallback inside allocating callbacks. RAII restores the prior threshold at loop exit, including errors; policy tests cover throw, restart, shrinking bytes and saturating threshold arithmetic. This is a scheduling heuristic, not a hard memory limit or real-time pause bound. Full live heaps and single callbacks may exceed those growth amounts; scans cannot be interrupted. Only scheduled boundary scans are named `gc`; emergency/loading/worker/script scans remain in their actual triggering phase or outside the frame profile.

Proof, candidate binary SHA256 `95d46b9f57a35b9a7bd0600ecff9d25eeff58237bc082f86caeaebc5544ae28f`, built from task source on base7cca36224:
- `tools/build zinc`, then incremental `tools/build zinc`: pass. Changed code compiles without new warnings; full-tree build retains pre-existing warnings in V8 SDK headers, assets/assets.cpp, assets/cook.cpp, rg_etc1, nanosvg and agent/dev.cpp (not changed here).
- `ZINC_ROOT=$PWD ZINC=$PWD/build/zinc tests/run --only qjs_gc`: PASS. Seconds-long exact T0: deterministic cap/budget decisions, RAII restore/failure/restart, fixed IDs, patch reversibility, actual six-frame cyclic garbage, live-object survival, GC text/JSON/trace, GC included in work mean and quiet profiling-off output. No p99 threshold asserted.
- `build/zinc check tests/data/qjs_gc/frame.js --engine quickjs`: PASS,3modules/0warnings.
- `ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=3 build/zinc run examples/fatty --engine quickjs`: PASS, actual unchanged Fatty app.
- Explicit coordinator-approved extra exact regression `ZINC_ROOT=$PWD ZINC=$PWD/build/zinc tests/run --tier t0 --only qjs_bytecode`: PASS, local trusted bytecode compatibility and unsigned-pack source fallback. Loader/cache/security code was not modified.
Every heavy command ran through `/Users/mowmow/Lab/zinc/tools/work-run` (build1200s/rebuild180s/T0 GC60s/check20s/app25s/bytecode45s bounds), serialized with other workers. No windows, processes or descendants left running. Logs: `.logs/575-20261110/`. `tools/usage`: n/a. No new performance numbers claimed.

AC1 provenance: the original `/Users/mowmow/.claude/jobs/f633d587/tmp/games-libs/probe/gc.mjs` still exists and was read only. It runs synchronous top-level loops for10k/100k/1M live heaps, not `onFrame`; frame-boundary scheduling cannot move a scan out of those loops. Its original criterion remains open. An additional full-frame workload must include collection time in frame/profile `work`, rather than timing just callbacks to disguise pauses.

Proposed decision for coordinator: retain QuickJS's pinned collector and use bounded allocation-pressure scheduling plus an honest integrated boundary phase. Qualitative scores (fit/perf/size/maintainability/licence/portability/effort, RULES weights): automatic-only2/2/5/5/5/5/5=52; boundary scheduling4/3/4/4/5/5/4=56; incremental fork5/4/1/1/5/3/1=45. Perf scores are expectations, not measurements; revisit after quiet AC1 evidence. No decision number allocated.

Proposed tests (owner picks):
- Quiet original GC probe: `ZINC_HEADLESS=1 build/zinc run /Users/mowmow/.claude/jobs/f633d587/tmp/games-libs/probe/gc.mjs --engine quickjs`, bound120s; compare original100k cyclic p99 criterion, then a matched100k gfx-frame workload with `ZINC_PROFILE=json` including GC in full `work`; about10–60s, potential few hundred MiB at1M, watch growth. Not run now.
- Quiet cached evaluation of pinned Phaser3.90 and Babylon9.30 using the report's external `probe/phaser3.mjs`/`probe/babylon.mjs`, repeated source/bundle runs with identical retained sources; bound60s each, roughly10s–1min and under1GiB expected; distinguish parse reuse from evaluation. These probes measure loadScript rather than module imports and may bypass the bundle cache: exact entry, loading path and distributions must be recorded before claiming AC3. Not run now.
- `ZINC_ROOT=$PWD ZINC=$PWD/build/zinc tests/run --tier t0 --only qjs_gc` and `--only qjs_bytecode` after combined integration: seconds each, small fixture heaps (<100MiB expected); confirms final binary, no performance claim.
- Physical HUD/Info view/DevTools trace inspection and other-engine frame-profile compatibility at a chosen milestone (one app at a time, background/headless,15s bound; memory not measured). No wider suite, benchmark, conformance, CI or cross-platform run occurred.

Proposed later.md line: `- ZN-575: measure the original100k cyclic probe and matched full-frame work on a quiet machine; synchronous whole-heap GC cannot guarantee a4ms pause, and loading/worker/script scans are outside the boundary-only GC phase.`

<!-- SECTION:NOTES:END -->
