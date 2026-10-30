---
id: ZN-899
title: >-
  zinc:webrtc: Opus FEC decoding, loss-driven FEC, DTX, 60 ms packets, deep PLC
  and DRED
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-30 22:58'
updated_date: '2026-10-30 23:39'
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
<!-- SECTION:NOTES:END -->
