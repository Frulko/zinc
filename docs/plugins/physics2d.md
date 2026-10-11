# physics2d plugin (`zinc:physics2d`)

2D rigid bodies: things fall, roll, bounce, pile up and are stopped by walls, with revolute and prismatic joints to build
mechanisms (flippers, plungers, doors). A game steps a `World` at a fixed rate and reads where its bodies are. The 3D
sibling is [physics3d](physics3d.md); the two read alike.

- **Native.** [Box2D](https://github.com/erincatto/box2d) 3.1.1 (MIT) is compiled into the program from
  `plugins/physics2d/vendor/box2d/` (pin and checksums: `vendor/box2d/PIN`). Only programs that import the module carry
  it: a program that steps worlds (`next/tests/data/physics2d/drop.ts`) is 1,459,368 bytes, `console.log('hello')` 231,232
  (x86_64 macOS), and the latter is byte for byte the same with or without the plugin in the tree. The first build of the
  plugin compiles the library once (one C file, 8 s for the whole plugin on the development Mac); it then stays in the
  plugin cache, and an edit of the plugin's own code rebuilds in 2.4 s.
- **Exact.** A step is a pure function of the world and of the calls made since the last one: one thread, and the library
  built with `-ffp-contract=off` as its own build does for its cross-platform determinism. The same program prints the
  same positions on the interpreter, compiled and on QuickJS, run after run. The plugin is `deterministic`, so headless and
  golden runs use the real code.
- **Test.** `next/tests/t1/physics2d.sh` (`next/tests/data/physics2d/`), benchmark `next/bench/physics2d_pile.ts`.

| target | status |
|---|---|
| macos | supported, verified on x86_64 |
| linux | in the manifest, not built or run yet |
| anywhere else | not available (error Z5003): no stand-in is written in Zinc |

```ts
import { World, Shape, Motion, ContactKind } from 'zinc:physics2d';

const world = new World();                                   // gravity (0, -9.81): y is up
world.body(Shape.box(10, 0.5), { motion: Motion.Static, position: [0, -0.5] });
const ball = world.body(Shape.circle(0.5), { position: [0, 4], restitution: 0.6, events: true });

for (let i = 0; i < 240; i++) {
  world.step(1 / 120);                                       // a fixed step, never the frame's dt
  for (const c of world.contacts) if (c.kind === ContactKind.Added) console.log(`hit at ${c.speed.toFixed(1)} m/s`);
}
console.log(ball.x, ball.y, ball.angle);                     // plain fields, updated by step()
```

## Units

The library is tuned for moving things between 0.1 and 10 units long, and its tolerances (how far shapes may overlap,
5 mm in metres; from how far a contact is prepared) are fixed numbers of units. So choose the unit by the size of what
moves: metres for a room, centimetres for a pinball (a 27 mm ball has radius 1.35, gravity is 981, the table is 50 by 100).
In a small unit raise the world's `maxSpeed` (400 units/s by default: 4 m/s in centimetres). Masses come from the shapes'
area at `density` 1 unless set otherwise; only their ratios matter.

## API

Vectors are `x, y`; angles are radians, counter-clockwise; point lists are flat `number[]` (x, y, x, y...). A call that
cannot be done throws `PhysicsError` with the reason.

| `World` | |
|---|---|
| `new World(options?)` | `gravity` ([0, -9.81]), `maxSpeed` (400), `minRestitutionSpeed` (1), `pushSpeed` (3: how fast overlapping bodies are separated), `contactHertz` (30), `contactDamping` (10), `sleeping` (true), `continuous` (true: fast bodies are swept against static ones) |
| `step(dt, subSteps = 4)` | Advances by `dt` seconds, solved in `subSteps` sub-steps (contacts are found once per step), then updates the fields of the bodies that moved and fills `contacts` |
| `contacts: Contact[]` | The contacts that began or ended in the last step (shapes made with `events`) and the sensor overlaps |
| `body(shape, options?): Body` | A new body with this shape, in the simulation unless `enabled: false` |
| `revolute(a, b, point, options?)`, `prismatic(a, b, point, axis, options?)` | A `Joint` between `a` and `b`, or `a` and the world (`b` null); see [Joints](#joints) |
| `rayCast(ox, oy, dx, dy, mask?)` | The first `Hit` along `d`, whose length is the reach, or null. `mask` has a bit per layer (all by default) |
| `setGravity(x, y)`, `awakeCount()` | |
| `destroy()` | Frees the world with its bodies and joints |

| `Shape` | a description: attached to a body by `world.body` or `body.addShape`, with its material |
|---|---|
| `Shape.circle(radius, x?, y?)` | Centred at (x, y) in the body |
| `Shape.capsule(x1, y1, x2, y2, radius)` | Around the segment between the two points |
| `Shape.box(hx, hy, x?, y?, angle?, radius?)` | Half extents, centred at (x, y) and turned by `angle`; `radius` rounds the corners |
| `Shape.polygon(points, radius?)` | The convex hull of 3 to 8 points |
| `Shape.segment(x1, y1, x2, y2)` | A line, solid on both sides |
| `Shape.chain(points, loop?)` | One-sided segments through at least 4 points, solid on the right going along (so a clockwise loop holds things inside it): walls and ground that nothing catches on. For static bodies |

| `Body` | |
|---|---|
| `x y`, `angle`, `vx vy`, `w` | Position, angle, linear and angular velocity after the last step or the last set |
| `tag` | A number for the program's own use |
| `addShape(shape, options?)` | Another shape with its own material and filter (the options of [shapes](#shapes)) |
| `setPosition`, `setAngle`, `setTransform`, `setVelocity`, `setAngularVelocity` | |
| `moveTo(x, y, angle, dt)` | A kinematic body: the velocities that bring it to this pose in `dt` (call before each step) |
| `applyImpulse(x, y)`, `applyImpulseAt(x, y, px, py)`, `applyAngularImpulse(i)` | At once: the velocity fields are read again |
| `applyForce(x, y)`, `applyTorque(t)` | During the next step only |
| `setMaterial(friction, restitution)` | Of all its shapes |
| `setMotion(m)`, `setGravityScale(s)`, `wake()`, `sleep()`, `mass()`, `refresh()` | |
| `setEnabled(on)` | Takes the body out of the simulation or puts it back, with its state. Cheap: for a ball waiting in its trough, a target that dropped |
| `destroy()` | Removes the body and the joints attached to it |

Body options: `motion` (`Motion.Static`, `Kinematic`, `Dynamic`: the default), `position`, `angle`, `velocity`,
`angularVelocity`, `linearDamping` and `angularDamping` (0), `gravityScale`, `continuous`, `sleeping`, `fixedRotation`,
`enabled`, `tag`, and the shape options of its first shape.

### Shapes

Shape options: `friction` (0.6), `restitution` (0), `density` (1), `layer` (0 to 31) and `mask` (the layers it meets: all),
`sensor`, `events`. Of two shapes in contact the friction is the geometric mean and the restitution the larger. Two shapes
meet when each one's layer is in the other's mask.

## Contacts and sensors

A shape made with `events: true` has its contacts reported in `world.contacts` after each step: `kind` is
`ContactKind.Added` when two shapes start touching and `Removed` when they stop. An added contact has a point (the middle
of the contact points), the normal from `a` to `b`, the `speed` at which the two approached along it and the `impulse`
the solver applied to push them apart in that step (read after the solve: the impulse of the hit, for a sound or a score).
A removed contact has only its bodies; one that was destroyed since is null.

A `sensor` shape collides with nothing and reports what enters and leaves it as contacts whose `sensor` is true (`a` is the
sensor's body). It sees bodies where they are at the end of a step, so a fast ball that crosses a thin sensor within one
step is not seen: make a sensor as thick as the distance its visitors travel in a step, or test the crossing in the program
from the positions before and after the step.

## Fast bodies

A body moves in steps; one that travels more than its own size in a step can jump over a thin wall. Box2D sweeps every fast
body against static shapes (the world's `continuous`); `continuous: true` on a body (a Box2D bullet) sweeps it against
moving bodies too. In `next/tests/data/physics2d/shots.ts`, 27 mm balls at 3 to 20 m/s stepped at 240 Hz are fired 2,500
times each at a 2 mm wall, at a segment, at a flipper swung by its motor at 40 rad/s and at each other, and none goes
through. Two rules come from that test:

- **Something that moves into a ball needs short steps.** The sweep is the ball's own, against where the other body is at
  the end of the step. At 240 Hz, 1 of 2,500 balls met by the flipper ends up behind it; at 480 Hz none does, and the test
  runs the flipper at 960 Hz (four `step(1 / 960)`). Keep what a moving body travels in a step (the tip of a flipper) under
  half the radius of what it hits.
- **Two bullets are never swept against each other.** Two continuous balls closing at 40 m/s pass through each other at
  240 Hz. Step as many times as keep their closing distance per step under half a radius:
  `n = Math.ceil(closingSpeed * dt / (0.5 * radius))`, then `n` times `step(dt / n)`. One fast ball that hits a slow
  non-continuous body needs nothing.

A chain is one-sided and has no thickness: a body pushed past it (at the bottom of a deep pile) falls through. Floors that
carry heavy piles are boxes.

## Joints

`world.revolute(a, b, point, { min, max, collide })` lets `a` turn around `point` (world coordinates at creation) relative
to `b` or to the world; `world.prismatic(a, b, point, axis, ...)` lets it slide along `axis` without turning. `value()` is
the angle (radians) or the position of `a` from its pose at creation; `min` and `max` limit it. `motor(Motor.Velocity,
speed, limit)` drives it at a speed with a torque or force up to `limit`; `motor(Motor.Position, target, 0, frequency,
damping)` pulls it to an angle or a position through a spring (2 Hz and damping 1 by default; a plunger); `motor(Motor.Off,
0, 0)` frees it. A Velocity motor needs a `limit` sized to the bodies: Box2D has no unbounded motor, and one far stronger
than its bodies (1e30) overpowers the limits and the contacts until the solve blows up. The test's flipper (7 by 1.2 cm at density
2, in centimetres) runs on 1e6. `collide` lets the two bodies still collide with each other (false).

## On QuickJS

The same module runs on `zinc run --engine quickjs` through the native-module bridge of that engine
(`next/src/qjs/native_js.cpp`). A program that must run on both imports only values from the module (classes, enums,
functions), not its option interfaces.

## Performance

`next/bench/physics2d_pile.ts`: 2,000 boxes and circles in one heap, none asleep, 60 Hz with 4 sub-steps, the mean time of
`world.step()` over 600 steps (the native step and the state of the 2,000 bodies read back). Intel Mac (i7-9750H), measured
once on 2026-10-11 while another session worked (load average 3.8 to 4.0, CPU not throttled):

| engine | ms per step | target (ZN-583) |
|---|---|---|
| compiled (`zinc build`) | 1.79 | 2 |
| interpreter | 1.84 | |
| QuickJS | 2.61 | 3 |

The step runs on one thread. To measure again on a quiet machine: `cd next && build/zinc build bench/physics2d_pile.ts -o /tmp/pile && /tmp/pile; build/zinc run bench/physics2d_pile.ts --engine quickjs`.

## Limits

- One thread. Box2D can spread a step over several workers and stay exact; the plugin does not offer it yet.
- Joints: revolute and prismatic. The library has more (distance, weld, wheel, motor, mouse).
- No shape casts, overlap queries or character mover yet; one ray query (the closest hit).
- Contacts are read after the step, not delivered during it, so a program cannot veto a contact or change its friction as
  it happens; there is no event while two shapes stay in contact.
- Box2D's results depend on the order bodies and shapes are made in: a program that keeps a replay or a golden log creates
  them in the same order.
