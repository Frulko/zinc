---
id: ZN-285
title: >-
  Layout: Option and selection: `ui.layout` in `zinc.json`, capabilities key,
  build-time inclusion
status: Backlog
assignee: []
created_date: '2026-10-07 13:08'
labels:
  - ui
  - layout
  - size-S
milestone: m-17
dependencies:
  - ZN-282
  - ZN-283
ordinal: 50750
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/layout-engines.md (section 8, LE-6). Decision: a pluggable layout interface, `classic` stays the default, Yoga 3.2.1 is the opt-in `rn` mode for React Native fidelity. lib/std/ui.ts is shared with the prototype: land the other developer's uncommitted work first, then hunk-only commits.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `"ui": {"layout": "rn"}` selects Yoga; `classic` default; `auto` follows `targets/capabilities.json` `ui.layout`.
- [ ] #2 `rn` on esp32 or ps1 fails the build with a diagnostic naming the reason.
- [ ] #3 A `classic` ESP32 build contains no Yoga symbol (`nm` check in a T0 test).
<!-- AC:END -->
