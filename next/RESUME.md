# Zinc Next: resume

Overwritten at the end of the session. Binding rules: `RULES.md`, `ARCHITECTURE.md`, `TESTING.md`.

## State (2026-10-13)

- ZN-739 Done, owner request: Air Arcade now has real 3D hand meshes and an orbit camera, lit/textured fruits with rotating cut halves, and a fourth Shifumi mode for two Leap Motion devices. Uses the existing `zinc:3d` renderer; no engine changes. Builds on ZN-738/D118. API and controls are in `docs/plugins/leapmotion.md`, `examples/leapmotion/README.md`; report in `docs/reports/zinc-next-leapmotion.md`.
- Run: `ZINC_NATIVE=real ZINC_LEAP_MODE=hands build/zinc run ../examples/leapmotion --interp`. An interactive window was launched for the owner. Keys 1/2/3/4 select modes, Space starts a round/resets the camera/clears ink, S toggles two-device simulation, U undoes ink. Drag and wheel orbit/zoom. The actual Mac and installed LeapC SDK are arm64. Real service probe: one physical device, about 83 Hz, no hand in view; two physical sensors together are not yet verified.
- PASS: `tests/run --only leapmotion`, `tests/run --tier t1 --only leapmotion_demo`; native plugin clang `-Wall -Wextra -Werror` syntax check. Fake SDK verifies multi-device subscriptions/routing, overlapping IDs, copied memory, independent stale/lost/empty frames, reopening and shutdown order. Shifumi tests all outcomes, unknown gestures, loss and stable assignments. Native API and demo checked on interpreter, AOT and QuickJS; duel and fruit geometry goldens inspected, short 3D hand frames compared. No engine build or cross-target tests needed.
- LeapC comes from `/Applications/Ultraleap Hand Tracking.app/Contents/LeapSDK`; nothing proprietary is copied. `Leap-Motion-for-Mac/build/leap_clion` is only a sample executable. Native SDK loading stays optional and simulation explicit. A no-SDK plugin cache must be cleared after first installing SDK headers (documented).
- Usage: `tools/usage` reports cumulative other-session totals, not an isolated estimate for this session.

## Next / retained handovers

- Await the owner's experience of the open Air Arcade window, especially real two-sensor play after connecting the second device. Fixes belong to ZN-739. Then `tools/next-task` for backlog work.
- Previous agent/Pi session details are preserved in `f1aded86:next/RESUME.md` and their task notes. Still relevant: ZN-735 visual tearing verdict, ZN-729.04 login-service verification, and the Pi keyboard overlay/calibration follow-ups. This session touched none of those modules.
- Existing known failures (not re-investigated): tls, macOS fullscreen/vibrancy, system_instance under load, museum_details/editor/update, pinball3d pixel rounding; see the prior handover and later.md.
- Unrelated uncommitted changes remain untouched: `apps/studio/samples/hello-flow.zproj/project.json`, `docs/reports/hardware/hp-touchpad-webos.md`. No push.
