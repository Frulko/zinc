---
id: ZN-1036
title: Raspberry Pi verification pass
status: Backlog
assignee: []
created_date: '2026-11-07 16:38'
labels:
  - pi
  - cross
  - size-M
milestone: m-25
dependencies: []
ordinal: 50900
updated_date: '2026-11-07 18:30'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Checks of the Mac work that need a Pi rig.

From backlog/later.md, promoted by the review of 2026-11-07 (docs/reports/backlog-review-2026-11-07.md). The lines it carries:

- Pi (2026-11-01): a Pi installed from an older image gets the power guard, the persistent journal and the other new system files only through tools/pi-install-dev: the 0.10.16 release's system/ folder lacks them because the device's own zinc-player-update (shipped by the image, not by a release) predates NEWER_FILES; let a release update zinc-player-update itself (with a signed, atomic swap) or document it in the update notes.
- music-tree: `warmRenderSinglePageOffscreen` costs 60-160 ms per page in the interpreter on a Pi 3 and runs ~2 s after a gesture (the remaining stalls of the frame profile); warm in slices or before the first touch only. The clock slide holds ~1200 RECT, 3100 POLY and 640 CLIP commands per frame: batch/cache the analog face.
- zinc device: `screen --live` runs at about 4 fps on a Pi 3B+, too slow to play through; rumble does not travel to the viewer's gamepad.
- Mapper, copy during a show on a Pi: a 1080p film plus an 89 MiB copy on the SD card put the film 733 ms behind (p50); `saveTo` writing on a worker, a sync per slice and the copy waiting for a late film were never measured there (the Pi left the network first). `lazytime` in the Pi image's fstab would also spare the frame loop ext4's journal: a `write` to a log waited 2.5 to 3.9 s on it.
- Mapper on a NUC: `zinc:video` VA-API with dmabufs and `zgl_picture_texture` on Intel never ran (two-layer NV12, modifiers); the export for `x86_64-linux` only started in a Debian 12 container, and needs FFmpeg's `libavcodec.so.59` (Debian 12) there.
- gl: the paint_populate stencil's GL_STENCIL_INDEX8 path was only run on the Mac; try it on GLES 2 hardware (Pi, Nexus 7).
- pinball: try the vertical mode, the flippers and a real gamepad on the rotated Pi; only the probe and a 480x768 window on the Mac have proved them.
- Pi sleep (image/player, display-fbdev `backlight`): on the Pi, prove a touch wakes the dark DSI screen, then the DPMS path on HDMI (output off and back, an app on a plane, a USB touch screen); on the Mac only the fade, the input swallowed and the settings are proven.
- ZN-884: run the shell's suspend on a Pi 3 (KMS closed and reopened, evdev grabs released, a whole frame after) and the 3 s no-CONNECT rule on the sim framebuffer.
- ZN-884: display_shell's stand-in on the Pi (rpi1 and arm64) with real dmabuf buffers from the shell's KMS (P2).
- ZN-885: the Linux trimHeap of src/host/loop.cpp (glibc malloc_trim(0)); check RSS drops after tests/data/heap_trim.ts on the Pi.
- threads (D181): RSS per idle worker and the Genius build time in a worker on the Pi 3B+ and the Nexus 7.
- iPod Genius timings on the Pi 3B+ and 4, and a Linux AAC/ALAC decoder for the daemon.
- iPod history import and its timings on the Pi daemon.
- D178: the Mac app's remote iPod against an ipod-web daemon on a Raspberry Pi over a real network (large files, timeouts, Wi-Fi).
- D178: the iPod daemon (examples/ipod-web) on a Raspberry Pi and a C.H.I.P.: build zinc:ipod's dependencies (glib, libplist, taglib, libusb) for armv6/armv7 with the pinned zig, serve a real iPod (an HFS+ one mounts read only: browse and stream only), stream to a Subsonic client on the LAN, and measure a hard-disk iPod's USB power on the C.H.I.P.'s host port (a powered hub if it browns out); it matters because that is what the daemon is for.
- zinc:video on a Pi 4 and a Pi 5: HEVC goes through the stateless V4L2 interface (rpi-hevc-dec). Measure with tools/h264dec-bench.cpp (extended to HEVC) FFmpeg of Pi OS (the Raspberry Pi fork has v4l2-request) against GStreamer's upstream v4l2slh265dec, and that the Pi 5 (no H.264 chip) takes libavcodec's software H.264; GStreamer becomes a way of the plugin only where it is the one door to the chip (docs/reports/video-zero-copy.md section 10).
- ZN-576: tests/golden/webgl/antialias.js expects a multisampled canvas; on a GLES 2 context (Pi 3) antialias is reported false, so the golden needs a GLES 2 variant there.
- ZN-820: on a Pi, tap an app in the player and check zinc-session starts it from next-app (app.zapp and run.sh) and that a crash names it.
- ZN-822: on the Pi's touch screen, check the dev bar takes a finger (touch[0]) and its X brings the player back.
- ZN-821: run `zinc device <pi> profile/bench` and `zinc dev --device <pi>` with the inspector on a real Pi through its agent (source deploy, --no-run, report pull).
- ZN-823: prebuilt plugins of the armhf, armv7, x86_64 and i686 packages and the release linux-cross CI job (it now builds a host zinc first) are not proven.
- tokyo: a Pi profile (a Pi 3/4 on Linux takes the desktop settings), the Pi build and real PSP/Vita/3DS measurements.
- ZN-889: `zinc publish --target rpi --export` from the Mac, then on the Pi 3B+ install a .zapp and an export app from the hub over Wi-Fi, launch, Home; check that the `tar -h` player bundle of image/build.sh builds there.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Mapper copy under a 1080p film, VA-API on a NUC, GLES2 stencil and antialias variant, pinball vertical mode, Pi sleep wake on DSI and HDMI
- [ ] #2 Shell suspend, dmabuf buffers, trimHeap and worker RSS on a Pi 3B+
- [ ] #3 Player app start, dev bar touch, zinc device profile/bench and dev --device on a Pi; prebuilt plugins of the armhf, armv7, x86_64 and i686 packages
- [ ] #4 ipod daemon and Genius on a Pi; HEVC on Pi 4 and 5; publish to a Pi from the hub
<!-- AC:END -->
