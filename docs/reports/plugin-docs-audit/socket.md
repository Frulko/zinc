# zinc:socket audit

## What it is
Non-blocking TCP, Unix and UDP sockets, DNS lookup and a browser-style WebSocket client and server, all on the event loop. The base for chat, remotes, relays and OSC.

## Targets and status
plugin.json: macos, linux, windows, android, ios, rpi1, rmpp; `requires: ["net"]`; `web` entry (needs `websocket`); deterministic. Tests: `tests/conformance/socket.ts`, `tests/golden/host/{socket,websocket_raw,wss,tls_first}.ts`, `web_relay`. TLS (`wss://`, `connectTls`) verified in the TLS tests. Windows, iOS, Android not run in this pass.

## What the docs have
- [x] overview, quick start, API tables (TCP/Unix, UDP/DNS, WebSocket), limits (TLS, DNS blocking, 256 sockets), tests named
- [x] example code
- [ ] runnable example named in the doc (used by examples/carnet-nbe `sync.ts`, music-tree `remote-udp.ts`, webrtc-call `call.ts`, music)
- [ ] screenshot, tutorial, commands, permissions page link, web target notes

## What is missing
1. A tutorial: "A chat server in 30 lines" (listen, broadcast to clients, a WebSocket page that talks to it) with `zinc run` commands.
2. The `net` permission block (`{ "permissions": ["net"] }`) and what a denied call throws.
3. Document `WebSocketServer` (`port`, `close()`), `UpgradeRequest`, `ErrorEvent`, the ready-state constants `CONNECTING/OPEN_STATE/CLOSING/CLOSED`, `UdpSocket.close()`, `addEventListener` event names.
4. A web-target section: what `web/index.ts` supports (client only? server?) and what throws.
5. Pointer to the working relay (`app/web-relay`) as a larger example, and `examples/carnet-nbe/src/services/sync.ts` for the WebSocket-global adapter.
6. Troubleshooting: EADDRINUSE, ECONNREFUSED, TLS verify errors, `ZINC_CA_FILE`, firewall prompt on macOS.
7. Known gap from backlog: wss echo for rn-showcase (ZN-718), a browser `WebSocket` global on QuickJS.

## Wrong or stale
- Doc says "`requires`: net and process"; plugin.json says only `net`.
- Doc target list (macos, linux, rpi1, rmpp) omits windows, android, ios and the web entry the manifest declares; "refused on wasm" contradicts a `web` entry.
- "plus the sim through Node's net, dgram and dns" and "The prototype's engine has no TLS socket": the Node prototype and sim were removed 2026-10-20.

## Suggested pages
Socket (API, generated: sockets, UDP, WebSocket) / Guide: sockets on the event loop / Steps: a chat server and client / Steps: WebSocket server for a web page / Notes: TLS, DNS, limits, permissions / Examples: carnet-nbe sync, web-relay.
