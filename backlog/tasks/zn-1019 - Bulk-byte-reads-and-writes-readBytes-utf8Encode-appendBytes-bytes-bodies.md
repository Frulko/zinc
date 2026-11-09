---
id: ZN-1019
title: 'Bulk byte reads and writes: readBytes, utf8Encode, appendBytes, bytes bodies'
status: Done
assignee:
  - '@parallel'
created_date: '2026-11-07 16:35'
updated_date: '2026-11-09 00:33'
labels:
  - perf
  - runtime
  - size-M
milestone: m-21
dependencies: []
ordinal: 7200
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`zinc:assets readBytes`, `fs.readBytes`, `utf8Encode` and `randomBytes` fill a `u8[]` one host call per byte (5.6 of 8.6 ms of a .zmesh load); `zinc:fs` has no `appendBytes` nor write at an offset; zinc:net `Reply` takes no bytes body (a temporary file); no cross-array bulk copy/fill native exists. Use the new `>B` host return and add one bulk copy native, on every engine.

From backlog/later.md, promoted by the review of 2026-11-07 (docs/reports/backlog-review-2026-11-07.md). The lines it carries:

- ZN-441: zinc:assets `readBytes` (and `fs.readBytes`, `utf8Encode`, `randomBytes`) fill a u8[] one host call per byte: 5.6 of the 8.6 ms of the truck's .zmesh load; a runtime call that copies the entry at once makes a .zmesh load a memcpy.
- ZN-844: a `zinc:net` Reply needs a bytes body (like `RequestInit.bodyBytes`): binary replies go through a temporary file today (web relay PNGs, hub `.zapp`).
- tokyo: zinc:assets `readBytes` is one host call per byte: a bulk read for every program (zinc:3d bypasses it now).
- zinc:fs has no appendBytes nor a write at an offset: the iPod demo's jukebox source joins its Range slices in memory (2.3 s per 40 MB on the interpreter).
- ZN-?: `fs.readBytes` and `sys.utf8Encode` still cost one host call per byte; use the new `>B` host return (as `Response.bytes()` and `Request.rawBytes` do). Also `u8[]` takes 8 bytes an element in the interpreter and AOT (a 57 MB body is ~460 MB): a packed bytes type, or a host-side download-to-file path for the Hub's `downloadEngine`.
- ZN-?: a cross-array bulk copy and fill native on every engine (`Array.prototype.set`-style: destination, source, start, count): the rectangle restores of Hamlet's frame (`pix[i] = bakedPix[i]` rows), `copyInto` and the pixel-plays buffers are loops, 5 times slower on the interpreter than AOT (docs/reports/hamlet-perf-2026-11-01.md).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `readBytes` of a 1 MB entry takes one host call (measured with tools/bench)
- [x] #2 `fs.appendBytes(path, u8[])` and a write at an offset exist with tests
- [x] #3 `Reply` accepts a `u8[]` body; the web relay PNGs and hub `.zapp` no longer use a temp file
- [x] #4 an `Array.prototype.set`-style copy exists on the interpreter, AOT and QuickJS
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done 2026-11-09 (worktree agent).
- Web search: Linux pwrite ignores the offset on an O_APPEND fd (kernel bug 43178; OpenJDK clears O_APPEND first), so writeBytesAt opens r+b (w+b when missing) and seeks: never O_APPEND; a write past the end leaves a hole read as zeros (Node, Deno do the same). TypedArray.set throws RangeError on overflow, copyWithin clamps; Zinc's Array.set (4bd24abde) leaves out what does not fit, documented. TextEncoder replaces lone surrogates with U+FFFD. Deno/Bun/Node set Content-Length from a bytes body.
- Five system rows appended (include/zn/runtime.h, isSysTailRow): host.fsBytes (>B, the buffer of the last fsLoad/assetsLoad/Asset load), host.sysUtf8Bytes (s>B), host.sysRandomBytes (i>B), host.fsWriteAt (sBd>n), host.httpReplyBytes (iisB>n). Served by src/host/sys_host.cpp, the console host (fsBytes, utf8Bytes, randomBytes) and the web runtime (all but the reply, which goes over the dev bridge).
- zinc:fs readBytes, zinc:assets readBytes and Asset.bytes, sys.utf8Encode and sys.randomBytes take one bulk copy on every engine; QuickJS's __qjs_bytes source rewrite is gone (the generic B return now builds the array with JS_NewArrayFrom).
- Measured (timing program, 1 MB, other trees building: indicative): readBytes interpreter 42.3 -> 0.32 ms, AOT 33.5 -> 0.35 ms, QuickJS 2.9 -> 3.2 ms (already bulk); utf8Encode of 1 MB interpreter 42.6 -> 0.27 ms, AOT 30.5 -> 0.30 ms, QuickJS 57.8 s -> 2.9 ms (sysUtf8Byte re-encoded the whole string per byte: quadratic).
- fs.appendBytes existed (306c8b86b); fs.writeBytesAt(path, data, offset) added. Reply.bytes added: app/web-relay png() no longer writes last.png; app/hub-server serves .zapp/.tar/.png with Reply.file (blocks, Range) instead of readText.
- Criterion 4 was met by 4bd24abde (Array.set on interpreter, AOT, QuickJS; tests/t0/array_set.sh).
- Tests: new tests/t0/bytes_bulk.sh (interp, default, QuickJS, AOT) passes; read_bytes_image passes; Reply.bytes proven by a short run on interp, QuickJS and AOT (serve(0)), and added to tests/t0/net_body_bytes.sh (fixed port 18844: not run).
- later.md: u8[] still takes 8 bytes an element on the interpreter and AOT (a packed bytes type); writes of a u8[] (writeBytes, appendBytes, packAdd) still copy element by element in the host (bytesArg), fine but could be one pass over a packed type.
Proposed tests: tests/run --only net_body_bytes (Reply.bytes over loopback, fixed port, ~10 s, <200 MB, run alone); tests/run --only host (fs rows, ~10 s); webenv/web_bridge (web runtime fsBytes and replyBytes over the dev bridge, headless Chrome, ~1 min); a hub T1 session downloading a .zapp with Range (hub on a free port).
<!-- SECTION:NOTES:END -->
