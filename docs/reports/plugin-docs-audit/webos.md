# zinc:webos audit

## What it is
Lets a Zinc program on an HP TouchPad (webOS 3) call system services, launch other apps, keep the screen on and ask the root helper for full CPU speed, backlight, firewall ports and indicator lights. On other systems it answers false so one program runs everywhere.

## Targets and status
plugin.json: macos, linux (`-ldl`), android, ios; a `web` impl (`web/webos.js`); no `requires`. No `webos` or `touchpad` target exists (profile gap, later.md ZN-792; D123 lint warnings). Real runs on a TouchPad rig; no test in `tests/affected.json` maps `plugins/webos/` (verify). Used by `examples/music`, `music-tree`, `webos-shell`, `hardware`.

## What the docs have
- [x] good doc comments in `index.ts` on every export
- [x] background in `docs/reports/hardware/hp-touchpad-webos.md` and `touchpad-system-services.md`
- [x] runnable consumers: `examples/webos-shell` (README), `examples/music/install.sh`
- [ ] no `docs/plugins/webos.md`, no API table, no screenshot (`docs/img/music-touchpad.png` exists), no tutorial, no test

## What is missing
1. `docs/plugins/webos.md`: requirements, API table (`isWebOS`, `serviceCall`, `lastError`, `launch`, `screenTimeout`, `helperRunning`, `setPerformance`, `setBacklight`, `openPort`, `setIndicator`, `cpu`, `Cpu`).
2. A tutorial "Install a Zinc app on a TouchPad": `tools/webos-apps`, `tools/webos-helper`, install via novacom, launch from `webos-shell` (hardware, owner).
3. Screenshots: webos-shell grid and the Music app on the tablet (hardware) or the simulator `zinc run --simulate hp-touchpad` panel (ZINC_SHOT).
4. Notes to know: the jail, appinfo ids, why the helper is a root job, the firewall, glibc 2.8 softfp ABI, no Doctor.
5. Document the `notifier/` webOS app and `helper.sh`.
6. Add a T0 test using the sim module (`webos.sim.ts`) that all calls answer false off webOS.
7. Add webos to the manifest targets properly (own target or profile) so lint stops warning.

## Wrong or stale
- plugin.json lists android and ios but the plugin is webOS-only in purpose; and D123 says webos runs on Android but its targets do not list it (the manifest now lists it: check that D123 is closed).
- Description omits the helper calls (performance, backlight, ports, indicator, cpu).

## Suggested pages
Webos (API, generated) / Guide: TouchPad for makers / Steps: install and launch an app / Steps: use the root helper / Notes: jail, Luna bus, ABI, perf tweaks / Example: webos-shell with screenshot / Simulated device.
