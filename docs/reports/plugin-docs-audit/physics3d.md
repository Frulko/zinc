# physics3d (`zinc:physics3d`)

## What it is
3D rigid bodies on Jolt Physics 5.6.0: worlds stepped at a fixed rate, boxes/spheres/meshes, hinges and sliders, contact events, ray casts. For games, pinball, toys and simulations; deterministic.

## Targets and status
- plugin.json: macos, linux, windows (Jolt sources). `deterministic: true`.
- Doc table: macos "supported, verified on x86_64"; linux "in the manifest, not built or run yet"; elsewhere Z5003 (no stand-in). The windows entry in the manifest is not in the doc table.
- Web: no (backlog/later.md: "web `zinc:3d` and `zinc:physics3d`, or a documented 'use three' answer").
- Tests: `tests/t1/physics3d.sh` (+ `tests/data/physics3d/drop.ts`, `shots.ts`), `qjs_native`, `pinball3d` (affected.json); bench `bench/physics3d_pile.ts`.

## What the docs have
- [x] Overview, native/size/build cost, determinism
- [ ] Install/requirements (nothing says "just import it"; no `zinc doctor` line, no toolchain note for the 48 s first build beyond a sentence)
- [x] Quick start (14 lines, runs)
- [~] API reference: World, Shape, Body tables, body options, constraints, QuickJS note. Missing the fields of `Contact` and `Hit`, `version()`, `Constraint.setLimits/destroy/value` table, `Body.tag`/`mass` details
- [x] Example code (Fast bodies, constraints prose)
- [x] Runnable examples: examples/pinball3d, pinball3d-editor, pinball-kit/physics3d.ts (none linked from the doc)
- [ ] Screenshot or GIF (none; docs/img has no physics3d image)
- [ ] Step-by-step tutorial
- [ ] Commands a user types (no `zinc run examples/pinball3d`)
- [x] Notes to know: units, determinism and body order, limits, performance
- [x] Test named (`tests/t1/physics3d.sh`)

## What is missing
1. Screenshot of examples/pinball3d (`ZINC_SHOT=docs/img/physics3d-pinball.png ZINC_HEADLESS=1 zinc run examples/pinball3d`), and a 3-second GIF of a pile falling (tests/data/physics3d/drop.ts rendered with zinc:3d).
2. API tables for `Contact` (kind, sensor, a, b, x/y/z, nx/ny/nz, speed, impulse, `other()`), `Hit` (body, fraction, point, normal), `Constraint` (value, motor, setLimits, destroy), `version()`, `PhysicsError`.
3. "Your first falling box" tutorial in 5 steps: world and floor, a body, step loop with fixed dt, draw it with zinc:3d (link to docs/plugins/3d.md), react to a contact.
4. Tutorial "Hinge a door / drive a flipper with a motor" (pinball flipper is the real case).
5. Links to the three examples above and the commands to run them with `ZINC_BACKGROUND=1`.
6. Recipe: step at fixed rate from a variable frame (accumulator loop) - the doc says "never the frame's dt" but shows no loop.
7. Use `ContactKind.Added` in the quick start instead of the magic `0`.
8. Arm64 Mac verification status and a Windows row (verify: (owner) on a Windows machine).
9. Web answer: one line telling a web user to use three.js physics or that it is unavailable.
10. Benchmark table is from the Intel i7 under load, marked as an upper bound; re-measure on the M1 Pro quiet machine.

## Wrong or stale
- "verified on x86_64" and sizes/timings are from the Intel Mac; the development machine is now an M1 Pro (AGENTS.md).
- Manifest lists windows, the doc table does not.
- Quick start compares `c.kind === 0` instead of `ContactKind.Added`.
- Test row in doc says `tests/t1/physics3d.sh`, affected.json also maps `physics3d`, `qjs_native`, `pinball3d`; fine, but pinball3d is not mentioned.

## Suggested pages
- API: physics3d (generated: World, Shape, Body, Contact, Hit, Constraint, enums)
- Guide: Units and fixed steps
- Guide: Contacts, sensors and events
- Guide: Fast bodies and continuous collision
- Steps: A box that falls (with screenshot)
- Steps: A flipper with a hinge and a motor
- Examples: pinball3d, pinball3d-editor, pinball-kit
- Notes: Determinism, body order and replays; QuickJS differences
- Notes: Performance and threads
