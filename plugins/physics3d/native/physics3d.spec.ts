// Native side of zinc:physics3d: Jolt Physics behind integer handles (worlds, shapes, bodies, constraints). Everything a
// frame needs comes back in bulk: step() once, then moved() and events(). plugins/physics3d/index.ts wraps the handles
// in classes; a program does not call this directly. A handle that names nothing is ignored (-1 where one is returned,
// see error()). Vectors are x, y, z; rotations are quaternions x, y, z, w; units are the program's (docs/plugins/physics3d.md).
import { NativeModule, requireNative } from 'zinc:native';

export interface Spec extends NativeModule {
  /** The version of the library: '5.6.0'. */
  version(): string;
  /** Why the last call returned -1 or false. */
  error(): string;

  // ---- worlds
  /** o: gravity x y z, max bodies, max body pairs, max contact constraints, penetration slop, speculative contact distance,
   *  minimum speed for restitution, velocity steps, position steps, sleeping (0 or 1), Baumgarte factor, sleep speed, time before sleep;
   *  a NaN keeps the library's default. */
  worldCreate(o: f64[]): i32;
  worldDestroy(w: i32): void;
  worldGravity(w: i32, x: f64, y: f64, z: f64): void;
  /** Whether bodies of layers a and b (0 to 31) collide; every pair does at first. */
  worldLayers(w: i32, a: i32, b: i32, collide: boolean): void;
  /** Rebuilds the broad phase tree: after adding many bodies at once, never every frame. */
  worldOptimize(w: i32): void;
  /** Advances the simulation by dt seconds in `steps` equal collision steps. 0, or the library's error bits
   *  (1 manifold cache full, 2 body pair cache full, 4 contact constraints full). */
  step(w: i32, dt: f64, steps: i32): i32;
  /** The bodies that were active in the last step or fell asleep in it, 14 numbers each: body, position, rotation,
   *  linear velocity, angular velocity. */
  moved(w: i32): f64[];
  /** The contact events of the last step for bodies created with events, 11 numbers each: kind (0 added, 1 persisted,
   *  2 removed; +4 when one of the two is a sensor), body a, body b, the contact point on a, the normal from a to b, the
   *  approach speed along it, the estimated normal impulse. A removed contact has only its bodies (-1: destroyed since). */
  events(w: i32): f64[];
  /** Number of awake bodies. */
  activeCount(w: i32): i32;
  /** The closest hit of the ray from o along d (its length is the reach) among the layers of `mask` (bit n: layer n):
   *  body, fraction of d, point, normal; empty when nothing is hit. */
  rayCast(w: i32, ox: f64, oy: f64, oz: f64, dx: f64, dy: f64, dz: f64, mask: u32): f64[];
  /** The same for a shape placed at `pose` (position, then rotation: 7 numbers) and swept along d. */
  shapeCast(w: i32, shape: i32, pose: f64[], dx: f64, dy: f64, dz: f64, mask: u32): f64[];
  /** The whole simulation state (bodies, contacts, constraints) as bytes, and back: the same world (same bodies, shapes
   *  and constraints, created in the same order) then replays the same steps exactly. */
  saveState(w: i32): u8[];
  restoreState(w: i32, state: u8[]): boolean;

  // ---- shapes (shared by any number of bodies; released when the program says so and no body uses them)
  shapeSphere(radius: f64): i32;
  /** Half extents; `round` is the convex radius of the edges (negative: the library's default, shrunk to fit). */
  shapeBox(hx: f64, hy: f64, hz: f64, round: f64): i32;
  /** Along y: a cylinder of half height `half` with a half sphere at each end. */
  shapeCapsule(half: f64, radius: f64): i32;
  /** Along y. */
  shapeCylinder(half: f64, radius: f64, round: f64): i32;
  /** The convex hull of points (x y z each). */
  shapeHull(points: f64[], round: f64): i32;
  /** Triangles (three indices each) over vertices (x y z each); for static and kinematic bodies. Counter-clockwise is the front. */
  shapeMesh(vertices: f64[], indices: i32[]): i32;
  /** A square grid of n x n heights (row by row along z), placed at offset o and scaled by s; for static bodies. */
  shapeHeightField(heights: f64[], n: i32, ox: f64, oy: f64, oz: f64, sx: f64, sy: f64, sz: f64): i32;
  shapeRelease(s: i32): void;

  // ---- bodies
  /** o: motion (0 static, 1 kinematic, 2 dynamic), position, rotation, layer, friction, restitution, linear damping,
   *  angular damping, gravity factor, mass (0: from the shape, at density 1000), flags (1 continuous collision, 2 sensor,
   *  4 never sleeps, 8 contact events, 16 persisted events too, 32 smooth mesh edges, 64 starts outside the world),
   *  maximum speed, maximum angular speed; a NaN keeps the library's default. */
  bodyCreate(w: i32, shape: i32, o: f64[]): i32;
  bodyDestroy(b: i32): void;
  /** Position, rotation, linear velocity, angular velocity, then 1 when awake. */
  bodyState(b: i32): f64[];
  bodyMass(b: i32): f64;
  bodySetTransform(b: i32, x: f64, y: f64, z: f64, qx: f64, qy: f64, qz: f64, qw: f64): void;
  bodySetVelocity(b: i32, vx: f64, vy: f64, vz: f64, wx: f64, wy: f64, wz: f64): void;
  /** Gives a kinematic body the velocities that bring it to the target in dt seconds. */
  bodyMoveTo(b: i32, x: f64, y: f64, z: f64, qx: f64, qy: f64, qz: f64, qw: f64, dt: f64): void;
  /** kind 0: an impulse at the centre of mass; 1: an impulse at the world point p; 2: an angular impulse; 3: a force
   *  for the next step; 4: a torque for the next step. */
  bodyPush(b: i32, kind: i32, x: f64, y: f64, z: f64, px: f64, py: f64, pz: f64): void;
  bodySetMaterial(b: i32, friction: f64, restitution: f64): void;
  bodySetLayer(b: i32, layer: i32): void;
  bodySetMotion(b: i32, motion: i32): void;
  bodySetGravityFactor(b: i32, factor: f64): void;
  /** Wakes the body, or puts it to sleep. */
  bodyAwake(b: i32, on: boolean): void;
  /** In the world or out of it (kept, with its state: a ball in the trough, a dropped target). */
  bodyEnable(b: i32, on: boolean): void;

  // ---- constraints (b = -1: the world)
  /** A hinge at world point p around axis d. o: limit min, limit max (radians from the pose at creation; NaN: free),
   *  friction torque. */
  hinge(a: i32, b: i32, px: f64, py: f64, pz: f64, dx: f64, dy: f64, dz: f64, o: f64[]): i32;
  /** A slider along axis d through world point p. o: limit min, limit max (from the pose at creation; NaN: free),
   *  friction force. */
  slider(a: i32, b: i32, px: f64, py: f64, pz: f64, dx: f64, dy: f64, dz: f64, o: f64[]): i32;
  /** mode 0 off, 1 reach the velocity `target`, 2 reach the angle or position `target`; `limit` is the largest torque
   *  or force (0: none), frequency and damping are the spring of mode 2 (0: the library's 2 Hz, damping 1). */
  constraintMotor(c: i32, mode: i32, target: f64, limit: f64, frequency: f64, damping: f64): void;
  constraintLimits(c: i32, min: f64, max: f64): void;
  /** The angle of a hinge, the position of a slider. */
  constraintValue(c: i32): f64;
  constraintDestroy(c: i32): void;
}
export default requireNative<Spec>('Physics3D');
