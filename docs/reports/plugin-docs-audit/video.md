# zinc:video documentation audit

## What it is
Plays video files (playlists, gapless loops, several players at once) as an image you draw anywhere in your UI or game. Meant for signage, museums, media walls and apps with clips.

## Targets and status
plugin.json: macos, linux, windows, rpi1 (FFmpeg), webos (GStreamer), android (MediaCodec), ios (AVFoundation), web (`web/index.ts`). Doc: macos verified; android/ios verified on emulator/simulator; rpi1 only under QEMU; linux builds, not run; sim fake; esp32/ps1/ps2/wasm not supported. Prebuilt missing (ZN-718: needs FFmpeg installed).

## What the docs have
- [x] overview, [x] example code, [x] Player method/getter list, [x] support matrix, [x] how it works (very detailed), [x] phones, [x] options table, [x] Pi notes
- [x] runnable examples: `examples/video/{bounce,looper,mapper,quad}` each with README
- [x] screenshots: `docs/img/video-{bounce,looper,mapper,quad}.png`
- [x] tests: `video`, `museum_video`, `video_layers`, `video_phone`, `web_video` (not named on the page)
- [ ] install/requirements for Windows and Linux in one place (only macOS `brew install ffmpeg` and Pi)
- [ ] API reference as a table with types (it is a one-paragraph name list)
- [ ] step-by-step tutorial; [ ] troubleshooting; [ ] screenshots on the plugin page itself
- [ ] sound (not supported): stated only under Follow-ups

## What is missing (priority)
1. State at the top: "no sound yet, no seeking" (currently buried in Phones/Follow-ups). Add the workaround (play the soundtrack with `zinc:audio` `openMusic`) as a snippet.
2. API reference table: constructor args, `add`, `addFolder(dir, exts)`, `order`/`repeat` values, `draw`, `image` semantics (-1 until size known), `decoder` strings, `dropped`.
3. Tutorial "A looping video wall": make media (`examples/video/make-media.sh`), `addFolder`, draw full screen, pause/skip buttons, with the bounce screenshot.
4. Embed the four screenshots (bounce, looper, mapper, quad) on the page with one-line captions and run commands (`zinc run examples/video/quad`).
5. Troubleshooting: FFmpeg not found (Z-code), black picture before first frame, `decoder` shows software on Pi, dmabuf off (`ZINC_VIDEO_PRIME=0`), `ZINC_VIDEO_LOG=1`.
6. Requirements per OS: `apt install ffmpeg dev packages`, Windows FFmpeg route (plugin.json lists windows, doc does not). (owner) to verify Windows.
7. Notes on the screen wake lock (backlog D123) and formats/codecs list (EXTENSIONS) vs real support.
8. Hardware: measured Pi 1/Zero numbers (hardware).

## Wrong or stale
- Support matrix omits `windows` and `webos` rows that plugin.json has; web target (plugin.json `web`) not mentioned except "wasm not supported" (contradicts `web/index.ts` and `web_video.sh`).
- Pi section says the Pi measure is in `docs/reports/raspberry-pi.md` and also "not measured": reword per target (linux 64-bit measured, rpi1 not).
- Only the `gfx.onFrame` drawing form is shown; the zinc:ui form (`<Image image={player.image} />`) is missing (not wrong, incomplete).

## Suggested pages
- Video: overview and quick start
- Video: tutorial, a looping video wall
- Video: Player API reference (generated)
- Video: playlists, order and repeat
- Video: performance and zero-copy (how it works)
- Video: phones (Android, iOS)
- Video: Raspberry Pi and webOS notes
- Video: examples gallery (bounce, looper, mapper, quad with screenshots)
- Video: troubleshooting
