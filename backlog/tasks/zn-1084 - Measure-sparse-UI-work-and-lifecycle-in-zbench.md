---
id: ZN-1084
title: Measure sparse UI work and lifecycle in zbench
status: Done
assignee:
  - '@parallel'
created_date: '2026-11-09 13:33'
updated_date: '2026-11-09 13:49'
labels:
  - ui
  - perf
  - tools
  - size-M
milestone: m-32
dependencies: []
type: enhancement
ordinal: 1005
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner request 2026-11-09: apply the GPUI critique and zortax/zgui recommendations to OUR existing harness, then improve throughput. Extend tools/zbench and tests/bench/render_suite (do not build a parallel benchmark tool or vendor zgui). Existing UI scene only changes all100rows every frame; add deterministic sparse/no-op and lifecycle cases that separate reactive work from style/layout/paint/host-commit work.

References researched before work: https://blog.zortax.de/posts/a-critique-of-gpui ; https://github.com/zortax/zgui (run-once signals, retained independent style/layout/paint invalidation; experimental, no borrowed performance claims). Benchmark charts use unpublished adapters on another machine; carry correctness oracles and configuration provenance, do not copy ranking claims. Existing docs/reports/render-bench-design.md describes our one-launch report pipeline and controlled sources.

Use existing --set for row-count/wiring parameters where sufficient; keep old artifacts/CLI/scenes compatible. Cover equal write, one visible label change, paint-only color change, filtering/create/dispose and virtualized vs fully retained rows. Include fine vs intentionally coarse state wiring metadata so comparisons cannot mix them. Count binding evaluations/component construction plus actual layout/paint/native-host visits using existing optional profiling path or smallest disabled-by-default counters; do not pretend one effect means one-node engine work. Report unsupported/unmeasured fields explicitly. Record creation/settled/disposal phases and memory where available; do not invent zero RSS for unsupported backends. A structural no-op/local-update/cleanup oracle must reject wrong-but-fast output.

Bound proof to a small Mac headless selection, no full suite/cross run; stage/size counters and artifact self-checks are more important than noisy wall-clock rankings. Main external ui.ts WIP only Virtual/Fenwick: isolated counter changes allowed elsewhere, never copy main WIP. Inputs and Selection workers own kit modules and AppKit backend; do not edit those.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Existing zbench runs deterministic no-op, sparse label, paint-only, lifecycle/filter and virtualized UI cases at configurable row counts without breaking existing scenes or artifacts
- [x] #2 Artifacts distinguish binding/component work from layout/paint/host visits and setup/settled/disposal, include model/wiring/rows provenance and honest unavailable memory metrics
- [x] #3 Correctness oracles and a small T0 cover equal write doing no reactive work, local text correctness/identity, disposal unsubscribing and artifact/gate compatibility
- [x] #4 A bounded small headless Mac proof produces valid report through the real harness and documents commands/limits; no full benchmark or cross-target claim
<!-- AC:END -->


## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented the seven additive UI work scenes in the existing render suite, configured with --set ZB_ROWS=N,ZB_WIRING=fine|coarse. Existing scenes and zbench/1 + zbench-report/1 remain compatible. The optional ui_work section carries model/wiring/rows/frame-count/scenario-version provenance; creation, settled and disposal counters; honest null RSS/heap; and a structural oracle. The optional UI profiling path counts classic measure/place, paint and native-host function entries. No Virtual/Fenwick, kit, AppKit, C++ or dependency changes. UI-only sequences now open their report file. show prints work counts and suppresses ratios for invalid baselines/new results; gate rejects invalid baselines and failed/missing new oracles, unstable counts and incompatible provenance; log fallback preserves metadata.

Research (coordinator search plus primary docs read): https://blog.zortax.de/posts/a-critique-of-gpui ; https://github.com/zortax/zgui ; https://zgui.zortax.de/docs/performance/cost-model ; https://zgui.zortax.de/docs/architecture/overview ; https://zgui.zortax.de/docs/architecture/renderer . Useful lesson: count reactive and downstream stages independently and carry configuration/correctness evidence. The external article's unpublished adapters and experimental zgui are not comparative Zinc evidence. Existing report/counter infrastructure won over a new tool, framework port or dependency: smaller, compatible, and directly measures Zinc.

