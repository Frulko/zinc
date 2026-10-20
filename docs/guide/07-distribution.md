# 7. Distribution

From a template to a store page with the commands `zinc new`, `run`, `test`, `pack`, `fuse`, `export`, `verify`, `publish` and `update-app`, and
the `"permissions"` of zinc.json. The first section is a worked example; the sections after it are the reference of each step.

Every command in a code block of this page and of [security](08-security.md) is run, in order, by `tests/t1/guide_store.sh`, and every
`zinc` command written in the text is checked against `zinc help`. The outward steps (uploading to itch.io, notarizing with Apple, serving the
update channel) are shown as a `--dry-run` or as the commands zinc prints: they are yours to run.

## From template to store: a worked example

A 2D game made from the `game-2d` template, played, tested, restricted, packed, exported for macOS, signed, put on an itch.io page and on a
download page of its own, then given an update channel. Run it in a terminal on a Mac.

### 1. Make it and try it

```sh
zinc new game-2d my-game      # title, play and game-over scenes, keyboard / gamepad / pointer input, SVG sprites, a saved best score, tests
cd my-game
zinc run                      # play it in a window: arrows or WASD, Enter or a click to start
zinc test                     # the rules of the game: tests/world.test.ts
```

The template is described in [templates](../templates.md); its README says which file does what.

### 2. Say what it may do

The game reads its own assets and keeps its best score with `zinc:storage`: neither needs a permission. Declaring an empty list makes the
exported game refuse everything else (other files, the network, processes):

<!-- guide: zinc.json -->
```json
{ "permissions": [] }
```

```sh
ZINC_PERMISSIONS=enforce zinc run    # as the exported game will run: a call the list does not cover fails with EACCES and names the permission
```

