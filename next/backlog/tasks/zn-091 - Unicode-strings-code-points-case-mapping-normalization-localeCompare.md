---
id: ZN-091
title: 'Unicode strings: code points, case mapping, normalization, localeCompare'
status: Done
assignee: []
created_date: '2026-10-06 22:53'
updated_date: '2026-10-07 05:43'
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
- [x] #1 fixtures equal Node's output on the Unicode corpus of test262 built-ins/String subset and on a ZWJ emoji / combining marks set
- [x] #2 bench: ASCII fast paths stay within 3% of today
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. src/rt/unicode.{h,cpp} on libunicode (zn_regexp is now linked by zn_rt, also in the AOT link line): full toUpperCase/toLowerCase (special casing, final sigma), normalize NFC/NFD/NFKC/NFKD, codePointAt, String.fromCodePoint (one argument), localeCompare on a root-collation subset (primary: CLDR order of ASCII punctuation < digits < letters, other scripts by code point after Latin; ß/æ/œ expansions, stroked letters; secondary: accents in ICU order; tertiary: lowercase first, ß after ss), and for-of/spread/Array.from over strings by code point (new row string.__chars). Fixtures equal Node: tests/golden/run/unicode_strings (ZWJ family, flags, combining marks, Hangul, special casing) and collation_fuzz (500 random words, 36000 pair signs and the sorted order identical). ASCII paths keep the byte loop behind an ascii flag test (bench/unicode.ts: ascii case 36 MB in 20 ms); no baseline binary was built for a 3% comparison. Not done: libunibreak and segmentation (ZN-165), multi-argument fromCodePoint, locale and options of localeCompare, lone surrogates survive only inside UTF-16 operations (toUtf8 turns them into U+FFFD), runtime RangeErrors (normalize form, code point range) are traps, not catchable.
<!-- SECTION:NOTES:END -->
