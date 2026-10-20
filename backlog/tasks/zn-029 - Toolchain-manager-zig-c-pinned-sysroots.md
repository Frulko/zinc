---
id: ZN-029
title: 'Toolchain manager (`zig c++`, pinned sysroots)'
status: Done
assignee: []
created_date: '2026-10-05 14:22'
updated_date: '2026-10-06 16:22'
labels:
  - size-L
milestone: m-6
dependencies: []
ordinal: 29000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
As a **Device user**, I want toolchains downloaded on demand and verified, so that I never install them by hand.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 AOT build for aarch64 Linux works on a clean macOS machine without Docker; downloads are checksum-verified.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. Done: src/tc (pinned zig 0.15.2, curl download, SHA-256 against the pin before unpacking, vendored public-domain sha256), zinc toolchain install|path|targets|sha256, zinc build --target aarch64-linux|armhf-linux|x86_64-linux|aarch64-macos|x86_64-macos. Verified: on a clean ZINC_HOME the download is checked and fib builds for aarch64 Linux in about 20 s; the ELF is AArch64 and ran in an arm64 container (Docker only to run it). T0 tc.sh (test vector, tampered archive refused), T2 cross.sh. docs/reports/zinc-next-toolchain.md. Not covered: Windows, musl, graphics host for a target, packaging of the engine sources (ZN-031).
<!-- SECTION:NOTES:END -->
