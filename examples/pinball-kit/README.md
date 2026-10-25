# Shared pinball engine

Reusable physics and table data for `pinball`, `n3ds-pinball`, `pinball3d` and its editor. No game-specific art, scores or missions live here.

| Module | Responsibility |
| --- | --- |
| `physics/world.ts` | Box2D 3.1.1 adapter: balls, walls, flippers, plunger, layers and pinball events, in inches |
| `physics/bodies.ts`, `flipper.ts` | Table parts and solenoid motion; Box2D solves their contacts |
| `physics/geom.ts` | Line-crossing gameplay switches; no collision solver |
| `physics3d.ts` | Jolt 5.6.0 adapter: tilted board, volumes, ramps, kinematic mechanisms, centimetres |
| `format/`, `geometry.ts` | Validated table files and the same geometry for rendering, collision and editing |
| `tuning.ts` | Unit conversions, rolling gravity, speed cap and travel-limited collision steps |
| `clock.ts` | Fixed simulation clock and render interpolation |
| `feedback.ts` | Cosmetic mechanical recoil |

Rendering supplies `delta` in seconds. `FixedClock.advance(delta, step)` returns whole simulation steps; `alpha(step)` interpolates the previous and current ball positions. A long stall catches up at most 100 ms, preventing an endless catch-up loop. Under ordinary 30, 60 and 120 Hz rendering, elapsed simulation time is identical.

Box2D and Jolt handle continuous collision detection, friction, restitution and ball contacts. Pinball-specific code supplies the coils, springs, active bumper kicks and gameplay switches. Relative travel is limited to half a ball radius when fast balls or moving flippers need additional steps. Stopped kinematic mechanisms explicitly stop their velocities.

The 2D ramp layers are separate Box2D worlds: switching layers transfers the ball's state once, preserving the playfield below a raised ramp. The 3D adapter uses real volumes in one Jolt world. `destroy()` releases a physics world when its table is discarded.

Space Cadet reference: [travel-limited stepping](https://github.com/k4zmu2a/SpaceCadetPinball/blob/master/SpaceCadetPinball/pb.cpp), [moving flipper contacts](https://github.com/k4zmu2a/SpaceCadetPinball/blob/master/SpaceCadetPinball/TFlipperEdge.cpp). Original game resources and balance constants are not copied.

Checks: `tests/run --only pinball_core` and `tests/run --only pinball_physics`. The old numeric-profile conformance program uses `tests/data/pinball-frozen`, preserving its frozen outputs independently of game tuning.
