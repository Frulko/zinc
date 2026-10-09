---
id: ZN-430
title: Launch a .zapp without reading or hashing the whole archive
status: Backlog
assignee: []
created_date: '2026-10-09 07:35'
labels:
  - games
  - assets
  - size-M
milestone: m-22
dependencies: []
ordinal: 198000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Read the ustar headers (or an index member written first) and map members in place. Verify a member's SHA-256 against manifest.json when it is first read. Unpack to the cache only what must be a file (native plugin libraries). Report: docs/reports/games/toolchain-assets-loading.md (1.2, 6.1).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 a .zapp with 100 MB of assets launches in under 100 ms with under 60 MB peak memory (today 2.0-2.3 s, 450-520 MB)
- [ ] #2 a corrupted member is refused when read, with today's message
- [ ] #3 the zapp, fuse and update tests pass
<!-- AC:END -->
