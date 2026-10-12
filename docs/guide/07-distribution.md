# 7. Distribution

From a template to a store page with the commands `zinc new`, `run`, `test`, `pack`, `fuse`, `export`, `verify`, `publish` and `update-app`, and
the `"permissions"` of zinc.json. The first section is a worked example; the sections after it are the reference of each step.

Every command in a code block of this page and of [security](08-security.md) is run, in order, by `next/tests/t1/guide_store.sh`, and every
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

In a Zinc checkout, `next/tools/package --app path/to/my-game.app` bundles the app's non-system dylibs
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

The images and fonts a program draws (`<image src="…">`, `gfx.image`, the font sizes it uses) are baked into the executable at
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
What is listed is what the program links: the components of `next/third_party/components.json` whose scope the build pulled in (the runtime
always; the host libraries and fonts for programs that use the host; Yoga, the shaped-text stack, QuickJS when used; each plugin's own
libraries, such as SQLite for `zinc:sqlite`; Lucide when `zinc.json` names icons). The SBOM's creation time is `SOURCE_DATE_EPOCH` when set,
else the newest modification time of the project's sources, so two exports of the same sources give the same bytes (and the same `.deb`).

### The browser (wasm)

`zinc export --target wasm` writes a static site: `index.html` (title = the app's name, favicon = `app.icon`, the canvas size from
`targets.wasm` `width` / `height` in zinc.json, 480 x 320 otherwise), `app.js` with its worker and WASI shim, `app.wasm` (the interpreter,
built by `next/tools/build-wasm` with the pinned zig), `app.zbc` (the program), `app.res` (the baked images) and `serve.py`. The program runs in
a worker that draws on an `OffscreenCanvas`. The frame loop waits on a `SharedArrayBuffer`, so the server must send
`Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`: `dist/<name>-wasm/serve.py 8080` does, a plain
`python3 -m http.server` does not; on itch.io, tick "SharedArrayBuffer support" in the embed options. Native modules and plugins with native
code are not available in the browser. `next/tests/t1/export_wasm.sh` runs two exports in headless Chrome.

### ESP32

`zinc export --target esp32` writes `core.bin` (the Zinc core firmware, a merged image for offset 0x0: bootloader, partition table and the
interpreter), `app.bin` (the program as bytecode, at 0x300000) and `flash.sh`. At start-up the core runs the program stored at 0x300000,
then waits for `zinc run --target esp32` uploads as usual. The bytecode must fit the core's 48 KB; the export refuses a larger program.
`dist/<name>-esp32/flash.sh /dev/ttyUSB0` flashes both with the pinned esptool (`zinc toolchain esptool`), else esptool from the PATH. The
program's output arrives on the UART at 115200 baud, framed by the upload protocol (`include/zn/devproto.h`).
`next/tests/t1/export_esp32.sh` boots the two images in the pinned QEMU, with no host attached.

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
`codesign --verify --strict` checks any signature, ad hoc included. `next/tests/t1/codesign.sh` signs with a test identity.

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

`next/tools/gh-org-setup` creates what is missing (the repositories, the protection of `zinc`'s main branch with the `zinc-next` checks) and
lists the CI secrets not set yet; it never writes a secret's value, and running it twice changes nothing the second time. The owner's steps:
`gh auth login` as an owner of zinc-engine, `next/tools/gh-org-setup --dry-run` (every gh command it would run), then
`next/tools/gh-org-setup` and `gh secret set -R zinc-engine/zinc NAME` for each secret it lists.

The `zinc-next` workflow (`.github/workflows/zinc-next.yml`) makes a GitHub Release when a `v*` tag is pushed. Each OS job
builds, tests and packages (`tools/package`, the version taken from the tag); the macOS job signs and notarizes its package
with `tools/sign-macos`; each job writes `zinc-<os>-<arch>.manifest`, an update manifest signed with the release key; then
the `release` job attaches every package and manifest to the release, with `install.sh` (`next/tools/install.sh`, the one
command of [Getting started](01-getting-started.md)) and the `SHA256SUMS` it checks its download against. Each package holds
the native libraries of the plugins, built in that job with the pinned zig (the log of `tools/package` names the plugins left
without one, and `zinc doctor` lists them on the user's machine). Without the signing secrets the release still
happens with an unsigned macOS package, and both the job log (a warning) and the release notes say so; without the update
key the manifests are left out and the notes say that too.

The owner's steps, once (Settings > Secrets and variables > Actions):

| secret | what |
| --- | --- |
| `MACOS_CERTIFICATE_P12` | the Developer ID Application certificate and its key, exported as .p12, base64 (`base64 -i cert.p12 \| pbcopy`) |
| `MACOS_CERTIFICATE_PASSWORD` | the password of that .p12 |
| `ZINC_SIGN_IDENTITY` | `Developer ID Application: Name (TEAMID)` |
| `APPLE_ID`, `APPLE_TEAM_ID`, `APPLE_APP_PASSWORD` | the notarization account: Apple ID, team ID, an app-specific password |
| `ZINC_UPDATE_SEED` | the seed of `zinc update-keygen` whose public key is the release key compiled into zinc |

Then, for each release, `git tag -a v0.1.0 -m "Zinc 0.1.0"` and `git push origin v0.1.0`.
`zinc update https://github.com/<owner>/<repo>/releases/latest/download/zinc-macos-arm64.manifest` then finds it (the manifest's package URL
is relative, so it resolves to the asset next to it). `next/tests/t0/release_workflow.sh` runs the manifest and release steps of the workflow
locally (a stand-in for `gh`) and lints the workflow with actionlint.

Next: [security](08-security.md).
