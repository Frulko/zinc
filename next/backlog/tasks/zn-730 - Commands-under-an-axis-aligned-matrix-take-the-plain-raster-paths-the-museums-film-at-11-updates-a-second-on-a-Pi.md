---
id: ZN-730
title: >-
  Commands under an axis-aligned matrix take the plain raster paths (the
  museum's film at 11 updates a second on a Pi)
status: In Progress
assignee:
  - '@parallel'
created_date: '2026-10-12 13:50'
updated_date: '2026-10-12 14:14'
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
- [x] #1 A command recorded under a matrix that only scales and moves (no rotation, no skew, positive scales) is drawn by the same code and at the same speed as the command given directly at its place and size: IMAGE first, then RECT, BORDER, SHADOW under a uniform scale; TEXT keeps ZN-726's path. The pixels are those of the direct command, and a test says so
- [x] #2 Under a matrix that turns, nothing changes (the goldens that cover rotated content pass unchanged); the goldens that change are listed with the reason, and the GL replay agrees with the software frame within today's tolerance
- [ ] #3 museum-table, sequence wave, on the Pi 3B+ at 1400 MHz (tools/device, off screen and on screen): the raster of a frame with a new film picture is measured before and after and is under 8 ms; the film shows its 24 pictures a second, or the task says what still limits it with numbers (decode, conversion, pacing)
- [ ] #4 The decode path on the Pi is established and recorded (h264_v4l2m2m or software, CPU of the decode and conversion thread per picture); a cheap gain found there is taken, a larger one is a line for later.md
- [ ] #5 Numbers in docs/reports/raspberry-pi.md; lines for the performance log and later.md in the final report
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-12, worktree agent. Hypothesis checked on the Mac first (tests/data/xform_plain, one 854x480 runtime image drawn 500x281, one raster thread, headless, (t300 - t1) / 299 pictures, machine under other builds): direct 1.17 ms a picture, under a matrix that only scales and moves 3.88 ms, under the same matrix turned 2 degrees 3.94 ms. The matrix path costs 3.3 times the direct one on x86_64; the frame under a scale-only matrix was also not the direct frame (10106 pixels of the test scene differ, max 184).

Same check on the Pi 3B+, baseline build (xform-wip, tests/data/xform_plain on the file framebuffer, real time, 4 threads, 6 s each), NOT at full clock: 1200 MHz, throttled=0xd0008, 60 to 63 C, beside the owner's museum-table at 146% CPU. fbdev raster p50 wall / CPU of all threads: direct 5.49 / 16.5 ms, under the scale-only matrix 23.0 / 82.0 ms, under the matrix turned 2 degrees 23.7 / 84.0 ms. The reading holds: the matrix path costs 5 times the CPU of the direct one for the film's picture on this board (the task's 106 ms of CPU for a film frame also holds the card's shadow, paper, bars and texts).

Step 1 done (runtime/gfx.cpp xf_plain, called by xform): under a matrix with b = c = 0 and a, d > 0 a RECT, BORDER, SHADOW or IMAGE is recorded at its place and size on the screen, so it is the command the program would have given directly: no XFORM, no payload in the point pool, the plain paths of the software raster and of the GL replay, exact boxes for tiles and damage. One scale for both axes is needed by a radius, a border's width and a shadow's blur; under two scales only a command without them (a plain rect, a gradient, an image). Kept on the matrix: TEXT (D112) and a gradient paint record (grad 5: its geometry is in the point pool; ponytail comment in the code). Test tests/t1/xform_plain.sh (tests/data/xform_plain): 53 commands at five scales and under two scales, drawn through the matrix and worked out by the program: the scene dumps are byte for byte the same (so the same code at the same speed), the frames are the same, interpreted and compiled, and the GL replay is within the limits of gfx_transform.
After, on the Pi (xform-wip, owner's program paused 49 s, board cooled under 55 C before each run, throttled=0xd0000 before each): direct 3.83 ms wall / 13.5 ms CPU, under the scale-only matrix 3.83 / 13.5 (the same command), turned 2 degrees 14.3 / 51.1 (the old path; that run ended at 60.1 C with bit 3 set, so its number is a lower bound of the old cost). On the Mac: 1.17 ms a picture in both, 3.9 turned.
Goldens that changed, all three explained by pixel diffs against the main tree's binary:
- tests/data/image_rect/xform-golden.png: 96 pixels, the one sprite under a scale of (2, 0.75) without a turn. Through the XFORM its left and right edges were soft over two columns each (the edge coverage used the matrix's mean scale, 1.22, for a horizontal scale of 2); recorded directly its edges are on whole pixels, exact. Columns 87, 88, 151, 152, 24 rows.
- tests/golden/museum-video/frames.txt (frames 150 and 300) and tests/golden/museum-visit/frames.txt (frame 200): the three frames that show the film's card, which has no angle. 61 000 of 2 073 600 pixels: 58 500 inside the poster differ by 1 or 2 levels (bilinear weights taken from the pixel's position instead of through the inverse matrix), 2 300 by more than 8, all on the picture's first and last rows and on the timeline's bar: a direct image and a direct opaque rect cover whole pixel rows where the XFORM blended a fractional edge.
Unchanged: gfx_transform (15, 45, 90 degrees and the scaled-then-turned group), text_scaled, museum_zoom, museum_table, museum_theme, museum_mode, style_transform, style_image, style_gradient, style_shadow, style_border, style_dynamic, style_flex, style_size, sprite_atlas, image_rect_gl, gl_renderer, gl_replay_es2, gl_strips, and the 4 canary entries of proto-capture.
Seen and accepted: an unturned image that moves or zooms now lands on whole pixels (as every direct image does), while the card's rounded paper keeps a smooth edge; a card with any angle is drawn as before.
<!-- SECTION:NOTES:END -->
