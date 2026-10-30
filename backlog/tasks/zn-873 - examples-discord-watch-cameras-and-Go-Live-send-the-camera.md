---
id: ZN-873
title: 'examples/discord: watch cameras and Go Live, send the camera'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-30 14:55'
updated_date: '2026-10-30 22:28'
labels:
  - net
  - media
  - size-L
milestone: m-28
dependencies:
  - ZN-872
ordinal: 174
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Phase 4: protocol webrtc select-protocol against Discord's ICE-lite answer with zinc:webrtc (libdatachannel), which needs explicit SSRC, RTX and header-extension control and SDP answer injection; H.264 (VideoToolbox) first, VP8; DAVE per-frame encryption of video; op 12 and op 15.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A camera and a Go Live stream of another person play in the app
- [ ] #2 Our camera is seen by the official client
- [ ] #3 zinc:webrtc gains the SSRC/RTX controls with a T0 test
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-30 (parallel agent) camera video done, Go Live and real-account proof open.

Decision: video rides the voice connection's UDP (protocol 'udp', as the desktop client and the UDP-era discord-video-stream send it), not WebRTC: same socket, keys, IP discovery and DAVE; no SDP munging, no libdatachannel in discord-voice. So AC #3 (zinc:webrtc SSRC/RTX controls) is not needed on this path; propose dropping it at the next review (only plugins/webrtc/native media.cpp got a MEDIA_NO_VP8 switch and VideoToolbox's decoder a fit(w,h) output size).

Done: Identify video/streams, Ready streams (our SSRC), Select Protocol codecs (opus/120, H264/101 rtx 102), op 12 both ways (ours before the first packet, the others' cameras), op 15 per shown stream (50 for a tile, 100 from 640x360, 0 for the rest, sent on change only), op 4 self_video. Native: a video thread per connection, VideoToolbox H.264 encode (640x360 camera, ~0.1 bit/px), FU-A packetizer with the playout-delay extension, DAVE per video frame both ways, reassembly (media::Reassembler) only for watched SSRCs (others dropped before decryption), decode scaled by VideoToolbox to the tile size, three-buffer swap to the runtime image (no frame copy), RTCP PLI out (loss, start; 1/s max) and in (forces a key frame). App: Camera button, video in tiles, decoding stops while the call view is hidden or the window is minimized (hal_sdl now sends background/foreground on minimize/hide/restore/show; occluded deliberately not).

Proof: tests/t1/discord_voice.sh (fake camera -> encode -> fake echoes as Grace -> op 12/15 -> decoded 256x144 in her tile, frame looked at; minimized stops decoding; camera off) passes twice; tests/run --only discord passes.

Open: #1 Go Live watch (op 20, STREAM_CREATE/STREAM_SERVER_UPDATE, second VoiceConnection with rtc_server_id, DAVE group id = rtc_server_id-1) not started; #1/#2 need a real call with the official client (owner, throwaway account): build/zinc --background run examples/discord, join a voice channel, press the camera button, check the other client sees it and that their camera shows here. Unknowns to watch there: RTCP rtpsize framing (8-byte AAD assumed), op 15 exact shape, colour matrix (BT.601 assumed).
<!-- SECTION:NOTES:END -->
