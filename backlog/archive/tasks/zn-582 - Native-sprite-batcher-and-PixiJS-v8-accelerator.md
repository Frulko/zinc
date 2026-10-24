---
id: ZN-582
title: Native sprite batcher and PixiJS v8 accelerator
status: Backlog
assignee: []
created_date: '2026-10-09 08:12'
labels:
  - games
  - js
  - size-L
milestone: m-22
dependencies:
  - ZN-578
  - ZN-581
ordinal: 99000
updated_date: '2026-10-25 01:53'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A native batch object (SoA transforms, UVs, tints; vertex generation in C++ with NEON/SSE; one upload per texture batch) used by zinc:gfx/zinc:game and exposed to JS; a PixiJS v8 extension, registered by the web environment, replacing the batcher's per-sprite attribute packing with the native call (PixiJS spends ~2.5 of its 4 us per sprite in render). Same pattern as ZN-543 (native accelerators for three on QuickJS). (From docs/reports/games/js-game-libraries.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 PixiJS bunnymark sprites at 60 fps at least 1.8x JSG-15's measured maximum, PixiJS sources unmodified
- [ ] #2 typed bunnymark >= 100,000 sprites at 60 fps in AOT
- [ ] #3 identical images with and without the accelerator
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: dropped. Native Pixi batcher accelerator was justified by QuickJS being 20-40x slower than V8; the jsc and v8 engines have shipped (about 10x faster JS). Speculative, tied to one library; keep ZN-581 (done) as the GPU sprite path. Verifier: Better grounds than 'JIT shipped' (JSC/V8 are macOS-only): D110 (decisions.md:180) scored 'QuickJS with accelerators per library' 46 and chose a QuickJS bytecode compiler (ZN-723) plus JSC instead, so a PixiJS-specific native batcher is superseded. AC2 (typed bunnymark) is near-covered by ZN-581 (Done: 20,000 sprites in <= 4 ms AOT).
<!-- SECTION:NOTES:END -->
