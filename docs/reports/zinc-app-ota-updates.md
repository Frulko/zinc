# Over-the-air updates of a Zinc app, on every platform

Research report, 2026-10-18. No code changed. Three labels are used throughout: **EXISTS** (in the repo today), **PROVEN** (done by other
products, with a source), **PROPOSED** (new, to build). Web claims marked (fetched) were read on 2026-10-18; the others are from the
author's knowledge of the tools and should be re-read before a decision depends on them.

## 1. What exists in Zinc today (EXISTS)

| Piece | Where | What it does |
|---|---|---|
| `.zapp` | `docs/zapp.md` | Deterministic ustar of `manifest.json` (per-file SHA-256, a `signature` slot, empty), `program.zbc`, `resources.bin`, `zinc.json`, `assets/`, `native/<target>-<arch>/<plugin>/` (plugin libs built for the packing machine). Refused if checksums fail or the engine is newer. |
| Signing keys | `zinc update-keygen`, `zinc sign`, `zinc verify` (`docs/guide/07-distribution.md:146-148`); Ed25519 over vendored Monocypher (ZN-149, `next/backlog/tasks/zn-149 - ...md`; `docs/reports/zinc-next-packaging.md:32`) | The app's public key lives in `zinc.json` `update.publicKey`. The engine's release key is a build constant (`next/update.pub`, `kBuildReleaseKey` in `next/src/tc/selfupdate.cpp:21`) and is still empty (ZN-149 notes: "release key is not set yet"). |
| App channels | `zinc publish --key <seed> [--channel] [--notes]` -> `<name>-<ver>.zapp` + `<channel>.manifest` signed (`tc::signManifest`, `next/src/tc/tc.h:136`); `zinc update-app [--check] [--url]` (ZN-324.01, `docs/guide/07-distribution.md:152`) | The manifest is `key=value` lines (`app, channel, version, url, sha256, notes, sig=`). Refuses bad signature, lower version, hash mismatch. A relative `url` resolves against the manifest's (`tc.h:141`). |
| Swap + rollback | ZN-324.02; `chooseAppVersion` at launch of a `.zapp` or fused app with `app.id` + `update.publicKey`: `~/.zinc/apps/<id>/` current/staged/trial; promote on `healthy()`, after 5 s or normal exit; a crash rolls back at the next launch | Payload-only update, runtime untouched. |
| App API | `zinc:system/update` (`plugins/system/update.ts`): `check()`, `download()`, `restart()`, `healthy()`; permission `update` (`plugins/system/ops.json:658`); a stub on targets without desktop services (`lib/std/system/update.ts`) | Blocking calls, no progress, no timeout (noted in ZN-650.11). No `rollback()`, no channel switch. |
| Engine self-update | `zinc update [--check] [--rollback] [--channel]` (`next/src/tc/selfupdate.cpp`): signed manifest, swaps the `~/.zinc/engine` directory, keeps `engine.prev` | Replaces zinc itself, not an app's fused runtime. |
| Kiosk proof | ZN-650.11, `examples/museum-table/src/update.ts`, `next/tests/t1/museum_update.sh` | An app runs `zinc update-app --url` as a process, restarts at idle. Limit recorded: a fused/exported app has no zinc command line, so it cannot update. |
| Device agent OTA | `next/src/agent/ota.cpp`, D115 (`docs/reports/zinc-next-decisions.md:186`), `docs/reports/zinc-next-agent.md:165-215`, test `agent_ota.sh` | `zinc device install` (with `<file>.sig`) / `zinc device update <app>` on a paired Linux/macOS machine; the installed app's key decides; older refused; `previous.zapp` hard link; 5 s trial (`ZINC_AGENT_TRIAL_MS`) then rollback; launchd / systemd-user service. ZN-729.04 is in Review (criterion 1, real launchd load, needs a person). |
| Signed index | TUF 1.0 client in `next/src/tc/tuf.cpp` (D41), transparency log `tools/tlog` (D42), `tools/index-repo` | Used for plugins and templates, not for app updates yet. Handles rollback, freeze, threshold, delegation, expiry. |
| Packaging | `zinc export` (`.app`, dmg, deb, apk/aab/ipa, D129), `zinc fuse` (engine + zapp, ~15 MB), `tools/package`, `tools/sign-macos`, `tools/appimage` (zsync mentioned in ZN-149), `zinc deploy`, `zinc publish --itch/--site` | Store and first-install paths. Sparkle is named in ZN-149 and `system-integration.md:27,373` ("Non-goal here") and never built. |
| Targets | webOS: `examples/music/install.sh` copies an AOT binary + appinfo.json to `/media/cryptofs/apps/usr/palm/applications/org.zinc.music` over `novacom`. Handhelds: ZBC linked into a core (`docs/targets/handhelds.md:4`). ESP32: `next/firmware/esp32` with `CONFIG_PARTITION_TABLE_SINGLE_APP=y` (no OTA slot today); ZN-030 uploads ZBC to a pre-flashed core. Nexus 7: Magisk root, adb (`docs/reports/hardware/nexus7-2012-research.md:43`). | |

