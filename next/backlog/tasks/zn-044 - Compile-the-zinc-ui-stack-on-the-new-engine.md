---
id: ZN-044
title: 'Compile the zinc:ui stack on the new engine'
status: Done
assignee: []
created_date: '2026-10-06 15:06'
updated_date: '2026-10-06 15:40'
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
- [x] #1 tests/visual/ui.tsx frame 1 is pixel-identical to tests/visual/ui-1.png in the interpreter
- [x] #2 style attribute and class checks of the JSX lowering ported
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
tests/visual/ui.tsx frames 1 and 40 are pixel-identical in the interpreter (T1 ui.sh). zinc:ui, zinc:ui/solid, zinc:ui/react, zinc:ui/kit and zinc:signals resolve from lib/std; zinc:gfx is complete (drawing through Rt host calls, headless input stubs). Language work it needed: namespace imports, undefined as null without Dyn, optional parameters, x!: T fields, let x: T;, Map.get of references, m.get(k) as T, Map.forEach, Array splice/shift/unshift, f?.(x), c ? x : null, if/else flow join, nested functions that capture (closures with shared cells), enum from number, callbacks in generic calls. JSX style attribute and class checks ported. Baked fonts: src/host/baked_resources.cpp is frozen from the old build (16 fonts, no TTF); baking in the engine is future work.
<!-- SECTION:NOTES:END -->
