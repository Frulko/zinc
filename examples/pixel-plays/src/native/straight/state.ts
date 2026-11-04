// Droit devant: the rules of Just go straight (Gimond, GPL-3.0), ported scene for scene.
// A scene is one place seen through a window of mist. The track runs along the screen's horizontal axis (u) and the
// jungle walls along v; leaving by any side changes the scene, as in the original, behind the mist (render.ts).
import { hash } from '../renderer';

export const HALF = 14.2;                     // half length of a tile along the track
export const WALL = 3.1;                     // the track is |v| < WALL, the jungle wall starts after it
export const EDGE = 12.6;                    // a gap in a wall ends at this |v|, deep in the mist: the way out
// The part of the world we see: nothing is drawn outside it, and a mist closes its borders.
export const VIEW_X = 25, VIEW_Y = 34, VIEW_W = 310, VIEW_H = 150;
export const FOOT_W = HALF, FOOT_H = EDGE;      // a tile's footprint in the world: |u - u0| < FOOT_W, |v - v0| < FOOT_H; neighbours abut
export const SLOTS: number[] = [-10.5, -3.5, 3.5, 10.5];
export const GAP = 1;                        // half width of a gap in a wall
export const SPEED = 7;
export const AUTO_SPEED = 4.4;
export const CHEAT: number[] = [0, 0, 2, 2, 3, 1, 3, 1];   // up up down down left right left right
export const END_NAMES: string[] = ['TRICHEUR', 'PERDU', 'SANS PELLE', 'TRÉSOR'];
export const KIND_JUNGLE = 'jungle', KIND_BEACH = 'beach', KIND_TREASURE = 'treasure';
const ENTRY = HALF - .6;

export class Tile {
  kind: string = KIND_JUNGLE;
  seed: number = 0;
  north: i32 = 0;            // slot of the gap in the north wall
  south: i32 = 0;
  top: number[] = [0, 0, 0, 0];      // tree variety per slot: 0 broadleaf, 1 palm, 2 thicket
  bottom: number[] = [0, 0, 0, 0];
  sign: i32 = -1;            // -1 none, 0 north gap, 1 east end, 2 south gap, 3 west end
  sword: boolean = false; swordU: number = 0;
  hat: boolean = false; hatU: number = 0;
  shovel: boolean = false;   // the beach only
  eyesU: number = 0; eyesV: number = 0;
  steps: number[] = [];      // u, v pairs of footprints
  saved: i32 = -1;
  u0: number = 0; v0: number = 0;   // where the tile stands in the world (its centre, in u and v); every coordinate above is local to it
  id: i32 = 0;
}
export function cloneTile(t: Tile): Tile {
  const c = new Tile();
  c.kind = t.kind; c.seed = t.seed; c.north = t.north; c.south = t.south;
  c.top = t.top.slice(0); c.bottom = t.bottom.slice(0); c.sign = t.sign;
  c.sword = t.sword; c.swordU = t.swordU; c.hat = t.hat; c.hatU = t.hatU; c.shovel = t.shovel;
  c.eyesU = t.eyesU; c.eyesV = t.eyesV; c.steps = t.steps.slice(0); c.saved = t.saved; c.u0 = t.u0; c.v0 = t.v0;
  return c;
}

export class Run {
  tile: Tile = new Tile();
  beachTile: Tile = new Tile();
  saved: Tile[] = [];
  savedIndex: i32 = -1;
  u: number = 8; v: number = 1; dir: i32 = 1; moving: boolean = false; step: i32 = 0; stepTimer: number = 0;
  lost: boolean = false; win: boolean = false; beach: boolean = true; backToBeach: boolean = false;
  straight: i32 = 0; chance: i32 = 0;
  sword: boolean = false; hat: boolean = false; shovel: boolean = false;
  neverLost: boolean = true; cheated: boolean = false; endSword: boolean = false;
  endShovel: i32 = 0; dug: boolean = false; end: i32 = -1;
  path: number[] = [];
  walkTo: number = 0; timerAnim: number = 0; timerWave: number = 2;
  endings: boolean[] = [false, false, false, false];
  complete: boolean = false; completeTimeout: number = 1;
  time: number = 0; phase: string = 'play';
  events: string[] = [];
  // the change of scene: 0..1 while the mist swallows the old place and gives the new one back
  glide: number = -1; exitCode: i32 = 0; switched: boolean = false;
}
export const g = new Run();

