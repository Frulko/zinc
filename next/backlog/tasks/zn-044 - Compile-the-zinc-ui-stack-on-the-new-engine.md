---
id: ZN-044
title: 'Compile the zinc:ui stack on the new engine'
status: Backlog
assignee: []
created_date: '2026-10-06 15:06'
labels: []
dependencies: []
priority: high
ordinal: 28100
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
zinc:ui, zinc:ui/solid, zinc:ui/react, zinc:ui/kit (lib/std, about 4500 lines) resolve as modules and compile and run: the checker, lowering and host surface gaps they expose are closed (rest of lib/gfx.d.ts: polygon, path, stroke, gradient, border, shadow, clip, translate, images, text metrics, input). Target: tests/visual/ui.tsx frame 1 renders headless in the interpreter.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 tests/visual/ui.tsx frame 1 is pixel-identical to tests/visual/ui-1.png in the interpreter
- [ ] #2 style attribute and class checks of the JSX lowering ported
<!-- AC:END -->
