---
id: ZN-109
title: 'Plugin: video (decode, loop, mapping inputs)'
status: Backlog
assignee: []
created_date: '2026-10-06 22:56'
labels:
  - plugins
  - media
  - size-L
milestone: m-9
dependencies:
  - ZN-101
  - ZN-104
ordinal: 40510
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Decision D12: VideoToolbox (macOS) and V4L2 M2M (Linux/Pi) first; dav1d and openh264 as run-time plugins; FFmpeg libav* only as a dynamically loaded LGPL plugin if a format needs it (as the prototype did); miniaudio/minimp3 for audio. Keep video.next.ts as the CI fake. Decoded frames land in runtime images.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 a test clip decodes to the same first-frame hash as the prototype's build; looper plays two clips gaplessly in a scripted run
- [ ] #2 examples/video/{bounce,looper,quad} run with real decode when the codec library is present and with the fake otherwise (skip line says which)
<!-- AC:END -->
