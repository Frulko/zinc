---
id: ZN-875
title: 'examples/discord: Go Live screen sharing'
status: Review
assignee:
  - '@parallel'
created_date: '2026-10-30 14:57'
updated_date: '2026-10-30 22:59'
labels:
  - net
  - media
  - size-M
milestone: m-28
dependencies:
  - ZN-873
  - ZN-874
ordinal: 194
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Phase 5: gateway ops 18/19/20/22, STREAM_CREATE and STREAM_SERVER_UPDATE, the second voice connection with rtc_server_id, the stream key's DAVE group, bitrate adaptation and keyframe requests.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Sharing a screen or a window from the app is watched in the official client
- [ ] #2 Stopping the share ends the stream cleanly
- [ ] #3 Bitrate drops when the link is limited (measured with stats)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-30 (parallel agent) Go Live done against the fake; real-account proof and bitrate adaptation open.
Done: main gateway op 18 (create), 19 (delete ours / stop watching), 20 (watch), 22 (paused false once our stream connects) through one Gateway.stream(op, d) call site (for the ZN-890 guard); STREAM_CREATE (rtc_server_id), STREAM_SERVER_UPDATE (endpoint, token), STREAM_DELETE; VOICE_STATE_UPDATE self_stream -> who is live. A second VoiceConnection per stream (VoiceServer.stream: serverId = rtc_server_id, DAVE group = rtc_server_id - 1 by decimal-string arithmetic, our voice session id, Identify/op 12 stream type 'screen', native start(audio=false): no devices, voice packets dropped). Quality: the share dialog (zinc:screen-capture/picker, new reusable module used by discord and webrtc-call; owner request) picks the source, 720p/1080p/Source and 15/30/60 fps (above 720p30 dimmed 'Nitro' unless READY user.premium_type > 0), stored in the voice settings (zinc:storage); the capture runs at exactly that box and rate and op 12 and the encoder use it: videoBitrate = 0.08 bit/px/frame clamped 0.5-8 Mb/s (native videoSend now takes bitrate and fps). Camera quality 360p/720p in Settings > Voice & audio (Camera.open at that size, op 12 and bitrate follow). Watching: one stream at a time, a LIVE tile (Watch Stream), decoded only while shown at tile size (230x144 here) or full view on click (864x540), op 15 per size; Stop Watching / Stop Streaming in the call bar; stopping closes capture, encoder and connection. getSources gives appIcon (NSRunningApplication icon, 32 px with alpha).
Proof: tests/t1/discord_voice.sh with ZINC_FAKE_SCREEN=1 (picker frame and Go Live frame looked at; goldens re-recorded: new stream/watch lines), discord, screen_capture, webrtc_call pass.
Open: AC #1/#2 need a real call with the official client (owner, throwaway account): build/zinc --background run examples/discord, join a voice channel, Share Your Screen, check the official client sees the stream and ours shows theirs. Unknowns there: op 12/Identify stream type 'screen' vs 'video', whether op 22 is needed, the viewer's op 19. AC #3 (bitrate drops on a limited link) not done: no RTCP receiver report/REMB handling yet; the bitrate is fixed per quality.
<!-- SECTION:NOTES:END -->
