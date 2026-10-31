---
id: ZN-893
title: 'zinc:net: WebSocket server, TLS speed and automatic certificates'
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-30 22:47'
updated_date: '2026-10-31 00:32'
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
- [x] #1 A WebSocket server in zinc:net with backpressure, ping/pong and limits, documented, with a test on every engine
- [x] #2 Echo throughput, latency and memory per idle connection measured against Node ws and Bun
- [x] #3 TLS handshakes/s and resumption measured; ACME http-01 gets and renews a certificate (tested against a local Pebble server)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done (2026-10-31).
- WebSocket server in zinc:net: `ServeOptions.webSocket` (upgrade/open/message/drain/close, as Bun), `ServerWebSocket` send/sendBytes/close/ping; frames by wslay 1.1.1 (third_party/wslay, MIT; uWebSockets rejected: it brings its own TLS beside mbedTLS and its own loop beside libuv). Limits maxPayloadBytes (1009), idleTimeoutMs (ping then close), backpressureLimit (1008); wss through the same TLS path. Binary messages reach the program as u8[] (host rows evPayloadSize/evPayloadByte; wsSendBytes takes u8[]): intact on QuickJS too. zinc:socket `serveWebSocket` now runs on it (the Zinc framing stays for the client only).
- Test: tests/t0/net_ws.sh (interpreter, QuickJS, AOT): handshake, text, binary with high bytes, fragments, ping/pong, both close directions, 1009, back-pressure with drain over 4 MiB, idle ping and close, refused upgrade (403), plain HTTP on the same port. socket, net, net_limits, netlog, tls, tls_ticket, crypto pass.
- Engine gap fixed: `__host_sysBytesToString` was not installed on QuickJS (isSysTailRow).
- TLS: one parsed mbedtls_ssl_config per https listener, TLS 1.3 session tickets; `resume` case of tools/bench-http measures full vs resumed handshakes. Handshake cost is mbedTLS's portable P-256 code (profile: ecp_mod_p256, modinv).
- ACME: `zinc:net/acme` (lib/std/acme.ts, RFC 8555, ES256 JWS, http-01) with crypto ops ec-csr, ec-key-pem, x509-not-after (mbedTLS); `setCertificate(port, cert, key)` hot-swaps a listener's certificate; `hostname` in ServeOptions; every zinc:net server answers /.well-known/acme-challenge while a token is set. tests/t1/net_acme.sh against Pebble v2.10.1 (PEBBLE=<dir with the binary and its test/certs>, skipped without it): issue, keep, renew, swap into a running https server (openssl checks the served serial). Interpreter only.
- Bench (tools/bench-http, 4 s, 50 conns, load 13-19, 2026-10-31): WS echo msg/s zinc 78.7k / AOT 122.8k / QuickJS 73.2k vs Node ws 68.2k, Bun 91.7k; wss zinc 34.2k / AOT 62.8k vs Node 26.4k, Bun 74.2k. Idle memory per WS connection: zinc AOT 10.7 KiB (wslay holds two 4 KiB buffers per context), Node ~6.7 KiB, Bun under 1 KiB (RSS sampling is noisy at this scale). TLS handshakes/s (50 clients): zinc 820-880 vs Node 2.8k, Bun 2.9k; one client full/resumed: zinc 422/489, Node 890/1178, Bun 1244/1575.
- Not done: permessage-deflate (optional), UTF-8 validation of text frames, handshake speed parity (needs an optimised P-256).
<!-- SECTION:NOTES:END -->
