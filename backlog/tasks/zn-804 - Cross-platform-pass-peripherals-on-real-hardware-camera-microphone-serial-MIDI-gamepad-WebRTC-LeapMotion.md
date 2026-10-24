---
id: ZN-804
title: >-
  Cross-platform pass: peripherals on real hardware (camera, microphone, serial,
  MIDI, gamepad, WebRTC, LeapMotion)
status: Backlog
assignee: []
created_date: '2026-10-24 23:55'
labels:
  - size-L
  - cross
milestone: m-14
dependencies: []
ordinal: 54000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From backlog/later.md, promoted by the review of 2026-10-25 (docs/reports/backlog-review-2026-10-25.md). The lines it carries:

- ZN-574: try a real Xbox and a real PlayStation pad on the Mac (hot-plug, rumble, mapping); measure launch time and the first poll of the HID manager on a quiet machine (libzn_window grew by 391 KB).
- ZN-649.07: play the pinball with a real gamepad and a cabinet encoder (I-PAC or Zero Delay), and check the default cabinet layout.
- ZN-717: try `zinc:serial` with a real Arduino and an adapter pulled out (baud, framing, DTR reset, unplug); port names from USB product and vendor ("Arduino Uno", not a device path).
- ZN-715: try `zinc:midi` with a real keyboard and with GarageBand on "Zinc keys"; wake the loop from RtMidi's callback and timestamp messages, after measuring the 2 ms timer.
- zinc:camera: on a Mac with the camera access granted to the terminal (a person clicks once), `Camera.open` on the FaceTime HD camera and a USB webcam (C920): frames arrive, the image shows them, `snapshot()` is the picture, close stops the green light; never tried (the access was undetermined and a test must not wait on the dialog).
- zinc:camera (macOS, the owner's Mac): open, switch camera, change size and rate, take photos on the C920, OBS, an iPhone (Continuity) and the FaceTime HD camera: the window must not freeze (open and close run on the control queue), a size change reuses the session (no green-light blink), the iPhone lists without the AVFoundation warning when run from the dev bundle (webcam has an app id now).
- zinc:camera: on Linux, the YUYV/MJPEG choice by VIDIOC_ENUM_FMT and VIDIOC_ENUM_FRAMEINTERVALS (a C920 at 1280x720: MJPEG at 30 fps instead of YUYV at 10), the "denied" status without the video group, and a Pi CSI camera through `libcamerify`.
- zinc:camera: build and run the V4L2 backend (plugins/camera/native/camera.linux.cpp) on Linux and a Pi 1 with a UVC webcam: YUYV and MJPEG (stb_image) paths, a camera unplugged while streaming, the frame rate a Pi 1 keeps at 320x240 and 640x480.
- zinc:camera: Windows backend on Media Foundation (IMFSourceReader, RGB32 output), opening the Windows part of the pass.
- zinc:camera: the web target maps zinc:camera to the browser's getUserMedia (a <video> element copied into the runtime image each frame); only noted, nothing written.
- ZN-738: add LeapC library discovery and verify the leapmotion plugin on Windows/Linux during the cross-platform pass; only macOS is declared and tested today.
- zinc:microphone: on a Mac with the microphone access granted to the terminal (a person clicks once), `Microphone.open` on the built-in microphone and a USB one: blocks arrive, the level follows the voice, close turns the orange indicator off; never tried (a background run must not ask).
- zinc:microphone: build and run on Linux and a Pi with a USB microphone (PulseAudio, then plain ALSA), the `audio` group, 16 kHz mono on a Pi 1.
- zinc:webrtc: build the plugin for Linux and armhf (rpi1) with the pinned zig: usrsctp's Linux defines (HAVE_LINUX_IF_ADDR_H, _GNU_SOURCE), -pthread, the order of vendor.a and zn_mbedtls on the GNU link line (ld64 does not care); the loopback test on a Pi 1: time to connect, rate of a 1 MB file.
- zinc:webrtc: two machines on a LAN (the Mac and a Pi) through the room server of examples/webrtc-chat (chat and webrtc-call); Firefox and Safari as peers (headless Chrome is tested: tests/t2/webrtc_interop.sh, audio and video both ways).
- zinc:webrtc: build the media sources (libsrtp, opus, libvpx generic, the libdatachannel packetizers) for Linux and armhf with the pinned zig, and run tests/t1/webrtc_media.sh there (VP8 only: no H.264 offered off macOS).
- zinc:webrtc: VP8 on a Pi 3 and a Pi 1: frames per second and CPU at 320x240 and 640x480 with libvpx generic C (measured 3.1 ms per 640x480 frame on an M1 Pro); Opus floating point on a Pi 1 (fixed point if it does not keep 20 ms frames).
- zinc:webrtc: H.264 in hardware on the Pi (V4L2 M2M, /dev/video11 encoder and /dev/video10 decoder) behind media::VideoEncoder/VideoDecoder, negotiated first there as on macOS.
- zinc:webrtc: the browser target (wasm): map RTCPeerConnection to the page's own through an import shim, not this plugin.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Each plugin tried with real hardware on the Mac (camera, mic, Arduino serial, MIDI keyboard, gamepads) and results noted
- [ ] #2 Linux/Windows/Android/iOS backends build and run (V4L2, Media Foundation, camera2, WASAPI)
- [ ] #3 WebRTC builds on Linux/armhf and runs between two machines
<!-- AC:END -->
