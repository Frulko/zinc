# Leap Motion (`zinc:leapmotion`)

A native Zinc module for the Ultraleap LeapC service. It is loaded only by programs that import it;
no Leap-specific code was added to the engine. Mac host integration; other targets await the cross-platform pass.

```ts
import { Tracker } from 'zinc:leapmotion';
import { onFrame } from 'zinc:gfx';
const tracker = new Tracker(); // true explicitly selects deterministic simulated hands
onFrame((dt: number) => {
  tracker.update(dt);
  for (const hand of tracker.hands) {
    const indexTip = hand.joints[9];
    // indexTip.x / y / z are millimetres, hand.pinch is 0..1.
  }
});
```

Use **one active native Tracker per program**; the native ABI module owns one connection.
`update(dt)` polls without waiting, copies the newest frame and exposes:

- `status`: 0 waiting/unavailable, 1 service connected without a fresh tracking frame, 2 fresh tracking (possibly zero hands).
- `message`: why opening failed; `frameId` (aggregate snapshot revision), `fps` (mean device rate), `hands` (at most four).
- `devices`: at most two `Device` objects, each with `id`, `serial`, `status`, the SDK's `frameId`, `fps`, and up to two `hands`.
- A `Hand`: `id`, `deviceId`, `right`, `pinch`, `grab`, `palm`, `wrist`, `elbow`, `joints`, and `extended` (five booleans, thumb to pinky).
- `joints`: thumb, index, middle, ring, pinky; five joints each from metacarpal base to fingertip. Tip indices: 4, 9, 14, 19, 24.
- `setSimulation(bool)` closes/reset tracking and changes source; `close()` releases the connection and clears the snapshot.

Desktop coordinates: +X right, +Y up, +Z toward the user, independently relative to each sensor. The plugin does not fuse devices.
The connection is multi-device aware and explicitly subscribes to each opened device. The application owns projection and smoothing.
Each event is copied before the next LeapC poll invalidates its memory. Polling drains at most 64 events per call;
Each device's frames expire independently after 250 ms; losing one device preserves the other. Connection loss clears all hands.
Opening retries every two seconds. Reacquired or changed `(deviceId, hand.id)` pairs should reset gesture history: two sensors can
produce the same hand ID. SDK absence never pretends to be real tracking.

Install Ultraleap Hand Tracking **before the first native plugin build** at:

```
/Applications/Ultraleap Hand Tracking.app/Contents/LeapSDK/include/LeapC.h
/Applications/Ultraleap Hand Tracking.app/Contents/LeapSDK/lib/libLeapC.dylib
```

The plugin includes the official header when present and loads the library with `dlopen`. `ZINC_LEAP_LIBRARY` overrides
the library path (it must match the engine architecture and header ABI). A custom SDK can supply `LeapC.h` through the compiler
include search path. SDK binaries/headers remain separately installed under Ultraleap's licence and are not redistributed here.
If the SDK was absent at the first build, the native plugin provides an explanatory error; use `Tracker(true)` or the mouse in the demo.
After installing/changing SDK headers, clear **only the leapmotion cache directory** reported by `zinc plugin-build leapmotion`,
then run again (the external SDK header is not part of Zinc's plugin content key).

`ZINC_NATIVE=sim` uses the safe native stand-in; opt into two simulated devices with `new Tracker(true)`.
For the 3D demo, retain `ZINC_NATIVE=real` and select tracking simulation with `ZINC_LEAP_SIM=1`; the renderer is also a native plugin.
[Air Arcade](../../examples/leapmotion/README.md) shows 3D slicing, 3D hand visualisation, freehand writing and a two-device shifumi game.
[Official coordinates](https://docs.ultraleap.com/api-reference/tracking-api/leapc-guide/leap-concepts.html)
and [multi-device subscriptions](https://docs.ultraleap.com/api-reference/tracking-api/examples/multi-device-example.html).
