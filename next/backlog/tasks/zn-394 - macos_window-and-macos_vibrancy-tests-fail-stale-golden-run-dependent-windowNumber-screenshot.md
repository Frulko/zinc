---
id: ZN-394
title: >-
  macos_window and macos_vibrancy tests fail: stale golden, run-dependent
  windowNumber, screenshot
status: Backlog
assignee: []
created_date: '2026-10-09 00:33'
updated_date: '2026-10-09 02:59'
labels:
  - test
  - macos
  - size-S
dependencies: []
ordinal: 167000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found during ZN-322.01: since 4aeb32b7 (transparent window and vibrancy) the window readback prints opaque, windowNumber and vibrancy, which tests/golden/macos/window/expected (a03154e9) does not hold; windowNumber changes every run, so it cannot be in a golden. macos_vibrancy fails reading window.png (the screenshot is not written in this session: screen recording permission, or the capture path). Filter windowNumber out of the readback (or print only whether it is > 0), record the golden again, and make the vibrancy screenshot skip with a reason when capture is not allowed.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 macos_window and macos_vibrancy pass twice in a row on this Mac, or skip with the reason
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-09: macos_deeplink fails the same way in full T1 (the app's out.log is never written).
<!-- SECTION:NOTES:END -->
