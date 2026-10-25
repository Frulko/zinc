---
id: ZN-792
title: >-
  Device player and pairing for the consoles and mobiles (Vita, 3DS, PSP,
  Android, webOS, iOS)
status: In Progress
assignee:
  - '@parallel'
created_date: '2026-10-24 23:40'
updated_date: '2026-10-25 00:17'
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
- [ ] #2 mbedTLS trimmed for the console player (targets/console/mbedtls_console.h: EC J-PAKE pairing and TLS 1.3 PSK sessions only), entropy from each console
- [x] #3 The console player: src/agent/player.cpp (polled, single-threaded) and the core's loop: a waiting screen with name, address and pairing code; a received program runs; stop; back to waiting
- [x] #4 zinc device on a player: info, deploy (zinc pack --profile, the members sent), logs, stop, run, shot and screen, zinc dev --device
- [x] #5 tests/t0/console_player.sh passes on the host build: wrong code, pairing, info, deploy, logs, stop, run, exit, shot, zinc dev --device
- [ ] #6 PSP: tools/build-console-core psp --player builds the player; proven in PPSSPP headless or what blocks is written
- [ ] #7 3DS: the player builds and is proven in Azahar, or what blocks is written
- [ ] #8 Vita: the player builds (its own title id); what Vita3K proves is written
- [ ] #9 Player builds shipped to ~/Documents: psp/ZincPlayer/EBOOT.PBP, vita/zinc-player.vpk, 3ds/zinc-player.3dsx
- [ ] #10 Android, webOS, iOS: done, or their state and next step written in the notes
<!-- AC:END -->
