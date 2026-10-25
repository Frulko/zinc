// The table simulation: pure, deterministic Zinc (no clock, no randomness, no drawing), stepped at a fixed rate by
// the caller. One substep:
//   1. the flippers and the plunger move (kinematic bodies);
//   2. each ball gets gravity (along the table slope, plus the ramp's own slope on a ramp) and moves with
//      continuous collision detection: the earliest time of impact against the walls, posts and flippers of its
//      layer is found, the ball moves there, the impulse is applied (restitution, friction and spin, active kick),
//      and the rest of the step continues, up to 4 impacts per substep; a last pass pushes out any overlap left;
//   3. the lines the ball crossed fire sensors (rollovers, spinner) or portals (ramp entrances change the layer),
//      a slow ball over a kicker hole is captured, a ball below the apron drains;
//   4. balls on the same layer collide with each other.
// What happened is queued in `events` for the game rules, which read them after each substep.
import { hit, sweepCircle, sweepSegment, cross, crosses } from './geom';
import { Ball, BALL_R, Circle, Hole, Material, Ramp, Segment, Sensor, PLUNGER_TIP, K_PLUNGER, K_FLIPPER } from './bodies';
import { Flipper } from './flipper';

export const GRAVITY: number = 58;          // in/s² down the table (a 6.5° slope is 44; a bit livelier here)
export const RAMP_GRAVITY: number = 386;    // in/s²: the full vertical g acts along a ramp's own incline
export const MAX_SPEED: number = 380;
export const REST_SPEED: number = 3;        // below this normal speed a contact does not bounce (resting contact)
const ROLLING_DRAG: number = 0.12;          // 1/s
const SPIN_DRAG: number = 1.5;              // 1/s
const EVENT_SPEED: number = 1.5;            // hits slower than this are not reported

export const PLUNGER_TRAVEL: number = 1.5;  // in
export const PULL_SPEED: number = 1.4;      // in/s: a full pull takes about a second
export const PLUNGER_SPEED: number = 230;   // in/s at full pull
const PLUNGER_K: number = PLUNGER_SPEED * PLUNGER_SPEED / (PLUNGER_TRAVEL * PLUNGER_TRAVEL);

export const CELL: number = 2;
export const COLS: i32 = 11;
export const ROWS: i32 = 22;
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

/** Colliders of one layer bucketed by grid cell (indices into World.segs / World.circles). */
class Grid {
  segs: i32[][] = [];
  circles: i32[][] = [];
  constructor() {
    for (let i: i32 = 0; i < COLS * ROWS; i++) { this.segs.push([]); this.circles.push([]); }
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
  grids: Grid[] = [new Grid()];
  events: PhysEvent[] = [];
  nevents: i32 = 0;
  /** Bumper and slingshot kicks (off while tilted). */
  kicks: boolean = true;

  // plunger: a one-sided segment across the shooter lane, pulled down by `plungerPull` (0..1 of PLUNGER_TRAVEL)
  plunger: Segment | null = null;
  plungerRestY: number = 0;
  plungerPull: number = 0;
  plungerVel: number = 0;
  /** Held by the player: the plunger is drawn back; released, the spring drives it up. */
  pulling: boolean = false;

  constructor(maxBalls: i32) {
    for (let i: i32 = 0; i < maxBalls; i++) this.balls.push(new Ball(i));
    for (let i: i32 = 0; i < 64; i++) this.events.push(new PhysEvent());
  }

  // ---------------------------------------------------------------- building

  private layerGrid(layer: i32): Grid {
    while (this.grids.length <= layer) this.grids.push(new Grid());
    return this.grids[layer];
  }

  /** Calls `add(cell)` for every cell the box (grown by the ball radius and a step of travel) touches. */
  private cellsOf(x0: number, y0: number, x1: number, y1: number): i32[] {
    const m = BALL_R + 0.6;
    const c0: i32 = Math.max(0, Math.floor((Math.min(x0, x1) - m) / CELL)), c1: i32 = Math.min(COLS - 1, Math.floor((Math.max(x0, x1) + m) / CELL));
    const r0: i32 = Math.max(0, Math.floor((Math.min(y0, y1) - m) / CELL)), r1: i32 = Math.min(ROWS - 1, Math.floor((Math.max(y0, y1) + m) / CELL));
    const out: i32[] = [];
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) out.push(r * COLS + c);
    return out;
  }

