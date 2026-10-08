---
id: ZN-361
title: >-
  Object styles: the React Native transform array (rotate, scale, translate,
  skew)
status: Done
assignee: []
created_date: '2026-10-08 15:11'
updated_date: '2026-10-08 16:17'
labels:
  - ui
  - style
  - rn
  - size-M
milestone: m-17
dependencies: []
ordinal: 50080
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found by ZN-356: only translateX/Y and scale keys exist; React Native writes `transform: [{ rotate: '45deg' }, { scale: 1.2 }]`. Lower the array to the 2D transform of the node (rotation and skew included once the style task for 2D transforms lands), hit testing included.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 the array compiles with each entry kind, static and dynamic numbers
- [x] #2 a rotated card hit-tests in its rotated shape (test)
- [ ] #3 goldens of rotate/scale/skew in rn mode
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a
Done: jsx.cpp lowers transform: [{...}] (translateX/Y, scale -> scaleX+scaleY, scaleX/Y, rotate/rotateZ in deg/rad/turn or a number of degrees, skewX/Y; static and dynamic; 3D entries refused). ui.ts: PROP 71-75 (rotate, skewX, skewY, scaleX, scaleY) into the TransformX side record n.tf; the even scale paints around the centre (paint, boxOf); hitIn and scrollerAt bring the pointer back through rotate/uneven scale/skew (untransform), children included. tests/t1/style_transform.sh: frame hash, 10 hit probes (above a 45-degree card hits, its old corner does not, a 1.5 scale is hit past its box, skew, translate+0.25turn, dynamic rotate), the rotateX error. proto-capture compare 4/4, tests/run --changed 36/36.
Not done: AC #3 for rotate and skew needs a renderer matrix (gfx has translate only): split to ZN-361.01, which depends on ZN-263. Fixed composition order instead of the array order (ponytail: covers RN's usual arrays; a matrix per entry when 361.01 lands). toLocal ignores rotation.
<!-- SECTION:NOTES:END -->
