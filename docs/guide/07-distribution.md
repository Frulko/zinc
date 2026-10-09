# 7. Distribution

`zinc export --target <id>` produces `dist/<name>-<target>/`: a self-contained build with assets embedded in the
executable, launch/deploy scripts, and the platform's native packaging. `zinc deploy` additionally copies it to a
device and starts it. Export builds are release builds, hardened by default (symbols stripped, hidden visibility).

```sh
zinc export --target macos            # dist/<name>-macos/<name>.app (GUI) or ./<name> (CLI)
zinc export --target linux            # executable + systemd unit + deploy.sh
zinc export --target rpi1             # ARMv6 static-ish binary + unit + deploy.sh
zinc export --target rmpp             # reMarkable AppLoad directory
zinc export --target esp32            # firmware images + flash.sh
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

`zinc export --target esp32` copies the firmware images and writes `flash.sh` (offsets from ESP-IDF's
`flasher_args.json`):

```sh
zinc export --target esp32 myapp
dist/myapp-esp32/flash.sh /dev/ttyUSB0        # needs esptool: pip install esptool
# under the hood: esptool --chip esp32 -p <port> write_flash 0x1000 bootloader.bin 0x8000 partition-table.bin 0x10000 myapp.bin
python3 -m serial.tools.miniterm /dev/ttyUSB0 115200   # serial console
```

You can also flash straight from the build with the IDF tool: `idf.py -p <port> flash monitor`.

## PS1 CD image

`zinc export --target ps1` puts the PS-EXE and a bootable ISO (`<name>.bin` + `<name>.cue`, built with mkpsxiso) in the
dist directory. Run it in an emulator that takes a cue/bin (PCSX-Redux, DuckStation) or burn it. Tests run headless in
PCSX-Redux with OpenBIOS (no Sony BIOS needed); see [docs/targets/playstation.md](../targets/playstation.md).

## reMarkable Paper Pro (AppLoad)

`zinc export --target rmpp` builds a static aarch64 binary and an AppLoad app directory (`external.manifest.json`,
`icon.png`, `deploy.sh`). With developer mode + xovi/AppLoad on the tablet, `dist/<name>-rmpp/deploy.sh` scps it into
`appload/<name>/`; open AppLoad, reload, launch. See [docs/targets/remarkable-paper-pro.md](../targets/remarkable-paper-pro.md).

## wasm hosting

`zinc export --target wasm` writes a static site: `index.html` (title = your app name, favicon = your icon),
`app.js`, `app.wasm`. Serve it over HTTP (a `.wasm` cannot load from `file://`):

```sh
zinc export --target wasm myapp
python3 -m http.server -d dist/myapp-wasm 8080     # then open http://localhost:8080/
```

Any static host works (GitHub Pages, S3, nginx). `zinc run --target wasm` serves it locally with hot reload during
development.

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
