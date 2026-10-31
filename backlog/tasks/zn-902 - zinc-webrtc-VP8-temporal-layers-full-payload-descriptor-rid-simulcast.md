---
id: ZN-902
title: 'zinc:webrtc: VP8 temporal layers, full payload descriptor, rid simulcast'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-30 22:59'
labels:
  - media
  - size-M
milestone: m-28
dependencies:
  - ZN-901
  - ZN-897
ordinal: 596460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Our VP8 packetizer writes PictureID (15 bit), TL0PICIDX, TID and Y (RFC 7741) and a correct N bit; libvpx with ts_number_layers 2; setParameters takes two encodings (rid h and l, the low one ~100 kbit/s at quarter size) sent with the rid header extension (RtpPacketizationConfig ridId), as Galène expects.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Galène forwards the low layer to a client that requests video-low (stats show the smaller size)
- [ ] #2 Chrome decodes the stream with the new descriptor (tools/webrtc-interop)
- [ ] #3 Encode cost of the two layers on the Mac recorded in the perf log
<!-- AC:END -->
