# Leap Motion plugin and Air Arcade (ZN-738, ZN-739, ZN-740)

The owner's request was a Zinc Fruit Ninja style demo, hand visualizer and air writing, treating Leap Motion as a plugin.
`plugins/leapmotion` wraps the installed LeapC SDK through the existing native-module ABI. The app, projections, gestures,
slicing and ink stay in `examples/leapmotion`; the compiler, interpreter, AOT, QuickJS and graphics runtime are unchanged.

The supplied `Leap-Motion-for-Mac/build/leap_clion` is an example executable. Its CMake project points to the official SDK
in `/Applications/Ultraleap Hand Tracking.app/Contents/LeapSDK`. This development Mac and both binaries are arm64;
the historical Intel machine description in AGENTS.md no longer describes the running machine.

A native snapshot contains connection state, aggregate revision, mean frame rate, total hand/device counts, then per-device
identity, state, SDK frame ID, rate and hands. Each hand has 93 numbers: identity, side, pinch/grab, palm/wrist/elbow,
25 joint positions and five finger-extension flags. Device serials are read only at discovery. The multi-device-aware connection
opens and subscribes to at most two devices, routing tracking by `event.device_id`; attach/loss uses the event's device reference.
SDK memory is copied before another poll; the loop never blocks and drains at most 64 events. Each stalled stream expires
independently after 250 ms. LeapC stays loaded across reconnects and is closed before its own process-exit destructors.
The explicit deterministic simulator exposes two devices with one hand each, cycling through rock/paper/scissors.

Air Arcade retains `zinc:gfx` and bundled Inter fonts for its interface; the existing `zinc:3d` plugin renders lit hand meshes
and textured fruit. Geometry is pooled. Hand lab has a floor grid, sensor models and an orbit camera; independent sensor
coordinate spaces are offset side by side, not fused. The game retains swept segment/circle collision; perspective placement
preserves the screen-space collision centre/radius. Hemisphere meshes have sealed flesh-coloured cut faces and separate rotations.
Ink uses pinch hysteresis and time-based smoothing. Hand/device changes interrupt gestures; clicks, pinches and timed hover
operate controls. Ink and particle storage are bounded. Drawings and records last for one session.

The fourth mode, Shifumi, binds a device to each player without moving player two into player one's slot on disconnection.
A three-second countdown accepts only a recognised pose held for at least 180 ms at the end. Tracking loss cancels a round;
uncertain poses score nothing. Valid poses are copied and frozen at reveal so the model matches the result even as players
move again. Each valid non-draw round awards one point. Device replacement is explicit through the reassignment control.

ZN-740 adds a Solo/2 joueurs toggle to Fruit 3D, with solo as the default. Two players share the arena with separate sensor
bindings, blade histories, scores, combos and bomb penalties. First segment/circle contact within the frame decides ownership;
exact ties alternate priority. Missing/replaced hands, navigation and range changes interrupt blade continuity without changing
sensor ownership. Restart reassigns devices; changing player count clears the round and returns to the ready screen.

Seven unmodified CC0 images from TextureCan, qubodup and nevak replace placeholder fruit colours with skin and cut-face textures.
They are reusable alternatives, not Halfbrick assets. Local source URLs, download URLs, hashes and licence text are recorded in
`examples/leapmotion/assets/fruits/`. Existing mesh UVs map the skins; custom disc UVs sample cut photographs and the watermelon
atlas. Geometry, plugin ABI and renderer remain unchanged; kiwi skin and the bomb remain procedural. No runtime network access.

Validation: `tests/t0/leapmotion.sh` covers deterministic skeletons, collision/combos/bombs/restarts, ink lift/undo/bounds,
missing SDK, all nine shifumi outcomes, gesture rejection and device assignment. With the installed SDK header, a fake LeapC
library verifies two-device subscription, overlapping hand/frame IDs, duplicate discovery, event memory invalidation,
independent staleness, empty/lost frames, reconnect and shutdown. Native API checks run on interpreter, AOT and QuickJS.
`tests/t1/leapmotion_demo.sh` drives all four modes and toggles fruit multiplayer through keyboard and mouse. It compares duel,
fruit geometry and multiplayer goldens, including short identical textured multiplayer frames on all three engines. Model tests
check first-hit ownership, no double award, per-player combos/bombs, solo ignoring the second blade and interrupted tracking.
The fake SDK and simulated hands keep those checks independent of physical gestures.
The real service reported one device and tracking frames on this Mac; two physical sensors together have not been verified.
The updated interactive demo was launched in real tracking mode. No engine build or cross-target test was needed.

See [the plugin API](../plugins/leapmotion.md) and [launch and controls](../../examples/leapmotion/README.md).
