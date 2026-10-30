---
id: ZN-901
title: >-
  zinc:webrtc: NACK generation, receiver bandwidth estimate and resolution
  ladder
status: Backlog
assignee: []
created_date: '2026-10-30 22:58'
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
- [ ] #1 At 5% loss: no freeze > 500 ms and <= 1 PLI per second (stats)
- [ ] #2 On a 2 Mbit/s to 300 kbit/s step the sender is under the cap in <= 2 s and back to full rate in <= 10 s after it lifts
- [ ] #3 The resolution and frame rate follow the ladder (stats frameWidth, framesPerSecond)
<!-- AC:END -->
