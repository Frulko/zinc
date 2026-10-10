// zinc:physics3d — 3D rigid bodies on Jolt Physics (docs/plugins/physics3d.md). A World is stepped at a fixed rate by
// the program; after each step its bodies hold their new position, rotation and velocities as plain fields, and
// world.contacts holds the contacts that began, went on or ended. Vectors are x, y, z (y up when gravity is the default);
// rotations are quaternions x, y, z, w; lengths are in the program's unit (the library is tuned for moving things
// between 0.1 and 10 units: metres for a room, centimetres for a pinball). Native side: native/physics3d.spec.ts.
import P from './native/physics3d.spec';

export class PhysicsError extends Error {
  constructor(message: string) { super(message); this.name = 'PhysicsError'; }
}
function fail(): PhysicsError { return new PhysicsError(P.error()); }

export const enum Motion { Static = 0, Kinematic = 1, Dynamic = 2 }
export const enum ContactKind { Added = 0, Persisted = 1, Removed = 2 }
export const enum Motor { Off = 0, Velocity = 1, Position = 2 }

/** The version of the library ('5.6.0'). */
export function version(): string { return P.version(); }

export interface WorldOptions {
  /** [0, -9.81, 0] by default. */
  gravity?: number[];
  /** Bodies the world can hold (4096); body pairs and contact constraints of one step (16384, 8192). */
  maxBodies?: i32;
  maxBodyPairs?: i32;
  maxContacts?: i32;
  /** How far bodies may sink into each other (0.02) and from how far a contact is prepared (0.02). */
  penetrationSlop?: number;
  speculativeDistance?: number;
  /** Below this approach speed a contact does not bounce (1). */
  minRestitutionSpeed?: number;
  /** Solver iterations (10 and 2). */
  velocitySteps?: i32;
  positionSteps?: i32;
  /** Bodies at rest stop being simulated (true): below `sleepSpeed` (0.03) for `sleepTime` seconds (0.5). */
  sleeping?: boolean;
  sleepSpeed?: number;
  sleepTime?: number;
}

export interface BodyOptions {
  /** Dynamic by default. */
  motion?: Motion;
  position?: number[];
  rotation?: number[];
  /** 0 to 31; world.setLayersCollide says which pairs of layers collide (all at first). */
  layer?: i32;
  /** 0.2 and 0 by default; of two bodies in contact the friction is the geometric mean, the restitution the larger. */
  friction?: number;
  restitution?: number;
  /** 0.05 each by default. */
  linearDamping?: number;
  angularDamping?: number;
  gravityFactor?: number;
  /** The mass; by default the shape's volume at density 1000. */
  mass?: number;
  /** Continuous collision: a small fast body is swept through its step instead of jumping (a ball, a bullet). */
  continuous?: boolean;
  /** Reports what touches it (contacts with `sensor` true) and collides with nothing. */
  sensor?: boolean;
  /** false: the body never falls asleep. */
  sleeping?: boolean;
  /** Its contacts are reported in world.contacts when they begin and end; `persistedEvents` also while they last. */
  events?: boolean;
  persistedEvents?: boolean;
  /** Rolls over the inner edges of a mesh without catching on them (a ball on a playfield). */
  smoothEdges?: boolean;
  /** false: created outside the world (see Body.setEnabled). */
  enabled?: boolean;
  /** Speed limits (500 and 47 rad/s by default: raise them in a world whose unit is small). */
  maxSpeed?: number;
  maxAngularSpeed?: number;
  /** A number for the program's own use. */
  tag?: i32;
}

export interface ConstraintOptions {
  /** Limits from the pose at creation: radians for a hinge (min in -pi..0, max in 0..pi), lengths for a slider. Both, or free. */
  min?: number;
  max?: number;
  /** A torque (hinge) or force (slider) that resists motion. */
  friction?: number;
}