let seed: u32 = 20261101;
export function rnd(): number {
  seed = (Math.imul(seed as i32, 1664525) + 1013904223) as u32;
  return seed / 4294967296;
}
const rint = (max: number): i32 => Math.floor(rnd() * max) as i32;

export function shoreU(v: number): number { return -5.2 + Math.sin(v * .45) * 1.1 + Math.sin(v * 1.3) * .35; }
// The tile being drawn or painted: xOf and yOf map the tile's own (u, v) to the world, so a painter keeps working in its tile's frame.
let OU = 0, OV = 0;
export function setOrigin(u: number, v: number): void { OU = u; OV = v; }
export function xOf(u: number, v: number): number { return (u + OU + v + OV) / Math.SQRT2; }
export function yOf(u: number, v: number): number { return (v + OV - u - OU) / Math.SQRT2; }
export function yawOf(dir: i32): number { return dir === 0 ? -Math.PI * .75 : dir === 1 ? -Math.PI * .25 : dir === 2 ? Math.PI * .25 : Math.PI * .75; }

function newBeach(): Tile {
  const t = new Tile();
  t.kind = KIND_BEACH; t.shovel = true; t.seed = 3;
  return t;
}
function newTreasure(): Tile {
  const t = new Tile();
  t.kind = KIND_TREASURE; t.seed = 11;
  return t;
}

export function startGame(): void {
  g.beachTile = newBeach();
  g.tile = g.beachTile;
  g.saved = []; g.savedIndex = -1;
  g.u = 8; g.v = 1; g.dir = 1; g.moving = false; g.step = 0; g.stepTimer = 0;
  g.lost = false; g.win = false; g.beach = true; g.backToBeach = false;
  g.straight = 0; g.chance = 0;
  g.sword = false; g.hat = false; g.shovel = false; g.neverLost = true; g.cheated = false;
  g.endSword = false; g.endShovel = 0; g.dug = false; g.end = -1; g.path = [];
  g.walkTo = 0; g.timerAnim = 0; g.time = 0; g.phase = 'play'; g.events = [];
  g.glide = -1;
}

// The track and the two gaps are open; the jungle walls, the sea and the boat stop the pirate.
export function blocked(t: Tile, u: number, v: number): boolean {
  if (t.kind === KIND_BEACH) {
    if (u < shoreU(v) + .5 || Math.abs(v) > 5.4) return true;
    if (u > 8 && Math.abs(v) > 3.4) return true;
    const bu = (u + 3.2) / 2.5, bv = (v - 3.1) / 1.2;     // the rowboat on the sand
    return bu * bu + bv * bv < 1;
  }
  const a = Math.abs(v);
  if (a <= WALL) return false;
  const slot = SLOTS[v < 0 ? t.north : t.south];
  return Math.abs(u - slot) > GAP - .1;
}

function lostAt(path: number): void {
  g.path.push(path);
  const part = CHEAT.slice(0, g.path.length);
  if (part.join(',') === g.path.join(',')) {
    // following the secret path
    if (g.path.length === CHEAT.length) {
      g.lost = false; g.neverLost = true; g.win = true;
      g.u = -ENTRY; g.v = 0; g.cheated = true; g.shovel = true;
    }
    g.lost = true;
    return;
  } else if (rint(40) < g.chance) {
    // back to the beach
    g.backToBeach = true; g.beach = true; g.lost = false; g.chance = 0;
    g.u = ENTRY; g.v = 1.2; g.path = [];
    g.events.push('screen');
    return;
  }
  g.lost = true; g.neverLost = false; g.straight = 0; g.chance++;
}

