// Pinball adapter over Box2D 3.1.1. Box2D owns collision detection, contact solving, spin and multiball.
// The adapter owns pinball mechanisms, collision layers, ramp height and gameplay events. Units: table inches.
import { World as BoxWorld, Shape, Body, Motion, ContactKind } from 'zinc:physics2d';
import { cross, crosses } from './geom';
import { Ball, BALL_R, Circle, Hole, Material, Ramp, Segment, Sensor, PLUNGER_TIP, K_PLUNGER, K_FLIPPER } from './bodies';
import { FLIP_MAX_W, Flipper } from './flipper';
import { GRAVITY_CM, INCH_CM, MAX_SPEED_CM, PLUNGER_SPEED_CM, SLOPE_DEGREES, rollingGravity, travelSteps, speedScale } from '../tuning';

export const GRAVITY: number = rollingGravity(GRAVITY_CM / INCH_CM, SLOPE_DEGREES); // solid sphere rolling down a 6.5° board
export const RAMP_GRAVITY: number = GRAVITY_CM / INCH_CM;    // in/s²: the full vertical g acts along a ramp's own incline
export const MAX_SPEED: number = MAX_SPEED_CM / INCH_CM;
export const REST_SPEED: number = 3;        // below this normal speed a contact does not bounce (resting contact)
const ROLLING_DRAG: number = 0.12;          // 1/s
const SPIN_DRAG: number = 1.5;              // 1/s
const EVENT_SPEED: number = 1.5;            // hits slower than this are not reported

export const PLUNGER_TRAVEL: number = 1.5;  // in
export const PULL_SPEED: number = 1.4;      // in/s: a full pull takes about a second
export const PLUNGER_SPEED: number = PLUNGER_SPEED_CM / INCH_CM;   // in/s at full pull
const PLUNGER_K: number = PLUNGER_SPEED * PLUNGER_SPEED / (PLUNGER_TRAVEL * PLUNGER_TRAVEL);

export const DRAIN_Y: number = 41.6;

/** Event kinds: collider kinds (bodies.ts K_*) for hits, then these. */
export const E_SENSOR: i32 = 10, E_PORTAL: i32 = 11, E_CAPTURE: i32 = 12, E_DRAIN: i32 = 13, E_BALL_HIT: i32 = 14;

export class PhysEvent {
  kind: i32 = 0;
  tag: i32 = 0;
  ball: i32 = 0;
  speed: number = 0;
  dir: i32 = 0;
}

class Layer {
  world: BoxWorld;
  balls: Body[] = [];
  enabled: boolean[] = [];
  constructor(count: i32) {
    this.world = new BoxWorld({ gravity: [0, GRAVITY], maxSpeed: MAX_SPEED, minRestitutionSpeed: REST_SPEED, sleeping: false });
    for (let i: i32 = 0; i < count; i++) {
      this.balls.push(this.world.body(Shape.circle(BALL_R), { enabled: false, continuous: true, sleeping: false, events: true,
        friction: 0.3, restitution: 0, linearDamping: ROLLING_DRAG, angularDamping: SPIN_DRAG, tag: -1 - i }));
      this.enabled.push(false);
    }
  }
}

class Collider {
  body: Body;
  segment: Segment | null;
  circle: Circle | null;
  mat: Material;
  kind: i32;
  tag: i32;
  enabled: boolean = true;
  constructor(body: Body, segment: Segment | null, circle: Circle | null, mat: Material, kind: i32, tag: i32) {
    this.body = body; this.segment = segment; this.circle = circle; this.mat = mat; this.kind = kind; this.tag = tag;
  }
}

export class World {
  segs: Segment[] = [];
  circles: Circle[] = [];
  sensors: Sensor[] = [];
  holes: Hole[] = [];
  ramps: Ramp[] = [];
  flippers: Flipper[] = [];
  balls: Ball[] = [];
  events: PhysEvent[] = [];
  nevents: i32 = 0;
  kicks: boolean = true;
  plunger: Segment | null = null;
  plungerRestY: number = 0;
  plungerPull: number = 0;
  plungerVel: number = 0;
  pulling: boolean = false;
  private layers: Layer[] = [];
  private colliders: Collider[] = [];
  private flipperBodies: Body[] = [];
  private flipperMoving: boolean[] = [];
  private plungerBody: Body | null = null;
  private plungerMoving: boolean = false;
  private fromX: number[] = [];
  private fromY: number[] = [];

  constructor(maxBalls: i32) {
    for (let i: i32 = 0; i < maxBalls; i++) { this.balls.push(new Ball(i)); this.fromX.push(0); this.fromY.push(0); }
    for (let i: i32 = 0; i < 64; i++) this.events.push(new PhysEvent());
    this.layers.push(new Layer(maxBalls));
  }

