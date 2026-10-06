---
id: ZN-141
title: 'zinc dev: hot reload, red box, devtools; zinc monitor'
status: Backlog
assignee: []
created_date: '2026-10-06 23:02'
labels:
  - cli
  - size-L
milestone: m-10
dependencies:
  - ZN-111
  - ZN-101
  - ZN-138
ordinal: 40830
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
efsw (MIT) file watching, rebuild of the changed module image and live reload keeping state where the prototype does (~0.5-1.2 s), the red-box overlay on errors, the CDP server of plugins/devtools, `zinc monitor` showing telemetry and serial output (docs/dev-mode.md).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 scripted test: edit a file, the running app reloads within 2 s and the red box shows a compile error; the scripted CDP client test passes
<!-- AC:END -->
