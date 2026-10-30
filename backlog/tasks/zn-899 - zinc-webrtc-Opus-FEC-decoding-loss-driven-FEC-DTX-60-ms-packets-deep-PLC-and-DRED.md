---
id: ZN-899
title: >-
  zinc:webrtc: Opus FEC decoding, loss-driven FEC, DTX, 60 ms packets, deep PLC
  and DRED
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-30 22:58'
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
- [ ] #3 Audio stays under 20 kbit/s on the wire in the low-data mode (stats); plugin size delta recorded
<!-- AC:END -->
