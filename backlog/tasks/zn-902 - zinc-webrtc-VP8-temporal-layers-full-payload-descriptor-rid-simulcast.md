---
id: ZN-902
title: 'zinc:webrtc: VP8 temporal layers, full payload descriptor, rid simulcast'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-30 22:59'
updated_date: '2026-10-31 08:56'
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
- [x] #2 Chrome decodes the stream with the new descriptor (tools/webrtc-interop)
- [ ] #3 Encode cost of the two layers on the Mac recorded in the perf log
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Worked 2026-10-31 (agent worktree); criteria 1 and 3 stay open. Done: vendor/capi_zinc.cpp has our VP8 packetizer (ZnVp8: X, I with a 15-bit PictureID, L/T with TL0PICIDX, TID and Y when layered, N set only on frames nothing refers to; libdatachannel's set N on every inter frame) and ZnVideoOut, which carries one or two streams (rid h, rid l, each with its SSRC, sequence numbers and the rid/mid header extensions when simulcast is negotiated), keeps the last 512 packets per SSRC and answers NACKs per SSRC (ZnNackAnswer chained after the RTCP receiving session; the stock responder keys by sequence number only). libvpx two temporal layers (ts_number_layers 2, periodicity 2, 60/40 rate split; TL1 refers to LAST and updates nothing: nonref and sync). API: addTransceiver sendEncodings takes two encodings with distinct rids (video), setParameters the same count and rids, scalabilityMode L1T1/L1T2 (L1T2 the default with simulcast); the offer carries a=rid h/l (libdatachannel writes a=simulcast:send) and the mid and rid extmaps; the second stream goes out only when the answer has a=simulcast:recv and the rid extension, else the first alone. getStats: one outbound-rtp per stream with rid. setLowDataMode keeps the encodings count. Receiver: one SSRC per track (a second stream is ignored while the first goes on, taken after 1 s of silence). Also fixed from ZN-901: a NACK gap over 500 packets set the sender's key frame flag instead of letting the reassembler ask a PLI. Proof: tests/t1/webrtc_simulcast.sh (L1T2, decline, accept, low at 640x480): accept sends h 640x480 ~900 kbit/s and l 320x240 ~96 kbit/s; low (h inactive) is decoded by the peer at 320x240, so both streams and the layered descriptor decode. #2: tools/webrtc-interop --codec video/VP8 --role offer, and --simulcast (Chrome declines the rids, decodes the layered stream: 49 frames 320x240); tests/t2/webrtc_interop.sh runs it. Encode cost (#3, for the perf log; machine load 10-12 from other trees, not a quiet machine): 1280x720 noisy fake camera, VP8 2.45 Mbit/s: L1T1 10.4-11.9 ms/frame, L1T2 8.9-9.8 ms/frame (TL1 frames update no reference: no extra cost); simulcast h 1280x720 8.9 ms + l 640x360 2.4 ms per frame (+27%). Open: #1 needs ZN-897 (Galène client) and ZN-895 (Galène as a tool): run examples/webrtc-call against Galène, publish with sendEncodings [{rid:'h'},{rid:'l',scaleResolutionDownBy:2,maxBitrate:100000}], request video-low from a second client and check its inbound-rtp frameWidth is the low size. #3: the coordinator writes the numbers above to docs/reports/zinc-next-perf.md. Limits: simulcast is VP8 only; a libdatachannel peer with several tracks drops the unsignalled SSRCs of a simulcast offer (libdatachannel routes by a=ssrc only, which it leaves out with rids), so simulcast is for a media server.
<!-- SECTION:NOTES:END -->