/** A collision shape: made once, used by any number of bodies. */
export class Shape {
  readonly handle: i32;
  constructor(handle: i32) {
    if (handle < 0) throw fail();
    this.handle = handle;
  }
  static sphere(radius: number): Shape { return new Shape(P.shapeSphere(radius)); }
  /** Half extents; `round` rounds the edges (by default a little, as the library advises). */
  static box(hx: number, hy: number, hz: number, round: number = -1): Shape { return new Shape(P.shapeBox(hx, hy, hz, round)); }
  /** Along y: a cylinder of half height `half` capped by half spheres. */
  static capsule(half: number, radius: number): Shape { return new Shape(P.shapeCapsule(half, radius)); }
  /** Along y. */
  static cylinder(half: number, radius: number, round: number = -1): Shape { return new Shape(P.shapeCylinder(half, radius, round)); }
  /** The convex hull of points (x, y, z each, at least 4 not in one plane). */
  static convexHull(points: number[], round: number = -1): Shape { return new Shape(P.shapeHull(points, round)); }
  /** Triangles (three indices each, counter-clockwise seen from the front) over vertices (x, y, z each). For static and kinematic bodies. */
  static mesh(vertices: number[], indices: i32[]): Shape { return new Shape(P.shapeMesh(vertices, indices)); }
  /** n x n heights, row by row along z; sample (i, j) is at offset + scale * (i, height, j). For static bodies. */
  static heightField(heights: number[], n: i32, offset: number[], scale: number[]): Shape {
    return new Shape(P.shapeHeightField(heights, n, offset[0], offset[1], offset[2], scale[0], scale[1], scale[2]));
  }
  /** The program is done with it; bodies that use it keep it. */
  release(): void { P.shapeRelease(this.handle); }
}

/** A rigid body. The fields are its state after the last step (or the last set). */
export class Body {
  handle: i32;
  readonly world: World;
  tag: i32 = 0;
  x: number = 0; y: number = 0; z: number = 0;
  qx: number = 0; qy: number = 0; qz: number = 0; qw: number = 1;
  vx: number = 0; vy: number = 0; vz: number = 0;
  /** Angular velocity, radians per second around each axis. */
  wx: number = 0; wy: number = 0; wz: number = 0;

  constructor(world: World, handle: i32) { this.world = world; this.handle = handle; }

  /** Copies 13 numbers (position, rotation, velocities) from `s` at `at`. */
  read(s: number[], at: i32): void {
    this.x = s[at]; this.y = s[at + 1]; this.z = s[at + 2];
    this.qx = s[at + 3]; this.qy = s[at + 4]; this.qz = s[at + 5]; this.qw = s[at + 6];
    this.vx = s[at + 7]; this.vy = s[at + 8]; this.vz = s[at + 9];
    this.wx = s[at + 10]; this.wy = s[at + 11]; this.wz = s[at + 12];
  }
  /** Reads the state again (after an impulse, which changes the velocities at once). */
  refresh(): void { const s = P.bodyState(this.handle); if (s.length >= 13) this.read(s, 0); }

