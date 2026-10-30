---
id: ZN-892
title: 'zinc:net: a fast, hardened HTTP server measured against Node and Bun'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-30 22:47'
labels:
  - net
  - perf
  - size-L
milestone: m-28
dependencies: []
ordinal: 586460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner wants Zinc's server side at the level of Node and Bun, fast, and running everywhere. Today src/host/http.cpp is libuv + llhttp, HTTP/1.1, the whole body buffered, an idle timer, no measured throughput. Add a benchmark (oha or wrk on this Mac against Node and Bun: hello world, JSON, static file, keep-alive, TLS), then make it fast (zero-copy writes, writev, keep-alive and pipelining, fewer allocations and string copies per request, the event path to the program) and hardened (limits on header size, body size, connections per IP, request rate, slowloris, streaming bodies), portable (libuv only, no macOS-only API).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 tools/bench-http measures zinc against Node and Bun (req/s, p50/p99 latency, RSS) and the numbers are logged
- [ ] #2 Throughput on hello world and JSON at or above Node's on this Mac, the gap to Bun stated with its cause
- [ ] #3 Limits: header and body size, connections per IP, request rate, slow clients; streaming request and response bodies; each with a test
<!-- AC:END -->
