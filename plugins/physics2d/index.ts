// zinc:physics2d — 2D rigid bodies on Box2D v3 (docs/plugins/physics2d.md). A World is stepped at a fixed rate by the
// program; after each step its bodies hold their new position, angle and velocities as plain fields, and world.contacts
// holds the contacts and sensor overlaps that began or ended. Vectors are x, y (y up when gravity is the default); angles
// are radians, counter-clockwise; lengths are in the program's unit (the library is tuned for moving things between 0.1
// and 10 units: metres for a room, centimetres for a pinball). Native side: native/physics2d.spec.ts.
import P from './native/physics2d.spec';

export class PhysicsError extends Error {
  constructor(message: string) { super(message); this.name = 'PhysicsError'; }
}
function fail(): PhysicsError { return new PhysicsError(P.error()); }

export const enum Motion { Static = 0, Kinematic = 1, Dynamic = 2 }
export const enum ContactKind { Added = 0, Removed = 2 }
export const enum Motor { Off = 0, Velocity = 1, Position = 2 }

/** The version of the library ('3.1.1'). */
export function version(): string { return P.version(); }

export interface WorldOptions {
  /** [0, -9.81] by default. */
  gravity?: number[];
  /** Speed limit of every body (400 units/s): raise it in a world whose unit is small. */
  maxSpeed?: number;
  /** Below this approach speed a contact does not bounce (1). */
  minRestitutionSpeed?: number;
  /** How fast overlapping bodies are pushed apart (3 units/s). */
  pushSpeed?: number;
  /** Stiffness of the contacts: 30 Hz, damping ratio 10. */
  contactHertz?: number;
  contactDamping?: number;
  /** Bodies at rest stop being simulated (true). */
  sleeping?: boolean;
  /** Fast bodies are swept against static ones instead of jumping through them (true). */
  continuous?: boolean;
}

/** The material and the collision filter of a shape. */
export interface ShapeOptions {
  /** 0.6 and 0 by default; of two shapes in contact the friction is the geometric mean, the restitution the larger. */
  friction?: number;
  restitution?: number;
  /** Mass per unit of area (1). */
  density?: number;
  /** 0 to 31; the shape meets the shapes whose layer is in its `mask` and whose mask holds its layer (all at first). */
  layer?: i32;
  mask?: u32;
  /** Reports what overlaps it (contacts with `sensor` true, at the end of the step) and collides with nothing. */
  sensor?: boolean;
  /** Its contacts are reported in world.contacts when they begin and end. */
  events?: boolean;
}

export interface BodyOptions extends ShapeOptions {
  /** Dynamic by default. */
  motion?: Motion;
  position?: number[];
  angle?: number;
  velocity?: number[];
  angularVelocity?: number;
  /** 0 each by default. */
  linearDamping?: number;
  angularDamping?: number;
  gravityScale?: number;
  /** Swept against moving bodies too, not only static ones: a small fast body (a ball, a bullet). */
  continuous?: boolean;
  /** false: the body never falls asleep. */
  sleeping?: boolean;
  fixedRotation?: boolean;
  /** false: created out of the simulation (see Body.setEnabled). */
  enabled?: boolean;
  /** A number for the program's own use. */
  tag?: i32;
}

export interface JointOptions {
  /** Limits from the pose at creation: radians for a revolute joint, lengths for a prismatic one. Both, or free. */
  min?: number;
  max?: number;
  /** The two bodies still collide with each other (false). */
  collide?: boolean;
}

/** The geometry of a shape; World.body and Body.addShape attach it to a body with its material. */
export class Shape {
  readonly kind: i32;
  readonly data: number[];
  constructor(kind: i32, data: number[]) { this.kind = kind; this.data = data; }
  static circle(radius: number, x: number = 0, y: number = 0): Shape { return new Shape(0, [radius, x, y]); }
  /** Two half circles of `radius` joined: around the segment from (x1, y1) to (x2, y2). */
  static capsule(x1: number, y1: number, x2: number, y2: number, radius: number): Shape { return new Shape(1, [x1, y1, x2, y2, radius]); }
  /** Half extents, centred at (x, y) and turned by `angle`; `radius` rounds the corners. */
  static box(hx: number, hy: number, x: number = 0, y: number = 0, angle: number = 0, radius: number = 0): Shape { return new Shape(2, [hx, hy, x, y, angle, radius]); }
  /** The convex hull of 3 to 8 points (x, y each); `radius` rounds the corners. */
  static polygon(points: number[], radius: number = 0): Shape { const d: number[] = [radius]; for (const p of points) d.push(p); return new Shape(3, d); }
  /** A two-sided line from (x1, y1) to (x2, y2). */
  static segment(x1: number, y1: number, x2: number, y2: number): Shape { return new Shape(4, [x1, y1, x2, y2]); }
  /** Connected one-sided segments through at least 4 points (x, y each), solid on the right going along: walls that
   *  nothing catches on. `loop` joins the last point to the first. For static bodies. */
  static chain(points: number[], loop: boolean = false): Shape { const d: number[] = [loop ? 1 : 0]; for (const p of points) d.push(p); return new Shape(5, d); }
}

