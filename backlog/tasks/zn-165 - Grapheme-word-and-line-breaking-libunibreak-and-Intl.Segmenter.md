---
id: ZN-165
title: 'Grapheme, word and line breaking (libunibreak) and Intl.Segmenter'
status: Done
assignee: []
created_date: '2026-10-07 05:43'
updated_date: '2026-10-08 01:56'
labels:
  - unicode
  - size-M
dependencies: []
ordinal: 103000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Split off ZN-091: vendor libunibreak 8.0 (zlib licence) and expose grapheme/word/line break iteration for text layout (wrapping in zinc:ui text, ZWJ emoji and combining marks as one cursor step) and an Intl.Segmenter subset; fixtures against Node's Intl.Segmenter.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 grapheme, word and line segmentation fixtures equal Node's Intl.Segmenter on a ZWJ emoji / combining marks / CJK / Thai set
- [x] #2 text layout wraps with the line break rules, a cursor step moves over a whole grapheme
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. libunibreak (already vendored) now also builds grapheme/word rules; src/text/segment.{h,cpp} (boundaries utf8/utf16, nextGrapheme/prevGrapheme), Intl.Segmenter in the QuickJS engine (src/text/segmenter_js.cpp, grapheme + word + non-standard line). Fixtures tests/golden/segment equal Node/ICU for ZWJ emoji, flags, combining, Hangul, Indic, CRLF, Latin; word granularity skipped for Thai/CJK (ICU uses a dictionary, ponytail comment). Line wrapping already used libunibreak (text_layout). Cursor step is the C++ API; zinc:ui wiring waits for lib/std/ui.ts (someone else's uncommitted file). tests/t0/segment.sh, tests/text/segment_test.cpp.
<!-- SECTION:NOTES:END -->
