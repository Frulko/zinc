---
id: ZN-739
title: Upgrade Air Arcade to 3D and add dual-Leap shifumi
status: Done
assignee: []
created_date: '2026-10-13 12:50'
updated_date: '2026-10-13 13:12'
labels:
  - games
  - plugins
  - size-M
dependencies: []
ordinal: 498410
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner asks for a hand visualizer in real 3D like the original Leap visualizer, a fourth shifumi demo with two Leap Motion devices, and Fruit Ninja in 3D.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Hand lab uses the existing Zinc 3D renderer with lit bone meshes, depth, a floor and interactive camera controls.
- [x] #2 zinc:leapmotion can route two simultaneous device streams and shifumi binds one device to each player, validates gestures and scores timed rounds.
- [x] #3 Fruit slice renders lit 3D fruits and cut halves; targeted simulator, native multi-device and UI checks pass, and the updated demo is launched.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented on the existing zinc:3d renderer, with pooled bone/joint meshes, an orbit camera, textured fruit and sealed rotating cut halves. LeapC uses multi-device-aware configuration and explicit subscriptions; snapshots keep independent device identity, frame IDs and expiration. Shifumi pins one device per player, rejects uncertain gestures, scores after three seconds and freezes the revealed poses. No engine or dependency changes.

PASS: tests/run --only leapmotion; tests/run --tier t1 --only leapmotion_demo. Native checks exercise two devices on interpreter, QuickJS and AOT; the UI test scripts all four modes and compares duel/fruit geometry goldens plus short three-engine 3D hand frames. Native C++ passes -Wall -Wextra -Werror syntax checking. Goldens inspected visually.

The real service reported one device at approximately 83 Hz with no hand in view during the probe. The updated real-tracking Hand lab was launched for the owner. Two physical sensors together remain unverified; two-device routing and scoring are covered by fake SDK and simulation. No cross-target tests or engine build were needed.
<!-- SECTION:NOTES:END -->
