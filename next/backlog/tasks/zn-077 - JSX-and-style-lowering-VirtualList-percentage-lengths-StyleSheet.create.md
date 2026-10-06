---
id: ZN-077
title: 'JSX and style lowering: VirtualList, percentage lengths, StyleSheet.create'
status: Backlog
assignee: []
created_date: '2026-10-06 22:51'
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
- [ ] #2 jsx.sh golden updated
<!-- AC:END -->
