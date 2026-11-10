---
id: ZN-445
title: 'QuickJS bytecode: log line on version mismatch, bytecode in packs'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-09 07:36'
labels:
  - games
  - assets
  - size-M
milestone: m-22
dependencies:
  - ZN-433
ordinal: 15400
updated_date: '2026-11-07 18:30'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Rewritten by the review of 2026-11-07:** Keep: mismatch falls back to source with one log line; bytecode in packs. Measure start time on the Mac.

**What is left (review 2026-10-25):** Print one log line when a .qbc is skipped (older than the bundle or written by another QuickJS-ng BC_VERSION). Optional: store the bytecode as a pack entry. Pi 3 start-time before/after goes to the cross pass. Already there: src/qjs/qjs.cpp:646 (JS_WriteObject, STRIP_SOURCE); tests/t1/qjs_build_bytecode.sh; CHANGELOG (zinc build writes build/<name>.qbc, export starts from it).

Write bytecode with JS_WriteObject at pack and export time, recording the QuickJS-ng BC_VERSION and engine hash; keep the source as a fallback. Optionally bundle and minify npm dependencies with a pinned esbuild. Report: docs/reports/games/toolchain-assets-loading.md (5).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 QuickJS bytecode is included in packs alongside source, with engine/version metadata and a working source fallback
- [ ] #2 a version mismatch falls back to the source with one log line
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: done-partly. QuickJS bytecode is written at build and export for quickjs projects, and a stale or foreign-version file is skipped with the source as fallback. Not in packs, and the skipped file prints no log line. Left: the one log line on version mismatch and the Pi 3 start time (cross). Evidence: src/qjs/qjs.cpp:646 (JS_WriteObject, STRIP_SOURCE); tests/t1/qjs_build_bytecode.sh; CHANGELOG (zinc build writes build/<name>.qbc, export starts from it)
Review 2026-11-07: rewrite. Log line on QuickJS bytecode version mismatch and bytecode in packs; drop the Pi 3 start-time criterion.
<!-- SECTION:NOTES:END -->

Coordinator alignment: the explicit review2026-11-07 in this task drops the Pi3 start-time criterion and asks bytecode-in-packs plus mismatch logging. AC1 above now follows that recorded review; no performance benchmark or Pi run is authorized by this metadata correction. Existing source fallback/trust boundaries must be preserved.
