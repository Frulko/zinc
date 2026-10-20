---
id: ZN-688
title: 'ZINC_INPUT: a text command that holds spaces'
status: Done
assignee: []
created_date: '2026-10-10 19:42'
updated_date: '2026-10-10 21:11'
labels:
  - testing
  - size-S
milestone: m-27
dependencies: []
ordinal: 449410
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found by the museum editor: the `text` command of an input script takes one word, so a scripted session types a sentence word by word with key events between.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `<frame> text "two words"` types the whole string; existing scripts and their goldens are unchanged
- [x] #2 docs/reports/zinc-next-window.md documents it
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done: the ZINC_INPUT reader (src/host/hal_dispatch.cpp) takes text "two words" as one string with its spaces (\" and \\ inside), a bare word as before; lines up to 1023 bytes. tests/t1/input.sh checks [two words], [one] and [say "hi" \ ok] reaching keyName; the museum tests, windows, fonts_runtime and atelier (their scripts and goldens) pass unchanged. docs/reports/zinc-next-window.md documents it, and the window/close commands of ZN-663. usage: n/a
<!-- SECTION:NOTES:END -->
