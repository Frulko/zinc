# zinc:camera documentation audit

## What it is
Webcams, built-in and phone cameras: list, open at a size and rate, draw the frames, take stills/PNG photos, scan QR codes. A fake test-pattern camera makes it work anywhere.

## Targets and status
plugin.json: macos, ios, android, linux, rpi1, windows (empty), web (getUserMedia). Doc: macOS builds and lists real cameras but **no real frame was ever captured**; Linux/Pi V4L2, Android camera2, iOS written and not run. Windows/web: doc says "no backend".

## What the docs have
- [x] overview, [x] example, [x] API table, [x] backends table, [x] permissions per platform (very good), [x] fake camera, [x] navigator.mediaDevices, [x] "Verified here" and "Not done"
- [x] runnable example `examples/webcam` (+ README with 6 screenshots in `examples/webcam/screenshots/`), also zinc-go, webrtc-call, rn-showcase
- [x] tests: `webcam`, `webcam_sim`, `webcam_demo`, `qr_code` (the tier test named `camera` is gphoto2's; `camera_pixels` is the camera example's frames: a naming trap to explain)
- [ ] screenshots on the plugin page (they exist in examples/webcam but are not shown)
- [ ] tutorial; [ ] troubleshooting section as such (bits are in Permissions)
- [ ] QR scanning docs (the code exists)

## What is missing (priority)
1. Document `scanQr()` (API table row + 6-line example); it is exported and `quirc` is vendored but the page says QR is "a later plugin".
2. Embed `examples/webcam/screenshots/{main,dark,viewer,allow,denied}.png` and the run command `zinc run examples/webcam` (and `ZINC_FAKE_CAMERA=1`).
3. Tutorial "Take a photo": permission, open, preview, `encodePng` then `fs.writeBytes`, show thumbnail via `still()`.
4. Real-camera proof: a screenshot/hash of a real frame on the Mac, a Linux webcam and a Pi (hardware); until then say "unproven" at the top, not at the bottom.
5. Troubleshooting table: "denied" (macOS Settings path), Linux `video` group, CSI camera needs `libcamerify`, camera in use, black frame, Z5005/Z5006.
6. Windows and web status: plugin.json declares a web entry and a windows target; explain what works.
7. Name the env-var clash: `ZINC_FAKE_CAMERA` is also read by gphoto2 (see gphoto2.md); document which wins when both are imported.
8. Mention `setOption` semantics and a mirror/selfie recipe in the tutorial.

## Wrong or stale
- Code sample and `index.ts` doc say `<Image source={cam.image} />`; the real prop is `image` (`<Image image={...} />`, as examples/ipod uses). Fix both.
- "No microphone (a later plugin)": `zinc:microphone` exists (the doc itself links it later).
- "QR and barcode decoding on the frames is a later plugin": `scanQr()` ships (`tests/t0/qr_code.sh`); backlog line 196 also stale.
- "Windows, wasm: not yet" vs plugin.json `web` entry and `windows` target.
- Example in the code block uses `gfx` without importing it.

## Suggested pages
- Camera: overview and quick start
- Camera: tutorial, take and save a photo
- Camera: API reference (generated)
- Camera: permissions per platform
- Camera: QR code scanning
- Camera: the fake camera and testing
- Camera: backends and platform notes (macOS, Linux/Pi, Android, iOS)
- Camera: navigator.mediaDevices compatibility
- Camera: examples (webcam with screenshots, zinc-go)
- Camera: troubleshooting
