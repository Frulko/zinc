---
id: ZN-862
title: 'Trieur: native demos and a photo library manager'
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-29 23:21'
updated_date: '2026-10-29 23:21'
labels:
  - demo
  - ui
dependencies: []
ordinal: 566460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner request (2026-10-30): run the web library trieur (~/Lab/trieur, vendored unchanged in third_party/trieur by tools/sync-trieur) natively on Zinc, fill the engine gaps it meets (in the engine or in plugins), port its demos, and build a full photo library manager: one or more source folders, sorted into the same or another output folder, a trash, pretty icons, animations and colours.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 trieur's core and learn sources run unchanged (QuickJS engine)
- [ ] #2 A zinc:ui deck component reproduces the gesture: drag, fling, tap a zone, keys, undo, multi-zone, suggestion
- [ ] #3 Several demos port the site's examples
- [ ] #4 A photo manager demo: source folders, output folder, move/copy, trash, thumbnails, EXIF, model suggestions
- [ ] #5 Engine and plugin gaps fixed with tests; T1 test for the photo demo
<!-- AC:END -->
