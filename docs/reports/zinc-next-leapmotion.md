# Leap Motion plugin and Air Arcade (ZN-738)

The owner's request was a Zinc Fruit Ninja style demo, hand visualizer and air writing, treating Leap Motion as a plugin.
`plugins/leapmotion` wraps the installed LeapC SDK through the existing native-module ABI. The app, projections, gestures,
slicing and ink stay in `examples/leapmotion`; the compiler, interpreter, AOT, QuickJS and graphics runtime are unchanged.

The supplied `Leap-Motion-for-Mac/build/leap_clion` is an example executable. Its CMake project points to the official SDK
in `/Applications/Ultraleap Hand Tracking.app/Contents/LeapSDK`. This development Mac and both binaries are arm64;
the historical Intel machine description in AGENTS.md no longer describes the running machine.

A native snapshot contains connection state, frame ID, frame rate, hand count, and 88 numbers per hand: identity, side,
pinch/grab, palm/wrist/elbow and 25 joint positions. SDK memory is copied before another poll; the loop never blocks and
drains at most 64 events. A stalled stream expires after 250 ms. LeapC stays loaded across reconnects and is closed before
its own process-exit destructors. The public API has an explicitly selected deterministic two-hand simulator.

Air Arcade uses `zinc:gfx` vector primitives and the bundled Inter fonts. The game uses a swept segment/circle collision;
ink uses pinch hysteresis and time-based smoothing. Hand changes interrupt both gestures. The mouse can operate all modes;
clicks/pinches and timed hover operate controls. Ink and particle storage are bounded. Drawings and records last for one session.

Validation: `tests/t0/leapmotion.sh` covers deterministic skeletons, collision/combos/bombs/restarts, ink lift/undo/bounds,
missing SDK and, when the installed SDK header is present, a fake LeapC library that invalidates its own memory, emits empty
frames and disconnects, then stalls. `tests/t1/leapmotion_demo.sh` drives the actual UI, compares one golden, and checks a short
identical simulated frame on the interpreter, AOT and QuickJS. The real service produced tracking frames on this Mac;
physical gestures require a hand over the sensor. No cross-target build was run.

See [the plugin API](../plugins/leapmotion.md) and [launch and controls](../../examples/leapmotion/README.md).
