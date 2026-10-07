---
id: ZN-165
title: 'Grapheme, word and line breaking (libunibreak) and Intl.Segmenter'
status: Backlog
assignee: []
created_date: '2026-10-07 05:43'
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
- [ ] #1 grapheme, word and line segmentation fixtures equal Node's Intl.Segmenter on a ZWJ emoji / combining marks / CJK / Thai set
- [ ] #2 text layout wraps with the line break rules, a cursor step moves over a whole grapheme
<!-- AC:END -->
