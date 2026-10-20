---
id: ZN-109
title: 'Plugin: video (decode, loop, mapping inputs)'
status: Done
assignee: []
created_date: '2026-10-06 22:56'
updated_date: '2026-10-07 10:26'
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
- [x] #1 a test clip decodes to the same first-frame hash as the prototype's build; looper plays two clips gaplessly in a scripted run
- [x] #2 examples/video/{bounce,looper,quad} run with real decode when the codec library is present and with the fake otherwise (skip line says which)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. Video natives build from the system FFmpeg (pkg-config) through the plugin pipeline; real decode via VideoToolbox verified: fractal.mp4 first frame equals the prototype's build (0 differing pixels, golden captured with the prototype), two-clip playlist 0,1,0 with 0 blank frames, bounce/looper/quad run real (headless, wall-clock). Without FFmpeg or compiler the test says it uses the fake (video.next.ts); deterministic runs keep the fake. tests/t1/video.sh. Not done: dav1d/openh264/miniaudio plugins (no format needed them here), V4L2 path unverified (no Linux hardware).
<!-- SECTION:NOTES:END -->
