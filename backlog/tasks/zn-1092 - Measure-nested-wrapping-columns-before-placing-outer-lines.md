---
id: ZN-1092
title: Measure nested wrapping columns before placing outer lines
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-11-09 14:44'
labels:
  - ui
  - layout
  - size-S
milestone: m-32
dependencies: []
type: bug
ordinal: 1009
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Blocks owner screenshot fix ZN-1087 responsive design gallery. Minimal engine-only17line repro /tmp/1087-proof/wrap.tsx, no kit: at768px middle parent box353,24,390,221; its nested wrapping row takes221px and its following100px sibling starts y266. Last outer column also starts y266: middle parent kept221px instead of342 and overlaps the next outer flex line. Gallery360 one-column and1440 three-column are clean,768 wrapping exposes stale cross-size measurement. Do not hide it by changing valid responsive app code or forcing one column.

Fix shared classic nested flex-wrap measurement/placement after width allocation: parent/outer line cross size must account for the child height after its own wrapping and following siblings. Inspect calculate/measure/place/flex basis callers; preserve percentages, min/max, gaps, constrained sizes and Yoga mode. Small measured regression over ordinary Views, not a new layout framework or global repeated relayout. Other-session ui.ts Virtual/Fenwick near636/967 stays untouched. Primary references: CSS Flexbox cross-size determination https://www.w3.org/TR/css-flexbox-1/#cross-sizing and Flutter constraints https://docs.flutter.dev/ui/layout/constraints; initial supplied research supports actual allocated constraints feeding child sizes.

Work after1091aspect lock in same sole core chain, before1088metadata/1090icons. Build nothing for TS-only fix; use read-only clean binary with own ZINC_ROOT. Exact T0, small three-engine repro, original gallery capture at768/1024; no pixel suite/demo suite or benchmarks.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Ordinary nested flex-wrap parents include actual wrapped child/sibling cross sizes so subsequent outer lines do not overlap at constrained widths
- [ ] #2 Narrow regression covers original768px repro and relevant width-change/gap/min-max behavior across interpreter AOT QuickJS without extra global layout passes
- [ ] #3 Unchanged design gallery768/1024 captures and interactions no longer overlap, narrow/wide layouts and relevant existing layout T0 remain correct; no app workaround
<!-- AC:END -->
