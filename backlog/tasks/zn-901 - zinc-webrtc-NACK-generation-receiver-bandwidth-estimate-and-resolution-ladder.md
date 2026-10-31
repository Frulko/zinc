---
id: ZN-901
title: >-
  zinc:webrtc: NACK generation, receiver bandwidth estimate and resolution
  ladder
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-30 22:58'
updated_date: '2026-10-31 08:35'
labels:
  - media
  - net
  - perf
  - size-M
milestone: m-28
dependencies:
  - ZN-894
ordinal: 595460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The receiver sends generic NACKs (RFC 4585) for gaps, retries with RTT, gives up into PLI; a receiver-side estimate ported from libwebrtc's single-stream remote bitrate estimator (inter-arrival, trendline/overuse detector, AIMD; BSD-3, files listed in PIN) drives the REMB it sends instead of a fixed value; the sender uses min(REMB, loss-based) and a ladder (720p30, 360p30, 360p15, 180p15, 90p7, off) with hysteresis; libdatachannel's VP8 N bit on delta frames is not trusted.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 At 5% loss: no freeze > 500 ms and <= 1 PLI per second (stats)
- [x] #2 On a 2 Mbit/s to 300 kbit/s step the sender is under the cap in <= 2 s and back to full rate in <= 10 s after it lifts
- [x] #3 The resolution and frame rate follow the ladder (stats frameWidth, framesPerSecond)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done (agent worktree, 2026-10-31). Receiver: NackList (plugins/webrtc/native/bwe.cpp) asks each missing packet every round trip (RTT from the transport, 100 ms by default) up to 10 times or 1 s, then gives it up to the PLI path; the NACK goes out through vendor/capi_zinc.cpp (libdatachannel's capi.cpp plus a handler chained last that keeps the send callback, since rtcSendMessage on a track goes through the packetizer). The reassembler waits clamp(3*RTT+40, 100, 600) ms for a hole. PLI at most once a second. Receive estimate: libwebrtc InterArrival + TrendlineEstimator + AimdRateControl + LinkCapacityEstimator (commit da453efd, BSD-3), sent as REMB via rtcRequestBitrate. Zinc changes: the trendline in place of the Kalman filter (false over/underuse on a jittery link in the sim), a climb at 1.25/s back to the peak of the last 60 s and the capacity estimate dropped 3 s after the last overuse (8%/s took over 20 s to recover). Sender: min(REMB, loss-based); the loss is max(RR fraction, unique NACKed seqs / packets sent) because retransmissions on the same SSRC hide repaired losses from the RR. Ladder 720p30, 360p30, 360p15, 180p15, 90p7, off: floor 1 Mbit/s*(px*fps/720p30)^0.75, start min(1.5*floor, 0.95*full); steps down only when the limiting source fell in the last 3 s and the VP8 QP is over 60 (or unknown, H.264), up after 1.5 s over the next start or 5 s calm over its floor. The VP8 N bit is not used (the NackList works on sequence numbers). Proof, ZINC_WEBRTC_IMPAIR, VP8, machine load 7-15 from other trees: 5% loss 640x360 20 s: before (old plugin) 2 freezes, max 665 ms, 23 PLIs; after 0 freezes, max 315 ms, 0 PLIs, about 100 NACK repairs (H.264: max 300 ms, 0 PLIs). Step 2M->300k->2M 640x480: under the cap in 1148 ms (H.264 1105), back to full in 7880 ms (H.264 8499); rungs 480p30, 360p15, 180p15, 360p15, 480p30. Ladder 4M->900k->400k->160k->50k 720p: 720p30, 360p30, 180p15, 360p15, 180p15, 90p7. Sim (tests/t0/webrtc_bwe_sim.sh): capMs 1022, recoverMs 6268. Tests: webrtc_bwe_sim (T0), webrtc_bwe (T1, measures time: run alone); webrtc, webrtc_media, webrtc_quality, webrtc_impair pass; driver smoke on interpreter, AOT and QuickJS. Not proven: timing on a quiet machine. Limits: a big step still freezes 2-4 s (REMB-only GCC over-reacts while the queue drains; transport-cc would fix it), H.264 has no QP for the ladder.
<!-- SECTION:NOTES:END -->
