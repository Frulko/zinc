---
id: ZN-754
title: 'Two small console games: one 2D, one 3D, on desktop, PSP, Vita and PS2'
status: Backlog
assignee: []
created_date: '2026-10-17 08:07'
updated_date: '2026-10-17 09:24'
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
- [x] #1 examples/<2d-game> and examples/<3d-game> play on the desktop (scripted session with ZINC_INPUT: frame hashes, a screenshot each; interpreter, AOT and QuickJS agree)
- [x] #2 both stay inside the per-console budgets of the report (triangles, sprites, textures, memory), measured with the perf panel on the desktop at the consoles' resolutions
- [ ] #3 each runs in the emulators of the consoles whose back end exists (screenshots and frame times in docs/reports/zinc-next-consoles.md)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-17 (owner): the Nintendo 3DS joins (top screen 400x240, PICA200 fixed fragment pipeline, Old 3DS 268 MHz: keep marble's triangles and textures inside the 3DS budget too); the 3D scene and textures are modelled in Blender (5.2.1 LTS, /Applications/Blender.app) by a separate asset agent: source scripts in examples/marble/assets/blender/, outputs (GLB/zmesh and PNG textures) in examples/marble/assets/models and textures.

2026-10-17 (owner): both games use Kenney's assets (CC0): platformer from a Kenney 2D platformer pack and audio packs; marble from Kenney's Marble Kit (+ Nature/Platformer Kit props) adapted in Blender (low variant for PSP/PS2/3DS, rich for desktop/Vita).

2026-10-17 (worktree agent): AC1 and AC2 done, AC3 open.
- examples/platformer (Meadow Run): one LDtk level (120x28 cells of 18 px) on Kenney's Pixel Platformer, one 256x128 atlas (tiles + characters.json + items.json), walkers and flyers, coins, spikes, one-way clouds, a flag; d-pad/stick move, Cross jump (hold: higher), Square run, Start pause; Kenney Digital Audio/Impact/Music Jingles sounds + an own music loop. tests/t1/platformer.sh (30 s): scripted win (win.log, frames 200/500/840; interp = AOT = QuickJS), a loss (3 falls), the rules in f32 (zinc test --profile ps2), tile/sprite budget at 400x240, 480x272, 640x448, 960x544.
- examples/marble (Marble Terraces): 24x24 LDtk height grid, tilt +-12 deg, sphere-against-boxes physics at 120 Hz, 2 shuttles, 20 gems, rails and solid props, 90 s clock, 3 lives; the Blender course art (assets/models, low/high) merged per 8x8 chunk (src/pieces.ts reads .zmesh); plain procedural meshes when assets/models is absent; --autopilot plays and prints its d-pad (made win.input). tests/t1/marble.sh (55 s under load 16): scripted win (interp = AOT = QuickJS at frame 300), a loss, f32 rules, triangle/draw budgets per size.
- Measured (CPU renderer, one render thread, background window, machine load 9-17 so times are indicative only): platformer max 346 tiles + 16 sprites, 362 draw commands at 640x448, program 0.2-0.6 ms/frame, raster p50 0.6-1.8 ms; marble low 2,297 triangles / 35 draws (400x240..640x448), high 8,668 sw (18,708 submitted on the GPU) / 35 draws at 960x544, program incl. software 3D 1-3 ms/frame at 480x272; no textures (vertex colours), atlas 256x128 RGBA8 (128 KiB; CLUT8 would be 33 KiB).
- AC3 handover: no console core on main yet (targets/ has no psp or vita; toolchains pspdev, vitasdk, ps2dev, PPSSPP, Play! are in ~/.zinc/toolchains). Also zinc:audio has no psp/ps2 target (zinc run --profile psp|ps2 fails: plugins/audio/index.ts Z0101 '__T7') and zinc:3d none either; n3ds and vita profiles compile and run both games. Next: once ZN-753's cores land, zinc run examples/platformer --target psp --emu (and ps2/vita), then marble after ZN-476/477; screenshots and frame times into docs/reports/zinc-next-consoles.md.
- later.md lines (coordinator): see the agent report.

- Memory: peak RSS of the whole macOS process (native build, headless 480x272, 600 frames): platformer 17 MB, marble 35 MB; a desktop process, not the consoles' heap (the PSP-1000 budget is ~8 MiB of assets, 24 MiB user RAM); marble's pack also carries the Blender previews (2 MB) and the high pieces (see later lines).
<!-- SECTION:NOTES:END -->
