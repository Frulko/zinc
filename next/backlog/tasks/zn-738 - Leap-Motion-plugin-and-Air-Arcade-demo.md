---
id: ZN-738
title: Leap Motion plugin and Air Arcade demo
status: Done
assignee: []
created_date: '2026-10-13 12:23'
updated_date: '2026-10-13 12:43'
labels:
  - games
  - plugins
  - size-M
dependencies: []
ordinal: 497410
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner request: treat Leap Motion as a Zinc plugin and create a cool demo with Fruit Ninja style slicing, a hand visualizer and air writing, using the installed Mac LeapC SDK behind /Users/mowmow/Lab/Leap-Motion-for-Mac/build.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Reusable zinc:leapmotion plugin reports hands, bones, pinch and connection state through the native ABI with an explicit deterministic simulator.
- [x] #2 A polished Zinc demo offers fruit slicing, a hand visualizer and pinch-to-write with keyboard/mouse fallback and clear controls.
- [x] #3 Targeted plugin and demo tests pass on the development Mac; document launch and SDK setup.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented zinc:leapmotion through the existing native ABI, installed LeapC loaded optionally, copied 88-number hand snapshots, nonblocking bounded polling, empty/lost/stale frame clearing and explicit deterministic hands. Air Arcade has fruit rounds, swept cuts, combos, bombs, skeleton visualizer, pinch-to-write, undo/palette/width, mouse fallback, dwell controls, resizing and amplitude adjustment. D118 records the SDK choice. No engine changes or redistributed SDK files.

PASS: next/tests/run --only leapmotion (model, native fake SDK memory invalidation, loss, timeout, missing SDK, reopen and process-exit lifecycle; native API on interpreter, QuickJS and AOT); next/tests/run --tier t1 --only leapmotion_demo (one scripted UI golden and identical short frames across three engines); next/tests/run --only ci_plan. Plugin passes clang -Wall -Wextra -Werror syntax check. Real service probe returned status 2 and tracking frames without visible hands; real QuickJS app starts/exits cleanly. Interactive native demo launched for the owner with ZINC_NATIVE=real next/build/zinc run examples/leapmotion --interp.

Limits: one native Tracker per process; installed proprietary SDK required for live tracking; drawings/record in memory; no handwriting recognition. Physical gestures await the owner testing the open window. Mac only; cross-platform discovery/verification recorded in later.md. Installing an SDK after a no-SDK build requires clearing only the leapmotion plugin cache (documented).

Usage: tools/usage returned cumulative totals from other sessions, not an isolated estimate for this Codex session; not attributed here.
<!-- SECTION:NOTES:END -->
