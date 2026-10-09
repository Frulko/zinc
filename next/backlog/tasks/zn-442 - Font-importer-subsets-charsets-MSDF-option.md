---
id: ZN-442
title: 'Font importer: subsets, charsets, MSDF option'
status: Backlog
assignee: []
created_date: '2026-10-09 07:36'
labels:
  - games
  - assets
  - size-M
milestone: m-22
dependencies:
  - ZN-428
  - ZN-434
ordinal: 210000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Font subsets as an importer, with charset declarations (named sets, files of strings). MSDF atlas option through msdf-atlas-gen, with its shader in display-gl and WebGL. Report: docs/reports/games/toolchain-assets-loading.md (4.4).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 text from an i18n JSON file is baked
- [ ] #2 a label scaled 8x stays sharp (pixel test against a reference)
<!-- AC:END -->