  addSegment(s: Segment, layer: i32): Segment {
    const i: i32 = this.segs.length;
    this.segs.push(s);
    const g = this.layerGrid(layer);
    const grow = s.r;
    for (const c of this.cellsOf(Math.min(s.ax, s.bx) - grow, Math.min(s.ay, s.by) - grow, Math.max(s.ax, s.bx) + grow, Math.max(s.ay, s.by) + grow)) g.segs[c].push(i);
    return s;
  }

  addCircle(k: Circle, layer: i32): Circle {
    const i: i32 = this.circles.length;
    this.circles.push(k);
    const g = this.layerGrid(layer);
    for (const c of this.cellsOf(k.x - k.r, k.y - k.r, k.x + k.r, k.y + k.r)) g.circles[c].push(i);
    return k;
  }

  /** The plunger slides from restY down by PLUNGER_TRAVEL across the lane x0..x1. */
  addPlunger(x0: number, x1: number, restY: number): void {
    const s = new Segment(x0, restY, x1, restY, 0, PLUNGER_TIP, K_PLUNGER, 0);
    s.oneSided = true;
    this.plungerRestY = restY;
    this.plunger = s;
    const i: i32 = this.segs.length;
    this.segs.push(s);
    const g = this.layerGrid(0);
    for (const c of this.cellsOf(x0, restY, x1, restY + PLUNGER_TRAVEL)) g.segs[c].push(i);
  }

  addRamp(r: Ramp): i32 {
    this.ramps.push(r);
    const layer: i32 = this.ramps.length;
    for (const w of r.walls) this.addSegment(w, layer);
    return layer;
  }

  // ---------------------------------------------------------------- events

  private emit(kind: i32, tag: i32, ball: i32, speed: number, dir: i32): void {
    if (this.nevents >= this.events.length) return;
    const e = this.events[this.nevents++];
    e.kind = kind; e.tag = tag; e.ball = ball; e.speed = speed; e.dir = dir;
  }

  // ---------------------------------------------------------------- stepping

  /** One fixed substep of `dt` seconds. Events accumulate until the caller resets nevents. */
  step(dt: number): void {
    for (const f of this.flippers) f.update(dt);
    this.stepPlunger(dt);
    for (const b of this.balls) if (b.active && !b.held) this.moveBall(b, dt);
    this.ballContacts();
  }

  private stepPlunger(dt: number): void {
    const p = this.plunger;
    if (p === null) return;
    if (this.pulling) {
      this.plungerVel = PULL_SPEED;
      this.plungerPull += PULL_SPEED * dt / PLUNGER_TRAVEL;
      if (this.plungerPull >= 1) { this.plungerPull = 1; this.plungerVel = 0; }
    } else if (this.plungerPull > 0) {
      // spring: a = -k x; released from full travel the tip passes rest at PLUNGER_SPEED
      this.plungerVel -= PLUNGER_K * this.plungerPull * PLUNGER_TRAVEL * dt;
      this.plungerPull += this.plungerVel * dt / PLUNGER_TRAVEL;
      if (this.plungerPull <= 0) { this.plungerPull = 0; this.plungerVel = 0; }
    } else this.plungerVel = 0;
    const y = this.plungerRestY + this.plungerPull * PLUNGER_TRAVEL;
    p.place(p.ax, y, p.bx, y);
    p.svy = this.plungerVel;
  }

