// Native side of zinc:physics2d: Box2D v3 behind integer handles (worlds, bodies, joints). Everything a frame needs comes
// back in bulk: step() once, then moved() and events(). plugins/physics2d/index.ts wraps the handles in classes; a program
// does not call this directly. A handle that names nothing is ignored (-1 or false where one is returned, see error()).
// Vectors are x, y; angles are radians, counter-clockwise; units are the program's (docs/plugins/physics2d.md).
import { NativeModule, requireNative } from 'zinc:native';

export interface Spec extends NativeModule {
  /** The version of the library: '3.1.1'. */
  version(): string;
  /** Why the last call returned -1 or false. */
  error(): string;

  // ---- worlds
  /** o: gravity x y, maximum speed, minimum speed for restitution, contact push speed, contact hertz, contact damping ratio,
   *  sleeping (0 or 1), continuous collision against static bodies (0 or 1); a NaN keeps the library's default. */
  worldCreate(o: f64[]): i32;
  worldDestroy(w: i32): void;
  worldGravity(w: i32, x: f64, y: f64): void;
  /** Advances the simulation by dt seconds, each step solved in `subSteps` sub-steps (4 is the library's advice). */
  step(w: i32, dt: f64, subSteps: i32): void;
  /** Steps once and returns [moved-float count, moved records..., event records...] in one bridge call. */
  stepState(w: i32, dt: f64, subSteps: i32): f64[];
  /** The bodies that moved in the last step or fell asleep in it, 7 numbers each: body, x, y, angle, linear velocity x y,
   *  angular velocity. */
  moved(w: i32): f64[];
  /** The contact and sensor events of the last step, 9 numbers each: kind (0 began, 2 ended; +4 for a sensor: a is the
   *  sensor, b the visitor), body a, body b, a contact point, the normal from a to b, the approach speed along it and the
   *  normal impulse the solver applied in the step. An ended contact has only its bodies (-1: destroyed since). Contacts are
   *  reported when one of the two shapes was made with events. */
  events(w: i32): f64[];
  /** Number of awake bodies. */
  awakeCount(w: i32): i32;
  /** The closest hit of the ray from o along d (its length is the reach) among the layers of `mask` (bit n: layer n):
   *  body, fraction of d, point, normal; empty when nothing is hit. */
  rayCast(w: i32, ox: f64, oy: f64, dx: f64, dy: f64, mask: u32): f64[];

  // ---- bodies
  /** o: motion (0 static, 1 kinematic, 2 dynamic), x, y, angle, linear velocity x y, angular velocity, linear damping,
   *  angular damping, gravity scale, flags (1 continuous against moving bodies: a bullet, 4 never sleeps, 8 fixed rotation,
   *  64 starts disabled); a NaN keeps the library's default. */
  bodyCreate(w: i32, o: f64[]): i32;
  /** Attaches a shape. kind 0 circle (radius, centre x y), 1 capsule (x1 y1 x2 y2 radius), 2 box (half width, half height,
   *  centre x y, angle, corner radius), 3 convex polygon (corner radius, then x y of 3 to 8 points), 4 segment (x1 y1 x2 y2),
   *  5 chain of one-sided segments (1 for a loop, then x y of at least 4 points; the solid side is on the right going along).
   *  o: friction, restitution, density, layer (0 to 31), mask (bit n: collides with layer n), flags (2 sensor, 8 contact
   *  events); a NaN keeps the library's default. */
  bodyShape(b: i32, kind: i32, geometry: f64[], o: f64[]): boolean;
  bodyDestroy(b: i32): void;
  /** x, y, angle, linear velocity x y, angular velocity, then 1 when awake. */
  bodyState(b: i32): f64[];
  bodyMass(b: i32): f64;
  bodySetTransform(b: i32, x: f64, y: f64, angle: f64): void;
  bodySetVelocity(b: i32, vx: f64, vy: f64, w: f64): void;
  /** Gives a kinematic body the velocities that bring it to the target in dt seconds. */
  bodyMoveTo(b: i32, x: f64, y: f64, angle: f64, dt: f64): void;
  /** kind 0: an impulse at the centre of mass; 1: an impulse at the world point p; 2: an angular impulse x; 3: a force at
   *  the centre for the next step; 4: a torque x for the next step. */
  bodyPush(b: i32, kind: i32, x: f64, y: f64, px: f64, py: f64): void;
  /** Friction and restitution of every shape of the body. */
  bodySetMaterial(b: i32, friction: f64, restitution: f64): void;
  bodySetMotion(b: i32, motion: i32): void;
  bodySetGravityScale(b: i32, scale: f64): void;
  /** Wakes the body, or puts it to sleep. */
  bodyAwake(b: i32, on: boolean): void;
  /** In the simulation or out of it (kept, with its state: a ball in the trough, a dropped target). */
  bodyEnable(b: i32, on: boolean): void;

  // ---- joints (b = -1: the world)
  /** `a` turns around the world point p relative to b. o: lower and upper limits (radians from the pose at creation; NaN:
   *  free), 1 when the two bodies still collide. */
  revolute(a: i32, b: i32, px: f64, py: f64, o: f64[]): i32;
  /** `a` slides along the axis d through the world point p relative to b, without turning. o: lower and upper limits (from
   *  the pose at creation; NaN: free), 1 when the two bodies still collide. */
  prismatic(a: i32, b: i32, px: f64, py: f64, dx: f64, dy: f64, o: f64[]): i32;
  /** mode 0 off, 1 reach the speed `target` with a torque or force up to `limit` (Box2D has no unbounded motor: one that
   *  overpowers a limit or a contact blows the solve up), 2 a spring towards the angle or position `target` of `frequency`
   *  Hz (0: 2) and damping ratio `damping` (0: 1). */
  jointMotor(j: i32, mode: i32, target: f64, limit: f64, frequency: f64, damping: f64): void;
  jointLimits(j: i32, min: f64, max: f64): void;
  /** The angle of a revolute joint, the position of a prismatic joint. */
  jointValue(j: i32): f64;
  jointDestroy(j: i32): void;
}
export default requireNative<Spec>('Physics2D');
