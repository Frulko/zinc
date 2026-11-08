---
id: ZN-1008
title: >-
  QuickJS binary data: net bodies, u8 arguments to natives, large WebSocket
  messages, WebSocket and URL globals
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-11-07 16:34'
labels:
  - quickjs
  - net
  - size-M
milestone: m-14
dependencies: []
ordinal: 4300
updated_date: '2026-11-07 18:30'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Binary data breaks under `--engine quickjs`: bodies of zinc:net cross as UTF-8 so bytes above 0x7f become U+FFFD (binary downloads and uploads), `u8[]`/u32 arguments to native modules arrive wrong (the RTP vectors of discord_voice_rtp fail), a WebSocket message of 60 KB or more never arrives, and JS libraries expect a browser `WebSocket` global and a `URL` global. Cross bytes as ArrayBuffer, fix the arguments, and give the web environment `WebSocket` and `URL`.

From backlog/later.md, promoted by the review of 2026-11-07 (docs/reports/backlog-review-2026-11-07.md). The lines it carries:

- D178: QuickJS turns binary bodies of zinc:net (`Response.bytes()`, `Request.rawBody`, and `fs.writeText` of them) into U+FFFD past 0x7f, because strings cross into QuickJS as UTF-8: binary downloads and uploads served under `--engine quickjs` break (the iPod app's remote covers and songs); a host row that returns bytes on QuickJS fixes it.
- QuickJS: a browser `WebSocket` global (binary frames as ArrayBuffer) for libraries that expect one (@nbe/collab's connectToRelay); examples/carnet-nbe/src/services/sync.ts carries the adapter over zinc:socket, the web environment could give it to every program.
- ZN-587: QuickJS `.js` programs have no `URL` global, so `new Worker(new URL('./w.js', import.meta.url))` fails in plain JS.
- ZN-878: on QuickJS a WebSocket message of 60 KB or more never arrives (`--engine quickjs`, a local serveWebSocket sending 'x'.repeat(60000)); the interpreter and native runs get it.
- ZN-883: on QuickJS, u8[]/u32 arguments to a native module arrive wrong (the RTP vectors of tests/golden/host/discord_voice_rtp.ts fail): voice calls cannot work on --engine quickjs until fixed.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `Response.bytes()` and `Request.rawBody` round-trip all 256 byte values on QuickJS
- [ ] #2 tests/golden/host/discord_voice_rtp.ts passes on QuickJS
- [ ] #3 a 6 MB WebSocket message arrives on QuickJS
- [ ] #4 `new WebSocket(url)` and `new URL(rel, base)` exist in plain `.js` programs on QuickJS
<!-- AC:END -->
