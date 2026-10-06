---
id: ZN-053
title: 'Single-app packaging for macOS, Windows and Linux'
status: Review
assignee: []
created_date: '2026-10-06 16:42'
updated_date: '2026-10-06 18:34'
labels:
  - size-L
dependencies: []
ordinal: 32600
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
One self-contained download per OS: the engine, lib/std, the runtime sources and objects for cross builds, the core firmware images, pins of QEMU and esptool, the app shell. macOS .app (signed, notarized), Windows installer or zip, Linux AppImage. Auto-update of the pins and of the app. Size budget.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 a clean machine runs the app, builds for a Pi, and flashes or emulates an ESP32 with no manual install
- [x] #2 signing and notarization steps scripted
- [x] #3 size of each package recorded against a budget
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. tools/package (macOS .app zip 4.4 MB of 40; Linux tar written, not run), sourceRoot (ZINC_ROOT / beside exe), zinc --root, zinc update, zinc build falls back to the pinned zig without a compiler, macos-shim for mimalloc, tools/sign-macos (dry-run tested, not run against Apple), tools/appimage. T0 package, T2 package (clean machine on macOS arm64 passes). AC1 left open: only macOS verified; Linux/Windows packages need those machines (ZN-054).
<!-- SECTION:NOTES:END -->
