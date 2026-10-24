---
id: ZN-499
title: >-
  PocketJS 2D demo parity on the four devices: Motion Lab, Talk, launcher,
  gallery
status: Backlog
assignee: []
created_date: '2026-10-09 07:39'
labels:
  - handheld
  - pocketjs
  - parked
milestone: m-23
dependencies:
  - ZN-488
  - ZN-471
  - ZN-472
  - ZN-497
ordinal: 96000
updated_date: '2026-10-25 01:53'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Port the PocketJS showcase set to Zinc on PSP, Vita, 3DS and iPhone 4S: Motion Lab studies (baked keyframes, arcs, painter-sorted 3D quads with affine UVs), a chat app with on-screen keyboard and virtual list, a Cover Flow launcher, a gallery. Compare with PocketJS's published numbers (Motion Lab busiest page under 16.7 ms on PSP). (From docs/reports/hardware/pocketjs-pocket3d.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Each demo runs on the four devices with emulator goldens where an emulator exists
- [ ] #2 PSP hardware receipts at 60 fps for each demo, or the gap recorded with its cause
- [ ] #3 A comparison table with PocketJS numbers is added to this report's follow-up notes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: parked. (drop proposed, corrected by the verifier) PocketJS 2D parity is a stated owner target: the owner listed 'PSP, PS Vita, 3DS, iPhone 4S (PocketJS/Pocket3D demo parity)' as hardware to target (owner, 2026-10-09, project memory perf-first-and-handheld-targets; docs/reports/hardware/pocketjs-pocket3d.md:700 proposes the 'PocketJS/Pocket3D parity' milestone) and AGENTS.md names PocketJS as the performance reference; far and board-bound is park, not drop (BRIEF rule).
<!-- SECTION:NOTES:END -->
