---
id: ZN-004
title: Lexer
status: Done
assignee: []
created_date: '2026-10-05 14:21'
updated_date: '2026-10-05 15:26'
labels:
  - size-S
milestone: m-1
dependencies: []
ordinal: 4000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
As an **App developer**, I want my TypeScript tokenised with accurate positions, so that errors point at the right place.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 tokenises every file of the corpus; golden token dumps for 5 files; round-trip positions verified.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
src/frontend/lexer.{h,cpp}: tokens with byte offsets, templates, regex, JSX (own nesting tracking), `zinc lex --check|--dump`. T0 lexer: 73 corpus files, no error token, exact round-trip, 5 golden dumps (next/tests/golden/lexer). Dev-time cross-check against the TypeScript scanner: 0 disagreements on 48323 tokens (normalised: '>' compounds split, '/>' and '</' split, whitespace-only JsxText ignored; script not committed). Known limits (ponytail): regex-vs-divide by previous token, '<T,>()=>' in .tsx lexes as JSX, columns in bytes. Parser must merge adjacent '>' tokens. usage: 108544 in / 6401351 cached / 54592 out tokens, 73 turns (session total, estimate)
<!-- SECTION:NOTES:END -->
