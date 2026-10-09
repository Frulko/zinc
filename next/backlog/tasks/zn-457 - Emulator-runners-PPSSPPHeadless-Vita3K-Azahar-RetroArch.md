---
id: ZN-457
title: 'Emulator runners: PPSSPPHeadless, Vita3K, Azahar / RetroArch'
status: Backlog
assignee: []
created_date: '2026-10-09 07:37'
labels:
  - handheld
  - handhelds
  - testing
  - size-M
milestone: m-23
dependencies:
  - ZN-456
ordinal: 300040
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Pin and fetch or build: PPSSPPHeadless from a pinned PPSSPP commit (--graphics=software, --timeout-wall, --screenshot-save, stdout forwarded), Vita3K release (needs the user's firmware PUP, installed once with --firmware; app via content path or --installed-path, log parsed), Azahar 2126.2 (Qt with a log filter that keeps Debug.Emulated, -p input movie, -g gdb stub) and RetroArch plus the Azahar libretro core (--max-frames, --max-frames-ss-path) as the headless alternative. zinc run --target <t> --emu wraps them and prints the text between zinc:start and zinc:exit.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 each runner is fetched or built reproducibly with a pinned hash and cached under ~/.zinc
- [ ] #2 a prebuilt sample binary per platform prints a line through each runner within 60 s; a hung program is killed by the timeout with a clear message
- [ ] #3 runners exit 77 (skip) when a requirement is missing (Vita firmware, no display server) and say which
- [ ] #4 docs/targets/handhelds.md lists the runners and their limits
<!-- AC:END -->
