---
id: ZN-792
title: >-
  Device player and pairing for the consoles and mobiles (Vita, 3DS, PSP,
  Android, webOS, iOS)
status: Review
assignee:
  - '@parallel'
created_date: '2026-10-24 23:40'
updated_date: '2026-10-25 01:10'
labels:
  - network
dependencies: []
ordinal: 526460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A player like the Pi's zinc agent: the device pairs with a workstation and zinc device deploy or zinc dev --device runs a project there, for the PSP, Vita, 3DS first, then Android, webOS and iOS.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The agent's session code builds for the consoles: src/agent/chan.cpp (sockets, TLS, frames, JSON) split from wire.cpp (files); the desktop agent unchanged (agent tests pass)
- [x] #2 mbedTLS trimmed for the console player (targets/console/mbedtls_console.h: EC J-PAKE pairing and TLS 1.3 PSK sessions only), entropy from each console
- [x] #3 The console player: src/agent/player.cpp (polled, single-threaded) and the core's loop: a waiting screen with name, address and pairing code; a received program runs; stop; back to waiting
- [x] #4 zinc device on a player: info, deploy (zinc pack --profile, the members sent), logs, stop, run, shot and screen, zinc dev --device
- [x] #5 tests/t0/console_player.sh passes on the host build: wrong code, pairing, info, deploy, logs, stop, run, exit, shot, zinc dev --device
- [x] #6 PSP: tools/build-console-core psp --player builds the player; proven in PPSSPP headless or what blocks is written
- [x] #7 3DS: the player builds and is proven in Azahar, or what blocks is written
- [x] #8 Vita: the player builds (its own title id); what Vita3K proves is written
- [x] #9 Player builds shipped to ~/Documents: psp/ZincPlayer/EBOOT.PBP, vita/zinc-player.vpk, 3ds/zinc-player.3dsx
- [x] #10 Android, webOS, iOS: done, or their state and next step written in the notes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-25: consoles wired: hal_poll_input of the PSP, Vita and 3DS polls the player (weak zn_player_poll); entropy per console (player_psp.cpp SHA-256 pool of clock jitter + seed file, no user-mode KIRK; Vita sceKernelGetRandomNumber; 3DS PS_GenerateRandomBytes); mbedtls_ms_time from the HAL clock; poll() over select on the PSP and SO_NONBLOCK on PSP/Vita (src/platform/socket.h). tools/build-console-core --player (title Zinc Player, id ZNPL00001, build/console-<c>-player). PSP player builds: EBOOT.PBP 2.64 MB.

2026-10-25 emulators (players built with ZN-791's 563649ba applied uncommitted, fixed code): pair, info, deploy hello (lines equal zinc run --profile), deploy bouncing-ball, shot PNG, stop, deploy again pass in PPSSPPHeadless 1.20.4 (tests/t1/console_player_psp.sh, skips 77 without targets/psp/net_psp.cpp), Azahar (lockf) and Vita3K by hand. Pairing incl. client process: PPSSPP 0.14 s, Azahar 1.09 s, Vita3K 0.19 s. Size added (text): PSP +258 KB, Vita +154 KB; .3dsx 1.22 -> 1.57 MB. Fixes found there: PSP accept() needs an address (EFAULT on null); a stop flag only while a program runs (the waiting screen quit the player); app.name kept (PSP FAT capitals). Shipped (with ZN-791's network): ~/Documents/psp/ZincPlayer/EBOOT.PBP, ~/Documents/vita/zinc-player.vpk (ZNPL00001), ~/Documents/3ds/zinc-player.3dsx. Owner: start Zinc Player on the console, read address and code, then zinc device pair <address> <code>; zinc device deploy <project>; zinc dev <project> --device <name>. Not done: discovery (pair by address), real consoles, PSP KIRK entropy PRX. Android/webOS/iOS (steps 8-10 of docs/reports/device-player-consoles-mobiles.md) not started: next is Zinc Go's agent mode on Android (src/app/player.cpp linking src/agent/player.cpp, the MulticastLock, adb forward test), then the armv7-webos runtime with the real agent, then iOS simulator.

2026-10-25 (night): Android done (step 8). Zinc Go's device mode in src/app/player.cpp: src/agent/player.cpp polled from the tick (on by default on a phone, on a desktop with ZINC_PLAYER_PORT), files in SDL_GetPrefPath, the home screen shows name, address, code (--device/--address/--code/--paired args; 'Pair another computer' opens zinc://pair = new code), received program.zbc + resources.bin + packs/ started with appStart, lines to the log (appFinish now flushes the last lines and the error through the console tap; zinc:sys exit(n) gives status n under gExitEndsRun), stop = back home, shot = capture_png; mDNS announce through src/net/dnssd.cpp with the Wi-Fi MulticastLock (ZincActivity.zincMulticast, CHANGE_WIFI_MULTICAST_STATE added to a player's manifest); the export writes zn_player_plugins (info.plugins). Fixed: deployPlayer read the target of native/<target>/<plugin>/ as the plugin name. tests/t1/zinc_go_device.sh (desktop player, loopback: wrong code, pair, info, hello = zinc run --profile macos, ticker logs/stop/run, exit 3, shot PNG, zinc dev --device) passes; zinc_go, app_library (its symbol check narrowed to zn_player_modules: hal_null's zn_player_poll is the consoles'), console_player pass. Proven on the Nexus 7 (LOS 14.1, armeabi-v7a APK from zinc export examples/zinc-go --target android --apk --abis armeabi-v7a): pair through adb forward 127.0.0.1:7733, info (asus Nexus 7, player android, 10 plugins), deploy hello (29 lines identical to zinc run --interp --profile android), deploy rn-showcase (2 MiB, shot shows its Home), stop back to the home screen, a second workstation paired over Wi-Fi at 192.168.2.146 with the new code, deploy bouncing-ball + shot, zinc dev --device (v2 285 ms after the save), zinc device list finds android-ed6b over mDNS. Not proven: an Android emulator (only an arm64 image, unused), a phone on another Wi-Fi.
<!-- SECTION:NOTES:END -->
