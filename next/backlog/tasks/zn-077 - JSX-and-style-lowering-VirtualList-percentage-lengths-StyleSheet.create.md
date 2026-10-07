---
id: ZN-077
title: 'JSX and style lowering: VirtualList, percentage lengths, StyleSheet.create'
status: Review
assignee: []
created_date: '2026-10-06 22:51'
updated_date: '2026-10-07 02:24'
labels:
  - ui
  - size-M
milestone: m-13
dependencies: []
ordinal: 40190
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Port the missing parts of compiler/src/jsx.ts (:283), styles.ts and ui-style.ts: `<VirtualList count itemHeight>`, percentage and keyword lengths in style objects, StyleSheet.create, style arrays, the remaining unsupported attributes reported by Z0005 in figma-storyboard.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 examples/inferno-todo and ui/figma-storyboard run 3 headless frames; their frames equal the prototype's within the tolerance defined in E-goldens
- [x] #2 jsx.sh golden updated
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. Ported: <VirtualList>, percentage/auto/em lengths and every styleEntry rule of ui-style.ts (colours as @key:hex, rgb(), shorthands, border, fontFamily), StyleSheet.create in .ts and .tsx, static style hoisting, the font-size resource comment. figma-storyboard now runs 3 headless frames (added to tests/t1/examples.sh); tests/t0/jsx_style.sh checks the lowered text. Not done: inferno-todo (needs class components in React mode and record literal assignability: follow-up task), frame comparison with the prototype's frames.
<!-- SECTION:NOTES:END -->