function shapeOptions(o: ShapeOptions): number[] {
  const flags: i32 = ((o.sensor ?? false) ? 2 : 0) | ((o.events ?? false) ? 8 : 0);
  return [o.friction ?? NaN, o.restitution ?? NaN, o.density ?? NaN, o.layer ?? 0, o.mask ?? 0xffffffff, flags];
}

/** A rigid body. The fields are its state after the last step (or the last set). */
export class Body {
  handle: i32;
  readonly world: World;
  tag: i32 = 0;
  x: number = 0; y: number = 0;
  /** Radians, counter-clockwise. */
  angle: number = 0;
  vx: number = 0; vy: number = 0;
  /** Angular velocity, radians per second. */
  w: number = 0;

  constructor(world: World, handle: i32) { this.world = world; this.handle = handle; }

  /** Copies 6 numbers (position, angle, velocities) from `s` at `at`. */
  read(s: number[], at: i32): void {
    this.x = s[at]; this.y = s[at + 1]; this.angle = s[at + 2];
    this.vx = s[at + 3]; this.vy = s[at + 4]; this.w = s[at + 5];
  }
  /** Reads the state again (after an impulse, which changes the velocities at once). */
  refresh(): void { const s = P.bodyState(this.handle); if (s.length >= 6) this.read(s, 0); }

  /** Attaches another shape, with its own material. */
  addShape(shape: Shape, o: ShapeOptions = {}): void { if (!P.bodyShape(this.handle, shape.kind, shape.data, shapeOptions(o))) throw fail(); }
  setPosition(x: number, y: number): void { this.setTransform(x, y, this.angle); }
  setAngle(angle: number): void { this.setTransform(this.x, this.y, angle); }
  setTransform(x: number, y: number, angle: number): void {
    P.bodySetTransform(this.handle, x, y, angle);
    this.x = x; this.y = y; this.angle = angle;
  }
  setVelocity(vx: number, vy: number): void { P.bodySetVelocity(this.handle, vx, vy, this.w); this.vx = vx; this.vy = vy; }
  setAngularVelocity(w: number): void { P.bodySetVelocity(this.handle, this.vx, this.vy, w); this.w = w; }
  /** A kinematic body: the velocities that bring it to this pose in `dt` seconds (call before each step). */
  moveTo(x: number, y: number, angle: number, dt: number): void { P.bodyMoveTo(this.handle, x, y, angle, dt); }
  /** An impulse at the centre of mass (mass x change of velocity). */
  applyImpulse(x: number, y: number): void { P.bodyPush(this.handle, 0, x, y, 0, 0); this.refresh(); }
  /** An impulse at a point of the world. */
  applyImpulseAt(x: number, y: number, px: number, py: number): void { P.bodyPush(this.handle, 1, x, y, px, py); this.refresh(); }
  applyAngularImpulse(i: number): void { P.bodyPush(this.handle, 2, i, 0, 0, 0); this.refresh(); }
  /** A force, a torque: applied during the next step only. */
  applyForce(x: number, y: number): void { P.bodyPush(this.handle, 3, x, y, 0, 0); }
  applyTorque(t: number): void { P.bodyPush(this.handle, 4, t, 0, 0, 0); }
  /** Friction and restitution of all its shapes. */
  setMaterial(friction: number, restitution: number): void { P.bodySetMaterial(this.handle, friction, restitution); }
  setMotion(motion: Motion): void { P.bodySetMotion(this.handle, motion); }
  setGravityScale(scale: number): void { P.bodySetGravityScale(this.handle, scale); }
  wake(): void { P.bodyAwake(this.handle, true); }
  sleep(): void { P.bodyAwake(this.handle, false); }
  /** Takes the body out of the simulation, or puts it back, with its state: cheap, for things that come and go. */
  setEnabled(on: boolean): void { P.bodyEnable(this.handle, on); }
  /** 0 for a static body. */
  mass(): number { return P.bodyMass(this.handle); }
  /** Removes the body and the joints attached to it. */
  destroy(): void {
    if (this.handle < 0) return;
    for (const j of this.world.joints) if (j.a === this || j.b === this) j.handle = -1;   // the native side drops them with the body
    this.world.forget(this);
    P.bodyDestroy(this.handle);
    this.handle = -1;
  }
}

