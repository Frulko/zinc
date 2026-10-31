---
id: ZN-924
title: >-
  discord: rewrite our H.264 SPS so Chrome does not alter it (VUI bitstream
  restriction) and DAVE keeps decrypting
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-31 09:49'
labels:
  - discord
  - webrtc
dependencies: []
ordinal: 618460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner 2026-10-31 real call (viewer in Chrome, rtcstats dumps in ~/Downloads, our discord-call.log): after the header extension fix the SFU now forwards our video (viewer packetsReceived 1480-2697, pliCount 18-28, our pli-in 6-34, viewers 1) but the viewer has framesReceived 0, framesDecoded 0, keyFramesDecoded 0, totalAssemblyTime 0, for camera and for Go Live. Hypothesis: libwebrtc's receiver rewrites an SPS that has no VUI bitstream_restriction (SpsVuiRewriter, in H264SpsPpsTracker, before the frame transformer), which shifts every byte offset after it and breaks the DAVE decryption ranges, so the web client drops every frame and keeps asking for key frames. VideoToolbox SPS has no VUI.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Our SPS is rewritten before DAVE encryption to carry a VUI with bitstream_restriction (num_reorder_frames 0, max_dec_frame_buffering as libwebrtc expects) so libwebrtc's SpsVuiRewriter leaves it untouched; PPS unchanged
- [ ] #2 A native test ports libwebrtc's check (parse the SPS, decide whether ParseAndRewriteSps would change it) and proves our SPS passes unchanged, for the sizes we send (1280x720, 640x360, 160x90) and for camera and screen
- [ ] #3 Camera and Go Live both use it; log line with the SPS profile, level and whether VUI is present
<!-- AC:END -->
