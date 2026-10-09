# 7. Distribution

`zinc export --target <id>` produces `dist/<name>-<target>/`: a self-contained build with assets embedded in the
executable, launch/deploy scripts, and the platform's native packaging. `zinc deploy` additionally copies it to a
device and starts it. Export builds are release builds, hardened by default (symbols stripped, hidden visibility).

```sh
zinc export --target macos            # dist/<name>-macos/<name>.app (GUI) or ./<name> (CLI)
zinc export --target linux            # executable + systemd unit + deploy.sh
zinc export --target rpi1             # ARMv6 static-ish binary + unit + deploy.sh
zinc export --target rmpp             # reMarkable AppLoad directory
zinc export --target esp32            # core.bin + app.bin + flash.sh
zinc export --target wasm             # static site (index.html, app.js, app.wasm, favicon)
zinc export --target ps1              # PS-EXE + bootable CD image
```

## Single executable with embedded assets

The `assets/` directory is compiled into the binary as constant data (deterministic, sorted), so a hosted executable
is one file — copy it anywhere and run. In development, `ZINC_ASSETS=<dir>` reads assets from disk instead (hot
reload). `zinc:assets` reads them at runtime; `<image src="…">` and baked fonts use them at build time.

## App icons and metadata

Add to `zinc.json`:

```json
{ "name": "myapp", "version": "1.2.3", "id": "com.example.myapp", "icon": "assets/icon.png" }
```

`version` and `id` flow into each platform's metadata; `icon` (a PNG) is converted per target. Without `icon`, Zinc
generates one: the first letter of the name on a colour picked from the name (a macOS-style rounded square with a
gradient, 1024 px, `compiler/src/icon.ts`). Customize it without drawing anything:

```json
{ "icon": { "letter": "Z", "background": "#4f46e5", "background2": "#7c3aed", "color": "#ffffff" } }
```

On macOS, `zinc build` / `zinc run` of a windowed program also produce `build/macos/Name.app` and start the bundled
executable, so the Dock and the menu bar show the app's name and icon during development (not in deterministic
test runs). What each export does with the icon:

| target | icon becomes | metadata |
| --- | --- | --- |
| `macos` | `.icns` (via `sips` + `iconutil`) in the `.app` | `Info.plist`: name, version, `CFBundleIdentifier` = `id` |
| `linux` / `rpi1` | `icon.png` + a `.desktop` file | `X-Zinc-Version`, systemd unit |
| `rmpp` | `icon.png` in the AppLoad dir | AppLoad manifest |
| `wasm` | `favicon.png`, referenced from `index.html` | `<title>` = name |

## macOS `.app` bundle

When a program uses a window (or has an `icon`), `zinc export --target macos` builds a proper `Name.app`. Verified
output:

```
$ zinc export --target macos myapp
$ ls -R dist/myapp-macos
myapp.app  README.txt  run.sh
dist/myapp-macos/myapp.app/Contents:
  Info.plist  MacOS/  PkgInfo  Resources/  _CodeSignature/
  MacOS/myapp        Resources/icon.icns

$ plutil -p dist/myapp-macos/myapp.app/Contents/Info.plist
{
  "CFBundleName" => "myapp"
  "CFBundleIdentifier" => "com.example.myapp"
  "CFBundleShortVersionString" => "1.2.3"
  "CFBundleVersion" => "1.2.3"
  "CFBundleIconFile" => "icon"
  "NSHighResolutionCapable" => 1
  …
}
```

The `.icns` is built at 16/32/128/256/512 px @1x and @2x. On a non-macOS host the `.icns` step is skipped (with a
notice) — build the macOS bundle on macOS.

## macOS disk images

`zinc export --target macos --dmg` writes `dist/<name>-<version>.dmg` (compressed, HFS+) holding the `.app` and a link to
`/Applications`, the usual drag-to-install window. The `.app` needs `"app": { "id": "com.example.name" }` in `zinc.json` (the
templates for windowed apps have it). Sign the `.app` for distribution before making the image (see below); the image itself is not signed
yet, and hdiutil stamps it, so two images differ in bytes even when the `.app` does not.

## Debian packages

