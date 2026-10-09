---
id: ZN-587
title: Worker on a second QuickJS runtime
status: Backlog
assignee: []
created_date: '2026-10-09 08:12'
labels:
  - games
  - js
  - size-M
milestone: m-22
dependencies:
  - ZN-568
ordinal: 366270
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Worker (module and Blob URL), postMessage with structured clone and transferable ArrayBuffers; OffscreenCanvas transfer later. Every library falls back when Worker is absent (PixiJS asset loading, Tone.js clock, three's DRACO/KTX2), so this is an optimisation, not a blocker. (From docs/reports/games/js-game-libraries.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 PixiJS's worker texture loading (preferWorkers: true) works
- [ ] #2 Tone.js's Ticker uses the worker
- [ ] #3 a worker crash is reported and does not stop the main loop
<!-- AC:END -->
