---
id: ZN-826
title: Swift Observatory native app with an embedded Zinc region
status: Review
assignee:
  - '@parallel'
created_date: '2026-10-25 11:00'
labels:
  - size-L
  - embed
  - swift
dependencies:
  - ZN-825
ordinal: 535460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner request (2026-10-25): launch the Swift/Godot/Blender workflows and demos with agents. Build Native Observatory: macOS SwiftUI chrome surrounds one real Zinc child view, with bidirectional selection speed and pause controls. Reuse the embedding task.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The macOS app builds and embeds Zinc in the same window with no external Zinc window
- [x] #2 Swift controls update Zinc and Zinc selection updates a native details panel
- [ ] #3 Retina resize keyboard focus hide show and shutdown have a scripted proof
- [ ] #4 A runnable README targeted smoke check and reviewed capture accompany the demo
<!-- AC:END -->

## Delivery contract

Owner clarification (2026-10-25): deliver a real runnable project, source files, a README with exact build/run/test commands, required native or authoring project files, and actual execution evidence. A specification or mock alone does not satisfy this task. Do not mark unsupported or unexecuted behavior as Done.

## Implementation notes

Real runnable project: examples/swift-observatory (SwiftUI chrome, NSView child surface, Zinc stage scene, C++ host bridge, build.sh and README). `ZINC=/Users/mowmow/Lab/zinc/build/zinc examples/swift-observatory/build.sh` built the complete .app with swiftc and an AOT runtime dylib. It needs no Zinc CLI at runtime. `zinc check` passed. `tests/t1/swift_observatory.sh` passed with real AOT two-way controls/selection, paused idle serial, keyboard Tab, pointer hit testing, resize and repeated shutdown. Native-to-Zinc command snapshots are read only on a queued command; Zinc-to-native selection uses the existing console callback.

AC2 checked on the real no-window native bridge test. AC1/3/4 remain unchecked until the coordinator runs the actual native-window script after parallel builds finish and reviews its PNG. No native window or benchmark was started in this worker. The SwiftUI/NSView code compiled successfully, which alone is not native visual proof.

Coordinator commands (from repository root):

```sh
ZINC=build/zinc examples/swift-observatory/build.sh
mkdir -p examples/swift-observatory/captures
ZINC_BACKGROUND=1 'examples/swift-observatory/build/Native Observatory.app/Contents/MacOS/Observatory' --smoke --capture "$PWD/examples/swift-observatory/captures/observatory.png"
```

The script asserts one visible native window and no SDL window, native controls/selection, pointer-to-native selection, keyboard focus, native resize, explicit 2x surface, hide/show, and idempotent shutdown; it captures the native view and terminates itself. Run alone, inspect PNG, then update criteria.

Cross-platform pass: ZN-826: iOS SwiftUI/UIView embedding needs its own lifecycle, text/IME/accessibility and device proof; the project only builds macOS. No timing/memory numbers claimed while other workers build.