  setPosition(x: number, y: number, z: number): void { this.setTransform(x, y, z, this.qx, this.qy, this.qz, this.qw); }
  setRotation(qx: number, qy: number, qz: number, qw: number): void { this.setTransform(this.x, this.y, this.z, qx, qy, qz, qw); }
  setTransform(x: number, y: number, z: number, qx: number, qy: number, qz: number, qw: number): void {
    P.bodySetTransform(this.handle, x, y, z, qx, qy, qz, qw);
    this.x = x; this.y = y; this.z = z; this.qx = qx; this.qy = qy; this.qz = qz; this.qw = qw;
  }
  setVelocity(vx: number, vy: number, vz: number): void {
    P.bodySetVelocity(this.handle, vx, vy, vz, this.wx, this.wy, this.wz);
    this.vx = vx; this.vy = vy; this.vz = vz;
  }
  setAngularVelocity(wx: number, wy: number, wz: number): void {
    P.bodySetVelocity(this.handle, this.vx, this.vy, this.vz, wx, wy, wz);
    this.wx = wx; this.wy = wy; this.wz = wz;
  }
  /** A kinematic body: the velocities that bring it to this pose in `dt` seconds (call before each step). */
  moveTo(x: number, y: number, z: number, qx: number, qy: number, qz: number, qw: number, dt: number): void {
    P.bodyMoveTo(this.handle, x, y, z, qx, qy, qz, qw, dt);
  }
  /** An impulse at the centre of mass (mass x change of velocity). */
  applyImpulse(x: number, y: number, z: number): void { P.bodyPush(this.handle, 0, x, y, z, 0, 0, 0); this.refresh(); }
  /** An impulse at a point of the world. */
  applyImpulseAt(x: number, y: number, z: number, px: number, py: number, pz: number): void { P.bodyPush(this.handle, 1, x, y, z, px, py, pz); this.refresh(); }
  applyAngularImpulse(x: number, y: number, z: number): void { P.bodyPush(this.handle, 2, x, y, z, 0, 0, 0); this.refresh(); }
  /** A force, a torque: applied during the next step only. */
  applyForce(x: number, y: number, z: number): void { P.bodyPush(this.handle, 3, x, y, z, 0, 0, 0); }
  applyTorque(x: number, y: number, z: number): void { P.bodyPush(this.handle, 4, x, y, z, 0, 0, 0); }
  setMaterial(friction: number, restitution: number): void { P.bodySetMaterial(this.handle, friction, restitution); }
  setLayer(layer: i32): void { P.bodySetLayer(this.handle, layer); }
  setMotion(motion: Motion): void { P.bodySetMotion(this.handle, motion); }
  setGravityFactor(factor: number): void { P.bodySetGravityFactor(this.handle, factor); }
  wake(): void { P.bodyAwake(this.handle, true); }
  sleep(): void { P.bodyAwake(this.handle, false); }
  /** Takes the body out of the world, or puts it back, with its state: cheap, for things that come and go. */
  setEnabled(on: boolean): void { P.bodyEnable(this.handle, on); }
  /** 0 for a static body. */
  mass(): number { return P.bodyMass(this.handle); }
  /** Removes the body and the constraints attached to it. */
  destroy(): void {
    if (this.handle < 0) return;
    for (const c of this.world.constraints) if (c.a === this || c.b === this) c.handle = -1;   // the native side drops them with the body
    this.world.forget(this);
    P.bodyDestroy(this.handle);
    this.handle = -1;
  }
}

/** A contact of the last step. For a removed contact only the bodies are known. */
export class Contact {
  kind: ContactKind;
  /** One of the two bodies is a sensor: nothing was pushed. */
  sensor: boolean;
  a: Body | null;
  b: Body | null;
  /** The contact point on a, and the normal from a to b. */
  x: number; y: number; z: number;
  nx: number; ny: number; nz: number;
  /** How fast the bodies approached along the normal, and the impulse the solver is expected to apply. */
  speed: number;
  impulse: number;
  constructor(kind: ContactKind, sensor: boolean, a: Body | null, b: Body | null, e: number[], at: i32) {
    this.kind = kind; this.sensor = sensor; this.a = a; this.b = b;
    this.x = e[at]; this.y = e[at + 1]; this.z = e[at + 2];
    this.nx = e[at + 3]; this.ny = e[at + 4]; this.nz = e[at + 5];
    this.speed = e[at + 6]; this.impulse = e[at + 7];
  }
  /** The other body of the contact. */
  other(body: Body): Body | null { return this.a === body ? this.b : this.a; }
}

/** What a ray or a swept shape met first. */
export class Hit {
  body: Body | null;
  /** 0 at the start of the cast, 1 at its end. */
  fraction: number;
  x: number; y: number; z: number;
  nx: number; ny: number; nz: number;
  constructor(body: Body | null, r: number[]) {
    this.body = body; this.fraction = r[1];
    this.x = r[2]; this.y = r[3]; this.z = r[4];
    this.nx = r[5]; this.ny = r[6]; this.nz = r[7];
  }
}

