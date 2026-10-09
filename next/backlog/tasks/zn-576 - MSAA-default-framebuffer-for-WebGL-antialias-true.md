---
id: ZN-576
title: 'MSAA default framebuffer for WebGL (antialias: true)'
status: Backlog
assignee: []
created_date: '2026-10-09 08:12'
labels:
  - games
  - js
  - size-S
milestone: m-22
dependencies:
  - ZN-411
ordinal: 355270
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
antialias: true is reported back as false and SAMPLES is 0 (MAX_SAMPLES is 4): every 3D library relying on default MSAA renders jagged edges. Multisampled default framebuffer up to MAX_SAMPLES, resolved before presentation (the GPU present of ZN-411), readPixels and texImage2D(canvas). (From docs/reports/games/js-game-libraries.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 getContextAttributes().antialias === true when requested and supported
- [ ] #2 three.js edge test against Chrome SSIM >= 0.95
- [ ] #3 WebGL conformance not lower
<!-- AC:END -->
