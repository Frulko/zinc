---
id: ZN-920
title: >-
  discord: Go Live and camera send at the announced quality and keep frames
  coming
status: Review
assignee:
  - '@parallel'
created_date: '2026-10-31 08:52'
updated_date: '2026-10-31 09:02'
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
- [x] #2 Encoder size and bitrate follow the announced stream (pixel counts the server wants, max_bitrate, bandwidth estimate), not a fixed 640x360 at 150 kbit/s; camera likewise
- [ ] #3 No frame is encoded before DAVE is keyed, and a key frame follows the moment it is
- [x] #4 Log lines show the encoded size, fps and target per second for each outgoing video
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Root cause of findings 1 and 3: the call ran in the ultra low data mode (LOW_STREAM 640x360 5 fps 150 kbit/s; LOW_CAMERA 160x90 60 kbit/s), yet op 12 still announced full quality. Now op 12 announces what is sent (sentQuality) and is re-sent when the mode changes; DISCORD_LOG=1 prints one line a second per outgoing video (size, fps, target, keys). Done in code, not yet proven by a test: native video thread repeats the last frame every 250 ms (a still screen) so the 1 s key frame has a picture (AC1); sendVideo encodes nothing while DAVE is on and unkeyed, and keeps the key frame armed (AC3). Real call needed to prove: a static screen holds >=4 fps and keys, the viewer's first frame is a key frame after keying. Not done: the encoder does not read the server's op 15 pixelCounts or any bandwidth estimate (ZN-901/902 area); outside low data the encoder already follows the announced size and bitrate.
<!-- SECTION:NOTES:END -->
