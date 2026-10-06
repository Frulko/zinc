---
id: ZN-090
title: 'Regular expressions: literals, RegExp, String match/replace/split/search'
status: Backlog
assignee: []
created_date: '2026-10-06 22:53'
labels:
  - language
  - stdlib
  - size-L
milestone: m-13
dependencies:
  - ZN-062
ordinal: 40320
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Decision D10: vendor QuickJS-ng libregexp, libunicode and cutils as split source files (third_party/quickjs-ng already holds the amalgam: add a second target built from the split files or switch the engine to them, one copy only). Lexer support for regex literals (with the regex-vs-divide rule), RegExp class (exec, test, lastIndex, flags g i m s u y d, named groups, lookbehind), String.match/matchAll/replace/replaceAll/split/search with RegExp and replacement patterns, Symbol.replace protocol not required. Typed API: exec returns a nullable array of strings with groups.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 a test262 subset (built-ins/RegExp and the String methods, pinned data in tests/data) passes at the rate recorded; a failing-list file names every exclusion with a reason
- [ ] #2 regex programs of tests/conformance pass; performance within 2x of QuickJS on a regex benchmark kept in bench/
- [ ] #3 third_party row, licence, version, checksum
<!-- AC:END -->
