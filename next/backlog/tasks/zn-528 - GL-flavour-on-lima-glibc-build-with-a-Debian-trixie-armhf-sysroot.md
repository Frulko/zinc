---
id: ZN-528
title: 'GL flavour on lima: glibc build with a Debian trixie armhf sysroot'
status: Backlog
assignee: []
created_date: '2026-10-09 07:41'
labels:
  - chip
milestone: m-24
dependencies:
  - ZN-522
  - ZN-132
ordinal: 320160
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A dynamic armv7 glibc flavour (arm-linux-gnueabihf.2.36, cortex_a8+neon) linked against a checksummed Debian trixie armhf sysroot (libdrm, libgbm, libEGL, libGLESv2, SDL3 with KMSDRM) for display-gl and libzn_webgl; an EGL-on-GBM context without SDL3 for the offscreen WebGL module if SDL3 is not wanted; record lima capabilities (ZINC_GL_INFO=1) and add the fragment-highp-is-FP16 quirk to the GL caps. (From docs/reports/hardware/ntc-chip.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 display-gl runs on lima at the panel refresh with the UI overlay on a PocketCHIP
- [ ] #2 the same binary runs in the CHIP-03 guest on vkms with Mesa llvmpipe through kms_swrast
- [ ] #3 the lima capability table is in docs/plugins/display-gl.md
- [ ] #4 the static armv7-linux flavour is unchanged
<!-- AC:END -->
