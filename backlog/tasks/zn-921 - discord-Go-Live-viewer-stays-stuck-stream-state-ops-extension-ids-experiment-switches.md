---
id: ZN-921
title: >-
  discord: Go Live viewer stays stuck: stream state ops, extension ids,
  experiment switches
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-31 09:16'
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
- [ ] #1 Every main-gateway op of Go Live (18, 19, 20, 22, STREAM_CREATE/UPDATE/SERVER_UPDATE, paused flag, VOICE_STATE self_stream) compared with the documented and open-source behaviour, and fixed where different
- [ ] #2 Environment switches for each RTP and extension variant so the owner can try them one call at a time (header-extension ids, rid extension, no playout-delay, payload type, codec list)
- [ ] #3 A loopback test that encrypts a frame with the sender path and decrypts it with a second DAVE member's decryptor, so our frames are proven openable
<!-- AC:END -->