  private layer(index: i32): Layer {
    while (this.layers.length <= index) this.layers.push(new Layer(this.balls.length));
    return this.layers[index];
  }

  addSegment(s: Segment, layer: i32): Segment {
    this.segs.push(s);
    let shape = s.r > 0 ? Shape.capsule(s.ax, s.ay, s.bx, s.by, s.r) : Shape.segment(s.ax, s.ay, s.bx, s.by);
    if (s.oneSided) {
      // Box2D's open chain uses the outer points as ghosts: only a -> b collides, on its right side.
      shape = Shape.chain([s.ax - s.tx, s.ay - s.ty, s.ax, s.ay, s.bx, s.by, s.bx + s.tx, s.by + s.ty]);
    }
    const b = this.layer(layer).world.body(shape, { motion: Motion.Static, friction: s.mat.friction, restitution: s.mat.restitution, tag: this.colliders.length });
    this.colliders.push(new Collider(b, s, null, s.mat, s.kind, s.tag));
    return s;
  }

  addCircle(c: Circle, layer: i32): Circle {
    this.circles.push(c);
    const b = this.layer(layer).world.body(Shape.circle(c.r), { motion: Motion.Static, position: [c.x, c.y], friction: c.mat.friction, restitution: c.mat.restitution, tag: this.colliders.length });
    this.colliders.push(new Collider(b, null, c, c.mat, c.kind, c.tag));
    return c;
  }

  addPlunger(x0: number, x1: number, restY: number): void {
    this.plungerRestY = restY;
    this.plunger = new Segment(x0, restY, x1, restY, 0, PLUNGER_TIP, K_PLUNGER, 0);
    const body = this.layers[0].world.body(Shape.capsule(x0, 0, x1, 0, 0.02), { motion: Motion.Kinematic, position: [0, restY],
      friction: PLUNGER_TIP.friction, restitution: PLUNGER_TIP.restitution, tag: this.colliders.length });
    this.plungerBody = body;
    this.colliders.push(new Collider(body, null, null, PLUNGER_TIP, K_PLUNGER, 0));
  }

  addRamp(r: Ramp): i32 {
    this.ramps.push(r);
    const layer = this.ramps.length;
    this.layer(layer);
    for (const s of r.walls) this.addSegment(s, layer);
    return layer;
  }

  private emit(kind: i32, tag: i32, ball: i32, speed: number, dir: i32): void {
    if (this.nevents >= this.events.length) return;
    const e = this.events[this.nevents++];
    e.kind = kind; e.tag = tag; e.ball = ball; e.speed = speed; e.dir = dir;
  }

  private buildFlippers(): void {
    while (this.flipperBodies.length < this.flippers.length) {
      const f = this.flippers[this.flipperBodies.length], m = f.edgeA.mat;
      const sb = (f.r0 - f.r1) / f.len, cb = Math.sqrt(1 - sb * sb);
      const b = this.layers[0].world.body(Shape.polygon([f.r0 * sb, f.r0 * cb, f.len + f.r1 * sb, f.r1 * cb,
        f.len + f.r1 * sb, -f.r1 * cb, f.r0 * sb, -f.r0 * cb]),
        { motion: Motion.Kinematic, position: [f.px, f.py], angle: f.angle, friction: m.friction, restitution: m.restitution, tag: this.colliders.length });
      b.addShape(Shape.circle(f.r0), { friction: m.friction, restitution: m.restitution });
      b.addShape(Shape.circle(f.r1, f.len, 0), { friction: m.friction, restitution: m.restitution });
      this.colliders.push(new Collider(b, null, null, m, K_FLIPPER, f.tag));
      this.flipperBodies.push(b);
      this.flipperMoving.push(false);
    }
  }

  step(dt: number): void {
    if (dt <= 0) return;
    for (const b of this.balls) { b.previousX = b.x; b.previousY = b.y; b.previousZ = b.z; }
    this.buildFlippers();
    for (const c of this.colliders) {
      const on = c.segment !== null ? c.segment.enabled : c.circle !== null ? c.circle.enabled : true;
      if (on !== c.enabled) { c.body.setEnabled(on); c.enabled = on; }
    }
    let fastest = 0, surfaceSpeed = 0;
    for (const b of this.balls) if (b.active && !b.held) fastest = Math.max(fastest, Math.sqrt(b.vx * b.vx + b.vy * b.vy));
    for (const f of this.flippers) {
      const goal = f.pressed && f.enabled ? f.up : f.rest;
      if (f.angle !== goal) surfaceSpeed = Math.max(surfaceSpeed, FLIP_MAX_W * (f.len + f.r0));
    }
    if (this.plungerPull > 0) surfaceSpeed = Math.max(surfaceSpeed, this.pulling ? PULL_SPEED : PLUNGER_SPEED);
    const steps = travelSteps(dt, BALL_R, 2 * Math.min(MAX_SPEED, fastest + GRAVITY * dt) + surfaceSpeed);
    for (let i: i32 = 0; i < steps; i++) this.substep(dt / steps);
  }

