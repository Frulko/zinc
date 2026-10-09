---
id: ZN-434
title: Asset build graph and content-addressed cache
status: Backlog
assignee: []
created_date: '2026-10-09 07:35'
labels:
  - games
  - assets
  - size-L
milestone: m-22
dependencies:
  - ZN-433
ordinal: 202000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
src/res grows into src/assets: rules, importer registry, built-in importers (copy; PNG/JPEG/WebP/SVG to premultiplied RGBA8/RGB565/RGBA4444; the font baker), groups to packs, report.json and `zinc assets build`. run, pack, build and export call it. Includes the importer decision record (pinned tools as subprocesses, script importers in Zinc). Report: docs/reports/games/toolchain-assets-loading.md (4.1, 4.9, 9).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 a second build of an unchanged project runs no importer (under 50 ms for game-2d)
- [ ] #2 changing one image re-imports only that image
- [ ] #3 packs are identical across two directories and two ZINC_HOMEs
- [ ] #4 the report lists every asset with source bytes, output bytes and time
<!-- AC:END -->
