---
id: ZN-536
title: >-
  WebGL straight to the KMS scanout: EGL on display-gl's GBM surface, no
  readback
status: Backlog
assignee: []
created_date: '2026-10-09 07:45'
labels:
  - rpi
  - 3d
  - size-M
milestone: m-25
dependencies:
  - ZN-330
ordinal: 50600
updated_date: '2026-11-07 18:30'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
On Linux KMS, libzn_webgl takes its EGL context and window surface from display-gl (one DRM master, shared EGLDisplay) instead of an SDL3 offscreen context. The WebGL default framebuffer is the scanout surface, swaps are paced by the pipelined page flip, and gl.zincPresent (glReadPixels into a runtime image) is never used on this path. zinc:ui stays on top through today's overlay texture until RPI-3D-03. (From docs/reports/hardware/raspberry-pi-threejs-and-sdk.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 a three.js cube on a WebGL1 context renders fullscreen on the Pi 3B+ from a console, paced at 60 fps
- [ ] #2 a counter proves zero glReadPixels calls per frame
- [ ] #3 macOS behaviour unchanged (tests/t1/three.sh green)
- [ ] #4 ZINC_GL_INFO reports the shared context
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-11-07: cross-platform pass. (corrected: park proposed; it needs only the Raspberry Pi 3B+ or the Intel Mac, both available since 2026-11-07 (owner): cross-platform pass, not parked.)
<!-- SECTION:NOTES:END -->
