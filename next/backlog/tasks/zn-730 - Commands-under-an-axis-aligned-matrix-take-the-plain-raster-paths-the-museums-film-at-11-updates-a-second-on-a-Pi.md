---
id: ZN-730
title: >-
  Commands under an axis-aligned matrix take the plain raster paths (the
  museum's film at 11 updates a second on a Pi)
status: Ready
assignee: []
created_date: '2026-10-12 13:50'
labels:
  - perf
  - raster
  - size-M
milestone: m-21
dependencies: []
ordinal: 491410
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner complaint, 2026-10-12, museum-table on the Pi 3B+: 'the video is at 20 fps and stutters'. Measured there at 1400 MHz, sequence wave (one film card, 854x480 H.264 at 24 fps, 275 kbit/s, drawn about 500 x 281 px), off screen with ZINC_FBDEV_STATS and ZINC_PROFILE: a frame that shows a new picture of the film costs 30 ms of raster on four threads (106 ms of CPU; hero's whole vector map costs 17 ms), and only about 11 pictures a second reach the screen (raster mean 6.25 ms against p99 29.9 over 639 frames). Cause read in the code: every command recorded under gfx.setTransform becomes an XFORM command (runtime/gfx.cpp xform, D71), which the software raster draws pixel by pixel through the inverse matrix with bilinear sampling, even when the matrix only scales and moves; since ZN-726 every card of the museum is drawn through one matrix (angle and zoom), and the film card has no angle. Not measured yet: whether the decoder is h264_v4l2m2m or software on this Pi, what the decode and swscale thread costs, and why fewer than 24 pictures a second are shown.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A command recorded under a matrix that only scales and moves (no rotation, no skew, positive scales) is drawn by the same code and at the same speed as the command given directly at its place and size: IMAGE first, then RECT, BORDER, SHADOW under a uniform scale; TEXT keeps ZN-726's path. The pixels are those of the direct command, and a test says so
- [ ] #2 Under a matrix that turns, nothing changes (the goldens that cover rotated content pass unchanged); the goldens that change are listed with the reason, and the GL replay agrees with the software frame within today's tolerance
- [ ] #3 museum-table, sequence wave, on the Pi 3B+ at 1400 MHz (tools/device, off screen and on screen): the raster of a frame with a new film picture is measured before and after and is under 8 ms; the film shows its 24 pictures a second, or the task says what still limits it with numbers (decode, conversion, pacing)
- [ ] #4 The decode path on the Pi is established and recorded (h264_v4l2m2m or software, CPU of the decode and conversion thread per picture); a cheap gain found there is taken, a larger one is a line for later.md
- [ ] #5 Numbers in docs/reports/raspberry-pi.md; lines for the performance log and later.md in the final report
<!-- AC:END -->
