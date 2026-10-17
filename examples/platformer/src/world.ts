// The rules, without drawing: the hero's physics against the level's IntGrid, the enemies, the coins, lives, score and
// the goal. Fixed steps of 1/60 s, in pixels: every number stays small (the level is 2160 x 504 px), so the game plays
// the same with the f32 numbers of the PSP and the PS2 profiles. Each step appends what happened to `events` (the sounds
// and the test's log read them).
import { Level, Layer, MapObject } from 'zinc:tilemap';
import { Controls } from './input';

export const STEP = 1 / 60;
export const CELL = 18;
// what a cell of the Collisions layer is
const SOLID = 1, CLOUD = 2, SPIKES = 3;
// the hero, in px and px/s
export const HERO_W = 14, HERO_H = 22;
const GRAVITY = 1240, MAX_FALL = 472;
const WALK = 90, RUN = 158, ACCEL = 1012, AIR_ACCEL = 585, FRICTION = 1125;
const JUMP_SPEED = 388, JUMP_CUT = 0.45, STOMP_BOUNCE = 259;
const COYOTE = 0.08, BUFFER = 0.1;   // a jump still works this long after leaving a ledge, or pressed this long before landing
const INVULNERABLE = 1.5;            // seconds after a hit
const LIVES = 3;

export enum Phase { Title, Play, Paused, Won, Over }

export class Hero {
  x = 0; y = 0; vx = 0; vy = 0;
  facing = 1;
  onGround = false;
  coyote = 0;
  buffer = 0;
  hurt = 0;            // > 0: the seconds left of the knock-back (no control)
  blink = 0;           // > 0: invulnerable
  anim = 0;            // ms in the current pose
  pose = 'idle';
  safeX = 0; safeY = 0;   // the last place it stood on solid ground: where a fall puts it back
}

export class Enemy {
  kind: string;        // 'walker' or 'flyer'
  x: number; y: number; w: number; h: number;
  vx: number;
  baseX: number; baseY: number;
  t = 0;
  alive = true;
  squash = 0;          // > 0: stomped, shown flat for that long
  constructor(kind: string, x: number, y: number, w: number, h: number, vx: number) {
    this.kind = kind; this.x = x; this.y = y; this.w = w; this.h = h; this.vx = vx; this.baseX = x; this.baseY = y;
  }
}

export class Coin {
  x: number; y: number;
  taken = false;
  constructor(x: number, y: number) { this.x = x; this.y = y; }
}

function overlap(ax: number, ay: number, aw: number, ah: number, bx: number, by: number, bw: number, bh: number): boolean {
  return ax < bx + bw && bx < ax + aw && ay < by + bh && by < ay + ah;
}

export class World {
  level: Level;
  walls: Layer;
  width: number; height: number;
  phase = Phase.Title;
  hero = new Hero();
  enemies: Enemy[] = [];
  coins: Coin[] = [];
  goalX = 0; goalY = 0;
  startX = 0; startY = 0;
  lives: i32 = LIVES;
  score: i32 = 0;
  taken: i32 = 0;
  time = 0;            // seconds of play
  steps: i32 = 0;
  events: string[] = [];

  constructor(level: Level) {
    this.level = level;
    this.walls = level.layer('Collisions');
    this.width = level.width;
    this.height = level.height;
    this.reset();
  }

  /** A new game: every entity back where the level puts it. */
  reset(): void {
    this.enemies = [];
    this.coins = [];
    for (const o of this.level.objects) this.place(o);
    const h = this.hero;
    h.x = this.startX; h.y = this.startY; h.vx = 0; h.vy = 0; h.facing = 1; h.hurt = 0; h.blink = 0; h.safeX = h.x; h.safeY = h.y;
    this.lives = LIVES; this.score = 0; this.taken = 0; this.time = 0;
  }

  private place(o: MapObject): void {
    // an entity's record is its box, pivot at the bottom centre: things stand on its bottom edge
    const cx = o.x + o.width / 2, bottom = o.y + o.height;
    if (o.type === 'Start') { this.startX = cx - HERO_W / 2; this.startY = bottom - HERO_H; }
    else if (o.type === 'Coin') this.coins.push(new Coin(cx - 6, bottom - 15));
    else if (o.type === 'Walker') this.enemies.push(new Enemy('walker', cx - 7, bottom - 12, 14, 12, -34));
    else if (o.type === 'Flyer') this.enemies.push(new Enemy('flyer', cx - 7, bottom - 14, 14, 10, 45));
    else if (o.type === 'Goal') { this.goalX = cx - 9; this.goalY = bottom - 36; }
  }