Open backlog items touching this: ZN-729.04 (Review), ZN-347 (plugin update commands), ZN-714 / `docs/reports/zinc-windows-port.md:220` ("`update-app` for Windows"), ZN-392 (prebuilt player runtime per target), ZN-391 (file type registration). `later.md` lines from ZN-729.04: engine update stops at "downloaded and verified"; `deploy --key`; trial window on a Pi 3.

Gaps that matter for this goal: (1) no signed update works for a fused or exported app without a `zinc` binary; (2) no delta, no progress, no staged rollout, no expiry/freeze protection in the app manifest (the TUF client exists but is not wired to apps); (3) no native runtime update; (4) no ESP32 OTA slot; (5) nothing for Android/iOS/webOS beyond the first install; (6) no key-generation/publication owner step done (release key empty).

## 2. State of the art (PROVEN) and what fits

| Tool | Mechanism | Sig | Delta | Fits Zinc? |
|---|---|---|---|---|
| Sparkle 2 (macOS) | Appcast RSS in `SUFeedURL`; replaces the `.app` | EdDSA (`generate_keys`, `SUPublicEDKey`), optional signed feed (fetched: https://sparkle-project.org/documentation/) | `generate_appcast` makes `.delta`, ignored if the installed app checksum differs (fetched, same page) | Only for the runtime of a macOS `.app`. Same Ed25519 family as Zinc, so the key can be shared. Needs a framework in the app; rung 2 only (section 4). |
| Tauri updater | `latest.json` per `OS-ARCH` (`version, url, signature`, optional `notes`, `pub_date`); Windows installer or MSI, AppImage, `.app.tar.gz` (fetched: https://v2.tauri.app/plugin/updater/) | Mandatory minisign-style, public key in config; "losing the private key means you cannot publish updates" | none | Closest model to the Zinc manifest: static file on any host, per-platform entries. Adopt the shape. |
| Electron autoUpdater / Squirrel | Squirrel.Mac and Squirrel.Windows, `update.electronjs.org` for GitHub releases | OS code signature | Squirrel.Windows delta nupkg | Reference only. |
| Velopack | SDK + `vpk`; feed is static files, GitHub Releases or cloud storage; C++ client exists (fetched: https://docs.velopack.io/) | package signing is the OS's | yes (its own deltas) | Strongest ready-made option for Windows and Linux desktop binaries. Evaluate as the Windows runtime updater (per `RULES.md` "proven libraries"). |
| MSIX / App Installer | `.appinstaller` file with `UpdateSettings`, OS-driven updates; needs a code-signing cert | Authenticode | block-level | Good for Windows if the owner buys a certificate (`zinc-windows-port.md:87` already studied signing options). |
| TUF / Uptane | Roles root/timestamp/snapshot/targets; protects against rollback, freeze, mix-and-match, arbitrary package, key compromise | Ed25519 / threshold | n/a | **Already implemented** in `src/tc/tuf.cpp`. Use for the runtime and the official apps; the per-app Ed25519 manifest stays the default for makers. Uptane is automotive, not needed. |
| RAUC / SWUpdate / Mender / balena | A/B root slots, signed bundles (RAUC: x.509 + OpenSSL, bootloader interface to U-Boot/GRUB/EFI, streaming over HTTPS, hawkBit server) (fetched: https://rauc.readthedocs.io/en/latest/) | x.509 | casync adaptive (RAUC), Mender delta | Out of scope for a Zinc app: they update the whole OS image. A Zinc app on a Pi uses the agent; a maker who wants an OS image uses these. Mention in docs only. |
| Android Play in-app updates | Play Core `AppUpdateManager`, flexible or immediate | Play signing | Play patches | Only for Play-distributed builds. |
| Android self-update | `PackageInstaller` session. `setRequireUserAction(USER_ACTION_NOT_REQUIRED)` exists only from API 31 and only when the installer is the installer of record (not fetched; the page did not render the member docs: https://developer.android.com/reference/android/content/pm/PackageInstaller.SessionParams). On API 25: needs `REQUEST_INSTALL_PACKAGES` and the user taps "Install" (and "unknown sources" once); with root (`su -c pm install -r`) it is silent | APK v1/v2/v3 signature; the update must be signed by the same key | none (Play only) | See table 3. |
| Google Play policy | An app "may not modify, replace, or update itself using any method other than Google Play's update mechanism"; no fetching dex/JAR/.so from outside Play; **exception for code run in a VM or interpreter that gives only indirect access to Android APIs** (fetched: https://support.google.com/googleplay/android-developer/answer/9888379) | | | Payload (ZBC) updates are allowed on Play if the interpreter does not expose a raw bridge to Android APIs; native plugin libs are not. |
| Apple App Store 2.5.2 | "may not ... download, install, or execute code which introduces or changes features or functionality of the app"; narrow exception for educational apps that show all source (fetched: https://developer.apple.com/app-store/review/guidelines/). Page says "executable code", not "interpreted code". Apple's own carve-out for interpreted code is in the Developer Program License (section 3.3.2), not re-read here. | | | Hot-updating ZBC logic on the App Store is a review risk. Content-only updates (assets, data, texts) are safe. |
| ESP-IDF OTA | Two `ota_N` slots + `otadata`; new image boots in `PENDING_VERIFY`, app calls `esp_ota_mark_app_valid_cancel_rollback()` or `..._invalid_rollback_and_reboot()`; signed apps without secure boot via `CONFIG_SECURE_SIGNED_APPS_NO_SECURE_BOOT`; anti-rollback through eFuse `secure_version` (about 32 increments) (fetched: https://docs.espressif.com/projects/esp-idf/en/latest/esp32/api-reference/system/ota.html) | RSA/ECDSA scheme of ESP-IDF | `esp_delta_ota` component exists (not verified) | Direct fit. |
| webOS (TouchPad) | `.ipk` (an `ar` archive, `hp-touchpad-webos.md:13,63`) installed by `palm-install` / `novacom`; the Palm app feed (Preware, WebOS Archive) is a package feed; the installer checks no signature | none | none | The device is out of vendor support; feed is community-run. |
| Binary delta | bsdiff/bspatch (Colin Percival), `zstd --patch-from=old` (reference file as dictionary; window larger than the source, `-M` memory cap 128 MiB default) (fetched: https://github.com/facebook/zstd/blob/dev/programs/zstd.1.md), Courgette (Chromium, for executables), casync / desync chunk stores, zsync (AppImage) | | | `zstd` is the one to use if zstd is already vendored; otherwise bsdiff on ZBC. |

## 3. Payload update versus runtime update

A Zinc app is `program.zbc` + `resources.bin` + `assets/` + (native plugin libraries). The runtime is the engine (interpreter, host, plugins' native code).

| | Payload update | Runtime update |
|---|---|---|
| Replaces | the `.zapp` (or its `program.zbc`, assets) | the fused executable / `.app` / APK / native AOT binary |
| Needed when | app logic, UI, assets, data change; **no new native plugin code**, no engine ABI break | engine fix, plugin native change (a plugin's `native/` library is part of the `.zapp` today but loaded as the host's own code, so a plugin change is a binary update), AOT-compiled programs (D43: `zinc run` compiles a drawing program to native; an AOT `export` embeds the program in the binary) |
| Size | tens of KB to a few MB; delta of ZBC is tiny | 15 MB (fused) to tens of MB |
| Needs | `zinc:update` in the runtime and a writable store; the `engine` field of `manifest.json` vs the installed engine (`zinc run` refuses a newer format) | OS-specific installer, restart, signature the OS accepts |
| Policy | Apple 2.5.2 risk; Google Play OK if interpreted | Normal store review, or off-store |
| Cost on device | The interpreter runs the ZBC, about 3x slower than AOT (`handhelds-psp-vita-3ds-iphone4s.md:638`; D43) | AOT keeps native speed |

**Decision: payload-first.** The cheap and strong path for makers is a signed `.zapp` update with the runtime pinned by a `runtime` range in the manifest ("works with engine >= 0.9 < 1.0"); when the range is not satisfied the app offers the runtime update of its platform (table 3). Every change in `plugins/*/native` or the engine ABI makes a release of kind `runtime` (see manifest).

## 4. Per platform (comparison)

Columns: what is replaced, signature, rollback, user prompt, limits, effort. Effort S/M/L is for new work on top of what EXISTS.

| Platform | Mechanism (payload) | Mechanism (runtime) | Signature | Rollback | Prompt | Limits | Effort |
|---|---|---|---|---|---|---|---|
| macOS | `zinc:update` swaps the `.zapp` in `~/.zinc/apps/<id>` (EXISTS) | Sparkle 2 on the `.app` (PROVEN), or `zinc fuse` replacement for CLI apps | Ed25519 manifest (EXISTS); Sparkle EdDSA; Developer ID + notarization of the `.app` (EXISTS as recipe `tools/sign-macos`) | payload: trial + previous (EXISTS); Sparkle keeps no previous, so keep the old `.app.zip` | none for payload; Sparkle shows its sheet or auto-installs | Sandbox needs Sparkle's XPC services; bundle replacement needs the notarized new build | payload S (already works); runtime M |
| Windows | same swap (needs `update-app` port, `zinc-windows-port.md:220`) | Velopack or MSIX App Installer (PROVEN) | Ed25519 manifest; Authenticode for the exe (owner buys, section 8) | payload trial; Velopack keeps the previous version | none/optional | cannot replace a running exe: update the `.zapp`, restart the launcher; SmartScreen reputation without a certificate | payload S; runtime M-L |
| Linux x86-64 / Pi / ARM | same swap; or the agent's `zinc device update` (EXISTS, D115) | AppImage + zsync (tool exists), `.deb` from a signed apt repo, or the agent replacing the binary; for a whole OS: RAUC/Mender (out of scope) | Ed25519; TUF for the engine | payload: trial + `previous.zapp` (EXISTS); engine: `engine.prev` (EXISTS) | none | Pi 3 trial window of 5 s may be short (later.md); ARM cross build only in the final cross-platform pass | S; runtime M |
| Android API 25 (Nexus 7, armv7, LineageOS 14.1) | `.zapp`/assets written to app-private storage, loaded at next start (interpreted ZBC). Allowed by Play only as interpreter payload (see section 2). | New APK through `PackageInstaller`; no silent path on API 25 without root; with Magisk, `su -c pm install -r` is silent | Ed25519 for the payload; APK signature (same key) for the runtime | payload: trial + previous; APK: `pm install -r -d` downgrade only with root / debuggable, so keep the old APK file | none for payload; the system "Install" dialog for APK | API 25 has no `USER_ACTION_NOT_REQUIRED` (API 31+); `REQUEST_INSTALL_PACKAGES`; no Play on a de-Googled ROM; `FileProvider` needed | payload M (Android host paths, storage); runtime M |
| Android 12+ | as above | `PackageInstaller` with `USER_ACTION_NOT_REQUIRED` when the app is the installer of record and the update meets target-SDK limits (unverified detail); or Play in-app updates | APK signature | Play staged rollout / halt | one tap or none | Play: no self-update outside Play | M |
| iOS | content only (assets, data, texts): safe. Logic (ZBC): risky under 2.5.2 | App Store / TestFlight only; enterprise or ad-hoc profiles outside the store; EU alternative marketplaces (not researched) | Apple code signature; manifest for content | store level only | App Store | do not promise logic hot updates on iOS; a dev/maker build installed from Xcode expires in 7 days (free account) | content S; logic: owner decision |
| webOS (TouchPad, armv7) | the app is an AOT native binary at `/media/cryptofs/apps/usr/palm/applications/<id>` (`examples/music/install.sh`). A payload update is possible only for a `.zapp`-style app that ships the runtime; the music app would be a binary replacement | new `.ipk` over `novacom` (`install.sh` pattern), or the app downloads the new binary and replaces itself (the app dir is `chmod 777`, `install.sh`) then relaunches | Ed25519 manifest (app verifies itself); the OS verifies nothing | keep `music.prev` and restart-on-crash | none | device is unsupported, no feed; HTTPS needs the bundled `cacert.pem` (already shipped); glibc 2.8 softfp ABI | S-M (self-replace of a binary) |
| ESP32 | pull ZBC (+ resources) into an `ota_N` slot or a data partition; the preflashed core (ZN-030) interprets it | `esp_https_ota` into the inactive app slot, `PENDING_VERIFY`, app-controlled confirm (PROVEN, ESP-IDF doc above) | Ed25519 manifest checked by the app; ESP-IDF signed apps for the core | bootloader rollback (PROVEN); anti-rollback eFuse (about 32 steps, irreversible: owner step) | none | needs a 2-slot partition table (today `SINGLE_APP`, `sdkconfig.defaults:3`) = flash layout change once, by USB | M |
| Handhelds (PSP/Vita/3DS) | ZBC embedded in the core; core updated by replacing `EBOOT.PBP` / `.vpk` / `.3dsx`; dev upload `hh-dev-tcp` exists as a plan | same | Ed25519 manifest on the app side; consoles do not verify homebrew | keep previous file | none | no OTA framework, update by copy/SD or the dev protocol | S per console after the generic client exists |
| WebAssembly | host the new `.zbc`/`vm.wasm` at a versioned URL; service worker cache | same | HTTPS + SRI hash | previous URL | none | trivial; not an app store case | S |

## 5. Recommended single design (PROPOSED)

### 5.1 Principles
1. Payload first, runtime second; both use the same manifest, signature and rollback code.
2. Keep the existing Ed25519 manifest as the maker default. Add TUF only for the engine and official channels (client exists).
3. No server needed: a channel is a directory of static files (GitHub Releases, S3, any web server, `file://`, the agent on the LAN).
4. Every update is checked, staged, trialled and reversible; the app says `healthy()`.

### 5.2 Manifest (extends the EXISTING `key=value` text, `sig=` last)
Keep the format `tc::signManifest` already signs; add keys, ignored by old clients (they still verify the whole text):

```
app=dev.zinc.music
channel=stable
version=1.4.0
seq=57                         # monotonic; client refuses seq < installed (rollback and replay protection)
expires=2027-01-18T00:00:00Z   # client refuses a stale manifest (freeze protection); republish to renew
kind=payload                   # payload | runtime
runtime=>=0.9 <1.0             # engine range the payload needs
min_version=1.2.0              # below this, a full download is required (no delta chain)
url=music-1.4.0.zapp           # relative to the manifest (EXISTS)
sha256=...                     # EXISTS
size=2410000
patch.from=1.3.2               # optional delta (see 5.4)
patch.url=music-1.3.2-1.4.0.zpatch
patch.sha256=...
rollout=25                     # percent; client takes the update if hash(deviceId+app+seq) % 100 < rollout
notes=Spotify login fixed
runtime.macos-arm64=music-mac-1.4.0.zip       # only for kind=runtime or when a binary is also published
runtime.windows-x64.sha256=...
runtime.android-armv7.url=...
sig=<128 hex>                  # Ed25519 over the text without this line (EXISTS)
```
`zinc publish` writes it. For the official engine and plugin index, the same signed targets are carried in TUF metadata (`tuf.cpp`), so key rotation and compromise recovery exist where it matters.

### 5.3 Signing and keys
- Per app Ed25519 key (`zinc update-keygen`, EXISTS), public half in `zinc.json`; a manifest may carry a successor key, signed by the old one (the agent already allows "an update may carry a new key", `zinc-next-agent.md:193`). Add a second backup key listed in `zinc.json` so a lost seed does not strand installs (Tauri's warning, fetched above).
- OS-level signatures stay separate and are the owner's (Developer ID, Authenticode, APK keystore, Apple team).
- Anti-rollback: `seq` + `expires` in every manifest, plus a per-device stored high-water mark.

### 5.4 Delta
Default: no delta for `.zapp` (a ZBC payload with assets is small; most weight is assets). For assets-heavy apps: file-level delta, using the `.zapp`'s per-file SHA-256 (EXISTS in `manifest.json`): send only members whose hash changed, as `zinc dev --device` already does (D115: "each save sends the members whose SHA-256 changed"). For runtimes: `zstd --patch-from` (needs window >= file, memory about the file size: fine on desktops, not on the Nexus 7 with 1 GB or an ESP32) or bsdiff; no delta on small boards. Always fall back to the full download when the base hash does not match (Sparkle does the same, fetched above).

### 5.5 Channels and rollout
`stable`, `beta`, any name: `<channel>.manifest` (EXISTS). Staged rollout by the `rollout` percent above; halting = republish with `seq+1` pointing at the previous version (a "rollback release"), so clients that already updated can go back since `seq` still rises. The app picks its channel from `zinc.json` or a runtime setting.

### 5.6 Hosting
| Where | Notes |
|---|---|
| GitHub Releases | default for makers: `zinc publish --github user/repo` uploads `.zapp` + `<channel>.manifest` as assets (`gh release upload`); the manifest url is the stable `.../releases/latest/download/stable.manifest`. **Owner step**: the push of a release is outward-facing. |
| S3 / any static host / the user's server | `update.url` (EXISTS). |
| LAN, no server | `zinc device install/update` (EXISTS) from the workstation to an agent; PROPOSED: `zinc serve-updates` serves `dist/updates/` on the LAN with mDNS (the agent already announces mDNS: `next/src/agent/mdns.cpp`) so apps on the same network find a channel without internet. |
| USB / SD | Drop a `.zapp` and its `.sig`; `zinc update-app --file`. For handhelds and the ESP32 bootstrap. |

### 5.7 App API (`zinc:update`, PROPOSED; today it is `zinc:system/update`, same names kept)
```ts
import * as update from 'zinc:update';

export interface UpdateInfo {
  available: boolean; version: string; notes: string;
  kind: 'payload' | 'runtime'; size: number; delta: boolean; mandatory: boolean;
}
export type Progress = { phase: 'download' | 'verify' | 'stage'; done: number; total: number };

update.check(opts?: { channel?: string; url?: string }): Promise<UpdateInfo>; // non-blocking; throws UpdateError('signature'|'expired'|'network'|'older')
update.download(onProgress?: (p: Progress) => void): Promise<string>;         // verifies sha256, stages; resumable (HTTP Range)
update.apply(opts?: { when?: 'now' | 'idle' | 'next-start' }): Promise<void>;  // payload: restart on trial; runtime: hands over to the platform installer
update.healthy(): void;                  // keeps the version on trial (EXISTS)
update.rollback(): Promise<void>;        // back to the previous version (engine.prev / previous.zapp exist)
update.current(): { version: string; channel: string; onTrial: boolean };
update.on('available' | 'progress' | 'applied' | 'rolled-back', cb): void;
```
`check`/`download` must not block a frame (the museum app had to start a process for that: ZN-650.11 notes). Make them async host operations. A `UI` helper (`<UpdateBanner/>` in `lib/std/kit`) gives makers a ready button.

### 5.8 What it reuses
`tc::signManifest`, `fetchManifest`, `downloadUpdate`, `verifyBytes` (`tc.h`), `chooseAppVersion` and trial logic (ZN-324.02), `plugins/system/update.ts` and its permission `update`, the agent's `ota.cpp` and its previous/trial scheme, `src/tc/tuf.cpp`, `tools/index-repo`, `zinc.json` `update.*`, `zinc publish`, `zinc export`/`tools/package`/`tools/sign-macos`, mDNS.

## 6. Ordered work items

| # | Item | Size | Notes |
|---|---|---|---|
| 1 | Async `zinc:update` (check/download with progress, Range resume, timeout) and `apply`/`rollback`/`current`; keep `zinc:system/update` names working | M | Replaces the blocking ops; removes the process workaround of the museum table. |
| 2 | Manifest v2 keys (`seq`, `expires`, `kind`, `runtime`, `rollout`, `min_version`) in `zinc publish` and the clients, with tests for stale/replayed/over-range manifests | S | Format stays backward-compatible; hash(deviceId) rollout. |
| 3 | Fused and exported apps update themselves (no `zinc` binary): the launcher reads the update store before the embedded `.zapp`, so the ZN-650.11 limit disappears | M | Needed for `examples/music` and `notify-relay` as shipped apps. |
| 4 | Windows port of the app update store + `update-app` (ZN-714 area) | S | After the Windows pass opens. |
| 5 | Runtime updaters per desktop: Sparkle 2 for the `.app` (macOS), Velopack for Windows/Linux (decision scored per RULES section 4 first) | L | Runtime kind only. |
| 6 | Android: payload store in app-private storage, runtime APK via `PackageInstaller` (prompt on API 25; root `pm install -r` path for the Nexus 7 as a developer helper) | M | Cross-platform pass. |
| 7 | ESP32: 2-slot partition table, `esp_https_ota`, app-controlled confirm, signature check in the core | M | One USB reflash needed once. |
| 8 | webOS: self-replacing binary with `.prev` and relaunch (`examples/music`), reuse the cacert already installed | S | Same code path as item 3 on a different directory. |
| 9 | `zinc publish --github`, `zinc serve-updates` (LAN + mDNS), file/SD import | M | Gives makers three hosting choices. |
| 10 | Delta: member-level (S) first, `zstd --patch-from` for runtimes (M) | M | Only after item 5 shows sizes worth saving. |

## 7. Irreversible or outward-facing steps (owner steps)
- Generating and storing the release signing key for the engine (`next/update.pub` is empty) and each official app's seed; losing a seed strands installs (Tauri doc, fetched).
- Creating the TUF root keys and their offline backups for the index (threshold choice).
- Publishing: `zinc publish`, GitHub releases, uploading to S3/itch.io, pushing to the git remote, App Store / TestFlight / Play uploads.
- Buying a Windows code-signing certificate or Azure Artifact Signing (`zinc-windows-port.md:87`), Apple Developer ID and notarization, an Android upload key.
- ESP32 eFuse anti-rollback and secure boot: burning eFuses cannot be undone.
- Deciding whether to ship ZBC logic hot updates in an App Store build (policy risk, 2.5.2).
- The real launchd load of the agent (ZN-729.04 criterion 1) on the development Mac.

## 8. Open questions worth a check before building
- Apple Developer Program License 3.3.2 wording on interpreted code (not re-read).
- Exact `USER_ACTION_NOT_REQUIRED` conditions and Android 14+ restrictions (the fetched page was truncated).
- Whether `zstd --patch-from` decompression fits in the memory of the Nexus 7 and the TouchPad for a runtime-sized file.
- Whether the Nexus 7 app (NativeActivity APK, `docs/reports/zinc-next-android.md`) can load a `.zapp` from app-private storage without a recompile (depends on AOT versus interpreter in that build).
