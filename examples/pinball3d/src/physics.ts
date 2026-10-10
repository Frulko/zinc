// What the game asks of a physics engine, and the engine behind it. The game (game.ts) only knows TablePhysics: balls
// with a position and a speed in table coordinates, flippers and a plunger it presses, things it switches, and the
// list of what each ball touched in a step. JoltPhysics answers with zinc:physics3d: a real sphere on a tilted board
// among real volumes, so a ball climbs a ramp, rides a rail, falls off its end and jumps. Another engine would be
// another class beside it.
import { World, Shape, Body, Motion, ContactKind } from 'zinc:physics3d';
import { quatFromAxisAngle } from 'zinc:3d';
import { Table, TableDef } from './format/table';
import { Solid, tessellate, wall, track, floor, prism, flipperOutline, rad } from './geometry';

/** What a ball can touch. */
export const enum Part { Board, Wall, Flipper, Plunger, Bumper, Slingshot, Target, Ramp, Floor, Gate, Model, Ball, Glass }

export class BallState {
  live: boolean = false;
  x: number = 0; y: number = 0; z: number = 0;
  vx: number = 0; vy: number = 0; vz: number = 0;
  /** Its rotation, for the eye only: a quaternion in the engine's axes. */
  qx: number = 0; qy: number = 0; qz: number = 0; qw: number = 1;
  speed(): number { return Math.sqrt(this.vx * this.vx + this.vy * this.vy + this.vz * this.vz); }
}

/** A ball met something in the last step. */
export class Touch {
  ball: i32; part: Part; index: i32;
  /** How fast they approached. */
  speed: number;
  constructor(ball: i32, part: Part, index: i32, speed: number) { this.ball = ball; this.part = part; this.index = index; this.speed = speed; }
}

export class TablePhysics {
  balls: BallState[] = [];
  touches: Touch[] = [];
  /** The angle of each flipper in the top view, degrees. */
  flipperAngle: number[] = [];
  /** How far the plunger is pulled back, centimetres. */
  plungerPull: number = 0;
  /** Seconds one step lasts. */
  dt: number = 1 / 960;

  /** Advances by one step of `dt`. */
  step(): void {}
  /** Puts ball `i` in play at a table position with a velocity. */
  putBall(i: i32, x: number, y: number, z: number, vx: number, vy: number, vz: number): void {}
  /** Takes ball `i` out of play. */
  removeBall(i: i32): void {}
  /** Adds to the velocity of ball `i` (a bumper, a slingshot, a bump of the table). */
  kickBall(i: i32, vx: number, vy: number, vz: number): void {}
  pressFlipper(i: i32, on: boolean): void {}
  /** Held, the plunger is pulled back; let go, it shoots. */
  pullPlunger(on: boolean): void {}
  /** A drop target up (the ball hits it) or down (the ball passes). */
  setTarget(i: i32, up: boolean): void {}
  /** A one-way gate closed (a wall) or open. */
  setGate(i: i32, closed: boolean): void {}
  destroy(): void {}
}

const TAG = 1000;   // a body's tag is its part * TAG + its index

export class JoltPhysics extends TablePhysics {
  private t: TableDef;
  private world: World;
  private ballBodies: Body[] = [];
  private flipperBodies: Body[] = [];
  private pressed: boolean[] = [];
  private plungerBody: Body;
  private pulling: boolean = false;
  private shootSpeed: number = 0;
  private targetBodies: Body[] = [];
  private gateBodies: Body[] = [];
  private maxSpeed: number;