  /** The cell's value; beside the level it is a wall, under it the void. */
  cell(c: i32, r: i32): i32 {
    if (c < 0 || c >= this.walls.cols) return SOLID;
    if (r < 0 || r >= this.walls.rows) return 0;
    return this.walls.value(c, r);
  }
  private solidAt(c: i32, r: i32): boolean { return this.cell(c, r) === SOLID; }

  /** One step of 1/60 s. */
  step(input: Controls): void {
    this.events.length = 0;
    this.steps++;
    if (this.phase === Phase.Title) {
      if (input.start || input.jumpPressed) { this.reset(); this.phase = Phase.Play; this.events.push('start'); }
      return;
    }
    if (this.phase === Phase.Won || this.phase === Phase.Over) {
      if (input.start) { this.phase = Phase.Title; this.events.push('title'); }
      return;
    }
    if (input.start) {
      this.phase = this.phase === Phase.Paused ? Phase.Play : Phase.Paused;
      this.events.push(this.phase === Phase.Paused ? 'pause' : 'resume');
      return;
    }
    if (this.phase === Phase.Paused) return;
    this.time += STEP;
    this.moveHero(input);
    for (const e of this.enemies) this.moveEnemy(e);
    this.touch();
  }

  private moveHero(input: Controls): void {
    const h = this.hero;
    const control = h.hurt <= 0;
    if (h.hurt > 0) h.hurt -= STEP;
    if (h.blink > 0) h.blink -= STEP;
    // walking and running: accelerate towards the speed asked, slow down on the ground when nothing is held
    const dir = control ? (input.right ? 1 : 0) - (input.left ? 1 : 0) : 0;
    const top = input.run ? RUN : WALK;
    if (dir !== 0) {
      h.facing = dir;
      const a = (h.onGround ? ACCEL : AIR_ACCEL) * STEP;
      h.vx = Math.max(-top, Math.min(top, h.vx + dir * a));
      if (Math.abs(h.vx) > top) h.vx = dir * top;
    } else if (h.onGround) {
      const f = FRICTION * STEP;
      h.vx = Math.abs(h.vx) <= f ? 0 : h.vx - Math.sign(h.vx) * f;
    }
    // jumping: a short grace after a ledge and before landing; letting go early cuts the jump
    h.coyote = h.onGround ? COYOTE : h.coyote - STEP;
    h.buffer = control && input.jumpPressed ? BUFFER : h.buffer - STEP;
    if (h.buffer > 0 && h.coyote > 0) {
      h.vy = -JUMP_SPEED; h.buffer = 0; h.coyote = 0; h.onGround = false;
      this.events.push('jump');
    }
    if (!input.jump && h.vy < -JUMP_SPEED * JUMP_CUT) h.vy = -JUMP_SPEED * JUMP_CUT;
    h.vy = Math.min(MAX_FALL, h.vy + GRAVITY * STEP);
    this.moveX(h);
    this.moveY(h);
    if (h.onGround && this.solidAt(Math.floor(h.x / CELL), Math.floor((h.y + HERO_H) / CELL)) &&
        this.solidAt(Math.floor((h.x + HERO_W - 1) / CELL), Math.floor((h.y + HERO_H) / CELL))) { h.safeX = h.x; h.safeY = h.y; }
    // the pose the drawing shows
    const pose = h.hurt > 0 ? 'hurt' : !h.onGround ? 'jump' : h.vx !== 0 ? 'run' : 'idle';
    if (pose !== h.pose) { h.pose = pose; h.anim = 0; }
    else h.anim += STEP * 1000 * (pose === 'run' ? Math.max(0.5, Math.abs(h.vx) / WALK) : 1);
    // spikes and the void
    if (this.touches(h.x + 2, h.y + 4, HERO_W - 4, HERO_H - 4, SPIKES)) this.hit(0);
    if (h.y > this.height) this.fell();
  }

  private moveX(h: Hero): void {
    h.x += h.vx * STEP;
    const r0 = Math.floor(h.y / CELL), r1 = Math.floor((h.y + HERO_H - 1) / CELL);
    if (h.vx > 0) {
      const c = Math.floor((h.x + HERO_W) / CELL);
      for (let r = r0; r <= r1; r++) if (this.solidAt(c, r)) { h.x = c * CELL - HERO_W; h.vx = 0; return; }
    } else if (h.vx < 0) {
      const c = Math.floor(h.x / CELL);
      for (let r = r0; r <= r1; r++) if (this.solidAt(c, r)) { h.x = (c + 1) * CELL; h.vx = 0; return; }
    }
  }

