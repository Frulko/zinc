---
id: ZN-090
title: 'Regular expressions: literals, RegExp, String match/replace/split/search'
status: Done
assignee: []
created_date: '2026-10-06 22:53'
updated_date: '2026-10-07 05:33'
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
- [x] #1 a test262 subset (built-ins/RegExp and the String methods, pinned data in tests/data) passes at the rate recorded; a failing-list file names every exclusion with a reason
- [x] #2 regex programs of tests/conformance pass; performance within 2x of QuickJS on a regex benchmark kept in bench/
- [x] #3 third_party row, licence, version, checksum
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. Regular expressions on libregexp/libunicode of QuickJS-ng. third_party/quickjs-ng switched from the amalgam to the split sources (one copy; zn_regexp = libregexp + libunicode + src/host/lre_host.c with the embedder callbacks, quickjs.c built with those three names renamed and delegated through zn_lre_delegate). Lexer already had regex tokens; new N::Regex -> __reLit; prelude class RegExp/RegExpMatch + __re* helpers (kRegExpPrelude, loaded only by programs that use regex); host rows HostRe* (src/host/regexp.cpp: compile cache, UTF-16 conversion cache, exec, execAll for global loops, 30M-step budget -> RangeError); checker rewrites replace/replaceAll/split/match/matchAll/search with a RegExp (or string for match/search). Typed deviations: exec string[] with '' for missing groups, RegExp.match gives index/input/groups, matchAll returns string[][], replace callback gets match+groups (no offset/subject). Tests: golden/run regexp_corpus (38 checks identical to Node), regexp_typed; tools/test262 + tests/t1/test262_regexp.sh on a pinned 2557-test subset (tests/data/test262-regexp.tar.xz, c8c7988): 2533 pass (99.06%), 24 failures all listed with a harness reason in tests/data/test262-regexp.failing; bench/regexp.ts 0.25 s vs QuickJS 0.40 s. lib/zinc.d.ts declares the typed API. Not done: Symbol.replace/species protocols, lastIndex/flags as accessors, String(re), property-escapes/generated data tests (not pinned: 613 files), $ legacy statics. The scripting examples now stop at node:vm (ZN-103).
<!-- SECTION:NOTES:END -->
