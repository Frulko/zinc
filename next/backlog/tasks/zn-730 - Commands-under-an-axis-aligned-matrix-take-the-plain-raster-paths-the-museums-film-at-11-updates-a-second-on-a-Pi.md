---
id: ZN-730
title: >-
  Commands under an axis-aligned matrix take the plain raster paths (the
  museum's film at 11 updates a second on a Pi)
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-12 13:50'
updated_date: '2026-10-12 14:37'
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
- [x] #3 museum-table, sequence wave, on the Pi 3B+ at 1400 MHz (tools/device, off screen and on screen): the raster of a frame with a new film picture is measured before and after and is under 8 ms; the film shows its 24 pictures a second, or the task says what still limits it with numbers (decode, conversion, pacing)
- [x] #4 The decode path on the Pi is established and recorded (h264_v4l2m2m or software, CPU of the decode and conversion thread per picture); a cheap gain found there is taken, a larger one is a line for later.md
- [x] #5 Numbers in docs/reports/raspberry-pi.md; lines for the performance log and later.md in the final report
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

The film on the Pi: the raster was half of it. Decode path established: zinc:video opens h264_v4l2m2m on this Pi (/dev/video10, bcm2835-codec; the Pi's FFmpeg 7.1.3 rpt1 has the wrapper and pi is in the video group), and the 11 pictures a second came from there: swscale read the decoder's capture buffer, which is mapped without a cache, at 85 ms a picture in the decode thread.
FFmpeg alone on the film (ffmpeg -benchmark, 240 pictures of 854x480, CPU a picture = (utime + stime) / 240, 1400 MHz, throttled=0xd0000, 55 to 58 C, owner's program paused 84 s then 59 s): software decode 13.5 ms (4 threads) or 10.0 ms (1 thread); h264_v4l2m2m 0.6 ms; conversion to bgr0 by swscale from ordinary memory 8 to 10.6 ms (bgra the same: no NEON gain; scaled to 500x281 11.2 ms); h264_v4l2m2m then bgr0 by swscale straight from its buffer, one thread: 82 ms a picture, 12 pictures a second (what the plugin did); the same with a copy of the buffer first: 13.7 ms (decode 0.6, copy of 0.6 MB 5.1, conversion 8.0); bgr0 asked from the decoder itself (-pixel_format bgr0, it works) and copied: 12.9 ms (the copy of 1.64 MB costs what the conversion saved), and its colours are those of a limited-range stream (mean difference 11 levels of 255 against the software decode: the film is full range, yuvj420p, and the V4L2 decoder does not say so).
Taken (plugins/video/native/video.host.cpp): a frame of a V4L2 decoder is copied into ordinary memory (one buffer kept from picture to picture) before swscale converts it, and the conversion takes the stream's colour range when the stream names one. ZINC_VIDEO_LOG=1 also prints the conversion time and the decoder of each picture; ZINC_FBDEV_STATS=2 prints every frame (rows, raster, CPU).
museum-table --sequence wave on the Pi 3B+, off screen (file framebuffer 800x480x16, real time, 16 s, first 3 s skipped, 4 raster threads), owner's program paused 104 s for the four runs, board under 55 C before each run, throttled=0xd0000 during the run except where said. A frame with a new film picture is one that repaints 200 rows or more (279):
| build | raster of a film frame p50 / p90 / max, ms | CPU of the raster threads p50 | conversion in the decode thread p50 | pictures shown a second | frames a second |
| old raster, old video path | 27.2 / 28.8 / 36.2 | 100.4 | 85.4 | 11.6 | 51.9 |
| plain commands, old video path | 6.0 / 8.2 / 10.3 | 18.7 | 85.4 | 11.6 | 59.8 |
| old raster, copy before swscale (bit 3 set during the run: 60.1 C) | 27.6 / 31.7 / 36.0 | 99.7 | 17.5 | 24.0 | 43.1 |
| plain commands, copy before swscale | 6.2 / 8.4 / 11.2 | 18.2 | 10.0 | 24.0 | 59.7 |
No picture dropped in any run. The clock: the governor is ondemand (no sudo to change it); 1400 MHz was read during the heavy runs, 600 MHz at the start of the light ones, so the light runs' times are not better than a fixed 1400 MHz would give. The temperature over a 16 s run: 55.8 to 59.1 C before, 54.8 to 56.9 C after.

Final build, left on the Pi as ~/zn/museum-wip (two more runs, same method, 7 of 8 clock samples at 1400 MHz, the first at 600; throttled=0xd0000; hottest 57.5 C): a film frame's raster p50 6.2 and 6.1 ms, p90 8.2 and 7.8, max 12.3 and 12.0; CPU of the raster threads 18.3 ms; conversion 10.0 ms a picture; 24.0 pictures a second, none dropped; 59.7 frames a second. The build of main left as ~/zn/museum-wip-before gives the task's numbers again (raster p99 29.1, mean 6.16; 173 pictures in 16 s).
Colours: the decoder's samples read as full range are the software decode's (mean 0.000, max 1 level; one picture, FFmpeg's CLI both ways). Not checked on the program's own frame.
The coordinator's question (BGRX and the drawn size from the decoder or the ISP): BGRX from the decoder works (-pixel_format bgr0 on the wrapper) and is no gain, 12.9 ms a picture against 13.7 for YUV copied then converted, with limited-range colours; the decoder's capture size is the stream's; the ISP was not measured: FFmpeg's scale_v4l2m2m refused the three graphs tried (it wants DRM_PRIME frames) and the plugin does not link libavfilter. Lines for later.md in the final report.
Criterion 3 stays open on one point: the run on the real screen. The owner's museum-table held it for the whole session (150% CPU, no touch in the samples taken before each series), so everything was measured off screen with that program paused: six pauses, 383 s in all (49, 84, 59, 104, 67, 20). Next command, when the screen is free: tools/device pi@192.168.2.107 run museum-wip ZINC_PERF_HUD=1, go to the sequence of the film, read the HUD (60 frames a second expected, the film smooth); or by ssh on the real framebuffer: cd ~/zn/museum-wip && env ZINC_SIZE=800x480 ZINC_FBDEV_STATS=2 ZINC_FBDEV_SKIP_S=3 ZINC_VIDEO_LOG=1 timeout 16 ./museum-table --sequence wave 2>&1 | grep -E 'fbdev (stats|frame)|converted' (frames of 200 rows or more are the film's pictures). Also open: p90 of a film frame's raster is 7.8 to 8.4 ms, at the limit of the criterion's 8 ms (p50 6.2): the direct image path is a float bilinear loop (13.5 of the 18.3 ms of CPU).

Coordinator, 2026-10-12 16:4x, on the real /dev/fb0 of the Pi 3B+ (museum-table --sequence wave, 18 s, ZINC_FBDEV_STATS, ZINC_VIDEO_LOG, 55.8 C, the clock read 800 MHz just after the run under the ondemand governor, throttled=0xd0000): 419 pictures converted in about 17.5 s (24 a second), decoder h264_v4l2m2m, conversion 12 to 18 ms a picture, raster of a frame with a new picture p99 8.71 ms (mean over all frames 1.26 ms, CPU p99 22.1 ms), 123 frames a second. Criterion 3 ticked on that: the film shows its 24 pictures a second on the screen; the raster's p99 is 0.7 ms over the 8 ms asked (p50 6.2 off screen), the integer image loop of later.md is what would bring it under.
<!-- SECTION:NOTES:END -->