  private moveY(h: Hero): void {
    const before = h.y + HERO_H;
    h.y += h.vy * STEP;
    h.onGround = false;
    const c0 = Math.floor(h.x / CELL), c1 = Math.floor((h.x + HERO_W - 1) / CELL);
    if (h.vy >= 0) {
      const r = Math.floor((h.y + HERO_H) / CELL);
      for (let c = c0; c <= c1; c++) {
        const v = this.cell(c, r);
        // clouds hold only what comes down onto them from above
        if (v === SOLID || (v === CLOUD && before <= r * CELL)) { h.y = r * CELL - HERO_H; h.vy = 0; h.onGround = true; return; }
      }
    } else {
      const r = Math.floor(h.y / CELL);
      for (let c = c0; c <= c1; c++) if (this.solidAt(c, r)) { h.y = (r + 1) * CELL; h.vy = 0; return; }
    }
  }

  private touches(x: number, y: number, w: number, hh: number, value: i32): boolean {
    for (let r = Math.floor(y / CELL); r <= Math.floor((y + hh - 1) / CELL); r++)
      for (let c = Math.floor(x / CELL); c <= Math.floor((x + w - 1) / CELL); c++) if (this.cell(c, r) === value) return true;
    return false;
  }

  private moveEnemy(e: Enemy): void {
    if (!e.alive) { if (e.squash > 0) e.squash -= STEP; return; }
    e.t += STEP;
    if (e.kind === 'flyer') {   // to and fro over 108 px, bobbing
      e.x += e.vx * STEP;
      if (Math.abs(e.x - e.baseX) > 54) { e.x = e.baseX + Math.sign(e.x - e.baseX) * 54; e.vx = -e.vx; }
      e.y = e.baseY + Math.sin(e.t * 3) * 11;
      return;
    }
    // a walker turns at a wall and at the edge of its floor
    const ahead = e.vx > 0 ? e.x + e.w : e.x - 1;
    const c = Math.floor(ahead / CELL), feet = Math.floor((e.y + e.h) / CELL);
    if (this.solidAt(c, Math.floor((e.y + e.h - 1) / CELL)) || this.cell(c, feet) === 0) e.vx = -e.vx;
    else e.x += e.vx * STEP;
  }

  /** The hero against coins, enemies and the goal. */
  private touch(): void {
    const h = this.hero;
    for (const coin of this.coins) {
      if (coin.taken || !overlap(h.x, h.y, HERO_W, HERO_H, coin.x, coin.y, 12, 12)) continue;
      coin.taken = true; this.taken++; this.score += 10;
      this.events.push('coin');
    }
    for (const e of this.enemies) {
      if (!e.alive || !overlap(h.x, h.y, HERO_W, HERO_H, e.x, e.y, e.w, e.h)) continue;
      if (h.vy > 0 && h.y + HERO_H - e.y < 11) {   // landed on it
        e.alive = false; e.squash = 0.4; h.vy = -STOMP_BOUNCE; this.score += 100;
        this.events.push('stomp');
      } else this.hit(e.x + e.w / 2 < h.x + HERO_W / 2 ? 1 : -1);
    }
    if (overlap(h.x, h.y, HERO_W, HERO_H, this.goalX + 4, this.goalY, 8, 36)) {
      this.score += Math.max(0, 300 - Math.floor(this.time)) * 5;
      this.phase = Phase.Won;
      this.events.push('goal');
    }
  }

  /** A hit knocks the hero back (away from `from`: -1 left, 1 right, 0 up) and costs a life. */
  private hit(from: number): void {
    const h = this.hero;
    if (h.blink > 0) return;
    h.hurt = 0.4; h.blink = INVULNERABLE;
    h.vx = from * 135; h.vy = -225;
    this.lose('hurt');
  }

  private fell(): void {
    const h = this.hero;
    h.x = h.safeX; h.y = h.safeY; h.vx = 0; h.vy = 0; h.blink = INVULNERABLE;
    this.lose('fall');
  }

  private lose(why: string): void {
    this.lives--;
    this.events.push(why);
    if (this.lives <= 0) { this.phase = Phase.Over; this.events.push('over'); }
  }
}
