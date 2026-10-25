// Starfall's rules, without drawing. The field is one column 320 px wide and 480 px tall: its upper half is the top screen (the sky),
// its lower half the touch screen. Stars fall from the sky through both screens; the player draws bounce lines with the stylus on the
// lower half, and a star that hits one is thrown back up (a line throws one star, and lasts LINE_LIFE at most). A star that leaves the sky at the top is caught: it takes its place in the
// constellation, and a full constellation is the next level. A star that falls off the bottom costs a life; so does a meteor that hits
// a line (meteors must be let through). Fixed steps of 1/60 s; `events` says what each step did (the sounds and the test read it).

export const FIELD_W = 320, SKY_H = 240, FIELD_H = 480;
export const STEP = 1 / 60;
export const R = 8;                    // a star's and a meteor's radius
export const MAX_LINES: i32 = 2;
export const LINE_LIFE = 4;            // seconds a line lasts
export const LINE_MIN = 24, LINE_MAX = 150;
export const LIVES: i32 = 3;
const GRAVITY = 170, METEOR_GRAVITY = 140, GRAVITY_PER_LEVEL = 15;   // px/s²: a star crosses both screens in about 2.3 s at first
const BOUNCE = 600, LIFT_MIN = 500;   // a bounce always throws a star out of the sky (500 px/s lifts it 500 px)
const POOL: i32 = 24;

export const STAR: i32 = 0, METEOR: i32 = 1;
export enum Phase { Title, Play, Over }

export class Faller {
  kind: i32 = STAR;
  x = 0; y = 0; vx = 0; vy = 0;
  alive = false;
  bounces: i32 = 0;
  depth = 0;            // how far out of the screen it is drawn on the top screen (visual only)
}

export class Line {
  ax = 0; ay = 0; bx = 0; by = 0;
  nx = 0; ny = 0;       // unit normal (towards the sky side)
  len = 0;
  age = 0;
  alive = false;
}

/** The constellations to fill, one per level (then they come round again): points in the sky (x 0..320, y 20..200). */
export const CONSTELLATIONS: number[][] = [
  [40, 70, 85, 60, 125, 80, 165, 85, 200, 120, 260, 115, 270, 160, 205, 165],           // the Plough
  [40, 80, 95, 140, 150, 90, 205, 150, 265, 85],                                          // Cassiopeia
  [110, 40, 210, 50, 130, 110, 160, 115, 190, 120, 120, 180, 220, 175, 160, 70],          // Orion
  [60, 150, 100, 110, 150, 95, 200, 110, 240, 80, 270, 40, 130, 160, 190, 170, 230, 150], // the Swan
];
export const NAMES: string[] = ['THE PLOUGH', 'CASSIOPEIA', 'ORION', 'THE SWAN'];

export class World {
  phase = Phase.Title;
  demo = false;          // the title's game, played by the autopilot
  fallers: Faller[] = [];
  lines: Line[] = [];
  lives: i32 = LIVES;
  score: i32 = 0;
  level: i32 = 0;
  lit: i32 = 0;          // stars of the constellation caught
  combo: i32 = 0;        // stars caught in a row
  steps: i32 = 0;
  events: string[] = [];
  private spawnT = 0;
  private seed: i32 = 1;

  constructor() {
    for (let i: i32 = 0; i < POOL; i++) this.fallers.push(new Faller());
    for (let i: i32 = 0; i < MAX_LINES; i++) this.lines.push(new Line());
  }

  constellation(): number[] { return CONSTELLATIONS[this.level % CONSTELLATIONS.length]; }
  need(): i32 { return this.constellation().length / 2; }

  /** A small deterministic generator (the same game for the same seed: the tests). */
  random(): number { this.seed = (Math.imul(this.seed, 1103515245) + 12345) & 0x7fffffff; return this.seed / 2147483648; }

  start(seed: i32): void {
    this.seed = seed;
    this.phase = Phase.Play;
    this.lives = LIVES; this.score = 0; this.level = 0; this.lit = 0; this.combo = 0; this.spawnT = 0.5;
    for (const f of this.fallers) f.alive = false;
    for (const l of this.lines) l.alive = false;
    this.events.push('start');
  }

  /** A new star (or meteor) at the top of the sky. */
  spawn(kind: i32, x: number, vx: number, vy: number): Faller | null {
    for (const f of this.fallers) {
      if (f.alive) continue;
      f.kind = kind; f.x = x; f.y = -R; f.vx = vx; f.vy = vy; f.alive = true; f.bounces = 0;
      f.depth = kind === METEOR ? 3 : this.random() * 4 - 2;
      return f;
    }
    return null;
  }

  /** A line drawn with the stylus, in field coordinates; too short ones are ignored, long ones cut. The oldest goes when there are two. */
  addLine(ax: number, ay: number, bx: number, by: number): boolean {
    let dx = bx - ax, dy = by - ay, len = Math.sqrt(dx * dx + dy * dy);
    if (this.phase !== Phase.Play || len < LINE_MIN) return false;
    if (len > LINE_MAX) { bx = ax + dx * LINE_MAX / len; by = ay + dy * LINE_MAX / len; dx = bx - ax; dy = by - ay; len = LINE_MAX; }
    let slot = this.lines[0];
    for (const l of this.lines) { if (!l.alive) { slot = l; break; } if (l.age > slot.age) slot = l; }
    slot.ax = ax; slot.ay = ay; slot.bx = bx; slot.by = by; slot.len = len; slot.age = 0; slot.alive = true;
    slot.nx = dy / len; slot.ny = -dx / len;
    if (slot.ny > 0) { slot.nx = -slot.nx; slot.ny = -slot.ny; }   // the normal looks up, at the sky
    this.events.push('line');
    return true;
  }

