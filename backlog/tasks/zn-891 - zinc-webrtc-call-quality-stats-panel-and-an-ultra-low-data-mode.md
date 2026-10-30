---
id: ZN-891
title: 'zinc:webrtc: call quality stats panel and an ultra low data mode'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-30 22:38'
labels:
  - media
  - net
  - size-M
milestone: m-28
dependencies: []
ordinal: 585460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner wants to see what goes wrong in a call (lost packets, jitter, round trip, bitrate, network quality) and a mode for poor connections. zinc:webrtc gets a getStats() like the browser's RTCPeerConnection.getStats (inbound/outbound RTP: packetsLost, jitter, roundTripTime, bytes, frames, framesDropped, availableOutgoingBitrate, codec) and a quality score; a reusable kit panel shows it live; an ultra low data mode: Opus at 6-12 kbps with DTX and in-band FEC, video off or at a very low size and rate, chosen by hand or switched on when the score drops. examples/webrtc-call shows the panel and the mode. The same for plugins/discord-voice comes after ZN-875 lands.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 getStats() in zinc:webrtc returns inbound and outbound RTP stats and a quality score, documented
- [ ] #2 A reusable kit panel shows the stats live; examples/webrtc-call opens it from the call
- [ ] #3 Ultra low data mode: Opus 6-12 kbps with DTX and FEC, video off or minimal, manual or automatic on a poor score; the bitrate measured in the demo
- [ ] #4 plugins/discord-voice exposes the same stats and mode, shown in the Discord call view
<!-- AC:END -->