function generate(path: number): void {
  const old = g.tile;
  if (old.kind === KIND_JUNGLE) {
    // a landmark is saved and served again later, so the pirate feels lost
    if (old.saved > -1) { const copy = cloneTile(old); g.savedIndex = copy.saved; g.saved[copy.saved] = copy; }
    if (old.saved === -1 && (old.hat || (old.sign > -1 && g.saved.length < 3))) {
      const copy = cloneTile(old);
      copy.saved = g.saved.length as i32;
      g.saved.push(copy); g.savedIndex = copy.saved;
    }
  }
  if (g.beach) { g.tile = g.beachTile; return; }
  if (g.win) { g.tile = newTreasure(); return; }

  if (rint(11) > 6 && g.saved.length > 1) {
    const pool: Tile[] = [];
    for (let i = 0; i < g.saved.length; i++) if (i !== g.savedIndex) pool.push(g.saved[i]);
    g.tile = cloneTile(pool[rint(pool.length)]);
    g.savedIndex = -1;
    g.events.push('screen');
    return;
  }
  g.savedIndex = -1;
  const t = new Tile();
  t.seed = 20 + rint(1000);
  for (let k = 0; k < 4; k++) { t.top[k] = rint(3); t.bottom[k] = rint(3); }
  t.north = rint(4); t.south = rint(4);
  // the gap is a clearing in the wall: its two neighbours are always trees, never the thicket with eyes
  const eyes = rint(6);
  if (eyes < 4 && eyes !== t.north && t.top[eyes] === 2) { t.eyesU = SLOTS[eyes] + (rnd() - .5) * 4; t.eyesV = -(WALL + 2.2 + rnd()); }
  else if (eyes < 4 && eyes !== t.south && t.bottom[eyes] === 2) { t.eyesU = SLOTS[eyes] + (rnd() - .5) * 4; t.eyesV = WALL + 2.2 + rnd(); }
  if (!g.sword && rint(11) > 6) { t.sword = true; t.swordU = (rnd() - .5) * 20; }
  if (!g.hat && !t.sword && rint(11) > 6) { t.hat = true; t.hatU = (rnd() - .5) * 20; }
  if (!t.hat && !t.sword && rint(11) > 4) {
    const options = path === 0 ? [0, 1, 3] : path === 1 ? [0, 1, 2] : path === 2 ? [1, 2, 3] : [0, 2, 3];
    t.sign = options[rint(3)];
  }
  g.tile = t;
  g.events.push('screen');
}

/** The pirate starts to walk out of the scene by `code`: he keeps walking while the mist thickens, the scene changes behind it
 *  (takeExit) and he walks on into the new one. */
export function beginExit(code: i32): void {
  g.exitCode = code; g.glide = 0; g.switched = false; g.phase = 'glide'; g.moving = true;
  g.dir = code;
}

/** The scene changes: the pirate has left by `code` (0 up, 1 right, 2 down, 3 left); the caller captured the old frame first. */
export function takeExit(code: i32): void {
  if (code === 3) { g.u = ENTRY; lostAt(3); generate(3); }
  else if (code === 1) {
    g.u = -ENTRY; g.beach = false;
    if (!g.lost) {
      g.straight++;
      if (g.straight > 5) { g.win = true; g.u = -ENTRY; g.v = 0; }
    } else lostAt(1);
    generate(1);
  } else if (code === 0) { g.v = EDGE - .3; lostAt(0); generate(0); if (g.tile.kind === KIND_JUNGLE) g.u = SLOTS[g.tile.south]; }
  else { g.v = -EDGE + .3; lostAt(2); generate(2); if (g.tile.kind === KIND_JUNGLE) g.u = SLOTS[g.tile.north]; }
  if (g.tile.kind === KIND_BEACH && g.backToBeach) { g.u = ENTRY; g.v = 1.2; }
  g.moving = true;
  g.dir = code === 0 ? 0 : code === 1 ? 1 : code === 2 ? 2 : 3;
  if (g.backToBeach) g.dir = 3;
}

function footprint(dt: number, slow: boolean): void {
  if (!g.moving) return;
  g.stepTimer += dt;
  if (g.stepTimer < (slow ? .09 : .04)) return;
  g.stepTimer = 0;
  const side = g.step ? .26 : -.26;
  g.step = g.step ? 0 : 1;
  const horizontal = g.dir === 1 || g.dir === 3;
  const steps = g.tile.steps;
  steps.push(g.u + (horizontal ? 0 : side), g.v + (horizontal ? side : 0));
  if (steps.length > 900) steps.splice(0, 2);
}
let stepSound = 0;
function footsteps(dt: number): void {
  stepSound += dt;
  if (stepSound > .24) { stepSound = 0; g.events.push('step'); }
}

function pickups(): void {
  const t = g.tile;
  if (t.sword && Math.abs(g.u - t.swordU) < 1.1 && Math.abs(g.v - 1.5) < 1.9) { t.sword = false; g.sword = true; g.events.push('pickup'); }
  if (!g.hat && t.hat && Math.abs(g.u - t.hatU) < 1.2 && Math.abs(g.v - 1.5) < 1.9) { t.hat = false; g.hat = true; g.events.push('pickup'); }
  if (g.beach && t.shovel && Math.abs(g.u - 3.4) < 1.5 && Math.abs(g.v + 1.6) < 1.7) { t.shovel = false; g.shovel = true; g.events.push('pickup'); }
}

