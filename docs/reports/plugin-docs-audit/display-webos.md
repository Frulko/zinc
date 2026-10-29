# display-webos doc audit

## What it is
A software-frame screen for HP webOS 3 (HP TouchPad): the app is a full-screen card through the tablet's own SDL 1.2, with multitouch. Useful for old tablets people want to bring back to life.

## Targets and status
- plugin.json: `linux` only (the armv7-webos build); option `fps` 60. If SDL 1.2 is missing, `init` returns 0 and the HAL keeps the screen.
- Verified on a real TouchPad per `docs/reports/hardware/hp-touchpad-webos.md`. Note: on webOS the default display is the GPU `display-gl` (webos backend); display-webos is the software alternative (`src/main.cpp` ~2791).

## What the docs have
- [ ] Overview in user docs: none. No `docs/plugins/display-webos.md`, no `docs/targets/webos.md`
- [~] Requirements: only the 393-line research report (steps 1-14, hardware, binary ABI, novacom)
- [ ] Quick start
- [ ] Options/env reference (`fps`, `ZINC_WEBOS_STATS`, `ZINC_PERF_HUD`)
- [x] Example: `examples/webos-shell` (README 7 lines), `examples/music-tree`, `devices/hp-touchpad.json` (simulated device)
- [~] Screenshot: `docs/img/music-touchpad.png` (not linked to the driver)
- [ ] Tutorial
- [~] Commands: `tools/webos-apps` named in the shell README; `zinc build --target webos/touchpad` in code (`cli_core.cpp`)
- [~] Troubleshooting: scattered in the report (sections 7-12)
- [ ] Test: none found in affected.json for `plugins/display-webos/`

## What is missing (priority order)
1. A user page `docs/targets/webos.md` or `docs/plugins/display-webos.md`: what runs, what the TouchPad needs (jailbreak/Preware/novacom as the report says), target name, how to build and install.
2. Explain the two displays: GPU `display-gl` (default, GLES2) vs `display-webos` (software) and how to pick one in zinc.json `webos` target.
3. A 6-step tutorial "Your TouchPad runs a Zinc app": `zinc build --target webos`, install via novacom/`tools/webos-apps`, launch, home gesture. (hardware)
4. Options and env table: `fps`, `ZINC_WEBOS_STATS=1`, `ZINC_PERF_HUD`, `ZINC_FRAMES`.
5. A photo or `tools/device`-style screenshot of an app on the TouchPad. (hardware, owner)
6. Expand `examples/webos-shell/README.md` (7 lines) with the apps.txt format and a screenshot of the icon grid (desktop sample list: `ZINC_SHOT`).
7. A test or a stand-in: a desktop run of the driver is not possible; at least a build check mapped in affected.json.
8. Touch features: multitouch and gestures table. List cost notes (38 ms full frame, later.md).

## Wrong or stale
- Nothing contradicting found; the gap is that there is no user-facing doc at all.

## Suggested pages
- API/reference: display-webos options
- Guide: Zinc on an HP TouchPad
- Steps: Build, install and launch on webOS 3
- Explanation: SDL 1.2 card vs the GPU display
- Notes: Performance, Troubleshooting, Limits
- Examples: webos shell, music tree
