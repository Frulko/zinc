---
id: ZN-792
title: >-
  Device player and pairing for the consoles and mobiles (Vita, 3DS, PSP,
  Android, webOS, iOS)
status: Review
assignee:
  - '@parallel'
created_date: '2026-10-24 23:40'
updated_date: '2026-10-25 00:45'
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
<!-- SECTION:NOTES:END -->
