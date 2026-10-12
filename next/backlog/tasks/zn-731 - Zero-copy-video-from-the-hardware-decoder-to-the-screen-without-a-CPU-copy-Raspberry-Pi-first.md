---
id: ZN-731
title: >-
  Zero-copy video: from the hardware decoder to the screen without a CPU copy
  (Raspberry Pi first)
status: In Progress
assignee:
  - '@parallel'
created_date: '2026-10-12 13:56'
updated_date: '2026-10-12 14:52'
labels:
  - perf
  - video
  - size-L
milestone: m-21
dependencies: []
ordinal: 492410
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner, 2026-10-12, at the Pi 3B+: 'we want performance, zero-copy; no milliseconds lost without a reason; a video must be fast'. Today a decoded picture goes through CPU memory, a swscale conversion to BGR and the software rasterizer (plugins/video/native/video.host.cpp, the IMAGE command of a dyn image): the film of museum-table shows about 11 pictures a second on the Pi (ZN-730 removes the 30 ms of raster a picture costs under a matrix, the copies stay). The research on the paths (decoder dmabuf, KMS plane composed by the Pi's HVS, EGLImage, what mpv, Kodi and flutter-pi do, the other targets) is docs/reports/video-zero-copy.md: read it, then docs/reports/gpu-renderer-design.md section 7b and decision D111 (the UI stays in software on VideoCore IV: video, maps and 3D go to hardware layers under or over it).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The design is chosen from the research and recorded as a decision (scored as RULES 4 says): how a decoded picture stays a dmabuf, how a display driver places it (a KMS plane, a GPU texture), what the software rasterizer does when no driver takes it
- [ ] #2 On the Pi 3B+ the decoder is the hardware one and its pictures reach the screen without a CPU copy or a CPU colour conversion when the video is an upright rectangle; the proof is a counter or a trace that shows no pixel of the picture touched on the CPU
- [ ] #3 museum-table's film and hero's Video tab on the Pi: 24 and 30 pictures a second shown without a dropped picture over a minute, with the CPU of the whole program measured before and after (tools/device), at 1400 MHz
- [ ] #4 What the hardware path cannot draw (a turned card, a rounded clip, a blend) falls back to today's path and looks the same; subtitles and UI drawn over the video stay in front of it; a test covers the fallback
- [ ] #5 The other targets keep working: macOS (VideoToolbox) and the software targets pass their video tests unchanged; the zero-copy route of each (macOS first) is a line of later.md or done
- [ ] #6 Numbers in docs/reports/raspberry-pi.md and the performance log
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Spike on the Pi 3B+ (2026-10-12, a C++ program outside the engine: FFmpeg h264_v4l2m2m with get_format = drm_prime, libdrm atomic commits; museum's great-wave.mp4, 854x480 at 24; the owner's program stopped, board at 52 to 54 C, get_throttled 0xd0000 after each run):
- The frame: one dmabuf of 622080 bytes, DRM format YU12, pitches 864/432/432, modifier 0 (linear). The decoder calls it limited range; the stream says full (the plane's COLOR_RANGE is set from the stream).
- The display: plane 74 is the primary (the console's RG16 framebuffer), 16 free overlay planes (98 to 263, zpos 1 to 16), every one takes YU12, NV12 and AR24.
- drm_prime frame on overlay 98 scaled to 500x281 by the HVS, an ARGB8888 dumb buffer on overlay 109 above it with a transparent hole, an opaque bar and a half transparent box: 479 pictures in 20.02 s at 24 a second, 0 late, CPU of the whole process 0.58 ms a picture (1.4% of a core); at 30 a second (timestamps scaled) 599 pictures in 20.03 s, 0 late, 0.61 ms a picture; the whole screen (800x450) at 30: 0.55 ms; without the plane above: 0.54 ms. The decoder alone, frames left in its buffers: 0.20 ms a picture.
- drmPrimeFDToHandle + AddFB2 0.06 to 0.08 ms a picture, the atomic commit 0.15 ms. A picture reaches the screen 5.6 ms (p50) to 14 ms (max) after it is due: the next refresh.
- The governor left the clock at 600 to 800 MHz during these runs: the load is too small to raise it.
- The primary plane was never touched: after the program left (and it would be the same after a crash, the kernel removes a closed client's framebuffers) the only plane on the CRTC is the console's.
- Today's path for the same picture (raspberry-pi.md, ZN-730): 10 ms in the decode thread (copy 5, swscale 8) and 18 ms of raster CPU.
- Not seen by me: the screen itself (no camera, and /dev/fb0 does not hold the planes); the proof is the kernel's state file during the run (plane-4: fb YU12 854x480 on pixelvalve-1, plane-5: fb AR24 800x480) and the flip events.
- The screen was taken 1 min 47 s (16:43:54 to 16:45:41); museum-table restarted as it was.

Decision (criterion 1; the coordinator gives it its number), scored as RULES 4 (fit x3, performance x3, size x2, maintainability x2, licence x2, portability x1, effort x1):
- A, chosen, 64: the decoder's dmabuf on an HVS overlay plane, the software frame on an ARGB overlay plane above it, both inside display-fbdev and taken only while a hardware picture is drawn; the console's primary plane and the mode are never touched; plain KMS ioctls of the kernel's headers, no library. 5,5,5,4,5,3,3. Programs and their zinc.json do not change, a screen without a film is today's fbdev byte for byte, a crash leaves the console (the kernel removes the planes of a closed client), measured 0.58 ms of CPU a picture.
- A2, 53: the same planes in a new display-kms driver on libdrm that owns the mode and the primary plane (the research's design A as written). 3,5,4,3,5,3,2. A second driver with its own input, bands and statistics; programs must name it; it must restore the console itself.
- B, 48: keep /dev/fb0, have the decoder or the ISP give the picture at the drawn size. 3,2,5,4,5,2,3. A copy out of the uncached buffer and the raster stay; nothing measured says the ISP is cheaper.
- C, 45: the dmabuf as an EGLImage texture in display-gl. 2,3,4,3,5,4,2. On VideoCore IV the UI is fastest in software (D111) and display-gl re-composes the whole frame for each picture; it stays the answer for a turned or blended film on a GPU that can afford it (later.md).
How a picture stays a dmabuf: zinc:video asks h264_v4l2m2m for AV_PIX_FMT_DRM_PRIME only when the display driver has hardware layers (HalDisplay.layers), keeps the AVFrame of the pictures on screen, and gives the runtime image a HalPicture (fds, offsets, pitches, DRM format, range, matrix) instead of pixels. How the driver places it: gfx.cpp offers each upright, opaque, whole IMAGE of such a picture to the driver before the frame is drawn; a driver that takes it shows the dmabuf on a plane (PRIME import, AddFB2, one atomic commit with the frame's buffer) and the rasterizer writes a hole there, which the driver turns into alpha 0; what is drawn after the picture is in front of it. What the rasterizer does when no driver takes it: the plugin converts the same picture to pixels (asked once per picture, on the main thread at the change, in the decode thread after it), today's path; with a driver without layers the decoder is never asked for dmabufs.

Engine path, measured on the Pi 3B+'s real screen (2026-10-12 17:26 to 17:38; CPU of the whole program, every thread, from /proc/<pid>/stat over a window that starts 8 s after the launch; board under 55 C before each run, get_throttled 0xd0000 after each; the owner's program stopped meanwhile):
- museum-table --sequence wave (854x480 at 24, drawn 500x281 under a translucent timeline), 20 s window: the build of main (ZN-730) 38.3 ms of CPU a picture, 92.6% of a core, 24.15 pictures a second, 122.6 frames a second (the loop was not paced, see below), clock 1400 MHz; this build with ZINC_FBDEV_PLANES=0 (the software path, paced) 37.0 ms a picture, 89.6% of a core, 61 frames a second, 1400 MHz; this build 3.45 ms a picture, 8.3% of a core, 24.2 pictures a second, 0 dropped, 697 of 697 pictures never read by the CPU (0 converted), raster of a frame p99 0.40 ms and mean 0.10 ms, present p99 16.34 ms, 60.1 frames a second; the governor leaves the clock at 700 MHz most of the time (read every 2 s: 700 1400 1400 700 700 700 1400 1400 700 700) and the board cools (54.8 to 53.7 C).
- hero, Video tab (ZINC_DEMO=video), 640x360 at 24 in a rounded box, 60 s window: software path 37.5 ms a picture, 90.8% of a core; this build 4.75 ms a picture, 11.5% of a core, 1452 pictures in 60 s, 0 dropped over 69 s, 1662 of 1662 never read by the CPU, clock 700 MHz.
- hero, Video tab, the same clip re-encoded at 30 a second, 60 s window (it loops at 40 s): software path 35.5 ms a picture, 107.5% of a core; this build 4.12 ms a picture, 12.4% of a core, 1815 pictures in 60 s (30.25 a second), 0 dropped over 69 s, 2076 of 2076 never read by the CPU.
- The proof that no pixel is read: ZINC_VIDEO_LOG=1 prints one line per picture ("kept pos .. as a dmabuf" against "converted pos ..") and a count when the player closes ("showed 2076 pictures, 2076 of them dmabufs the CPU never read, 0 converted at a draw"); ZINC_LAYER_LOG=1 prints where each picture goes at each change ("is on a hardware layer of the display: no pixel of it is read"); ZINC_FBDEV_STATS=1 prints "fbdev planes: 2076 pictures shown from their dmabuf"; the kernel's state during the run shows plane-4 with a YU12 framebuffer and plane-6 with the AR24 one on pixelvalve-1.
- Found on the way, fixed in the driver: FBIO_WAITFORVSYNC on this Pi returns at once (60 waits in 0.1 ms: the kernel's framebuffer emulation waits for its first CRTC and the DSI screen is on the third), so every fbdev program ran its loop as fast as it could (122 frames a second with the film, a core spent). The driver now holds the rate by the clock when the wait did not wait.
- Found on the way, fixed in the player: the clock started with the first picture and the V4L2 decoder gave the second one 70 ms later, which was dropped as late once the first was no longer held back by its conversion. The clock now starts with two pictures in hand.
- Entering the planes costs 2 to 7 ms once per film (the planes are looked for once, at the start: 8 to 23 ms).
- Translucent things over the film (museum's timeline at alpha 160, the box of its subtitles) do not send it back to software: the driver draws the rows they touch a second time over white holes and gets each pixel's alpha from the two renders (D decision above amended: no "nothing translucent over it" rule).
- The fallback on the device (17:53, ZINC_FBDEV_PLANES=refuse: the layers are offered and all refused, what a turned or blended film gets): the first 4 pictures are converted at the draw on the main thread, the next 555 in the decode thread (the dmabuf mapped, copied, converted), 0 dropped, 24.2 pictures a second, 38.1 ms of CPU a picture: the software path's cost, no more. The final build right after: 3.41 ms a picture, 508 of 508 pictures never read, and only the console's plane on the CRTC once it left.
- Tests on the Mac: tests/t1/video_layers.sh (new: a test display driver with a layer composes the frame over the picture as a plane does; plain: on the layer, pixels never asked for, an opaque box, a rounded box, a translucent timeline and a shadow in front of it, at most 1 level from the software frame; turned, blend, round, part: no layer, pixels asked once, the software frame byte for byte), chip_models (the driver's alpha from two renders), video, museum_video, xform_plain: PASS; tools/proto-capture compare --canary: 4 of 4.
- Not seen by me: the screen itself. Colours, the hole's edges, the subtitles over the film and the moment the planes come and go are the owner's to look at.
- The screen was taken 42 s, 36 s, 2 min 25 s, 1 min 42 s, 2 min 28 s and 2 min 29 s for these runs (and 1 min 47 s for the spike): and 1 min 11 s for the fallback: 13 min 20 s in all; museum-table was started again after each as it was.
<!-- SECTION:NOTES:END -->