Proof: clean read-only engine /Users/mowmow/Lab/zinc/.claude/worktrees/agent-aae96db4e67d4b8e6/build/zinc with ZINC_ROOT=this worktree. All engine/tests/app/build commands serialized and bounded with /tmp/zinc-heavy-run-501.py. zinc check tests/bench/render_suite passes; tools/ui-dts regenerated lib/ui.d.ts using TSC=/Users/mowmow/Lab/zinc/node_modules/.bin/tsc. tests/run --only bench_harness passes (19 pure artifact/gate checks plus all seven 16-row interpreter scenes, 8 frames each). It checks no-op doing no binding/layout/paint work, sparse text/identity, filter/lifetime/virtual correctness, disposal unsubscribing all row signals, and wrong-fast/missing/provenance gate failures.

Real harness: ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 tools/zbench run mac --engine quickjs --scene ui_noop,ui_sparse_label,ui_paint_only,ui_filter,ui_lifetime,ui_retained,ui_virtual --runs 1 --frames 8 --skip 0 --size 240x160 --set ZB_ROWS=64,ZINC_HEADLESS=1,ZINC_DETERMINISTIC=1 --out /tmp/zn1084-zbench64.json (60 s outer bound). All seven oracles passed, no report problems. Also passed: first three scenes with --engine quickjs --one-by-one and ZB_ROWS=16,ZB_WIRING=coarse (/tmp/zn1084-zbench-coarse16.json); first three through default AOT, fine, 16 rows (/tmp/zn1084-zbench-aot16.json; 90 s outer bound). Self-gate of the 64-row artifact passes. No process remains.

Structural evidence, not timing ranking: settled no-op has 0 bindings/layout/paint. Four fine sparse label writes at 64 rows evaluate 4 bindings but visit 528 classic measure nodes, 528 place nodes, and 848 paint nodes (sequence wrapper included). Paint-only: 4 bindings, 0 measure/place/layout passes, 636 paint entries. Retained vs virtual: 64 vs 10 mounted rows. Coarse 16-row sparse updates evaluate 64 bindings for the same four writes; fine evaluates 4. AOT's 16-row counts agree with the interpreter's corresponding first-three scenes. Native host visits are actual zero on these drawn runs; no native backend performance claim. Both list models allocate the same per-row model arrays; this is mounted-work evidence, not a model-memory comparison.

Limitations: frame timings still aggregate the whole scene and are not a quiet-machine baseline. Structural phase counters include warm-up while timed profiles exclude skip. Optional visits start after a profiling frame begins; pre-frame work is excluded. Style, Yoga internals and DOM host visits are explicitly unmeasured, RSS/heap unavailable; no cross-device, GPU, ranking or engine throughput optimization claim. See docs/reports/render-bench-design.md for the contract and reproducible small commands.

Proposed later line: ZN-1084: investigate root layout invalidation and retained paint traversal after sparse labels; four bindings still produce 528 measure/848 paint visits at 64 rows. Keep the new structural oracle while optimizing; do not infer engine locality from effect counts.
Proposed decision text: keep the existing zbench pipeline and schema with an optional ui_work extension; measure binding work and UI visits separately, gate correctness/provenance, record unavailable memory as null. No new library or framework comparison.
Usage: n/a (tools/usage).

Proposed tests:
- tools/zbench run mac --scene ui_noop,ui_sparse_label,ui_paint_only,ui_filter,ui_lifetime,ui_retained,ui_virtual --runs 1 --frames 8 --skip 0 --set ZB_ROWS=64,ZINC_HEADLESS=1 --out /tmp/zbench-ui-aot64.json: all seven AOT oracles, roughly 10–30 s including build, under 1 GB expected (not measured).
- Owner-chosen quiet-machine zbench selection at 100/1000 rows, fine and coarse, drawn and native host: compare stage scaling and timing spread; no cross-target claim until run there. Duration/memory depend on the selected backend, bounded per launch.
<!-- SECTION:NOTES:END -->
