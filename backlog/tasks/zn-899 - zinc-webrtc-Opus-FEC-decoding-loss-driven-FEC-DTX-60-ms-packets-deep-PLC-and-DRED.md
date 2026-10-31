---
id: ZN-899
title: >-
  zinc:webrtc: Opus FEC decoding, loss-driven FEC, DTX, 60 ms packets, deep PLC
  and DRED
status: Review
assignee:
  - '@parallel'
created_date: '2026-10-30 22:58'
updated_date: '2026-10-31 08:05'
labels:
  - media
  - perf
  - size-M
milestone: m-28
dependencies:
  - ZN-894
  - ZN-891
ordinal: 593460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
On a missing packet with the next one present, decode with decode_fec=1; OPUS_SET_PACKET_LOSS_PERC follows the loss of receiver reports; DTX on in the low-data mode; ptime 20/40/60 chosen from the estimate (a=maxptime honoured); libopus built with --enable-deep-plc and --enable-dred (Opus 1.6 models), DRED negotiated only between Zinc peers; size cost measured.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Under 10% random loss at 20 kbit/s (K1) concealed samples <= 3% and no gap > 120 ms
- [ ] #2 Under 20% loss in bursts of 3, concealed <= 6%, <= 3% with DRED between two Zinc clients
- [x] #3 Audio stays under 20 kbit/s on the wire in the low-data mode (stats); plugin size delta recorded
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done so far (commit feat(webrtc): decode Opus FEC and DRED, send 60 ms packets): libopus 1.6.1 built with deep PLC and DRED (DEEP_PLC_SOURCES + DRED_SOURCES and models vendored, ENABLE_DEEP_PLC/ENABLE_DRED; +2.1 MB plugin, 4.99 -> 7.08 MB, macOS arm64). Decoder complexity 5 (neural PLC). Receive: a loss before a packet is sized by that packet's duration (60 ms packets conceal 60 ms, not 20); the packet just before comes from this one's LBRR only when opus_packet_has_lbrr says it is there (the old code counted a FEC decode with no LBRR, i.e. plain PLC, as recovered); earlier packets from DRED (opus_dred_parse / opus_decoder_dred_decode_float) as far back as it reaches, by 20 ms; the rest deep PLC. getStats inbound: fecPacketsReceived, fecSamples, dredSamples (not in concealedSamples). Send: OPUS_SET_PACKET_LOSS_PERC follows the peer's RR fractionLost held at its peaks (up at once, down a tenth per report, floor 2%); ptime 60 ms at <= 16 kbit/s, 40 at <= 24, else 20, capped by the peer's a=maxptime; DRED 200 ms only when the peer's opus fmtp has x-zinc-dred=1 (ours offers it; ZINC_WEBRTC_DRED=0 turns it off to measure). DTX in the low data mode stays from ZN-891.
Measured with tests/t1/webrtc_impair.sh (20 s, fake mic, M1 Pro), before -> after:
- thin (low data, 20 kbit/s link, 10% loss, 100 ms RTT): wire 30 -> 16.7 kbit/s (AC#3), packets lost 34.5% -> 10.2% (the queue no longer overflows), concealed 34.5% -> 10.2% (deep PLC), longest silent gap 40 -> 10 ms, RTT 432 -> 179 ms.
- 10% random loss at the normal rate (32 kbit/s): concealed 3.6%, FEC 6.5%.
- burst (20% in runs of 3, normal rate): FEC+deep PLC only (ZINC_WEBRTC_DRED=0) concealed 12.9%; with DRED between Zinc peers concealed 5.3%, FEC 5.0%, DRED 9.9% (actual loss 24.2%).
Open (#1, #2): at 10 kbit/s libopus codes no LBRR at all and no DRED (decide_fec needs equiv rate > 13-15 kbit/s in NB at 10-25% loss; compute_dred_bitrate takes its share above 20 kbit/s with FEC, 12 without), so at a 20 kbit/s cap the loss can only be concealed (10%, not 3%); a 60 ms payload of ~15 kbit/s would carry LBRR but costs ~23 kbit/s on the wire. ≤6% for bursts without DRED is above what FEC can do (it repairs one packet per run: ~1/3 of the losses). Next: decide whether the 20 kbit/s target allows ~23 kbit/s with FEC, or measure with ViSQOL (later.md) since deep PLC is audibly better than the count says; the burst case could reach 3% with a longer DRED budget at 32 kbit/s (raise the audio rate under loss, as libwebrtc's loss-based controller does).

Session 2 (raise the audio rate under loss): with no maxBitrate set and a DRED peer, the Opus rate follows the held loss (32 kbit/s + 1.6 kbit/s per % from 5%, 64 kbit/s at most): libopus gives DRED frac x (rate - 20 kbit/s) with FEC on, so at 32 kbit/s and 10% loss DRED had ~9 bytes a packet (none coded). The jitter buffer covers runs of losses up to 200 ms (was 120), as far back as DRED reaches: merged runs of 5-7 packets were played dry before the packet carrying their DRED came. webrtc_impair.ts prints concealedPct2 (the second half: after the first receiver report, one a second, has set the FEC, DRED and rate; before it the first ~1.5 s go unrepaired). Measured (20 s, M1 Pro, load 5-12 from other trees), before -> after: burst (20% in runs of 3, Zinc peers) concealed 8.0/5.3 -> 3.2% (2.8% second half), FEC 4.7, DRED 16.3, payload 37 -> 71 kbit/s, mouth to ear 200 -> 258 ms (only while long bursts are seen); 10% random loss, normal rate: concealed 3.7 -> 1.0% (0% second half), 32.7 -> 62 kbit/s; burst without DRED (ZINC_WEBRTC_DRED=0, the browser case): 19.7% (FEC rebuilds one packet of each run: ~1/5 of the losses). thin unchanged: 10.2%. clean, step, jitter, calm unchanged (tests/t1/webrtc_impair.sh passes).
Why Review (a person must revise two targets of docs/reports/webrtc-selfhost-design.md 6.1, both out of reach of libopus as measured):
- #1 (20 kbit/s cap, 10% loss, <= 3%): with 60 ms packets the headers take 7.7 kbit/s, leaving ~12 kbit/s of Opus; libopus codes LBRR only above ~17 kbit/s equivalent at 10% loss (decide_fec: 13 kbit/s NB x (125-loss)% / (1 - loss/(6 loss+10))) and DRED only above 12 kbit/s + ~2 kbit/s of DRED (2 chunks minimum). Tried: 80 ms packets at 16 kbit/s carry LBRR (wire 18.2 kbit/s, concealed 6.4%, 3.6% second half) but mouth to ear 392 ms; 120 ms at 14 kbit/s: 9.6%, 422 ms. Proposal: concealed <= 11% with deep PLC (measured 10.2%, longest gap 10 ms) or a ViSQOL score target.
- #2 (<= 6% with FEC + deep PLC only): FEC repairs one packet per run of 3, so ~16-20% concealed whatever the rate; a browser peer would need RFC 2198 RED (Chrome's audio/red, distance 2) to meet it. The DRED half (<= 3% between Zinc clients) is met in steady state (2.8%), 3.2% over the whole run.
<!-- SECTION:NOTES:END -->
