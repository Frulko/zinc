---
id: ZN-360
title: 'Object styles: shadowColor/Offset/Opacity/Radius and elevation'
status: Done
assignee: []
created_date: '2026-10-08 15:11'
updated_date: '2026-10-08 16:08'
labels:
  - ui
  - style
  - rn
  - size-M
milestone: m-17
dependencies: []
ordinal: 50070
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found by ZN-356: no shadow key in object styles (the raster has a shadow primitive). React Native's iOS shadow props and Android elevation map to one box shadow (elevation as a preset curve); they draw outside the box, clipped by no ancestor overflow except a layer.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 the keys compile and draw a soft shadow under rounded boxes (golden)
- [x] #2 elevation 1..24 follows a documented curve
- [x] #3 the GL renderer draws the same shadow within the tolerance policy
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. Done: object style keys shadowColor (static @shadowColor:hex or dynamic), shadowOffset { width, height } (an object value in StyleSheet and inline, lowered to shadowOffsetX/Y, dynamic expressions allowed), shadowOpacity (no shadow at 0, React Native's default), shadowRadius, elevation (curve: offset e/2, blur 0.8e, opacity 0.12 + 0.012e up to 0.4, black); PROP ids 65..70, UiNode sh* fields, drawn by the existing shadow primitive after the level shadows. tests/t1/style_shadow.sh: frame hash of 7 cards (iOS-style, coloured offset, no opacity -> none, elevation 2/8/16, dynamic) and the GL renderer within the tolerance policy (measured 0 % over 24, mae 0.22). rn-showcase cards have a soft shadow (hashes and screenshots regenerated). The full box-shadow model (spread, inset, multiple) stays with the style task ZN-261.
<!-- SECTION:NOTES:END -->
