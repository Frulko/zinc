# display-rmpp doc audit

## What it is
The reMarkable Paper Pro screen driver: it draws a Zinc app on the e-ink panel (through AppLoad's qtfb) with a refresh policy, takes Marker pen and touch, and shows an emulated e-ink look on a desktop.

## Targets and status
- plugin.json: `rmpp` (rmpp.cpp), `macos`, `linux` (emulator.cpp). 12 options (`ink`, `full_every`, `full_after_pct`, `full_after_updates`, `full_idle_ms`, `upgrade_ms`, `dither`, `refresh_mode`, `fast_hz`, `color_hz`, `keyboard`, `header`).
- Verified: static aarch64 binary in a container, qtfb socket test, emulator screenshots, notes replay. Not verified: pen latency, ghosting, relaunch from AppLoad on hardware (doc "What is verified").

## What the docs have
- [x] Overview and design: `docs/targets/remarkable-paper-pro.md` (508 lines; the user page is the target page, there is no `docs/plugins/display-rmpp.md`)
- [x] Install on the tablet (section), safety rules, recovery, display lease
- [~] Quick start: spread over sections; no 5-line path from template to tablet
- [~] Options: `refresh_mode`, `full_*`, `keyboard`, `ink` described in prose; no single table
- [x] Example: `examples/remarkable/notes`, `dashboard` (README 43 lines), `templates/eink`, `templates/remarkable`
- [x] Screenshots: `docs/img/remarkable-notes.png`, `remarkable-dashboard.png`
- [ ] Tutorial
- [x] Commands: `tools/rmpp-shot`, container check, ssh recipes
- [x] Troubleshooting: recovery section
- [x] Tests: `rmpp_sim`, `rmpp_engine`, `rmpp_lease`, `sidecar_stream`, `tests/rmpp/qtfb.cpp`

## What is missing (priority order)
1. A single options + environment table for the driver (plugin.json defaults, meaning, which backend honours it; the doc already says `full_every`, `upgrade_ms`, `dither` do not control the device backend).
2. Document `header` (plugin.json default `none`; not found in the target page) and the env vars `ZINC_RMPP_GESTURE_MS`, `ZINC_RMPP_HEADER`, `ZINC_SIDECAR_NO_H*` (in code, not in the page).
3. A short `docs/plugins/display-rmpp.md` that links the long target page: what it is, how to try it on a Mac (`ZINC_EINK_LOOK`), and where to go.
4. Add rmpp to the `displays.md` support matrix (it is listed only in guide 05's "worked drivers").
5. A 6-step tutorial "Your first e-ink app": `zinc new --template eink`, run on the Mac emulator, `zinc export --target rmpp`, install with AppLoad, run, recover. (hardware)
6. Photos/GIF of the tablet: pen stroke FAST then colour upgrade; `tools/rmpp-shot`. (hardware, owner)
7. e-ink advice: turn the pressed dim fade off by default (later.md 9b4290a3); the refresh switch as a `zinc:gfx` API (ZN-841). Note as "known limits".

## Wrong or stale
- Nothing contradicting plugin.json found; options table gap above is an omission, not an error.
- Page mixes research notes (credits, hardware research) with user steps; move the research out.

## Suggested pages
- API/reference: display-rmpp options and environment
- Guide: Your first e-ink app (template to tablet)
- Steps: Install on the tablet, Update and recover
- Explanation: Refresh policy (FAST, UI, colour upgrade), the display lease
- Notes: Safety rules, Keyboard (Type Folio), Verified and not verified
- Examples: Notes (pen), Dashboard, PDF, Read
