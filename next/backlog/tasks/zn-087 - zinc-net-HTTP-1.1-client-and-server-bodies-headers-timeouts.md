---
id: ZN-087
title: 'zinc:net: HTTP/1.1 client and server, bodies, headers, timeouts'
status: Backlog
assignee: []
created_date: '2026-10-06 22:53'
labels:
  - host-modules
  - size-L
milestone: m-14
dependencies:
  - ZN-082
  - ZN-067
ordinal: 40290
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Replace the curl child process by llhttp (MIT) plus own glue over libuv (decision D7): fetch with method/headers/body/bodyBytes/timeoutMs/maxBytes, redirects, chunked and content-length, gzip via zlib if the prototype does; Response.text/json/bytes/arrayBuffer, Headers (append/set/delete/has/get/keys/forEach), serve(port, handler)/stop with Request and Reply, keep-alive. The API is lib/modules.d.ts:104-142 and runtime/mod/net.cpp.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 conformance tests/conformance/net.ts passes; loopback server+client test with 1 MB bodies and chunked transfer
- [ ] #2 tests/t0/net.sh no longer needs curl or python3
- [ ] #3 examples/service/sensor-hub answers /healthz and modules-showcase's network service runs
<!-- AC:END -->
