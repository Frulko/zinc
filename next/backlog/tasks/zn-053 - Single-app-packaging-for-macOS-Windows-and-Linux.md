---
id: ZN-053
title: 'Single-app packaging for macOS, Windows and Linux'
status: Backlog
assignee: []
created_date: '2026-10-06 16:42'
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
- [ ] #2 signing and notarization steps scripted
- [ ] #3 size of each package recorded against a budget
<!-- AC:END -->
