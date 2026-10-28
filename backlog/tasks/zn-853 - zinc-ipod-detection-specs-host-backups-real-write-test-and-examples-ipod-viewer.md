---
id: ZN-853
title: >-
  zinc:ipod: detection, specs, host backups, real write test, and examples/ipod
  viewer
status: Backlog
assignee: []
created_date: '2026-10-28 22:38'
labels:
  - size-L
  - plugin
milestone: m-9
dependencies: []
ordinal: 562460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner 2026-10-28: better detection and backups, the write test on the real iPod (backup first), and a small demo app showing the iPod, its music with artwork and every detail of the iPod.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 detect() also lists iPods connected over USB that are not mounted, with their model from the USB description
- [ ] #2 specs(): every field of SysInfoExtended and the database (firmware, serial, GUID, artwork formats, capabilities, counts, storage use) as groups of name and value
- [ ] #3 Before the first change of a session, the database is copied to the computer (ZINC_HOME/ipod/<serial>/), the last ten kept; backup() copies music incrementally and backups() lists them
- [ ] #4 Write test on the owner's iPod after a host backup: add a track to a test playlist, read it back, restore; recorded in the notes
- [ ] #5 examples/ipod: the iPod's info and specs, albums with their covers, tracks of an album, playlists; follows examples/GUIDELINES.md; runs on the fake iPod in a test
<!-- AC:END -->
