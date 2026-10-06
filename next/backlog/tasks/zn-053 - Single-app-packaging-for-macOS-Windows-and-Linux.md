---
id: ZN-053
title: 'Single-app packaging for macOS, Windows and Linux'
status: Done
assignee: []
created_date: '2026-10-06 16:42'
updated_date: '2026-10-06 23:06'
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
Closed on 2026-10-07 under RULES.md: what remains became tasks of the parity backlog (ZN-042: H-typed-abi, C-typed-abi; ZN-053: H-updater, R-sdl-static; ZN-030: validated on Espressif QEMU and device-sim, real board parked as ZN-055).
<!-- SECTION:NOTES:END -->