/** One step of the pirate under the player's hands. `du` and `dv` are -1, 0 or 1 on the screen's axes. Returns the exit taken, or -1. */
export function walk(dt: number, du: number, dv: number): i32 {
  g.time += dt;
  g.moving = false;
  if (g.beach && g.timerWave > 5) { g.timerWave = 0; g.events.push('wave'); }
  g.timerWave += dt;
  if (du === 0 && dv === 0) return -1;
  const len = Math.hypot(du, dv), t = g.tile;
  const sx = du / len * SPEED * dt, sy = dv / len * SPEED * dt;
  if (sx !== 0 && !blocked(t, g.u + sx, g.v)) { g.u += sx; g.moving = true; }
  if (sy !== 0 && !blocked(t, g.u, g.v + sy)) { g.v += sy; g.moving = true; }
  if (Math.abs(du) >= Math.abs(dv) && du !== 0) g.dir = du > 0 ? 1 : 3;
  else if (dv !== 0) g.dir = dv < 0 ? 0 : 2;
  footprint(dt, false); footsteps(dt);
  pickups();
  // the next tile starts where this one ends, so the thresholds differ by half a unit between the two directions: the pirate who has just crossed
  // is never already beyond the opposite edge of the tile he enters
  if (t.kind === KIND_BEACH) return g.u > HALF ? 1 : -1;
  if (g.u > HALF) return 1;
  if (g.u < -(HALF + .5)) return 3;
  if (g.v < -EDGE) return 0;
  if (g.v > EDGE + .6) return 2;
  return -1;
}

/** The pirate walks alone: back to the beach, or across the treasure island to its ending. */
export function walkAuto(dt: number): void {
  g.time += dt;
  g.moving = false;
  if (g.win && !g.backToBeach && Math.abs(g.v) > .02) g.v -= Math.sign(g.v) * Math.min(Math.abs(g.v), 3 * dt);   // onto the island's track
  if (g.backToBeach) {
    if (g.u > 8) { g.u -= 100 / 22.8 * dt; g.dir = 3; g.moving = true; footprint(dt, true); footsteps(dt); }
    else { g.backToBeach = false; g.phase = 'play'; }
    return;
  }
  if (!g.win) { g.phase = 'play'; return; }
  if (g.neverLost && (g.shovel || g.endShovel > 0)) {
    g.walkTo = -.18;
    if (g.u >= -3.5) { g.shovel = false; g.endShovel = 1; }
    if (g.u >= g.walkTo) {
      g.timerAnim += dt;
      if (g.timerAnim > .5) { if (!g.dug) { g.events.push('hit'); g.dug = true; } g.endShovel = 2; }
      if (g.timerAnim > 1.5) {
        g.dir = 2; g.endShovel = 0; g.shovel = true;
        if (g.cheated) { g.events.push('win'); g.end = 0; g.cheated = false; }
        if (g.end === -1) { g.events.push('win'); g.end = 3; }
      }
    }
    if (g.u >= -7.44 && g.sword) { g.events.push('hit'); g.sword = false; g.endSword = true; }
  }
  if (!g.neverLost) {
    g.walkTo = -1.6;
    if (g.u >= g.walkTo && g.end === -1) { g.events.push('empty'); g.end = 1; }
  }
  if (g.neverLost && !g.shovel && g.endShovel === 0) {
    g.walkTo = -.9;
    if (g.u >= g.walkTo && g.end === -1) { g.events.push('empty'); g.end = 2; g.dir = 2; }
    if (g.u >= -7.44 && g.sword) { g.events.push('hit'); g.sword = false; g.endSword = true; }
  }
  if (g.u <= g.walkTo) { g.u += AUTO_SPEED * dt; g.dir = 1; g.moving = true; footprint(dt, true); footsteps(dt); }
  if (g.end > -1) { g.endings[g.end] = true; g.phase = 'end'; }
}

export function endingsFound(): number {
  let n = 0;
  for (const e of g.endings) if (e) n++;
  return n;
}
export function tileHash(t: Tile, a: number, b: number): number { return hash(a + t.seed * .37, b + t.seed * .91); }