  constructor(table: Table, maxBalls: i32) {
    super();
    const t = table.def;
    this.t = t;
    this.dt = 1 / t.physics.rate;
    this.maxSpeed = t.physics.maxSpeed;
    // the board lies flat and gravity leans: its share along the slope pulls down the table (+y), the rest into the board
    const slope = rad(t.playfield.slope), g = t.physics.gravity;
    const w = new World({ gravity: [0, -g * Math.cos(slope), g * Math.sin(slope)], maxBodies: 1024, sleeping: false });
    this.world = w;
    const pw = t.playfield.width, plen = t.playfield.length, glass = t.playfield.glass;
    const board = this.surface(t.playfield.surface);
    w.body(Shape.box(pw / 2, 1, plen / 2), { motion: Motion.Static, position: [pw / 2, -1, plen / 2], friction: board[0], restitution: board[1], tag: Part.Board * TAG });
    w.body(Shape.box(pw / 2 + 2, 0.5, plen / 2 + 30), { motion: Motion.Static, position: [pw / 2, glass + 0.5, plen / 2], friction: 0.1, restitution: 0.2, tag: Part.Glass * TAG });
    // the cabinet around the board, so that no ball ever leaves by a side or by the top
    w.body(Shape.box(1, glass, plen / 2 + 30), { motion: Motion.Static, position: [-1, 0, plen / 2], tag: Part.Glass * TAG });
    w.body(Shape.box(1, glass, plen / 2 + 30), { motion: Motion.Static, position: [pw + 1, 0, plen / 2], tag: Part.Glass * TAG });
    w.body(Shape.box(pw / 2 + 2, glass, 1), { motion: Motion.Static, position: [pw / 2, 0, -1], tag: Part.Glass * TAG });

    for (let i = 0; i < t.walls.length; i++) {
      const e = t.walls[i], s = new Solid();
      wall(s, tessellate(e.points, e.closed), e.z, e.z + e.height, e.thickness);
      this.fixed(s, e.surface, Part.Wall, i);
    }
    for (let i = 0; i < t.ramps.length; i++) {
      const e = t.ramps[i], s = new Solid();
      track(s, tessellate(e.points, false), e.profile, e.width, e.thickness, e.wall, e.skirt && e.style === 'solid' ? t.physics.ball.radius * 2 + 0.4 : 0);
      this.fixed(s, e.surface, Part.Ramp, i);
    }
    for (let i = 0; i < t.floors.length; i++) {
      const e = t.floors[i], s = new Solid();
      floor(s, tessellate(e.points, true), e.z, e.thickness);
      this.fixed(s, e.surface, Part.Floor, i);
    }
    for (let i = 0; i < t.bumpers.length; i++) {
      const e = t.bumpers[i], m = this.surface(e.surface);
      w.body(Shape.cylinder(e.height / 2, e.radius), { motion: Motion.Static, position: [e.at[0], e.z + e.height / 2, e.at[1]], friction: m[0], restitution: m[1], tag: Part.Bumper * TAG + i });
    }
    for (let i = 0; i < t.slingshots.length; i++) {
      const e = t.slingshots[i];
      this.bar(e.a, e.b, e.z, e.height, e.thickness, e.surface, Part.Slingshot, i);
    }
    for (let i = 0; i < t.targets.length; i++) {
      const e = t.targets[i], c = Math.cos(rad(e.angle)), sn = Math.sin(rad(e.angle)), h = e.width / 2;
      this.targetBodies.push(this.bar([e.at[0] + sn * h, e.at[1] - c * h], [e.at[0] - sn * h, e.at[1] + c * h], e.z, e.height, e.thickness, e.surface, Part.Target, i));
    }
    for (let i = 0; i < t.gates.length; i++) {
      const e = t.gates[i];
      this.gateBodies.push(this.bar(e.a, e.b, e.z, e.height, 0.2, e.surface, Part.Gate, i));
    }
    for (let i = 0; i < t.models.length; i++) this.model(table, i);

    for (let i = 0; i < t.flippers.length; i++) {
      const e = t.flippers[i], outline = flipperOutline(e.length, e.baseRadius, e.tipRadius), pts: number[] = [];
      for (let k = 0; k + 1 < outline.length; k += 2) {
        pts.push(outline[k]); pts.push(0); pts.push(outline[k + 1]);
        pts.push(outline[k]); pts.push(e.height); pts.push(outline[k + 1]);
      }
      const m = this.surface(e.surface);
      this.flipperBodies.push(w.body(Shape.convexHull(pts, 0.05), { motion: Motion.Kinematic, position: [e.pivot[0], e.z, e.pivot[1]], rotation: quatFromAxisAngle(0, 1, 0, -rad(e.rest)),
        friction: m[0], restitution: m[1], tag: Part.Flipper * TAG + i }));
      this.flipperAngle.push(e.rest);
      this.pressed.push(false);
    }
    const pl = t.plunger, pm = this.surface(pl.surface);
    this.plungerBody = w.body(Shape.box(0.5, pl.height / 2, pl.width / 2), { motion: Motion.Kinematic, position: [pl.at[0], pl.z + pl.height / 2, pl.at[1]],
      rotation: quatFromAxisAngle(0, 1, 0, -rad(pl.angle)), friction: pm[0], restitution: pm[1], tag: Part.Plunger * TAG });
    const b = t.physics.ball, sphere = Shape.sphere(b.radius);
    for (let i = 0; i < maxBalls; i++) {
      this.ballBodies.push(w.body(sphere, { position: [0, -50 - i * 5, 0], enabled: false, mass: b.mass, friction: b.friction, restitution: b.restitution, linearDamping: b.drag,
        angularDamping: b.spin, continuous: true, smoothEdges: true, events: true, sleeping: false, maxSpeed: this.maxSpeed, maxAngularSpeed: this.maxSpeed / b.radius * 2,
        tag: Part.Ball * TAG + i }));
      this.balls.push(new BallState());
    }
    w.optimize();
  }

