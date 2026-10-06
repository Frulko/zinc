---
id: ZN-045
title: AOT programs link the graphics host
status: Backlog
assignee: []
created_date: '2026-10-06 15:06'
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
- [ ] #1 tests/visual/clock.ts and tests/visual/ui.tsx frames match their pixel goldens in the AOT build too
- [ ] #2 M5 demo: the UI screen matches its pixel golden headless in interpreter and AOT
<!-- AC:END -->
