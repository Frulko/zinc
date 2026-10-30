---
id: ZN-865
title: 'zinc:socket WebSocket: custom handshake headers (Origin, User-Agent)'
status: Done
assignee: []
created_date: '2026-10-30 14:52'
updated_date: '2026-10-30 14:58'
labels:
  - net
  - size-S
milestone: m-28
dependencies: []
ordinal: 94
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The WebSocket client sends a fixed handshake. Discord's remote-auth gateway refuses a connection without `Origin: https://discord.com`, and the main gateway should carry the same User-Agent as the REST calls (docs/reports/discord-client-research.md 1.4, 2.3). Add an options argument with headers, as Node's ws and Deno do.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `new WebSocket(url, { headers })` sends the given headers in the opening handshake, on the interpreter, AOT and QuickJS
- [x] #2 A T0 test checks the headers a local WebSocketServer receives
- [x] #3 docs/plugins/socket.md documents the option
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Option shape of Bun: { headers: [name, value][] } (pairs, as Zinc's Headers takes). Server-side sockets moved to the third constructor argument (devtools cdp, serveWebSocket). Header names must be tokens and values free of CR/LF, else the socket fails before it connects. Test: tests/golden/host/websocket_headers.ts in tests/t0/socket.sh on interpreter, AOT and QuickJS.
<!-- SECTION:NOTES:END -->
