---
id: ZN-475
title: 'iOS 9: keyboard, multitouch, lifecycle and the UI demo'
status: Backlog
assignee: []
created_date: '2026-10-09 07:38'
labels:
  - handheld
  - handhelds
  - ios
  - ui
  - size-M
milestone: m-23
dependencies:
  - ZN-466
ordinal: 300220
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Hidden UIKeyInput view (then UITextInput for marked text) for hal_text_input, multitouch HalTouch, memory warnings drop glyph and image caches, density 2 resources.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 examples/hero runs unchanged on the iPhone 4S
- [ ] #2 editing a text field with the system keyboard works
- [ ] #3 peak resident memory of hero stays under 150 MB (logged from task_info)
<!-- AC:END -->
