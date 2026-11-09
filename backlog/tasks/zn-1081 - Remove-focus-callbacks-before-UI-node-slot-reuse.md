---
id: ZN-1081
title: Remove focus callbacks before UI node slot reuse
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-11-09 11:31'
labels:
  - ui
  - frontend
  - size-S
milestone: m-32
dependencies: []
type: bug
ordinal: 1041
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Blocks actual docking in examples/ui/kit-gallery (ZN-1078.05). ui.onFocusWithin stores node indices/callbacks in withinRoots/withinFns/withinOn. release(h) does not remove them; setFocusTo only drops entries when nodes[r].alive is false. If the freed slot is reused before focus changes, an old Tooltip callback drives the new live node: Escape hides a recycled Dock fragment and a second drag cannot start. Worker path/debug identifies draggable238 alive with correct geometry but ancestor234 hidden by old callback, so this is a stale-handle lifecycle bug, not synthetic event timing.

Fix shared lib/std/ui.ts release/focus lifecycle, preserving valid live callbacks and callback-dispatch safety. Never adjust component code/event timing to dodge it. Exact regression: register focus-within callback, dispose its root, force slot reuse, change focus, assert stale callback never runs and live callback still works; prove cancel then repeat real dock drag after the fix.

Main-tree external ui.ts WIP only Virtual/Fenwick logic around636/967; coordinator authorizes minimal isolated changes near release777/focus registry6282, with integration stashing/restoring exact external work. No virtual-list edits. Research addendum delegated by coordinator before work, findings provided in worker brief.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Disposing a focus-within root removes its registration or invalidates its generation before node slot reuse on interpreter, AOT and QuickJS
- [ ] #2 A narrow T0 drives dispose, slot reuse, focus change and retained live callbacks without stale callback execution
- [ ] #3 Original kit-gallery docking cancel then second drag works without changing event timing or hiding recycled content
<!-- AC:END -->
