---
id: ZN-891
title: 'zinc:webrtc: call quality stats panel and an ultra low data mode'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-30 22:38'
updated_date: '2026-10-30 22:54'
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
- [x] #1 getStats() in zinc:webrtc returns inbound and outbound RTP stats and a quality score, documented
- [x] #2 A reusable kit panel shows the stats live; examples/webrtc-call opens it from the call
- [x] #3 Ultra low data mode: Opus 6-12 kbps with DTX and FEC, video off or minimal, manual or automatic on a poor score; the bitrate measured in the demo
- [ ] #4 plugins/discord-voice exposes the same stats and mode, shown in the Discord call view
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done (#1-#3): zinc:webrtc getStats() gains inbound framesDropped (incomplete or pre-key-frame video frames, decode failures) and candidate-pair availableOutgoingBitrate (peer REMB, else the encoders' target; audio outbound now reports its targetBitrate). New Zinc API: CallQuality.update(report) -> QualitySample (quality good/fair/poor from an E-model MOS: >=4.0 good, >=3.6 fair; loss = max(own interval loss, peer fractionLost), rtt, jitter, send/recv/available kbit/s, codecs), history, poorFor; mosOf(); setLowDataMode(pc, on, 'tiny'|'off') via setParameters (audio maxBitrate 10000; video 1/4 size, 5 fps, 60 kbit/s, or inactive; off restores the saved encodings). Native: an audio sender's maxBitrate now changes the Opus encoder live; <=16 kbit/s switches on DTX (1-2 byte frames not sent), voice signal, wideband max, FEC for 15% loss; the receiver decodes the last lost frame from the next packet's in-band FEC. Same helpers in plugins/webrtc/web. Kit: lib/std/kit/callstats.tsx CallStats (badge with MOS, loss/RTT/out rows with sparklines on a Canvas via gfx.stroke, in + jitter, children slot). Demo: side panel in a call shows CallStats with an Ultra low data switch (key L) and 'Switch on when poor' (auto after 5 poor readings).
Measured (M1 Pro, fake camera 640x480 / fake mic tone, payload bytes): demo normal audio 32.4 kbit/s, all out 122.7 kbit/s (H264 640x480 30 fps); low data audio 9.9 kbit/s, all out 22.6 kbit/s, video 160x120 5 fps. tests/golden/host/webrtc_quality.ts (320x240): normal audio 32.4 video 48.3; low audio 9.9 video 16.6; silence under DTX 0.15; video off 0.00; back to 32.4 / 47.0.
Tests: tests/run --only webrtc_quality (new), webrtc_call (session golden + 3 low-data lines; idle hashes unchanged: the panel shows only in a call; frame looked at), webrtc_media pass.
Open: #4 (plugins/discord-voice stats + mode, Discord call view) waits for ZN-875 (Go Live), which edits plugins/discord-voice and examples/discord. Next: expose CallQuality/setLowDataMode equivalents on the discord-voice connection (its Opus encoder: the same opusSetBitrate settings) and put CallStats in examples/discord's call view.
<!-- SECTION:NOTES:END -->
