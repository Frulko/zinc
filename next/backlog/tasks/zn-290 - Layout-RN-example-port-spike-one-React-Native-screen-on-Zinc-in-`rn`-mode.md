---
id: ZN-290
title: 'Layout: RN example port spike: one React Native screen on Zinc in `rn` mode'
status: Backlog
assignee: []
created_date: '2026-10-07 13:08'
updated_date: '2026-10-08 19:04'
labels:
  - ui
  - layout
  - size-M
milestone: m-17
dependencies:
  - ZN-367.03
ordinal: 50800
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/layout-engines.md (section 8, LE-11). Decision: a pluggable layout interface, `classic` stays the default, Yoga 3.2.1 is the opt-in `rn` mode for React Native fidelity. lib/std/ui.ts is shared with the prototype: land the other developer's uncommitted work first, then hunk-only commits.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A real RN screen (FlatList, nested flex, percent, absolute badge, text wrapping) from the owner's app (or a public RN sample if not shared) runs unchanged apart from imports.
- [ ] #2 Pixel golden recorded; a diff list of what differs from the device screenshot is written.
- [ ] #3 Gaps become backlog tasks (each with a fixture).
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Needs FlatList (ZN-367.03) to run a real React Native screen unchanged apart from imports; dependency added 2026-10-08.
<!-- SECTION:NOTES:END -->
