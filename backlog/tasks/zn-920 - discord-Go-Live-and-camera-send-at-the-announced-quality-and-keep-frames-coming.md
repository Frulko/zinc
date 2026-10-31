---
id: ZN-920
title: >-
  discord: Go Live and camera send at the announced quality and keep frames
  coming
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-31 08:52'
labels:
  - discord
  - webrtc
dependencies: []
ordinal: 614460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner 2026-10-31 real call log (discord-call.log): the viewer received pixels but the stream is poor or frozen. Findings: Go Live announced 1280x720 2.2 Mbit/s but the encoder sent 640x360 at target 150000 bit/s with only 14 frames in the first window (ScreenCaptureKit sends frames only when the screen changes); the camera announced 640x360 but encoded 160x90 at 60000 bit/s; 12 frames were held while DAVE was not yet keyed and the first viewer key frame was made before DAVE keyed.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A still screen keeps frames coming: the capture repeats the last frame so the sender holds at least a few fps and a key frame per second
- [ ] #2 Encoder size and bitrate follow the announced stream (pixel counts the server wants, max_bitrate, bandwidth estimate), not a fixed 640x360 at 150 kbit/s; camera likewise
- [ ] #3 No frame is encoded before DAVE is keyed, and a key frame follows the moment it is
- [ ] #4 Log lines show the encoded size, fps and target per second for each outgoing video
<!-- AC:END -->
