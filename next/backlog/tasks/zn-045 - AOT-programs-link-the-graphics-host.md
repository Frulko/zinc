---
id: ZN-045
title: AOT programs link the graphics host
status: Done
assignee: []
created_date: '2026-10-06 15:06'
updated_date: '2026-10-06 15:48'
labels: []
dependencies: []
priority: high
ordinal: 28200
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
zinc build of a program that uses zinc:gfx or zinc:ui links the host library and runs headless like the interpreter.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 tests/visual/clock.ts and tests/visual/ui.tsx frames match their pixel goldens in the AOT build too
- [x] #2 M5 demo: the UI screen matches its pixel golden headless in interpreter and AOT
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
zinc build links libzn_host_gfx.a and the generated main installs the host when the module calls it (usesHost in aot.cpp). clock.ts (T1) and ui.tsx (T2 ui_aot.sh, about 40 s of C++ build) match their pixel goldens in the compiled program.
<!-- SECTION:NOTES:END -->
