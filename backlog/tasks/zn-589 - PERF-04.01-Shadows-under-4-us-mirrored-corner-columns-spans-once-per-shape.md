---
id: ZN-589
title: 'PERF-04.01 Shadows under 4 us: mirrored corner columns, spans once per shape'
status: Done
assignee: []
created_date: '2026-10-09 08:42'
updated_date: '2026-10-10 14:43'
labels:
  - perf
milestone: m-21
dependencies:
  - ZN-403
priority: low
ordinal: 368270
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Split from ZN-403: shadows went from 14.05 to 4.38 us per command on b2-rounded (best of 5 under load), the target was 4 us. Left: the left and right corners of a row are computed separately although their qx are mirror images (bit-equal when 2cx is a pixel boundary), and row_span runs twice per row (two square roots).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 SHADOW <= 4 us per command on b2-rounded (per-kind harness), unloaded machine
- [x] #2 pixel goldens identical (hash d05bc629d0c042a4 for b2-rounded)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done 2026-10-10 (usage: n/a, session total), AC1 split to ZN-589.01.
- runtime/raster.cpp shadow_rrect: when 2cx is whole, the right part of a new alpha row copies the mirrored left columns (bit-equal qx); when 2cy is whole (and the cache exists), a bottom row reuses its mirrored top row's spans and alpha slot (no row_span, no key search), rows above the centre skip the key search (their qy are new), middle rows share one slot when their spans match (they differ when the inner radius was clamped to 0). Fractional centres keep the key search.
- AC2: same pixels: b2-rounded frame 12 hash 6319f520874cbea2 before and after on this machine (d05bc629d0c042a4 was the M1's value of another setup); proto-capture canary 4/4; scene_dump, backend_sw, damage_sig, ui_style, style_shadow, style_border pass; new tests/t1/shadow_mirror.sh (300 shadows of every shape, scales 1 and 2, golden recorded with the former code).
- AC1 not met on this machine: Intel Mac unloaded, 2000 shadows 18.5-18.9 -> 16.9-17.2 ms = 9.2-9.4 -> 8.4-8.5 us per shadow (-9%); instructions 68.3k -> 65.8k. Breakdown (instructions/cycles removed by disabling parts): blend_alphas 30.8k/17.5k, alpha rows 18k/14k, blend_row 8.3k/8k, rows and keys 8.6k/3.3k. A 16-bit-lane SSE2 blend_alphas: same pixels, within noise (-4%), dropped. The target was set on the M1 (4.38 us): ZN-589.01 remeasures on arm64.
- Measuring: other agents loaded the machine (ZN-613's load test: 16 'yes', load 70-120); I waited for load < 8 before the timings; instruction counts (time -l) stayed usable under load.
<!-- SECTION:NOTES:END -->
