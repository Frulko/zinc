---
id: ZN-291
title: 'Layout: Profile matrix: wasm, rpi1, ps2 and fallback decision'
status: Backlog
assignee: []
created_date: '2026-10-07 13:08'
labels:
  - ui
  - layout
  - size-S
milestone: m-17
dependencies:
  - ZN-285
ordinal: 50810
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/layout-engines.md (section 8, LE-12). Decision: a pluggable layout interface, `classic` stays the default, Yoga 3.2.1 is the opt-in `rn` mode for React Native fidelity. lib/std/ui.ts is shared with the prototype: land the other developer's uncommitted work first, then hunk-only commits.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `rn` builds and runs the `layout-175` test on wasm (size printed), rpi1 (Pi test rig or its emulation) and ps2 (PCSX2/emulator) or is marked unsupported with the measured reason.
- [ ] #2 `targets/capabilities.json` `ui.layout.rn` values updated from the measurement.
- [ ] #3 `docs/ui.md` has a "Layout modes" page with the section 4 differences table.
<!-- AC:END -->
