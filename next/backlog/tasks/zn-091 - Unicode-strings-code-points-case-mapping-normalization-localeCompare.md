---
id: ZN-091
title: 'Unicode strings: code points, case mapping, normalization, localeCompare'
status: Backlog
assignee: []
created_date: '2026-10-06 22:53'
labels:
  - language
  - stdlib
  - size-M
milestone: m-13
dependencies:
  - ZN-090
ordinal: 40330
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Iterate strings by code point (for-of, spread, Array.from), codePointAt/fromCodePoint, full toUpperCase/toLowerCase (special casing), normalize NFC/NFD/NFKC/NFKD and localeCompare (root collation subset) using libunicode (same source as the regex task) and libunibreak 8.0 for line/word/grapheme segmentation used by text layout.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 fixtures equal Node's output on the Unicode corpus of test262 built-ins/String subset and on a ZWJ emoji / combining marks set
- [ ] #2 bench: ASCII fast paths stay within 3% of today
<!-- AC:END -->
