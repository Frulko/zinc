---
id: ZN-429
title: AOT programs embed their resources with .incbin
status: Backlog
assignee: []
created_date: '2026-10-09 07:35'
labels:
  - games
  - assets
  - size-S
milestone: m-22
dependencies: []
ordinal: 197000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
aot.cpp writes the baked blob to a file plus a small assembler stub (Mach-O __DATA,__const or ELF .rodata) instead of a decimal array literal. Report: docs/reports/games/toolchain-assets-loading.md (1.2, 6.2).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 a 50 MB blob builds in under 3 s and 300 MB peak on the Mac
- [ ] #2 the examples' frames are unchanged
- [ ] #3 works with clang and the pinned zig c++ for macOS, Linux x86_64, aarch64 and armhf
<!-- AC:END -->
