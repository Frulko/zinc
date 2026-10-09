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
ordinal: 361270
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
