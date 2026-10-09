---
id: ZN-538
title: >-
  ZN_WEBGL_PROFILE=vc4: the Pi 3B+ capability table enforced in libzn_webgl on
  any host
status: Backlog
assignee: []
created_date: '2026-10-09 07:45'
labels:
  - rpi
  - 3d
  - size-M
milestone: m-25
dependencies:
  - ZN-203.06
ordinal: 340040
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A profile that clamps limits and hides extensions to the VC4 values measured on the rig: GLES2, no OES_standard_derivatives, no EXT_shader_texture_lod, no float textures, no native instancing, 8 varyings, 8 attributes, 2048 textures, 16-bit indices unless emulated, 4x MSAA. WebGL1 programs and three r162 then fail or fall back on macOS and llvmpipe exactly as on a Pi. (From docs/reports/hardware/raspberry-pi-threejs-and-sdk.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 getSupportedExtensions and getParameter under the profile equal the Pi 3B+ snapshot
- [ ] #2 a shader using dFdx fails to compile under the profile on macOS
- [ ] #3 WebGL1 conformance under the profile has no new failures except listed pages that need hidden extensions
<!-- AC:END -->