`zinc export --target linux --deb` (also `rpi`, `rpi1`, `rmpp`) writes `dist/<name>_<version>_<arch>.deb` beside the export directory,
without dpkg on the build machine: the export goes to `/opt/<name>/`, a launcher to `/usr/bin/<name>` and the `.desktop` file to
`/usr/share/applications`. The control and data members are uncompressed tars (dpkg reads them) written deterministically, so two exports
of the same project give the same bytes. Install with `sudo dpkg -i <name>_<version>_<arch>.deb`.

## SBOM and licences

Every `zinc export` writes, beside the executable, `sbom.spdx.json` (SPDX 2.3: the app, the Zinc runtime and each third-party component
it links, with versions, licences and SHA-256 where pinned) and `THIRD-PARTY-LICENSES.txt` (the full text of each of those licences).
What is listed is what the program links: the components of `next/third_party/components.json` whose scope the build pulled in (the runtime
always; the host libraries and fonts for programs that use the host; Yoga, the shaped-text stack, QuickJS when used; each plugin's own
libraries, such as SQLite for `zinc:sqlite`; Lucide when `zinc.json` names icons). The SBOM's creation time is `SOURCE_DATE_EPOCH` when set, else the newest modification time of the project's sources, so two exports
of the same sources give the same bytes (and the same `.deb`).

## App updates

An app updates from a channel of signed manifests (ZN-324). Once:

```sh
zinc update-keygen          # seed=<keep it secret>  public=<goes into zinc.json>
```

```json
{ "app": { "id": "com.example.notes", "version": "1.2.0" },
  "update": { "url": "https://updates.example.com/notes/", "channel": "stable", "publicKey": "<public>" } }
```

For each release, `zinc publish --key <seed> [--channel beta] [--notes "..."] -o dist/updates` writes `<name>-<version>.zapp` and
`<channel>.manifest` (app, channel, version, url, sha256, notes, then an Ed25519 signature of those lines); upload the directory to `update.url`.
`zinc update-app [--check]` fetches `<url>/<channel>.manifest`, refuses it unless its signature verifies with `update.publicKey`, refuses a
version older than the app's, downloads the archive and checks its SHA-256 into `~/.zinc/apps/<id>/updates/`. The seed never leaves the
publishing machine; a manifest altered after signing, or one signed with another key, is refused.

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

Updates apply to apps run as a `.zapp` or a fused executable; a natively compiled app (`zinc build`) says "unsupported".

## Versioning

Bump `zinc.json` `"version"` (semver). It appears in `Info.plist` (macOS), the `.desktop` file (Linux), the AppLoad
metadata (rmpp) and `README.txt`. `id` is your stable identity across versions.

## Code signing and notarization (macOS)

Apple Silicon refuses to run unsigned code, so `zinc export --target macos` **ad-hoc signs** the bundle/executable by
default (`codesign --sign -`). That is enough to run locally. For distribution outside your machine, set an identity
and Zinc signs with the hardened runtime and a timestamp, ready to notarize:

```sh
ZINC_SIGN_IDENTITY="Developer ID Application: Your Name (TEAMID)" zinc export --target macos myapp
# then notarize + staple (needs an Apple Developer account and an app-specific password):
ditto -c -k --keepParent dist/myapp-macos/myapp.app myapp.zip
xcrun notarytool submit myapp.zip --apple-id you@example.com --team-id TEAMID --password APP_PASSWORD --wait
xcrun stapler staple dist/myapp-macos/myapp.app
```

Verify with `codesign -dv --verbose=4 myapp.app` and `spctl -a -vv myapp.app`. (Notarization is Apple's server-side
step; Zinc prepares the bundle but cannot notarize for you.)

## `zinc deploy` and Docker images

```sh
zinc deploy --target rpi1 --device pi@raspberrypi.local   # export, rsync to /opt/<name>, install unit, start
zinc deploy --target rmpp                                 # defaults to root@10.11.99.1 (reMarkable USB)
```

