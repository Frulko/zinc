---
id: ZN-471
title: 'Vita: GPU 2D replay with the display-gl renderer'
status: Backlog
assignee: []
created_date: '2026-10-09 07:38'
updated_date: '2026-10-17 09:37'
labels:
  - gpu
  - handheld
  - handhelds
  - vita
  - size-M
milestone: m-23
dependencies:
  - ZN-470
ordinal: 239000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Run plugins/display-gl/src/gl_renderer.cpp on the path chosen by vita-gpu-spike, with a Vita context file; atlases and images in CDRAM; one scene per frame.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 kit-gallery and bouncing-ball match the CPU render within the display-gl tolerance
- [ ] #2 bouncing-ball maximum ball count at 60 fps is at least 2x vita-ball
- [ ] #3 gl_renderer.cpp stays shared
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-17 (owner: "prends bonnes notes sur comment Pocket3D s'adapte aux hardware"): read ../docs/reports/games/pocket3d-hardware-adaptation.md before starting. Vita lessons in ZN-470's note.
<!-- SECTION:NOTES:END -->
