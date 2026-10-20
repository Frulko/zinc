# Zinc Go

The player app for phones and tablets, like Expo Go: install it once, then run any project from your computer and see each save on the
phone, with the state kept.

```sh
build/zinc export examples/zinc-go --target android --apk          # then: adb install -r <the apk it prints>
build/zinc export examples/zinc-go --target ios --ipa --simulator  # then: xcrun simctl install booted <the .app it prints>
build/zinc dev examples/rn-showcase --lan                          # prints a QR code: scan it with Zinc Go
```

This directory is its home screen (`src/main.tsx`: scan the QR code, type the link, open the last one again; `src/scanner.tsx`: the camera
and zinc:camera's `scanQr`). `"player": true` in `zinc.json` makes the export a player: the interpreter, the link to `zinc dev --lan`, Fast
Refresh and every plugin made for the platform (`src/app/player.cpp`). In a project, a shake, three fingers or the Menu key open the dev
menu. On a desktop, `ZINC_GO_SCAN=1 ZINC_FAKE_CAMERA_IMAGE=<a QR code .png> zinc run .` tries the scanner with the fake camera.

A store release of your own app is AOT and has none of this; see `docs/guide/07-distribution.md` and `docs/reports/zinc-next-zinc-go.md`.
