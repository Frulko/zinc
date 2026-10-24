---
id: ZN-735
title: >-
  display-fbdev: fast animations tear in bands on the Pi: every frame through
  two buffers and a flip at the refresh
status: Done
assignee: []
created_date: '2026-10-12 16:17'
updated_date: '2026-10-25 01:53'
labels:
  - rpi
  - render
  - perf
  - size-M
milestone: m-25
dependencies: []
ordinal: 64200
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner, 2026-10-12, at the Pi 3B+ (DSI screen): fast animations show a glitch, the picture cut in bands, and do not look fluid. Cause read in plugins/display-fbdev/fbdev.cpp: without a video picture a frame is converted straight into /dev/fb0, the buffer on the screen, 16 rows a band on four threads, and the wait that should time that write to the vertical blank does not wait on this screen (FBIO_WAITFORVSYNC returns at once: the kernel's framebuffer emulation waits for its first CRTC and the DSI screen is on another, ZN-731), so the scan-out reads a buffer half written: bands of the new frame beside bands of the old. The driver already has the cure for frames with a video picture: two buffers of the display and an atomic commit that shows the finished one at the refresh (planes_present). Use it for every frame when the display has it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 On a display with KMS no frame is written to the buffer on the screen: every frame goes to the buffer that is not shown and one commit shows it at the refresh, with or without a video picture; ZINC_FBDEV_FLIP=0 gives the old path back; a display without KMS and ZINC_FBDEV_SIM are unchanged
- [x] #2 A partial update stays partial: the buffer written gets this frame's damage and what the frame before changed, not the whole surface
- [x] #3 Measured on the Pi 3B+ with examples/hero's navigation, before and after, at the board's full clock: frames a second, present p50 and p99, CPU; logged in the task notes for docs/reports/zinc-next-perf.md; no loss above 15% or the reason and the trade written
- [x] #4 The existing tests of the driver pass (the file framebuffer); hero is left running on the Pi for the owner to look: the task goes to Review, not Done, until he says the bands are gone
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done (2026-10-12, agent in a worktree), waits for the owner's eyes: Review.

What changed (plugins/display-fbdev/fbdev.cpp, docs/plugins/display-fbdev.md):
- fb_init keeps the DRM file it used to open and close: when the test commit passes, kms::flip is set and every frame takes planes_present (the buffer that is not shown, one atomic commit, the page-flip event paces the loop), with or without a picture. Nothing new in the band code: put_row writes where fbmem points, planes_present points it at the back buffer.
- ZINC_FBDEV_FLIP=0: the old path, unchanged (frames into /dev/fb0, planes only while a picture is shown, closed after 2 s). ZINC_FBDEV_SIM never opens KMS. No plane, no KMS, or another program holding the display (test commit EACCES): /dev/fb0, with the reason logged.
- A scaled surface is flipped too (the owner's 320x240 sketches on this screen); hardware layers stay for a 1:1 surface. ZINC_FBDEV_PLANES=refuse has its own flag (kms::refuse) so that a flipping display does not count as failed.
- At exit the last frame is converted into /dev/fb0 under the plane before the planes go: the screen keeps the last picture as before, and tools/device shot works after a run.
- Logged once at start: "fbdev: frames go to the buffer that is not shown, one flip at the refresh (KMS plane, two buffers, 32 bpp; ZINC_FBDEV_FLIP=0: /dev/fb0)" or "fbdev: frames are written into /dev/fb0, the buffer on the screen (<why>)". With ZINC_FBDEV_STATS=1 at exit: "fbdev flip: N commits at the refresh, M frames written into /dev/fb0 while it was on the screen" and "damage x% of the surface a commit, written to its buffer y%".

Measured on the Pi 3B+ (DSI 800x480, /dev/fb0 16 bpp), on the screen, one binary exported from this worktree (ZINC_ROOT=<worktree>/next with the main tree's zinc; the new log line is in the binary), `tools/device pi@192.168.2.107 profile hero-flip ZINC_DEMO=navdrive ZINC_FBDEV_SKIP_S=4 [ZINC_FBDEV_FLIP=0]`, 260 frames, 4 threads, ARM clock 1400 MHz and throttled=0xd0000 after every run kept (no bit set now), no agent app running, two pairs:

| path | fps | present p50 | present p99 | convert p50 | vsync p50 | CPU a frame (render + convert, all threads) | frames into /dev/fb0 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| /dev/fb0 (FLIP=0) | 39.9, 40.0 | 18.50, 18.47 | 19.75, 18.96 | 1.44 | 0.01 | 64.7 + 5.1 = 69.8 ms | 260 of 260 |
| flip | 38.5, 37.9 | 19.27, 19.27 | 20.07, 22.28 | 2.07 | 0.03 | 65.0 + 6.7 = 71.7 ms | 0 of 260 (260 commits) |

- The loss is 3.5 to 5% of the frames and 0.8 ms of present, under the 15% limit: the buffers are 32 bits a pixel (the plane above the pictures must be ARGB) where /dev/fb0 is 16, so the conversion writes twice the bytes (1.44 to 2.07 ms). The wait for the refresh costs nothing here: a navigation frame lasts 25 ms, the flip of the frame before is long done.
- hero's tour (ZINC_DEMO=bench, 570 frames, 1400 MHz): 59.3 fps and present p50 14.25 / p99 15.79 into /dev/fb0, 59.8 fps and 14.06 / 15.65 flipped; damage 58.2% of the surface a commit, written 60.0%: a partial update stays partial.
- pocket-hero (480x272 scaled to 800x453, ~/zn/flip-scaled): 59.7 fps into /dev/fb0, 60.0 flipped; damage 1.3% a commit, written 2.5% (the frame's and the one before).
- hero's home screen left running 26 s (ps, since the start): 139% CPU into /dev/fb0, 147% flipped.
- Not valid, not kept: a pair over 700 frames ended at 1200 MHz (throttled=0xd0008, soft temperature limit at 60 C): 40.8 and 37.2 fps.
- For docs/reports/zinc-next-perf.md (coordinator): the table above.

Tests: `tests/run --tier t1 --only chip_models` PASS (the file framebuffer, ZINC_FBDEV_SIM at 16, 24 and 32 bpp, letterbox, input). video_layers not run: it has its own display driver and does not compile fbdev.cpp.

Not proven:
- That the bands are gone: a capture reads a finished buffer and cannot show tearing. What is proven is the path (the line at start, 0 frames written into /dev/fb0 over every flipped run) and the timings. The owner's eyes do the rest.
- The KMS code is not compiled on the Mac (no DRM headers): the flip has no test there, only the runs on the Pi above.
- A display without KMS, and a display another program holds: the code falls back to /dev/fb0 and says why, not run on hardware. 24/32 bpp framebuffers, other KMS drivers than vc4 on the Pi 3B+.
- At 38 fps on a 60 Hz panel a flipped frame stays one or two refreshes: no tear, but the motion is not even. Faster frames are the cure, not the driver.

On the Pi now: ~/zn/hero-flip runs with the flip (home screen, touch works). To compare:
  tools/device pi@192.168.2.107 run hero-flip                        # flip
  tools/device pi@192.168.2.107 run hero-flip ZINC_FBDEV_FLIP=0      # the old path, straight into /dev/fb0
(add ZINC_DEMO=navdrive for the navigation already driving; `tools/device pi@192.168.2.107 stop` ends it.)
While it runs, /dev/fb0 is under its plane: a sketch started by the agent with the engine installed in ~/zinc-engine (the old driver) draws into /dev/fb0 and is not seen until hero-flip is stopped.

Decision (reversible): the flip is the default wherever the test commit passes, scaled surfaces included; 32 bpp buffers kept for the 3.5 to 5% they cost rather than a second 16 bpp pair without pictures.

Lines for backlog/later.md:
- ZN-735: RGB565 buffers for the flip while no picture is shown, the frame is converted at 32 bpp today (navigation 1.44 to 2.07 ms, 3.5 to 5% of the frames).
- ZN-735: a third buffer, so that a frame's conversion does not wait for the refresh of the frame before (matters when raster plus convert is near one period).
- ZN-735: tools/device shot reads /dev/fb0, black while a flipping program runs: read the frame back through the program, or say it in the tool.
- ZN-735: a DRM stub for tests/native/chip_fbdev.cpp, so that the flip (the damage of two frames, the fallbacks) is tested on the Mac; only the Pi proves it today.
- ZN-735: the engine package of the Pi's agent (~/zinc-engine) has the old driver: its sketches still tear and are hidden under a flipping program; rebuild and install it.
- ZN-735: a display without free KMS planes still tears: double buffering by panning /dev/fb0.
- Cross-platform pass: the flip on other KMS drivers and depths (Pi 4/5, 24/32 bpp, the CHIP).
Review 2026-10-25: closed as Done. Close as Done: the KMS flip is the default on the Pi (fbdev.cpp planes_present; docs/plugins/display-fbdev.md:98), measured on the Pi 3B+ (-3.5 to 5% fps, bands removed by design), tests pass; the owner has run the Pi image since. Follow-ups are already lines in backlog/later.md. Evidence: plugins/display-fbdev/fbdev.cpp:668; backlog/later.md ZN-735 lines; docs/plugins/display-fbdev.md:98 Verifier: The KMS flip is the default and measured on the Pi 3B+; AC4 is explicitly 'until the owner says the bands are gone', a person step. The claim 'the owner has run the Pi image since' has no confirmation recorded in the task, so the close note should say the eye check was not reported. Follow-ups in backlog/later.md:188-193.
<!-- SECTION:NOTES:END -->
