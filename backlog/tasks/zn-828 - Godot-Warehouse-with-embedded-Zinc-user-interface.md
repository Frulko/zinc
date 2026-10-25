---
id: ZN-828
title: Godot Warehouse with embedded Zinc user interface
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-25 11:00'
updated_date: '2026-10-25 11:22'
labels:
  - size-L
  - godot
  - embed
  - ui
dependencies:
  - ZN-825
ordinal: 537460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner request (2026-10-25): launch the Swift/Godot/Blender workflows and demos with agents. Build a Godot GDExtension hosting Zinc UI via the shared embedding boundary: inventory search settings and HUD over a Godot 3D scene.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 An actual Godot project runs Zinc UI with bidirectional inventory and settings state
- [x] #2 Pointer capture focus keyboard text and polled gameplay input routing are demonstrated
- [x] #3 A transparent HUD composites correctly with an explicit alpha contract and persistent texture lifecycle
- [x] #4 A reproducible extension build packaged run README and targeted integration tests cover resize teardown and idle
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Actual macOS arm64 GDExtension + real Zinc TSX inventory/search/kit-slider/HUD and Godot 3D game delivered. Pinned Godot4.6 + godot-cpp e83fd090 verified archives. tools/build profile-pruned bindings and AOT extension links shared zn_app manifest. tests/run --only godot_zinc_ui PASS: native pixels, partial premultiplied alpha, zero idle uploads, inventory/action/slider/search input, captured drag beyond bounds, focus gate with global polled key,2x resize,idempotent teardown; repeated editor import now clean. Bundled Warehouse.app runs from /tmp without Zinc CLI. Shared SDL is isolated via copied archive and two prefixed ObjC class names; only GDExtension entrypoint exported. AC3 left open solely for coordinator graphical moving-background compositing capture after builds quiet; CPU alpha math + blend_premul_alpha shader tested but GPU visual compositing not claimed. No IME composition/clipboard/a11y/gamepad adapter and no other-platform or performance claims. Exact GUI proof: copy godot project+native bin to temp, add override.cfg [display] window/size/no_focus=true, run pinned Godot --path temp and capture, kill process. Dependency core upstream ede117f6 consumed as local75b6a661; integrate upstream once.
<!-- SECTION:NOTES:END -->

## Delivery contract

Owner clarification (2026-10-25): deliver a real runnable project, source files, a README with exact build/run/test commands, required native or authoring project files, and actual execution evidence. A specification or mock alone does not satisfy this task. Do not mark unsupported or unexecuted behavior as Done.

## Coordinator graphical acceptance

Coordinator GPU proof passed on develop: tests/run --tier demo --only godot_zinc_ui_visual with pinned Godot4.6. Actual viewport-routed mouse input, game action, focus isolation, slider and premultiplied RGB composition over two rendered backdrops pass. Capture examples/godot-zinc-ui/preview.png inspected. Test closes its background window; initial probe needed the next game tick to consume the queued Zinc action. No performance claims.
