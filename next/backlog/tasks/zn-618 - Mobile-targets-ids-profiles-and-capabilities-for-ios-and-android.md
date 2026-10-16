---
id: ZN-618
title: 'Mobile targets: ids, profiles and capabilities for ios and android'
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-10 14:02'
updated_date: '2026-10-16 13:05'
labels:
  - mobile
  - size-S
milestone: m-26
dependencies: []
ordinal: 193000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Rows `ios` and `android` in `targets/capabilities.json` (touch, no desktop keys, `process` and `dynlib` false on iOS); target ids `ios`, `ios-sim`, `android` known to the CLI; `zinc.json` keys `app.id`, version code, orientation, permissions, icon (From the spike ZN-372, docs/reports/zinc-next-mobile-spike.md, D59.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `zinc check --profile ios` and `--profile android` refuse a program that requires `process` or `tray` with the capability message
- [x] #2 `zinc toolchain targets` lists the ids with "needs Xcode" / "needs the Android NDK"
- [x] #3 a T0 test
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done 2026-10-16 (worktree, Android chain).
- targets/capabilities.json: rows android, ios, ios-sim (one line each, as the others): touch true, pointer/keyboard/pen/gamepad optional, net, fs, threads, audio; process false and dynlib false on all three (an app starts no child process and loads no library: D59, docs/reports/zinc-next-mobile-core.md §5; the owner's rule for this port), every desktop key false; gpu gles2 on Android (the lowest device, the Nexus 7 2012, has GLES 2 only), metal on iOS; asset profile etc2|etc1|rgba8 2048 (Android), astc|etc2|rgba8 4096 (iOS), lz4 packs, budgets ram 256MB gpu 128MB boot 16MB. docs/targets/capabilities.md: the two rows and a paragraph.
- src/frontend/profile.cpp: profiles android (360x640, heap 128 MiB), ios and ios-sim (390x844, 256 MiB). The 128 MiB is the heap the Android shell asks for (src/app/shell_sdl.cpp, capped at a quarter of the device's RAM).
- zinc.json: app.versionCode (1..2100000000, the store build number; 0 means derived from version) and app.orientation (portrait, landscape, any); app.id, app.icon and permissions existed.
- src/tc/tc.cpp: appTargets() / findAppTarget(): android (armeabi-v7a, arm64-v8a, x86_64; "needs the Android NDK"), ios ("needs Xcode"), ios-sim; zinc toolchain targets prints them after the zig targets; zinc build --target android says to use zinc export --target android. Kept out of targets() so no zig cross path ever picks them.
- src/main.cpp loadManifestPermissions: zinc.json "requires" is checked against the profile in force in every compile (zinc check and build --profile), not only in zinc run; --force skips it there (zinc run already warns).
Test tests/t0/mobile_profiles.sh (1 s): requires process / tray refused by check --profile android, ios, ios-sim with "requires tray (android has tray false)"; the desktop takes them; a plain program with versionCode and orientation passes; bad orientation and versionCode 0 refused; toolchain targets lines; build --target android message. Also run: project, ui_layout_option, cli_core, permissions, app_library: pass.

Lines for later.md:
- ZN-618: plugins socket, osc, sonos and spotify say "requires": ["net", "process"] where process means "an OS": on android and ios they are refused; their manifests should require net only (sockets work on phones) once ZN-628 gives plugins android/ios entries.
<!-- SECTION:NOTES:END -->
