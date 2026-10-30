---
id: ZN-891
title: 'zinc:webrtc: call quality stats panel and an ultra low data mode'
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-30 22:38'
updated_date: '2026-10-30 23:22'
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
- [x] #4 plugins/discord-voice exposes the same stats and mode, shown in the Discord call view
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done (#1-#3): zinc:webrtc getStats() gains inbound framesDropped (incomplete or pre-key-frame video frames, decode failures) and candidate-pair availableOutgoingBitrate (peer REMB, else the encoders' target; audio outbound now reports its targetBitrate). New Zinc API: CallQuality.update(report) -> QualitySample (quality good/fair/poor from an E-model MOS: >=4.0 good, >=3.6 fair; loss = max(own interval loss, peer fractionLost), rtt, jitter, send/recv/available kbit/s, codecs), history, poorFor; mosOf(); setLowDataMode(pc, on, 'tiny'|'off') via setParameters (audio maxBitrate 10000; video 1/4 size, 5 fps, 60 kbit/s, or inactive; off restores the saved encodings). Native: an audio sender's maxBitrate now changes the Opus encoder live; <=16 kbit/s switches on DTX (1-2 byte frames not sent), voice signal, wideband max, FEC for 15% loss; the receiver decodes the last lost frame from the next packet's in-band FEC. Same helpers in plugins/webrtc/web. Kit: lib/std/kit/callstats.tsx CallStats (badge with MOS, loss/RTT/out rows with sparklines on a Canvas via gfx.stroke, in + jitter, children slot). Demo: side panel in a call shows CallStats with an Ultra low data switch (key L) and 'Switch on when poor' (auto after 5 poor readings).
Measured (M1 Pro, fake camera 640x480 / fake mic tone, payload bytes): demo normal audio 32.4 kbit/s, all out 122.7 kbit/s (H264 640x480 30 fps); low data audio 9.9 kbit/s, all out 22.6 kbit/s, video 160x120 5 fps. tests/golden/host/webrtc_quality.ts (320x240): normal audio 32.4 video 48.3; low audio 9.9 video 16.6; silence under DTX 0.15; video off 0.00; back to 32.4 / 47.0.
Tests: tests/run --only webrtc_quality (new), webrtc_call (session golden + 3 low-data lines; idle hashes unchanged: the panel shows only in a call; frame looked at), webrtc_media pass.
Open: #4 (plugins/discord-voice stats + mode, Discord call view) waits for ZN-875 (Go Live), which edits plugins/discord-voice and examples/discord. Next: expose CallQuality/setLowDataMode equivalents on the discord-voice connection (its Opus encoder: the same opusSetBitrate settings) and put CallStats in examples/discord's call view.

2026-10-31 (#4, parallel agent): zinc:discord-voice measures its connection the way zinc:webrtc does. Native: RTCP each second, a sender report for our voice (and our video) with a receiver report block per stream received (RFC 3550 A.1/A.8: loss, interarrival jitter, LSR/DLSR); the server's blocks on ours give fraction lost, packets lost, jitter and round trip (LSR/DLSR); a video block over 10% lost lowers the H.264 bitrate by half the loss (min 50 kbit/s, VideoEncoder::setRate, no new key frame), under 2% it climbs 8% a report. setLimits(): Opus through media::opusEncoder/opusSetBitrate (10 kbit/s: DTX, voice, wideband, FEC 15%; 1-2 byte DTX frames not sent), video frames scaled 1/k and rate-capped. TS: VoiceConnection.getStats() -> Map<string, RTCStats> (outbound-rtp, remote-inbound-rtp, inbound-rtp, candidate-pair, codec; ids by SSRC so the call's connections merge), setLowDataMode(on) (camera 1/4, 5 fps, 60 kbit/s; Go Live 1/2, 5 fps, 150 kbit/s). RTCStats, QualitySample, mosOf and CallQuality moved to plugins/webrtc/quality.ts (zinc:webrtc/quality, no native code; zinc:webrtc re-exports them) so discord-voice uses them without building the webrtc plugin (a Map<string, Class> does not convert to Map<string, Interface> in Zinc). examples/discord: bars by 'Voice Connected' (green/yellow/red, 3/2/1) open the CallStats panel with 'Ultra low data' and 'Switch on when poor'; Settings > Voice & audio > Poor connection has both (stored: lowData, autoLowData); auto: CallQuality.poorFor >= 5 switches it on for the call. Fake Discord answers our sender reports with a receiver report (LSR echoed; our Go Live stream reported 25% lost).
Measured (fake Discord on loopback, fake tone and camera, payload bytes): voice 64.4 kbit/s, ultra low data 9.6, back 64.4; camera 640x360 at 553 kbit/s target, ultra low data 160x90 at 13.6 kbit/s; Go Live 1152x720 target 1990.7 kbit/s lowered to 1741.8 by the first loss reports.
Tests: tests/run --only discord_voice (session golden +5 lines, settings JSON; stats and settings frames looked at), discord, webrtc_quality, webrtc_call pass.
Not proven: whether Discord's real servers answer our sender reports and send receiver reports on the UDP path (a real call, owner's throwaway account); the automatic switch is not in the scripted session (the fake reports no loss on the voice stream).
<!-- SECTION:NOTES:END -->
