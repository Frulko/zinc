---
id: ZN-1084
title: Measure sparse UI work and lifecycle in zbench
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-11-09 13:33'
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
- [ ] #1 Existing zbench runs deterministic no-op, sparse label, paint-only, lifecycle/filter and virtualized UI cases at configurable row counts without breaking existing scenes or artifacts
- [ ] #2 Artifacts distinguish binding/component work from layout/paint/host visits and setup/settled/disposal, include model/wiring/rows provenance and honest unavailable memory metrics
- [ ] #3 Correctness oracles and a small T0 cover equal write doing no reactive work, local text correctness/identity, disposal unsubscribing and artifact/gate compatibility
- [ ] #4 A bounded small headless Mac proof produces valid report through the real harness and documents commands/limits; no full benchmark or cross-target claim
<!-- AC:END -->
