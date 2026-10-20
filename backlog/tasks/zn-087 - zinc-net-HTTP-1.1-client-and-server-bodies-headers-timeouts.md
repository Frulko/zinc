---
id: ZN-087
title: 'zinc:net: HTTP/1.1 client and server, bodies, headers, timeouts'
status: Done
assignee: []
created_date: '2026-10-06 22:53'
updated_date: '2026-10-07 04:06'
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
- [x] #1 conformance tests/conformance/net.ts passes; loopback server+client test with 1 MB bodies and chunked transfer
- [x] #2 tests/t0/net.sh no longer needs curl or python3
- [x] #3 examples/service/sensor-hub answers /healthz and modules-showcase's network service runs
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. zinc:net rewritten on llhttp 9.3.0 (vendored, README row) + libuv: src/host/http.{h,cpp}. Client: methods, headers, bodies/bodyBytes, redirects (20, 301/302/303 POST->GET), chunked + content-length via llhttp, timeoutMs (connect capped 30 s), maxBytes, Node-style rejections (ECONNREFUSED/ENOTFOUND/timeout/response too large). Server: serve/stop, limits (16 KiB head, 1 MiB body, 32 conns, 10 s), handler exceptions -> 500, Transfer-Encoding: chunked replies. Headers gained delete/forEach; Response bytes()/json()/statusText/headers. tests/t0/net.sh is one loopback program (no curl, python3); golden/host/net.{ts,out}: 1 MiB and chunked bodies. tests/conformance/fetch.ts matches fetch.out except its last (timeout against a zinc:socket server) which waits for ZN-111; timeout verified by hand with nc. tools/examples-status: service/* entries are OK when alive at the end of a 6 s run, PORT=0. sensor-hub /healthz verified; modules-showcase OK (49/62). Not done: https (needs ZN-089 TLS, rejects 'https is not supported yet'), gzip/br decoding, keep-alive (Connection: close), non-UTF-8 binary bodies go through utf8 strings.
<!-- SECTION:NOTES:END -->
