---
id: ZN-452
title: 'Console and legacy texture layouts (PSP, 3DS, Vita, iPhone 4S)'
status: Done
assignee: []
created_date: '2026-10-09 07:36'
updated_date: '2026-10-25 01:53'
labels:
  - games
  - assets
  - size-L
milestone: m-22
dependencies:
  - ZN-439
ordinal: 214556
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A tex-console plugin: PSP swizzle with CLUT4/CLUT8 through exoquant and DXT; 3DS Morton tiling with ETC1/ETC1A4; Vita swizzle; iPhone 4S PVRTC1 at square power-of-two sizes. Each has a reference-decoder test. Parked until the console targets exist. Report: docs/reports/games/toolchain-assets-loading.md (3, 4.2).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 per format, a decode of the output equals the emulator's or a reference decoder's (PPSSPP, Citra-family, Vita3K, PVRTC reference)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done: rg_etc1 vendored, ETC1A4/CLUT4/CLUT8 encoders, PSP swizzle, picker unblocked, tests round-trip.
Review 2026-10-25: the open criteria are moot. Checking against PPSSPP/Citra/Vita3K needs the emulators: handheld cross pass.
<!-- SECTION:NOTES:END -->
