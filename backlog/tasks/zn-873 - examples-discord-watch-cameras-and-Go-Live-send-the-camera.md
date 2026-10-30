---
id: ZN-873
title: 'examples/discord: watch cameras and Go Live, send the camera'
status: Backlog
assignee: []
created_date: '2026-10-30 14:55'
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
