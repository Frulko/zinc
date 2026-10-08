---
id: ZN-282
title: 'Layout: `zn::ui::Layout` interface and `classic` adapter'
status: Backlog
assignee: []
created_date: '2026-10-07 13:07'
updated_date: '2026-10-08 13:46'
labels:
  - ui
  - layout
milestone: m-17
dependencies: []
ordinal: 50720
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/layout-engines.md (section 8, LE-3). Decision: a pluggable layout interface, `classic` stays the default, Yoga 3.2.1 is the opt-in `rn` mode for React Native fidelity. lib/std/ui.ts is shared with the prototype: land the other developer's uncommitted work first, then hunk-only commits.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `src/host/layout.h` with the calls of section 5; `classic` implements it with the current code, no behaviour change.
- [ ] #2 All example pixel goldens identical (tolerance 0) on interpreter and AOT.
- [ ] #3 `measure()` allocation count not higher (ZN-189 counter).
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
parked 2026-10-08: RN-oriented pluggable layout; the interface header alone has no user until the Yoga adapter exists, and the owner's order puts visible UI, style and rendering first. Resume after the style chain (ZN-272, ZN-279) and the GL tasks.

unparked 2026-10-08: the style chain is blocked behind the display-gl tasks, so the layout chain is the UI work that can move; lib/std/ui.ts has no uncommitted changes now.
<!-- SECTION:NOTES:END -->
