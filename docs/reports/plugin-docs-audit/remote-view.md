# Audit: zinc:remote (plugins/remote-view)

## What it is
Watch and drive a Zinc app that runs without a screen (display-remote) from another Zinc app: the remote screen is an image, input goes back, apps on the LAN are discovered. Module name is `zinc:remote`, directory is `remote-view`.

## Targets and status
plugin.json: macos, linux, rpi1. Needs `plugins/display-remote` on the app side. Measured on a Mac only; "not measured on a real Pi over Wi-Fi/Ethernet". Tests: `tests/fuzz/remote.cpp`, `tests/t0/templates_remote.sh`; no tests/affected.json mapping for `plugins/remote-view`.

## What the docs have
- [x] docs/plugins/remote.md: overview, run commands, options table, viewer API, protocol, measurements, security, follow-ups
- [x] Example: `examples/remote/viewer`
- [ ] Screenshot/GIF; [ ] tutorial; [ ] full API (`App` fields and `buttonOf` key map mentioned only in part; `Session.view`)
- [ ] Troubleshooting (firewall, multicast, token mismatch); [ ] a test named in the doc

## What is missing
1. Screenshot of `examples/remote/viewer` showing breakout streamed (run `zinc run examples/breakout --display remote`, then the viewer with ZINC_SHOT).
2. Tutorial: "supervise a Pi from your laptop": run with `--display remote` bound to 0.0.0.0 + token, discover, connect over ssh tunnel.
3. Table of key names accepted by `sendKey`/`buttonOf` (arrows/WASD, Space=A, Enter=Start, Tab=Select).
4. Document `Session.view(x,y,w,h)` and `App.key`, `seen` units.
5. Troubleshooting: no apps listed (loopback bind, multicast 239.255.90.1:7701), auth timeout 3 s, black frame.
6. Add `plugins/remote-view/` to tests/affected.json and name the tests in the doc.
7. (hardware) Pi over Wi-Fi/Ethernet latency table.
8. Name mismatch note: page `remote.md`, plugin dir `remote-view`, module `zinc:remote`, display `display-remote`.

## Wrong or stale
- "the rpi1 builds are checked in docker only" (measurements) should be re-checked against current status.
- Follow-ups mention "text/keyboard events once the HAL has them", but the doc also says `INPUT` carries keys with text for `zinc device`; reconcile.

## Suggested pages
Remote display overview; API reference (generated); Tutorial: watch a headless app; Tutorial: watch a Pi securely; Protocol; Measurements; Security; Troubleshooting; Example: viewer.
