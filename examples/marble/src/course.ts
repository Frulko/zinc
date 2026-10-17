// The rules, without drawing: the course read from the LDtk level (a grid of floor heights and the entities), the ball
// against it (our own sphere-against-boxes collision, 120 steps a second), the shuttles, the gems, the goal, the clock and
// the lives. A cell is one unit, a height step half a unit; every number stays small, so the game plays the same with the
// f32 numbers of the PSP and the PS2 profiles. Each step appends what happened to `events` (the sounds and the log read them).
import { Level, Layer } from 'zinc:tilemap';

export const STEP = 1 / 120;
export const RADIUS = 0.3;
export const STEP_HEIGHT = 0.5;
export const MAX_TILT = 12 * Math.PI / 180;
const GRAVITY = 14;
const FRICTION = 0.5;            // per second, rolling on a floor
const BOUNCE = 0.3;              // off a wall
const MAX_SPEED = 12;
const FALL_Y = -6;               // below this the ball is lost
const PLATFORM_TOP = 0.5, PLATFORM_THICK = 0.2;
const LIVES = 3;

export enum Phase { Title, Play, Won, Over }

export class Gem {
  x: number; y: number; z: number;
  taken = false;
  constructor(x: number, y: number, z: number) { this.x = x; this.y = y; this.z = z; }
}

/** A shuttle: a 2 x 2 slab going to and fro between (ax, az) and (bx, bz), its centre, in `period` seconds. */
export class Platform {
  ax: number; az: number; bx: number; bz: number; period: number;
  x: number; z: number; dx = 0; dz = 0;
  constructor(ax: number, az: number, bx: number, bz: number, period: number) {
    this.ax = ax; this.az = az; this.bx = bx; this.bz = bz; this.period = period; this.x = ax; this.z = az;
  }
  move(t: number): void {
    const k = 0.5 - 0.5 * Math.cos(2 * Math.PI * t / this.period);
    const x = this.ax + (this.bx - this.ax) * k, z = this.az + (this.bz - this.az) * k;
    this.dx = x - this.x; this.dz = z - this.z; this.x = x; this.z = z;
  }
}

/** Decoration standing on a cell: a piece of the course art, turned by `yaw` degrees; a solid one stops the ball. */
export class Prop {
  piece: string; c: i32; r: i32; yaw: number; solid: boolean;
  constructor(piece: string, c: i32, r: i32, yaw: number, solid: boolean) { this.piece = piece; this.c = c; this.r = r; this.yaw = yaw; this.solid = solid; }
}

/** A low rail on an edge of a cell over the void: yaw 0 its +Z edge, 90 +X, 180 -Z, 270 -X (the course art's convention). */
export class Rail {
  c: i32; r: i32; yaw: i32;
  constructor(c: i32, r: i32, yaw: i32) { this.c = c; this.r = r; this.yaw = yaw; }
}
const RAIL_HEIGHT = 0.35, RAIL_DEPTH = 0.12;

export class Ball {
  x = 0; y = 0; z = 0;
  vx = 0; vy = 0; vz = 0;
  onGround = false;
  speed(): number { return Math.sqrt(this.vx * this.vx + this.vz * this.vz); }
}

export class Course {
  cols: i32; rows: i32;
  heights: i32[] = [];            // per cell: -1 no floor, else 0..3
  startX = 0; startZ = 0;
  goalX = 0; goalY = 0; goalZ = 0;
  gems: Gem[] = [];
  platforms: Platform[] = [];
  props: Prop[] = [];
  rails: Rail[] = [];
  ball = new Ball();
  phase = Phase.Title;
  time = 90;                      // seconds left
  limit = 90;
  lives: i32 = LIVES;
  taken: i32 = 0;
  played = 0;                     // seconds since the start of the game
  steps: i32 = 0;
  events: string[] = [];
  private level: Level;

