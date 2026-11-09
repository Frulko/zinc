---
id: ZN-684
title: >-
  plugins/gestures: fingers owned per target and a manipulate gesture (drag,
  pinch, turn)
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-10 19:37'
updated_date: '2026-11-09 00:48'
labels:
  - touch
  - ui
  - size-S
dependencies: []
ordinal: 8200
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
(Found by the museum table, ZN-650.03 and ZN-650.04.) The museum table wrote its own gesture code because plugins/gestures has no per-target finger ownership: several cards under several hands, each gesture owning its card, a finger added or lifted without a jump. Move it into the plugin as a manipulate gesture with inertia.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 the museum table's light table uses the plugin and museum_table passes unchanged
- [x] #2 the plugin doc describes it with an example
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done 2026-11-09. The museum's src/touch.ts (Finger, Fingers with per-target owners, MOUSE, Pose, manipulate) moved into plugins/gestures/index.ts, with the inertia the light table kept per card: Pose has vx, vy, va; manipulate(pose, held, smallest, largest, dt = 0) follows the speed (smoothed, min(1, 18 dt)) when given dt; glide(pose, dt, friction = 4, spin = 6, rest = 4) coasts and stops under rest units/s (0.02 rad/s). Fingers.update keeps the table transform and box as optional arguments (screen pixels, the whole screen by default). The museum imports zinc:gestures (table, player, stage, viewer, lookout), touch.ts is gone, the card's own vx/vy/va are the pose's. Proof (main tree's build/zinc with ZINC_ROOT at this tree, headless, --interp): the hands session of museum_table at 160 frames gives a pose log identical to tests/data/museum_table/expected.log (293 lines, cmp) and the same last-frame hash as develop's unchanged museum table (534365c613d00312); that hash differs from tests/golden/museum-table/frames.txt (216961b085c60998) for develop too, so the drift is the binary, not this change (to look at in the milestone run). zinc check passes for the app and the editor. AC2: docs/plugins/gestures.md with an example (checked and run 5 headless frames). T0: tests/t0/gestures_manipulate.sh (quarter turn about the midpoint, a finger landing mid-gesture, scale clamp, speed with dt, glide to rest), passes. Web search: RNGH composes Pan, Pinch and Rotation with Gesture.Simultaneous and one focal point (https://docs.swmansion.com/react-native-gesture-handler/docs/fundamentals/gesture-composition); Hammer.js has one Manager per element, so ownership is per element, and pinch.recognizeWith(rotate) (https://hammerjs.github.io/recognize-with); WPF InertiaProcessor2D computes origin, scale, translation and rotation after release at a deceleration rate and leaves applying them to the app, as glide does (https://learn.microsoft.com/dotnet/api/system.windows.input.manipulations.inertiaprocessor2d). Pitfalls covered: deltas never across two finger sets (motion only), angle delta wrapped to (-pi, pi], release speed smoothed so a pause before release leaves little. Later: scale and turn from all held fingers (centroid and mean spread, as WPF does), not only the first two. Proposed tests: tests/demo/museum_table.sh (the light table's frames and log, about 1 min, under 1 GB).
<!-- SECTION:NOTES:END -->
