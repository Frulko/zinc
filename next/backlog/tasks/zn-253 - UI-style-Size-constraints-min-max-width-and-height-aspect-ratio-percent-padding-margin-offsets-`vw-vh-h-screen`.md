---
id: ZN-253
title: >-
  UI style: Size constraints: min/max width and height, aspect-ratio, percent
  padding/margin/offsets, `vw/vh/h-screen`
status: Review
assignee: []
created_date: '2026-10-07 12:56'
updated_date: '2026-10-08 06:07'
labels:
  - ui
  - style
  - size-M
milestone: m-17
dependencies: []
ordinal: 50530
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/ui-style-system.md (section 6, ST-04). The audit and the design are in that report. Additive only: defaults and all examples/* stay pixel-identical (tools/proto-capture compare). lib/std/ui.ts is shared with the prototype and holds another developer's uncommitted StyleSheet work: land it first, then change the file with a hunk-only commit.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 40 generated cases equal the browser fixtures (+-1 px).
- [x] #2 Golden of a card grid with `aspect-video`, `max-w-md` centred.
- [x] #3 No allocation added to `measure` (count from ZN-189's counter).
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. Done: min-w/min-h/max-w/max-h (px, [..], named xs..7xl, full, none, screen), aspect-video/square/auto/[a/b], w-screen/h-screen (re-evaluated on resize), size-N. UiNode minW/maxW/minH/maxH/aspect; constrainSize() applies at the end of measure and to the final size in place (after grow/stretch); aspect children of a row (grow) or a stretched column get their height counted in the container's size (extra measure pass only when an aspect child exists); mx-auto with max-w centres, w-full still fills with auto margins. Tests: tokens in tests/golden/ui-tokens (fields) + the JSX grammar cross-check, scene size-limits (centred max-w bar, three 16:9 cards, min-h box, checked on the image), 4-entry pixel canary equal, tests/run --changed 6 passed. NOT done: AC1 (40 cases against browser fixtures: no browser here, only the scene and token tests exist) and percent padding/margin/offsets; AC3 allocation counter does not exist yet (ZN-189), no allocation was added by construction (module variables, no arrays).
<!-- SECTION:NOTES:END -->
