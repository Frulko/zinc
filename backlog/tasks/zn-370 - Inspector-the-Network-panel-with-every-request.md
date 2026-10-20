---
id: ZN-370
title: 'Inspector: the Network panel with every request'
status: Done
assignee: []
created_date: '2026-10-08 15:16'
updated_date: '2026-10-10 14:22'
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
- [x] #1 a program doing fetch, a WebSocket and an MQTT publish shows them in DevTools' Network panel with bodies (scripted CDP test)
- [x] #2 the HAR file opens in Chrome and lists the same requests
- [x] #3 TLS requests show their timings without exposing secrets (headers marked sensitive are masked)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done 2026-10-10 (worktree agent, branch based on local main).

What was built
- `next/src/host/netlog.{h,cpp}`: the host's network log. Hooks of one line in `http.cpp` (fetch: an entry per redirect hop, marks for DNS, connect, TLS, sent, first byte), `mqtt.cpp` (connect, CONNACK, PUBLISH / SUBSCRIBE, close) and `sock.cpp` (outgoing TCP: bytes; a WebSocket is recognised from its upgrade request and its RFC 6455 frames are decoded). Off unless the inspector or ZINC_HAR asked.
- One runtime row appended, `host.netLog(op, arg)` (start, drain events, response body, request body), exposed as `zinc:__netlog`; `plugins/devtools` gets `Cdp.net` in its Spec (Next: the row; prototype natives and sim: '') and answers `Network.enable/disable/getResponseBody/getRequestPostData`, forwarding the queued events every 100 ms. Recording starts when `zinc:devtools` loads, so requests made before DevTools attaches are listed.
- `zinc run --har file` (parsed in `cli_core.cpp` discoverEntry, sets ZINC_HAR; no change to main.cpp): HAR 1.2 written at process exit, with Chrome's `_webSocketMessages` for WebSockets and MQTT.
- Masking at record time: Authorization, Proxy-Authorization, Cookie, Set-Cookie, names containing token/secret/password/passwd/api-key/apikey/session/credential, names in ZINC_NET_SENSITIVE; `user:password@` of URLs. Bodies and query strings are not masked.
- Test `tests/t0/netlog.sh` (+ `tests/golden/host/netlog.tsx`, `tests/netlog_servers.py`, `tests/netlog_check.py`; `tools/cdp-probe` ws() can collect events). `tools/har-chrome` feeds a HAR to the importer of the installed Chrome (headless).
- Docs: `docs/dev-mode.md` (Network bullet, HAR export section), `zinc help run`.

Proof (tests/run --only netlog: PASS; lines of the checker with NETLOG_KEEP=file)
- AC1: `AC1 ok: 7 requests in the Network domain (fetch with bodies, redirect, failure, WebSocket and MQTT frames)`
- AC2: `AC2 ok: HAR 1.2 with the same 7 requests, bodies, messages and timings`, and `NETLOG_CHROME=1 tests/t0/netlog.sh` (tools/har-chrome): Chrome's own importer lists the 7 entries, the WebSocket with 4 messages and the MQTT client with 3.
- AC3: `AC3 ok: TLS timing dns 4.4 connect 4.5 ssl 4.5..19.5 first byte 20.1 ms; Authorization, Cookie, Set-Cookie masked` (the secrets appear neither in the events nor in the HAR).
- Regression: socket, net, mqtt, zinc_gl_api, aot_size_inline (t0) and dev_mode (t1) pass. The row also works from an AOT binary (1 HAR entry from a compiled program with ZINC_HAR).

Decisions (for the coordinator to record; no D number allocated)
1. The log lives in the host (C++), not in the plugins: fetch, MQTT and sockets all end in `src/host`, so one recorder sees every request whatever the Zinc API above it, and the HAR export works without the inspector. WebSockets are decoded from the socket bytes there instead of adding a hook to `plugins/socket` (shared with the prototype, 5 native variants).
2. One multiplexed row `host.netLog(op, arg)` instead of four rows: the table is shared with the device cores and with the zinc:gl rows being added on main; one appended row is the smallest change.
3. MQTT clients and WebSockets both use the protocol's WebSocket events (messages tab of DevTools); MQTT packets read `PUBLISH topic payload` / `SUBSCRIBE filter`. Other outgoing TCP sockets are a `tcp://host:port` request (method TCP, received bytes as the body).
4. A redirect is one entry per hop (as a HAR has it), not Chrome's `redirectResponse` on one id.
5. Fixed bounds (ponytail comment in netlog.cpp): last 1000 entries, 4 MiB per body, 10000 messages per stream, 8 MiB of undrained events.
6. Connections to the inspector's own port on loopback are not recorded (a program inspecting itself would feed back).
7. The test's HTTPS server is pinned to TLS 1.2: the client fails TLS 1.3 handshakes against OpenSSL servers (known, ZN-610; `fetch('https://example.com')` gives ECONNRESET with main's binary too).

Follow-up tasks proposed (not created here)
- "zinc:devtools on Zinc Next: the inspector port from ZINC_DEVTOOLS_PORT / plugins.devtools.port" - cdp.next.ts and index.ts listen on 9229 only (the prototype reads ZINC_DEVTOOLS_PORT); tests socket, dev_mode and netlog cannot run in parallel. AC: two programs with different ports inspect at once; netlog.sh and socket.sh use their own port.
- "Network log: UDP, Unix sockets, wss and the server side" - sendTo/datagrams, connectUnix and requests received by zinc:net serve are not recorded. AC: each shows in the Network panel and the HAR.
- "Network log: mask credentials in query strings and JSON bodies (opt-in list)" - only headers and URL userinfo are masked. AC: ZINC_NET_SENSITIVE names also mask query parameters.
- "HAR written periodically or on SIGTERM" - a killed program writes no file. AC: `kill` of a `zinc run --har` leaves a valid HAR.
- "Prototype: build plugins/devtools with the new Spec member" - `cdp.host.cpp` got a `net()` stub that I could not compile here (prototype toolchain not run). AC: the prototype builds an app with zinc:devtools on macOS.

affected.json mapping wanted: {"paths": ["src/host/netlog.cpp", "src/host/netlog.h", "src/host/http.cpp", "src/host/mqtt.cpp", "src/host/sock.cpp", "../plugins/devtools/", "tools/cdp-probe", "tools/har-chrome", "tests/netlog_check.py", "tests/netlog_servers.py", "tests/golden/host/netlog.tsx"], "tests": ["netlog", "socket", "net", "mqtt"]}

Not verified: the DevTools UI itself (a person looking at the Network panel); the prototype build of plugins/devtools; any other platform than the development Mac.

Usage: tools/usage reports n/a in this session.
<!-- SECTION:NOTES:END -->
