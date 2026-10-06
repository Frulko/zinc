---
id: ZN-140
title: 'CLI: bench, capture, export, deploy, plugins, tsconfig, infer'
status: Backlog
assignee: []
created_date: '2026-10-06 23:02'
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
- [ ] #1 each command has a T0/T1 test and a golden of its output; the examples' README commands (docs/guide/07-distribution.md) work as written
<!-- AC:END -->