/** A hinge or a slider between two bodies, or a body and the world. */
export class Constraint {
  handle: i32;
  readonly a: Body;
  readonly b: Body | null;
  constructor(handle: i32, a: Body, b: Body | null) {
    if (handle < 0) throw fail();
    this.handle = handle; this.a = a; this.b = b;
  }
  /** The angle of a hinge (radians), the position of a slider, from the pose at creation. */
  value(): number { return P.constraintValue(this.handle); }
  /** Drives the constraint to a velocity or to an angle / position; `limit` is the largest torque or force (0: any),
   *  `frequency` (Hz) and `damping` shape the spring that reaches a position (2 and 1 by default). */
  motor(mode: Motor, target: number, limit: number = 0, frequency: number = 0, damping: number = 0): void {
    P.constraintMotor(this.handle, mode, target, limit, frequency, damping);
  }
  setLimits(min: number, max: number): void { P.constraintLimits(this.handle, min, max); }
  destroy(): void { P.constraintDestroy(this.handle); this.handle = -1; }
}

export class World {
  readonly handle: i32;
  /** The contacts of the last step, for bodies created with `events`. */
  contacts: Contact[] = [];
  constraints: Constraint[] = [];
  /** Bodies by native handle. */
  private byHandle: (Body | null)[] = [];

  constructor(o: WorldOptions = {}) {
    const g = o.gravity ?? [0, -9.81, 0];
    const h = P.worldCreate([g[0], g[1], g[2], o.maxBodies ?? 4096, o.maxBodyPairs ?? 16384, o.maxContacts ?? 8192,
      o.penetrationSlop ?? NaN, o.speculativeDistance ?? NaN, o.minRestitutionSpeed ?? NaN, o.velocitySteps ?? 10, o.positionSteps ?? 2,
      (o.sleeping ?? true) ? 1 : 0, NaN, o.sleepSpeed ?? NaN, o.sleepTime ?? NaN]);
    if (h < 0) throw fail();
    this.handle = h;
  }

  /** Advances the simulation by `dt` seconds (a fixed value: 1/60, 1/240...), in `collisionSteps` equal steps. */
  step(dt: number, collisionSteps: i32 = 1): void {
    const err = P.step(this.handle, dt, collisionSteps);
    if (err !== 0) throw new PhysicsError(`a step ran out of room (error bits ${err}): raise maxBodyPairs or maxContacts`);
    const m = P.moved(this.handle);
    for (let i = 0; i + 13 < m.length; i += 14) {
      const b = this.at(m[i]);
      if (b !== null) b.read(m, i + 1);
    }
    const e = P.events(this.handle);
    const out: Contact[] = [];
    for (let i = 0; i + 10 < e.length; i += 11) {
      const k: i32 = e[i];
      out.push(new Contact((k & 3) as ContactKind, (k & 4) !== 0, this.at(e[i + 1]), this.at(e[i + 2]), e, i + 3));
    }
    this.contacts = out;
  }

  /** A body with this shape, in the world unless `enabled` is false. */
  body(shape: Shape, o: BodyOptions = {}): Body {
    const p = o.position ?? [0, 0, 0], q = o.rotation ?? [0, 0, 0, 1];
    const flags: i32 = ((o.continuous ?? false) ? 1 : 0) | ((o.sensor ?? false) ? 2 : 0) | ((o.sleeping ?? true) ? 0 : 4) | ((o.events ?? false) ? 8 : 0)
      | ((o.persistedEvents ?? false) ? 24 : 0) | ((o.smoothEdges ?? false) ? 32 : 0) | ((o.enabled ?? true) ? 0 : 64);
    const h = P.bodyCreate(this.handle, shape.handle, [o.motion ?? Motion.Dynamic, p[0], p[1], p[2], q[0], q[1], q[2], q[3], o.layer ?? 0,
      o.friction ?? NaN, o.restitution ?? NaN, o.linearDamping ?? NaN, o.angularDamping ?? NaN, o.gravityFactor ?? NaN, o.mass ?? 0, flags,
      o.maxSpeed ?? NaN, o.maxAngularSpeed ?? NaN]);
    if (h < 0) throw fail();
    const b = new Body(this, h);
    b.tag = o.tag ?? 0;
    b.x = p[0]; b.y = p[1]; b.z = p[2];
    b.qx = q[0]; b.qy = q[1]; b.qz = q[2]; b.qw = q[3];
    while (this.byHandle.length <= h) this.byHandle.push(null);
    this.byHandle[h] = b;
    return b;
  }

