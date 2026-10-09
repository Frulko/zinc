---
id: ZN-584
title: 'zinc:game, the native-tier game module, and the game-2d template on it'
status: Backlog
assignee: []
created_date: '2026-10-09 08:12'
labels:
  - games
  - js
  - size-L
milestone: m-22
dependencies:
  - ZN-573
  - ZN-574
  - ZN-581
  - ZN-583
  - ZN-438
ordinal: 363270
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Scenes, sprites and animations (on zinc:sprite of ZN-438 and the batcher), tilemaps (Tiled, LDtk), camera, input actions (keys, pointer, gamepad), audio through zinc:audio, physics glue; the game-2d template rewritten on it. Typed TypeScript compiled AOT: the native tier next to the JS compatibility tier, sharing every native plugin. Templates and the games guide chapter are ZN-451. (From docs/reports/games/js-game-libraries.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 the game-2d template runs on it in interpreter and AOT with identical frames
- [ ] #2 10,000 animated sprites and 500 physics bodies >= 60 fps in AOT
- [ ] #3 API reference in docs/ and a guide chapter
<!-- AC:END -->
