---
id: ZN-164
title: Host library split and size gates for Pi 1 and ESP32
status: Backlog
assignee: []
created_date: '2026-10-07 05:33'
labels:
  - host-modules
  - size-M
dependencies: []
ordinal: 102000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Since ZN-082..090 the host library (zn_host_gfx) links libuv, llhttp, mbedTLS (+755 KB stripped) and libregexp, and sys_host.cpp references all of them: an AOT program that uses any host module pays for all. Split the host rows into separately linked parts (process/loop, net+tls, sockets, regexp, crypto, osc, mqtt) so a program links only what it uses; build and measure an AOT hello and a UI program for armv6 (Pi 1, zig) and the ESP32 firmware before/after; add a size gate per target to the tests (budget recorded in docs/reports/zinc-next-packaging.md); check that the appended runtime rows do not break firmware/ build. ZN_TLS=OFF exists; add the same switch for libuv-dependent parts where the target has no POSIX sockets.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 AOT hello for armv6 and the ESP32 firmware build, sizes recorded before/after in docs/reports/zinc-next-packaging.md
- [ ] #2 a program that uses no network links no mbedTLS, libuv sockets or llhttp (size gate in tests)
<!-- AC:END -->
