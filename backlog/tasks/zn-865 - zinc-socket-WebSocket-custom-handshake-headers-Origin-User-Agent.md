---
id: ZN-865
title: 'zinc:socket WebSocket: custom handshake headers (Origin, User-Agent)'
status: Backlog
assignee: []
created_date: '2026-10-30 14:52'
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
- [ ] #1 `new WebSocket(url, { headers })` sends the given headers in the opening handshake, on the interpreter, AOT and QuickJS
- [ ] #2 A T0 test checks the headers a local WebSocketServer receives
- [ ] #3 docs/plugins/socket.md documents the option
<!-- AC:END -->