/** A contact or a sensor overlap of the last step. For a removed contact and a sensor only the bodies are known. */
export class Contact {
  kind: ContactKind;
  /** a is a sensor and b what entered or left it. */
  sensor: boolean;
  a: Body | null;
  b: Body | null;
  /** A contact point, and the normal from a to b. */
  x: number; y: number;
  nx: number; ny: number;
  /** How fast the bodies approached along the normal, and the impulse the solver applied to push them apart. */
  speed: number;
  impulse: number;
  constructor(kind: ContactKind, sensor: boolean, a: Body | null, b: Body | null, e: number[], at: i32) {
    this.kind = kind; this.sensor = sensor; this.a = a; this.b = b;
    this.x = e[at]; this.y = e[at + 1];
    this.nx = e[at + 2]; this.ny = e[at + 3];
    this.speed = e[at + 4]; this.impulse = e[at + 5];
  }
  /** The other body of the contact. */
  other(body: Body): Body | null { return this.a === body ? this.b : this.a; }
}

/** What a ray met first. */
export class Hit {
  body: Body | null;
  /** 0 at the start of the ray, 1 at its end. */
  fraction: number;
  x: number; y: number;
  nx: number; ny: number;
  constructor(body: Body | null, r: number[]) {
    this.body = body; this.fraction = r[1];
    this.x = r[2]; this.y = r[3];
    this.nx = r[4]; this.ny = r[5];
  }
}

/** A revolute or a prismatic joint between two bodies, or a body and the world. */
export class Joint {
  handle: i32;
  readonly a: Body;
  readonly b: Body | null;
  constructor(handle: i32, a: Body, b: Body | null) {
    if (handle < 0) throw fail();
    this.handle = handle; this.a = a; this.b = b;
  }
  /** The angle of a revolute joint (radians), the position of a prismatic one, from the pose at creation. */
  value(): number { return P.jointValue(this.handle); }
  /** Drives the joint to a speed with a torque (revolute) or force (prismatic) up to `limit`, or springs it to an angle /
   *  position (`frequency` in Hz and `damping` ratio, 2 and 1 when 0; `limit` unused). A Velocity motor needs a limit: too
   *  weak it stalls, far too strong (beyond what the bodies can take) it overpowers the limits and the contacts. */
  motor(mode: Motor, target: number, limit: number, frequency: number = 0, damping: number = 0): void {
    P.jointMotor(this.handle, mode, target, limit, frequency, damping);
  }
  setLimits(min: number, max: number): void { P.jointLimits(this.handle, min, max); }
  destroy(): void { P.jointDestroy(this.handle); this.handle = -1; }
}

export class World {
  readonly handle: i32;
  /** The contacts of the last step (for shapes made with `events`) and the sensor overlaps that began or ended. */
  contacts: Contact[] = [];
  joints: Joint[] = [];
  /** Bodies by native handle. */
  private byHandle: (Body | null)[] = [];

  constructor(o: WorldOptions = {}) {
    const g = o.gravity ?? [0, -9.81];
    const h = P.worldCreate([g[0], g[1], o.maxSpeed ?? NaN, o.minRestitutionSpeed ?? NaN, o.pushSpeed ?? NaN, o.contactHertz ?? NaN,
      o.contactDamping ?? NaN, (o.sleeping ?? true) ? 1 : 0, (o.continuous ?? true) ? 1 : 0]);
    if (h < 0) throw fail();
    this.handle = h;
  }

