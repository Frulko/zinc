# Zinc on an iPad Pro 12.9" 1st gen (iPad6,7, iPadOS 16.7.16): bring-up route

Date 2026-10-18. Mac: Intel, macOS 15, Xcode 26.3. Device UDID `0247505c1eb56e90ee6c036e035dad9f6dc56057` ("iPad de Guillaume").
Legend: **verified** = ran here, read-only; **owner** = needs the owner's account or consent; **untested** = reasoned from docs/source.

## Summary

Xcode 26.3's CoreDevice (`devicectl`) refuses iOS 16 devices, but the old lockdown/usbmux stack still works, and **everything needed is already on this Mac and on the iPad**:

- pymobiledevice3 11.34.1 (installed in the isolated venv, Python 3.9) sees the iPad over USB, is paired with it (lockdown answers), `amfi developer-mode-status` = **true**, a Developer disk image is **already mounted** (`/Developer`, hfs), DVT works (`developer dvt device-information`, `proclist` returned data), `syslog live` streams, `apps list` returns 172 apps.
- Xcode's cache already holds seven development profiles of team QY259SN7XP, **all containing this iPad's UDID**, valid to 2027, signed for the one Apple Development cert in the keychain (SHA-1 0B80941303585868806CA25ADC0EBDCA7AE43778). Three are Zinc apps: `dev.zinc.rn-showcase`, `dev.zinc.museumtable`, `dev.zinc.music` (explicit app ids, get-task-allow true). None covers `dev.zinc.bench.scriptbridge`, and none is a wildcard.
- So: build with **manual signing against an existing profile** (no Apple server contact), install with `pymobiledevice3 apps install`, launch and read stdout with `developer dvt launch`. xtool is not needed and would touch the account.

