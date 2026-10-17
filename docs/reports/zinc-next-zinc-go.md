# Zinc Go: the player app, `zinc dev --lan` and Fast Refresh on the phones (ZN-631)

Date: 2026-10-17. The owner's goal (2026-10-16): an app like Expo Go. One installed app with the interpreter and every plugin that builds
for the phone runs a project's code straight from the developer's machine. `zinc dev` prints a QR code; the app scans it with zinc:camera, or
takes the URL typed or from a deep link (`zinc://...`), runs the program, and keeps it live with the Fast Refresh of ZN-742. A program that
needs a plugin the player lacks gets a clear message naming it. A user's own release builds stay AOT and contain none of this (D59).
See `docs/reports/zinc-next-mobile-core.md` §6 for the player and fused-app split, and `docs/reports/zinc-next-fast-refresh.md` for the swap.

## 1. The shape

```
 Mac: zinc dev --lan ─── QR code + zinc://<lan ip>:<port>/<code> ───────────────┐
   │  on connect and on every save: zinc --emit=hot <entry> --profile <the phone's>  │ scan, type, deep link
   │  (a hot unit: ZBC + stable keys + module graph + baked fonts and images, zstd)   ▼
   └──── TCP: unit <n> ──────────────────────────────────────────────▶ Zinc Go (player): zn_app + zn_app_player
         ◀── started | ok <ms> | restart <why> | missing <plugin> | log <line>      interpreter, hot swap, every plugin
```

- **`zinc dev --lan [--port n]`** (`src/cli_core.cpp`, `devLan`) listens on port 8090 (or the next free one), prints a QR code in the terminal
  (Nayuki's qrcodegen 1.8.0, MIT, two modules per character with half blocks, black on white whatever the terminal's colours) and the link,
  plus the commands for the Android emulator (`10.0.2.2`) and the iOS simulator. The link carries an 8-hex-digit code: a player that does
  not know it gets nothing (a school's shared Wi-Fi). It opens no desktop window.
- **The unit** (`src/dev/hot_swap.cpp`, `save`/`load`): `zinc --emit=hot` compiles in hot mode (ZN-742.01) for the player's profile
  (`android`, `ios`: platform files such as `feed.macos.ts` are left out as for an export), bakes the fonts and images, names the plugin of each
  native module, and writes it: a magic, then zstd of the ZBC and the keys. rn-showcase: 6.5 MB of ZBC, 0.7 MB on the wire.
- **The player** (`src/app/player.cpp`, the CMake target `zn_app_player`: the player, `hot_swap.cpp`, the interpreter `vm.cpp`) defines
  `zn_app_init` and takes `zn_app_iterate` and `zn_app_event` through `AppHooks` (`src/app/app_core.h`). Between two ticks the machine's stack
  is empty, which is the safe point the desktop gets by ending its frame loop (`pauseLoop`): the player swaps there. A unit for the running
  program goes through `hot::plan` and `hot::swap` (the same code as the desktop child); a plan or swap that fails starts the new code in the
  same process (`restart <why>`), as does the dev menu's Reload.
- **Programs in one process.** The home screen and the projects are programs of one `Machine` at a time (`appStart` ends the previous one:
  its natives and pending promises are released by `nativeEnd`). Before each start the player installs the program's baked resources and asks
  the window HAL to signal the theme and the safe area again (`zn_hal_sdl_resignal`).
- **Links.** Android: the player reads the activity's intent (`getIntent().getDataString()`, polled every 15 ticks; the activity is
  `singleInstance`, `onNewIntent` sets it). iOS: UIKit's `openURL` reaches SDL as a dropped file, which the player takes before the program.
  The home screen opens links with zinc:system's opener (`zinc://*` in its `scopes.opener`), so a typed link and a scanned one follow the deep
  link's path. A launch argument or `ZINC_GO_URL` works too (`xcrun simctl launch booted dev.zinc.go zinc://...`).
