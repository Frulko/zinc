---
id: ZN-140
title: 'CLI: bench, capture, export, deploy, plugins, tsconfig, infer'
status: Done
assignee: []
created_date: '2026-10-06 23:02'
updated_date: '2026-10-08 01:06'
labels:
  - cli
  - size-L
milestone: m-10
dependencies:
  - ZN-138
  - ZN-100
  - ZN-115
  - ZN-132
ordinal: 40820
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`zinc bench` (the table of bench-m4 for a user program), `zinc capture` (frames to PNG with stb_image_write), `zinc export <dir> --target linux|rpi|macos|rmpp` (package dir with assets and libs), `zinc deploy` (rsync/ssh to a device, command printed when not allowed), `zinc plugins`, `zinc tsconfig` (writes the IDE config with the paths), `zinc infer` (Dyn site report) and `zinc build app.js` (decision 0014 of the prototype).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 each command has a T0/T1 test and a golden of its output; the examples' README commands (docs/guide/07-distribution.md) work as written
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. src/cli_core.cpp: zinc capture (frames to PNG, headless and deterministic, --frames/--every/--out/--size), bench (profile table), export (dist/<name>-<target>/ with the executable, run.sh, README, assets, .desktop or .app; cross targets through the pinned zig), deploy (export + scp + ssh, --print prints the commands), tsconfig, infer (Z0109 report; --write not available). plugins existed. zinc build app.js works. help table lists them. tests/t1/cli_tools.sh covers each; the commands match docs/guide/07-distribution.md as written (export/deploy --target, --device).
<!-- SECTION:NOTES:END -->
