---
id: ZN-737
title: 'UI: a scroll area cannot be scrolled to its end (hero''s gallery)'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-12 16:35'
labels:
  - ui
  - layout
  - size-M
milestone: m-5
dependencies: []
ordinal: 64300
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner, 2026-10-12, with hero on the Pi 3B+ (800x480, touch): in the gallery the scroll does not go to the end, the last items cannot be brought fully into view. He suspects the computation of the viewport and of the scroll range, a defect of the UI core that every Zinc program has, not of hero. Find the cause by reproducing it (the range a scroll area allows against the height of its content and of what covers it), fix it where every scroll area goes through, and prove it on a scroll area that is not hero's.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Reproduced on the Mac, headless, at 800x480 and at one other size, with a scripted session: the numbers that are wrong are written in the notes (content height, viewport height, the largest scroll allowed, what it should be) and the cause is named in one sentence
- [ ] #2 Fixed in the core (lib/std/ui.ts or the layout it calls), not in examples/hero; a regression test on a small scroll area of its own fails before the fix and passes after it, for the wheel, a touch drag and the keyboard when the area takes it
- [ ] #3 hero's gallery reaches its end: the last item is whole in the viewport at the largest scroll, shown by a readback of its position or one frame
- [ ] #4 The tests that tests/affected.json maps to lib/std/ui.ts pass; a golden that changes is explained in the notes, one line each
<!-- AC:END -->
