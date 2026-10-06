---
id: ZN-085
title: 'zinc:osc over UDP'
status: Backlog
assignee: []
created_date: '2026-10-06 22:52'
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
- [ ] #1 loopback test: osc.send to own listen delivers the message with types intact; bundles and timetags decode
- [ ] #2 examples/chataigne and video/mapper pass the module step
<!-- AC:END -->