/* ---------- the world: tiles side by side ---------- */
// The tiles are placed in the world as they are met. East, north and south of the current tile the next one is generated by the rules a little
// before the pirate gets there (peekExit changes nothing), put where its gap lines up with the old one, and walked into without a cut.
// A tile that would land on tiles already there (a way back, the beach again) is a jump: the mist covers it (needsJump).
export const world: Tile[] = [];
export let worldVersion = 0;
let nextId = 1;
export const LOOK_U = 17, LOOK_V = 4;
/** Tiles that were placed or removed since the picture was last made from the world: their pixels must be baked again. */
export const dirty: Tile[] = [];

export function overlaps(a: Tile, b: Tile): boolean { return Math.abs(a.u0 - b.u0) < 2 * FOOT_W - .01 && Math.abs(a.v0 - b.v0) < 2 * FOOT_H - .01; }
export function startWorld(): void { dirty.length = 0; world.length = 0; nextId = 1; g.tile.u0 = 0; g.tile.v0 = 0; g.tile.id = nextId++; world.push(g.tile); worldVersion++; ghosts = [null, null, null, null]; }
/** Puts a tile in the world, removing the tiles it covers (never the one the pirate stands in). */
export function place(t: Tile): void {
  for (let i = world.length - 1; i >= 0; i--) if (world[i] !== g.tile && world[i] !== t && overlaps(world[i], t)) { dirty.push(world[i]); world.splice(i, 1); }
  if (t.id === 0) t.id = nextId++;
  if (world.indexOf(t) < 0) world.push(t);
  dirty.push(t);
  worldVersion++;
}
/** Forgets the tiles far from the pirate. */
export function prune(): void {
  for (let i = world.length - 1; i >= 0; i--) {
    const t = world[i];
    if (t !== g.tile && (Math.abs(t.u0 - g.tile.u0) > 5 * FOOT_W || Math.abs(t.v0 - g.tile.v0) > 3 * FOOT_H)) { dirty.push(t); world.splice(i, 1); worldVersion++; }
  }
  for (let k = 0; k < 4; k++) { const gh = ghosts[k]; if (gh !== null && world.indexOf(gh) < 0) ghosts[k] = null; }
}
/** Where the tile reached by exit `code` stands, so that its gap (or the track) lines up with the tile it comes from. */
export function placeBeside(from: Tile, next: Tile, code: i32): void {
  if (code === 1) { next.u0 = from.u0 + 2 * FOOT_W; next.v0 = from.v0; }
  else if (code === 3) { next.u0 = from.u0 - 2 * FOOT_W; next.v0 = from.v0; }
  else if (code === 0) { next.v0 = from.v0 - 2 * FOOT_H; next.u0 = from.u0 + SLOTS[from.north] - SLOTS[next.south]; }
  else { next.v0 = from.v0 + 2 * FOOT_H; next.u0 = from.u0 + SLOTS[from.south] - SLOTS[next.north]; }
}
function covers(t: Tile, except: Tile | null): boolean {
  for (const o of world) if (o !== g.tile && o !== except && overlaps(o, t)) return true;
  return false;
}

