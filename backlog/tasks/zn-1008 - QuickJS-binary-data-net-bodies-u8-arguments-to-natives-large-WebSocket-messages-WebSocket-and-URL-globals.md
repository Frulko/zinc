---
id: ZN-1008
title: >-
  QuickJS binary data: net bodies, u8 arguments to natives, large WebSocket
  messages, WebSocket and URL globals
status: Done
assignee:
  - '@parallel'
created_date: '2026-11-07 16:34'
updated_date: '2026-11-08 21:15'
labels:
  - quickjs
  - net
  - size-M
milestone: m-14
dependencies: []
ordinal: 4300
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
- [x] #1 `Response.bytes()` and `Request.rawBody` round-trip all 256 byte values on QuickJS
- [x] #2 tests/golden/host/discord_voice_rtp.ts passes on QuickJS
- [x] #3 a 6 MB WebSocket message arrives on QuickJS
- [x] #4 `new WebSocket(url)` and `new URL(rel, base)` exist in plain `.js` programs on QuickJS
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done 2026-11-08 (worker branch).
- Cause found: the arguments were right; a module's u8[] came back on QuickJS as a Uint8Array, so `b.map(x => hex)` gave numbers (discord_voice_rtp's hex helper), and zinc:socket's WebSocket died on `all.push` of a typed chunk when a frame spanned reads (60 KB and more).
- Fix (src/qjs/native_js.cpp typed()): results and callback arguments up to 64 Ki elements are plain JS arrays (the language's u8[], as host rows already give); above, a typed array as before (camera/screen frames cross in one copy) with a prototype whose map returns an array, concat exists and toJSON writes a list. Measured on QuickJS (M1 Pro): building a plain array costs ~16 ms per million elements, passing one back ~13 ms, against ~2 ms for a typed result. Decision for the coordinator to record: 'a native u8[] on the JS engines is an array up to 64 Ki elements, a typed array with array-like map/concat/toJSON above; push on a big result is the known limit'.
- Response.bytes()/Request.rawBytes already byte exact (net_fetch_bytes, net_raw_bytes pass); net_raw_bytes now also posts all 256 byte values on the three engines.
- Plain .js programs on QuickJS: URL, URLSearchParams and WebSocket are auto-imported where read as globals (src/qjs/strip.cpp toJavaScript + kJsGlobals in modules.cpp, not the rest of the web globals so a library's typeof document check stays false); WebSocket is the new std module zinc:web/websocket (lib/std/websocket.ts, browser shape over zinc:socket, ArrayBuffer/Blob binary).
- Tests: tests/t0/qjs_bytes.sh (11 s, ports 18992-18995: RTP bytes map/concat/push/JSON + 70 KB result + 60 KB and 6 MB WebSocket messages on interp, QuickJS, AOT; the plain JS URL/WebSocket program on QuickJS). Passing: qjs_bytes, qjs_native (expectation updated: a small result is an array), net_raw_bytes, net_fetch_bytes, net_ws; discord_voice_rtp.ts on QuickJS all ok.
- Research: quickjs-ng JS_NewArrayBufferCopy/JS_NewUint8ArrayCopy/JS_GetUint8Array (https://raw.githubusercontent.com/quickjs-ng/quickjs/master/quickjs.h); RFC 6455 length encodings (https://www.openmymind.net/WebSocket-Framing-Masking-Fragmentation-and-More/); browser binaryType (https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/binaryType); ada as a WHATWG URL parser if zinc:web's URL ever falls short (https://github.com/ada-url/ada).
- later.md lines (for the coordinator): ZN-1008: a QuickJS fast path for plain arrays from natives (JS_NewArrayFrom, a fast-array read in pack) would let u8[] results above 64 Ki be arrays too (push on a camera frame fails today). ZN-1008: examples/carnet-nbe/src/services/sync.ts BrowserWebSocket can go now that zinc:web/websocket exists (its sync.ts is TypeScript: needs the global for .ts on QuickJS too, or an import). ZN-1008: plain .js workers on QuickJS: `Worker` is not a global and the worker side has no `self` (new Worker(new URL(...)) in a .js program fails).
- Proposed tests: tests/t1/discord_voice.sh (now compares the RTP vectors on QuickJS), webrtc and camera tests on QuickJS (data channel binary below 64 Ki is now an array), tools/diff-matrix.
<!-- SECTION:NOTES:END -->
