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
  - parked
milestone: m-23
dependencies:
  - ZN-466
ordinal: 95700
updated_date: '2026-10-25 01:53'
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: parked. iOS 9 UI demo: needs the owner's iPhone 4S, the old Xcode 13.4.1 armv7 SDK and a jailbreak or free-profile signing; no targets/ios-legacy or libc++ build tool exists; far from the owner goal (the modern iOS export is ZN-624..631). Park with the iOS 9 cluster (461, 462, 466, 475, 479, 483, 497, 498). Evidence: no targets/ios-legacy, no tools/build-ios-legacy-libcxx
<!-- SECTION:NOTES:END -->
