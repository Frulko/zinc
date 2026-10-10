---
id: ZN-607
title: Trackpad scrolling locks to the dominant axis
status: Done
assignee: []
created_date: '2026-10-09 15:07'
updated_date: '2026-10-10 00:23'
labels:
  - ui
milestone: m-21
dependencies: []
priority: medium
ordinal: 5101
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seen on examples/nuxt-ui (owner): a mostly vertical two-finger swipe also pans sideways once a scroll container overflows on X, because trackpadInput passes both deltas to directScroll (lib/std/ui.ts around 3545 and 3960-3990). macOS scroll views and Safari lock a swipe to its dominant axis: pick the axis on the first non-zero sample of a gesture and pass 0 for the other until the fingers lift (scroll phase end); a diagonal start or a clearly 2D content (a map, a canvas) keeps both. The nuxt-ui sections that overflowed were fixed by letting their rows wrap (fix 2026-10-09).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 a vertical swipe with a small horizontal drift does not move a 2D scroller sideways (scroll_axis case)
- [x] #2 a horizontal swipe still scrolls a wide table
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Code and golden in 00cbd143 (lib/std/ui.ts trackpadInput: padAxis picked on the first non-zero sample of a gesture, vertical when |dy| >= 2|dx|, horizontal when |dx| >= 2|dy|, both otherwise; reset on phase 2/3). Checked 2026-10-10 on the Intel Mac: tests/run --only scroll_axis PASS; with HEAD~1's ui.ts the same case fails (vertical swipe: left -15, horizontal swipe: top moved), so the golden is the regression test. Full T1 on this commit: 251 passed, 5 failures unrelated to ui.ts (tls, macos_window, three_3d, video, webgl_conformance: follow-up tasks). Maps and canvases with their own wheel handler get wheel steps, not directScroll, so they keep both axes. Usage: n/a (tools/usage).
<!-- SECTION:NOTES:END -->
