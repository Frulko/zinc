---
id: ZN-271
title: >-
  UI style: Theme variables and schemes: `var(--x)`, `dark:`, `ui.setScheme`, OS
  preference hook, kit on variables
status: Done
assignee: []
created_date: '2026-10-07 12:57'
updated_date: '2026-10-08 07:27'
labels:
  - ui
  - style
  - size-L
milestone: m-17
dependencies:
  - ZN-259
  - ZN-193
ordinal: 50710
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/ui-style-system.md (section 6, ST-22). The audit and the design are in that report. Additive only: defaults and all examples/* stay pixel-identical (tools/proto-capture compare). lib/std/ui.ts is shared with the prototype and holds another developer's uncommitted StyleSheet work: land it first, then change the file with a hunk-only commit.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Switching scheme restyles only flagged nodes (count equals the flagged count) and re-renders no component.
- [x] #2 Default light output unchanged (proto goldens); a dark golden of `examples/ui/kit-gallery`.
- [x] #3 The theme table stays under 1 KiB and `zinc.json` can set the initial scheme.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. ui.defineScheme/setScheme/setSystemScheme/currentScheme/schemeRestyled; bg-[var(--role)] colours and light:/dark: variants flag their nodes (media bit 16), a switch restyles only those and re-renders no component (golden/ui-theme: counts equal, 1 render). The kit's theme() returns [var(--role)] classes for LIGHT/DARK, setTheme(DARK) only switches the scheme; custom themes keep the signal path. zinc.json top-level scheme (light|dark|auto) -> ZINC_SCHEME. Light output unchanged (canary 4/4, kit-gallery); dark kit-gallery frame hash golden. Table: 30 role names + 2x30 i32 colours, about 600 bytes. Also fixed: the ZN-272 token golden had been truncated by a runtime error (containerOf on a scratch node) and passed spuriously; regenerated with the fix.
<!-- SECTION:NOTES:END -->
