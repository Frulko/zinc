---
id: ZN-688
title: 'ZINC_INPUT: a text command that holds spaces'
status: Backlog
assignee: []
created_date: '2026-10-10 19:42'
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
- [ ] #1 `<frame> text "two words"` types the whole string; existing scripts and their goldens are unchanged
- [ ] #2 docs/reports/zinc-next-window.md documents it
<!-- AC:END -->
