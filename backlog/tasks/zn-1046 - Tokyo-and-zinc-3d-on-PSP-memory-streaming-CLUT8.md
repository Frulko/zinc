---
id: ZN-1046
title: 'Tokyo and zinc:3d on PSP: memory, streaming, CLUT8'
status: Backlog
assignee: []
created_date: '2026-11-07 16:39'
labels:
  - psp
  - 3d
  - size-M
  - consoles
milestone: m-23
dependencies: []
ordinal: 56100
updated_date: '2026-11-07 18:30'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
PSP gaps of the Tokyo demo, proven on PPSSPP.

From backlog/later.md, promoted by the review of 2026-11-07 (docs/reports/backlog-review-2026-11-07.md). The lines it carries:

- tokyo PSP: CLUT8 pictures with day and night palettes mixed by the hour (Pocket P4); needs `worldNight(id, amount)` as a number; a smooth dusk and a quarter of the texture memory.
- tokyo PSP: shadows from the height-grid sweep in bit 7 of the ground indices and the palettes' upper half (Pocket P4/C5), the last visible gap after the near level.
- zinc:3d PSP: ordinary draws after a World in the same frame use the full depth range, not the World's split ranges; give them the far range if a scene mixes both.
- zinc:3d select: per-sector ranges cost 0.4 ms of selection on the PSP; a cheaper facing() (four atan2f per cell) wins it back.
- zinc:3d PSP: the pre-World-GE PSP renderer crashed PPSSPP on tokyo from a fresh build dir; check memory (72 bytes a vertex) if the old path is ever used again.
- tokyo PSP: a PSP-1000 fit needs a smaller runtime heap (the psp profile's 16 MB) and the pack read from the memory stick instead of embedded; the heights also cost 1.5 MB twice (pack and the heap copy from zn_asset_bytes).
- tokyo PSP: run the shadow sweep on a low-priority thread during the vblank and GE wait as Pocket does, to remove its 1 ms a frame.
- tokyo PSP: CLUT8 mipmaps (Pocket's down to 16 texels) with bit 7 set per level, against far-ground shimmer.
- zinc:3d PSP: clut8 pictures are never freed; free a world's pictures when it closes.
- tokyo PSP and Vita: stream the near level from the memory card as the 3DS does (the PSP-1000 needs it for memory too).
- tokyo PSP: CLUT8 mipmaps for the ground pictures, against far-ground shimmer.
- tokyo PSP: a 13 ms read in the 5th frame after loading is the run's max (19 ms); send that entry to the reader thread.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Near level streams from the memory card; runtime heap fits PSP-1000
- [ ] #2 CLUT8 mipmaps and day/night palettes; shadow sweep on a low-priority thread; clut8 pictures freed with the world
- [ ] #3 Ordinary draws after a World use the right depth range; the 13 ms read goes to the reader thread
<!-- AC:END -->