function cloneRun(): Run {
  const c = new Run();
  c.tile = g.tile; c.beachTile = g.beachTile; c.saved = g.saved.slice(0); c.savedIndex = g.savedIndex;
  c.u = g.u; c.v = g.v; c.dir = g.dir; c.moving = g.moving; c.step = g.step; c.stepTimer = g.stepTimer;
  c.lost = g.lost; c.win = g.win; c.beach = g.beach; c.backToBeach = g.backToBeach; c.straight = g.straight; c.chance = g.chance;
  c.sword = g.sword; c.hat = g.hat; c.shovel = g.shovel; c.neverLost = g.neverLost; c.cheated = g.cheated; c.endSword = g.endSword;
  c.endShovel = g.endShovel; c.dug = g.dug; c.end = g.end; c.path = g.path.slice(0); c.walkTo = g.walkTo; c.timerAnim = g.timerAnim; c.timerWave = g.timerWave;
  c.endings = g.endings.slice(0); c.complete = g.complete; c.completeTimeout = g.completeTimeout; c.time = g.time; c.phase = g.phase;
  c.events = g.events.slice(0); c.glide = g.glide; c.exitCode = g.exitCode; c.switched = g.switched;
  return c;
}
function restoreRun(c: Run): void {
  g.tile = c.tile; g.beachTile = c.beachTile; g.saved = c.saved; g.savedIndex = c.savedIndex;
  g.u = c.u; g.v = c.v; g.dir = c.dir; g.moving = c.moving; g.step = c.step; g.stepTimer = c.stepTimer;
  g.lost = c.lost; g.win = c.win; g.beach = c.beach; g.backToBeach = c.backToBeach; g.straight = c.straight; g.chance = c.chance;
  g.sword = c.sword; g.hat = c.hat; g.shovel = c.shovel; g.neverLost = c.neverLost; g.cheated = c.cheated; g.endSword = c.endSword;
  g.endShovel = c.endShovel; g.dug = c.dug; g.end = c.end; g.path = c.path; g.walkTo = c.walkTo; g.timerAnim = c.timerAnim; g.timerWave = c.timerWave;
  g.endings = c.endings; g.complete = c.complete; g.completeTimeout = c.completeTimeout; g.time = c.time; g.phase = c.phase;
  g.events = c.events; g.glide = c.glide; g.exitCode = c.exitCode; g.switched = c.switched;
}
/** The tile the rules would give for exit `code` right now, and where it would stand; nothing changes (the generator's state is put back). */
export function peekExit(code: i32): Tile {
  const before = cloneRun(), keep = seed, from = g.tile;
  takeExit(code);
  const t = g.tile, jump = g.backToBeach;
  restoreRun(before); seed = keep;
  placeBeside(from, t, code);
  if (jump) t.id = -1;   // marks a tile that comes by a jump
  return t;
}
function sameTile(a: Tile, b: Tile): boolean {
  return a.kind === b.kind && a.seed === b.seed && a.north === b.north && a.south === b.south && a.sign === b.sign && a.sword === b.sword && a.hat === b.hat &&
    a.swordU === b.swordU && a.hatU === b.hatU && a.top.join(',') === b.top.join(',') && a.bottom.join(',') === b.bottom.join(',');
}
let ghosts: Array<Tile | null> = [null, null, null, null];
/** Whether leaving by `code` now is a jump: the rules send the pirate somewhere else (the beach) or the new tile would land on tiles in view. */
export function needsJump(code: i32): boolean {
  const gh = ghosts[code];
  if (gh !== null) return false;
  const t = peekExit(code);
  return t.id === -1 || covers(t, null);
}
/** The pirate comes near an exit: the tile behind it is generated and placed, so that it is baked before it is seen. Returns true when the world changed. */
export function lookahead(): boolean {
  if (g.tile.kind === KIND_TREASURE || g.phase !== 'play') return false;
  const want: i32[] = [];
  if (g.u > HALF - LOOK_U) want.push(1);
  if (g.tile.kind !== KIND_BEACH) {
    if (g.u < -(HALF - LOOK_U)) want.push(3);
    if (g.v < -(WALL + LOOK_V)) want.push(0);
    if (g.v > WALL + LOOK_V) want.push(2);
  }
  let changed = false;
  for (const code of want) {
    if (ghosts[code] !== null) continue;
    const t = peekExit(code);
    if (t.id === -1 || covers(t, null)) { t.id = 0; continue; }
    ghosts[code] = t; t.id = 0; place(t); changed = true;
  }
  return changed;
}
/** The pirate has left the tile by `code`: the rules run for real. A tile that was already standing there (the ghost) is kept if it is what they give. Returns the tile. */
export function crossExit(code: i32): void {
  const gu = g.tile.u0 + g.u, gv = g.tile.v0 + g.v, from = g.tile, ghost = ghosts[code];
  takeExit(code);
  let t = g.tile;
  if (ghost !== null && sameTile(ghost, t)) { t = ghost; g.tile = ghost; }
  else {
    if (ghost !== null) { const i = world.indexOf(ghost); if (i >= 0) { dirty.push(ghost); world.splice(i, 1); } }
    placeBeside(from, t, code); t.id = 0;
    place(t);
  }
  ghosts = [null, null, null, null];
  if (g.backToBeach) { t.u0 = gu - g.u; t.v0 = gv - g.v; place(t); }   // the beach arrives where the pirate is, at its own end of the sand
  else { g.u = gu - t.u0; g.v = gv - t.v0; }
  prune(); worldVersion++;
}