  private moveBall(b: Ball, dt: number): void {
    // forces
    b.vy += GRAVITY * dt;
    if (b.layer > 0) this.rampSlope(b, dt); else b.z = 0;
    const drag = 1 - ROLLING_DRAG * dt;
    b.vx *= drag; b.vy *= drag;
    b.w *= 1 - SPIN_DRAG * dt;
    const sp2 = b.vx * b.vx + b.vy * b.vy;
    if (sp2 > MAX_SPEED * MAX_SPEED) { const k = MAX_SPEED / Math.sqrt(sp2); b.vx *= k; b.vy *= k; }

    const x0 = b.x, y0 = b.y;
    const grid = this.grids[b.layer];
    let remaining: number = 1;
    for (let iter: i32 = 0; iter < 4 && remaining > 0.01; iter++) {
      const cell: i32 = this.cellOf(b.x, b.y);
      hit.t = 2;
      let seg: Segment | null = null;
      let circle: Circle | null = null;
      let flip: Flipper | null = null;
      const k = dt * remaining;
      for (const i of grid.segs[cell]) {
        const s = this.segs[i];
        if (!s.enabled) continue;
        if (sweepSegment(b.x, b.y, (b.vx - s.svx) * k, (b.vy - s.svy) * k, s.ax, s.ay, s.tx, s.ty, s.len, s.nx, s.ny, BALL_R + s.r, s.oneSided, !s.oneSided)) { seg = s; circle = null; flip = null; }
      }
      for (const i of grid.circles[cell]) {
        const c = this.circles[i];
        if (!c.enabled) continue;
        if (sweepCircle(b.x, b.y, b.vx * k, b.vy * k, c.x, c.y, c.r + BALL_R)) { circle = c; seg = null; flip = null; }
      }
      if (b.layer === 0) for (const f of this.flippers) if (this.sweepFlipper(b, f, k)) { flip = f; seg = null; circle = null; }

      if (hit.t > 1) { b.x += b.vx * k; b.y += b.vy * k; break; }
      const t = hit.t, nx = hit.nx, ny = hit.ny;
      b.x += b.vx * k * t + nx * 0.002;
      b.y += b.vy * k * t + ny * 0.002;
      if (seg !== null) this.resolve(b, nx, ny, seg.svx, seg.svy, seg.mat, seg.kind, seg.tag);
      else if (circle !== null) this.resolve(b, nx, ny, 0, 0, circle.mat, circle.kind, circle.tag);
      else if (flip !== null) {
        const cx = b.x - nx * BALL_R - flip.px, cy = b.y - ny * BALL_R - flip.py;
        this.resolve(b, nx, ny, -flip.omega * cy, flip.omega * cx, flip.edgeA.mat, K_FLIPPER, flip.tag);
      }
      remaining *= 1 - t;
    }
    this.pushOut(b);
    this.sense(b, x0, y0);
  }

  /** Swept test against a flipper's four features, with the ball's motion relative to the flipper's surface. */
  private sweepFlipper(b: Ball, f: Flipper, k: number): boolean {
    const dx = b.x - f.px, dy = b.y - f.py;
    const reach = f.len + f.r0 + BALL_R + 0.8;
    if (dx * dx + dy * dy > reach * reach) return false;
    const rvx = (b.vx + f.omega * dy) * k, rvy = (b.vy - f.omega * dx) * k;
    let found = false;
    const a = f.edgeA, e = f.edgeB;
    if (sweepSegment(b.x, b.y, rvx, rvy, a.ax, a.ay, a.tx, a.ty, a.len, a.nx, a.ny, BALL_R, true, false)) found = true;
    if (sweepSegment(b.x, b.y, rvx, rvy, e.ax, e.ay, e.tx, e.ty, e.len, e.nx, e.ny, BALL_R, true, false)) found = true;
    if (sweepCircle(b.x, b.y, rvx, rvy, f.px, f.py, f.r0 + BALL_R)) found = true;
    if (sweepCircle(b.x, b.y, rvx, rvy, f.tipX, f.tipY, f.r1 + BALL_R)) found = true;
    return found;
  }

  /**
   * Impulse at a contact with normal n against a surface moving at (svx, svy): restitution on the normal part
   * (none for a resting contact), Coulomb friction on the slip of the contact point, which also changes the spin
   * (a solid sphere: I = 2/5 m r², so a tangential impulse j changes the slip by 3.5 j), then the active kick.
   */
  private resolve(b: Ball, nx: number, ny: number, svx: number, svy: number, mat: Material, kind: i32, tag: i32): void {
    const rvx = b.vx - svx, rvy = b.vy - svy;
    const vn = rvx * nx + rvy * ny;
    if (vn >= 0) return;
    const e = -vn < REST_SPEED ? 0 : mat.restitution;
    const jn = -(1 + e) * vn;
    const tx = -ny, ty = nx;
    const slip = rvx * tx + rvy * ty - b.w * BALL_R;
    let jt = -slip / 3.5;
    const cap = mat.friction * jn;
    if (jt > cap) jt = cap; else if (jt < -cap) jt = -cap;
    b.vx += nx * jn + tx * jt;
    b.vy += ny * jn + ty * jt;
    b.w -= 2.5 * jt / BALL_R;
    if (mat.kick > 0 && this.kicks && -vn >= mat.kickMin) { b.vx += nx * mat.kick; b.vy += ny * mat.kick; }
    if (-vn >= EVENT_SPEED) this.emit(kind, tag, b.id, -vn, 0);
  }

