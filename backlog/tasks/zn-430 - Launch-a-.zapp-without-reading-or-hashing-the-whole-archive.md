---
id: ZN-430
title: Launch a .zapp without reading or hashing the whole archive
status: Done
assignee: []
created_date: '2026-10-09 07:35'
updated_date: '2026-10-11 08:25'
labels:
  - games
  - assets
  - size-M
milestone: m-22
dependencies: []
ordinal: 29000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Read the ustar headers (or an index member written first) and map members in place. Verify a member's SHA-256 against manifest.json when it is first read. Unpack to the cache only what must be a file (native plugin libraries). Report: docs/reports/games/toolchain-assets-loading.md (1.2, 6.1).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 a .zapp with 100 MB of assets launches in under 100 ms with under 60 MB peak memory (today 2.0-2.3 s, 450-520 MB)
- [x] #2 a corrupted member is refused when read, with today's message
- [x] #3 the zapp, fuse and update tests pass
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done (2026-10-11). src/zapp.cpp unpackTo: a launch reads the ustar headers (seeking over the data) and manifest.json only; the cache directory is named by the manifest's SHA-256 (it lists every member's hash: the content) and holds a stamp of each file found whole (path, size, time to the ns, offset). An unchanged .zapp or fused executable runs from it with no other read; a new or changed one is checked member by member as it streams through SHA-256 (1 MB at a time), and unpacked the first time; the refusals and their messages are unpack()'s (readManifest shared). src/main.cpp: unpackZapp takes the file, offset and size (fusedArchive gives the archive's place in the executable instead of reading it). AC1: game-2d + 100 MB of random assets (105 MB .zapp), ZINC_HEADLESS=1 ZINC_FRAMES=1 zinc run under /usr/bin/time -l: first launch 0.92 s and 5.2 MB peak, then 0.01 s and 4.8-5.4 MB (was 2.0-2.3 s, 450-520 MB at every launch); logged in docs/reports/zinc-next-perf.md. AC2: tests/t0/zapp.sh keeps its corrupted, newer and escaping archives and adds one changed in place after a launch: refused with 'the archive is corrupted: program.zbc does not match its checksum'. AC3: zapp, fuse, update_sign, app_update, app_update_api pass. Not done (later.md): the members are still unpacked into the cache rather than read in place; assets read by path (video, sqlite, zinc:fs) need files. usage: n/a
<!-- SECTION:NOTES:END -->
