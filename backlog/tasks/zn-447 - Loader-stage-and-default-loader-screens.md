---
id: ZN-447
title: Loader stage and default loader screens
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-09 07:36'
updated_date: '2026-10-11 15:18'
labels:
  - games
  - assets
  - size-M
milestone: m-22
dependencies:
  - ZN-436
  - ZN-446
ordinal: 57000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
loading key. The engine runs the loader module each frame while it preloads the declared groups, then starts main. Default screens (a bar; the splash with a bar) ship as a plugin for zinc:gfx and as a zinc:ui component. Supports minMs and fadeMs; the loader is skipped when the groups are already resident. Report: docs/reports/games/toolchain-assets-loading.md (7.5).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 game-2d has a loading screen
- [x] #2 progress is monotone (test)
- [x] #3 the loader's frames are deterministic (golden)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done (2026-10-11, parallel worktree). zinc.json loading becomes a loader stage: zn::cli::loaderStageFor (src/cli_core.cpp) generates a Zinc module (zinc.json.loading.ts in the project dir: the loop, the screen import, one call) when the file compiled is the project's entry; zn::frontend::setLoaderStage hands it to loadProgram, which loads it before any module of the entry (as a first import), and the QuickJS engine evaluates it before the entry. The loop uses zinc:gfx and the asset scheduler rows only: groups requested (none resident: no loader; none named: boot if declared, else every group), one turn (a real run waits up to 16 ms on the loop for the first jobs, so a load within a frame shows nothing), then per frame poll, turn, screen(bytes done / bytes of all groups, dt) until all resident and minMs passed, or the run's frames are spent (HostGfxFrames now returns the frames left, so ZINC_FRAMES counts the stage's). fadeMs: the last frame is drawn into an image and zinc:gfx overlay() draws it over the program's frames with falling opacity; zinc:ui does not keep a frame while overlaid(). Screens: plugins/loader (zinc:loader bar, splash: image('.splash') = the splash entry's image, placed as src/host/splash.cpp places it; zinc:loader/ui Loader component and screen()). game-2d declares loading { screen bar, groups [default], fadeMs 150 }. Docs: docs/plugins/loader.md, docs/reports/zinc-next-assets.md (The loader stage).

Proof: tests/t1/loader.sh (about 6 s): progress 0.382, 0.620, 0.778, 0.905, 1 (monotone; QuickJS prints the same lines); golden tests/golden/loader/frames.txt (16 frame hashes: 4 loader frames of the splash screen, 6 fade frames, main), the same with ZINC_ASSET_THREADS=0 and from the zinc build executable; minMs 190 holds 12 frames; the zinc:ui screen runs; game-2d with 2 KB turns starts with its bar and ends on its title, with the default turn it shows its title from frame 1. Also passed: splash assets_groups sprite_atlas qjs framehash project_assets assets modules templates_kickstart zapp fuse first_run ui ui_cmds damage_sig checker aot_assets. One window run (load 3.5): the splash screen, minMs 300 and a 300 ms cross-fade drawn by the window renderer at 2x.

Decision (for a record): the stage is a generated module initialised first, not a host-side loop and not a deferral of main's module init (no IR change; all three engines run the same source); the plugin name lives in the CLI, not the frontend (RULES 7).

For later.md: the splash's own fadeMs (stored since ZN-446) is still unused: overlay() can fade image('.splash') into the first frame of a program without loading; the stage in the browser export (the worker's blocking frame loop should run it as the gfx loop; not checked: no build-wasm here) and on the ESP32 device core (asset rows); the fade image is in logical pixels (soft for 150 ms at 2x); a zinc:ui loader screen's nodes stay allocated after main mounts its root.

Not checked: the browser export, cross targets, a window run of game-2d with a real slow load.
<!-- SECTION:NOTES:END -->
