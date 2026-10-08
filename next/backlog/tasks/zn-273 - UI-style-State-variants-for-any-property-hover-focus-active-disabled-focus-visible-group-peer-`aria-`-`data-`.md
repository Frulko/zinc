---
id: ZN-273
title: >-
  UI style: State variants for any property: hover, focus, active, disabled,
  focus-visible, group/peer, `aria-*`, `data-*`
status: Done
assignee: []
created_date: '2026-10-07 12:57'
updated_date: '2026-10-08 07:32'
labels:
  - ui
  - style
  - size-L
milestone: m-17
dependencies:
  - ZN-271
ordinal: 50730
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/ui-style-system.md (section 6, ST-24). The audit and the design are in that report. Additive only: defaults and all examples/* stay pixel-identical (tools/proto-capture compare). lib/std/ui.ts is shared with the prototype and holds another developer's uncommitted StyleSheet work: land it first, then change the file with a hunk-only commit.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `hover:opacity-80 hover:-translate-y-1 hover:shadow-lg` golden through `ui.pointerAt`.
- [x] #2 `disabled:` golden; a paint-only state change causes no relayout (layout counter).
- [x] #3 "Accepted and ignored" `hover:` tokens are gone: unknown ones are build errors.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. hover:/focus:/active:/disabled: take any paint-only property (opacity-N, translate-x/y, shadow-*, bg/text/border colours incl. alpha, rounded-*, ring) through a StateOverlay applied by syncState (no relayout: ui.layoutCount() stays, golden/ui-state); other tokens under a state are refused at runtime and at build time (jsx.cpp validClass), the 'accepted and ignored' hover: path is gone. New translate-x/y tokens. Open: group/peer, aria-*, data-* variants, scale-N (origin top-left only today).
<!-- SECTION:NOTES:END -->
