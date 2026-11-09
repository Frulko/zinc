---
id: ZN-1093
title: Support JSX id attributes for accessible composite controls
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-11-09 16:23'
labels:
  - ui
  - frontend
  - size-S
milestone: m-32
dependencies: []
ordinal: 1011.5
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Blocks ZN-1078.12 Data grid. Minimal repro /tmp/zinc-id-1093/main.tsx: three lines import Solid render and View id="cell-1" => Z0005 unknown attribute id on View. Existing aria-* generic attribute pipeline can carry id; no data-grid-specific registry. Research from Data subagent: https://www.w3.org/TR/wai-aria/#aria-activedescendant and https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/#kbd_focus_activedescendant require a unique descendant IDREF with composite focus and scrolling; https://react.dev/reference/react-dom/components/common documents standard id string and aria props. Preserve shared UI/core and all3 engines; sole core writer handles after1088, before1090. Existing opaque script dependency correction remains1088 scope.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Literal and reactive id attributes work on JSX host nodes and VirtualList in both UI models, stored as the same generic attribute across engines
- [ ] #2 Small exact regression covers id updates, aria-activedescendant relationships and sibling identifiers without changing refs or unknown-attribute diagnostics
- [ ] #3 Original Data grid check and a short relevant host feature proof pass; no app workaround is kept
<!-- AC:END -->
