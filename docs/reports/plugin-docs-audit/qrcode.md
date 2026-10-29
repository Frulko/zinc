# Audit: zinc:qrcode (plugins/qrcode)

## What it is
Make a QR code from text (URL, Wi-Fi join string) and draw its modules; one C file works on desktop and on the ESP32.

## Targets and status
plugin.json: macos, linux, windows, esp32 (Nayuki qrcodegen 1.8.0). Verified under mquickjs by `tests/t0/mquickjs_esp32.sh`; device run of the ESP32 firmware not recorded in the doc. No wasm/web build, no rpi1 entry.

## What the docs have
- [x] Overview, quick start, API list (docs/plugins/qrcode.md, 25 lines), error behaviour, RAM note
- [x] Example code; [x] runnable example `examples/esp32-qrcode` (README, `esp32-wifi` also uses it)
- [ ] Screenshot/GIF; [ ] tutorial; [x] commands (in the example README)
- [ ] Notes: quiet zone drawn by the caller (stated), scanning contrast, e-ink tips
- [x] Test: mquickjs_esp32.sh (does not check the QR matrix on desktop; tests/t0/qr_code.sh exists)

## What is missing
1. Screenshot of `examples/esp32-qrcode` (desktop: ZINC_SHOT=... zinc run examples/esp32-qrcode) and of the board screen (hardware).
2. A desktop zinc:ui snippet: `<QrView text=...>` style draw using `runs(y)` in a `<Canvas>` (the doc only shows raw `rect`).
3. Tutorial: "share your Wi-Fi with a QR code on an ESP32 display" (flash, run, scan with a phone).
4. Document `ecc` trade-off table (7/15/25/30%) and capacity per level; today only "660 bytes at MEDIUM".
5. Mention that `qrcode.md` and the README cross-link `native-esp32.md`; add the test name `qr_code.sh`.
6. Note on other payloads (`mailto:`, vCard, geo) with a small helper idea; `wifiText` escaping explained.
7. Mention targets not covered: web, wasm, rpi1.

## Wrong or stale
- Doc test line names only `mquickjs_esp32.sh`; `tests/t0/qr_code.sh` also exists.
- Target list in the doc is absent; plugin.json says windows is supported, never verified.

## Suggested pages
QR code plugin overview; API reference (generated); Tutorial: join-Wi-Fi QR on an ESP32; Recipe: draw a QR in zinc:ui; Example: esp32-qrcode; Notes: error correction and size.
