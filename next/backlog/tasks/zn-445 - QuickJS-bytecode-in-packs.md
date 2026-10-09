---
id: ZN-445
title: QuickJS bytecode in packs
status: Backlog
assignee: []
created_date: '2026-10-09 07:36'
labels:
  - games
  - assets
  - size-M
milestone: m-22
dependencies:
  - ZN-433
ordinal: 213000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Write bytecode with JS_WriteObject at pack and export time, recording the QuickJS-ng BC_VERSION and engine hash; keep the source as a fallback. Optionally bundle and minify npm dependencies with a pinned esbuild. Report: docs/reports/games/toolchain-assets-loading.md (5).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 start time of the 3d template on the Pi 3 before and after is in the notes
- [ ] #2 a version mismatch falls back to the source with one log line
<!-- AC:END -->
