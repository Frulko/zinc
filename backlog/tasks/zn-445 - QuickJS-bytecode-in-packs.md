---
id: ZN-445
title: 'QuickJS bytecode: log line on version mismatch, bytecode in packs'
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
ordinal: 13700
updated_date: '2026-10-25 01:53'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**What is left (review 2026-10-25):** Print one log line when a .qbc is skipped (older than the bundle or written by another QuickJS-ng BC_VERSION). Optional: store the bytecode as a pack entry. Pi 3 start-time before/after goes to the cross pass. Already there: src/qjs/qjs.cpp:646 (JS_WriteObject, STRIP_SOURCE); tests/t1/qjs_build_bytecode.sh; CHANGELOG (zinc build writes build/<name>.qbc, export starts from it).

Write bytecode with JS_WriteObject at pack and export time, recording the QuickJS-ng BC_VERSION and engine hash; keep the source as a fallback. Optionally bundle and minify npm dependencies with a pinned esbuild. Report: docs/reports/games/toolchain-assets-loading.md (5).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 start time of the 3d template on the Pi 3 before and after is in the notes
- [ ] #2 a version mismatch falls back to the source with one log line
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: done-partly. QuickJS bytecode is written at build and export for quickjs projects, and a stale or foreign-version file is skipped with the source as fallback. Not in packs, and the skipped file prints no log line. Left: the one log line on version mismatch and the Pi 3 start time (cross). Evidence: src/qjs/qjs.cpp:646 (JS_WriteObject, STRIP_SOURCE); tests/t1/qjs_build_bytecode.sh; CHANGELOG (zinc build writes build/<name>.qbc, export starts from it)
<!-- SECTION:NOTES:END -->