Recommended route: (a) existing profile + pymobiledevice3. Cost: the bench app must carry the bundle id of one of the three installed Zinc apps (all three are on the iPad now, so the install replaces that app's binary; its data container is kept). Alternative (b) keeps `dev.zinc.bench.scriptbridge` but registers an App ID on the owner's account: owner step.

## 1. xtool (https://github.com/xtool-org/xtool, release 1.22.2, 2026-10-14)

Read from docs and source only; nothing was installed or run (not verified).
- macOS: needs Xcode (iOS SDK, Swift). Install `brew install xtool-org/tap/xtool` or the `xtool.app.zip` asset of the release (assets: `xtool.app.zip`, Linux AppImages x86_64/aarch64; the arch of the macOS zip is not stated, so Intel support is unconfirmed; the brew tap builds locally). Docs: https://github.com/xtool-org/xtool/blob/main/Documentation/xtool.docc/Installation-macOS.md
- `xtool setup` / `xtool auth` login modes: API key (paid program, Team key with App Manager role) or Apple ID password + 2FA ("works with any Apple ID but uses private APIs", i.e. free accounts too; the docs suggest a throwaway Apple ID).
- Commands (source `Sources/XToolSupport`): `install <path>` ("a custom app/ipa", so a prebuilt .ipa/.app is accepted, not only SwiftPM), `launch <bundleID> [args]`, `uninstall`, `devices`, `dev` (SwiftPM build+run), `ds` (Developer Services). `install` goes through `IntegratedInstaller` with the saved auth token: it re-signs with a certificate/profile it obtains from Apple Developer Services, so it **registers the device and creates certificate/App ID/profile on the account**, ignoring the profiles we already have. `configureDevice: false` in `install`, so it does not itself toggle Developer Mode.
- `launch` starts the app through `debugserver` (needs the DDI) and detaches (`D`); it prints no console output. Whether it works on iOS 16.7 was not checked in the source or issues.
- Verdict: not suitable under the "no account mutation" constraint; keep as fallback only after the owner accepts registering the device/App ID.

## 2. pymobiledevice3 / libimobiledevice

- libimobiledevice tools (`ideviceinstaller`, `idevicesyslog`, `ios-deploy`) are **not installed** (`which` empty). Not installed (brew builds from source on this Mac). Not needed.
- pymobiledevice3 (https://github.com/doronz88/pymobiledevice3, `pip install` in `.../scratchpad/ipad/venv`, Python >=3.9 ok). Verified read-only against the iPad:
  - `usbmux list`: iPad listed twice (USB and Network), iOS 16.7.16, build 20H392; the iPhone is also listed (not touched).
  - `lockdown info --udid ...`: ActivationState Activated, PasswordProtected false, HostAttached true (pairing/trust OK).
  - `amfi developer-mode-status`: `true`. (iOS 16 needs Developer Mode on for development-signed apps; it is on.)
  - `mounter list`: DiskImageType Developer, IsMounted true. iOS 16 uses the old per-version image, no personalised DDI needed (that is iOS 17+); nothing to download, and Xcode 26 is not involved. (If it were ever unmounted: `pymobiledevice3 mounter auto-mount`, which downloads from the project's DDI repo; not run.)
  - `developer dvt device-information` and `proclist`: worked (DVT over lockdown, no tunnel; the iOS 17 RSD/tunnel options are irrelevant on iOS 16). `syslog live`: streamed os_log lines.
  - `apps list`: 172 apps, including `dev.zinc.museumtable`, `dev.zinc.music`, `dev.zinc.rn-showcase`.
- Not run (they change the device): `apps install <.ipa|.app>` (the install command accepts .ipa/.app), `developer dvt launch <bundle id> --kill-existing [--stream] [--env K=V]`. By the docs, launch over DVT delivers the app's stdout/stderr with `--stream` (stdout of `console.log`: untested); `syslog live` filtered with `--match`/grep is the fallback.
- `pymobiledevice3 usbmux forward SRC DST` forwards Mac port -> device port only. It cannot give the app a path to a server on the Mac, so it is not the answer for the POST idea; use the LAN.
- Signature check on install: iOS verifies the profile (UDID, cert, entitlements) at install, nothing else is needed from Apple.

## 3. Benchmark results without console access (optional)

Console route (2) already gives the BENCH lines, so this is a fallback.
- The bench (`next/tests/bench/script_bridge/src/main.ts`) only `console.log`s; **no POST exists yet** (small addition needed, untested): after `BENCH_DONE`, `fetch('http://<mac-ip>:8000/', {method:'POST', body})` with the lines collected.
- ATS: Zinc's `zinc:http` (`next/src/host/http.cpp`) is libuv TCP + mbedTLS and accepts `http://` itself, never NSURLSession, so **App Transport Security does not apply and no NSAppTransportSecurity key is needed** (grep for NSURLSession/NSAppTransport in next/src/host: none). The one iOS gate is Local Network privacy (iOS 14+) for a private IP: the first connection asks the user on the iPad. zinc.json key: `"permissions": ["net"]` which the iOS export writes as `NSLocalNetworkUsageDescription` ("<name> talks to devices on your network."), see `next/src/cli_core.cpp` exportIos. Arbitrary Info.plist keys have no zinc.json field; only plugins add them (`plugin.json` `targets.ios.plist`, docs/plugins.md), so an ATS exception, if ever needed, is not available from zinc.json.
- Mac side: `python3 -m http.server` handles GET only; use a 6-line `BaseHTTPRequestHandler` with `do_POST` that prints the body (not written, trivial). Listen on 0.0.0.0, the Mac firewall may prompt.

## 4. Signing without account mutation

Verified read-only (`security cms -D -i`):
- `~/Library/MobileDevice/Provisioning Profiles`: does not exist.
- `~/Library/Developer/Xcode/UserData/Provisioning Profiles`: 7 profiles "iOS Team Provisioning Profile: <id>", team QY259SN7XP, 7 devices each, **iPad UDID present in all 7**, expiry 2027-04..2027-10, platform iOS/xrOS/visionOS, entitlements: application-identifier `QY259SN7XP.<id>`, keychain-access-groups `QY259SN7XP.*`, get-task-allow true. App id patterns (all explicit, no wildcard): `fr.frulko.bambuddy.companion`, `...companion.widgets`, `fr.myrole.bambuddy.companion.widgets`, `fr.f.bambuddy.companion.widgets`, `dev.zinc.rn-showcase`, `dev.zinc.museumtable`, `dev.zinc.music`.
- `security find-identity -v -p codesigning`: one valid identity, `Apple Development: Guillaume DUMOULIN (KCKN3SBXD3)`, valid until 2027-04-26; it is the cert inside the Zinc profiles.
- Caveat: entitlements of a Zinc app must stay within those of the profile (no push, iCloud, app groups, etc.). The bench needs none.

**Route (a), existing profile, no Apple contact (recommended).** Use the bundle id of an existing profile, e.g. `dev.zinc.music`. Work on a copy so the repo is untouched:
```sh
B=/private/tmp/claude-501/-Users-mowmow-Lab-zinc/478464c2-2117-48b5-9bff-460ea5fb5b17/scratchpad/ipad
cp -R /Users/mowmow/Lab/zinc/next/tests/bench/script_bridge $B/proj
sed -i '' 's/dev.zinc.bench.scriptbridge/dev.zinc.music/' $B/proj/zinc.json     # + "permissions": ["net"] only for the POST fallback
/Users/mowmow/Lab/zinc/next/build/zinc export $B/proj --target ios -o $B/out       # project only, no --ipa (--ipa adds -allowProvisioningUpdates)
cd $B/out
cmake -S . -B build-device -G Xcode -DCMAKE_SYSTEM_NAME=iOS -DZINC_TEAM=QY259SN7XP -DZINC_PROFILE="iOS Team Provisioning Profile: dev.zinc.music"
xcodebuild -quiet -project build-device/script_bridge.xcodeproj -scheme script_bridge -configuration Release -sdk iphoneos \
  -derivedDataPath build-device/dd CODE_SIGN_STYLE=Manual CODE_SIGN_IDENTITY="Apple Development" build     # no -allowProvisioningUpdates
```
The generated CMake defaults the manual identity to "Apple Distribution" (`next/src/cli_core.cpp` ~1629, `Apple Development` only for method `debugging`), hence the command-line override. If xcodebuild does not find the profile by name in `UserData`, copy it to `~/Library/MobileDevice/Provisioning Profiles/<UUID>.mobileprovision` (UUID of `dev.zinc.music`: `8cbac47b-8325-4279-828e-1417dd11366a`) or pass `PROVISIONING_PROFILE=<UUID>`. Untested: no device build was made (the instructions said not to build if signing was needed; this route needs only local files, but I stopped before the multi-minute engine build).

**Route (b), automatic provisioning: OWNER STEP, not run.** It registers the iPad and creates the App ID `dev.zinc.bench.scriptbridge` (and may refresh certs/profiles) on the owner's Apple account:
```sh
cd $B/out   # project with the original bundle id
xcodebuild -project build-device/script_bridge.xcodeproj -scheme script_bridge -configuration Release -sdk iphoneos \
  -derivedDataPath build-device/dd -allowProvisioningUpdates -allowProvisioningDeviceRegistration DEVELOPMENT_TEAM=QY259SN7XP build
```
(`zinc export <dir> --target ios --ipa` with `ZINC_IOS_TEAM=QY259SN7XP` prints the equivalent archive and export commands, with `-allowProvisioningUpdates`; its `ExportOptions.plist` uses method app-store-connect unless `signing.ios.method` is `debugging`. Xcode would also need the owner logged in under Settings > Accounts.)

## 5. End-to-end commands for next/tests/bench/script_bridge (route a)

| # | Step | Status |
|---|---|---|
| 1 | `pymobiledevice3 usbmux list`, `lockdown info`, `amfi developer-mode-status`, `mounter list` | ran/verified here |
| 2 | Copy project, set `app.id` to `dev.zinc.music` (zinc.json `"app": {"id": ...}`) | untested (trivial) |
| 3 | `zinc export $B/proj --target ios -o $B/out --ipa --dry-run` shows the plan; generates Info.plist, CMakeLists (ZINC_TEAM/ZINC_PROFILE), ExportOptions.plist | ran/verified here (with `ZINC_IOS_TEAM=QY259SN7XP`, id unchanged; output in `$B/out`) |
| 4 | `zinc export ... -o $B/out` (no --ipa), `cmake ... -DZINC_PROFILE=...` | untested |
| 5 | `xcodebuild ... CODE_SIGN_IDENTITY="Apple Development" build` (Release, iphoneos, arm64, min iOS 16.3) | untested (engine build for iOS: several minutes; the device slice never built before) |
| 6 | `codesign -dvv build-device/dd/Build/Products/Release-iphoneos/script_bridge.app` and `security cms -D -i .../embedded.mobileprovision` to check id/UDID | untested |
| 7 | `pymobiledevice3 apps install .../script_bridge.app --udid 0247505c...` (replaces the installed `dev.zinc.music`) | owner consent (changes the iPad); untested |
| 8 | `pymobiledevice3 developer dvt launch dev.zinc.music --kill-existing --stream --udid ... \| tee bench.log` (fallback: `syslog live`) | untested |
| 9 | `ZINC` tooling: `tools/bench-bridge ingest ios-ipad6-7 "iPad Pro 12.9 1st gen" bench.log` | untested (existing subcommand, parses BENCH lines) |
| 10 | If stdout does not come back: add POST of BENCH lines to `http://<mac-ip>:8000/`, `"permissions": ["net"]`, run a `do_POST` server | untested; needs a code change |

Needs the owner: only step 7 consent (it replaces the binary of one of their installed test apps; the other route is (b) with an account change). No login, no `-allowProvisioningUpdates`, nothing touched on the iPhone.

## Sources
- https://github.com/xtool-org/xtool, https://github.com/xtool-org/xtool/releases/latest, Installation-macOS.md, `Sources/XToolSupport/{InstallCommand,LaunchCommand,DevCommand}.swift` (raw.githubusercontent.com)
- https://github.com/doronz88/pymobiledevice3 (README, `pyproject.toml`), https://doronz88.github.io/pymobiledevice3/
- Local: `docs/reports/zinc-next-ios.md`, `next/src/cli_core.cpp` (exportIos, packIos), `next/src/host/http.cpp`, `docs/plugins.md`

## Result (2026-10-18): it runs, on the real iPad

Route (a) was followed with the owner's agreement to replace the app `dev.zinc.rn-showcase` (it was version 0.1.0, build 100; the bench has the same bundle id, version 1.0.0, so the install is an update and keeps the data).
What worked, in order, all without contacting Apple's servers:
1. `zinc export <bench project> --target ios -o out` (no `--ipa`), then `cmake -S out -B out/build-device -G Xcode -DCMAKE_SYSTEM_NAME=iOS -DZINC_TEAM=QY259SN7XP` (231 s the first time).
2. `xcodebuild ... -configuration Release -sdk iphoneos -derivedDataPath ... CODE_SIGN_STYLE=Automatic PROVISIONING_PROFILE_SPECIFIER= DEVELOPMENT_TEAM=QY259SN7XP CODE_SIGN_IDENTITY="Apple Development" build`, without `-allowProvisioningUpdates`.
   Manual signing with the profile's name was refused ("Provisioning profile ... is Xcode managed, but signing settings require a manually managed profile"); automatic signing found the cached Xcode-managed profile by itself.
   The product is `out/build-device/Release-iphoneos/script_bridge.app` (not in the derived-data folder); `codesign -dvv` shows the Apple Development identity, `embedded.mobileprovision` the iPad's UDID and `get-task-allow`.
3. `pymobiledevice3 apps install <app> --udid <UDID>` ("Installation succeed").
4. `pymobiledevice3 developer dvt launch dev.zinc.rn-showcase --kill-existing --udid <UDID>`: the app starts in the foreground (the screen must be on and unlocked).
5. The program's stdout goes to the device's os_log (shell_sdl.cpp), so `pymobiledevice3 syslog live` shows the `BENCH` lines (`dvt launch --stream` printed nothing for them). The whole bench takes 4.7 s on this iPad.
`tools/bench-bridge ios --app-id <id>` does all of it (`ZINC_IOS_TEAM`, `ZINC_PYMD3`, `ZINC_IOS_UDID`) and writes `docs/reports/bench/script-bridge-ios-<model>-ios<version>-arm64.json`.
To put the original app back: build `examples/rn-showcase` the same way (same bundle id, same profile) and `apps install` it.
Not needed after all: xtool, libimobiledevice, any account change.
