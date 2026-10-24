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
ordinal: 50300
updated_date: '2026-10-25 01:53'
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: merged ZN-310 here (Sim: Interpreter size diet: libunicode behind a flag, rtcalls `-Os`, size gates per target in CI). Carry over: Interpreter size diet and size gates per target are the same work as ZN-164 (size gates for Pi 1 and ESP32); carry the xtensa 270 KB and 5%-regression script over. ZN-164 is open (Backlog) and holds the per-target size gates; carry over the libunicode build flag, rtcalls -Os, the 270 KB xtensa budget, the 5% regression script and the bench-m4 15% check.
Review 2026-10-25: merged ZN-546 here (armhf and aarch64 graphics hosts cross-built against a Raspberry Pi OS sysroot). Carry over: Graphics hosts cross-built for armhf/aarch64 against a pinned sysroot are done: tools/linux-sysroot (SHA-256 lock, Debian bookworm), `zinc build/export --target`, hero runs on the Pi 3B+ (docs/targets/linux.md table, ZN-132). Only the armhf size budget gate is left, which is ZN-164. A trixie sysroot is optional. tools/linux-sysroot with a SHA-256 lock exists and docs/targets/linux.md:27 shows UI programs cross-built for aarch64 (hero on the Pi 3B+) and armhf (frame identical under QEMU arm1176). Carry to ZN-164 or later.md: the armhf binary run on a Pi with a 32-bit userland (AC2 only proven under QEMU) and the trixie sysroot (lock is bookworm).
<!-- SECTION:NOTES:END -->
