---
id: ZN-634
title: 'Network log: UDP, Unix sockets, wss and the server side (zinc:net serve)'
status: Backlog
assignee: []
created_date: '2026-10-10 14:27'
labels:
  - devtools
  - size-M
milestone: m-20
dependencies: []
ordinal: 90000
updated_date: '2026-10-25 01:53'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The log of ZN-370 covers fetch, MQTT, outgoing TCP and ws. (Follow-up of ZN-370, D60.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 each of UDP, Unix sockets, wss and served requests shows in the Network domain and in the HAR, with a test
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: dropped. Network-log of UDP/Unix/wss/served requests: no user asks; one later.md line. Evidence: src/host/netlog.cpp covers fetch, MQTT, TCP, ws Verifier: src/host/netlog.cpp:29 logs Http, Ws, Mqtt and Tcp; UDP, Unix sockets, wss and served requests are a DevTools completeness item with no user asking, which AGENTS.md puts in backlog/later.md as one line.
<!-- SECTION:NOTES:END -->
