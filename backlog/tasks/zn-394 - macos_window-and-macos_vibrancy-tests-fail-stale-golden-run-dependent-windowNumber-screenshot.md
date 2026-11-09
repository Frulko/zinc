---
id: ZN-394
title: >-
  macos_window: do not compare the fullscreen button position (display
  dependent)
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-09 00:33'
updated_date: '2026-11-09 06:26'
labels:
  - test
  - macos
  - size-S
dependencies: []
ordinal: 14300
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Rewritten by the review of 2026-11-07:** Drop the fullscreen close-button position from macos_window golden; macos_window and macos_vibrancy pass twice or skip with reason.

**Rewritten by the review of 2026-10-25:** Drop the fullscreen close-button coordinates from the golden (or print only whether it exists); check macos_deeplink too.

Found during ZN-322.01: since 4aeb32b7 (transparent window and vibrancy) the window readback prints opaque, windowNumber and vibrancy, which tests/golden/macos/window/expected (a03154e9) does not hold; windowNumber changes every run, so it cannot be in a golden. macos_vibrancy fails reading window.png (the screenshot is not written in this session: screen recording permission, or the capture path). Filter windowNumber out of the readback (or print only whether it is > 0), record the golden again, and make the vibrancy screenshot skip with a reason when capture is not allowed.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 macos_window and macos_vibrancy pass twice in a row on this Mac, or skip with the reason
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-09: macos_deeplink fails the same way in full T1 (the app's out.log is never written).

2026-10-10, Intel Mac (no notch): after iTerm got the screen recording permission, macos_vibrancy passes (its window.png failure was the permission). macos_window passed once, then failed on the fullscreen readback only: 'in fullscreen: close 7,6' where the golden has 20,22, so the fullscreen button position depends on the display; the windowNumber line no longer differs.
Review 2026-10-25: rewrite. Notes say vibrancy passes once screen-recording is granted; macos_window fails only on the fullscreen button position (display dependent).
Review 2026-11-07: rewrite. Flaky window test: drop the fullscreen button position from the comparison, or skip with a reason. One-line fix.

2026-11-09 (M1 Pro, notch display): macos_window failed only because the readback took stderr too (2>&1): on a fresh ZINC_HOME the plugin build progress (and the zig download outside tests/run) lands in it. The test now compares stdout only and prints stderr on a failure. The fullscreen button position is placed by AppKit per display (20,22 under the notch, 7,6 on the Intel Mac): the 'in fullscreen' line keeps the button's presence as 'close <display>'; the position after leaving fullscreen is still compared. windowNumber was already normalised. macos_window and macos_vibrancy each passed twice in a row through tests/run --only (Screen Recording granted to this terminal; vibrancy keeps its WARN-and-skip of the pixel check without the permission).
Research (sonnet): no project golden-compares traffic-light frames; Electron specs wait on enter/leave-full-screen events and always leave fullscreen before closing (electron PR 53502); CGPreflightScreenCaptureAccess() reports the permission without prompting, but the grant belongs to the terminal and can be stale (developer.apple.com/forums/thread/805245), so a real capture probe stays the check.
<!-- SECTION:NOTES:END -->
