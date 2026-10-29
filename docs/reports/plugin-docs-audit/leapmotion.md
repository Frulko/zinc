# zinc:leapmotion audit (score 3/5)

## What it is
Hand tracking with an Ultraleap Leap Motion sensor: hands, 25 finger joints each, pinch, grab, up to two devices, plus a deterministic simulator.

## Targets and status
- plugin.json: macos, windows (windows has no native code that was run; doc says "other targets await the cross-platform pass").
- Real sensor and SDK: used by examples/leapmotion; tests use the simulator (`tests/t0/leapmotion.sh`, `tests/t1/leapmotion_demo.sh`).

## What the docs have
- [x] overview, [x] quick start, [x] class contents (Tracker, Hand, Device, Vec3 fields; status codes; coordinates)
- [x] install of the Ultraleap SDK with paths, [x] env `ZINC_LEAP_LIBRARY`, cache note
- [x] runnable demo `examples/leapmotion` with a good README (four modes, controls)
- [x] tests
- [ ] screenshots, [ ] tutorial, [ ] API table (it is prose), [ ] troubleshooting list

## What is missing
1. Screenshots of the four modes: `ZINC_LEAP_SIM=1 ZINC_LEAP_MODE=fruit|hand|ink|shifumi ZINC_SHOT=docs/img/leap-<mode>.png zinc run examples/leapmotion` (modes used by tests/t1/leapmotion_demo.sh).
2. A table for `Tracker`, `Hand`, `Device`, `Vec3`, with units (mm, 0..1) and the joint index map (finger*5+joint) as a picture.
3. Tutorial "Draw in the air with a pinch" in 5 steps from `new Tracker()` to a pinch test, using the simulator first.
4. Troubleshooting: service not running, `status` stays 0, 32/64-bit library mismatch, the "SDK absent at first build" cache clearing command written as a copy-paste block.
5. Windows status line. (hardware)
6. Where to buy / which sensor models were tried. (owner)

## Wrong or stale
- `examples/leapmotion/README.md` mentions a local path `/Users/mowmow/Lab/Leap-Motion-for-Mac/build/leap_clion`: remove, it means nothing to a reader.
- Doc mixes `ZINC_NATIVE=real` + `ZINC_LEAP_SIM=1` (demo-only env, read in `examples/leapmotion/src/main.ts`, not by the plugin): say that it is the demo's switch.

## Suggested pages
Overview; Install the Ultraleap service; API reference (generated); Coordinates and joints (diagram); Tutorial: air drawing; Simulator and tests; Example: Air Arcade (screenshots, modes); Troubleshooting.