- **The dev menu**: the Menu key (`adb shell input keyevent 82`, as React Native's dev menu), Cmd+D, a press with three fingers held 0.8 s, a
  shake (the accelerometer above 2.5 g three times). `SDL_ShowMessageBox` shows it natively (AlertDialog, UIAlertController): Reload (a fresh
  start of the program from zinc dev), Go home, Cancel.
- **A missing plugin.** Before it starts a unit the player checks each native module against its registry; one it lacks sends
  `missing <plugin>` (zinc dev prints it) and the home screen shows "This program needs the plugin "camera", which this Zinc Go does not have.
  Build your own player with it...". The link stays open: the save that removes the import runs.
- **`"player": true`** in zinc.json makes `zinc export --target android|ios` build a player: the program becomes the home screen's unit
  (`zinc/home.unit` in the APK's assets or the bundle), every plugin with native code and an entry for the platform is compiled in, and
  `player_modules.cpp` registers their modules; `zn_app_player` is linked. `examples/zinc-go` is Zinc Go (React Native style: scan, type,
  open again, the message).
- **React model.** Fast Refresh of ZN-742 covered Solid components (`_hotC`). rn-showcase is written in the React model, where every
  handler and child render closure of an edited file outlived the swap and forced a restart. `lib/std/react.ts` now renders the whole tree
  again after an update in hot mode, with hook state kept and memos and callbacks recomputed (React Fast Refresh's rule); effects do not run
  again (they have no cleanup in Zinc's React model, a second run would stack subscriptions).
- **The QR reader**: zinc:camera `scanQr()` reads the newest frame with quirc 1.2 (ISC, vendored in `plugins/camera/vendor/quirc` and compiled
  for every target). The fake camera can hold up a picture (`ZINC_FAKE_CAMERA_IMAGE=<png>`), so the scanner is tested on a desktop.

## 2. Decision (the coordinator gives it a number)

**Where the program is compiled for a player: on the developer's machine (Expo's model), sent as a hot unit, rather than on the phone.**
Scored (RULES §4: fit x3, performance x3, size x2, maintainability x2, licence x2, portability x1, effort x1):

| Option | fit | perf | size | maint | lic | port | effort | total |
|---|---|---|---|---|---|---|---|---|
| **A. zinc dev compiles (hot mode, the phone's profile) and sends ZBC + keys; the player has the interpreter and the swap only** | 5 | 4 | 4 | 5 | 5 | 5 | 4 | **66** |
| B. the player carries the whole compiler and lib/std, zinc dev sends sources | 4 | 2 | 2 | 3 | 5 | 4 | 2 | 46 |
| C. a new process per program on the phone (Android only: iOS cannot restart an app) | 2 | 3 | 4 | 3 | 5 | 1 | 3 | 45 |

A keeps the phone small and fast (the Mac compiles rn-showcase in 0.6 s, a Nexus 7 would take several), reuses the desktop's swap
unchanged, and is what Expo (Metro bundles on the computer) and Flutter (the host compiles kernels) do. Units are compiled without the
optimiser (`ZN_NO_OPT=1`, as Metro serves unminified development bundles): 770 to 570 ms per save on rn-showcase, the keys the same; the
interpreter runs the code unoptimised, which is the development build's trade. Revisit if a save of a large project stays above a second on
the Mac (a parse cache for unchanged files, compiling in zinc dev's own process).

## 3. Measured (2026-10-17, M1 Pro, other agents building)

| Where | Save of rn-showcase's `src/screens/Forms.tsx` to the first frame of the new code | of which: compile on the Mac | the device (read, swap, frame) |
|---|---|---|---|
| Android emulator (API 37, arm64, Pixel_10 AVD) | 854 ms (884 under a load of 30) | 628 ms | 51 ms |
| iOS simulator (iOS 26.3, iPhone 17 Pro) | 725 ms | 639 ms | 41 ms |
| Desktop player, two-file gfx program (`tests/t1/zinc_go.sh`) | 61 to 87 ms | 29 to 51 ms | 0 ms |

With the optimiser and a load average of 58 the Android refresh took 1338 ms: the time is the Mac's compile. A connection starts rn-showcase
on the emulator in 0.85 to 1.1 s. The Android player is 8.7 MB (debug APK, arm64-v8a only).

## 4. Proven

- `tests/t2/zinc_go_phones.sh`: Zinc Go exported for the API 37 emulator and the iOS simulator runs rn-showcase from `zinc dev --lan`; on
  Android the deep link (`am start -d zinc://10.0.2.2:...`), the Forms tab and its checkbox tapped, a scripted save of `Forms.tsx` refreshed in
  854 ms with the checkbox still ticked and the new heading on screen; on iOS the launch link and `SHOWCASE_SCREEN=forms`, the save refreshed in
  725 ms with the new heading. Skipped without an emulator and a booted simulator.
- On the emulator by hand: the home screen; the Menu key's dev menu (Reload started v2, Go home showed "Open again"); the home screen's
  Open went through the system opener back into the player ("zinc dev refused: wrong code" for an old link, "Cannot reach ...: Connection
  refused" when zinc dev was gone).
- `tests/t1/zinc_go.sh` (desktop player, headless, 3 s): QR code in the terminal, a wrong code refused, the program's console reaches zinc dev,
  a module swapped in place with the state of the module it did not touch kept, a top-level effect restarts in the same player, a React
  component file refreshed with its store's count kept (restarted before this change), a missing plugin named and the link kept.
- `tests/t1/zinc_go_home.sh`: the fake camera holds a QR code, the scanner reads it and opens the link. `tests/t0/qr_code.sh`: three links at
  three scales encoded and read back. `tests/t0/export_android.sh`: a player's export (home unit, registration, `zn_app_player`) and no
  player in a user's app. `tests/t0/app_library.sh`: `nm` finds no swap, no player and no interpreter in the archives a user's app links nor in
  rn-showcase's binary, and finds them in `libzn_app_player.a`.

## 5. Not verified, and the limits

- The camera scan on a phone: the emulator's virtual scene camera shows no QR code. The scanner's code is the same on every platform
  (`scanQr` over the frame the backend delivers); a scan on a real phone is for the cross-platform pass.
- The shake and the three-finger press were not driven (the emulator's sensors and multi-touch were not scripted); the Menu key was.
- A real phone over Wi-Fi (the Nexus 7 was not used: the owner's music app is in front); an iPhone needs the local network permission
  (`NSLocalNetworkUsageDescription`), not in the iOS export yet.
- `simctl openurl` shows iOS's "Open in Zinc Go?" confirmation, which simctl cannot tap: the tests launch with the link instead.
- Programs on QuickJS (`.js` entries, `--engine quickjs`) are not served: the unit is ZBC.
- A compile error keeps the program running on the phone and prints the diagnostics in zinc dev's terminal and the device log; there is no
  red box on the phone yet.
- Host state of a program the player ends (images, Yoga nodes, open sockets of the host) is not freed; a long session that switches programs
  often grows.
