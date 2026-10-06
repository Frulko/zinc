---
id: ZN-088
title: WebSocket client and server
status: Backlog
assignee: []
created_date: '2026-10-06 22:53'
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
- [ ] #1 loopback echo with text/binary/fragmented/ping-pong/close codes
- [ ] #2 plugins/devtools scripted CDP client test runs on top of it
<!-- AC:END -->
