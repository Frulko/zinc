---
id: ZN-649
title: >-
  Pinball 3D: a Space Cadet style table in real 3D, data-driven, with a table
  editor
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-10 17:49'
labels:
  - games
  - demo
  - 3d
  - size-L
milestone: m-27
dependencies: []
ordinal: 1010
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Epic. examples/pinball3d: a vertical desktop pinball in the spirit of the 90s Space Cadet table, rendered in real 3D with zinc:3d on the GPU (the existing examples/pinball, Nova Patrol, is pseudo-3D drawn with zinc:gfx and has its own physics), with physics by zinc:physics3d (Jolt: the ball is a real sphere that can leave the playfield, ramps and upper levels are volumes), sound by zinc:audio, and everything about a table (geometry, lanes, elements, materials, models, lights, sounds, rules) in a data file that an editor in the app produces. Original table, names, art and sounds: nothing copied from Space Cadet. Owner's answers, 2026-10-10: complete 3D physics (zinc:physics3d on Jolt, ZN-583.02), not 2D in the table plane; both screen layouts, landscape and portrait, described in the table file and chosen at launch. (Owner request, 2026-10-10: a pinball all in real 3D instead of fake 3D, with a suited physics engine, a vertical table in the style of Space Cadet, parametrable in its lanes and assets, with a complete editor to make new tables, visual and sound.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 every subtask is Done
- [ ] #2 the demo is listed in the examples status and has a README with screenshots
<!-- AC:END -->
