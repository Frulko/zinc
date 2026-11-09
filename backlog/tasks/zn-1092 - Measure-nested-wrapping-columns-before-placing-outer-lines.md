---
id: ZN-1092
title: Measure nested wrapping columns before placing outer lines
status: Done
assignee: []
created_date: '2026-11-09 14:44'
updated_date: '2026-11-09 14:48'
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
- [x] #1 Ordinary nested flex-wrap parents include actual wrapped child/sibling cross sizes so subsequent outer lines do not overlap at constrained widths
- [x] #2 Narrow regression covers original768px repro and relevant width-change/gap/min-max behavior across interpreter AOT QuickJS without extra global layout passes
- [x] #3 Unchanged design gallery768/1024 captures and interactions no longer overlap, narrow/wide layouts and relevant existing layout T0 remain correct; no app workaround
<!-- AC:END -->

## Implementation Notes

- Research: [CSS Flexbox cross-size determination](https://www.w3.org/TR/css-flexbox-1/#cross-sizing) measures hypothetical cross sizes using the already allocated main sizes. Existing classic measure offered each child the entire row, then outer placement grew its basis to a narrower width without accounting for wrapping inside it.
- Wrapped-row measurement now resolves each line's widths with the existing cssFlex/growWithLimits/shrunk/constrainSize operations and measures child cross sizes at those widths, retaining the original bases for line formation/placement. No repeated global layout, native-layout change, new lifecycle, dependency or application workaround. Scope read: calculate/measure/place, basis/flow sizing, percentage/min/max/gaps, CSS flex and scroll content sizing. Profiling counters and unrelated Virtual/Fenwick/focus code are unchanged.
- Original engine-only `/tmp/1087-proof/wrap.tsx` unchanged at768x800 now reports middle353,24,390,342; last24,387,720,100; gap21 (previous middle height221, lasty266).
- Exact `tests/run --only ui_nested_wrap` passes interpreter/AOT/QuickJS:360/768/1024/1440 and return768, maximum width380, nested gap21→10, outer gaps21 and wide single-line behavior. Existing exact `tests/run --only layout_css` also passes, including percentage/basis/minimum/constrained-size cases. No C++ change or build needed.
- The original gallery proof had a harness error: `scan` overwrote its scroll target with the last nested horizontal scroller (node652, scrollTop0), so bottom assertions targeted the wrong view. `/tmp/1087-proof/core-corrected.tsx` changes only target selection to the first outer vertical scroller and retains every assertion. Its90-frame native background run passes360/768/1024/1440, all bottom assertions, pointer/Enter/Space, editing/focus, light/dark and final `gallery responsive: ok`. No app source changed.
- Actual native768x800 and1024x800 captures `.logs/1092-gallery-42.png` and `.logs/1092-gallery-64.png` were visually inspected: nested metric cards, calendar/release and following cards no longer overlap. Separate gallery verifier owns final reproducible artifacts. Commands serialized/bounded through tools/work-run; no process left.

## Proposed tests

- At the chosen layout milestone: existing layout_conformance, layout_css, style_flex, style_size, scroll_end and rn_port feature sessions; broader align-content/reverse/percent combinations and quiet-machine visit scaling remain unrun.
