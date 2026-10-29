# zinc:carplay audit

## What it is
An experimental wireless CarPlay receiver: video and audio decoded by FFmpeg inside Zinc, input and Siri sent back, through a separately installed GPL backend.

## Targets and status
plugin.json: macos, linux with pkg-config `libavcodec/libavutil/libswscale`; no `requires`. Tested with loopback fixtures only (`tests/t0/carplay.sh`, `tests/golden/carplay/decoder.ts`, test names `carplay`, `carplay_demo`). No real iPhone session, no Pi verified. Backlog: ZN-851, `plugin_manifest` fails because `zinc:carplay` is missing from `tests/data/plugins-added-table.txt`.

## What the docs have
- [x] README with prerequisites, backend commands, run command, API, validation and remaining work, provenance link
- [x] runnable example `examples/carplay` (own README)
- [ ] no `docs/plugins/carplay.md`; only a report (`docs/reports/zinc-next-carplay.md`)
- [ ] screenshot, tutorial, troubleshooting beyond Bluetooth/AirPlay hints

## What is missing
1. `docs/plugins/carplay.md` (and the plugin index entry), carrying README content plus the licence note (GPL backend, FFmpeg).
2. Declare `requires` (net, audio) in plugin.json and say so in the doc.
3. A screenshot of examples/carplay once a phone is connected (hardware, owner), and a mock screenshot of the idle state (`ZINC_SHOT`).
4. A step-by-step setup: build backend, identity folder layout, Bluetooth pairing with bt-bridge, run receiver, run demo (hardware).
5. Document `nightMode` getter, `send()` and the connection `status` values.
6. Fix ZN-851 (table entry) so the plugin test passes.
7. Licensing and legal note: Apple MFi identity is the user's responsibility.

## Wrong or stale
- README does not mention the Linux target that plugin.json lists, nor that no Linux run exists besides "no Raspberry Pi execution".
- API line omits `touches()` signature in the list but explains it below; `receive()` is public in code and undocumented (likely internal).

## Suggested pages
Carplay (API, generated) / Guide: what is and is not supported / Steps: set up the receiver backend / Steps: run the demo / Notes: licences, MFi identity, Bluetooth and AirPlay conflicts, security of the local token / Example: examples/carplay.
