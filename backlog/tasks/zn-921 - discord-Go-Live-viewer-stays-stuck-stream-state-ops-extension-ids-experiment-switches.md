---
id: ZN-921
title: >-
  discord: Go Live viewer stays stuck: stream state ops, extension ids,
  experiment switches
status: Review
assignee:
  - '@parallel'
created_date: '2026-10-31 09:16'
updated_date: '2026-10-31 09:40'
labels:
  - discord
  - webrtc
dependencies: []
ordinal: 615460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner 2026-10-31 real call log (discord-call.log, 10:13 run): we send 1280x720 at 2.2 Mbit/s, 354 frames, key frame every second, DAVE keyed, server asks no PLI/NACK, the viewer on the official client stays stuck. Find what keeps the viewer from decoding.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Every main-gateway op of Go Live (18, 19, 20, 22, STREAM_CREATE/UPDATE/SERVER_UPDATE, paused flag, VOICE_STATE self_stream) compared with the documented and open-source behaviour, and fixed where different
- [x] #2 Environment switches for each RTP and extension variant so the owner can try them one call at a time (header-extension ids, rid extension, no playout-delay, payload type, codec list)
- [x] #3 A loopback test that encrypts a frame with the sender path and decrypts it with a second DAVE member's decryptor, so our frames are proven openable
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Loopback (tests/t0/discord_voice_dave.sh): libdave Encryptor/Decryptor + our packetiser (video_policy.h nalUnits/rtpPayloads, now shared with Conn::sendVideo): encrypted AUs (SPS/PPS/SEI/IDR, P, zero runs) cut into single NAL and FU-A, rejoined as WebRTC's depacketiser does, decrypt equal to the original; frames are openable. Differences fixed: native header-extension ids (twcc 5, playout-delay 6, content type 7, rid 11/12 on RTX; was playout-delay on id 5, which docs.discord.food lists as transport-wide-cc and yapfast says makes the server drop every packet), op 22 right after op 18 as Discord-video-stream does, STREAM_UPDATE paused resumed (5 tries) and logged, rtc_connection_id in op 1. Experiments (default off): DISCORD_VIDEO_EXT, _PT, _CODECS, _ACTIVE, _TYPE. Order if still stuck: see backlog/later.md ZN-921 lines.
<!-- SECTION:NOTES:END -->
