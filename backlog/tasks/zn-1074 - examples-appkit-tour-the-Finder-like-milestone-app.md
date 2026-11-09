---
id: ZN-1074
title: 'examples/appkit-tour: the Finder-like milestone app'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-11-08 21:44'
labels:
  - ui
  - appkit
  - demo
  - size-M
milestone: m-31
dependencies:
  - ZN-1071
  - ZN-1072
  - ZN-1073
ordinal: 8050
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The milestone app of section 9 of docs/reports/appkit-native-ui-research.md: a window with a toolbar, a sidebar, a table of 10,000 rows, a form, the menu bar, dark mode and VoiceOver, on the three engines; the drawn run for comparison. Follows examples/GUIDELINES.md; tests are proposed for the owner.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 examples/appkit-tour runs under render native on interpreter, AOT and QuickJS
- [ ] #2 The same program runs with the drawn UI where no native host exists
- [ ] #3 VoiceOver reads the sidebar, the table and the form
- [ ] #4 The task notes end with Proposed tests and the measurements to log
<!-- AC:END -->
