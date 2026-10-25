---
id: ZN-832
title: LibGodot desktop game hosted by a Zinc application demo
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-25 11:01'
updated_date: '2026-10-25 11:33'
labels:
  - size-L
  - godot
  - embed
dependencies:
  - ZN-825
ordinal: 541460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner request (2026-10-25): launch the Swift/Godot/Blender workflows and demos with agents. Implement the separate experimental full-runtime integration with a pinned LibGodot desktop build, keeping its behavior and requirements distinct from Godot-to-Zinc conversion.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A pinned reproducible LibGodot build runs a small Godot game within one Zinc-owned desktop application
- [x] #2 Zinc navigation or controls exchange bounded commands and state with the hosted game
- [x] #3 Actual surface input lifecycle and engine shutdown are tested without claiming unsupported restart or multi-instance behavior
- [x] #4 Documentation states retained Godot platform renderer and runtime requirements and includes a runnable proof
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Real official Godot4.6 source shared-library build completed (41MB minimal2D OpenGL runtime; SHA256 pinned source), actual editable Godot Pocket Rally game and native AppKit Zinc-owned host delivered. Reproducible build.sh executed using cached bindings/shared zn_app. Runtime uses auto-loaded rally.pck produced by real PCKPacker; no game translation, global cwd change or --path override build. tests/run --only zinc_libgodot PASS: real Godot GDScript iteration, actual pointer clicks on Zinc TSX pause/resume/faster/reset buttons, real score changes passed to Zinc, orderly one-instance shutdown; bundled .app also passes from /tmp with no separate Zinc CLI/editor. Test sets ZINC_FRAMES=500 to avoid runners normal60frame cap cutting proof short; explicit simulation ticks make score check independent of host scheduling. AC1 and AC3 remain open for coordinator graphical proof of attached native Godot WINDOW_VIEW inside Zinc-owned NSWindow and actual input; headless game+bridge do not prove a surface. Exact local app: examples/zinc-libgodot/build/Zinc Pocket Rally.app. Run ZINC_BACKGROUND=1 package Contents/MacOS/Launcher for capture and clean up. Native host is fixed-size, one instance, no restart/unload promise; library remains loaded until process exit. No cross builds, mobile, full3D compatibility, signing/notarization or performance claims.

Native proof (2026-10-25): built the AppKit host against pinned cached godot-cpp and the genuine LibGodot runtime, then ran `ZINC_BACKGROUND=1 ZINC_FRAMES=500 timeout 30 examples/zinc-libgodot/build/rally <absolute-libgodot> --visual-test /private/tmp/libgodot-native.png`: PASS, exit 0. Both native views share the Zinc-owned window; AppKit NSWindow dispatch of real key NSEvents moves the Godot paddle, real mouse NSEvents activate Zinc pause, actual OpenGL viewport image is saved, performClose calls the window delegate and both engines shut down. Inspected the 800x640 GPU PNG: court, paddle and ball present. Fixed ZincNavigation acceptsFirstMouse and explicitly pumped AppKit events. Background tests dispatch directly through NSWindow because NSApp intentionally ignores keyboard events for a non-key background window; no activation or focus stealing. Added guarded manual/demo-tier native regression. Existing headless game/bridge proof also PASS after host change. A real SIGSEGV occurred during the initial visual harness GPU capture: converting temporary `get_image()` Variant directly to Object* destroyed its RefCounted Image before save_png. The final harness keeps texture/image Variants alive through save_png, then releases them inside the frame block before engine destruction. The subsequent full native proof exited 0 and produced the inspected GPU PNG; exact regression `tests/run --tier demo --only zinc_libgodot_native` PASS 1/1 and `tests/run --only zinc_libgodot` PASS 1/1 (including bundled headless run); this is an actual crash fix, not an assertion dismissal. No resize/restart/multi-instance/cross-platform/performance claim.
<!-- SECTION:NOTES:END -->

## Delivery contract

Owner clarification (2026-10-25): deliver a real runnable project, source files, a README with exact build/run/test commands, required native or authoring project files, and actual execution evidence. A specification or mock alone does not satisfy this task. Do not mark unsupported or unexecuted behavior as Done.
