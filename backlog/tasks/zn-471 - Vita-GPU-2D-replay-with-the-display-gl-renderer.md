---
id: ZN-471
title: 'Vita: move the GXM replay onto the shared ff_replay (rounded shapes on the GPU)'
status: Backlog
assignee: []
created_date: '2026-10-09 07:38'
updated_date: '2026-10-25 01:53'
labels:
  - gpu
  - handheld
  - handhelds
  - vita
  - size-M
milestone: m-23
dependencies:
  - ZN-470
ordinal: 50700
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**What is left (review 2026-10-25):** Call ff_replay from gxm_vita.cpp (drop its private copy), so corners, borders, shadows go to the GPU; compare with the CPU frame; record bouncing-ball max count against the software figure on hardware. Already there: targets/vita/gxm_vita.cpp; targets/console/ff_replay.cpp.

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

2026-10-17: the replay is not display-gl's gl_renderer (GLSL on vitaGL) but an own GXM replay of the command lists (ZN-470's choice, owner's request): targets/vita/gxm_vita.cpp draws CLEAR, square one-colour RECTs, IMAGEs (atlas boxes, flips, tint, alpha, nearest/linear), TEXT (baked and runtime glyph tables through a 512x512 coverage atlas, U8 as alpha over white) and rectangular CLIPs cut on the CPU; any other command makes the frame a software one (the shared rasterizer into a CDRAM texture the GPU shows, no CPU doubling). Criterion 3 (gl_renderer.cpp stays shared): untouched.

2026-10-17 handover: the replay runs on hardware (Meadow Run 60 fps, see ZN-470's note). Not done: AC#1 kit-gallery and bouncing-ball are drawn mostly by the software fallback, since their rounded RECTs, BORDERs and SHADOWs are not in the replay. Next step: rounded corners on the GPU without new shaders, with a quarter-disc coverage texture in the glyph atlas (nine quads per rounded RECT, a ring for BORDER), then gradients as vertex colours. Then compare with the CPU frame (tools/glcompare tolerance) using a Vita3K window capture, and measure the ball count on the Vita (AC#2: at least 2x vita-ball). AC#3: gl_renderer.cpp untouched.
Review 2026-10-25: done-partly. Vita GXM replay runs on hardware, but rounded RECT, BORDER, SHADOW and gradients still fall back to the software frame; the shared ff_replay now has the coverage atlas the Vita copy lacks. Evidence: targets/vita/gxm_vita.cpp; targets/console/ff_replay.cpp
<!-- SECTION:NOTES:END -->
