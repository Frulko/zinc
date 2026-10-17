---
id: ZN-754
title: 'Two small console games: one 2D, one 3D, on desktop, PSP, Vita and PS2'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-17 08:07'
labels:
  - handheld
  - games
  - size-L
milestone: m-23
dependencies: []
ordinal: 214600
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner 2026-10-17: "un petit jeu 3D et un petit jeu 2D" for the consoles (with ZN-753's breakout as the first proof), using the frameworks and SDKs that simplify the work (docs/reports/games/console-2d-3d-frameworks.md: AthenaEnv and DanielSant0s's projects, PocketJS/Pocket3D, Tyra, gsKit, vitaGL, sceGu, SDL/raylib ports). One Zinc source per game (zinc:gfx/zinc:sprite/zinc:tilemap for the 2D one, zinc:3d for the 3D one), written and tested on the desktop first, sized to the consoles' budgets (PSP 480x272 and f32 numbers, Vita 960x544, PS2 640x448), pad and keyboard input, animation, sound where the console has it, then run in PPSSPP, Vita3K and Play! as the console back ends land (ZN-753's chain).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 examples/<2d-game> and examples/<3d-game> play on the desktop (scripted session with ZINC_INPUT: frame hashes, a screenshot each; interpreter, AOT and QuickJS agree)
- [ ] #2 both stay inside the per-console budgets of the report (triangles, sprites, textures, memory), measured with the perf panel on the desktop at the consoles' resolutions
- [ ] #3 each runs in the emulators of the consoles whose back end exists (screenshots and frame times in docs/reports/zinc-next-consoles.md)
<!-- AC:END -->
