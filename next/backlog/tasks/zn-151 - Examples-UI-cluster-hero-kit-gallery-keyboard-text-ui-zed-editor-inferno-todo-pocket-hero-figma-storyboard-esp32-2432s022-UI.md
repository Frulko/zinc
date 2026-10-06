---
id: ZN-151
title: >-
  Examples: UI cluster (hero, kit-gallery, keyboard, text, ui/*, zed-editor,
  inferno-todo, pocket-hero, figma-storyboard, esp32-2432s022 UI)
status: Backlog
assignee: []
created_date: '2026-10-06 23:04'
labels:
  - examples
  - size-M
milestone: m-15
dependencies:
  - ZN-068
  - ZN-076
  - ZN-077
  - ZN-069
  - ZN-113
ordinal: 40930
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Make every UI example entry run with zero source change and match its prototype golden: fix what the audit lists (zed-editor checker crashes, pocket-hero inference, inferno-todo VirtualList and imports, figma-storyboard style forms) and anything new that appears.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 tests/examples.lst: every entry of these examples is OK and has a passing pixel comparison
<!-- AC:END -->
