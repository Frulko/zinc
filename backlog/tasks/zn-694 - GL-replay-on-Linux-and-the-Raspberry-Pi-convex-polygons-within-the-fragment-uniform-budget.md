---
id: ZN-694
title: >-
  GL replay on Linux and the Raspberry Pi: convex polygons within the fragment
  uniform budget
status: Backlog
assignee: []
created_date: '2026-10-10 20:54'
labels:
  - gpu
  - linux
  - rpi
  - deferred
  - size-S
milestone: m-27
dependencies:
  - ZN-679
ordinal: 56200
updated_date: '2026-10-25 01:53'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ZN-679 added a convex polygon mode to the GL replay's fragment shader (runtime/gl_replay.cpp: uniform vec3 u_cv[8], float u_cvn, read in a loop), beside the gradient paint arrays of ZN-590.04 (u_gc[8], u_go[8]). Verified on macOS only. GLES2 guarantees 16 fragment uniform vectors; check GL_MAX_FRAGMENT_UNIFORM_VECTORS on the Pi 3/4 (VideoCore IV / VI) and Mesa llvmpipe, that the program links there, and run tests/t1/gl_convex.sh and gl_renderer.sh in the Linux container and on the Pi; if the budget is short, pack the arrays (vec4) or move the edges to a small texture.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 the GL replay's program links on the Pi and on llvmpipe, and gl_convex passes there
<!-- AC:END -->
