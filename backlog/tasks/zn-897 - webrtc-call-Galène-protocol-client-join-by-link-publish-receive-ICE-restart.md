---
id: ZN-897
title: >-
  webrtc-call: Galène protocol client (join by link, publish, receive, ICE
  restart)
status: Backlog
assignee: []
created_date: '2026-10-30 22:58'
labels:
  - net
  - media
  - size-M
milestone: m-28
dependencies:
  - ZN-895
ordinal: 591460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
src/galene.ts in examples/webrtc-call speaks Galène protocol v2 on zinc:socket WebSocket and zinc:webrtc: .status, handshake, join with token, one PeerConnection per stream (publish camera and screen, answer down streams), request per tile (video for the speaker, video-low for thumbnails, audio only for hidden tiles), ping every 10 s, reconnect with backoff, renegotiate with ICE restart on ICE failure; a grid of remote tiles. The app takes a link (CALL_LINK or a field). zinc:webrtc gains restartIce() where it is missing.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A Zinc app and Chrome (Galène web client, tools/cdp.py) see and hear each other through a local Galène
- [ ] #2 Three participants (2 Zinc, 1 Chrome) with request-driven layers; hiding a tile stops its video bytes (stats)
- [ ] #3 Killing the network for 5 s (K1 profile or interface down) recovers media without rejoining
<!-- AC:END -->