  /** Advances the simulation by `dt` seconds (a fixed value: 1/60, 1/240...), solved in `subSteps` sub-steps. */
  step(dt: number, subSteps: i32 = 4): void {
    P.step(this.handle, dt, subSteps);
    const m = P.moved(this.handle);
    for (let i = 0; i + 6 < m.length; i += 7) {
      const b = this.at(m[i]);
      if (b !== null) b.read(m, i + 1);
    }
    const e = P.events(this.handle);
    const out: Contact[] = [];
    for (let i = 0; i + 8 < e.length; i += 9) {
      const k: i32 = e[i];
      out.push(new Contact((k & 3) as ContactKind, (k & 4) !== 0, this.at(e[i + 1]), this.at(e[i + 2]), e, i + 3));
    }
    this.contacts = out;
  }

  /** A body with this shape (more with Body.addShape), in the simulation unless `enabled` is false. */
  body(shape: Shape, o: BodyOptions = {}): Body {
    const p = o.position ?? [0, 0], v = o.velocity ?? [0, 0];
    const flags: i32 = ((o.continuous ?? false) ? 1 : 0) | ((o.sleeping ?? true) ? 0 : 4) | ((o.fixedRotation ?? false) ? 8 : 0) | ((o.enabled ?? true) ? 0 : 64);
    const h = P.bodyCreate(this.handle, [o.motion ?? Motion.Dynamic, p[0], p[1], o.angle ?? 0, v[0], v[1], o.angularVelocity ?? 0,
      o.linearDamping ?? NaN, o.angularDamping ?? NaN, o.gravityScale ?? NaN, flags]);
    if (h < 0) throw fail();
    if (!P.bodyShape(h, shape.kind, shape.data, shapeOptions(o))) {
      const e = fail();
      P.bodyDestroy(h);
      throw e;
    }
    const b = new Body(this, h);
    b.tag = o.tag ?? 0;
    b.x = p[0]; b.y = p[1]; b.angle = o.angle ?? 0;
    b.vx = v[0]; b.vy = v[1]; b.w = o.angularVelocity ?? 0;
    while (this.byHandle.length <= h) this.byHandle.push(null);
    this.byHandle[h] = b;
    return b;
  }

  /** `a` turns around `point` (world coordinates), relative to `b` or to the world (null). */
  revolute(a: Body, b: Body | null, point: number[], o: JointOptions = {}): Joint {
    return this.keep(new Joint(P.revolute(a.handle, b === null ? -1 : b.handle, point[0], point[1],
      [o.min ?? NaN, o.max ?? NaN, (o.collide ?? false) ? 1 : 0]), a, b));
  }
  /** `a` slides along `axis` through `point`, relative to `b` or to the world (null), without turning. */
  prismatic(a: Body, b: Body | null, point: number[], axis: number[], o: JointOptions = {}): Joint {
    return this.keep(new Joint(P.prismatic(a.handle, b === null ? -1 : b.handle, point[0], point[1], axis[0], axis[1],
      [o.min ?? NaN, o.max ?? NaN, (o.collide ?? false) ? 1 : 0]), a, b));
  }

  setGravity(x: number, y: number): void { P.worldGravity(this.handle, x, y); }
  /** Bodies that are awake. */
  awakeCount(): i32 { return P.awakeCount(this.handle); }

  /** The first thing a ray from (ox, oy) meets along (dx, dy), whose length is the reach; `mask` has a bit per layer. */
  rayCast(ox: number, oy: number, dx: number, dy: number, mask: u32 = 0xffffffff): Hit | null {
    const r = P.rayCast(this.handle, ox, oy, dx, dy, mask);
    return r.length < 6 ? null : new Hit(this.at(r[0]), r);
  }

  /** Frees the world, its bodies and its joints. */
  destroy(): void {
    for (const b of this.byHandle) if (b !== null) b.handle = -1;
    for (const j of this.joints) j.handle = -1;
    this.byHandle = [];
    this.joints = [];
    P.worldDestroy(this.handle);
  }

  /** The body of a native handle (as events and casts name them), null when it is gone. */
  private at(handle: number): Body | null {
    const h: i32 = handle;
    return h >= 0 && h < this.byHandle.length ? this.byHandle[h] : null;
  }
  private keep(j: Joint): Joint { this.joints.push(j); return j; }
  /** Used by Body.destroy(). */
  forget(b: Body): void { if (b.handle >= 0 && b.handle < this.byHandle.length) this.byHandle[b.handle] = null; }
}
