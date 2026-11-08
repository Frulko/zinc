---
id: ZN-1057
title: 'Linux pass: backends, decoders, tests'
status: Backlog
assignee: []
created_date: '2026-11-07 16:40'
labels:
  - linux
  - cross
  - size-M
milestone: m-25
dependencies: []
ordinal: 1049000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Linux gaps listed while working on the Mac.

From backlog/later.md, promoted by the review of 2026-11-07 (docs/reports/backlog-review-2026-11-07.md). The lines it carries:

- zinc:webview on Linux: on-screen on a real X session (GPU compositing, window resize, a window manager's focus), SDL's window from a native Linux build, XWayland, WebKitGTK 4.0, and a test that runs on Linux (done by hand under Xvfb on Debian 12: bridge, assets, keys, clip, hide).
- ZN-871: SpeexDSP and the `played` tap on Linux, the Pi and iOS; the speaker-to-microphone delay on Bluetooth and on the Pi, and a real call on laptop speakers.
- ZN-894: check that the -include impair.h hook builds on linux, rpi and ios.
- ZN-873: H.264 decode and encode on Linux (V4L2 M2M or a vendored decoder) for discord-voice video.
- ZN-872: the discord-voice plugin on Linux (ALSA/PulseAudio through miniaudio, BoringSSL without asm) and the zig cross build of its 431 sources.
- ZN-864: `hal_win_ctl` on Linux (SDL3 HAL) and the n3ds HAL (weak default: nothing moves).
- Threads profiler: check on Linux that `zinc profile` puts samples on each worker thread (SIGPROF delivery; older kernels favour the main thread).
- ZN-862: build plugins/imageio on Linux, Windows and iOS; check WebP and EXIF in a Linux AOT build (libwebp's symbols exported).
- Run ipod_jukebox and ipod_satellite on Linux (afconvert is missing there; the test uses ffmpeg, else skips).
- zinc:system/media: a Linux backend (MPRIS over D-Bus) and a Windows one (SystemMediaTransportControls), then turn on mediasession for those profiles.
- iPod: run ipod_smart on Linux.
- zinc:sonos events on webOS, the Pi and Android: the firewall must let the app's server port in (the webOS helper opens only the SSDP port today).
- ZN-857: iPod audio fingerprints on Linux need a decoder (miniaudio of plugins/audio covers WAV, MP3, FLAC; AAC and ALAC need another); until then `analyze()` on Linux matches by tags and files only.
- ZN-853: `ipod.mount('')` finds iPod partitions by media name with diskutil (macOS only); on Linux it needs a partition name (`udisksctl`) and a way to find iPod partitions by themselves.
- ZN-851: zinc:ipod on Linux and the Pi (apt packages of docs/plugins/ipod.md; TagLib 1 reads no embedded cover, udisksctl eject, an HFS+ iPod read-only), then Windows (glib, libplist, TagLib from MSYS2; the eject through DeviceIoControl).
- ZN-102: sqlite, wasm, process and ffi conformance in the Linux container.
- ZN-574: gamepads on Linux and Windows (frameworks and link line of the SDL joystick build, a real pad), with ZN-552's evdev hub.
- Inspector Info card on Linux (/proc/self/statm, /proc/cpuinfo), Windows (GetProcessTimes, GetProcessMemoryInfo) and the Pi's GL path (gl_renderer, SDL_GL_GetSwapInterval vsync).
- Info view: the refresh-rate key of Linux and Windows `hal_sdl`, and the `js.heap` provider of the JSC module on Linux (WebKitGTK).
- ZN-?: Discord voice AEC: verify the `plugin.json` SpeexDSP defines on the Linux, Windows and Raspberry Pi builds.
- ZN-995: build and run the webview slot-reuse scenario of `tests/t1/webview.sh` on Linux (`webview.linux.cpp` got the same generation handles, unbuilt on the Mac).
- ZN-1000: give Linux (X11 VisibilityNotify, Wayland frame callbacks), Windows (DWM cloaked, minimized) and iOS/Android backgrounding the same unseen-window throttle.
- ZN-1001: run worker_churn on Linux (open files via /proc/PID/fd; libuv on epoll and eventfd).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 MPRIS media session, libsecret store, PipeWire screen capture, V4L2 or vendored H.264, and gamepads are built or refused with a clear message
- [ ] #2 discord-voice plugin builds on Linux (ALSA, no-asm TLS); SpeexDSP defines checked
- [ ] #3 webview slot reuse, ipod_smart, ipod_jukebox, worker_churn, imageio (WebP, EXIF) run on Linux; hal_win_ctl exists
- [ ] #4 Window unseen-throttle for X11 and Wayland; profiler samples every worker thread
- [ ] #5 Info card and Inspector read /proc on Linux; heap trim verified
<!-- AC:END -->