A game that later fetches a leaderboard adds `"net:scores.example.com"`. The keys, and what each module checks, are in
[security](08-security.md#permissions).

### 3. One file to share

```sh
zinc pack                                # build/my-game.zapp: the compiled game, its baked sprites, its assets and zinc.json
zinc run build/my-game.zapp              # runs the archive as a player would: every file's SHA-256 is checked first
zinc fuse build/my-game.zapp -o build/my-game
./build/my-game                          # one executable, the engine and the game: nothing to install
```

### 4. A signing key

```sh
zinc update-keygen > ../my-game.key      # seed= signs: keep this file secret, out of the repository; public= checks
export ZINC_UPDATE_SEED=$(sed -n 's/^seed=//p' ../my-game.key)
```

Put the public key in zinc.json, with the address the updates will be served from (step 8):

<!-- guide: zinc.json -->
```json
{ "update": { "url": "https://example.com/my-game/", "publicKey": "<public= line of ../my-game.key>" } }
```

### 5. Export, sign, verify

```sh
zinc export --target macos --dmg               # dist/my-game-macos/ (my-game.app, signed ad hoc) and dist/my-game-0.1.0.dmg
zinc verify dist/my-game-macos/my-game         # ZINC_UPDATE_SEED made a .sig beside each artifact; update.publicKey checks it
zinc verify dist/my-game-0.1.0.dmg
codesign --verify --strict dist/my-game-macos/my-game.app
```

In a Zinc checkout, `tools/package --app path/to/my-game.app` bundles the app's non-system dylibs
(including transitive dependencies), rewrites their paths, signs ad hoc and verifies the bundle, then writes
`my-game.app.zip`. Run it before Developer ID signing/notarization. It does not build the app itself.

The export also writes `sbom.spdx.json` and `THIRD-PARTY-LICENSES.txt` and prints the permissions the game enforces (`none (every checked
call is refused)`). An ad hoc signature runs on your Mac; players on other Macs need a Developer ID signature and Apple's notarization. Add
your identity to zinc.json (the Developer ID certificate in your keychain, a profile made once by `xcrun notarytool store-credentials`):

```json
{ "signing": { "identity": "Developer ID Application: Your Name (TEAMID)", "notaryProfile": "my-notary" } }
```

The export then signs with the hardened runtime and a secure timestamp, and prints the notarization commands, which need your Apple account:

```text
notarize (needs the Apple account of the identity):
  codesign --force --timestamp --sign 'Developer ID Application: Your Name (TEAMID)' '…/dist/my-game-0.1.0.dmg'
  xcrun notarytool submit '…/dist/my-game-0.1.0.dmg' --keychain-profile 'my-notary' --wait
  xcrun stapler staple '…/dist/my-game-0.1.0.dmg'
  spctl --assess --type execute -vv '…/dist/my-game-macos/my-game.app'
```

Each other target is one more export of the same project (the Linux and Raspberry Pi targets below; `wasm` for the browser, for a program
without native plugins: this game's sound uses one): one more directory in `dist/`, one more channel on itch.io.

### 6. An itch.io page

Create the project on itch.io (kind "Downloadable"; its address is `https://you.itch.io/my-game`), then look at what would be uploaded:

```sh
zinc publish --itch you/my-game --dry-run    # one butler push per export directory; nothing is uploaded
```

```text
'…/butler' push '…/my-game/dist/my-game-macos' 'you/my-game:mac' --userversion '0.1.0'
dry run: nothing was uploaded (butler 15.31.0, `…/butler login` once before the real push)
```

Then log in once with the `butler login` it names and run the same command without `--dry-run`: zinc fetches the pinned butler, checks its
SHA-256 and pushes. `--itch you/my-game:beta` pushes to `mac-beta` instead, a channel for testers.

### 7. A download page of your own

```sh
zinc pack -o dist/my-game.zapp           # the .zapp as a download too, for players who have zinc
zinc publish --site site                 # site/index.html: one button per download with its size and SHA-256, and site/SHA256SUMS
(cd site && shasum -a 256 -c SHA256SUMS)
```

Serve `site/` from any static host (GitHub Pages, Netlify, your server).

### 8. Updates

```sh
zinc publish --key "$ZINC_UPDATE_SEED" --notes "First release"   # dist/updates/: my-game-0.1.0.zapp and stable.manifest, signed
zinc update-app --check                                           # my-game 0.1.0 is up to date
```

Upload `dist/updates/` to `update.url` (the test serves it as a `file://` address). For the next release bump `app.version` in zinc.json,
export, publish to itch.io and run `zinc publish --key` again: a copy of 0.1.0 then finds 0.2.0 with `zinc update-app`, or by itself through
`zinc:system/update` (below).

## Commands

| Command | What it writes |
| --- | --- |
| `zinc new <template> <dir>` | a project from a template ([templates](../templates.md); `zinc new --list`) |
| `zinc run`, `zinc test` | nothing: they run the project, its `*.test.ts` files ([testing](06-testing.md)) |
| `zinc pack [-o file]` | `build/<name>.zapp`: one deterministic archive per app, run by `zinc run app.zapp` ([.zapp](../zapp.md)) |
| `zinc fuse app.zapp -o app` | one executable: this engine with the archive appended, for this machine's OS |
| `zinc export --target <t>` | `dist/<name>-<t>/`: a native build (AOT) and what goes with it (below) |
| `zinc update-keygen` | a key pair: `seed=` signs, `public=` checks |
| `zinc verify <file>` | nothing: checks `<file>.sig` (made by `zinc export --key` or `zinc sign`) with zinc.json `update.publicKey` or `--key` |
| `zinc sign <file> <seed>` | `<file>.sig` for any file, such as a plugin archive ([security](08-security.md), "Publishing a plugin") |
| `zinc publish --itch user/game [--dry-run]` | nothing locally: one butler push per export directory of `dist/` |
| `zinc publish --site <dir>` | a static download page of the artifacts of `dist/` and `SHA256SUMS` |
| `zinc publish --key <seed>` | `dist/updates/` (or `-o`): `<name>-<version>.zapp` and `<channel>.manifest`, signed |
| `zinc update-app [--check] [--url U]` | `~/.zinc/apps/<id>/updates/`: the newer version, checked, staged for the next launch (`--url`: a channel that is not at `update.url`, for an app that keeps the address with its content) |
| `zinc deploy --target <t> --device user@host` | an export copied with scp and started with ssh (`--print` shows the three commands) |

## What `zinc export` writes

`zinc export [dir] --target <t>` builds the program ahead of time (AOT to C++) into `dist/<name>-<t>/` (or `-o dir`) with `run.sh`, `README.txt`
and the project's `assets/`, plus `sbom.spdx.json` and `THIRD-PARTY-LICENSES.txt` (below). It prints the permissions the app enforces. Without
`--target` it builds for `macos` on a Mac, `linux` elsewhere.

| Target | What else is in the directory | Options |
| --- | --- | --- |
| `macos` | the executable and `<name>.app` (needs zinc.json `app.id`): signed ad hoc, or by zinc.json `"signing"` | `--dmg`, `--key` |
| `linux`, `rpi`, `rmpp` | a 64-bit ARM Linux executable (aarch64), cross built with the pinned zig, and a `.desktop` file | `--deb`, `--key` |
| `rpi1` | an ARMv6 Linux executable (the first Pi and the Zero) and a `.desktop` file | `--deb`, `--key` |
| `rpi2`, `chip`, `pocketchip` | an ARMv7 Linux executable (a 32-bit OS with NEON) and a `.desktop` file | `--deb`, `--key` |
| `wasm` | a static site: `index.html`, `app.js` and its worker, `app.wasm`, `app.zbc`, `app.res`, `serve.py` | |
| `esp32` | `core.bin`, `app.bin` and `flash.sh` | |
| `android` | a Gradle project (SDL's, with the engine compiled from its sources by the NDK) | `--aab`, `--apk`, `--release`, `--abis`, `--dry-run`, `--print` |
| `ios` | a CMake project for CMake's Xcode generator, with `Info.plist`, `PrivacyInfo.xcprivacy` and `ExportOptions.plist` | `--ipa`, `--simulator`, `--dry-run`, `--print` |

Cross builds need no SDK: `zinc toolchain install` fetches the pinned zig once and checks its SHA-256.

### The app's identity and icon

```json
{ "app": { "id": "com.example.my-game", "name": "My Game", "version": "1.2.0", "icon": "assets/icon.png",
           "copyright": "© 2026 You", "category": "public.app-category.games" } }
```

`id` is a reverse-DNS name, stable across versions (the templates have one); `version` (semver) names the `.dmg`, the `.deb` and the update
manifests; `icon` is a PNG: the `.app` gets `icon.icns` (made with `sips` and `iconutil`), the wasm page `favicon.png`. Without an icon the
`.app` has the system's generic one. `Info.plist` takes the name, the id, the version, the copyright and the category
(`LSApplicationCategoryType`).

### Assets of a built program

The images and fonts a program draws (`<Image src="…">`, `gfx.image`, the font sizes it uses) are baked into the executable at
build time. The other files of `assets/` (JSON, text, sounds, models, photographs read with `imageFromBytes`) stay files, which
`zinc:assets` (`readText`, `readBytes`, `exists`) and `zinc://` pages of a webview read at run time from the first of:

1. `ZINC_ASSETS`, when set (`zinc run` sets it to the project's `assets/`; set it yourself to try other files without a rebuild);
2. `assets/` beside the executable (what `zinc export` writes in `dist/<name>-<target>/`);
3. `Contents/Resources/assets` of the macOS `.app` the executable is in (what `zinc export --target macos` puts in the bundle,
   sealed by its signature, so the app can be moved anywhere);
4. `assets/` one level above the executable (`zinc build` writes `<project>/build/<name>`, beside the project's `assets/`);
5. `assets/` of the directory the program was started in, except for a program that enforces its permissions (that
   directory is the user's, not the app's).

Copy the executable together with its `assets/` (or move the whole `.app`). A program whose assets are only images and fonts
needs no directory at all. Reading an asset needs no permission; writing in the assets directory needs `fs:write` (decision D66).

### macOS disk images

`zinc export --target macos --dmg` writes `dist/<name>-<version>.dmg` (compressed, HFS+) holding the `.app` and a link to
`/Applications`, the usual drag-to-install window. hdiutil stamps the image, so two images differ in bytes even when the `.app` does not. A
Developer ID signs the image as well (the first printed command above) before it is notarized.

### Debian packages

`zinc export --target linux --deb` (any Linux target) writes `dist/<name>_<version>_<arch>.deb` beside the export directory,
without dpkg on the build machine: the export goes to `/opt/<name>/`, a launcher to `/usr/bin/<name>` and the `.desktop` file to
`/usr/share/applications`. The control and data members are uncompressed tars (dpkg reads them) written deterministically, so two exports
of the same project give the same bytes. Install with `sudo dpkg -i <name>_<version>_<arch>.deb`.

### SBOM and licences

Every `zinc export` writes, beside the executable, `sbom.spdx.json` (SPDX 2.3: the app, the Zinc runtime and each third-party component
it links, with versions, licences and SHA-256 where pinned) and `THIRD-PARTY-LICENSES.txt` (the full text of each of those licences).
What is listed is what the program links: the components of `third_party/components.json` whose scope the build pulled in (the runtime
always; the host libraries and fonts for programs that use the host; Yoga, the shaped-text stack, QuickJS when used; each plugin's own
libraries, such as SQLite for `zinc:sqlite`; Lucide when `zinc.json` names icons). The SBOM's creation time is `SOURCE_DATE_EPOCH` when set,
else the newest modification time of the project's sources, so two exports of the same sources give the same bytes (and the same `.deb`).

### The browser (wasm)

`zinc export --target wasm` writes a static site: `index.html` (title = the app's name, favicon = `app.icon`, the canvas size from
`targets.wasm` `width` / `height` in zinc.json, 480 x 320 otherwise), `app.js` with its worker and WASI shim, `app.wasm` (the interpreter,
built by `tools/build-wasm` with the pinned zig), `app.zbc` (the program), `app.res` (the baked images) and `serve.py`. The program runs in
a worker that draws on an `OffscreenCanvas`. The frame loop waits on a `SharedArrayBuffer`, so the server must send
`Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`: `dist/<name>-wasm/serve.py 8080` does, a plain
`python3 -m http.server` does not; on itch.io, tick "SharedArrayBuffer support" in the embed options. Native modules and plugins with native
code are not available in the browser. `tests/t1/export_wasm.sh` runs two exports in headless Chrome.

### ESP32

`zinc export --target esp32` writes `core.bin` (the Zinc core firmware, a merged image for offset 0x0: bootloader, partition table and the
interpreter), `app.bin` (the program as bytecode, at 0x300000) and `flash.sh`. At start-up the core runs the program stored at 0x300000,
then waits for `zinc run --target esp32` uploads as usual. The bytecode must fit the core's 48 KB; the export refuses a larger program.
`dist/<name>-esp32/flash.sh /dev/ttyUSB0` flashes both with the pinned esptool (`zinc toolchain esptool`), else esptool from the PATH. The
program's output arrives on the UART at 115200 baud, framed by the upload protocol (`include/zn/devproto.h`).
`tests/t1/export_esp32.sh` boots the two images in the pinned QEMU, with no host attached.

### Phones: Google Play and the App Store

`zinc export --target android` and `--target ios` write the projects; three options also build the package in them, and `--dry-run` with any
of them prints every command and runs none:

| Option | What it runs | What it gives |
| --- | --- | --- |
| `--aab` | `./gradlew bundleRelease`, then the 16 KB check | `app/build/outputs/bundle/release/app-release.aab`, signed with your upload key |
| `--apk` | `./gradlew assembleDebug`, `zipalign -c -P 16`, the 16 KB check | `app/build/outputs/apk/debug/app-debug.apk`, for `adb install -r` |
| `--apk --release` | `./gradlew assembleRelease`, `zipalign -c -P 16`, the 16 KB check | `app/build/outputs/apk/release/app-release.apk`: the app as users get it (not debuggable), signed with your upload key, or the debug keystore without one, for `adb install -r` |
| `--ipa` | `cmake -G Xcode`, `xcodebuild archive`, `xcodebuild -exportArchive` | `build-device/ipa/<name>.ipa` |
| `--ipa --simulator` | the simulator build (Debug, unsigned), `ditto` | `<name>-simulator.zip`, the zipped `.app` that simulator test services take |

`--abis armeabi-v7a,arm64-v8a,x86_64` picks the Android ABIs (all three by default). The 16 KB check reads every `lib/<abi>/*.so` of the
package: a 64-bit library whose LOAD segments are not aligned to 16 KB is an error (Google Play requires it since 2025-11-01; Android 15
phones with 16 KB pages refuse it). The engine and the plugins compiled from source are linked so; a plugin's prebuilt library may not be.

```json
{ "signing": { "android": { "keystore": "../keys/upload.jks", "alias": "upload" },
               "ios": { "team": "ABCDE12345", "method": "app-store-connect" } } }
```

- **Android.** Google Play signs what users install with the app signing key it keeps (Play App Signing); you sign the bundle with your
  upload key. Make one once (`keytool -genkeypair -v -keystore upload.jks -alias upload -keyalg RSA -keysize 4096 -validity 10000`) and keep it
  outside the project. Its path and alias come from `ZINC_ANDROID_KEYSTORE` and `ZINC_ANDROID_KEY_ALIAS` or `signing.android`, its passwords
  only from `ZINC_ANDROID_STORE_PASSWORD` and `ZINC_ANDROID_KEY_PASSWORD` (zinc.json refuses a password); Gradle reads them at build time and
  nothing of the key is written in the project. Without a key the bundle is signed with the debug keystore, which Play refuses. Try a bundle
  as Play would split it with `bundletool build-apks --connected-device` then `bundletool install-apks` (the export prints both).
- **iOS.** A device build is signed by your Apple team (`signing.ios.team` or `ZINC_IOS_TEAM`); Xcode makes the certificates and profiles
  (`-allowProvisioningUpdates`, automatic signing) once Xcode knows your account. `method` is `app-store-connect` (the default: App Store
  and TestFlight), `release-testing` (ad hoc), `debugging` (development) or `enterprise`; the old names `app-store`, `ad-hoc` and
  `development` work too. `profile` names a provisioning profile for manual signing instead. `ExportOptions.plist` is written from these.
  Upload with `xcrun altool --upload-app -f <name>.ipa -t ios --api-key <key id> --api-issuer <issuer id>` (an App Store Connect API key) or
  Transporter.
- **The privacy manifest.** Apple refuses an upload whose code calls a required-reason API that `PrivacyInfo.xcprivacy` does not declare.
  The export declares the engine's (file timestamps of the app's own files, the system boot time for elapsed time, the disk space before a
  write) and those of the program's plugins (`plugin.json` `targets.ios.privacy`, [plugins](../plugins.md)); it declares no tracking and no
  collected data.

- **What each mode puts in the package (store rules).** The App Store Review Guidelines (2.5.2) forbid an app to download and run code that
  introduces or changes its features; Google Play's Device and Network Abuse policy forbids an app to update itself outside Play or to download
  executable code, interpreted code being tolerated only where it does not change what the app does. Both accept the code that ships inside
  the reviewed package. So:

  | Mode | How it is built | Code in the package | Store |
  | --- | --- | --- | --- |
  | Your app (`zinc export --target android` or `--target ios`, release) | AOT: the program compiled to native code | only your program and its plugins; no interpreter, no Fast Refresh, no link to `zinc dev` (`tests/t0/app_library.sh` checks it with `nm`) | Google Play, the App Store |
  | Your app, debug (`--apk`, `--ipa --simulator`) | the same | the same; `zinc.env` launch variables are read | your devices and simulators |
  | Your app, release APK (`--apk --release`) | the same | the same; only the timing switches `ZINC_PRESENT_STATS` and `ZINC_GL_STATS` are read, from `zinc.env` in the app's external files directory (`adb push zinc.env /sdcard/Android/data/<id>/files/`) | your devices |
  | A player (`"player": true`, Zinc Go: `examples/zinc-go`) | the home screen as bytecode, the interpreter, every plugin made for the platform | runs projects sent by `zinc dev --lan` | a development tool: install it yourself (`adb install`, Xcode, TestFlight internal testing), as Expo Go's own builds; not for the stores |

  `zinc dev --lan` sends code only to a player that knows the code in its link, and only on your network. Over-the-air `.zapp` updates stay off
  by default on iOS (D59).

### Developing on the phone: Zinc Go

`zinc dev --lan` serves the project to Zinc Go and prints a QR code; Zinc Go scans it (or takes the `zinc://host:port/code` link typed, or as
a deep link), runs the project with the plugins it has, and swaps each save in place (Fast Refresh) with the state kept. A shake, a press with
three fingers or the Menu key (`adb shell input keyevent 82`) opens the dev menu: reload, go home. A project that needs a plugin the player
does not have gets the plugin's name on the home screen; export your own player with it (a project with `"player": true` and the plugin).
Build Zinc Go: `zinc export examples/zinc-go --target android --apk` or `--target ios --ipa --simulator`
([report](../reports/zinc-next-zinc-go.md)).

### `zinc deploy`

`zinc deploy --target rpi --device pi@raspberrypi.local` exports, copies the directory to `~/<name>` on the device with scp (`--dir` another
place) and starts `./run.sh` there with ssh; `--print` (or `ZINC_DEPLOY_DRY=1`) prints the three commands and runs nothing. A service that
should start at boot carries its own systemd unit: the `service` template has a hardened one in `deploy/<id>.service`
([security](08-security.md#deploying-on-linux-and-raspberry-pi)).

## Signing

**Signed artifacts (every target).** `zinc export --key <seed-hex>` (or `ZINC_UPDATE_SEED`) writes `<file>.sig`, an Ed25519 signature made
with the app's key (`zinc update-keygen`), beside the executable and the `.deb` or `.dmg`. `zinc verify <file> [--key <public-hex>]` checks
it, with zinc.json `update.publicKey` by default; a changed byte or another key fails.

**macOS.** Apple Silicon refuses to run unsigned code, so `zinc export --target macos` signs the bundle ad hoc by default (`codesign
--sign -`), which is enough to run it on the Mac that built it. For distribution, give an identity in zinc.json `"signing"` (or
`ZINC_SIGN_IDENTITY`, `ZINC_SIGN_KEYCHAIN` in CI): zinc then signs with the hardened runtime and, for a Developer ID, a secure timestamp.
`keychain` names a keychain file when the identity is not in the login keychain (it must be in the keychain search list). The entitlements
follow `"permissions"`: `camera` gives `com.apple.security.device.camera`, `microphone` `device.audio-input`, `location`
`personal-information.location`, any `net` entry `network.client`, and `net` or `net:*` (listening) `network.server`. The export then prints
the notarization commands (step 5): for the `.dmg` when `--dmg` made one, else for a zip of the `.app` (`ditto -c -k --keepParent`).
Notarization is Apple's server-side step and needs your Apple account; Gatekeeper (`spctl`) accepts only a notarized Developer ID app.
`codesign --verify --strict` checks any signature, ad hoc included. `tests/t1/codesign.sh` signs with a test identity.

## Stores and download pages

`zinc publish --itch user/game` pushes every export directory of `dist/` to itch.io with butler, itch's uploader: one channel per target
(`mac`, `linux-arm64` (`--target linux` builds aarch64), `linux-rpi`, `linux-rpi1`, `linux-rpi2`, `linux-chip`, `linux-pocketchip`, `linux-rmpp`, `html5` for wasm; `user/game:beta`
makes `mac-beta`...), versioned with zinc.json `app.version`. Installers (`.dmg`, `.deb`, `.zapp`) are not pushed: butler makes its own
patches. Zinc fetches the pinned butler (15.31.0) once into `~/.zinc/toolchains` and checks its SHA-256 (`zinc doctor` lists it;
`ZINC_BUTLER` uses another). `--dry-run` prints the butler commands and uploads nothing.

`zinc publish --site <dir>` writes a static download page instead (or as well): `<dir>/index.html` with one button per artifact of `dist/`
(each export directory as a `.tar.gz`, the `.dmg`, `.deb` and `.zapp` files), its size and SHA-256, and `<dir>/SHA256SUMS` for
`shasum -a 256 -c`.

## App updates

An app updates from a channel of signed manifests (ZN-324). zinc.json names the channel and the key that checks it:

```json
{ "app": { "id": "com.example.notes", "version": "1.2.0" },
  "update": { "url": "https://updates.example.com/notes/", "channel": "stable", "publicKey": "<public>" } }
```

For each release, `zinc publish --key <seed> [--channel beta] [--notes "..."] [-o dir]` writes `<name>-<version>.zapp` and
`<channel>.manifest` (app, channel, version, url, sha256, notes, then an Ed25519 signature of those lines) into `dist/updates/`; upload the
directory to `update.url`. `zinc update-app [--check]` fetches `<url>/<channel>.manifest`, refuses it unless its signature verifies with
`update.publicKey`, refuses a version older than the app's, downloads the archive and checks its SHA-256 into `~/.zinc/apps/<id>/updates/`.
The seed never leaves the publishing machine; a manifest altered after signing, or one signed with another key, is refused.

`zinc update-app` also stages the download. The next launch of the app (`zinc run app.zapp`, or its fused executable) runs the staged
version on trial: once it has run 5 seconds or exited normally it becomes the version in use (`~/.zinc/apps/<id>/current`). If it crashes
before that, the launch after drops it ("failed to start; it was rolled back") and runs the previous version. Nothing is overwritten.

The app does the same itself with `zinc:system/update` (permission `"update"`):

```ts
import * as update from 'zinc:system/update';
const u = update.check();                 // { available, version, notes }: the signed manifest checked by the engine with the app's key
if (u.available) { update.download(); update.restart(); }   // staged, then the app starts again into it
update.healthy();                         // in the new version: keep it now (else after 5 s or at a normal exit)
```

Updates apply to apps run as a `.zapp` or a fused executable; a natively compiled app (`zinc build`, `zinc export`) says "unsupported".

## Mirrors, proxies and offline

Everything zinc downloads is checked before it is used: the toolchains against their pinned SHA-256, the plugin index by its
TUF signatures, its targets (published plugin binaries) by the SHA-256 the index signs. So any server may serve them:
`ZINC_MIRRORS="https://mirror.example.com/zinc file:///srv/zinc-mirror"` lists mirrors tried in order, before the origin.
A mirror serves the toolchains at `<mirror>/<archive name>` (as `ZINC_TC_MIRROR` did) and the index at `<mirror>/index/<path>`.
A source whose answer does not verify is reported and the next one is tried. Downloads go through curl, so `HTTPS_PROXY`,
`http_proxy` and `NO_PROXY` apply. `ZINC_OFFLINE=1` allows only `file://` sources. What a mirror or a proxy can and cannot do,
each tier's guarantees, publishing, a private index and key rotation: [security](08-security.md), "Plugin distribution".

Plugins fetched by `zinc add` or `zinc install` are kept by content in `~/.zinc/cache/sources` (archives by SHA-256, git trees
by commit), and a locked archive is asked of the mirrors as `<mirror>/sha256/<hash>`. `zinc install --offline` installs from
that cache only (a plane, a CI runner without network: it works after one online install), and names each plugin it does not hold.

## Zinc itself: the organization and its releases

Zinc lives in the GitHub organization `zinc-engine` (decision D37):

| Repository | What it holds |
| --- | --- |
| `zinc` | the engine: compiler, runtime, CLI, standard library, the official plugins under `plugins/` (developed here) and the CI that releases it |
| `index` | the signed plugin and template index and its transparency log, published on Pages (`zinc plugins search`, `zinc add <name>`) |
| `templates` | app templates outside the engine's own (`zinc new --list`) |
| `plugin-starter` | the repository a community author clones to publish a plugin |
| `plugin-<name>` | one per official plugin: a mirror of `plugins/<name>` pushed by `tools/plugin-split` from `zinc` (history kept) |

`tools/gh-org-setup` creates what is missing (the repositories, the protection of `zinc`'s main branch with the `zinc-next` checks) and
lists the CI secrets not set yet; it never writes a secret's value, and running it twice changes nothing the second time. The owner's steps:
`gh auth login` as an owner of zinc-engine, `tools/gh-org-setup --dry-run` (every gh command it would run), then
`tools/gh-org-setup` and `gh secret set -R zinc-engine/zinc NAME` for each secret it lists.

Branches (owner, 2026-10-19): the work happens on `develop`; `make release` fast-forwards `main` to it and pushes a `v*` tag. A release
runs one pipeline, the tag's (owner, 2026-10-20). What CI does with each:

| event | what runs |
| --- | --- |
| push to `develop` or `main` | nothing |
| `v*` tag (`make release`) | the build, the whole tier T2 in six shards, the packages; when every test passed, the release, then the plugin mirrors and the site |
| manual run (`gh workflow run zinc-next --ref develop`) | the same tests and packages, no release |


### The two downloads of a release

Each release has two downloads per Mac (arm64 and x86_64), each with its own line in `SHA256SUMS` (decision, 2026-10-16):

| file | what it is | for whom |
| --- | --- | --- |
| `zinc-<version>-macos-<arch>.tar.gz` | the CLI: `bin/zinc` with its window and WebGL modules, and `share/zinc` (lib/std, lib/fonts, templates, the plugins with their native libraries, `targets/capabilities.json`, the runtime headers and sources for cross builds, the core firmware, the sources of Atelier and the inspector). No `.app`. | a terminal: `curl ... install.sh \| sh`, or unpacked anywhere with `bin/zinc` linked onto the `PATH` |
| `Zinc-Atelier-<version>-macos-<arch>.zip` | `Zinc Atelier.app`: the same engine in `Contents/MacOS`, the same `share/zinc` in `Contents/Resources/zinc`, a launcher (`zinc-atelier`) that opens Atelier on `~/Zinc` | the Finder: unzip, drag to Applications, double-click; or `install.sh --atelier` |

Windows has `zinc-<version>-windows-x86_64.zip` (`bin\zinc.exe`, `share\zinc`: the standard library, templates and the plugins that build there)
and `install.ps1`, which checks `SHA256SUMS`, unpacks it into `%USERPROFILE%\.zinc\engine` and adds `bin` to the user `PATH`
(`irm https://github.com/Frulko/zinc/releases/latest/download/install.ps1 | iex`). The `package-windows-x86_64` job of the workflow builds
it on a Windows runner with the pinned zig (no Visual Studio), smoke tests the unpacked archive and the installer, and a `v*` tag attaches it to the
release; the job is experimental (its failure does not stop the macOS release) and the binary is not signed yet, so SmartScreen may ask to confirm.

Linux keeps its one archive, `zinc-<version>-linux-<arch>.tar.gz`, with the same layout as the macOS CLI (the Linux jobs are off for now). The CLI finds its files beside the binary: `zinc` resolves its own path through symlinks and reads
`<bin>/../share/zinc` (`tc::sourceRoot`), so the archive works wherever it is unpacked and through a link on the `PATH`.

Why the app embeds the engine rather than calling the CLI of the same release: an app started from the Finder gets a bare
`PATH` (`/usr/bin:/bin:/usr/sbin:/sbin`) and no shell profile, so it cannot count on a `zinc` installed elsewhere, and a
notarized bundle must hold every file it runs. The cost is one copy of the payload in each download (27.1 MB for the CLI,
28.0 MB for the app on arm64, 2026-10-16); the work is not doubled: `tools/package` stages the payload once, builds each
plugin's library once, and copies the staged `share/zinc` into the app. Each archive has its own size budget (`BUDGET_MB`
in `tools/package`, 35 MB each), so one cannot grow without the check seeing it. A `.dmg` (as `zinc export --dmg` makes for
apps) is left out: a zip is enough to drag the app, and it is what the notarization service takes.

`zinc update` reads `zinc-<os>-<arch>.manifest`, which points at the CLI archive; the app is updated by downloading it again
(or `install.sh --atelier`): see "Updating zinc" below.

Signing (`tools/sign-macos`, on a tag with the secrets below): every Mach-O file of both downloads is signed with the
Developer ID and the hardened runtime, `zinc` with the `disable-library-validation` entitlement (it loads the plugin
libraries a user compiles on their own machine, signed ad hoc). The app is notarized and its ticket stapled to the bundle.
The CLI is notarized as a zip of its tree, but a ticket cannot be stapled to a bare executable or to a tar.gz, so it is
packed again as signed: Gatekeeper checks a quarantined file (one a browser downloaded) online the first time it runs and
finds the ticket there. Files fetched by `curl` (what `install.sh` does) carry no quarantine attribute, so Gatekeeper does
not look at them at all.

### The release job

The `zinc-next` workflow (`.github/workflows/zinc-next.yml`) makes a GitHub Release when a `v*` tag is pushed. Each OS job
builds with `-DZN_VERSION=<the tag's version>` and packages (`tools/package` names the archives after the version the binary reports), smoke-tests both downloads
(`tests/t1/install_nocompiler.sh`: installed with no compiler, the app opened headless), signs and notarizes them with
`tools/sign-macos`, and writes the update manifests `zinc-<os>-<arch>.manifest` (stable) and `zinc-<os>-<arch>-beta.manifest`, signed with the release key; then the
`release` job attaches the downloads and the manifests to the release, with `install.sh` (`tools/install.sh`, the one
command of [Getting started](01-getting-started.md)), the `SHA256SUMS` it checks its downloads against and `plugins.lock`,
and release notes that say what each file is. Each download holds
the native libraries of the plugins, built in that job with the pinned zig (the log of `tools/package` names the plugins left
without one, and `zinc doctor` lists them on the user's machine). Without the signing secrets the release still
happens with unsigned macOS downloads, and both the job log (a warning) and the release notes say so; without the update
seed the manifests are still published, unsigned (a first line `signature=none`, checksums only), and the notes say that too:
`zinc update` refuses such a manifest unless `ZINC_UPDATE_ALLOW_UNSIGNED=1`, so nothing skips the verification silently.
A prerelease tag (`v1.3.0-beta.1`) makes a GitHub prerelease and writes only the beta manifest, with the archive's whole
address, which the job uploads to the latest release, where `zinc update --channel beta` reads it; a stable tag writes both.

### Releasing with `make release`

`make release` (`tools/release`) is the one command that publishes a version. It runs from `develop`, where the work happens, and checks the repository (on `develop`, clean tree, in
step with origin, `main` behind `develop`, `gh` signed in, the `ZINC_UPDATE_SEED` secret, `update.pub`), proposes the next version from the commits since the last tag, shows the notes, and asks.
The notes are the `## [Unreleased]` section of `CHANGELOG.md` (written as the work goes, see AGENTS.md); when it is empty the tool drafts one from the `feat`, `fix` and
`perf` commits and offers to open it in `$EDITOR`. On a yes it moves the section under the new version in a `docs(changelog)` commit, tags that commit with the notes as the
tag message, fast-forwards `main` to it, pushes `develop`, `main` and the tag, and watches the tag's workflow: the CI (the whole test tier, the packages), which publishes the downloads, the signed manifests and the notes. `make release BUMP=minor` (or `patch`, `major`, `X.Y.Z`),
`YES=1` for no questions, `make release-dry` to see the version and the notes, `make release-undo TAG=vX.Y.Z` to take a version back.

The owner's steps, once (Settings > Secrets and variables > Actions):

| secret | what |
| --- | --- |
| `MACOS_CERTIFICATE_P12` | the Developer ID Application certificate and its key, exported as .p12, base64 (`base64 -i cert.p12 \| pbcopy`) |
| `MACOS_CERTIFICATE_PASSWORD` | the password of that .p12 |
| `ZINC_SIGN_IDENTITY` | `Developer ID Application: Name (TEAMID)` |
| `APPLE_ID`, `APPLE_TEAM_ID`, `APPLE_APP_PASSWORD` | the notarization account: Apple ID, team ID, an app-specific password |
| `ZINC_UPDATE_SEED` | the seed of `zinc update-keygen` that signs the update manifests; its public key is `update.pub` |
| `HOMEBREW_TAP_KEY` | the private half of a write deploy key of `<owner>/homebrew-zinc`: each stable release pushes its formula there (`tools/homebrew-formula`), so `brew upgrade zinc` follows; without it the formula stays at the previous version |

The release key, once: `zinc update-keygen` prints `seed=` (the secret above) and `public=`; the public key goes into
`update.pub` (one line, 64 hex digits), committed: a public key is not secret, and a source build then trusts the same key
as a release. CMake reads it into the build (`-DZN_UPDATE_PUBKEY=<hex>` overrides it); the workflow needs no other variable.
Until then the file holds the placeholder (64 zeros): such a build has no update key, `zinc update` says so, and only unsigned
manifests with `ZINC_UPDATE_ALLOW_UNSIGNED=1` pass. When the seed is stored but the keygen output was not kept,
`zinc update-pubkey <seed>` prints its public key.

Then, for each release, `git tag -a v0.1.0 -m "Zinc 0.1.0"` and `git push origin v0.1.0`.
`zinc update` then finds it at `https://github.com/<owner>/<repo>/releases/latest/download/zinc-macos-arm64.manifest` (the manifest's package URL
is relative, so it resolves to the CLI archive next to it). `tests/t0/release_workflow.sh` runs the manifest, checksum and release steps of
the workflow locally (a stand-in for `gh`) and lints the workflow with actionlint. The packaging steps run on a Mac as the job runs them:
`python3 tools/package --out /tmp/zd`, then `ZINC_DIST=/tmp/zd tests/run --only install_nocompiler`.

### Updating zinc

The version is a build constant: `zinc --version` and `zinc doctor` print it. CMake takes `-DZN_VERSION=<x.y.z>` (the release
job passes the tag's), else `git describe` of the checkout at configure time (`v0.1.1-46-g9e97` gives `0.1.1+46.g9e97`), else
`0.0.0-dev`. `.zapp` archives carry it as the engine they were made with (a `.zapp` made by a newer zinc asks for an update).

`zinc update` replaces the zinc that `install.sh` installed:

```console
zinc update --check            # "zinc 0.2.0 is available (this is 0.1.1): <notes>", exit 10; or "is up to date", exit 0
zinc update                    # download, verify, install; the previous version is kept
zinc update --rollback         # back to the previous version (again: forward to the newer one)
zinc update --channel beta     # follow the betas from now on (--channel stable goes back)
```

What it does: it reads the manifest of this machine's CLI archive (`zinc-<os>-<arch>.manifest`, `-beta.manifest` on the beta
channel) where `install.sh` installed from (by default `https://github.com/Frulko/zinc/releases/latest/download`;
`ZINC_UPDATE_REPO=<owner/repo>` takes another repository's latest release, `ZINC_UPDATE_URL` or an argument a whole manifest
URL), checks its Ed25519 signature with the key compiled in (and `ZINC_UPDATE_PUBKEY`, `~/.zinc/update-keys`), downloads the
archive beside the engine (`~/.zinc/engine.incoming`, the same filesystem), checks its SHA-256, unpacks it, checks that its
`bin/zinc` starts and reports the manifest's version, then swaps the directories: `~/.zinc/engine` becomes `~/.zinc/engine.prev`
(one version is kept) and the new one takes its place. The running zinc is never overwritten (its files move, a command still
running keeps them), and the `zinc` link on the `PATH` points at `~/.zinc/engine/bin/zinc`, so it follows. A wrong checksum, a
signature that does not verify, an unsigned manifest, a new zinc that does not start or a directory it cannot write change
nothing. `install.sh` marks the engine it installs with `.zinc-install` (where it came from, the channel); a zinc without it (a
source build, a package manager, the copy inside Zinc Atelier.app) refuses and says how to update it instead: `git pull` and
`tools/build zinc`, the package manager's upgrade, or the new app zip. Linux uses the same path; Windows has no `zinc update` yet: run `install.ps1` again.

**Zinc Atelier.** Help > Check for Updates… runs `zinc update --check` with the zinc the app runs on and shows the answer
on the status line; Help > Install the Update runs `zinc update`. The zinc inside the app bundle does not replace itself (a
running, notarized `.app` is not rewritten in place): it answers with the address of the release, whose
`Zinc-Atelier-<version>-macos-<arch>.zip` replaces the app (or run `install.sh --atelier` again).

**The daily notice.** `zinc run` and `zinc dev` print one dim line on stderr when a newer zinc exists
("zinc 0.2.0 is available: run zinc update"). The check runs at most once a day, in a detached background process (one try,
1.5 s at most), so no command waits for the network, and offline it says nothing; its result is kept in
`~/.zinc/update-check.json`. It is silent with `ZINC_NO_UPDATE_CHECK=1`, in CI (`CI`, `ZINC_CI`), with `ZINC_HEADLESS`,
with `--quiet`, when stderr is not a terminal, and for a zinc that does not update itself. The short `zinc doctor` has a line
for it: "Zinc is up to date" or "Zinc 0.2.0 is available". `tests/t1/self_update.sh` proves all of it on a local release.

Next: [security](08-security.md).
