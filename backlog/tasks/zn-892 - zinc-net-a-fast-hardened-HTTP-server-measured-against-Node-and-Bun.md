---
id: ZN-892
title: 'zinc:net: a fast, hardened HTTP server measured against Node and Bun'
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-30 22:47'
updated_date: '2026-10-30 23:28'
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
- [x] #1 tools/bench-http measures zinc against Node and Bun (req/s, p50/p99 latency, RSS) and the numbers are logged
- [x] #2 Throughput on hello world and JSON at or above Node's on this Mac, the gap to Bun stated with its cause
- [x] #3 Limits: header and body size, connections per IP, request rate, slow clients; streaming request and response bodies; each with a test
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done (2026-10-31). tools/bench-http (oha 1.16, brew) runs tests/bench/http/{zinc.ts,node.mjs,bun.ts}: hello, json, a 64 KiB file, close (a connection per request), tls (keep-alive), tls-close (a handshake per request); req/s, p50/p99, peak RSS, the load average next to each number. The machine was never quiet (other agents building, load 13 to 37); numbers below at load 16 to 26, 4 s, 50 connections.

Before (develop, Connection: close every time, 32 connections in all: 8 to 50% of oha's requests failed): hello 18.9k, json 20.2k, file 17.1k (56% ok), tls 1.5k (50% ok). QuickJS did not answer in time (a 1 ms sleep per loop turn).
After, req/s: zinc interpreter hello 65.2k, json 68.1k, file 34.9k, close 20.6k, tls 53.6k, tls-close 849; AOT hello 55.1k (json 55.2k in a quieter rerun); QuickJS hello 51.6k, json 40.7k; Node 24 hello 48.4k, json 24.5k, file 9.4k, tls 30.1k, tls-close 2.1k; Bun hello 60.0k, json 65.8k, file 19.3k, tls 67.8k, tls-close 2.5k. RSS: zinc 7 MiB, Node 73 to 229 MiB, Bun 30 MiB.
What the profile (macOS `sample`) showed and what was done: (1) two kevent calls per event (eventReady and nextEvent each polled libuv): 2/3 of the time; the loop is now polled only when its queue is empty, and loop::wait returns at once when events wait (11k to 56k req/s). (2) keep-alive and pipelining (llhttp paused at each message, the rest kept in `pending`), (3) uv_try_write of head and body (writev, no copy when the socket takes it all), Date cached per second, TCP_NODELAY, backlog 511, one llhttp settings table, a shared 64 KiB read buffer; (4) QuickJS's idle turn slept 1 ms instead of waiting on the host loop (20k to 51k); (5) static files: libuv's synchronous fs calls instead of stdio, one buffer, and a stat-checked cache of open files (open+close cost 13 us on this Mac, a stat 1.5 us): 12k to 35k.
Gap to Bun: none on hello/json/file at equal load (within noise); TLS keep-alive 54k vs 68k (Bun's BoringSSL with the ARMv8 AES instructions vs mbedTLS's record layer) and handshakes 849/s vs 2.5k/s (each connection parsed the certificate and key again): ZN-893.
Hardening, tests/t0/net_limits.sh (interpreter, QuickJS, AOT; 9 s): ServeOptions maxHeaderBytes (431), maxBodyBytes (413, a Content-Length over it before the body), maxConnections (all servers, default 10000), maxConnectionsPerIp (256), requestsPerSecondPerIp (token bucket, 429 + Retry-After), headersTimeoutMs (from a request's first byte: a trickling client gets 408), requestTimeoutMs (longest pause in a body), keepAliveTimeoutMs (5 s), streamBody (req.bodyStream.each, reading paused while the program is 1 MiB behind) and Reply.stream (ReplyWriter write/onDrain/onClose/end, chunked); a half-closed client still gets its reply.
Portable: libuv only (uv_fs_* for files, uv_try_write, uv_ip6_name), gmtime_s on Windows. Linux/Windows proof: later.md lines in the report.
<!-- SECTION:NOTES:END -->