  private substep(dt: number): void {
    for (let i: i32 = 0; i < this.balls.length; i++) { this.fromX[i] = this.balls[i].x; this.fromY[i] = this.balls[i].y; }
    for (let i: i32 = 0; i < this.flippers.length; i++) {
      const f = this.flippers[i];
      f.update(dt);
      const body = this.flipperBodies[i];
      if (f.sweepOmega !== 0) {
        body.moveTo(f.px, f.py, f.angle, dt);
        this.flipperMoving[i] = true;
      } else if (this.flipperMoving[i]) {
        body.setVelocity(0, 0); body.setAngularVelocity(0);
        this.flipperMoving[i] = false;
      }
    }
    this.stepPlunger(dt);
    for (let layer: i32 = 0; layer < this.layers.length; layer++) {
      const l = this.layers[layer];
      let live = false;
      for (let i: i32 = 0; i < this.balls.length; i++) {
        const b = this.balls[i], body = l.balls[i], enabled = b.active && !b.held && b.layer === layer;
        if (enabled !== l.enabled[i]) { body.setEnabled(enabled); l.enabled[i] = enabled; }
        if (!enabled) continue;
        live = true;
        if (b.layer > 0) this.rampSlope(b, dt); else b.z = 0;
        this.limitSpeed(b);
        if (body.x !== b.x || body.y !== b.y) body.setPosition(b.x, b.y);
        if (body.vx !== b.vx || body.vy !== b.vy) body.setVelocity(b.vx, b.vy);
        if (body.w !== b.w) body.setAngularVelocity(b.w);
      }
      if (!live && layer !== 0) continue;
      l.world.step(dt, 1);
      for (let i: i32 = 0; i < this.balls.length; i++) {
        if (!l.enabled[i]) continue;
        const b = this.balls[i], body = l.balls[i];
        b.x = body.x; b.y = body.y; b.vx = body.vx; b.vy = body.vy; b.w = body.w;
        this.limitSpeed(b);
      }
      for (const c of l.world.contacts) {
        if (c.kind !== ContactKind.Added || c.sensor || c.a === null || c.b === null || c.speed < EVENT_SPEED) continue;
        const a = c.a as Body, q = c.b as Body;
        const first = a.tag < 0;
        if (!first && q.tag >= 0) continue;
        const b = this.balls[-1 - (first ? a.tag : q.tag)], other = first ? q : a;
        if (other.tag < 0) { this.emit(E_BALL_HIT, 0, b.id, c.speed, 0); continue; }
        const part = this.colliders[other.tag], mat = part.mat;
        if (this.kicks && mat.kick > 0 && c.speed >= mat.kickMin) {
          const sign = first ? -1 : 1;
          b.vx += c.nx * sign * mat.kick; b.vy += c.ny * sign * mat.kick;
          this.limitSpeed(b);
        }
        this.emit(part.kind, part.tag, b.id, c.speed, 0);
      }
    }
    for (let i: i32 = 0; i < this.balls.length; i++) {
      const b = this.balls[i];
      if (b.active && !b.held) this.sense(b, this.fromX[i], this.fromY[i]);
    }
  }

  private stepPlunger(dt: number): void {
    const p = this.plunger, body = this.plungerBody;
    if (p === null || body === null) return;
    const previousPull = this.plungerPull;
    if (this.pulling) {
      this.plungerVel = PULL_SPEED;
      this.plungerPull = Math.min(1, this.plungerPull + PULL_SPEED * dt / PLUNGER_TRAVEL);
    } else if (this.plungerPull > 0) {
      this.plungerVel -= PLUNGER_K * this.plungerPull * PLUNGER_TRAVEL * dt;
      this.plungerPull = Math.max(0, this.plungerPull + this.plungerVel * dt / PLUNGER_TRAVEL);
    } else this.plungerVel = 0;
    const y = this.plungerRestY + this.plungerPull * PLUNGER_TRAVEL;
    if (this.plungerPull !== previousPull) {
      body.moveTo(0, y, 0, dt);
      this.plungerMoving = true;
    } else if (this.plungerMoving) {
      body.setVelocity(0, 0);
      this.plungerMoving = false;
    }
    p.place(p.ax, y, p.bx, y);
  }

