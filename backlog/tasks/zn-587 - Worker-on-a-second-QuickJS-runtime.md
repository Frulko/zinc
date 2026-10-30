---
id: ZN-587
title: Worker on a second QuickJS runtime
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-09 08:12'
updated_date: '2026-10-30 14:11'
labels:
  - games
  - js
  - size-M
milestone: m-22
dependencies:
  - ZN-568
ordinal: 18400
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
- [ ] #4 zinc:worker runs on --engine quickjs (a QuickJS runtime per worker thread, typed messages as on the interpreter): worker_engines covers QuickJS and sprite-studio's live preview draws on QuickJS without its error message
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-30: sprite-studio (examples/sprite-studio) catches 'QuickJS has no workers yet' (src/qjs/prelude.cpp) and shows it in its preview window; the catch goes once this lands.
<!-- SECTION:NOTES:END -->
