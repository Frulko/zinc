# Audit: zinc:gestures (plugins/gestures)

## What it is
Pan, pinch-zoom, rotate, tap and double-tap from mouse, wheel, trackpad pinch and touch, with release velocity for inertia. For canvases and games; zinc:ui has its own onTap/onDrag.

## Targets and status
plugin.json: macos, linux, windows, rpi1, wasm, esp32, ps2. Pure Zinc. Used by zinc:map (and `tests/data/plugins_line`, `tests/t1/dev_mode.sh`). No dedicated test; the map tests cover it indirectly. No device verification recorded.

## What the docs have
- [ ] No plugin doc. docs/ui.md ("Gestures", line 165) says only that zinc:gestures remains the tool for raw input; docs/plugins/map.md describes its use; guide/05 calls it a real pure-Zinc plugin example.
- [ ] Overview, quick start, API reference (the fields of `Gestures` are only in the source comments)
- [ ] Runnable example: none besides examples/maps/explorer (indirect); [ ] screenshot; [ ] tutorial; [ ] test

## What is missing
1. docs/plugins/gestures.md: overview, "when to use this vs zinc:ui onTap/onDrag", quick start.
2. Quick start: `const g = new Gestures(); onFrame(dt => { g.update(dt, x, y, w, h); zoom *= g.scale; offX += g.dx; ... })`.
3. Field table: `dx dy scale rotate x y active released vx vy tap doubleTap wheelStep` with units (px, factor, radians, px/s) and the one-frame flags.
4. Thresholds (tap < 0.3 s and < 12 px, double tap < 0.4 s and < 30 px, velocity smoothing) so users can reason about them.
5. A tiny runnable example `examples/touch-check` already exists: check whether it can be pointed at zinc:gestures and add a "pinch image" demo with a GIF.
6. A test: a T0 that feeds synthetic pointer/touch input (ZINC deterministic) and asserts tap/doubleTap/scale.
7. Note on platforms: mouse-only on esp32/ps2, touch ids, rotate ignored by the map.
8. (hardware) trackpad pinch on a Mac, touch on a phone/tablet.

## Wrong or stale
- plugin.json claims esp32 and ps2 targets; nothing verifies them.
- docs/ui.md pointer ok. No contradictions found otherwise.

## Suggested pages
Gestures overview; API reference (generated); Tutorial: pan and zoom a canvas; Recipe: inertia scrolling; gestures vs zinc:ui events; Example: map explorer.
