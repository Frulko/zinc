---
id: ZN-874
title: 'Screen and window capture source on macOS (ScreenCaptureKit) for zinc:webrtc'
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-30 14:56'
updated_date: '2026-10-30 22:28'
labels:
  - media
  - desktop
  - size-M
milestone: m-28
dependencies: []
ordinal: 184
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
zinc:webrtc lists screen sharing as missing. A capture source (getDisplayMedia shape: screen or window picker, frame rate, cursor) on ScreenCaptureKit, fed to the video encoder; other platforms go to the cross-platform pass in backlog/later.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 getDisplayMedia returns a track of the chosen screen or window
- [x] #2 examples/webrtc-call can share its screen
- [x] #3 The permission prompt is explained when screen recording is refused
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done (ZN-874): new plugin zinc:screen-capture (plugins/screen-capture: ScreenCaptureKit backend screen.macos.mm over screen.host.cpp; fake sources with ZINC_FAKE_SCREEN=1 and in deterministic runs). getSources({types, thumbnailSize}) like Electron's desktopCapturer (thumbnails via SCScreenshotManager, macOS 14+); ScreenCapture.open(id, {width, height, frameRate, cursor}); navigator.mediaDevices.getDisplayMedia({video: {deviceId, width, height, frameRate, cursor}}) in zinc:web through a DisplayBridge. Frames: the newest IOSurface CVPixelBuffer is retained and the runtime image points at its locked pixels (no copy); zinc:webrtc sendImage encodes from it. close()/track.stop() stops the SCStream; a closed window ends the track ('ended'). Listing/opening never calls ScreenCaptureKit without CGPreflightScreenCaptureAccess, so only requestPermission() can show the system question (never with ZINC_BACKGROUND). zinc.json permission 'screen' added to the known host features.
AC1: tests/t1/screen_capture.sh (fake: getDisplayMedia track of the chosen window, 640x480, frames, snapshot, stop, NotFoundError; real: status + screens listed, no capture). Manual: captured this run's own Zinc window (302x240, red centre) on the Mac.
AC2: examples/webrtc-call Share screen button (and key d); webrtc_call scripted session shares the fake screen and the peer receives 1152x720; goldens recorded again (new button), web_plugins click moved to 592,607.
AC3: refused -> getSources/open/getDisplayMedia reject (NotAllowedError) with 'screen recording permission is not granted: allow this app in System Settings > Privacy & Security > Screen & System Audio Recording (for zinc run, the terminal that runs it), then quit and open it again'; the demo shows it.
Engine fix on the way (own commit): o.video === false on an optional unknown field hit 'comparison operands differ: ref Dyn and bool' in the IR; check.cpp now rewrites it through __dynSeq (golden optional_unknown_undef on the three engines).
Not done: other platforms (cross-platform pass), audio capture, a picker UI in the engine (the program shows getSources), GPU zero-copy upload of the IOSurface.
<!-- SECTION:NOTES:END -->
