---
id: ZN-027
title: Link the existing raster and graphics runtime
status: Done
assignee: []
created_date: '2026-10-05 14:22'
updated_date: '2026-10-06 15:00'
labels:
  - size-M
milestone: m-5
dependencies: []
ordinal: 27000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
As an **App developer**, I want a hello UI frame rendered by the new engine.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 pixel golden identical to the current build, headless.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Host calls are Rt entries (owner host, include/zn/runtime.h) reaching a zn::host::Gfx table (include/zn/host.h); src/host links the old runtime (zrt, raster, gfx, null HAL) with its flags and a trimmed baked-resource file. zinc:gfx is a built-in module in Zinc (modules.cpp) with a first subset: onFrame, frame, clear, rect, rrect, font, drawText. Math.random/seed added (xorshift32). tests/visual/clock.ts frames 20 and 60 are pixel-identical (tools/pngdiff). Not done: AOT output with zinc:gfx (the compiled program does not link the host), the rest of lib/gfx.d.ts, input.
<!-- SECTION:NOTES:END -->
