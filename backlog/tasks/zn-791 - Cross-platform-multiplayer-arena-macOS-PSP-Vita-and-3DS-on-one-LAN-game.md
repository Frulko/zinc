---
id: ZN-791
title: 'Cross-platform multiplayer arena: macOS, PSP, Vita and 3DS on one LAN game'
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-24 23:40'
updated_date: '2026-10-25 00:28'
labels:
  - network
dependencies: []
ordinal: 525460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A simple fun 3D-looking game (a raycaster arena) that macOS, PSP, Vita and 3DS play together: a Zinc server on the Mac, discovery on the LAN without typing addresses, sockets in the console cores.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Socket layer (commit 1): zinc:lan (plugins/lan), a polled API (no callbacks, no promises) because a console core has no event loop and calls natives with no host API; one file on the native ABI (lan.abi.cpp) is the desktop plugin library and is linked into the console cores (stubs.cpp kModules). zinc:socket kept for the desktop's event-driven uses. Bring-up per console in targets/<console>/net_<console>.cpp behind targets/console/console_net.h (shared with ZN-792). TCP connect/listen/accept/read/write included (cheap). Proven: tests/t0/lan.sh (native, interp, headless console core); UDP echo with a Mac server from PPSSPPHeadless 1.20.4, Azahar 2126.2 and Vita3K. PSP pitfall: libcglue must be linked before pspnet_inet or the sceNetInet NID table interleaves (socket() reaches unknown NIDs in PPSSPP).

Game (commit 2): examples/lan-arena (Paint Arena), a Wolfenstein-style raycaster on zinc:gfx rects (no zinc:3d), one source for macOS, PSP, Vita and 3DS. Decisions: the Mac hosts by default and plays; a client owns its own position (smooth on a 20 Hz link, no prediction code), the host owns shots, hits and scores (one judge of hits; anti-cheat is not a goal on a LAN of friends); discovery is a UDP broadcast 'who hosts?' to the subnet, 255.255.255.255 and 127.0.0.1 (the emulators share the Mac's loopback) instead of mDNS (no mDNS stack on the consoles, a broadcast is 20 lines); manual fallback ARENA_SERVER / --join / zinc:storage 'server'; bots fill an empty arena so it plays solo. Proven: tests/t1/lan_arena.sh (host + client headless on loopback by broadcast, joins, shots reach the host, leave heard; solo 900 frames, interp and native same frame hash); each console in its emulator found and joined a headless Mac host, shot and was hit (PPSSPPHeadless 1.20.4: host saw 223 fires 130 hits; Azahar: 372/204; Vita3K: 403/220). Frame work (ZINC_PROFILE, emulator time, not hardware): PSP p50 10.72 p99 14.87 ms; 3DS p50 5.43 p99 6.37 ms; Vita p50 1.50 p99 2.82 ms. Not proven: real hardware on a real Wi-Fi (the PSP's WPA limits, a router blocking client broadcasts: the manual address covers it). Later: mDNS answer on the desktop for other tools; client-side interpolation of the others between snapshots; the tests/run duo uses env -u ZINC_DETERMINISTIC (real clock).
<!-- SECTION:NOTES:END -->
