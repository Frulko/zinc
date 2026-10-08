---
id: ZN-288
title: >-
  Layout: `classic` RN-compat subset, opt-in via `"preset": "react-native"` or
  tokens
status: Done
assignee: []
created_date: '2026-10-07 13:08'
updated_date: '2026-10-08 18:38'
labels:
  - ui
  - layout
  - size-L
milestone: m-17
dependencies:
  - ZN-282
  - ZN-251
ordinal: 50780
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/layout-engines.md (section 8, LE-9). Decision: a pluggable layout interface, `classic` stays the default, Yoga 3.2.1 is the opt-in `rn` mode for React Native fidelity. lib/std/ui.ts is shared with the prototype: land the other developer's uncommitted work first, then hunk-only commits.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `flex: 1` equal shares (basis 0), `flexShrink`, `minWidth/maxWidth`, `alignSelf`, `aspectRatio` available as opt-in props; with none set the legacy loop runs unchanged (goldens tol 0).
- [x] #2 These cases pass in the conformance runner for `classic`.
- [x] #3 `size` growth of `classic` documented, under 6 KB of ZBC on the esp32 profile. Replaces ST-05's remaining scope.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a
Done: "preset": "react-native" now means React Native style semantics in either engine (uiPreset(), UI_PRESET of zinc:platform): flex: n lowers to grow n / shrink 1 / basis 0 and text defaults to black; on a target without Yoga the preset resolves to classic instead of failing (explicit layout rn still fails; ui_layout_option updated). classic gains CSS's freeze loop (growWithLimits) for a growing item with a main-axis min/max, only when such an item is in the line. flexShrink, flexBasis, min/max, alignSelf, aspectRatio, alignContent were already in classic. Conformance runner tests/t1/layout_compat.sh: classic+preset vs Yoga equal on all cases except minWidth+grow (classic CSS 250/50, Yoga 275/25, known). Size +1,086 B ZBC on esp32 (467,771 -> 468,857), documented in docs/reports/layout-engines.md and docs/ui.md (Layout engines). tests/run --changed 48/48, proto-capture 4/4; the 42-entry compare runs in the background (.logs/zn288-proto-all.log).
<!-- SECTION:NOTES:END -->
