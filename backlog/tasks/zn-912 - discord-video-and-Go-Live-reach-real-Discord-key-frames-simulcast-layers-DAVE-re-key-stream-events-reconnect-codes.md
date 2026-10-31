---
id: ZN-912
title: >-
  discord: video and Go Live reach real Discord (key frames, simulcast layers,
  DAVE re-key, stream events, reconnect codes)
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-31 08:13'
updated_date: '2026-10-31 08:26'
labels:
  - discord
  - webrtc
dependencies: []
ordinal: 606460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner 2026-10-31: video and screen share load forever against real Discord and the call drops after a while. Eight defects found in docs/reports/discord-video-fix-2026-10-31.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Key frames: re-armed when DAVE drops a frame or its key changes, at least one per second, one on FIR and when the server's op 15 for our stream goes from 0 to more than 0
- [x] #2 Received camera: every streams[].ssrc maps to its user, the lower simulcast layer is decoded
- [x] #3 DAVE keeps the full member list so a second change of the group re-keys existing members
- [x] #4 Go Live watch connects once STREAM_CREATE and STREAM_SERVER_UPDATE arrived, in either order
- [x] #5 Voice gateway resumes only on the codes that allow it, re-identifies once after 4006 or 4009, answers op 3 at once
- [x] #6 Server NACKs are answered with retransmissions
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done: defects 1-6 of docs/reports/discord-video-fix-2026-10-31.md (7-8 only the Go Live receiver report). Proven by tests/t0/discord_call_logic.sh and tests/run --only discord_voice (golden: op 15 now asks the layer's own quality). Only a real call proves: SFU relaying PLI/FIR or op 15 to us, key frames reaching viewers, RTX accepted (PT 102 on rtx_ssrc), DAVE re-key with 3+ members (change map folded by signature; no libdave vector test), 4006/4009 re-identify. Not done: receive-side RTX mapping, op 24 epoch>1, header-extension ID experiment. New logs: voice key frame for a new viewer, stream create/server update/delete, out video nack-in/fir-in/rtx-out, voice camera on layers.
<!-- SECTION:NOTES:END -->
