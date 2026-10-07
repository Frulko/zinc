---
id: ZN-288
title: >-
  Layout: `classic` RN-compat subset, opt-in via `"preset": "react-native"` or
  tokens
status: Backlog
assignee: []
created_date: '2026-10-07 13:08'
labels:
  - ui
  - layout
  - size-L
milestone: m-17
dependencies:
  - ZN-282
  - ZN-251
ordinal: 50780
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/layout-engines.md (section 8, LE-9). Decision: a pluggable layout interface, `classic` stays the default, Yoga 3.2.1 is the opt-in `rn` mode for React Native fidelity. lib/std/ui.ts is shared with the prototype: land the other developer's uncommitted work first, then hunk-only commits.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `flex: 1` equal shares (basis 0), `flexShrink`, `minWidth/maxWidth`, `alignSelf`, `aspectRatio` available as opt-in props; with none set the legacy loop runs unchanged (goldens tol 0).
- [ ] #2 These cases pass in the conformance runner for `classic`.
- [ ] #3 `size` growth of `classic` documented, under 6 KB of ZBC on the esp32 profile. Replaces ST-05's remaining scope.
<!-- AC:END -->
