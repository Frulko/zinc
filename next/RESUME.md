# Zinc Next: resume

Overwritten at the end of the session. Binding rules: `RULES.md`, `ARCHITECTURE.md`, `TESTING.md`.

## State (2026-10-13)

- ZN-740 Done, owner request: downloaded CC0 fruit skins/cut faces and optional local two-player Fruit 3D. Seven images and full source/licence/hash records in `examples/leapmotion/assets/fruits/`; reusable alternatives, not official Halfbrick assets. Solo remains default. Two-device play keeps separate scores/combos/bomb penalties, awards each fruit to first contact, and retains device assignments through tracking loss/navigation. No engine, renderer or plugin changes. Builds on ZN-738/D118 and ZN-739's 3D demos/Shifumi.
- Run: `ZINC_NATIVE=real build/zinc run ../examples/leapmotion --interp`. The updated window was launched in Fruit 3D solo. M or the Solo/2 joueurs button changes player count (resets to ready); Space starts, S simulates two devices. One Leap per player in multiplayer. `ZINC_LEAP_MULTIPLAYER=1` starts in duo. Other modes retain keys 1/2/3/4 and camera/ink controls. Two physical sensors together remain unverified (previous probe found one device).
- PASS: `tests/run --only leapmotion`, `tests/run --tier t1 --only leapmotion_demo`; all seven asset hashes match downloads. Tests cover first-hit ownership, no double award, independent scoring/bombs/combos, solo ignoring player two, loss/reacquisition and navigation/calibration continuity. UI script checks keyboard and button toggles; duel/fruit/multiplayer goldens visually inspected and short textured multiplayer frames match interpreter, QuickJS and AOT. Prior native multi-device tests also pass. No engine build or cross-target tests needed.
- LeapC comes from `/Applications/Ultraleap Hand Tracking.app/Contents/LeapSDK`; nothing proprietary is copied. `Leap-Motion-for-Mac/build/leap_clion` is only a sample executable. Native SDK loading stays optional and simulation explicit. A no-SDK plugin cache must be cleared after first installing SDK headers (documented).
- Usage: `tools/usage` reports cumulative other-session totals, not an isolated estimate for this session.

## Next / retained handovers

- Await the owner's experience of the open Fruit 3D window, especially real two-sensor play. Controls and credits are in `examples/leapmotion/README.md`; implementation report in `docs/reports/zinc-next-leapmotion.md`. Fixes for optional fruit multiplayer/assets belong to ZN-740. Then `tools/next-task` for backlog work.
- Previous agent/Pi session details are preserved in `f1aded86:next/RESUME.md` and their task notes. Still relevant: ZN-735 visual tearing verdict, ZN-729.04 login-service verification, and the Pi keyboard overlay/calibration follow-ups. This session touched none of those modules.
- Existing known failures (not re-investigated): tls, macOS fullscreen/vibrancy, system_instance under load, museum_details/editor/update, pinball3d pixel rounding; see the prior handover and later.md.
- Unrelated uncommitted changes remain untouched: `apps/studio/samples/hello-flow.zproj/project.json`, `docs/reports/hardware/hp-touchpad-webos.md`. No push.
