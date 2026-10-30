---
id: ZN-909
title: 'examples/discord: video does not show in a real call'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-30 23:42'
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
- [ ] #1 A written comparison of our video signalling, RTP packetization (H.264 FU-A/STAP-A, VP8), extensions and DAVE framing with the references, with every mismatch fixed
- [ ] #2 DISCORD_LOG=1 prints a redacted per-stream diagnostic of a call (ops, SSRCs, codecs, packets, keyframes, decode errors)
- [ ] #3 The owner sees a real person's camera and Go Live, and they see ours (owner check)
<!-- AC:END -->
