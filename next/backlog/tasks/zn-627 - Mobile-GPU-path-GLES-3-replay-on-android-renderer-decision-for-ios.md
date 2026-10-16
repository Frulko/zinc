---
id: ZN-627
title: 'Mobile GPU path: GLES 3 replay on android, renderer decision for ios'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-10 14:07'
updated_date: '2026-10-16 12:46'
labels:
  - mobile
  - size-M
milestone: m-26
dependencies:
  - ZN-741
ordinal: 203000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`gl_replay` on a GLES 3 context on Android; on iOS measure the software raster through Metal, GLES through EAGL and (if needed) ANGLE, and decide (From the spike ZN-372, docs/reports/zinc-next-mobile-spike.md, D59.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 frame times of rn-showcase and hero on both in `docs/reports/zinc-next-perf.md`
- [ ] #2 pixels equal to the desktop GL goldens within the existing tolerance
- [ ] #3 a decision record for iOS
- [ ] #4 the iOS decision follows D119: our own Metal back end of the command lists, scored against GLES through EAGL and ANGLE on Metal for the record
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-16 (owner): the Nexus 7 is GLES 2 only, so the Android GLES path is ZN-741's GLES 2 base; this task keeps GLES 3 for capable Android devices and the iOS decision. The 2026-09 scoring (docs/reports/parity/04-library-choices.md §2.10, ui-rendering-architecture.md §2.11) rejected bgfx for its shader tool chain when GLES 2 and Metal were not both required; now they are.

2026-10-16, later: the owner kept our own layer (D119); bgfx is not re-scored.
<!-- SECTION:NOTES:END -->
