---
id: ZN-1057
title: 'Linux pass: backends, decoders, tests'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-11-07 16:40'
labels:
  - linux
  - cross
  - size-M
milestone: m-25
dependencies: []
ordinal: 51600
updated_date: '2026-11-12 07:00'
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


## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-12 — isolated Discord-video capability increment; all five compound criteria remain open.

The existing Linux H.264 provider returns unavailable, but Discord Identify and Select Protocol advertised usable video and camera frames were silently queued without an encoder. The plugin now asks the shared `media::h264Available()` provider through a lazy native/public capability query; it offers H.264 and a camera stream only when available. Audio Opus is retained. Video-only connections and `setCamera(true)` fail with a readable reason before opening a socket or changing camera state; stop remains allowed. `watch()` returns false and requests no streams when unsupported, while clearing existing watches; `sendImage()` returns actual acceptance. Native entry points also refuse unsupported encode/decode requests before queueing. No codec, dependency, service, platform-name guess or new lifecycle was added.

All method callers were read. The existing Discord app preflights camera/share/watch before permission, capture allocation or Go Live requests, and requests no incoming frames without a codec. This avoids leaking an opened capture on rejection and preserves audio. Only the existing call controller and one English catalogue key changed; other languages use the existing English fallback. No app layout or new app test.

Research supplied by the coordinator: `.logs/research-next-i.txt`. Existing WebRTC `supported(H264)` already uses the same provider. [WebRTC capabilities](https://w3c.github.io/webrtc-pc/#dom-rtcrtpsender-getcapabilities) describe actual codecs; [Discord voice](https://docs.discord.com/developers/topics/voice-connections) documents the voice handshake, not the undocumented H264 encode/decode fields. [Discord DAVE](https://raw.githubusercontent.com/discord/dave-protocol/main/protocol.md) and [libdave](https://github.com/discord/libdave) separate encryption from codec negotiation; no cryptography change was needed.

Proof details and remaining limits are recorded in the worker `.logs/HANDOFF-1057.md` and summary/provenance manifests. The new exact T0 executes the actual plugin TypeScript with only imported providers replaced and types erased under Node; it exercises true/false Identify, Select Protocol, camera/watch/stop decisions and audio continuity without sockets, devices or live timers. It is not a three-engine or native media-call proof. A retained negative control executes the original source and fails because it announces video while the backend is unavailable. Actual default plugin build compiled439 jobs serially (434 vendored units, four own units and thunk), linked and archived successfully; the actual manager chosen cache key is1eca933ac402bc74 with vendor ecca1c60c6cf6225. A cache-hit pack retains plugin.dylib/plugin.a/vendor.a/key, and generated headers/thunk/export table are copied under `.logs/native/linked-plugin`. The real public accessor and native table/unsupported-entry guards pass on interpreter, native AOT and QuickJS in both fresh forced-off and normal processes (false/true on this Mac), without constructing a VoiceConnection, contacting a server or opening devices. This is actual native dispatch, not a stub. Generated native header/thunk and own-source macOS/Linux x86_64 glibc2.28 C++17/no-exceptions/no-rtti objects compile without warnings; actual VideoToolbox provider forced-off and normal queries pass. These objects do not prove a Linux link or execution. Final exact `discord_video_capability` and ordinary `zinc check .logs/public-capability.ts` pass; paths `.logs/t0-final.log`, `.logs/public-check.log`, `.logs/public-smoke-1.log` and `.logs/provenance.json`.

The special `zinc check --json` path stops before its checker on 21 native-provider/permission diagnostics because it does not set up the app's native/project context; output retained. A separate real frontend `nativeContractsOnly` smoke reads the real app manifest/permissions and checks all193 files without building providers, confirming the TypeScript changes; this is contract checking, not an app execution or native-link proof. No source workaround was added.

Proposed decision: reuse the existing codec provider lazily and refuse only video; do not fake Linux support or end a working audio call. Revisit when a real Linux H.264 backend is supplied, or the provider needs distinct encoder/decoder capabilities. No speed or memory improvement is claimed. The whole439-source build was bounded360s with ZINC_JOBS=1; live process snapshots stayed modest, but no memory benchmark was run. The engine was not rebuilt. Usage: n/a (`tools/usage`).

Proposed tests:
- Prepared Linux native plugin link/public capability and voice-only call with unsupported-video requests (~30–60s after build, memory unmeasured); no service/device setup is performed here.
- Existing macOS camera/Go Live receive/send session and stop/reconnect (~20–30s, memory unmeasured), at the owner's selected milestone; no real Discord request here.
- Remaining1057 providers, Linux regression sessions, AEC and platform window/profiler/Inspector checks remain in this task, not new tasks.
<!-- SECTION:NOTES:END -->
