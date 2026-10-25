// The arena and its rules. The host (or a solo game) runs step(): balls fly, hit, score, players respawn, a round ends at WIN_SCORE.
// A client keeps the same World, filled from the host's snapshots, and moves only its own player (moveLocal): positions are the
// players' own, hits and scores the host's.
import {
  MAP, WALL_LETTERS, RADIUS, HIT_RADIUS, BALL_SPEED, BALL_LIFE, FIRE_COOLDOWN, RESPAWN_TIME, WIN_SCORE, ROUND_PAUSE,
} from './constants';

export class Player {
  id: i32;
  name: string;
  x = 0; y = 0; angle = 0;
  score: i32 = 0;
  dead = false;
  respawnIn = 0;
  spawns: i32 = 0;        // counts the respawns: a client teleports when it changes
  splatBy: i32 = -1;      // who splatted it last
  cooldown = 0;
  shots: i32 = 0;         // a client's fire counter: each new shot is one ball on the host
  bot = false;
  // a remote player, on a client: where the last snapshot put it (drawn moving towards it)
  tx = 0; ty = 0; ta = 0;
  // a client, on the host: its address and when it last spoke
  address = '';
  port: i32 = 0;
  heardAt = 0;
  constructor(id: i32, name: string) { this.id = id; this.name = name; }
}

export class Ball {
  x: number; y: number; dx: number; dy: number;
  owner: i32;
  age = 0;
  constructor(x: number, y: number, dx: number, dy: number, owner: i32) { this.x = x; this.y = y; this.dx = dx; this.dy = dy; this.owner = owner; }
}

export class World {
  w: i32;
  h: i32;
  cells: i32[] = [];      // 0 floor, 1.. the wall's colour index + 1
  spawnsX: number[] = [];
  spawnsY: number[] = [];
  players: Player[] = [];
  balls: Ball[] = [];
  winner: i32 = -1;       // the round's winner while the pause shows it
  pause = 0;
  events: string[] = [];  // what happened in the last step ('hit 2 1', 'win 2'): the log and the sounds
  nextId: i32 = 0;
  seed: i32 = 12345;

