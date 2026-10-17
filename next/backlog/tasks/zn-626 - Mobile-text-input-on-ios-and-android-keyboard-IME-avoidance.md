---
id: ZN-626
title: 'Mobile text input on ios and android: keyboard, IME, avoidance'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-10 14:06'
labels:
  - mobile
  - size-M
milestone: m-26
dependencies:
  - ZN-625
ordinal: 202000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The on-screen keyboard opens and closes with focus; composition text (CJK) reaches the field; the focused field scrolls above the keyboard; keyboard type hints (email, number) (From the spike ZN-372, docs/reports/zinc-next-mobile-spike.md, D59.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `tests/golden/ui/type.tsx` passes on the emulator and the simulator
- [ ] #2 a composition script on the desktop (`ZINC_INPUT` `compose`) has a golden
- [ ] #3 the keyboard never covers the focused field in rn-showcase
<!-- AC:END -->
