---
id: ZN-1047
title: 'zinc:3d World: shadows switch and glTF night lights'
status: Backlog
assignee: []
created_date: '2026-11-07 16:39'
labels:
  - 3d
  - size-M
milestone: m-8
dependencies: []
ordinal: 1039000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
World cannot switch shadows; glTF cities cannot light up at night; TOP batches missing for textured grounds.

From backlog/later.md, promoted by the review of 2026-11-07 (docs/reports/backlog-review-2026-11-07.md). The lines it carries:

- world rule: night pictures and night glow per material (material extras), so a glTF city lights up like Tokyo's.
- world rule: emit `TOP` batches for textured grounds whose uvs follow x/z, so the PSP and 3DS compact layouts apply.
- zinc:3d: `World` needs a real shadows on/off; tokyo fakes "off" with a flat height field and re-reads `hmap.bin` to turn them on (freeing the old map while a frame may draw it is unchecked).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 World shadows on/off is real (no fake flat height field)
- [ ] #2 Night pictures and night glow per material
- [ ] #3 TOP batches for textured grounds with x/z uvs
<!-- AC:END -->
