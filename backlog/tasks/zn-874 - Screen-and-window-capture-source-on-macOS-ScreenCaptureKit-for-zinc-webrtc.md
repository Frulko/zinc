---
id: ZN-874
title: 'Screen and window capture source on macOS (ScreenCaptureKit) for zinc:webrtc'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-30 14:56'
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
- [ ] #1 getDisplayMedia returns a track of the chosen screen or window
- [ ] #2 examples/webrtc-call can share its screen
- [ ] #3 The permission prompt is explained when screen recording is refused
<!-- AC:END -->
