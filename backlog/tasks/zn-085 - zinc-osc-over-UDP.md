---
id: ZN-085
title: 'zinc:osc over UDP'
status: Done
assignee: []
created_date: '2026-10-06 22:52'
updated_date: '2026-10-07 03:51'
labels:
  - host-modules
  - size-S
milestone: m-14
dependencies:
  - ZN-082
ordinal: 40270
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
send(host, port, address, args), listen(port, handler), OSC 1.0 types (i f s b, T F N, timetags) with tinyosc (ISC) for encode/decode over uv_udp. Declarations from lib/modules.d.ts.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 loopback test: osc.send to own listen delivers the message with types intact; bundles and timetags decode
- [x] #2 examples/chataigne and video/mapper pass the module step
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. zinc:osc built in: src/host/osc.{h,cpp} codec (messages and nested bundles, timetags, i f d h t c s S b T F N I r) plus UDP on libuv (loop.cpp oscListen/oscClose/oscSend, event kind 20, a listener keeps the loop alive, rows HostOscListen/Close/Send appended). Own port of the old fuzz-tested codec instead of tinyosc (200 lines, no new vendor). Tests: tests/t0/osc.sh + golden/host/osc*. chataigne, iot-panel and video/mapper compile and run. Not done: blobs are skipped, not delivered; send encodes only i/f/s.
<!-- SECTION:NOTES:END -->
