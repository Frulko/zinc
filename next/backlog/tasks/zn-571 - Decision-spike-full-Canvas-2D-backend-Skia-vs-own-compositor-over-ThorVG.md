---
id: ZN-571
title: 'Decision spike: full Canvas 2D backend (Skia vs own compositor over ThorVG)'
status: Backlog
assignee: []
created_date: '2026-10-09 08:11'
labels:
  - games
  - js
  - decision
  - size-M
milestone: m-22
dependencies:
  - ZN-570
ordinal: 350270
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The full 2D spec (26 composite modes, path clip, shadows, CSS filters, patterns) needs a real backend. Candidates from the report: Skia (BSD-3, full fidelity, Ganesh GL/GLES and CPU raster, GN build, 3-8 MiB core claimed; skia-canvas 22 MB and @napi-rs/canvas 28 MB measured with ICU and codecs) and an own compositor over ThorVG SW coverage (MIT, ~0.3-0.5 MB, no Porter-Duff ops or filters in ThorVG). Build pinned ICU-free Skia for macOS arm64, Linux x86_64/arm64 and armhf Cortex-A53, prototype the other route, measure size, build time and a 2D benchmark; record a D-entry with RULES.md scores. (From docs/reports/games/js-game-libraries.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 sizes, build times and frame times (p5 300 shapes, Phaser CANVAS bunnymark) for both routes on two targets
- [ ] #2 decision recorded in docs/reports/zinc-next-decisions.md with scores and a revisit condition
- [ ] #3 licences and SBOM entries listed
<!-- AC:END -->
