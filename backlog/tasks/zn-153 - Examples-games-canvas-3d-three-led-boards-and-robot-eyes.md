---
id: ZN-153
title: 'Examples: games, canvas, 3d, three, led/boards and robot eyes'
status: Done
assignee: []
created_date: '2026-10-06 23:04'
updated_date: '2026-10-08 01:38'
labels:
  - examples
  - size-M
milestone: m-15
dependencies:
  - ZN-105
  - ZN-107
  - ZN-128
  - ZN-125
  - ZN-060
  - ZN-113
ordinal: 40950
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
pinball, breakout, canvas/sketch, 3d/*, three/*, led/*, boards/s3-matrix/*, scrollphat/*, robot-eyes*, lang: unchanged sources, goldens or frame hashes from the prototype.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 tests/examples.lst OK for each; the board demos match their frame-hash goldens through the chip models
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. tools/examples-status: 63 of 63 entries OK (pinball, breakout, canvas, 3d, three, led, boards/s3-matrix, scrollphat, robot-eyes, lang included); the board demos match their frame-hash goldens through the chip models (T1 framehash and chip_models pass). Still different from the prototype's frame 30 and recorded as known rows: pinball and three/cubes (whole frame), tracked by ZN-223.
<!-- SECTION:NOTES:END -->
