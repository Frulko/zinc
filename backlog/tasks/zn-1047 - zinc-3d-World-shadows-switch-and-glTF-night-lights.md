---
id: ZN-1047
title: 'zinc:3d World: shadows switch and glTF night lights'
status: Done
assignee: []
created_date: '2026-11-07 16:39'
updated_date: '2026-11-09 09:07'
labels:
  - 3d
  - size-M
milestone: m-8
dependencies: []
ordinal: 10700
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
World cannot switch shadows; glTF cities cannot light up at night; TOP batches missing for textured grounds.

From backlog/later.md, promoted by the review of 2026-11-07 (docs/reports/backlog-review-2026-11-07.md). The lines it carries:

- world rule: night pictures and night glow per material (material extras), so a glTF city lights up like Tokyo's.
- world rule: emit `TOP` batches for textured grounds whose uvs follow x/z, so the PSP and 3DS compact layouts apply.
- zinc:3d: `World` needs a real shadows on/off; tokyo fakes "off" with a flat height field and re-reads `hmap.bin` to turn them on (freeing the old map while a frame may draw it is unchecked).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 World shadows on/off is real (no fake flat height field)
- [x] #2 Night pictures and night glow per material
- [x] #3 TOP batches for textured grounds with x/z uvs
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Web search (sonnet sub-agent, 2026-11-09):
- glTF `KHR_materials_emissive_strength`: one `emissiveStrength` (default 1) multiplying `emissiveFactor` and `emissiveTexture`, so that values can go over 1 (https://github.com/KhronosGroup/glTF/blob/master/extensions/2.0/Khronos/KHR_materials_emissive_strength/). The world rule already folds it into the batch's glow.
- No convention exists for night emissive in material `extras` or in an extension. `KHR_materials_variants` swaps whole materials (day and night variants) and does not blend them (https://github.com/KhronosGroup/glTF/blob/master/extensions/2.0/Khronos/KHR_materials_variants). Our extras `{"night": "<picture>", "glow": "night"}` stay app-specific and free to define. Blender exports custom properties to extras.
- three.js city demos ramp `emissiveIntensity` by the time of day over a window emissive map. Unreal's City Sample keeps window emissive near 0.1 (https://versluis.com/2024/03/how-to-dim-the-window-lights-in-epics-city-sample-project). Ours swaps or mixes by `setNight` (the 3DS's combiners, the PSP's palettes).
- Shadow toggles: three.js keeps the shadow map until `LightShadow.dispose()` (https://discourse.threejs.org/t/cant-turn-off-shadows/65595). Filament has a per-light `castShadows` and `View::setShadowingEnabled` (https://www.mintlify.com/google/filament/rendering/shadows). The common pattern flips a state and frees the GPU target after the frames in flight, through a deferred-delete queue. The 3DS renderer already does this with `later()`.
- Planar uvs: a top-down ground uv is world.xz / scale + offset. The search found no engine that detects it. A least-squares fit with a residual threshold does, as world.cpp and render3d.psp.cpp already do.

Done:
- #1 Shadows are one state of the renderer (render3d.host.cpp `ShadowState`: None, Hidden, Shown). One transition, `shadowsTo`, changes it, under `shadeLock` through a RAII `ShadeGuard`.
  - A new op, `worldShadowsShow(world, on)`, returns the state. `World.setShadows(on)` hides the shadows and shows them again without reading the heights again. Also new: `World.shadowsState` and `export const enum Shadows`.
  - Closing a World drops its shadows: a World opened in the same slot no longer inherits the old heights (the stale-owner case).
  - Tokyo's `City.setShadows` calls `world.setShadows`. The hmap line calls `world.shadows` once, so a toggle no longer re-reads hmap.bin.
  - The "flat height field" fake had already gone with f04e96d71 (clearShadows). What was left was the re-read and the implicit state (`sweep.on()`, `shade.ok`, `mask`).
- Freeing: proved by reading the code, then by a PSP run.
  - The heights (`sweep.hm`) are now freed only on the way to None (clearShadows, new heights, the World closed), never on a toggle.
  - The 3DS's map (`shade.tex.data`) goes through `later()`. It is freed at the start of the next `render()`, inside a GPU frame begun after every frame that could read it (render3d.n3ds.cpp, unchanged).
  - Only the CPU reads the PSP's `mask` (the shade thread and patchRows, under `shadeSema`). `shadowsOff` now always runs under that lock: `ShadeGuard` sits in worldShadows, worldShadowsShow and worldClose. shadowsTo never locks and each entry point takes the lock once, so it is never nested. The GE reads only the pictures and palettes, which are not freed.
  - PSP worldDraw now asks `shadowsShown()` instead of `sweep.on()`, so Hidden draws the lit palettes.
  - The run: a synthetic glTF city with a 32x32 height field, on the PSP core in PPSSPP headless (`tools/build-console-core psp --embed ... --frames 70`, then `tools/console-run psp`). It printed shown 2, hide 1, show 2, clear 0, again 2, 2122 triangles, exit 0. The shade thread did not hang.
  - The 3DS was not run: devkitPro is a docker image here. Its file is unchanged and keys on `shade.ok`, which only shadowsOn sets.
- #2 and #3 have been in the world rule since ae9514e5c (2026-10-25):
  - material extras `{"night": "<picture>"}` and `{"glow": "night"}`;
  - `KHR_materials_emissive_strength` folded into the glow;
  - TOP batches for textured meshes whose uvs follow x/z (world.cpp's fit).
  - scene_world.cpp goes through the same `Reader::material`.
  - Checked again: T0 `zinc3d_world_build` passes. The probe city lights its `glow: night` box only at night, on the desktop and on the PSP core. Its textured pad is a TOP batch, drawn in the PSP's compact layout (texture mapped from the position) and orange there as on the desktop.
- Found on the way: the PSP core did not build on develop. gfx_host.cpp called `strncasecmp` without <strings.h>, and `zn::loop::idleWake` has been undefined on the consoles since ZN-805. Fixed in fd0ee1eda.

Checks:
- `tools/build zinc`: no new warning.
- T0 `zinc3d_world` with its new shadows line, `shadows 0 2 1 2 0 0 0 0`. Same output on the default engine, `--interp`, `--engine quickjs` and `ZINC_NATIVE=sim`.
- T0 `zinc3d_world_build`, `zinc3d_sim` and `native_gen`; `zinc check examples/tokyo`.
- Tokyo `ZINC_SHOT` by day (12:00) and by night (22:00), with shadows on and off (`ZINC_TOKYO_SHADOWS=0`). On and off are identical on the desktop, whose renderer draws no world shadows. The city is lit at night.
- `tools/build-console-core psp` builds.

Proposed decision: zinc:3d World shadows are one renderer state (None, Hidden, Shown), changed by one transition. Hiding keeps the heights and frees only the drawn map: on the 3DS after the GPU frame, on the PSP under the sweep lock. Closing the World drops them. The glTF night conventions stay the material extras `night` and `glow`: no standard exists, and `KHR_materials_variants` swaps materials instead of blending them.

later.md lines:
- ZN-1047: PSP: a picture under 8 px is padded to an 8 px texture and clamped, so repeating uvs read the padding and show black (a tiled 4x4 picture on a wall or a top). Tile small pictures up to 8 px at upload (targets/psp/gu_psp.cpp, pow2 with a minimum of 8).
- ZN-1047: render3d World handles reuse the first free slot with no generation (Pool::add). The TS World's `disposed` guards it, but "Handles carry a generation" asks for a native generation.
- ZN-1047: run the shadows switch on the 3DS (Azahar or the owner's New 3DS): tokyo Settings > Shadows, Off then On twice. Expect no stall and the map back after On.

Proposed tests:
- `tools/console-run psp` of the probe described above (a glTF city and heights, toggles at frames 20, 30, 40 and 50, expected `shown 2 / hide 1 / show 2 / clear 0 / again 2`). Proves the PSP transitions alongside the sweep thread. About 3 min with the core build, 300 MB.
- Tokyo on PPSSPP with `ZINC_TOKYO_SHADOWS=0` and a `ZINC_TOKYO_TAP` on Settings > Shadows (off, then on), 300 frames. Expect the work times of tokyo-per-device.md's "shadows off" line, and the shade back after On. About 4 min, 500 MB.
- The same on Azahar (3DS). About 5 min.
<!-- SECTION:NOTES:END -->
