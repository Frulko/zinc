# Zinc Next: resume

Overwritten at the end of the session. Binding rules: `RULES.md`, `ARCHITECTURE.md`, `TESTING.md`.

## State (2026-10-13)

- ZN-738 Done, owner request: Leap Motion plugin plus Fruit Ninja style demo, visualizer and air writing. `plugins/leapmotion` exposes `zinc:leapmotion`; `examples/leapmotion` is Air Arcade. D118, `docs/plugins/leapmotion.md`, `docs/reports/zinc-next-leapmotion.md`.
- Run: `ZINC_NATIVE=real build/zinc run ../examples/leapmotion --interp`. An interactive window was launched for the owner. Keys 1/2/3 select modes, Space starts a round/clears ink, S toggles simulation, U undoes ink. Mouse drag works too. The actual Mac and installed LeapC SDK are arm64. The service returns tracking frames; the owner is testing physical gestures.
- PASS: `tests/run --only leapmotion`, `tests/run --tier t1 --only leapmotion_demo`, `tests/run --only ci_plan`; native plugin clang warning check. Fake SDK verifies event memory lifetime, stale/lost/empty frames, reopening and SDK shutdown order. Native API and demo checked on interpreter, AOT and QuickJS; one visual golden and short frame comparisons. No engine build or cross-target tests needed.
- LeapC comes from `/Applications/Ultraleap Hand Tracking.app/Contents/LeapSDK`; nothing proprietary is copied. `Leap-Motion-for-Mac/build/leap_clion` is only a sample executable. Native SDK loading stays optional and simulation explicit. A no-SDK plugin cache must be cleared after first installing SDK headers (documented).
- Usage: `tools/usage` reports cumulative other-session totals, not an isolated estimate for this session.

## Next / retained handovers

- Await the owner's experience of the open Air Arcade window; fixes belong to ZN-738. Then `tools/next-task` for backlog work.
- Previous agent/Pi session details are preserved in `f1aded86:next/RESUME.md` and their task notes. Still relevant: ZN-735 visual tearing verdict, ZN-729.04 login-service verification, and the Pi keyboard overlay/calibration follow-ups. This session touched none of those modules.
- Existing known failures (not re-investigated): tls, macOS fullscreen/vibrancy, system_instance under load, museum_details/editor/update, pinball3d pixel rounding; see the prior handover and later.md.
- Unrelated uncommitted changes remain untouched: `apps/studio/samples/hello-flow.zproj/project.json`, `docs/reports/hardware/hp-touchpad-webos.md`. No push.
