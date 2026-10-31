---
id: ZN-909
title: 'examples/discord: video does not show in a real call'
status: Review
assignee:
  - '@parallel'
created_date: '2026-10-30 23:42'
updated_date: '2026-10-31 00:16'
labels:
  - media
  - net
  - size-M
milestone: m-28
dependencies:
  - ZN-873
ordinal: 603460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner, real call with a person on the official client: the video stream does not load (camera and/or Go Live). Built against the fake Discord only (ZN-873, ZN-875), with guesses noted there (rtpsize RTCP framing, op 15 shape, stream type 'screen' vs 'video', op 22, BT.601). Compare our voice/video signalling and RTP with the documented protocol and with open-source implementations that interoperate with the official client (docs.discord.food voice and video pages, dank074/Discord-video-stream, discord.js voice, Discord's own DAVE protocol docs and libdave for per-codec unencrypted ranges), fix every mismatch, and add a redacted diagnostic log (DISCORD_LOG=1: voice gateway ops in and out, SSRCs, codecs, RTP/RTCP counters per stream, decoder errors; never tokens, session ids, keys or secrets) that the owner can send back.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A written comparison of our video signalling, RTP packetization (H.264 FU-A/STAP-A, VP8), extensions and DAVE framing with the references, with every mismatch fixed
- [x] #2 DISCORD_LOG=1 prints a redacted per-stream diagnostic of a call (ops, SSRCs, codecs, packets, keyframes, decode errors)
- [ ] #3 The owner sees a real person's camera and Go Live, and they see ours (owner check)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-31 (parallel agent) Compared with docs.discord.food, Discord-video-stream (last UDP version), libdave, dave-protocol, discord.js, WebRTC: docs/reports/discord-video-protocol.md. Fixed: op 12 (no stream) and op 5 (speaking 0) sent at Ready on every connection (Invalid SSRC rule: a viewer without camera and every Go Live watch connection never sent them, the likeliest cause); Go Live speaking 2 while streaming; op 12 stream type from Ready ('video'); playout-delay element 0x52 00 00 00 (3 bytes, was a 2-byte element WebRTC rejects); keyframe_interval of op 4 honoured; RTP padding stripped; NAL split takes one zero of a 4-byte start code (WebRTC FindNaluIndices; DAVE ciphertext may end in 0). Diagnostic: DISCORD_LOG=1 prints voice-gw[video|screen] in/out (token, session_id, secret_key, ip, address redacted; DAVE binary as op+size) and voice-rtp counters every 5 s per SSRC (packets, bytes, lost, key frames, NAL types, transport/DAVE/decoder failures, other payload types). Checked in tests/t1/discord_voice.sh (runs with DISCORD_LOG=1, fails on the fake's tokens, session id or an unredacted secret_key). Fake Discord now drops media of a connection that has not sent op 5 and op 12. discord_voice and discord pass; frames looked at. AC #3 is the owner's real call: DISCORD_LOG=1 build/zinc --background run examples/discord > discord-call.log 2>&1 (join, camera, Go Live, watch theirs), then send discord-call.log. Open: playout-delay id 5 (B) vs 6 (docs table); PLI relay over UDP; colour matrix.
<!-- SECTION:NOTES:END -->
