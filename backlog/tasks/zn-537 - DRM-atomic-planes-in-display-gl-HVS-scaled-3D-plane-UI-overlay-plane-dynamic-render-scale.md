---
id: ZN-537
title: 'display-gl: atomic planes shared with display-fbdev, render scale'
status: Backlog
assignee: []
created_date: '2026-10-09 07:45'
labels:
  - rpi
  - 3d
  - size-L
milestone: m-25
dependencies:
  - ZN-536
ordinal: 52500
updated_date: '2026-10-25 01:53'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Rewritten by the review of 2026-10-25:** Reuse the fbdev kms:: code in display-gl: atomic commit, scaled primary plane, ARGB overlay plane for the UI, render-scale option, TEST_ONLY fallback. Keep the Pi 3B+ criteria.

Move plugins/display-gl/src/kms.cpp to atomic commits. The primary plane takes a source rectangle smaller than the CRTC (HVS upscale), set by a render-scale option in zinc.json or an environment variable; dynamic resolution changes SRC_W/H while rendering into a viewport of a fixed buffer. The UI goes on an ARGB8888 overlay plane written by the software rasterizer on damage. Every new configuration is checked with DRM_MODE_ATOMIC_TEST_ONLY and falls back to today's GL composite. (From docs/reports/hardware/raspberry-pi-threejs-and-sdk.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 640x360 to 1280x720 and 1280x720 to 1920x1080 shown on the Pi 3B+ over HDMI; 800x480 DSI unscaled
- [ ] #2 UI composited by the HVS: the GL present pass is gone, GPU time per frame recorded before and after
- [ ] #3 vkms test of the atomic path (without scaling) in Linux CI
- [ ] #4 fallback verified by forcing a TEST_ONLY failure
- [ ] #5 every run under timeout -s KILL with the GPU reset counter unchanged
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: rewrite. Atomic planes exist in display-fbdev (fbdev.cpp:298-477, ZN-735 flip + hardware layers) but display-gl/kms.cpp only uses legacy calls plus the cursor plane. Rewrite: move the plane code into a shared KMS helper and give display-gl the HVS-scaled 3D plane, UI overlay plane and render scale. Evidence: plugins/display-fbdev/fbdev.cpp:298; plugins/display-gl/src/kms.cpp:84
<!-- SECTION:NOTES:END -->
