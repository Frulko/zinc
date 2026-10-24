---
id: ZN-474
title: '3DS: screens, touch, swkbd and the UI demo'
status: Backlog
assignee: []
created_date: '2026-10-09 07:38'
labels:
  - 3ds
  - handheld
  - handhelds
  - ui
  - size-M
milestone: m-23
dependencies:
  - ZN-469
ordinal: 214576
updated_date: '2026-10-25 01:53'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
zinc.json targets.n3ds.screen = top | bottom | both (400x480 virtual surface, bottom centred), bottom-screen touch as pointer, Circle Pad as scroll and cursor, swkbd for hal_text_input.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 examples/ui/kit-gallery runs unchanged with screen=bottom and screen=both in Azahar with a recorded input movie reaching three screens
- [ ] #2 swkbd text reaches a field (hardware, noted)
- [ ] #3 60 fps on idle screens on New 3DS settings
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: merged into ZN-472. 3DS touch and bottom screen exist (hardware demo, bottom window on the GPU); swkbd is the same task as ZN-472. Evidence: examples/hardware-n3ds; commit d57004a0 Verifier: Same as ZN-473: carry swkbd, targets.n3ds.screen top|bottom|both and the UI demo criterion (kit-gallery is gone: use examples/hardware-n3ds or hero).
<!-- SECTION:NOTES:END -->
