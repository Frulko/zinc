---
id: ZN-832
title: LibGodot desktop game hosted by a Zinc application demo
status: Review
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
- [ ] #1 A pinned reproducible LibGodot build runs a small Godot game within one Zinc-owned desktop application
- [x] #2 Zinc navigation or controls exchange bounded commands and state with the hosted game
- [ ] #3 Actual surface input lifecycle and engine shutdown are tested without claiming unsupported restart or multi-instance behavior
- [x] #4 Documentation states retained Godot platform renderer and runtime requirements and includes a runnable proof
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Real official Godot4.6 source shared-library build completed (41MB minimal2D OpenGL runtime; SHA256 pinned source), actual editable Godot Pocket Rally game and native AppKit Zinc-owned host delivered. Reproducible build.sh executed using cached bindings/shared zn_app. Runtime uses auto-loaded rally.pck produced by real PCKPacker; no game translation, global cwd change or --path override build. tests/run --only zinc_libgodot PASS: real Godot GDScript iteration, actual pointer clicks on Zinc TSX pause/resume/faster/reset buttons, real score changes passed to Zinc, orderly one-instance shutdown; bundled .app also passes from /tmp with no separate Zinc CLI/editor. Test sets ZINC_FRAMES=500 to avoid runners normal60frame cap cutting proof short; explicit simulation ticks make score check independent of host scheduling. AC1 and AC3 remain open for coordinator graphical proof of attached native Godot WINDOW_VIEW inside Zinc-owned NSWindow and actual input; headless game+bridge do not prove a surface. Exact local app: examples/zinc-libgodot/build/Zinc Pocket Rally.app. Run ZINC_BACKGROUND=1 package Contents/MacOS/Launcher for capture and clean up. Native host is fixed-size, one instance, no restart/unload promise; library remains loaded until process exit. No cross builds, mobile, full3D compatibility, signing/notarization or performance claims.
<!-- SECTION:NOTES:END -->

## Delivery contract

Owner clarification (2026-10-25): deliver a real runnable project, source files, a README with exact build/run/test commands, required native or authoring project files, and actual execution evidence. A specification or mock alone does not satisfy this task. Do not mark unsupported or unexecuted behavior as Done.