Cross builds run inside pinned SDK Docker images (`zinc/sdk-linux`, `zinc/sdk-rpi1`, `zinc/sdk-rmpp`, `zinc/sdk-psx`,
`zinc/sdk-ps2`), built once from `docker/`. This pins the toolchain for reproducible output (see
[security](08-security.md)). To ship the *service* in a container, put the exported Linux executable in a minimal image
— it is self-contained, so a `FROM debian:bookworm-slim` with the one binary and `ENTRYPOINT ["/app/myapp"]` is enough.

## ESP32 flashing

`zinc export --target esp32` writes `core.bin` (the Zinc core firmware, a merged image for offset 0x0: bootloader,
partition table and the interpreter), `app.bin` (your program as bytecode, at 0x300000) and `flash.sh`. At start-up the core
runs the program stored at 0x300000, then waits for `zinc run --target esp32` uploads as usual. The bytecode must fit the
core's 48 KB; the export refuses a larger program.

```sh
zinc export --target esp32 myapp
dist/myapp-esp32/flash.sh /dev/ttyUSB0        # the pinned esptool (zinc toolchain esptool), else esptool from PATH
# under the hood: esptool --chip esp32 -p <port> -b 460800 write-flash 0x0 core.bin 0x300000 app.bin
```

The program's output arrives on the UART at 115200 baud, framed by the upload protocol (`include/zn/devproto.h`).
`tests/t1/export_esp32.sh` lays both images in a 4 MB flash and boots it in the pinned QEMU (Espressif's
qemu-system-xtensa), with no host attached: the hello prints the same bytes as on the desktop.

## PS1 CD image

`zinc export --target ps1` puts the PS-EXE and a bootable ISO (`<name>.bin` + `<name>.cue`, built with mkpsxiso) in the
dist directory. Run it in an emulator that takes a cue/bin (PCSX-Redux, DuckStation) or burn it. Tests run headless in
PCSX-Redux with OpenBIOS (no Sony BIOS needed); see [docs/targets/playstation.md](../targets/playstation.md).

## reMarkable Paper Pro (AppLoad)

`zinc export --target rmpp` builds a static aarch64 binary and an AppLoad app directory (`external.manifest.json`,
`icon.png`, `deploy.sh`). With developer mode + xovi/AppLoad on the tablet, `dist/<name>-rmpp/deploy.sh` scps it into
`appload/<name>/`; open AppLoad, reload, launch. See [docs/targets/remarkable-paper-pro.md](../targets/remarkable-paper-pro.md).

## wasm hosting

`zinc export --target wasm` writes a static site: `index.html` (title = your app name, favicon = `app.icon`, the canvas
size from `targets.wasm` `width` / `height` in `zinc.json`, 480 x 320 otherwise), `app.js` with its worker and WASI shim,
`app.wasm` (the interpreter, built by `tools/build-wasm` with the pinned zig), `app.zbc` (your program) and `serve.py`.
The program runs in a worker that draws on an `OffscreenCanvas`; its output goes to the page under the canvas. The frame
loop waits on a `SharedArrayBuffer`, so the server must send `Cross-Origin-Opener-Policy: same-origin` and
`Cross-Origin-Embedder-Policy: require-corp` (a plain `python3 -m http.server` does not):

```sh
zinc export --target wasm myapp
dist/myapp-wasm/serve.py 8080      # serves the folder with those headers; open http://127.0.0.1:8080/
```

Any static host that can set the two headers works (nginx, Netlify, Cloudflare Pages). Native modules and plugins with
native code are not available in the browser; the zinc:gfx calls the page does not implement print one warning each.
`tests/t1/export_wasm.sh` exports the hello and `examples/ui/forms` and runs both in headless Chrome.

## Release hardening and obfuscation

Export builds strip symbols and compile with `-fvisibility=hidden` by default. For an extra layer, `--obfuscate`
XOR-encodes string literals in the binary so they don't show up in `strings`:

```sh
zinc export --target macos --obfuscate myapp
strings dist/myapp-macos/myapp.app/Contents/MacOS/myapp | grep MySecret   # (nothing)
```

Program output is unchanged — this only affects what a casual inspection of the binary reveals. Read
[security](08-security.md) for exactly what obfuscation does and does not protect (it is honest about the limits).

Next: [security](08-security.md).
