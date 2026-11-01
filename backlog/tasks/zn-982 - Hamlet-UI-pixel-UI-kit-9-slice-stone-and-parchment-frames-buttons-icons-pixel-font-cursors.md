---
id: ZN-982
title: >-
  Hamlet UI: pixel UI kit - 9-slice stone and parchment frames, buttons, icons,
  pixel font, cursors
status: Done
assignee: []
created_date: '2026-11-01 14:23'
updated_date: '2026-11-01 14:54'
labels:
  - hamlet
  - demo
  - ui
  - m3
  - size-L
milestone: m-30
dependencies: []
ordinal: 741080
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The Sierra look of Caesar III, Zeus, Emperor and Pharaoh: carved stone and parchment panels, bevelled buttons with normal, hover, pressed and disabled states, resource and building icons baked through the atlas, a pixel font and context cursors (build, erase, info). Theme tokens so a Greek, Roman or Egyptian skin is data. Replaces the flat HUD rectangles.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A 9-slice frame, button and icon module in view/ui-kit with the states and a pixel font, no flat rectangles left in the game HUD
- [x] #2 Theme tokens (stone, parchment, ink, accent) load from data and two skins exist
- [x] #3 Cursor changes with the tool and over interactive parts
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Kit in examples/hamlet/src/ui/kit.ts + icons.ts, tokens in assets/ui-theme.json (skins roman, nile), font PixelifySans (OFL; flipctl pixel fonts have no accents). Frames and buttons are cached images per size/state. Committed with ZN-983/984 (the HUD needs all three).
<!-- SECTION:NOTES:END -->
