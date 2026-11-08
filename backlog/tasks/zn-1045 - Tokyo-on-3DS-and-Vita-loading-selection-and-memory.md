---
id: ZN-1045
title: 'Tokyo on 3DS and Vita: loading, selection and memory'
status: Backlog
assignee: []
created_date: '2026-11-07 16:39'
labels:
  - 3ds
  - vita
  - size-M
  - consoles
milestone: m-23
dependencies: []
ordinal: 1037000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
3DS and Vita gaps of the Tokyo demo and the console player.

From backlog/later.md, promoted by the review of 2026-11-07 (docs/reports/backlog-review-2026-11-07.md). The lines it carries:

- tokyo: the Vita at a 2000 m mid reach did not finish in Vita3K under load; measure on a quiet Mac whether it is memory (more mid chunks resident).
- tokyo: the first frame after loading takes 26 to 62 ms on the consoles (269 ms on the Mac); warm it up behind the loading screen.
- tokyo: the World selection costs 3.9 ms a frame on the PSP and 5.1 on the 3DS; sort ranges incrementally or select every other frame on the handhelds.
- tokyo 3DS: stream the near level (`c*.near.zwc`, 15 MB) from the SD card or romfs like Pocket's 40 slots: embedded beside the 12.7 MB pack it does not fit an Old 3DS's 64 MB; needs the console core's pack reader to read from the card.
- tokyo 3DS: selection is still 3.6 ms in Azahar (cells 1.8, ranges 0.8, chunk reads 0.8); skip the read-ahead points' boxDist for cells far past the mid reach.
- n3ds: a develop baseline build of tokyo hit svcBreak in GPUCMD_AddInternal (command buffer full) at 5.9 s in Azahar; raise C3D_Init's command buffer size if it shows on hardware.
- n3ds: a mid chunk read from the pack inside the .3dsx takes 15-70 ms in Azahar, so the frame that reads one is late; move those reads to the SD reader thread or make them cheaper.
- zinc:3d: `zn_asset_image_free` also frees a near picture a program took by name itself; pictures need a reference count.
- n3ds: night pictures go to the GPU at load even by day (about 5 MB of GPU memory); upload them when the dusk starts.
- docs: with neither a launcher path nor `ZINC_SD_DIR`, the 3DS looks for its packs in `sdmc:/3ds/zinc/`; say so in the 3DS target doc.
- console player: the waiting screen has no font on PSP and Vita until a program has run (the 3DS now embeds player_font.zrs); the shared fix is in core_main's playerLoop (install zn_console_resources or a built-in grid font).
- n3ds: render3d.n3ds.cpp does not check its linearAlloc results; drop far-level pictures instead of exiting when linear memory runs out.
- tokyo 3DS: mid chunks now come from the card, so the loading takes 175 frames instead of 32; read the chunks the loading needs in larger batches.
- consoles: `console host: host.assetsStat is not available on n3ds` (n3ds-platformer).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Mid chunk reads move off the frame (SD thread, larger batches); selection cost cut on 3DS
- [ ] #2 linearAlloc failures drop pictures instead of exiting; command buffer size raised if it shows; night pictures uploaded at dusk
- [ ] #3 Console player waiting screen has a font on PSP and Vita; host.assetsStat exists on n3ds
- [ ] #4 3DS doc says where packs live
<!-- AC:END -->
