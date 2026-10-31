---
id: ZN-912
title: >-
  discord: video and Go Live reach real Discord (key frames, simulcast layers,
  DAVE re-key, stream events, reconnect codes)
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-31 08:13'
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
- [ ] #1 Key frames: re-armed when DAVE drops a frame or its key changes, at least one per second, one on FIR and when the server's op 15 for our stream goes from 0 to more than 0
- [ ] #2 Received camera: every streams[].ssrc maps to its user, the lower simulcast layer is decoded
- [ ] #3 DAVE keeps the full member list so a second change of the group re-keys existing members
- [ ] #4 Go Live watch connects once STREAM_CREATE and STREAM_SERVER_UPDATE arrived, in either order
- [ ] #5 Voice gateway resumes only on the codes that allow it, re-identifies once after 4006 or 4009, answers op 3 at once
- [ ] #6 Server NACKs are answered with retransmissions
<!-- AC:END -->
