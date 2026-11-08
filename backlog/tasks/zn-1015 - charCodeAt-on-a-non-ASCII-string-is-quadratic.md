---
id: ZN-1015
title: charCodeAt on a non-ASCII string is quadratic
status: Review
assignee:
  - '@parallel'
created_date: '2026-11-07 16:35'
updated_date: '2026-11-08 22:13'
labels:
  - perf
  - runtime
  - size-S
milestone: m-21
dependencies: []
ordinal: 6000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Each `charCodeAt(i)` (and the other UTF-16 index reads) on a non-ASCII string converts the whole string with `toU16`: a loop over 90 KB of accented text took 19 s in JSON.stringify. Cache the UTF-16 form on the string (or index lazily).

From backlog/later.md, promoted by the review of 2026-11-07 (docs/reports/backlog-review-2026-11-07.md). The lines it carries:

- ZN-844: `charCodeAt(i)` (and the other UTF-16 index reads) on a non-ASCII string converts the whole string with `toU16` at each call (src/rt/rtcalls.cpp), so a charCodeAt loop over accented text is quadratic: 90 KB took 19 s in JSON.stringify before it got a native quote. Keep a UTF-16 view or a byte cursor per string.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 a `charCodeAt` loop over 1 MB of accented text runs linearly (under 100 ms)
- [ ] #2 results identical on all engines; bench-gate shows no regression on ASCII
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Worktree agent, 2026-11-08. Review: only the bench-gate half of criterion 2 is left (a benchmark, run at a milestone on a quiet machine).

Research (sonnet sub-agent): V8, JSC, QuickJS and Hermes keep one-byte or two-byte strings so indexing is O(1); Swift keeps UTF-8 and builds breadcrumbs (UTF-8/UTF-16 offset pairs every N units) lazily; PyPy keeps UTF-8 plus an index every N code points. The cheapest scheme for loops is a last-position cursor (UTF-16 index, byte offset) on the string. Links: https://sources.debian.org/src/swiftlang/6.0.3-2/swift/stdlib/public/core/StringBreadcrumbs.swift, https://forums.swift.org/t/how-to-make-string-index-with-int-offset-distance-in-o-1-time/28624/33.

Decision: a cursor per string, no full UTF-16 copy and no breadcrumbs. StrObj (src/rt/rt.h) has 7 bytes of padding after ascii, so the cursor fits there and no string gets bigger: curUnit (32 bits) and curDelta = byte - unit (24 bits; a string with 16 MB of non-ASCII text, or lone 4-byte leads, just keeps its old cursor). Machine::newStr and newStrCat set it to 0. u16Seek (src/rt/rtcalls.cpp) walks to the code point that holds a unit, forward or back from the cursor or from the start, whichever is nearer, and leaves the cursor there. charCodeAt, codePointAt, slice, substring, charAt, at and split('') decode only the units they need (u16Range); byteOf (indexOf, includes, startsWith... fromIndex) and u16Index (the index of a match) go through the cursor. One decoder (decodeUnits) for toU16 and the cursor reads, so invalid UTF-8 still gives the same U+FFFD units. Strings are never shared between threads (worker messages are copies), so the cursor takes no lock. QuickJS keeps its own latin1/UTF-16 strings, already O(1). Breadcrumbs (bounded random access) would be next if random reads on big strings ever show up.

Measured (M1 Pro, while another tree built): charCodeAt over 1,000,000 accented UTF-16 units: interpreter 36 ms, AOT 16 ms; the old binary gave no output within 120 s.

Proof: tests/t0/str_index.sh (tests/golden/str_index/: forward, backward and strided charCodeAt, codePointAt, slices that cut pairs, charAt, at, indexOf from each match, lastIndexOf, includes, split(''), the 1 MB loop) gives Node 24's output on the interpreter, AOT and QuickJS; str_invalid_utf8, str_surrogate_join and dyn_string pass. The ASCII paths are untouched (the ascii check comes first).

Found: a string literal with a lone surrogate escape ('\ud83d') becomes U+FFFD on the typed engines (String.fromCharCode(0xd83d) keeps it), unlike Node and QuickJS; it was so before this change (later.md line in the report).
<!-- SECTION:NOTES:END -->
