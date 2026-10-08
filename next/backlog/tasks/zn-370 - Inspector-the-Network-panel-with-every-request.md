---
id: ZN-370
title: 'Inspector: the Network panel with every request'
status: Backlog
assignee: []
created_date: '2026-10-08 15:16'
labels:
  - devtools
  - net
  - size-M
milestone: m-20
dependencies: []
ordinal: 50120
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The CDP Network domain for fetch, zinc:net http, WebSockets, MQTT and sockets: requestWillBeSent, responseReceived with headers and status, loadingFinished with sizes and timings (DNS, connect, TLS, first byte), getResponseBody, WebSocket frames; plus a HAR export (`zinc run --har out.har`).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 a program doing fetch, a WebSocket and an MQTT publish shows them in DevTools' Network panel with bodies (scripted CDP test)
- [ ] #2 the HAR file opens in Chrome and lists the same requests
- [ ] #3 TLS requests show their timings without exposing secrets (headers marked sensitive are masked)
<!-- AC:END -->
