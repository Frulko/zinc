---
id: ZN-1068
title: 'Hamlet follow-ups: atlas test and sprite rects'
status: Review
assignee: []
created_date: '2026-11-07 16:43'
updated_date: '2026-11-10 05:27'
labels:
  - hamlet
  - size-S
milestone: m-30
dependencies: []
ordinal: 15200
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A failing test on develop and a measured optimisation.

From backlog/later.md, promoted by the review of 2026-11-07 (docs/reports/backlog-review-2026-11-07.md). The lines it carries:

- ZN-hamlet-rects: tight per-kind sprite rects for the idle frame (animals, people) from the atlas frame bounds, with a coverage test; measure on AOT and interpreter at 24/64/96 (a disjoint cover was +5% on AOT).
- ZN-hamlet-quiet: Hamlet windowed Metal and QuickJS fluidity numbers on a quiet machine.
- ZN-hamlet-atlas-deer: `hamlet_atlas` deer stamps differ from live deer (1670 pixels) on develop; not from the fluidity pass.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 hamlet_atlas deer stamps match live deer
- [ ] #2 Tight per-kind sprite rects with a coverage test; numbers on AOT and interpreter at 24/64/96
<!-- AC:END -->


## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-10, worker work/1068, base 7cca36224.

Need → provider → gap: the idle redraw needs the bounds of the actual body frame; `Atlas.bake` already returns the shared Pixel Plays `CachedModel`, whose packed pixel arrays are the source of truth. Added cached tight extents to that model (including `fromArrays`), and shared each actor's frame selection between stamping and dirty coverage. No new renderer, dependency, atlas format, assets or engine change. Live tools, bow/line, carried loads, creeping people and atlas-disabled rendering retain the wider rectangles; rabbit burrows keep their separate rectangle. Existing tracked shadow spans still cover shadows. The selected pose gives tighter coverage than a single envelope for a whole species.

Research (primary sources): Godot's [AtlasTexture](https://docs.godotengine.org/en/stable/classes/class_atlastexture.html) separates region from margin and offers filter clipping; [SDL_RenderTexture](https://wiki.libsdl.org/SDL3/SDL_RenderTexture) likewise separates source and destination rectangles. Keep the lit frame's bounds separate from the existing rounding/edge halo; reuse our baked pixels rather than add a packing library. Reversible choice; no decision number requested.

Proof, using the coordinator's read-only engine `/Users/mowmow/Lab/zinc/.claude/worktrees/agent-aae96db4e67d4b8e6/build/zinc`, SHA256 `286072a337fc84ee28375d9bc529a2afcb2d69b0ed9b37d0013cf7da9816cc7a`, with `ZINC_ROOT` set to this tree:

- Before edits, the existing `tests/data/hamlet/atlas.ts` passes on interpreter and QuickJS: deer 80 cases / 0 differing pixels, people worst case 3. The old 1,670-pixel deer failure no longer reproduces with this engine; no invented drawing fix or relaxed expectation. Final T0 below proves the unchanged exact deer assertion on AOT too.
- Final `tools/work-run 80 env ZINC_ROOT=$PWD ZINC=<engine> tests/run --tier t0 --only hamlet_atlas`: `PASS hamlet_atlas`, `1 passed, 0 failed`. Its script checks AOT, interpreter and QuickJS. Extended the existing exact stage only: all 17,776 frames (all variants, headings and poses of people/deer/rabbit/boar/wolf) have pixel-tight extents, every translated visible pixel is covered after subpixel placement and clipping, packed bounds round-trip, empty bounds stay empty, and live props retain wide coverage.
- `tools/work-run 30 env ZINC_ROOT=$PWD <engine> check examples/hamlet`: all 109 files verified, no errors. The changed atlas fixture also checked cleanly.
- `tools/work-run 45 env ZINC_ROOT=$PWD ZINC_HEADLESS=1 ZINC_BACKGROUND=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=3 ZINC_HAMLET=3,24,0 ZINC_HAMLET_CROWD=12,8 ZINC_HAMLET_STILL=1 ZINC_APP_DATA=$PWD/.logs/1068-data ZINC_SHOT=$PWD/.logs/1068-hamlet.png <engine> run examples/hamlet --engine quickjs`: status 0; inspected the captured real village. Capture SHA256 `f9f8d9fe23ef40e29e1c6908470a2a4b54e916b93b4e136ca8c81cbe9788ee6a`. This is a startup/visual smoke, not a fluidity or timing measurement.
- Process mistake: an earlier `tests/run --only hamlet_atlas` omitted `--tier t0` and selected both identically named T0 and T1 scripts, producing `PASS hamlet_atlas` twice and `2 passed, 0 failed`. The unintended T1 completed; no process remained. The final explicit-tier check above followed the last code changes. No new test script or golden was added. No further broad or pixel test was run.
- `git diff --check` and affected-test JSON parse pass. No engine build and no process left running. `tools/usage`: `usage: n/a`.

Status: Review. AC1 proven. The coverage implementation of AC2 is proven; AC2 stays unchecked because the required AOT/interpreter 24/64/96 performance numbers are unmeasured. Windowed Metal/QuickJS fluidity likewise unmeasured. No speedup, energy, timing, physical-input or cross-platform claim.

Proposed coordinator later line: `- ZN-1068: run matched before/after idle-view measurements on a quiet Mac at 24/64/96 with AOT and interpreter, then windowed Metal/QuickJS fluidity; exact frame bounds are covered, performance is not yet established.` No new decision or performance-log number.

### Proposed tests

- Owner-picked quiet run, sequential for size 24/64/96, before/after base 7cca36224, on AOT and `--interp`: `tools/work-run 120 env ZINC_BACKGROUND=1 ZINC_HAMLET=3,<size>,0 ZINC_HAMLET_CROWD=40,20,40 ZINC_HAMLET_STILL=1 ZINC_HAMLET_PERF=300 ZINC_HAMLET_PERF_SKIP=59 ZINC_FRAMES=360 ZINC_APP_DATA=<scratch> <engine> run examples/hamlet [--interp]`. Capture village/frame p50/p99 and RSS using the existing tracing/monitoring tools; roughly 1–2 minutes/run, estimated under 1 GB (not measured); one process at a time. This is the next work needed for AC2.
- Owner-picked windowed Metal/QuickJS version of that matched scenario, including visible movement/panning and `tools/resmon`: fluidity and memory, roughly 2 minutes/engine, estimated under 1 GB (not measured). No benchmark during concurrent builds.
<!-- SECTION:NOTES:END -->
