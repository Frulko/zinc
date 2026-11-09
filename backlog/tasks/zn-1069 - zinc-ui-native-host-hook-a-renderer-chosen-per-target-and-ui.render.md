---
id: ZN-1069
title: 'zinc:ui native host hook: a renderer chosen per target and ui.render'
status: Done
assignee:
  - '@parallel'
created_date: '2026-11-08 21:43'
updated_date: '2026-11-09 01:32'
labels:
  - ui
  - appkit
  - size-M
milestone: m-31
dependencies: []
ordinal: 8000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Generalise the DOM host's contract (lib/std/ui.ts ui.dom*, targets/web/dom.js) into a host module chosen per target and per zinc.json "ui": {"render": "native"}: a per-frame change buffer in the record wire format and a native measure hook for Yoga and classic leaves. Design: docs/reports/appkit-native-ui-research.md sections 6 and 9, decision D210.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 zinc.json "ui": {"render": "native"} selects a native host; targets without one keep the drawn UI with no change
- [x] #2 After each changed frame zinc:ui hands one change buffer (create, update, move, remove) to the host; the web DOM host uses the same contract
- [x] #3 Yoga leaves can be measured by the host (text, controls) through a measure hook
- [x] #4 A T0 test drives a stub host and checks the buffer for a mount, an update and a removal; the three engines agree
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Web search (sonnet, 2026-11-09): Fabric's mounting layer emits Create/Delete/Insert/Remove/Update in a fixed order (removes in reverse index order, deletes, creates, inserts last), has no Move (remove + insert), one Remove for a subtree root then Delete per node; layout-only views are flattened, and indices must be mounted-sibling indices (https://reactnative.dev/architecture/render-pipeline, https://cdn.jsdelivr.net/npm/react-native@0.85.1/ReactCommon/react/renderer/mounting/Differentiator.cpp, https://reactnative.dev/architecture/view-flattening). Text and TextInput are measured by host functions Yoga calls during layout, not at mount; measure gets the content box and Exactly/AtMost/Undefined modes, YGNodeMarkDirty only on nodes with a measure function (https://www.yogalayout.dev/docs/advanced/external-layout-systems). Flutter's SemanticsUpdateBuilder sends changed nodes with their absolute child id lists, no insert/move op (https://api.flutter.dev/flutter/dart-ui/SemanticsUpdateBuilder-class.html). Lynx batches element ops per frame to the main thread (https://lynxjs.org/guide/ui/elements-components).

Done:
- zinc.json "ui": {"render": "drawn" | "native"} (src/frontend/project.cpp, bad values refused), exported by zinc:platform as UI_RENDER; ZINC_RENDER overrides it for one run (read by ui.ts, as ZINC_PLATFORM_LOOK).
- lib/std/ui.ts: ui.setHost(commit | null) installs a native host only when the render is native (returns false otherwise, nothing changes); nativeRender(), hostActive(), hostCommitCount(). frame() calls commitHost() where it calls the DOM host, instead of painting. One text buffer per changed frame, one record per line: d ID, c ID KIND, f ID X Y W H (parent-relative), t ID TEXT (escaped), p ID NAME VALUE (HOST_PROPS, only what differs from HOST_DEFAULTS on create), k ID CHILD... (absolute child lists, Flutter-style: inserts, moves and removals in one record, the host sets its subviews to the list), r ID... (root, then shown layers). Order: deletes, creates/updates in tree order, child lists, roots. Recycled handles are told apart by the UiNode object (Mounted.n): d then c in one buffer, and the parent's k is re-sent when a child is new.
- src/host/layout.h + layout_yoga.cpp: zn::host::setNativeMeasure(NativeMeasure): text leaves (kind 0) and fields (kind 1) are asked first, the host's size wins, false falls back to wrapText; images are not asked. tests/native/layout_yoga_test.cpp nativeMeasure() covers it.
- T0 tests/t0/ui_native_host.sh + tests/golden/ui-native-host: mount, update (text, colour, move), removal with a recycled handle, removal; interpreter golden, AOT and QuickJS byte-identical; ZINC_RENDER=drawn installs nothing (0 commits).

Decisions (for the coordinator to record with D210):
- The buffer is text records (as the a11y bridge's device('a11y') lines), not the binary native-record wire: one string crosses every engine and the native ABI with one call, is readable in tests, and needs no UTF-8 encoder in Zinc. A binary encoding waits for a measured commit cost (ZN-1074's numbers).
- Child lists are absolute (k ID CHILD...) instead of Fabric's index inserts/removes: no index drift, moves are free, and AppKit's NSView.subviews setter (and dom.js's reconcile) take a list.
- AC2, the DOM host: it shares the host hook in frame() and the dom* event functions; it keeps reading the tree itself, because the browser lays out and needs the class rules and states, which the buffer does not carry. Moving dom.js onto the buffer is a later line.
- The native measure is a C++ hook in src/host/layout.h (one per process, engine thread, pure query), not a ZnHostApi entry: the AppKit host links into zinc as zn_plugin_system does, and the frozen native ABI v1 stays as it is.

Not proven here: no AppKit host (ZN-1070); classic-layout leaves are not measured by the host; extra windows (mountWindow) are not committed to the host; text input/IME still starts SDL text input under a native host.

later.md lines:
- ZN-1069: targets/web/dom.js could read the native host buffer (d records free its element cache, k records replace reconcile) instead of syncing every node each changed frame.
- ZN-1069: the classic layout's leaves are measured in ui.ts; a native host measures only rn (Yoga) leaves.
- ZN-1069: under a native host, frame() still starts SDL text input for a focused field and keeps windows of mountWindow drawn; the AppKit host should own both (ZN-1070/1071).
- ZN-1069: a binary record buffer (native-record wire) if the commit's string building shows in ZN-1074's measures.

Proposed tests:
- tests/run --only layout_yoga (builds the Yoga test and an ASan/UBSan build: about 1 min, 1 GB): the native measure hook under the sanitizers.
- tests/run --only ui_native_host (about 15 s with the AOT compile, 300 MB): already run here, passes.
- tests/run --only ui_dts (tsc, 20 s): lib/ui.d.ts regenerated with the new exports.
<!-- SECTION:NOTES:END -->