  constructor() {
    this.h = MAP.length;
    this.w = MAP[0].length;
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const c = MAP[y].charAt(x);
        const wall = WALL_LETTERS.indexOf(c);
        this.cells.push(wall >= 0 ? wall + 1 : 0);
        if (c === 'o') { this.spawnsX.push(x + 0.5); this.spawnsY.push(y + 0.5); }
      }
    }
  }

  /** The wall at a cell (its colour index + 1), 0 for floor; outside the arena is wall. */
  cell(cx: i32, cy: i32): i32 {
    if (cx < 0 || cy < 0 || cx >= this.w || cy >= this.h) return 1;
    return this.cells[cy * this.w + cx];
  }
  solid(x: number, y: number): boolean { return this.cell(Math.floor(x) as i32, Math.floor(y) as i32) > 0; }
  /** Whether a circle of RADIUS at (x, y) touches a wall. */
  blocked(x: number, y: number): boolean {
    return this.solid(x - RADIUS, y - RADIUS) || this.solid(x + RADIUS, y - RADIUS) || this.solid(x - RADIUS, y + RADIUS) || this.solid(x + RADIUS, y + RADIUS);
  }
  /** Moves a player by (dx, dy), sliding along the walls. */
  slide(p: Player, dx: number, dy: number): void {
    if (!this.blocked(p.x + dx, p.y)) p.x += dx;
    if (!this.blocked(p.x, p.y + dy)) p.y += dy;
  }
  /** Whether the straight line between two points crosses no wall (steps of a quarter cell). */
  sees(ax: number, ay: number, bx: number, by: number): boolean {
    const dx = bx - ax, dy = by - ay;
    const n = Math.ceil(Math.sqrt(dx * dx + dy * dy) * 4) as i32;
    for (let i = 1; i < n; i++) if (this.solid(ax + dx * i / n, ay + dy * i / n)) return false;
    return true;
  }

  random(): number {   // a small LCG: the same arena on every machine that runs the same steps
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
    return this.seed / 0x7fffffff;
  }

  player(id: i32): Player | null {
    for (const p of this.players) if (p.id === id) return p;
    return null;
  }
  add(name: string): Player {
    const p = new Player(this.nextId, name);
    this.nextId++;
    this.players.push(p);
    this.spawn(p);
    return p;
  }
  remove(id: i32): void {
    const kept: Player[] = [];
    for (const p of this.players) if (p.id !== id) kept.push(p);
    this.players = kept;
  }
  /** Puts a player on the spawn point farthest from the others. */
  spawn(p: Player): void {
    let best = 0, bestScore = -1.0;
    const offset = Math.floor(this.random() * this.spawnsX.length) as i32;
    for (let k = 0; k < this.spawnsX.length; k++) {
      const i = (k + offset) % this.spawnsX.length;
      let near = 1000.0;
      for (const o of this.players) {
        if (o === p || o.dead) continue;
        const dx = o.x - this.spawnsX[i], dy = o.y - this.spawnsY[i];
        near = Math.min(near, dx * dx + dy * dy);
      }
      if (near > bestScore) { bestScore = near; best = i; }
    }
    p.x = this.spawnsX[best];
    p.y = this.spawnsY[best];
    p.angle = Math.atan2(this.h / 2 - p.y, this.w / 2 - p.x);   // facing the middle
    p.dead = false;
    p.spawns++;
  }

  /** A ball from a player, if its paint gun is ready (the host's side). */
  fire(p: Player): boolean {
    if (p.dead || p.cooldown > 0 || this.pause > 0) return false;
    p.cooldown = FIRE_COOLDOWN;
    const dx = Math.cos(p.angle), dy = Math.sin(p.angle);
    this.balls.push(new Ball(p.x + dx * 0.3, p.y + dy * 0.3, dx * BALL_SPEED, dy * BALL_SPEED, p.id));
    this.events.push(`fire ${p.id}`);
    return true;
  }

  /** One step of the match (the host's side): cooldowns, balls, hits, respawns, the round. */
  step(dt: number): void {
    for (const p of this.players) {
      if (p.cooldown > 0) p.cooldown -= dt;
      if (p.dead) {
        p.respawnIn -= dt;
        if (p.respawnIn <= 0 && this.pause <= 0) this.spawn(p);
      }
    }
    if (this.pause > 0) {
      this.pause -= dt;
      if (this.pause <= 0) this.newRound();
      return;
    }
    const kept: Ball[] = [];
    for (const b of this.balls) {
      b.age += dt;
      b.x += b.dx * dt;
      b.y += b.dy * dt;
      if (b.age > BALL_LIFE || this.solid(b.x, b.y)) continue;   // splashed on a wall, or fell
      let hit = false;
      for (const p of this.players) {
        if (p.dead || p.id === b.owner) continue;
        const dx = p.x - b.x, dy = p.y - b.y;
        if (dx * dx + dy * dy > HIT_RADIUS * HIT_RADIUS) continue;
        this.splat(p, b.owner);
        hit = true;
        break;
      }
      if (!hit) kept.push(b);
    }
    this.balls = kept;
  }
  splat(p: Player, by: i32): void {
    p.dead = true;
    p.respawnIn = RESPAWN_TIME;
    p.splatBy = by;
    const shooter = this.player(by);
    if (shooter !== null) shooter.score++;
    this.events.push(`hit ${by} ${p.id}`);
    if (shooter !== null && shooter.score >= WIN_SCORE) {
      this.winner = by;
      this.pause = ROUND_PAUSE;
      this.balls = [];
      this.events.push(`win ${by}`);
    }
  }
  newRound(): void {
    this.winner = -1;
    this.pause = 0;
    for (const p of this.players) { p.score = 0; this.spawn(p); }
  }
}
