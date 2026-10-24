---
id: ZN-754
title: 'Platformer and marble in the console emulators'
status: Backlog
assignee: []
created_date: '2026-10-17 08:07'
updated_date: '2026-10-25 01:53'
labels:
  - handheld
  - games
  - size-L
milestone: m-23
dependencies:
  - ZN-759
  - ZN-476
  - ZN-477
  - ZN-478
  - ZN-760
  - ZN-482
  - ZN-452
  - ZN-489
ordinal: 53500
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Rewritten by the review of 2026-10-25:** Run examples/platformer on the four consoles with tools/console-demos (screenshots and frame times in zinc-next-consoles.md); marble after ZN-476/477/478; AC4 is the owner's hardware check.

Owner 2026-10-17: "un petit jeu 3D et un petit jeu 2D" for the consoles (with ZN-753's breakout as the first proof), using the frameworks and SDKs that simplify the work (docs/reports/games/console-2d-3d-frameworks.md: AthenaEnv and DanielSant0s's projects, PocketJS/Pocket3D, Tyra, gsKit, vitaGL, sceGu, SDL/raylib ports). One Zinc source per game (zinc:gfx/zinc:sprite/zinc:tilemap for the 2D one, zinc:3d for the 3D one), written and tested on the desktop first, sized to the consoles' budgets (PSP 480x272 and f32 numbers, Vita 960x544, PS2 640x448), pad and keyboard input, animation, sound where the console has it, then run in PPSSPP, Vita3K and Play! as the console back ends land (ZN-753's chain).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 examples/<2d-game> and examples/<3d-game> play on the desktop (scripted session with ZINC_INPUT: frame hashes, a screenshot each; interpreter, AOT and QuickJS agree)
- [x] #2 both stay inside the per-console budgets of the report (triangles, sprites, textures, memory), measured with the perf panel on the desktop at the consoles' resolutions
- [ ] #3 each runs in the emulators of the consoles whose back end exists (screenshots and frame times in docs/reports/zinc-next-consoles.md)
- [ ] #4 marble and the platformer run on the owner's real PSP, PS Vita, PS2 and Nintendo 3DS (the owner's check, noted in the task; packs baked by zinc build for each console)
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

2026-10-17 (owner, D144): the 3D runs on each console's GPU through the existing SDKs and code (PSP sceGu/sceGum + VFPU, Vita GXM with precompiled GXP, 3DS citro3d + picasso, PS2 gsKit then AthenaEnv's VU1), with Pocket3D's methods: `zinc build --target <console>` cooks and bakes what each console needs (meshes ZN-489, textures ZN-452) from one source. Marble comes last, after ZN-759's hardware demos and the GPU back ends (dependencies set); then the owner runs everything on the real consoles (AC4).
Review 2026-10-25: rewrite. Both games exist and are proven on the desktop; the consoles now have cores, audio and GPU 2D, so AC3 can run for the platformer on PSP/Vita/3DS/PS2; marble waits for the 3D back ends. The note that zinc:audio has no psp/ps2 target is stale. Evidence: docs/reports/zinc-next-consoles.md; examples/platformer, examples/marble
<!-- SECTION:NOTES:END -->
