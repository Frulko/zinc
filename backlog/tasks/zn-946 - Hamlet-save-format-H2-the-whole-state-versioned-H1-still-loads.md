---
id: ZN-946
title: 'Hamlet save: refuse future versions, storage-free snapshot'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-11-01 13:00'
labels:
  - hamlet
  - demo
  - m1
  - save
  - multiplayer-seam
  - size-M
milestone: m-30
dependencies:
  - ZN-943
ordinal: 11000
updated_date: '2026-11-07 18:30'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**What is left (review 2026-11-07):** Rename: Hamlet save: refuse future versions, storage-free snapshot.

The save keeps people, deer, stocks, tick and PRNG, in one text line per town, and the snapshot/restore code is separate from zinc:storage so a server can reuse it. See docs/reports/hamlet-roadmap-2026-11-01.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 snapshot()/restore() work on a string and a World with no storage import; save.ts only wraps them
- [ ] #2 H2 round trip: stateHash before == after for a village with stocks, workers mid-job, deer, 600 ticks played
- [ ] #3 H1 saves still load (test fixture from the current format)
- [ ] #4 Unknown future versions are refused with a message, not a crash
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-11-07: done-partly. Save is versioned (H19 to H22 all still load, examples/hamlet/src/world/save.ts:71); the Command log exists. Left: refuse unknown future versions with a message and a storage-free snapshot/restore.
<!-- SECTION:NOTES:END -->
