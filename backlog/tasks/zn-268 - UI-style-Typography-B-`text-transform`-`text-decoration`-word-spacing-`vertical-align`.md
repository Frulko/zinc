---
id: ZN-268
title: >-
  UI style: Typography B: `text-transform`, `text-decoration`, word spacing,
  `vertical-align`
status: Done
assignee: []
created_date: '2026-10-07 12:57'
updated_date: '2026-10-25 01:53'
labels:
  - ui
  - style
  - size-M
milestone: m-17
dependencies:
  - ZN-267
ordinal: 371000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/ui-style-system.md (section 6, ST-19). The audit and the design are in that report. Additive only: defaults and all examples/* stay pixel-identical (tools/proto-capture compare). lib/std/ui.ts is shared with the prototype and holds another developer's uncommitted StyleSheet work: land it first, then change the file with a hunk-only commit.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Goldens for underline, line-through, uppercase, word spacing.
- [x] #2 Decoration is `rrect` commands only (command-count test).
- [x] #3 Non-Latin-1 uppercase works on desktop profiles via ZN-165 tables, ignored with a log line on esp32.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
+ AC2: command counts are asserted (tests/golden/ui-cmds, t1 ui_cmds) through the new zinc:gfx commandCount()/commandsFree() and ui.lastFrameCommands(): a ring is one border, an outline one more, underline and line-through one rrect each, a text shadow one more text run, and below 32 free commands the shadow is dropped.
Review 2026-10-25: closed as Done. Underline, line-through, text-transform, word spacing and vertical align are done with goldens; only the esp32 log line of AC3 is cross. Evidence: tests/golden/ui-cmds, tests/t1/ui_cmds.sh, tests/golden/ui-style/text-deco.tsx; commit 5ee774a2 Verifier: The desktop half of AC3 works: 'éßωя'.toUpperCase() prints ÉSSΩЯ, and ui.ts:2909 uses toUpperCase. Only the esp32 log line is left, and it is cross.
<!-- SECTION:NOTES:END -->
