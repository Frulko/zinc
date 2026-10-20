---
id: ZN-088
title: WebSocket client and server
status: Done
assignee: []
created_date: '2026-10-06 22:53'
updated_date: '2026-10-07 04:58'
labels:
  - host-modules
  - size-M
milestone: m-14
dependencies:
  - ZN-087
ordinal: 40300
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
wslay (MIT) framing over the loop: WebSocket class of the web platform for the client, server upgrade in serve(). Used by devtools (zinc dev) and remote-view.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 loopback echo with text/binary/fragmented/ping-pong/close codes
- [x] #2 plugins/devtools scripted CDP client test runs on top of it
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. Re-scoped: the prototype writes RFC 6455 framing in Zinc in plugins/socket over native sockets, so the missing piece was the native Socket (TCP, Unix, UDP, DNS) on libuv: src/host/sock.{h,cpp} + rows HostSock*, raw binary through the event payload (HostEvPayload; string ops are not byte-exact), hidden zinc:__sock, plugins/socket/native/socket.next.ts stand-in. zinc:web now resolves (lib/std/web.ts) so the plugin's WebSocket and serveWebSocket run unchanged; no wslay (decision: the plugin already has the framing, tested). devtools: plugins/devtools/native/cdp.next.ts (HTTP discovery, Host/Origin checks, WebSocket) with a scripted CDP client test. Tests: tests/t0/socket.sh (socket conformance with ASCII word, raw RFC 6455 wire test with ping/pong, fragments and close 1001, scripted CDP client). Compiler fixes found on the way: lambdas under awaited calls were checked twice (stale symbols), this.x paths shared across classes, template of arrays, ternary into unknown, subclass views through unknown, record widening, nested instanceof on narrowed unknown; virtual clock advances while I/O is awaited. Not done: console mirroring and screenshots in devtools, TLS (wss), toUpperCase of non-ASCII (ZN-091), binary http bodies still go through strings.
<!-- SECTION:NOTES:END -->