  /** Positional correction: whatever still overlaps after the swept moves (resting contacts, a flipper or the
   *  plunger moving into a ball) is pushed out along its normal. */
  private pushOut(b: Ball): void {
    const cell: i32 = this.cellOf(b.x, b.y);
    const grid = this.grids[b.layer];
    for (const i of grid.segs[cell]) {
      const s = this.segs[i];
      if (s.enabled) this.pushOutSegment(b, s.ax, s.ay, s.tx, s.ty, s.len, s.nx, s.ny, BALL_R + s.r, s.oneSided);
    }
    for (const i of grid.circles[cell]) {
      const c = this.circles[i];
      if (c.enabled) this.pushOutCircle(b, c.x, c.y, c.r + BALL_R);
    }
    if (b.layer === 0) for (const f of this.flippers) {
      this.pushOutSegment(b, f.edgeA.ax, f.edgeA.ay, f.edgeA.tx, f.edgeA.ty, f.edgeA.len, f.edgeA.nx, f.edgeA.ny, BALL_R, true);
      this.pushOutSegment(b, f.edgeB.ax, f.edgeB.ay, f.edgeB.tx, f.edgeB.ty, f.edgeB.len, f.edgeB.nx, f.edgeB.ny, BALL_R, true);
      this.pushOutCircle(b, f.px, f.py, f.r0 + BALL_R);
      this.pushOutCircle(b, f.tipX, f.tipY, f.r1 + BALL_R);
    }
  }

  private pushOutSegment(b: Ball, ax: number, ay: number, tx: number, ty: number, len: number, nx: number, ny: number, r: number, oneSided: boolean): void {
    const rx = b.x - ax, ry = b.y - ay;
    const u = rx * tx + ry * ty;
    const d = rx * nx + ry * ny;
    if (u < 0 || u > len) { if (!oneSided) this.pushOutCircle(b, u < 0 ? ax : ax + tx * len, u < 0 ? ay : ay + ty * len, r); return; }
    if (oneSided) { if (d >= 0 && d < r) { b.x += nx * (r - d); b.y += ny * (r - d); } return; }
    if (d >= 0 && d < r) { b.x += nx * (r - d); b.y += ny * (r - d); }
    else if (d < 0 && d > -r) { b.x -= nx * (r + d); b.y -= ny * (r + d); }
  }

  private pushOutCircle(b: Ball, cx: number, cy: number, r: number): void {
    const dx = b.x - cx, dy = b.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 >= r * r) return;
    const d = Math.sqrt(d2);
    if (d <= 1e-6) return;
    b.x = cx + dx / d * r; b.y = cy + dy / d * r;
  }

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

  /** Equal-mass elastic-ish collisions between balls of the same layer (multiball). */
  private ballContacts(): void {
    const n: i32 = this.balls.length;
    for (let i: i32 = 0; i < n; i++) {
      const p = this.balls[i];
      if (!p.active || p.held) continue;
      for (let j: i32 = i + 1; j < n; j++) {
        const q = this.balls[j];
        if (!q.active || q.held || q.layer !== p.layer) continue;
        const dx = p.x - q.x, dy = p.y - q.y;
        const d2 = dx * dx + dy * dy, min = 2 * BALL_R;
        if (d2 >= min * min || d2 <= 1e-6) continue;
        const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, push = (min - d) / 2;
        p.x += nx * push; p.y += ny * push; q.x -= nx * push; q.y -= ny * push;
        const vn = (p.vx - q.vx) * nx + (p.vy - q.vy) * ny;
        if (vn >= 0) continue;
        const j2 = -(1 + 0.9) * vn / 2;
        p.vx += nx * j2; p.vy += ny * j2; q.vx -= nx * j2; q.vy -= ny * j2;
        if (-vn >= EVENT_SPEED) this.emit(E_BALL_HIT, 0, p.id, -vn, 0);
      }
    }
  }

  private cellOf(x: number, y: number): i32 {
    let c: i32 = Math.floor(x / CELL), r: i32 = Math.floor(y / CELL);
    if (c < 0) c = 0; else if (c >= COLS) c = COLS - 1;
    if (r < 0) r = 0; else if (r >= ROWS) r = ROWS - 1;
    return r * COLS + c;
  }

  // ---------------------------------------------------------------- game-facing helpers

  /** Puts a ball on the table at rest. */
  place(b: Ball, x: number, y: number): void {
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
