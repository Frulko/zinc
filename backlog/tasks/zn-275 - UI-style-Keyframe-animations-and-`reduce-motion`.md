---
id: ZN-275
title: 'Keyframes and animate-spin/pulse/ping'
status: Backlog
assignee: []
created_date: '2026-10-07 12:58'
labels:
  - ui
  - style
  - size-M
milestone: m-17
dependencies:
  - ZN-263
  - ZN-274
ordinal: 3400
updated_date: '2026-10-25 01:53'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Rewritten by the review of 2026-10-25:** `@keyframes` in .css and `ui.keyframes` give the same frames at fixed ticks; `animate-spin|pulse|ping` presets; reduced motion holds the first frame of infinite animations.

From docs/reports/ui-style-system.md (section 6, ST-26). The audit and the design are in that report. Additive only: defaults and all examples/* stay pixel-identical (tools/proto-capture compare). lib/std/ui.ts is shared with the prototype and holds another developer's uncommitted StyleSheet work: land it first, then change the file with a hunk-only commit.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `@keyframes` in `.css` and `ui.keyframes` give the same frames at fixed ticks (golden).
- [ ] #2 `animate-spin`, `animate-pulse`, `animate-ping` presets.
- [ ] #3 With reduced motion set, infinite animations hold the first frame and transitions jump (test).
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: rewrite. Reduced motion and transitions exist; keyframes and the animate-* presets (spinners, skeletons) do not. Evidence: lib/std/ui.ts:2036,4972 reduce-motion held in animate(); no @keyframes, no animate-spin presets
<!-- SECTION:NOTES:END -->
