---
id: ZN-369
title: 'Inspector: edit spacing, sizes and colours live from the Styles panel'
status: Backlog
assignee: []
created_date: '2026-10-08 15:16'
labels:
  - devtools
  - ui
  - size-M
milestone: m-20
dependencies: []
ordinal: 50110
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The inspector (plugins/devtools, Chrome DevTools) shows the tree, the computed styles and edits `class`. Add the Styles panel's editing: CSS.getMatchedStylesForNode with the node's style objects and classes as rules, CSS.setStyleTexts and the box-model editor for padding, margin, gap, sizes, radius, colours, font size; changes apply live and are collected as a patch (the style object or class string to paste back), shown in the console.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 editing padding in the box model of DevTools changes the app's frame (scripted CDP test with scripts/cdp-check.mjs)
- [ ] #2 the patch printed for a session lists each node's changed properties in the source form (object or class)
- [ ] #3 works for components styled with classes and with StyleSheet objects
<!-- AC:END -->
