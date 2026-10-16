---
id: ZN-629
title: 'Packaging and signing for ios and android: IPA, AAB, dry-run'
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-10 14:08'
updated_date: '2026-10-16 23:03'
labels:
  - mobile
  - size-M
milestone: m-26
dependencies:
  - ZN-622
  - ZN-624
ordinal: 201000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`zinc export --target ios --ipa` (archive, exportArchive with a provisioning profile), `--target android --aab` (bundleRelease, upload key), the 16 KB alignment check, `PrivacyInfo.xcprivacy`; `--dry-run` prints every command as `tools/sign-macos` does (From the spike ZN-372, docs/reports/zinc-next-mobile-spike.md, D59.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 the dry-run output is tested on the desktop
- [x] #2 a debug IPA installs on the simulator and a debug APK on the emulator
- [x] #3 the upload commands are in the task notes for the owner (paid accounts: that step is parked)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
What it does (src/cli_core.cpp Pack, step, checkPages, packAndroid, packIos; zinc.json signing.android/ios in src/frontend/project.cpp; plugin.json targets.ios.privacy in src/frontend/plugin_manifest.cpp):
- `zinc export --target android --aab`: the Gradle project, then `./gradlew bundleRelease` with the upload key (path and alias from ZINC_ANDROID_KEYSTORE / ZINC_ANDROID_KEY_ALIAS or zinc.json signing.android {keystore, alias}, passed as -Pzinc.keystore/-Pzinc.keyAlias; passwords only from ZINC_ANDROID_STORE_PASSWORD / ZINC_ANDROID_KEY_PASSWORD, read by Gradle's signingConfigs.upload; zinc.json refuses a password key); without a key the debug keystore, said so (Play refuses it). Then the 16 KB check: unzip base/lib/*.so, each ELF's LOAD p_align read in C++; a 64-bit library below 16 KB fails, a 32-bit one is reported.
- `--apk [--abis list]`: assembleDebug, `zipalign -c -P 16 4` (newest build-tools), the same ELF check.
- `--target ios --ipa`: cmake -G Xcode (build-device, -DZINC_TEAM, -DZINC_PROFILE for manual signing), xcodebuild archive, xcodebuild -exportArchive with ExportOptions.plist (written by every iOS export from signing.ios {team, method, profile}; team also ZINC_IOS_TEAM; methods app-store-connect (default), release-testing, debugging, enterprise; old names app-store, ad-hoc, development mapped; method names checked against `xcodebuild -help`, Xcode 26.3). Without a team a real run stops before any tool.
- `--ipa --simulator`: cmake for iphonesimulator, xcodebuild Debug CODE_SIGNING_ALLOWED=NO, `ditto -c -k --keepParent` to <name>-simulator.zip.
- `--dry-run`: prints every command as `+ cmd` (tools/sign-macos's form) and runs none; the project is still written.
- PrivacyInfo.xcprivacy in every iOS project and bundle: no tracking, no data collected; FileTimestamp C617.1, SystemBootTime 35F9.1, DiskSpace E174.1 (nm -u: hello calls stat, fstat, mach_absolute_time; the engine archives add lstat, statfs via uv_fs_statfs; NSUserDefaults only in SDL code under #if 0), plus each plugin's targets.ios.privacy, merged.
- No JAVA_HOME: Android Studio's JDK (Gradle 8.14 does not run on Homebrew's JDK 26).

Proof:
- T0 `tests/t0/export_packages.sh` (new): every dry-run output (aab with and without a key, key from env and from zinc.json, password refused, apk, ipa with and without a team, signing.ios manual profile and old method name, bad method refused, ipa --simulator, privacy manifest of the engine and a plugin's merged, option checks); every Android and Apple tool is a trap on the PATH, no build directory appears, no password in the output nor the project. PASS. export_android, export_ios (goldens rewritten: build.gradle, README-zinc.txt, CMakeLists.txt, ExportOptions.plist, PrivacyInfo.xcprivacy), mobile_profiles, plugin_manifest PASS; app_library PASS against the main tree's zn_app (BUILD=main build; zn_app not touched).
- Android emulator (AVD Pixel_10, API 37 arm64, headless, -s emulator-5554; the Nexus 7 not used, shut down after): `--apk --abis arm64-v8a` for hello in 58 s; libmain.so LOAD 0x4000 (zinc and llvm-readelf -lW agree), zipalign -c -P 16 passed; installed, launched (am start -W ok), logcat equals zinc run (29 lines). `--aab` with a throwaway upload key in /tmp: 55 s, keytool -printcert -jarfile names that key, bundletool 1.18.3 build-apks --connected-device + install-apks installed the release (not debuggable), logcat equals zinc run. No password in the project.
- iOS 26.3 simulator (an iPhone 17 Pro created for the run, deleted after; no Simulator.app): `--ipa --simulator` for hello in 259 s; the zip unpacked, installed, launched --console-pty: output equals zinc run (29 lines); PrivacyInfo.xcprivacy in the bundle, plutil -lint OK. All outputs and DerivedData were in /tmp and deleted.
- Not proven: the ELF check's failure path on a real 4 KB library (no zinc entry point takes an arbitrary package; the reader agrees with llvm-readelf on the pass case), a device archive and IPA (needs the owner's Apple team), an upload.

Owner's steps (paid accounts; parked until the owner does them):
Android (Google Play Console, 25 USD once):
  keytool -genkeypair -v -keystore ~/keys/upload.jks -alias upload -keyalg RSA -keysize 4096 -validity 10000      # once, kept outside the project and backed up
  ZINC_ANDROID_KEYSTORE=~/keys/upload.jks ZINC_ANDROID_KEY_ALIAS=upload ZINC_ANDROID_STORE_PASSWORD=... ZINC_ANDROID_KEY_PASSWORD=... zinc export examples/rn-showcase --target android --aab
  bundletool build-apks --bundle=dist/rn-showcase-android/app/build/outputs/bundle/release/app-release.aab --output=app.apks --connected-device --ks=~/keys/upload.jks --ks-key-alias=upload --ks-pass=pass:"$ZINC_ANDROID_STORE_PASSWORD" && bundletool install-apks --apks=app.apks   # try it as Play splits it
  Play Console: create the app, enrol in Play App Signing (default for new apps; Google keeps the app signing key, the upload key above is registered by the first upload), Test and release > Internal testing > Create release > upload app-release.aab. No official CLI uploads: for CI, the Google Play Developer API (edits.bundles.upload) through `fastlane supply --aab app-release.aab --track internal --json_key play-service-account.json` or the gradle-play-publisher plugin. A lost upload key is reset from the Play Console (Setup > App signing > Request upload key reset).
iOS (Apple Developer Program, 99 USD a year):
  Xcode > Settings > Accounts: add the Apple ID (automatic signing then makes the certificates and profiles with -allowProvisioningUpdates)
  ZINC_IOS_TEAM=<team id> zinc export examples/rn-showcase --target ios --ipa            # zinc.json "signing": {"ios": {"team": "...", "method": "app-store-connect"}} instead of the variable
  App Store Connect: create the app record (bundle id = zinc.json app.id), then an API key (Users and Access > Integrations > App Store Connect API), AuthKey_<id>.p8 in ~/.appstoreconnect/private_keys:
  xcrun altool --validate-app -f dist/rn-showcase-ios/build-device/ipa/rn-showcase.ipa -t ios --api-key <key id> --api-issuer <issuer id>
  xcrun altool --upload-app -f dist/rn-showcase-ios/build-device/ipa/rn-showcase.ipa -t ios --api-key <key id> --api-issuer <issuer id>
  (or Transporter.app, or ExportOptions.plist "destination": "upload" to let xcodebuild -exportArchive upload). TestFlight then lists the build after processing. Ad hoc: "method": "release-testing" with the devices registered in the account.

Decision (for the coordinator to number): Phone packages from zinc export (ZN-629). `--aab`, `--apk`, `--ipa [--simulator]` run the platform's own builders (Gradle, xcodebuild) in the exported project and check the result; `--dry-run` prints the commands (tools/sign-macos's form). Signing secrets never enter the project: the Android upload key's path and alias from the environment or zinc.json, its passwords from the environment only, read by Gradle at build time (zinc.json refuses a password); without a key the debug keystore for local tests. iOS: ExportOptions.plist from zinc.json signing.ios (team, Xcode 15.3's method names with the old ones mapped, automatic signing or a named profile). The 16 KB check reads the ELF program headers of every packaged 64-bit library itself (plus zipalign -c -P 16 for an APK) rather than trusting the link flags, since a plugin's prebuilt library may not be linked so. PrivacyInfo.xcprivacy from a table of the engine's required-reason APIs verified with nm -u, plus the plugins' targets.ios.privacy. Options scored (RULES 4): export runs the builders + checks 63; print the commands only and let the user run them 50 (no check, more steps for a first-time maker); a fastlane lane 41 (Ruby, another toolchain). Revisit if Play or Apple add a check zinc can make locally (bundletool validate, altool --validate-app in --ipa), or if an upload command (Play Developer API) is wanted in zinc publish.

later.md lines:
- ZN-629: `zinc publish --play` / `--app-store`: upload the AAB through the Play Developer API (a service account) and the IPA through altool with an API key, so a release is one command after the owner's accounts exist
- ZN-629: zinc.json targets.ios.privacy for the app's own required-reason uses, and NSPrivacyCollectedDataTypes when zinc.json "crash" reports leave the device
- ZN-629: a T0 case for the 16 KB check's failure path (a 4 KB-aligned .so in a package), behind a `zinc export --check-pages <package>` or a unit test of elfLoadAlign
- ZN-629: Cross-platform pass: --aab and --apk on Linux (unzip and the JDK lookup at /opt/android-studio/jbr) and an IPA archive on a device with the owner's team
<!-- SECTION:NOTES:END -->
