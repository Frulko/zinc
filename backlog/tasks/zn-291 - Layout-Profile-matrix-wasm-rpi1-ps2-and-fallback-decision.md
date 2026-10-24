---
id: ZN-291
title: 'Document the layout modes'
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
ordinal: 11200
updated_date: '2026-10-25 01:53'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**What is left (review 2026-10-25):** Write the "Layout modes" page in docs/ui.md (classic vs rn differences table); the wasm/rpi1/ps2 measurements go to the cross pass. Already there: targets/capabilities.json ui.layout.rn=true for macos, linux, wasm, rpi1, ps2; tests/t1/layout_rn.sh; docs/ui.md has no "Layout modes" page.

From docs/reports/layout-engines.md (section 8, LE-12). Decision: a pluggable layout interface, `classic` stays the default, Yoga 3.2.1 is the opt-in `rn` mode for React Native fidelity. lib/std/ui.ts is shared with the prototype: land the other developer's uncommitted work first, then hunk-only commits.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `rn` builds and runs the `layout-175` test on wasm (size printed), rpi1 (Pi test rig or its emulation) and ps2 (PCSX2/emulator) or is marked unsupported with the measured reason.
- [ ] #2 `targets/capabilities.json` `ui.layout.rn` values updated from the measurement.
- [ ] #3 `docs/ui.md` has a "Layout modes" page with the section 4 differences table.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: done-partly. The rn (Yoga) mode exists and capabilities list it; the measured runs on wasm/rpi1/ps2 and the docs page are missing. Evidence: targets/capabilities.json ui.layout.rn=true for macos, linux, wasm, rpi1, ps2; tests/t1/layout_rn.sh; docs/ui.md has no "Layout modes" page
<!-- SECTION:NOTES:END -->
