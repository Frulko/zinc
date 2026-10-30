---
id: ZN-893
title: 'zinc:net: WebSocket server, TLS speed and automatic certificates'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-30 22:47'
labels:
  - net
  - perf
  - size-L
milestone: m-28
dependencies:
  - ZN-892
ordinal: 587460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The signalling of the self-hosted call server needs a WebSocket server in zinc:net (RFC 6455, permessage-deflate optional, backpressure, ping/pong, limits), measured against Node's ws and Bun's built-in server (echo, many idle connections, memory per connection). TLS speed checked against Node and Bun (handshakes/s, session resumption, TLS 1.3); automatic certificates from Let's Encrypt (ACME http-01) for a self-hosted server. Proven libraries only (a vendored WebSocket parser or uWebSockets if it scores better per RULES.md §4).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A WebSocket server in zinc:net with backpressure, ping/pong and limits, documented, with a test on every engine
- [ ] #2 Echo throughput, latency and memory per idle connection measured against Node ws and Bun
- [ ] #3 TLS handshakes/s and resumption measured; ACME http-01 gets and renews a certificate (tested against a local Pebble server)
<!-- AC:END -->
