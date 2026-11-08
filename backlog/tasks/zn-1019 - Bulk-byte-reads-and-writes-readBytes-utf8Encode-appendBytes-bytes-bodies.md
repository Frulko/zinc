---
id: ZN-1019
title: 'Bulk byte reads and writes: readBytes, utf8Encode, appendBytes, bytes bodies'
status: Backlog
assignee: []
created_date: '2026-11-07 16:35'
labels:
  - perf
  - runtime
  - size-M
milestone: m-21
dependencies: []
ordinal: 7200
updated_date: '2026-11-07 18:30'
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
- [ ] #1 `readBytes` of a 1 MB entry takes one host call (measured with tools/bench)
- [ ] #2 `fs.appendBytes(path, u8[])` and a write at an offset exist with tests
- [ ] #3 `Reply` accepts a `u8[]` body; the web relay PNGs and hub `.zapp` no longer use a temp file
- [ ] #4 an `Array.prototype.set`-style copy exists on the interpreter, AOT and QuickJS
<!-- AC:END -->
