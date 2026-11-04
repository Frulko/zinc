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
Refresh and every plugin made for the platform (`src/app/player.cpp`). In a project, hold three fingers for one second to return directly to Zinc Go. A shake or the Menu key opens the dev
menu (Reload and Go home also work for installed apps). On a desktop, `ZINC_GO_SCAN=1 ZINC_FAKE_CAMERA_IMAGE=<a QR code .png> zinc run .` tries the scanner with the fake camera.

Zinc Go is also a device of `zinc device`, like a Raspberry Pi or a console player: its home screen shows the device's name, its address
and a pairing code. On the computer:

```sh
zinc device pair 192.168.1.42 123456        # the address and the code on the phone's screen
zinc device deploy examples/hello           # packed for the phone's profile, sent, run; its lines here; Ctrl-C stops it
zinc dev examples/rn-showcase --device android-1a2b   # each save runs again on the phone
zinc device shot <app> shot.png              # the frame on the phone's screen
```

Without Wi-Fi, over USB: `adb forward tcp:7733 tcp:7733`, then `zinc device pair 127.0.0.1 <code>`. "Pair another computer" on the home
screen gives a new code. The phone announces itself over mDNS (Android takes the Wi-Fi multicast lock for it, iOS goes through Bonjour), so
`zinc device list` finds it. The program stops when the app leaves the screen.

A store release of your own app is AOT and has none of this; see `docs/guide/07-distribution.md` and `docs/reports/zinc-next-zinc-go.md`.

## Local feedback on iPhone

Shake the phone, choose **Ajouter une note**, write your feedback and save. Each immutable JSON record stays in the player’s sandbox,
separated by application under `feedback/`. It includes a UTC timestamp, device identity/model, iOS and Zinc versions, resolution,
window size and safe-area insets. Notes survive an app rebuild/reinstall that preserves its data. Sync and export are not implemented yet.
Installed apps use their app name; current LAN dev servers send the project name, while older servers fall back to the source identity.
