---
id: ZN-1081
title: Remove focus callbacks before UI node slot reuse
status: Done
assignee:
  - '@parallel'
created_date: '2026-11-09 11:31'
updated_date: '2026-11-09 11:38'
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
- [x] #1 Disposing a focus-within root removes its registration or invalidates its generation before node slot reuse on interpreter, AOT and QuickJS
- [x] #2 A narrow T0 drives dispose, slot reuse, focus change and retained live callbacks without stale callback execution
- [x] #3 Original kit-gallery docking cancel then second drag works without changing event timing or hiding recycled content
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-09: Replaced loose focus-within arrays with a registration record holding the UiNode identity and an explicit Registered/Disposed state. release invalidates and removes registrations before resource callbacks or slot reuse. Dispatch takes a snapshot, skips disposed registrations, and reads the current focus after callback mutations; cleanup and dispatch remain linear. No public node-handle ABI or Virtual/Fenwick code changes.

Research (coordinator-delegated before implementation): Flutter FocusNode.dispose removes listeners and detaches its attachment (https://api.flutter.dev/flutter/widgets/FocusNode/dispose.html, https://api.flutter.dev/flutter/widgets/FocusAttachment/detach.html); React useEffect pairs setup with cleanup (https://react.dev/reference/react/useEffect). Applied deterministic unregistering plus identity checking, with no dependency.

Evidence: ZINC_ROOT=$PWD ZINC=/Users/mowmow/Lab/zinc/.claude/worktrees/agent-aae96db4e67d4b8e6/build/zinc timeout 90 tests/run --only ui_focus_dispose PASS on interpreter, explicit native AOT and QuickJS; zinc check tests/data/ui_focus_dispose/main.ts PASS. The fixture forces the same node index with a different nodeSerial, asserts stale callback absence, verifies retained live callbacks and callback disposal of another pending root and itself followed by reuse. Original Dock cancel/restart proof is pending with the Actions worker using only /tmp/zn-1081-focus.patch temporarily. No engine build or suite run.

Proposed tests: existing kit-gallery Dock cancellation and repeated drag on interpreter/native AOT/QuickJS after integration, 3 short frames per interaction plus AOT compilation, RSS unmeasured; physical keyboard/pointer and cross-target UI checks at the owner milestone.

Original feature proof (Actions worker, 2026-11-09): unchanged tests/golden/kit-chrome fixture passes interpreter and QuickJS with only /tmp/zn-1081-focus.patch temporarily applied to its initially-clean ui.ts. Command in .worktrees/1078-actions: ZINC_ROOT=$PWD ZINC=/Users/mowmow/Lab/zinc/.claude/worktrees/agent-aae96db4e67d4b8e6/build/zinc PATH=$PWD/tools/compat:$PATH tools/compat/timeout25 tests/run --only kit_chrome: PASS 1/0. Same-frame drag → Escape → release → second drag merges the group without event timing changes. Worker restored its ui.ts mirror immediately and confirmed git diff quiet. No leftover process. Native AOT focus lifecycle is covered by the focused T0; native gallery drag remains a proposed milestone check.
<!-- SECTION:NOTES:END -->