  /** Friction and restitution of a surface of the table; the format's defaults for '' (no surface named). */
  private surface(id: string): number[] {
    for (const s of this.t.surfaces) if (s.id === id) return [s.friction, s.restitution];
    return [0.3, 0.4];
  }
  private fixed(s: Solid, surface: string, part: Part, index: i32): void {
    const m = this.surface(surface);
    this.world.body(Shape.mesh(s.pos, s.idx), { motion: Motion.Static, friction: m[0], restitution: m[1], tag: part * TAG + index });
  }
  /** A box from a to b seen from above, standing on level z. */
  private bar(a: number[], b: number[], z: number, height: number, thickness: number, surface: string, part: Part, index: i32): Body {
    const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.sqrt(dx * dx + dy * dy), m = this.surface(surface);
    return this.world.body(Shape.box(len / 2, height / 2, thickness / 2), { motion: Motion.Static, position: [(a[0] + b[0]) / 2, z + height / 2, (a[1] + b[1]) / 2],
      rotation: quatFromAxisAngle(0, 1, 0, -Math.atan2(dy, dx)), friction: m[0], restitution: m[1], tag: part * TAG + index });
  }
  /** A model the ball meets: the box around it, or its convex hull. */
  private model(table: Table, i: i32): void {
    const e = this.t.models[i];
    if (e.collide === 'none') return;
    // the points of the piece in its own axes (x, up, y): the corners of a box, a ring of a cylinder, the vertices of a mesh
    const pts: number[] = [];
    if (e.mesh !== '' && table.source !== null) {
      for (const line of table.source.text(e.mesh).split('\n')) {
        if (!line.startsWith('v ')) continue;
        const v = line.split(' ').filter((s: string) => s.length > 0);
        if (v.length >= 4) { pts.push(parseFloat(v[1])); pts.push(parseFloat(v[2])); pts.push(parseFloat(v[3])); }
      }
    } else if (e.shape === 'box') {
      for (let k = 0; k < 8; k++) { pts.push((k & 1) - 0.5); pts.push(((k >> 1) & 1) - 0.5); pts.push(((k >> 2) & 1) - 0.5); }
    } else {
      const sphere = e.shape === 'sphere';
      for (let k = 0; k < 12; k++) {
        const c = Math.cos(k * Math.PI / 6) * 0.5, sn = Math.sin(k * Math.PI / 6) * 0.5;
        if (sphere) { for (const h of [-0.4, -0.2, 0, 0.2, 0.4]) { const r = Math.sqrt(0.25 - h * h) * 2; pts.push(c * r); pts.push(h); pts.push(sn * r); } }
        else { pts.push(c); pts.push(0); pts.push(sn); if (e.shape === 'cylinder') { pts.push(c); pts.push(1); pts.push(sn); } }
      }
      if (sphere) { pts.push(0); pts.push(0.5); pts.push(0); pts.push(0); pts.push(-0.5); pts.push(0); } else if (e.shape === 'cone') { pts.push(0); pts.push(1); pts.push(0); }
    }
    if (pts.length < 12) return;
    const sx = e.scale[0], sy = e.scale[2], sz = e.scale[1];
    let lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
    for (let k = 0; k + 2 < pts.length; k += 3) {
      pts[k] *= sx; pts[k + 1] *= sy; pts[k + 2] *= sz;
      for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], pts[k + a]); hi[a] = Math.max(hi[a], pts[k + a]); }
    }
    const m = this.surface(e.surface);
    // ponytail: a model that collides is turned around the vertical only (rotation[2]); tilted pieces need the full turn
    const turn = quatFromAxisAngle(0, 1, 0, -rad(e.rotation[2]));
    if (e.collide === 'box') {
      const cx = (lo[0] + hi[0]) / 2, cy = (lo[1] + hi[1]) / 2, cz = (lo[2] + hi[2]) / 2;
      const c = Math.cos(rad(e.rotation[2])), sn = Math.sin(rad(e.rotation[2]));
      this.world.body(Shape.box(Math.max(0.05, (hi[0] - lo[0]) / 2), Math.max(0.05, (hi[1] - lo[1]) / 2), Math.max(0.05, (hi[2] - lo[2]) / 2)),
        { motion: Motion.Static, position: [e.at[0] + cx * c - cz * sn, e.at[2] + cy, e.at[1] + cx * sn + cz * c], rotation: turn, friction: m[0], restitution: m[1], tag: Part.Model * TAG + i });
    } else {
      this.world.body(Shape.convexHull(pts), { motion: Motion.Static, position: [e.at[0], e.at[2], e.at[1]], rotation: turn, friction: m[0], restitution: m[1], tag: Part.Model * TAG + i });
    }
  }

  step(): void {
    const t = this.t, dt = this.dt;
    for (let i = 0; i < t.flippers.length; i++) {
      const e = t.flippers[i], goal = this.pressed[i] ? e.rest + e.stroke : e.rest;
      const most = (this.pressed[i] ? e.speed : e.returnSpeed) * dt, d = goal - this.flipperAngle[i];
      if (d !== 0) {
        this.flipperAngle[i] += Math.abs(d) <= most ? d : d > 0 ? most : -most;
        const q = quatFromAxisAngle(0, 1, 0, -rad(this.flipperAngle[i]));
        this.flipperBodies[i].moveTo(e.pivot[0], e.z, e.pivot[1], q[0], q[1], q[2], q[3], dt);
      } else if (this.flipperBodies[i].wy !== 0) this.flipperBodies[i].setAngularVelocity(0, 0, 0);
    }
    {
      const e = t.plunger;
      let pull = this.plungerPull;
      if (this.pulling) pull = Math.min(e.travel, pull + e.travel / e.pullTime * dt);
      else if (pull > 0) pull = Math.max(0, pull - this.shootSpeed * dt);
      if (pull !== this.plungerPull) {
        this.plungerPull = pull;
        const q = quatFromAxisAngle(0, 1, 0, -rad(e.angle));
        this.plungerBody.moveTo(e.at[0] - Math.cos(rad(e.angle)) * pull, e.z + e.height / 2, e.at[1] - Math.sin(rad(e.angle)) * pull, q[0], q[1], q[2], q[3], dt);
      } else if (this.plungerBody.vx !== 0 || this.plungerBody.vz !== 0) this.plungerBody.setVelocity(0, 0, 0);
    }
    // two balls flying at each other are only swept against where the other was (docs/plugins/physics3d.md): more
    // collision steps when two of them close fast
    let closing = 0;
    for (let i = 0; i < this.balls.length; i++) {
      if (!this.balls[i].live) continue;
      for (let k = i + 1; k < this.balls.length; k++) {
        if (!this.balls[k].live) continue;
        const a = this.balls[i], b = this.balls[k];
        const rx = b.x - a.x, ry = b.y - a.y, rz = b.z - a.z, d = Math.sqrt(rx * rx + ry * ry + rz * rz);
        if (d < 1e-6 || d > 30) continue;
        const v = -((b.vx - a.vx) * rx + (b.vy - a.vy) * ry + (b.vz - a.vz) * rz) / d;
        if (v > closing) closing = v;
      }
    }
    const steps: i32 = Math.max(1, Math.min(8, Math.ceil(closing * dt / (0.5 * t.physics.ball.radius))));
    this.world.step(dt, steps);

    for (let i = 0; i < this.balls.length; i++) {
      const s = this.balls[i], b = this.ballBodies[i];
      if (!s.live) continue;
      s.x = b.x; s.y = b.z; s.z = b.y;
      s.vx = b.vx; s.vy = b.vz; s.vz = b.vy;
      s.qx = b.qx; s.qy = b.qy; s.qz = b.qz; s.qw = b.qw;
    }
    const touches: Touch[] = [];
    for (const c of this.world.contacts) {
      if (c.kind !== ContactKind.Added || c.a === null || c.b === null) continue;
      const ta = (c.a as Body).tag, tb = (c.b as Body).tag;
      const aBall = Math.floor(ta / TAG) === Part.Ball;
      if (!aBall && Math.floor(tb / TAG) !== Part.Ball) continue;
      const ball: i32 = aBall ? ta % TAG : tb % TAG, other: i32 = aBall ? tb : ta;
      touches.push(new Touch(ball, Math.floor(other / TAG) as Part, other % TAG, Math.abs(c.speed)));
    }
    this.touches = touches;
  }

  putBall(i: i32, x: number, y: number, z: number, vx: number, vy: number, vz: number): void {
    const b = this.ballBodies[i], s = this.balls[i];
    if (!s.live) b.setEnabled(true);
    b.setTransform(x, z, y, 0, 0, 0, 1);
    b.setAngularVelocity(0, 0, 0);
    b.setVelocity(vx, vz, vy);
    s.live = true;
    s.x = x; s.y = y; s.z = z; s.vx = vx; s.vy = vy; s.vz = vz;
    s.qx = 0; s.qy = 0; s.qz = 0; s.qw = 1;
  }
  removeBall(i: i32): void {
    if (!this.balls[i].live) return;
    this.balls[i].live = false;
    this.ballBodies[i].setEnabled(false);
  }
  kickBall(i: i32, vx: number, vy: number, vz: number): void {
    const s = this.balls[i], b = this.ballBodies[i];
    if (!s.live) return;
    let nx = s.vx + vx, ny = s.vy + vy, nz = s.vz + vz;
    const sp = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (sp > this.maxSpeed) { const k = this.maxSpeed / sp; nx *= k; ny *= k; nz *= k; }
    b.setVelocity(nx, nz, ny);
    s.vx = nx; s.vy = ny; s.vz = nz;
  }
  pressFlipper(i: i32, on: boolean): void { this.pressed[i] = on; }
  pullPlunger(on: boolean): void {
    if (this.pulling && !on) this.shootSpeed = this.t.plunger.speed * this.plungerPull / this.t.plunger.travel;
    this.pulling = on;
  }
  setTarget(i: i32, up: boolean): void { this.targetBodies[i].setEnabled(up); }
  setGate(i: i32, closed: boolean): void { this.gateBodies[i].setEnabled(closed); }
  destroy(): void { this.world.destroy(); }
}
