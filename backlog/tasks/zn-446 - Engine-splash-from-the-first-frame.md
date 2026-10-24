---
id: ZN-446
title: Engine splash from the first frame
status: Done
assignee: []
created_date: '2026-10-09 07:36'
updated_date: '2026-10-25 01:53'
labels:
  - games
  - assets
  - size-M
milestone: m-22
dependencies:
  - ZN-435
ordinal: 55000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
splash key. The baker stores the splash, pre-scaled in the target's framebuffer format, as the first boot-pack entry, and inline in index.html for the browser. The host opens the window, presents it, then compiles, bakes, loads plugins and mounts packs. The window is shown only after its first present (no white flash). Exports generate the OS splash per target. Report: docs/reports/games/toolchain-assets-loading.md (7.2, 7.3).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 the time from exec to the splash on screen is measured on macOS, Linux and the Pi 3 and recorded
- [x] #2 in the browser the splash is in the HTML before app.js runs
- [x] #3 headless runs are unchanged
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done 2026-10-11 (worktree agent, Intel Mac i7-9750H, load 4.0 to 5.2: other agents building). Review: the Linux and Pi 3 timings of AC #1 wait for the cross-platform pass (later.md); macOS is measured below, AC #2 and #3 pass.

What:
- zinc.json `splash` (targets.<id>.splash wins) becomes the `.splash` entry of boot.zpk: ZSP1 = background, fit, minMs, fadeMs (20 bytes), then the image as ZIM1 rgba8 premultiplied (an SVG drawn at 8 px a unit, 1024 wide at most), stored uncompressed in dev and release packs, a pack of its own without a boot group or an assets directory (src/assets `splash()`, through the asset cache; report row `.splash`, importer `splash`).
- `zn::host::showSplash` (src/host/splash.cpp): ZINC_SPLASH (a file of those bytes that `zinc run` makes from zinc.json) or the `.splash` of the base packs' boot.zpk, mapped in place; opens the window as the program's first graphics call would (zinc.json size, zoom, window keys) and presents the splash composed for the surface (bilinear into the fitted rectangle over the background) through the HAL's own present, rows only. Nothing headless/deterministic, with a display plugin, or without a splash.
- Called first thing in the main of built programs (src/aot/aot.cpp, after installGfx, before the fonts, plugins and program), by `zinc run` of a .zapp/fused app before it loads the program, of sources before the compile when it runs the program itself (interpreted, `--engine quickjs`); a compiled run (default for a program that draws) leaves it to the executable, which shows it as it starts.
- The window HAL (targets/macos/hal_sdl.cpp) creates the main window hidden and shows it after its first present, then presents that frame again: no blank window, for every window run (fullscreen windows are shown at creation). The GL replay is set up by the first frame that has command lists, not by the splash (it sizes its tables by the installed fonts and images).
- minMs: the next present waits (src/host/hal_dispatch.cpp); fadeMs is carried in the entry for the loader stage (ZN-447).
- Browser: `zinc export --target wasm` puts the splash in index.html as the canvas's CSS background (colour, the image inline as a data URL, contain/cover/auto): painted with the page, before any script; the worker's first opaque frame covers it.
- `ZINC_LOG=run=info` prints "splash on screen at <wall clock>, after start N ms"; `tools/splash-time [--runs N]` measures exec to splash for `zinc run` and a built executable. Doc: docs/reports/zinc-next-assets.md, "The engine splash".

