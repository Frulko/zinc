---
id: ZN-894
title: 'zinc:webrtc: network impairment harness for calls on bad links'
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-30 22:57'
updated_date: '2026-10-30 23:24'
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
- [x] #1 ZINC_WEBRTC_IMPAIR applies loss, bursts, rate cap, delay and jitter to sent packets, seeded and repeatable
- [x] #2 tests/t1/webrtc_impair.sh runs the echo call under 3 profiles (clean, 10% loss at 20 kbit/s, 2 Mbit/s to 300 kbit/s step) and prints the stats as JSON
- [x] #3 The baseline numbers of today's plugin are written in docs/reports/zinc-next-perf.md
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done. native/impair.cpp: ZINC_WEBRTC_IMPAIR='loss=,burst=,rate=,step=S:R,delay=,jitter=,queue=,seed=' applies to every SRTP/SRTCP packet a connection sends (STUN/DTLS untouched), per libjuice agent (one direction each): Gilbert-Elliott loss (burst = mean run), a bottleneck at rate with a drop-tail queue (300 ms default), a rate step, delay, uniform jitter (netem-like reordering). Seeded per agent by creation order, RTP/RTCP/jitter on separate sequences: the same seed loses the same RTP packets (ZINC_WEBRTC_IMPAIR_LOG=1 prints a digest of the first 256 decisions). Reached without editing libdatachannel: plugin.json vendorFlags force-include impair.h (beside plugin.json, so it is in the vendor archive key), which renames its juice_create/juice_send_diffserv/juice_destroy calls to the hooks; a delivery thread sends the delayed packets, destroy drops what is pending for its agent. getStats outbound-rtp gains wireBytesSent (RTP on the wire incl. IPv4/UDP/SRTP). tests/t1/webrtc_impair.sh runs clean, thin (audio low data, loss=10,rate=20k,delay=50) twice (digest equal) and step (rate=2M, 300k at 11 s) at once, 20 s each, ~30 s wall, prints a JSON line each.
Engine gap met on the way: Map<string, string | number> read in a closure aborted the lowering ('a jump of @__g0 passes a missing value') instead of reporting the known Z0005 (primitive unions, backlog/later.md): compact() now leaves a value a refused construct never defined missing when a diagnostic exists; tests/t0/union_refused_no_abort.sh.
Baseline (M1 Pro, before ZN-899/900; for docs/reports/zinc-next-perf.md, written by the coordinator): clean: audio 32.4 kbit/s payload, 52.4 on the wire, concealed 0%, video 320x240 H.264 ~45 kbit/s 30 fps, no freeze (max 95 ms between frames). thin (20 kbit/s, 10% loss, 100 ms RTT, low data mode): audio 9.9 kbit/s payload but 30 kbit/s on the wire at 20 ms packets, so the queue overflows: 34.5% of packets lost, concealed 34.5%, RTT 432 ms (300 ms of queue). step (2M then 300k): video stays ~44 kbit/s (the fake camera at 320x240 needs no more), no freeze: the profile cannot stress video until a busier source or ZN-901.
<!-- SECTION:NOTES:END -->