  constructor(level: Level) {
    this.level = level;
    const grid: Layer = level.layer('Heights');
    this.cols = grid.cols; this.rows = grid.rows;
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) this.heights.push(grid.value(c, r) - 1);
    this.limit = level.props.number('time', 90);
    this.reset();
    for (const o of level.objects)
      if (o.type === 'Prop') this.props.push(new Prop(o.props.string('piece'), Math.floor(o.x / 16), Math.floor(o.y / 16), o.props.number('yaw'), o.props.bool('solid')));
    this.railEdges();
  }

  /** Rails along the void around the start (the cells within 4 columns and 1 row of it) and around the goal plateau (the
   *  lowest floor), except where a shuttle comes in. */
  private railEdges(): void {
    const dirs: i32[] = [0, 1, 0, 1, 0, 90, 0, -1, 180, -1, 0, 270];   // (dc, dr, yaw)
    for (let r = 0; r < this.rows; r++)
      for (let c = 0; c < this.cols; c++) {
        const h = this.heights[r * this.cols + c];
        const nearStart = Math.abs(c + 0.5 - this.startX) <= 4 && Math.abs(r + 0.5 - this.startZ) <= 1;
        if (h < 0 || (h !== 0 && !nearStart)) continue;
        for (let k = 0; k < 12; k += 3) {
          const nc = c + dirs[k], nr = r + dirs[k + 1];
          if (this.top(nc, nr) > -1000) continue;
          let shuttle = false;
          for (const p of this.platforms) {
            const x0 = Math.min(p.ax, p.bx) - 1, x1 = Math.max(p.ax, p.bx) + 1, z0 = Math.min(p.az, p.bz) - 1, z1 = Math.max(p.az, p.bz) + 1;
            if (nc + 0.5 > x0 && nc + 0.5 < x1 && nr + 0.5 > z0 && nr + 0.5 < z1) shuttle = true;
          }
          if (!shuttle) this.rails.push(new Rail(c, r, dirs[k + 2]));
        }
      }
  }

  /** The floor's top at a cell, or -1000 where there is none (and outside the course). */
  top(c: i32, r: i32): number {
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return -1000;
    const h = this.heights[r * this.cols + c];
    return h < 0 ? -1000 : h * STEP_HEIGHT;
  }

  reset(): void {
    this.gems = []; this.platforms = [];
    for (const o of this.level.objects) {
      const c = Math.floor(o.x / 16), r = Math.floor(o.y / 16);
      if (o.type === 'Start') { this.startX = c + 0.5; this.startZ = r + 0.5; }
      else if (o.type === 'Gem') this.gems.push(new Gem(c + 0.5, this.top(c, r) + 0.45, r + 0.5));
      else if (o.type === 'Goal') { this.goalX = c + 0.5; this.goalY = this.top(c, r); this.goalZ = r + 0.5; }
      else if (o.type === 'Platform') this.platforms.push(new Platform(c + 1, r + 1, o.props.number('toX') + 1, o.props.number('toZ') + 1, o.props.number('period', 4)));
    }
    this.time = this.limit; this.lives = LIVES; this.taken = 0; this.played = 0;
    this.respawn();
  }

  private respawn(): void {
    const b = this.ball;
    b.x = this.startX; b.z = this.startZ; b.y = this.top(Math.floor(b.x), Math.floor(b.z)) + RADIUS;
    b.vx = 0; b.vy = 0; b.vz = 0;
  }

  /** One step of 1/120 s with the board tilted: tiltX rolls the ball towards +x, tiltZ towards +z (radians). */
  step(tiltX: number, tiltZ: number, start: boolean): void {
    this.events.length = 0;
    this.steps++;
    if (this.phase !== Phase.Play) {
      if (start) {
        if (this.phase === Phase.Title) { this.reset(); this.phase = Phase.Play; this.events.push('start'); }
        else { this.phase = Phase.Title; this.events.push('title'); }
      }
      if (this.phase !== Phase.Play) return;
    }
    this.played += STEP;
    this.time -= STEP;
    if (this.time <= 0) { this.time = 0; this.phase = Phase.Over; this.events.push('timeout'); return; }
    for (const p of this.platforms) p.move(this.played);
    const b = this.ball;
    b.vx += GRAVITY * Math.sin(tiltX) * STEP;
    b.vz += GRAVITY * Math.sin(tiltZ) * STEP;
    b.vy -= GRAVITY * Math.cos(tiltX) * Math.cos(tiltZ) * STEP;
    const s = b.speed();
    if (s > MAX_SPEED) { b.vx *= MAX_SPEED / s; b.vz *= MAX_SPEED / s; }
    b.x += b.vx * STEP; b.y += b.vy * STEP; b.z += b.vz * STEP;
    b.onGround = false;
    // the floor columns around the ball, then the shuttles
    for (let r = Math.floor(b.z - RADIUS); r <= Math.floor(b.z + RADIUS); r++)
      for (let c = Math.floor(b.x - RADIUS); c <= Math.floor(b.x + RADIUS); c++) {
        const t = this.top(c, r);
        if (t > -1000) this.collide(c, -50, r, c + 1, t, r + 1, 0, 0);
      }
    for (const p of this.platforms) this.collide(p.x - 1, PLATFORM_TOP - PLATFORM_THICK, p.z - 1, p.x + 1, PLATFORM_TOP, p.z + 1, p.dx, p.dz);
    for (const w of this.rails) {
      if (Math.abs(w.c + 0.5 - b.x) > 1.5 || Math.abs(w.r + 0.5 - b.z) > 1.5) continue;
      const t = this.top(w.c, w.r), x0 = w.yaw === 90 ? w.c + 1 - RAIL_DEPTH : w.c, x1 = w.yaw === 270 ? w.c + RAIL_DEPTH : w.c + 1;
      const z0 = w.yaw === 0 ? w.r + 1 - RAIL_DEPTH : w.r, z1 = w.yaw === 180 ? w.r + RAIL_DEPTH : w.r + 1;
      this.collide(x0, t, z0, x1, t + RAIL_HEIGHT, z1, 0, 0);
    }
    for (const p of this.props) {
      if (!p.solid || Math.abs(p.c + 0.5 - b.x) > 1.5 || Math.abs(p.r + 0.5 - b.z) > 1.5) continue;
      const t = this.top(p.c, p.r);
      this.collide(p.c + 0.25, t, p.r + 0.25, p.c + 0.75, t + 1, p.r + 0.75, 0, 0);
    }
    if (b.onGround) { const k = 1 - FRICTION * STEP; b.vx *= k; b.vz *= k; }
    this.touch();
    if (b.y < FALL_Y) {
      this.lives--;
      this.events.push('fall');
      if (this.lives <= 0) { this.phase = Phase.Over; this.events.push('over'); }
      else this.respawn();
    }
  }

  /** The ball against a box: pushed out along the shortest way, its speed into the box taken away; standing on a moving box
   *  carries it along (dx, dz: how far the box moved this step). */
  private collide(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, dx: number, dz: number): void {
    const b = this.ball;
    const qx = Math.max(x0, Math.min(x1, b.x)), qy = Math.max(y0, Math.min(y1, b.y)), qz = Math.max(z0, Math.min(z1, b.z));
    let nx = b.x - qx, ny = b.y - qy, nz = b.z - qz;
    const d2 = nx * nx + ny * ny + nz * nz;
    if (d2 >= RADIUS * RADIUS) return;
    let d = Math.sqrt(d2);
    if (d < 1e-4) { nx = 0; ny = 1; nz = 0; d = 0; b.y = y1; }   // the centre inside: out through the top
    else { nx /= d; ny /= d; nz /= d; }
    const push = RADIUS - d;
    b.x += nx * push; b.y += ny * push; b.z += nz * push;
    const vn = b.vx * nx + b.vy * ny + b.vz * nz;
    const floor = ny > 0.7;
    if (vn < 0) {
      const k = (1 + (floor ? 0 : BOUNCE)) * vn;
      b.vx -= k * nx; b.vy -= k * ny; b.vz -= k * nz;
    }
    if (floor) { b.onGround = true; b.x += dx; b.z += dz; }
  }

  private touch(): void {
    const b = this.ball;
    for (const g of this.gems) {
      if (g.taken) continue;
      const dx = g.x - b.x, dy = g.y - b.y, dz = g.z - b.z;
      if (dx * dx + dy * dy + dz * dz > 0.36) continue;
      g.taken = true; this.taken++;
      this.events.push('gem');
    }
    const gx = this.goalX - b.x, gz = this.goalZ - b.z;
    if (gx * gx + gz * gz < 0.16 && b.y < this.goalY + 1) { this.phase = Phase.Won; this.events.push('goal'); }
  }

  /** The score of a finished run: the gems and the seconds left. */
  score(): i32 { return this.taken * 100 + (this.phase === Phase.Won ? Math.floor(this.time) * 10 : 0); }
}
