---
id: ZN-456
title: 'Toolchain pins for pspdev, VitaSDK, devkitARM and the iOS armv7 setup'
status: Backlog
assignee: []
created_date: '2026-10-09 07:37'
labels:
  - handheld
  - handhelds
  - toolchain
  - size-M
milestone: m-23
dependencies:
  - ZN-453
ordinal: 300030
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Extend src/tc: zinc toolchain install psp (pspdev v20261001 tarball per host, sha256 pinned), vita (VitaSDK sdk-snapshot tarball, sha256 from SHA256SUMS), n3ds (devkitARM through the official docker image devkitpro/devkitarm pinned by digest, or a local $DEVKITPRO; no pacman in CI per devkitPro), ios-legacy (detect Xcode clang and ld with ld-classic for armv7, ask for an iPhoneOS SDK with armv7 stubs, e.g. from Xcode 13.4.1). Users of the core path never need these.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 zinc toolchain targets lists psp, vita, n3ds, ios-legacy with what each needs
- [ ] #2 install verifies the checksum and refuses a tampered archive from a local mirror (T0, like tests/t0/tc.sh)
- [ ] #3 psp-g++ --version and arm-vita-eabi-g++ --version report 15.2.0 after install; the n3ds check runs arm-none-eabi-gcc --version in the pinned image
- [ ] #4 zinc doctor explains a missing iOS SDK with the Xcode 13.4.1 hint
<!-- AC:END -->
