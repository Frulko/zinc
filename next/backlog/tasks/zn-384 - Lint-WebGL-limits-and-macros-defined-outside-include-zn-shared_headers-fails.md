---
id: ZN-384
title: >-
  Lint: WebGL limits and macros defined outside include/zn (shared_headers
  fails)
status: Backlog
assignee: []
created_date: '2026-10-08 19:36'
labels:
  - webgl
  - cleanup
  - size-S
milestone: m-17
dependencies: []
ordinal: 144000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
tests/t0/shared_headers.sh fails since 0c2ddcde (three.js renders): src/gl/webgl1.cpp defines kMaxAttribs, kMaxUnits, src/gl/webgl1.h kMaxVertexAttribs, and ZN_UNIFORM_CHECK / ZN_UNIFORM_OK macros plus generated #define ZN_<ext> lines. Move the limits to include/zn (one header), and rename or allow-list the local macros and the generated GLSL defines (they are shader text, not engine constants). Found by the T0 run of ZN-367.03 (.logs/zn367-03-t0.log). Also seen: plugin_manifest fails on another developer's uncommitted plugin.json changes (display-fbdev, display-rmpp) and the untracked plugins/remarkable: not to touch.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 tests/t0/shared_headers.sh passes
<!-- AC:END -->