  /** A hinge: `a` turns around the axis through `point` (world coordinates), relative to `b` or to the world (null). */
  hinge(a: Body, b: Body | null, point: number[], axis: number[], o: ConstraintOptions = {}): Constraint {
    return this.keep(new Constraint(P.hinge(a.handle, b === null ? -1 : b.handle, point[0], point[1], point[2], axis[0], axis[1], axis[2],
      [o.min ?? NaN, o.max ?? NaN, o.friction ?? 0]), a, b));
  }
  /** A slider: `a` moves along the axis through `point`, relative to `b` or to the world (null), without turning. */
  slider(a: Body, b: Body | null, point: number[], axis: number[], o: ConstraintOptions = {}): Constraint {
    return this.keep(new Constraint(P.slider(a.handle, b === null ? -1 : b.handle, point[0], point[1], point[2], axis[0], axis[1], axis[2],
      [o.min ?? NaN, o.max ?? NaN, o.friction ?? 0]), a, b));
  }

  /** Whether bodies of layers a and b collide. */
  setLayersCollide(a: i32, b: i32, collide: boolean): void { P.worldLayers(this.handle, a, b, collide); }
  setGravity(x: number, y: number, z: number): void { P.worldGravity(this.handle, x, y, z); }
  /** Rebuilds the broad phase after many bodies were added at once (a level): not every frame. */
  optimize(): void { P.worldOptimize(this.handle); }
  /** Bodies that are awake. */
  activeCount(): i32 { return P.activeCount(this.handle); }

  /** The first thing a ray from (ox, oy, oz) meets along (dx, dy, dz), whose length is the reach; `mask` has a bit per layer. */
  rayCast(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, mask: u32 = 0xffffffff): Hit | null {
    const r = P.rayCast(this.handle, ox, oy, oz, dx, dy, dz, mask);
    return r.length < 8 ? null : new Hit(this.at(r[0]), r);
  }
  /** The first thing a shape at `position` with `rotation` meets when swept along (dx, dy, dz). */
  shapeCast(shape: Shape, position: number[], rotation: number[], dx: number, dy: number, dz: number, mask: u32 = 0xffffffff): Hit | null {
    const r = P.shapeCast(this.handle, shape.handle, [position[0], position[1], position[2], rotation[0], rotation[1], rotation[2], rotation[3]], dx, dy, dz, mask);
    return r.length < 8 ? null : new Hit(this.at(r[0]), r);
  }

  /** The whole state of the simulation; restoreState() on this world brings it back, and the same steps then give the same result. */
  saveState(): u8[] { return P.saveState(this.handle); }
  restoreState(state: u8[]): void {
    if (!P.restoreState(this.handle, state)) throw fail();
    for (const b of this.byHandle) if (b !== null) b.refresh();
    this.contacts = [];
  }

  /** Frees the world, its bodies and its constraints. */
  destroy(): void {
    for (const b of this.byHandle) if (b !== null) b.handle = -1;
    for (const c of this.constraints) c.handle = -1;
    this.byHandle = [];
    this.constraints = [];
    P.worldDestroy(this.handle);
  }

  /** The body of a native handle (as events and casts name them), null when it is gone. */
  private at(handle: number): Body | null {
    const h: i32 = handle;
    return h >= 0 && h < this.byHandle.length ? this.byHandle[h] : null;
  }
  private keep(c: Constraint): Constraint { this.constraints.push(c); return c; }
  /** Used by Body.destroy(). */
  forget(b: Body): void { if (b.handle >= 0 && b.handle < this.byHandle.length) this.byHandle[b.handle] = null; }
}
