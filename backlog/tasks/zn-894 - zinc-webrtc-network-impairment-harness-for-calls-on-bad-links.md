---
id: ZN-894
title: 'zinc:webrtc: network impairment harness for calls on bad links'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-30 22:57'
labels:
  - media
  - net
  - size-S
milestone: m-28
dependencies: []
ordinal: 588460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Every resilience target of docs/reports/webrtc-selfhost-design.md §6.1 needs a repeatable bad network without root (no dummynet). ZINC_WEBRTC_IMPAIR='loss=10,burst=3,rate=20k,delay=50,jitter=30,seed=1' applies seeded loss, Gilbert-Elliott bursts, a token-bucket rate cap, delay and jitter to the outgoing SRTP/SRTCP packets of the native plugin (the loopback and real peers). A test script runs the webrtc-call echo for 20 s under a profile and prints getStats numbers (concealedSamples, packetsLost, freezes, bitrate) as one JSON line.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 ZINC_WEBRTC_IMPAIR applies loss, bursts, rate cap, delay and jitter to sent packets, seeded and repeatable
- [ ] #2 tests/t1/webrtc_impair.sh runs the echo call under 3 profiles (clean, 10% loss at 20 kbit/s, 2 Mbit/s to 300 kbit/s step) and prints the stats as JSON
- [ ] #3 The baseline numbers of today's plugin are written in docs/reports/zinc-next-perf.md
<!-- AC:END -->
