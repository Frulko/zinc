# physics3d plugin (`zinc:physics3d`)

3D rigid bodies: things fall, roll, bounce, pile up and are stopped by walls, with hinges and sliders to build mechanisms.
A game steps a `World` at a fixed rate and reads where its bodies are.

- **Native.** [Jolt Physics](https://github.com/jrouwe/JoltPhysics) 5.6.0 (MIT) is compiled into the program from
  `plugins/physics3d/vendor/jolt/` (pin, checksums and what is left out: `vendor/jolt/PIN`). Only programs that import the
  module carry it: about 1.9 MiB (a program that steps one world is 2,143,904 bytes, `console.log('hello')` 227,152; x86_64
  macOS). The first build of the plugin compiles the library once, 48 s with the pinned zig on the development Mac; it then
  stays in the plugin cache, and an edit of the plugin's own code rebuilds in 7 s.
- **Exact.** A step is a pure function of the world and of the calls made since the last one: no clock, the library
  built with its cross-platform determinism. The same program prints the same positions on the interpreter, compiled
  and on QuickJS, run after run, from a saved state, and on any number of threads. The plugin is `deterministic`, so
  headless and golden runs use the real code.
- **Test.** `tests/t1/physics3d.sh` (`tests/data/physics3d/`), benchmark `bench/physics3d_pile.ts`.

| target | status |
|---|---|
| macos | supported, verified on x86_64 |
| linux | in the manifest, not built or run yet |
| anywhere else | not available (error Z5003): the library needs a C++17 compiler and an FPU; no stand-in is written in Zinc |

```ts
import { World, Shape, Motion } from 'zinc:physics3d';

const world = new World();                                   // gravity (0, -9.81, 0): y is up
world.body(Shape.box(10, 0.5, 10), { motion: Motion.Static, position: [0, -0.5, 0] });
const ball = world.body(Shape.sphere(0.5), { position: [0, 4, 0], restitution: 0.6, events: true });

for (let i = 0; i < 240; i++) {
  world.step(1 / 120);                                       // a fixed step, never the frame's dt
  for (const c of world.contacts) if (c.kind === 0) console.log(`hit at ${c.speed.toFixed(1)} m/s`);
}
console.log(ball.x, ball.y, ball.z);                          // plain fields, updated by step()
```

## Units

The library is tuned for moving things between 0.1 and 10 units long, and its tolerances (how far bodies may overlap, from
how far a contact is prepared, when a contact bounces) are fixed numbers of units. So choose the unit by the size of what
moves: metres for a room and its furniture, centimetres for a pinball (a 27 mm ball has radius 1.35, gravity is 981, and the
table is 50 by 100). Raise `maxSpeed` and `maxAngularSpeed` of fast bodies in a small unit: the defaults are 500 units/s and
47 rad/s, and a pinball at 4 m/s spins at 300 rad/s. Masses come from the shapes' volume at density 1000 unless `mass` says
otherwise; only their ratios matter.

## API

Vectors are `x, y, z`; rotations are quaternions `x, y, z, w`; arrays of them are flat `number[]`. A call that cannot be done
throws `PhysicsError` with the reason.

| `World` | |
|---|---|
| `new World(options?)` | `gravity` ([0, -9.81, 0]), `maxBodies` (4096), `maxBodyPairs` (16384), `maxContacts` (8192), `penetrationSlop` (0.02), `speculativeDistance` (0.02), `minRestitutionSpeed` (1), `velocitySteps` (10), `positionSteps` (2), `sleeping` (true), `sleepSpeed` (0.03), `sleepTime` (0.5 s), `threads` (1; 0 one per core) |
| `step(dt, collisionSteps = 1)` | Advances by `dt` seconds in `collisionSteps` equal steps, then updates the fields of the bodies that moved and fills `contacts`. Throws when a step runs out of room for pairs or contacts |
| `contacts: Contact[]` | The contacts of the last step, for bodies created with `events` |
| `body(shape, options?): Body` | A new body, in the world unless `enabled: false` |
| `hinge(a, b, point, axis, options?)`, `slider(a, b, point, axis, options?)` | A `Constraint` between `a` and `b`, or `a` and the world (`b` null); see [Constraints](#constraints) |
| `rayCast(ox, oy, oz, dx, dy, dz, mask?)`, `shapeCast(shape, position, rotation, dx, dy, dz, mask?)` | The first `Hit` along `d`, whose length is the reach, or null. `mask` has a bit per layer (all by default) |
| `setLayersCollide(a, b, collide)` | Whether bodies of layers `a` and `b` (0 to 31) collide; every pair does at first |
| `setGravity(x, y, z)`, `optimize()`, `activeCount()` | `optimize()` rebuilds the broad phase after many bodies were added at once (loading a level), not every frame |
| `saveState(): u8[]`, `restoreState(state)` | The whole state of the simulation and back: on the same world (same bodies and constraints) the same steps then give the same result |
| `destroy()` | Frees the world with its bodies and constraints |

| `Shape` | made once, shared by any number of bodies |
|---|---|
| `Shape.sphere(radius)` | |
| `Shape.box(hx, hy, hz, round?)` | Half extents. `round` is the radius of the rounded edges: by default the library's 0.05, or less for a thin box |
| `Shape.capsule(half, radius)`, `Shape.cylinder(half, radius, round?)` | Along y |
| `Shape.convexHull(points, round?)` | The hull of at least 4 points not in one plane |
| `Shape.mesh(vertices, indices)` | Triangles, counter-clockwise seen from the front. For static and kinematic bodies |
| `Shape.heightField(heights, n, offset, scale)` | `n` x `n` heights (n at least 4), row by row along z; sample (i, j) is at `offset + scale * (i, height, j)`. For static bodies |
| `release()` | The program is done with it; bodies that use it keep it |

| `Body` | |
|---|---|
| `x y z`, `qx qy qz qw`, `vx vy vz`, `wx wy wz` | Position, rotation, linear and angular velocity after the last step or the last set |
| `tag` | A number for the program's own use |
| `setPosition`, `setRotation`, `setTransform`, `setVelocity`, `setAngularVelocity` | |
| `moveTo(x, y, z, qx, qy, qz, qw, dt)` | A kinematic body: the velocities that bring it to this pose in `dt` (call before each step) |
| `applyImpulse(x, y, z)`, `applyImpulseAt(x, y, z, px, py, pz)`, `applyAngularImpulse(x, y, z)` | At once: the velocity fields are read again |
| `applyForce(x, y, z)`, `applyTorque(x, y, z)` | During the next step only |
| `setMaterial(friction, restitution)`, `setLayer(n)`, `setMotion(m)`, `setGravityFactor(f)` | |
| `wake()`, `sleep()`, `mass()`, `refresh()` | |
| `setEnabled(on)` | Takes the body out of the world or puts it back, with its state. Cheap: for a ball waiting in its trough, a target that dropped |
| `destroy()` | Removes the body and the constraints attached to it |

Body options: `motion` (`Motion.Static`, `Kinematic`, `Dynamic`: the default), `position`, `rotation`, `layer`, `friction` (0.2),
`restitution` (0), `linearDamping` and `angularDamping` (0.05), `gravityFactor`, `mass`, `continuous`, `sensor`, `sleeping`,
`events`, `persistedEvents`, `smoothEdges`, `enabled`, `maxSpeed`, `maxAngularSpeed`, `tag`. Of two bodies in contact the friction is
the geometric mean and the restitution the larger.

## Contacts and sensors

A body created with `events: true` has its contacts reported in `world.contacts` after each step: `kind` is
`ContactKind.Added` when two bodies start touching, `Removed` when they stop, and `Persisted` at every step in between when
one of them asked for `persistedEvents`. An added or persisted contact has the point on `a`, the normal from `a` to `b`,
the `speed` at which the two approached along it and the `impulse` the solver is expected to apply (an estimate made when
the contact is found, before the solver runs: use it to choose a sound or a score, not to do physics). A contact is found
a little before the bodies touch (`speculativeDistance`), and a mesh reports one contact per triangle touched.

A `sensor` body collides with nothing and reports what enters and leaves it as contacts whose `sensor` is true. It sees
bodies where they are at the end of a step, so a body with `continuous` that crosses a thin sensor within one step is not
seen: make a sensor as thick as the distance its visitors travel in a step, or test the crossing in the program from the
positions before and after the step.

## Fast bodies

A body moves in steps; one that travels more than its own size in a step can jump over a thin wall. `continuous: true`
sweeps the body through its step (the library's linear cast) and stops it at the first thing it meets. In
`tests/data/physics3d/shots.ts`, 27 mm balls at 3 to 20 m/s stepped at 240 Hz are fired 2,500 times each at a 2 mm
wall, at a mesh ramp, at a flipper and at each other, and none goes through. Two rules come from that test:

- **Something that sweeps into a ball needs short steps.** The sweep is the fast body's own: a kinematic body (a flipper
  at 40 rad/s) that moves into a ball is seen where it is at the end of the step. At 240 Hz, 2 of 2,500 slow balls caught
  by the blade end up behind it; from 480 Hz none does, and the test runs the flipper at 960 Hz (`step(1 / 240, 4)`). Keep
  what a kinematic body travels in a step well under the radius of what it hits.
- **Two fast bodies flying at each other are swept against where the other was.** Both continuous, closing at 40 m/s,
  two balls pass through each other at 240 Hz. Give the step as many collision steps as keep their closing distance per
  step under half a radius: `step(dt, Math.ceil(closingSpeed * dt / (0.5 * radius)))`. One fast ball that hits a slow one
  needs nothing.

A body that rolls on a mesh catches on the inner edges of its triangles unless it has `smoothEdges: true`.

## Constraints

`world.hinge(a, b, point, axis, { min, max, friction })` lets `a` turn around the axis through `point` (world coordinates
at creation); `world.slider(...)` lets it move along the axis without turning. `value()` is the angle (radians) or the
position of `a` from its pose at creation; `min` and `max` limit it (a hinge's `min` is in -pi..0, its `max` in 0..pi).
`motor(Motor.Velocity, speed, limit)` drives it at a speed, `motor(Motor.Position, target, limit, frequency, damping)` to an
angle or a position through a spring (2 Hz and damping 1 by default), `motor(Motor.Off, 0)` frees it; `limit` is the
largest torque or force the motor may apply (0: any). Gravity counts: a motor weaker than the weight it lifts does not lift it.

## On QuickJS

The same module runs on `zinc run --engine quickjs` through the native-module bridge of that engine
(`src/qjs/native_js.cpp`). Arrays that come back from the native side (`saveState()`) are typed arrays there
(`Uint8Array`), plain arrays on the typed engines. A program that must run on both imports only values from the module
(classes, enums, functions), not its option interfaces.

## Performance

`bench/physics3d_pile.ts`: 1,000 boxes and spheres in one heap, none asleep, 60 Hz, the mean time of `world.step()`
over 600 steps (the native step and the state of the 1,000 bodies read back), on one thread and on one per core
(`threads: 0`, 6 on the development Mac). Intel Mac (i7-9750H, 6 cores), 2026-10-11, while other sessions built: load
average 7 to 10 and the CPU held at 37 to 46% of its speed by heat, so these are upper bounds to measure again on a quiet
machine (medians, runs alternated):

| engine | one thread | one per core |
|---|---|---|
| compiled (`zinc build`) | 8.2 ms | 3.6 to 3.8 ms |
| interpreter | | 4.7 ms |
| QuickJS | | 5.1 ms |

Later, at load 5.5 to 6.7 with the CPU at 46 to 60%: one thread 6.0 to 7.9 ms, one per core 2.7 to 3.9 ms (median
3.1). The cores divide a step by 2.1 to 2.3. The heat costs about as much: the 2D pile of `zinc:physics2d`, 1.79 ms on
a CPU at full speed, took 4.07 ms at 44%, which puts the 3D pile near 1.6 ms on one per core at full speed (an estimate
until it is measured on a quiet machine). Every run ends with the same positions, whatever the engine and the number of
threads. A small world is faster on one thread: 20 bodies step in 0.06 ms on one and 0.15 ms on six. `-O3` changes
nothing measurable.

## Limits

- Threads are per world (`threads`, 1 by default): each world with more than one starts its own pool of workers. A
  small world (a pinball's dozen bodies) steps faster on one: waking the workers costs more than it saves.
- Shapes are not composed (no compound, offset or scaled shape): one shape per body, placed by the body.
- Constraints: hinge and slider. The library has more (fixed, distance, point, cone, six degrees of freedom, gears, paths).
- No soft bodies, characters, vehicles or ragdolls: those parts of the library are not vendored.
- Callbacks: contacts are read after the step, not delivered during it, so a program cannot veto a contact or change its
  friction as it happens.

Note on determinism: Jolt's results depend on the order bodies are made in. Two runs that create the same bodies in the same order give the same positions; adding a body among others can move a later contact by a step. A program that keeps a replay or a golden log should create the bodies it may add later after the others (the pinball makes its upper-level bodies last).