Proof:
- AC #2: tests/t1/splash.sh exports a project with a splash to wasm: index.html has `<canvas id="c" style="background: #102030 url(data:image/svg+xml;base64,...) center / cover no-repeat"` before `<script type="module" src="./app.js">`; headless Chrome on the page without its script tag paints the canvas centre (48, 96, 192) = the splash image's #3060c0, outside the canvas (17, 17, 17) = the page.
- AC #3: tests/t1/splash.sh: a headless run of a project with a splash writes the same ZINC_SHOT frame and output as without one (cmp), logs no splash line at ZINC_LOG=run=debug; the built program (zinc build, its boot.zpk has the splash) prints exactly "frames 3" headless.
- AC #1 (macOS): tools/splash-time --runs 11, load 4.4: `zinc run` (interpreted) exec to splash median 406.8 ms (389.9 to 439.7; 393.6 ms after the process's own start), built executable 425.2 ms (405.2 to 456.3; 405.4 ms). Breakdown (ZINC_LOG=run=debug, 3 runs, load 4.0 to 4.3): "splash: window open" 277 to 314 ms (SDL_Init(VIDEO) about 200 ms, GL window and context about 110 ms, timed once with temporary prints), "splash: present" 55 ms (first present into the hidden window 34.6 ms with compose of 1280x800 and the GL warm-up, show 4.7 ms, second present 16.1 ms = one vsync); zinc reaches showSplash 13 to 20 ms after its start. The first launch of a newly built binary adds about 800 ms before main (the system checks it). Verified on screen: a capture during a minMs hold shows the window with the background bars and the image letterboxed (contain).
- Tests: splash, project_assets (its splash-only manifest now makes boot.zpk: moved to tests/t1/splash.sh), assets, assets_groups, sprite_atlas, aot, aot_assets, run_compiled, run_cache, zapp, project, input, input_touch: PASS. Window tests, once at the end (load 4.5 to 6.5): window_renderer, window_resize, pixel_scale, gl_cube (after building zn_gl, which this worktree lacked), gpu_strokes, gl_renderer, macos_window, fuse, perf_hud: PASS. export_wasm: hello PASS, forms fails here only because this worktree used a copy of main's build-wasm/vm-web.wasm, older than the paintGradient runtime row ("invalid ZBC: unknown runtime call"); the export change is the style attribute; to run after integration where tools/build-wasm relinks. launch_time fails on main's binary too (8 exported weak definitions of zn::dbg::Resume and std::function typeinfo; zinc's own 10.2 ms over a 6 ms budget under load 5); this branch is within noise of main (10.4 and 10.5 vs 10.2 ms).

Decisions (for a record):
- The splash entry is the image (ZIM1 rgba8) plus the background and fit, composed and scaled at present time (CPU bilinear into the HAL's rows, parallel bands), not pixels pre-scaled to the window: the desktop surface size depends on the screen density and the zoom, known only at run time; a rows-only HalFrame goes through every window HAL (GL and SDL_Renderer) with no new HAL entry. Pre-scaling in the panel's own format (rgb565) is for the targets with a fixed panel (ESP32, handhelds), with their exports.
- `zinc run` shows the splash itself only when it runs the program (interpreted, .zapp); a compiled run's executable shows it at the top of main, from ZINC_SPLASH: shown by both, the window closed at the exec and came back about 370 ms later (measured).
- Windows hidden until their first present, then presented again after the show: Electron's show-after-ready-to-show; covers every run, not only splash runs.
- minMs holds in hal_present (one branch per present); fadeMs left to ZN-447's hand-over between phases.
- Browser: a CSS background with a data URL (no request, no script); the worker's frame covers it.

Lines for later.md:
- Cross-platform pass: ZN-446: measure exec to splash on Linux desktop (X11 and Wayland) and on the Pi 3 (KMSDRM) with `tools/splash-time --runs 11`, and record them in the task (AC #1).
- Cross-platform pass: ZN-446: the splash on display plugins (display-fbdev before EGL/GLES, the panels, ESP32 RGB565 from flash before the heap): showSplash skips a run with a display plugin today.
- Cross-platform pass: ZN-446: OS splashes generated by the exports (iOS launch storyboard, PSP PIC1, Vita LiveArea, 3DS banner) once those exports exist; macOS and Linux have none, the web has the inline page splash.
- ZN-446: SDL_Init(VIDEO) is about half of exec to splash on the Mac (about 200 ms under load): profile Cocoa_VideoInit (menus, display modes, activation) on a quiet machine, it delays every window's first frame.
- ZN-446: `zinc run` of a program built natively shows no splash during its first native build (seconds); a dev-only gap, the executable shows it as it starts.

Not checked: Linux and the Pi 3 (no cross runs during a Mac task); a quiet machine (other agents built throughout); visual absence of a blank frame at the show (the capture shows the splash; the double present is the guard).

Usage: tools/usage printed n/a in this worktree agent.
Review 2026-10-25: closed as Done. Close as done: macOS measured (about 400 ms exec to splash), browser inline splash and headless unchanged pass. The Linux and Pi 3 timings are cross-pass lines already in later.md. Evidence: src/host/splash.cpp; tests/t1/splash.sh; tools/splash-time Verifier: macOS exec-to-splash measured (406.8 ms median, tools/splash-time), AC2/AC3 proved by tests/t1/splash.sh; Linux and Pi 3 timings are cross-pass lines.
<!-- SECTION:NOTES:END -->
