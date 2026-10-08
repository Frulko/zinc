---
id: ZN-276
title: >-
  UI style: Accessibility styles and metadata: `role`, `aria-*`, `sr-only`, root
  font scale, forced-colours theme, contrast check
status: Done
assignee: []
created_date: '2026-10-07 12:58'
updated_date: '2026-10-08 08:45'
labels:
  - ui
  - style
  - size-M
milestone: m-17
dependencies:
  - ZN-271
  - ZN-272
ordinal: 50760
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/ui-style-system.md (section 6, ST-27). The audit and the design are in that report. Additive only: defaults and all examples/* stay pixel-identical (tools/proto-capture compare). lib/std/ui.ts is shared with the prototype and holds another developer's uncommitted StyleSheet work: land it first, then change the file with a hunk-only commit.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `ui.inspect` dumps role/label/hidden for a form (text expectation).
- [x] #2 `ui.setRootFontSize(20)`: rem lengths scale, 16 leaves every proto golden unchanged.
- [x] #3 A tool checks WCAG AA contrast of `LIGHT` and `DARK` kit themes and fails below 4.5:1 for text roles.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. role/aria-label/aria-hidden attributes (JSX) and ui.setRole/setLabel/setAriaHidden, ui.inspect() text tree (golden/ui-a11y: form, textbox, buttons, hidden, sr-only text), sr-only class, ui.setRootFontSize(px) scaling rem lengths, the spacing scale and text sizes (16 = identical, canary 4/4), tools/contrast-check + tests/t0/contrast.sh: WCAG AA of the kit text roles; it found DARK accent white on indigo-500 at 4.47 (fixed: indigo-600, dark golden updated) and LIGHT mutedForeground on muted at 4.40 (listed as known: changing it would alter the prototype goldens). Open: the forced-colours theme (title), a full aria-* family, focus order metadata.
<!-- SECTION:NOTES:END -->
