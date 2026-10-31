---
id: ZN-924
title: >-
  discord: rewrite our H.264 SPS so Chrome does not alter it (VUI bitstream
  restriction) and DAVE keeps decrypting
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-31 09:49'
updated_date: '2026-10-31 10:03'
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
- [x] #1 Our SPS is rewritten before DAVE encryption to carry a VUI with bitstream_restriction (num_reorder_frames 0, max_dec_frame_buffering as libwebrtc expects) so libwebrtc's SpsVuiRewriter leaves it untouched; PPS unchanged
- [x] #2 A native test ports libwebrtc's check (parse the SPS, decide whether ParseAndRewriteSps would change it) and proves our SPS passes unchanged, for the sizes we send (1280x720, 640x360, 160x90) and for camera and screen
- [x] #3 Camera and Go Live both use it; log line with the SPS profile, level and whether VUI is present
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Source read (libwebrtc common_video/h264/sps_vui_rewriter.cc, CopyAndRewriteVui): the SPS is rewritten when vui_parameters_present is 0, or the VUI has bitstream_restriction_flag 0, or max_num_reorder_frames != 0, or max_dec_frame_buffering > max_num_ref_frames. Real VideoToolbox SPS (captured) HAS a VUI: video_signal_type with colour description 6/1/6, no bitstream_restriction, so it is rewritten (hypothesis confirmed, premise 'no VUI' corrected). Fix: plugins/discord-voice/native/h264_sps.h copies the VUI and adds the restriction (reorder 0, dec buffering = num_ref_frames) before DAVE, key frames only; DISCORD_VIDEO_SPS=orig switches off; DISCORD_LOG prints 'video sps: ...'. Test: tests/t0/discord_voice_sps.sh. Only a real call proves the viewer decodes.
<!-- SECTION:NOTES:END -->
