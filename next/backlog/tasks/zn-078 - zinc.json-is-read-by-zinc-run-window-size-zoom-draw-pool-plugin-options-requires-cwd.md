---
id: ZN-078
title: >-
  zinc.json is read by zinc run (window size, zoom, draw pool, plugin options,
  requires, cwd)
status: Backlog
assignee: []
created_date: '2026-10-06 22:51'
labels:
  - cli
  - examples
  - size-M
milestone: m-15
dependencies:
  - ZN-059
ordinal: 40200
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Audit 02 RC21/RC24: `zinc run` never reads zinc.json, so window width/height/zoom/resize, growDrawCommands (level prints the draw-pool warning), per-target plugin options (3d.scale), `requires`, `display` and the project directory (examples open media/... relative to it) are ignored. Read it (yyjson), apply the keys that concern the host (ZINC_* equivalents), chdir to the project directory, honour `entry`/`main`, and report unknown keys. The schema is documented in docs/guide/05-plugins.md and compiler/src/cli.ts.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 tests: size/zoom reach the window HAL; growDrawCommands removes the warning on examples/boards/s3-matrix/level; media/ relative paths work from any cwd (bounce, quad, looper reach their file opens)
- [ ] #2 zinc run examples/<dir> (a directory) finds its entry from zinc.json or src/main.ts[x]
<!-- AC:END -->
