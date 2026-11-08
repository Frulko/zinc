---
id: ZN-1073
title: 'AppKit controls and overlays, and the kits mapped to them'
status: Backlog
assignee: []
created_date: '2026-11-08 21:44'
labels:
  - ui
  - appkit
  - size-M
milestone: m-31
dependencies:
  - ZN-1070
ordinal: 8040
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
PushButton, PopUpButton, SegmentedControl, Switch, Checkbox, Slider, DatePicker, SearchField, Progress, Popover, Sheet, Alert; the kits and zinc:react-native map their components to them under the native renderer. Report: docs/reports/appkit-native-ui-research.md, D210.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Each control is a typed zinc:appkit component with a drawn fallback
- [ ] #2 Under render native, the kit's Button, Switch, Select and Slider and the matching zinc:react-native components become the AppKit controls
- [ ] #3 Popover, Sheet and Alert open and close and return their result
<!-- AC:END -->
