---
id: ZN-791
title: 'Cross-platform multiplayer arena: macOS, PSP, Vita and 3DS on one LAN game'
status: In Progress
assignee:
  - '@parallel'
created_date: '2026-10-24 23:40'
updated_date: '2026-10-25 00:08'
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
<!-- SECTION:NOTES:END -->
