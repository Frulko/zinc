---
id: ZN-679
title: >-
  GL replay fill rate: 30 photo cards at 5.4 million pixels run at 40 frames per
  second
status: Backlog
assignee: []
created_date: '2026-10-10 19:35'
labels:
  - gpu
  - perf
  - size-M
milestone: m-27
dependencies: []
ordinal: 435410
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
(Found by the museum table, ZN-650.03 and ZN-650.04.) The light table of the museum demo holds 60 fps with 30 moving cards at 1920x1080 physical pixels (114 to 118 without vsync) but 40 fps in a 3104x1746 window on the Radeon Pro 555X; a 4K touch table has 8.3 million pixels. Find where the time goes in the GL replay of transformed images, shadows and text (overdraw, blending, batch breaks) and bring 30 cards to the display rate at the laptop's full window.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 30 moving cards at 3104x1746 at 60 fps on the development Mac, measured alone (frame times in docs/reports/zinc-next-perf.md, before and after)
- [ ] #2 the pixel goldens of museum_table and gfx_transform unchanged
<!-- AC:END -->
