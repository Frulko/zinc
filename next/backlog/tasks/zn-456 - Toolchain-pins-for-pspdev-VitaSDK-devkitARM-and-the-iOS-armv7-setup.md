---
id: ZN-456
title: 'Toolchain pins for pspdev, VitaSDK, devkitARM and the iOS armv7 setup'
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-09 07:37'
updated_date: '2026-10-17 11:16'
labels:
  - handheld
  - handhelds
  - toolchain
  - size-M
milestone: m-23
dependencies:
  - ZN-453
ordinal: 214000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Extend src/tc: zinc toolchain install psp (pspdev v20261001 tarball per host, sha256 pinned), vita (VitaSDK sdk-snapshot tarball, sha256 from SHA256SUMS), n3ds (devkitARM through the official docker image devkitpro/devkitarm pinned by digest, or a local $DEVKITPRO; no pacman in CI per devkitPro), ios-legacy (detect Xcode clang and ld with ld-classic for armv7, ask for an iPhoneOS SDK with armv7 stubs, e.g. from Xcode 13.4.1). Users of the core path never need these.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 zinc toolchain targets lists psp, vita, n3ds, ios-legacy with what each needs
- [x] #2 install verifies the checksum and refuses a tampered archive from a local mirror (T0, like tests/t0/tc.sh)
- [x] #3 psp-g++ --version and arm-vita-eabi-g++ --version report 15.2.0 after install; the n3ds check runs arm-none-eabi-gcc --version in the pinned image
- [x] #4 zinc doctor explains a missing iOS SDK with the Xcode 13.4.1 hint
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-17 (worktree agent, handheld chain). Done; ps2 (ps2dev) added at the owner's request of 2026-10-17 for ZN-753.

What was done: src/tc/consoles.cpp: `zinc toolchain install psp|vita|ps2|n3ds|ios-legacy`. psp: pspdev v20261001, vita: VitaSDK sdk-snapshot-20261015.850.1, ps2: ps2dev v2.0.0, each a prebuilt archive per host (aarch64/x86_64 macOS and Linux) pinned by SHA-256 (GitHub digests; VitaSDK's SHA256SUMS), fetched through the existing fetchTool (mirrors of ZINC_MIRRORS, ZINC_TC_MIRROR as base, checked before unpacking) into ~/.zinc/toolchains/<sdk>-<host>-<version>; $PSPDEV, $VITASDK, $PS2DEV name the user's own (the owner's ~/pspdev is honoured). n3ds: devkitPro's image pinned by digest (docker.io/devkitpro/devkitarm@sha256:116afba8..., tag 20260610) or $DEVKITPRO, no mirror of devkitPro packages. ios-legacy: finds an iPhoneOS SDK whose libSystem.tbd lists armv7 in /Applications/Xcode*.app or $ZINC_IOS_LEGACY_SDK, else explains (Xcode 13.4.1). `zinc toolchain targets` lists the five with what each needs; `zinc doctor` has an info line (ready SDKs, the iPhone 4S hint) and `zinc doctor --details` a section. Licences: third_party/README.md rows (pinned SDKs, not vendored).
Proof: tests/run --only console_sdks PASS (T0: the targets lines, an unknown target refused, a tampered pspdev archive from a file:// mirror refused with its SHA-256 and nothing unpacked, doctor names Xcode 13.4.1 when ZINC_IOS_LEGACY_SDK is not an armv7 SDK). --only tc, mobile_profiles, doctor_friendly, cli_core PASS.
Installed on the development Mac (M1 Pro, arm64): psp-g++ (GCC) 15.2.0 (399 MB), arm-vita-eabi-g++ (GNU Tools for ARM Embedded Processors) 15.2.0 (406 MB), mips64r5900el-ps2-elf-g++ (GCC) 15.2.0 (614 MB, Mach-O arm64); `docker run --rm <pinned image> /opt/devkitpro/devkitARM/bin/arm-none-eabi-gcc --version`: arm-none-eabi-gcc (devkitARM) 16.1.0.

2026-10-17, later (owner request: the 3DS on devkitPro's macOS packages): not possible without sudo. pkg.devkitpro.org answers scripted downloads (curl, any user agent) with a Cloudflare challenge (HTTP 403 "Attention Required"), and devkitPro's macOS installer (devkitpro-pacman-installer.pkg v6.0.2, sha256 da74156211cd3d8664ba7fb95544fbc0a2fbef1dd87b1a6bfafb30d2d446cd30) installs pacman into /opt/devkitpro with sudo. So `zinc toolchain install n3ds` keeps the pinned docker image (devkitARM GCC 16.1.0, libctru, citro3d, citro2d, 3dstools inside it; tools/build-console-core n3ds builds there) and honours $DEVKITPRO for a native install. What the owner runs once for the native toolchain (docs/targets/handhelds.md, "devkitPro natively on macOS"):
  curl -LO https://github.com/devkitPro/pacman/releases/download/v6.0.2/devkitpro-pacman-installer.pkg
  sudo installer -pkg devkitpro-pacman-installer.pkg -target /
  sudo dkp-pacman -Sy && sudo dkp-pacman -S 3ds-dev
  export DEVKITPRO=/opt/devkitpro DEVKITARM=/opt/devkitpro/devkitARM
Proof that the image builds the 3DS core: build/console-n3ds-pure/zinc-core.3dsx printed "hello from zinc on n3ds" in Azahar (ZN-457).
<!-- SECTION:NOTES:END -->
