---
id: ZN-141
title: 'zinc dev: hot reload, red box, devtools; zinc monitor'
status: Done
assignee: []
created_date: '2026-10-06 23:02'
updated_date: '2026-10-08 01:11'
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
- [x] #1 scripted test: edit a file, the running app reloads within 2 s and the red box shows a compile error; the scripted CDP client test passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. zinc dev (src/cli_core.cpp): runs the program in its own process group, polls the project every 40 ms, on a settled change runs zinc check and restarts the program (about 55 ms after the save), kills the old one; a compile error stops it and runs a generated red-box program with the diagnostics until the next good save; UI programs run with 'import "zinc:devtools"' in front (port 9229, the inspector survives because it is restarted with the program); --no-devtools. zinc monitor reads telemetry JSON lines from stdin, a file, a serial port or UDP and prints readable lines. tools/cdp-probe is the scripted CDP client (DOM.getDocument, Runtime.enable). tests/t1/dev_mode.sh: edit -> v2 within 2 s with the new pixel, error -> red box pixel 220,38,38, fix -> v3, CDP client ok, monitor golden. Decision D31: polling instead of efsw. Not kept: module state across reloads (the prototype does not either).
<!-- SECTION:NOTES:END -->
