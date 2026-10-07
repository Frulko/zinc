---
id: ZN-078
title: >-
  zinc.json is read by zinc run (window size, zoom, draw pool, plugin options,
  requires, cwd)
status: Done
assignee: []
created_date: '2026-10-06 22:51'
updated_date: '2026-10-07 02:32'
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
- [x] #1 tests: size/zoom reach the window HAL; growDrawCommands removes the warning on examples/boards/s3-matrix/level; media/ relative paths work from any cwd (bounce, quad, looper reach their file opens)
- [x] #2 zinc run examples/<dir> (a directory) finds its entry from zinc.json or src/main.ts[x]
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. frontend/project.{h,cpp} (yyjson) reads zinc.json; zinc run accepts a directory (entry/main, else src/main.ts[x], main.ts[x]), the nearest zinc.json above a file, applies targets.<macos|linux, else sim> width/height/zoom/resize/fullscreen/kiosk as ZINC_* (env wins), chdirs to the project directory after compiling, reports unknown keys. growDrawCommands: runtime/gfx.cpp gained a runtime switch (grow_enabled, default true so the old toolchain is unchanged); the engine builds the grow variant and turns it on from zinc.json. level has no growDrawCommands key of its own, so its pool warning stays; the pool test proves the switch. bounce, quad and looper depend on zinc:video (another task); the media/ mechanism is the chdir, tested with zinc:fs.
<!-- SECTION:NOTES:END -->