  step(): void {
    this.events.length = 0;
    this.steps++;
    if (this.phase !== Phase.Play) return;
    for (const l of this.lines) if (l.alive) { l.age += STEP; if (l.age >= LINE_LIFE) l.alive = false; }
    this.spawnT -= STEP;
    if (this.spawnT <= 0) {
      const lv = Math.min(this.level, 6);
      this.spawnT = Math.max(0.55, 1.5 - lv * 0.15) * (0.7 + this.random() * 0.6);
      const meteor = this.random() < Math.min(0.4, 0.12 + lv * 0.05);
      this.spawn(meteor ? METEOR : STAR, R + this.random() * (FIELD_W - 2 * R), (this.random() - 0.5) * 60, 30 + this.random() * 40 + lv * 8);
    }
    for (const f of this.fallers) if (f.alive) this.move(f);
  }

  private move(f: Faller): void {
    const x0 = f.x, y0 = f.y;
    f.vy += ((f.kind === METEOR ? METEOR_GRAVITY : GRAVITY) + Math.min(this.level, 6) * GRAVITY_PER_LEVEL) * STEP;
    f.x += f.vx * STEP; f.y += f.vy * STEP;
    if (f.x < R) { f.x = R; f.vx = Math.abs(f.vx); }
    if (f.x > FIELD_W - R) { f.x = FIELD_W - R; f.vx = -Math.abs(f.vx); }
    for (const l of this.lines) if (l.alive && this.hits(f, l, x0, y0)) return;
    if (f.y < -R && f.vy < 0) this.caught(f);
    else if (f.y > FIELD_H + R) this.fell(f);
  }

  /** The faller against a line: crossing it, or within R of it while coming at it from the sky's side. */
  private hits(f: Faller, l: Line, x0: number, y0: number): boolean {
    const d0 = (x0 - l.ax) * l.nx + (y0 - l.ay) * l.ny, d1 = (f.x - l.ax) * l.nx + (f.y - l.ay) * l.ny;
    const towards = f.vx * l.nx + f.vy * l.ny < 0;
    if (!towards || d0 < -R || d1 > R) return false;
    const t = ((f.x - l.ax) * (l.bx - l.ax) + (f.y - l.ay) * (l.by - l.ay)) / (l.len * l.len);
    if (t < -0.05 || t > 1.05) return false;
    if (f.kind === METEOR) {   // a meteor breaks the line and costs a life
      f.alive = false; l.alive = false;
      this.events.push('meteor');
      this.lose();
      return true;
    }
    // back on the sky side, the speed mirrored about the line, then thrown up: a trampoline
    f.x += (R - d1) * l.nx; f.y += (R - d1) * l.ny;
    const vn = f.vx * l.nx + f.vy * l.ny;
    f.vx -= 2 * vn * l.nx; f.vy -= 2 * vn * l.ny;
    const sp = Math.sqrt(f.vx * f.vx + f.vy * f.vy);
    f.vx *= BOUNCE / sp; f.vy *= BOUNCE / sp;
    if (f.vy > -LIFT_MIN) { f.vy = -LIFT_MIN; f.vx = Math.sign(f.vx) * Math.sqrt(BOUNCE * BOUNCE - LIFT_MIN * LIFT_MIN) * Math.min(1, Math.abs(f.vx) / 300); }
    f.bounces++;
    l.alive = false;   // a line throws one star
    this.events.push('bounce');
    return true;
  }

  private caught(f: Faller): void {
    f.alive = false;
    if (f.kind === METEOR) return;   // a meteor thrown back up: gone, nothing won
    this.combo++;
    this.score += 10 * (this.level + 1) * Math.min(this.combo, 5);
    this.lit++;
    this.events.push('caught');
    if (this.lit >= this.need()) {
      this.level++; this.lit = 0;
      this.score += 100 * this.level;
      this.events.push('level');
    }
  }

  private fell(f: Faller): void {
    f.alive = false;
    if (f.kind === METEOR) { this.score += 5; this.events.push('dodged'); return; }
    this.events.push('lost');
    this.lose();
  }

  private lose(): void {
    this.combo = 0;
    this.lives--;
    if (this.lives <= 0) {
      this.phase = Phase.Over;
      for (const f of this.fallers) f.alive = false;
      for (const l of this.lines) l.alive = false;
      this.events.push('over');
    }
  }

  /** From the title (the demo game) or the end: a new game. */
  tap(seed: i32): void { if (this.phase !== Phase.Play || this.demo) { this.start(seed); this.demo = false; } }

  /** The demo's player (and the tests'): a line under each star coming down the touch screen, none over a meteor. */
  autopilot(): void {
    let free: i32 = 0;
    for (const l of this.lines) if (!l.alive) free++;
    for (const f of this.fallers) {
      if (free === 0 || !f.alive || f.kind !== STAR || f.vy <= 0 || f.y < SKY_H + 20 || f.y > SKY_H + 60) continue;
      let meteorBelow = false;
      for (const o of this.fallers) if (o.alive && o.kind === METEOR && Math.abs(o.x - f.x) < 70 && o.y > SKY_H) meteorBelow = true;
      if (meteorBelow) continue;
      const x = Math.max(40, Math.min(FIELD_W - 40, f.x)), tilt = (f.x - FIELD_W / 2) * 0.15;
      if (this.addLine(x - 35, f.y + 70 + tilt, x + 35, f.y + 70 - tilt)) free--;
    }
  }
}
