---
id: ZN-575
title: QuickJS GC scheduling and pause reporting; bytecode cache for zinc run
status: Backlog
assignee: []
created_date: '2026-10-09 08:12'
labels:
  - games
  - js
  - size-M
milestone: m-22
dependencies:
  - ZN-566
  - ZN-445
ordinal: 354270
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
QuickJS-ng frees acyclic garbage at once but cyclic garbage waits for a whole-heap cycle scan: measured p99 11.8 ms with 100k live objects and 99-171 ms with 1M (Node stays under 6 ms); matter-js frames reached 166 ms. Run the cycle collector at frame boundaries within a budget, raise the threshold while a level loads, show GC pauses as a phase in zinc profile / zinc mem. Start-up: Phaser 3 evaluates in 450-640 ms and Babylon.js in 1.3 s; reuse ZN-445's JS_WriteObject writer for a content-hash bytecode cache in ~/.zinc/cache so zinc run (not only packs) skips parsing. (From docs/reports/games/js-game-libraries.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 gc test with 100k live objects and cyclic temporaries: p99 frame <= 4 ms (today 11.8 ms)
- [ ] #2 GC pauses appear as a phase in ZINC_PROFILE=1 output
- [ ] #3 second zinc run of Phaser 3.90 evaluates in <= 100 ms (today 450-640 ms) and Babylon.js 9.30 in <= 250 ms (today 1.3 s)
<!-- AC:END -->