  private limitSpeed(b: Ball): void {
    const k = speedScale(Math.sqrt(b.vx * b.vx + b.vy * b.vy), MAX_SPEED);
    b.vx *= k; b.vy *= k;
  }

  destroy(): void { for (const l of this.layers) l.world.destroy(); }

  /** Sensors and portals crossed by the move (x0, y0) -> ball, kicker holes, the drain. */
  private sense(b: Ball, x0: number, y0: number): void {
    for (const s of this.sensors) {
      if (s.layer !== b.layer) continue;
      if (!crosses(x0, y0, b.x, b.y, s.ax, s.ay, s.tx, s.ty, s.len, s.nx, s.ny)) continue;
      if (s.toLayer < 0) { this.emit(E_SENSOR, s.tag, b.id, Math.sqrt(b.vx * b.vx + b.vy * b.vy), cross.dir); continue; }
      if (s.dir !== 0 && s.dir !== cross.dir) continue;
      b.layer = s.toLayer; b.rampSeg = 0;
      if (b.layer === 0) b.z = 0;
      this.emit(E_PORTAL, s.tag, b.id, 0, cross.dir);
      break;
    }
    if (b.layer === 0) for (const h of this.holes) {
      const dx = b.x - h.x, dy = b.y - h.y;
      if (dx * dx + dy * dy > h.r * h.r) continue;
      if (b.vx * b.vx + b.vy * b.vy > h.captureSpeed * h.captureSpeed) continue;
      b.held = true; b.x = h.x; b.y = h.y; b.vx = 0; b.vy = 0; b.w = 0;
      this.emit(E_CAPTURE, h.tag, b.id, 0, 0);
    }
    if (b.y > DRAIN_Y) { b.active = false; this.emit(E_DRAIN, 0, b.id, 0, 0); }
  }

  /** Height and downhill pull on a ramp, from the nearest segment of its centreline. */
  private rampSlope(b: Ball, dt: number): void {
    const r = this.ramps[b.layer - 1];
    let best: number = 1e9, bi: i32 = 0, bu: number = 0;
    for (let i: i32 = 0; i + 1 < r.xs.length; i++) {
      const ax = r.xs[i], ay = r.ys[i], dx = r.xs[i + 1] - ax, dy = r.ys[i + 1] - ay;
      const l2 = dx * dx + dy * dy;
      let u = l2 > 1e-6 ? ((b.x - ax) * dx + (b.y - ay) * dy) / l2 : 0;
      if (u < 0) u = 0; else if (u > 1) u = 1;
      const ex = ax + dx * u - b.x, ey = ay + dy * u - b.y;
      const d2 = ex * ex + ey * ey;
      if (d2 < best) { best = d2; bi = i; bu = u; }
    }
    b.rampSeg = bi;
    const z0 = r.zs[bi], z1 = r.zs[bi + 1];
    b.z = z0 + (z1 - z0) * bu;
    const dx = r.xs[bi + 1] - r.xs[bi], dy = r.ys[bi + 1] - r.ys[bi];
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len <= 1e-6) return;
    const a = -RAMP_GRAVITY * (z1 - z0) / len * dt / len;   // acceleration along the (unnormalised) tangent
    b.vx += dx * a; b.vy += dy * a;
  }

  // ---------------------------------------------------------------- game-facing helpers

  /** Puts a ball on the table at rest. */
  place(b: Ball, x: number, y: number): void {
    b.previousX = x; b.previousY = y; b.previousZ = 0;
    b.x = x; b.y = y; b.z = 0; b.vx = 0; b.vy = 0; b.w = 0; b.layer = 0; b.active = true; b.held = false; b.rampSeg = 0;
  }

  /** Releases a held ball with a velocity (kicker hole eject), moved out of the hole's capture circle first. */
  eject(b: Ball, vx: number, vy: number): void {
    b.held = false; b.vx = vx; b.vy = vy;
    const v = Math.sqrt(vx * vx + vy * vy);
    if (v > 1e-3) { b.x += vx / v * 0.8; b.y += vy / v * 0.8; }
  }

  /** Table bump: every moving ball gets the velocity change (the table moves, the balls lag behind). */
  nudge(dvx: number, dvy: number): void {
    for (const b of this.balls) if (b.active && !b.held) { b.vx += dvx; b.vy += dvy; }
  }

  activeBalls(): i32 {
    let n: i32 = 0;
    for (const b of this.balls) if (b.active) n++;
    return n;
  }
}
