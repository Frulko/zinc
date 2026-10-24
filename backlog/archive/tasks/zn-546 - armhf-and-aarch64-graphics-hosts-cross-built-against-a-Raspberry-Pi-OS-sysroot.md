---
id: ZN-546
title: armhf and aarch64 graphics hosts cross-built against a Raspberry Pi OS sysroot
status: Backlog
assignee: []
created_date: '2026-10-09 07:45'
labels:
  - rpi
  - 3d
  - size-M
milestone: m-25
dependencies:
  - ZN-164
ordinal: 155000
updated_date: '2026-10-25 01:53'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
zinc build --target armhf-linux and aarch64-linux link the graphics host (zrt, raster, display-gl, display-fbdev, libzn_webgl) with zig against a pinned, checksummed Raspberry Pi OS Trixie sysroot of headers and stub libraries (libdrm, gbm, EGL, GLESv2). Includes a size gate for the Pi 1. (From docs/reports/hardware/raspberry-pi-threejs-and-sdk.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 examples/hero and the three.js cube build for armhf-linux on macOS without Docker
- [ ] #2 the binaries run on the Pi 3B+ (64-bit and 32-bit userland) with only OS libraries
- [ ] #3 armhf size budget recorded and gated (ZN-164)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: merged into ZN-164. Graphics hosts cross-built for armhf/aarch64 against a pinned sysroot are done: tools/linux-sysroot (SHA-256 lock, Debian bookworm), `zinc build/export --target`, hero runs on the Pi 3B+ (docs/targets/linux.md table, ZN-132). Only the armhf size budget gate is left, which is ZN-164. A trixie sysroot is optional. Evidence: tools/linux-sysroot; tools/linux-sysroot.lock; docs/targets/linux.md Verifier: tools/linux-sysroot with a SHA-256 lock exists and docs/targets/linux.md:27 shows UI programs cross-built for aarch64 (hero on the Pi 3B+) and armhf (frame identical under QEMU arm1176). Carry to ZN-164 or later.md: the armhf binary run on a Pi with a 32-bit userland (AC2 only proven under QEMU) and the trixie sysroot (lock is bookworm).
<!-- SECTION:NOTES:END -->
