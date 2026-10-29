# zinc:physics2d audit (score 4/5)

## What it is
2D rigid-body physics on Box2D 3.1.1: worlds stepped at a fixed rate, shapes, joints with motors, contact and sensor events, ray casts. Deterministic across engines. Used by the pinball games.

## Targets and status
- plugin.json: macos, linux, windows (vendored `box2d.c`), plus a `web` entry (wasm shim `web/physics2d_web.c`).
- Doc table: macos verified (x86_64), linux "in the manifest, not built", "anywhere else: not available". Web is verified by `tests/t0/physics2d_web_hits.sh` and `web_physics2d`; docs/targets/web.md lists it.
- Tests: `physics2d`, `physics2d_bulk`, `pinball_feedback`, `web_physics2d`, bench `bench/physics2d_pile.ts`.

## What the docs have
- [x] overview, [x] quick start, [x] units guide, [x] API tables (World, Shape, Body, joints), [x] contacts and sensors, [x] fast bodies rules, [x] limits, [x] performance table, [x] QuickJS note
- [x] examples: `examples/pinball-kit/physics/world.ts`, pinball games (pinball, n3ds-pinball), `docs/pinball-make-a-table.md` with 5 screenshots
- [ ] screenshots on the plugin page, [ ] step tutorial for the plugin itself, [ ] stand-alone runnable demo in examples/

## What is missing
1. A small demo `examples/physics2d-pile` (boxes falling, click to drop) with `ZINC_SHOT` screenshot; the plugin page has none.
2. Link the pinball screenshots (`docs/img/pinball-playing.png`...) as the showcase.
3. Tutorial "A bouncing ball to a flipper" in 6 steps: world, ground, ball, fixed step loop, revolute flipper with motor, contact `Hit` for a sound.
4. API table gaps: `version()`, `Joint` methods (`value`, `motor`, `setLimits`, `destroy`), `Contact` and `Hit` fields (kind, a, b, speed, point, normal, impulse, sensor), `JointOptions`, `PhysicsError`.
5. Update the targets table (web/wasm yes; windows status).
6. Numbers measured on the M1 Pro (the table is Intel i7), and on the web build.
7. Later.md items to mention as limits: no shape casts, overlap queries, distance/weld/wheel joints (ZN-583.01); n3ds/psp/vita linking (ZN-792).

## Wrong or stale
- "anywhere else | not available (error Z5003)": web is supported through the wasm shim.
- Performance table dated on the previous Intel machine (AGENTS.md says the dev machine is now an M1 Pro).
- "the 3D sibling is physics3d" exists (docs/plugins/physics3d.md); fine.

## Suggested pages
Overview; Quick start; Units; API reference (generated: World, Body, Shape, Joint, Contact, Hit); Contacts and sensors; Fast bodies and tunnelling; Joints and motors; Determinism and replays; Performance; Web build; Tutorial: a flipper; Examples: pinball-kit, pinball.
