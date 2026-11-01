import { W, H, project, sphere, capsule, rgb, hash, waterPoint, ripple, Color } from '../pixel';
import { TERRAIN_WATER, TILE } from '../constants';
import { world, tileX, tileY, tileI, tileJ, neighbor } from '../world/world';
import { economy } from '../world/economy';
import { season } from '../rules/season';
import { settings } from '../settings';
import { TREE_HEIGHT } from './models';

// The life of the sky and the water, drawn only (no state, nothing saved or hashed): every position is a pure function of the view clock and of the map, so a screenshot
// at a given time shows the same picture. Toggled with the fx setting. Crows go from tree to tree and roof to roof of the forest country, gulls rest on the water and cross
// the lakes, swallows dart low over the fields in the warm months, geese fly over in a V in spring and autumn; ducks paddle on the water (not in winter), their wake behind them;
// dark shoals of fish drift under the surface, more of them within the reach of a fishing hut.
const TAU = Math.PI * 2;
const CROW = 0, GULL = 1, SWALLOW = 2, GOOSE = 3;
const WINGS: number[] = [.2, .28, .16, .3], FLAP: number[] = [9, 5.5, 17, 4.5], BODY: number[] = [.08, .08, .055, .12];
const COLORS: Color[] = [[26, 26, 30], [238, 238, 232], [38, 50, 86], [140, 128, 112]];
const TIPS: Color[] = [[16, 16, 20], [84, 86, 94], [28, 36, 66], [70, 62, 54]];
const DUCK_BODY: Color = [138, 112, 84], DUCK_HEAD: Color = [36, 108, 70], DUCK_BEAK: Color = [232, 172, 40];
const FOAM = rgb(178, 206, 190), FISH = rgb(34, 66, 82);
const solid = (c: Color): ((z: number) => Color) => (): Color => c;

class Flock { kind: number = 0; n: number = 3; period: number = 40; offset: number = 0; id: number = 0; }
let seen = -1;
let forest: number[] = [], water: number[] = [], roofs: number[] = [], nearHut: number[] = [], flocks: Flock[] = [], ducks = 0, shoals = 0;

/** What the map offers the animals, found again when the village changes: trees, open water (every neighbour water too), roofs, the water within reach of a fishing hut. */
function scan(): void {
  if (seen === world.revision) return;
  seen = world.revision;
  forest = []; water = []; roofs = []; nearHut = []; flocks = [];
  const huts: number[] = [];
  for (let t = 0; t < world.terrain.length; t++) {
    if (world.tree[t] !== 0 && world.build[t] < 0) forest.push(t);
    if (world.terrain[t] !== TERRAIN_WATER) continue;
    let inner = true;
    for (let d = 0; d < 4; d++) { const v = neighbor(t, d); if (v < 0 || world.terrain[v] !== TERRAIN_WATER) inner = false; }
    if (inner) water.push(t);
  }
  for (const b of world.buildings) if (b.alive) { const t = b.j * world.size + b.i; roofs.push(t); if (economy.buildings[b.type].gather === 'shore') huts.push(t); }
  for (const w of water) for (const h of huts) if (Math.abs(tileI(w) - tileI(h)) + Math.abs(tileJ(w) - tileJ(h)) <= 9) { nearHut.push(w); break; }
  const scale = 1 + Math.floor(world.size / 32);
  const add = (kind: number, count: number, n: number, period: number): void => { for (let k = 0; k < count; k++) { const f = new Flock(); f.kind = kind; f.n = n + k % 2; f.period = period + k * 11; f.offset = hash(flocks.length, 41) * 90; f.id = flocks.length; flocks.push(f); } };
  if (forest.length > 12) add(CROW, scale + 1, 3, 46);
  if (water.length > 6) add(GULL, scale, 3, 52);
  add(SWALLOW, scale, 4, 34);
  add(GOOSE, 1, 7, 110);
  ducks = water.length >= 6 ? Math.min(2 + scale, Math.floor(water.length / 8) + 1) : 0;
  shoals = water.length >= 4 ? Math.min(5 + scale, Math.floor(water.length / 6) + 2) + (nearHut.length > 0 ? 2 : 0) : 0;
}

const ease = (v: number): number => v * v * (3 - 2 * v);
const clamp01 = (v: number): number => v < 0 ? 0 : v > 1 ? 1 : v;
const SPOT: number[] = [0, 0, 0];
/** Where a flock rests on its `c`-th stop: a tree top, a roof, or (the gulls) the water. False when the map has nothing for it. */
function spot(f: Flock, c: number): boolean {
  const h = hash(f.id * 7 + c, 3), g = hash(c, f.id + 9);
  if (f.kind === GULL && water.length > 0 && g < .7) { const t = water[Math.floor(h * water.length)]; SPOT[0] = tileX(t); SPOT[1] = tileY(t); SPOT[2] = .08; return true; }
  if (roofs.length > 0 && (forest.length === 0 || g < .4)) { const t = roofs[Math.floor(h * roofs.length)]; SPOT[0] = tileX(t) + (g - .5) * .6; SPOT[1] = tileY(t) + (h - .5) * .6; SPOT[2] = 2.5; return true; }
  if (forest.length > 0) { const t = forest[Math.floor(h * forest.length)]; SPOT[0] = tileX(t) + (g - .5) * .5; SPOT[1] = tileY(t) + (h - .5) * .5; SPOT[2] = TREE_HEIGHT[Math.max(0, Math.min(3, world.tree[t] - 1))] * .9; return true; }
  return false;
}

/** Calls `put(x, y, z, yaw, perched, kind, member)` for every bird of the sky at `time`. */
function birds(time: number, put: (x: number, y: number, z: number, yaw: number, perched: boolean, kind: number, m: number) => void): void {
  const s = season();
  for (const f of flocks) {
    const clock = (time + f.offset) / f.period, cyc = Math.floor(clock), u = clock - cyc;
    if (f.kind === SWALLOW) {                                              // low and quick over a patch of the map, spring to summer
      if (s > 1) continue;
      const cx = (hash(cyc, f.id + 3) - .5) * world.size * TILE * .8, cy = (hash(f.id + 5, cyc) - .5) * world.size * TILE * .8;
      for (let m = 0; m < f.n; m++) {
        const a = time * 1.1 + m * .8, b = a + .05;
        const x = cx + Math.sin(a) * 6, y = cy + Math.sin(a * 1.6 + m) * 3.2, z = 1.3 + .7 * Math.sin(a * 1.3 + m * 2), x2 = cx + Math.sin(b) * 6, y2 = cy + Math.sin(b * 1.6 + m) * 3.2;
        put(x, y, z, Math.atan2(y2 - y, x2 - x), false, SWALLOW, m);
      }
      continue;
    }
    if (f.kind === GOOSE) {                                                // a V over the whole map, spring (going back north) and autumn (leaving south)
      if (s !== 0 && s !== 2) continue;
      const span = world.size * TILE + 16, dur = span / 5 / f.period;
      if (u > dur) continue;
      const dir = s === 2 ? 1 : -1, lane = (hash(cyc, 77) - .5) * world.size * TILE * .6, pos = (u / dur - .5) * span * dir, yaw = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      for (let m = 0; m < f.n; m++) {
        const r = Math.ceil(m / 2), side = m % 2 === 1 ? 1 : -1, back = r * .9, lat = side * r * .8;
        put(lane + lat, pos - dir * back, 6 + Math.sin(time * 1.2 + m) * .15, yaw, false, GOOSE, m);
      }
      continue;
    }
    if (!spot(f, cyc)) continue;
    const ax = SPOT[0], ay = SPOT[1], az = SPOT[2];
    spot(f, cyc + 1);
    const bx = SPOT[0], by = SPOT[1], bz = SPOT[2], long = Math.sqrt((bx - ax) * (bx - ax) + (by - ay) * (by - ay)) > 3;
    const rest = .45;
    for (let m = 0; m < f.n; m++) {
      const mx = (hash(m, f.id + 11) - .5) * 1.2, my = (hash(f.id + 12, m) - .5) * 1.2, go = rest + m * .012, v = clamp01((u - go) / (1 - go));
      if (u < go) { put(ax + mx * (az > 1 ? .4 : 1), ay + my * (az > 1 ? .4 : 1), az, hash(m, cyc + f.id) * TAU, true, f.kind, m); continue; }
      const at = (w: number, out: number[]): void => {
        const k = ease(clamp01(w));
        let x = ax + (bx - ax) * k + mx * (1 - k) * .4, y = ay + (by - ay) * k + my * (1 - k) * .4, z = az + (bz - az) * k + Math.sin(clamp01(w) * Math.PI) * (2.4 + hash(m, 5) * .8);
        if (!long) { const a = clamp01(w) * TAU * 1.5 + m, e = Math.sin(clamp01(w) * Math.PI); x += Math.cos(a) * 2.8 * e; y += Math.sin(a) * 2.8 * e; }
        const rank = Math.ceil(m / 2), side = m % 2 === 1 ? 1 : -1;
        if (long) { const l = Math.sqrt((bx - ax) * (bx - ax) + (by - ay) * (by - ay)), hx = (bx - ax) / l, hy = (by - ay) / l, lift = Math.sin(clamp01(w) * Math.PI); x += (-hx * rank * .55 - hy * side * rank * .45) * lift; y += (-hy * rank * .55 + hx * side * rank * .45) * lift; }
        out[0] = x; out[1] = y; out[2] = z;
      };
      const p0: number[] = [0, 0, 0], p1: number[] = [0, 0, 0];
      at(v, p0); at(v + .02, p1);
      put(p0[0], p0[1], p0[2], Math.atan2(p1[1] - p0[1], p1[0] - p0[0]), v >= 1, f.kind, m);
    }
  }
}

/** Where duck `m` of group `g` swims. */
function duckAt(g: number, m: number, time: number, out: number[]): void {
  const t = water[Math.floor(hash(g, 55) * water.length)], k = .19 + hash(g, 56) * .1;
  out[0] = tileX(t) + Math.sin(time * k + g) * .8 + (m - 1) * .4 + Math.sin(time * .5 + m) * .12;
  out[1] = tileY(t) + Math.cos(time * (k + .04) + g * 2) * .8 + Math.sin(time * .43 + m * 2) * .1;
}
/** Where fish `i` of shoal `s` is. Half of the shoals, when a hut stands by the water, drift within its reach. */
function fishAt(s: number, i: number, time: number, out: number[]): void {
  const list = nearHut.length > 0 && s < 2 ? nearHut : water, t = list[Math.floor(hash(s, 61) * list.length)], a = time * .45 * (.7 + hash(s, i) * .3) + i * 1.7, r = .5 + hash(i, s + 3) * .35;
  out[0] = tileX(t) + Math.sin(time * .11 + s) * .8 + Math.cos(a) * r; out[1] = tileY(t) + Math.cos(time * .13 + s * 3) * .8 + Math.sin(a) * r * .7;
  out[2] = Math.atan2(Math.cos(a) * r * .7, -Math.sin(a) * r);
}

const on = (sx: number, sy: number, pad: number): boolean => sx > -pad && sx < W + pad && sy > -pad && sy < H + pad;
/** Calls `add(sx, sy, left, up, right, down)` with the screen rectangle each bird, duck and shoal needs redrawn (`scale` = pixels per unit). */
export function wildlifeDirty(add: (sx: number, sy: number, l: number, u: number, r: number, d: number) => void, scale: number, time: number): void {
  if (!settings.fx) return;
  scan();
  birds(time, (x: number, y: number, z: number, _yaw: number, perched: boolean, kind: number, _m: number): void => {
    const a = project(x, y, z), w = (perched ? .2 : WINGS[kind] + .15) * scale;
    if (on(a.sx, a.sy, 12)) add(a.sx, a.sy, w, w * .8 + 1, w, w * .8);
  });
  if (season() === 3) return;
  const at: number[] = [0, 0, 0];
  for (let g = 0; g < ducks; g++) for (let m = 0; m < 3; m++) { duckAt(g, m, time, at); const a = project(at[0], at[1], 0); if (on(a.sx, a.sy, 16)) add(a.sx, a.sy, 1.1 * scale, .5 * scale, 1.1 * scale, .6 * scale); }
  for (let s = 0; s < shoals; s++) { fishAt(s, 0, time, at); const a = project(at[0], at[1], 0); if (on(a.sx, a.sy, 30)) add(a.sx, a.sy, 1.7 * scale, 1.2 * scale, 1.7 * scale, 1.2 * scale); }
}

function drawBird(x: number, y: number, z: number, yaw: number, perched: boolean, kind: number, m: number, time: number): void {
  const fx = Math.cos(yaw), fy = Math.sin(yaw), sx = -fy, sy = fx, c = COLORS[kind], r = BODY[kind];
  if (perched) {
    const peck = Math.sin(time * 2.1 + m * 3) > .85 ? .04 : 0;
    sphere(x, y, z + r, r, c, 'solid'); sphere(x + fx * r * 1.1, y + fy * r * 1.1, z + r * 1.9 - peck, r * .65, kind === GULL ? c : TIPS[kind], 'solid');
    capsule([x, y, z + r], [x - fx * r * 2.2, y - fy * r * 2.2, z + r * .7], r * .5, r * .2, solid(TIPS[kind]), 'solid');
    return;
  }
  const flap = Math.sin(time * FLAP[kind] + m * 1.3) * .5 + (kind === GULL && Math.sin(time * .5 + m) > .3 ? .5 : 0), w = WINGS[kind];       // a gull now and then glides
  sphere(x, y, z, r, c, 'solid'); sphere(x + fx * r * 1.3, y + fy * r * 1.3, z + r * .2, r * .6, kind === SWALLOW ? [226, 220, 200] : c, 'solid');
  capsule([x, y, z], [x - fx * r * 2.6, y - fy * r * 2.6, z - r * .3], r * .5, r * .15, solid(TIPS[kind]), 'solid');
  for (const side of [-1, 1]) {
    const tip: number[] = [x + sx * side * w - fx * w * .3, y + sy * side * w - fy * w * .3, z + flap * w * .9];
    capsule([x, y, z], tip, r * .55, r * .18, solid(c), 'solid');
    capsule(tip, [tip[0] + sx * side * .03, tip[1] + sy * side * .03, tip[2]], r * .22, r * .18, solid(TIPS[kind]), 'solid');
  }
}
function drawDuck(x: number, y: number, yaw: number, time: number, m: number): void {
  const fx = Math.cos(yaw), fy = Math.sin(yaw), sx = -fy, sy = fx, bob = .05 + Math.sin(time * 1.7 + m) * .01;
  capsule([x - fx * .12, y - fy * .12, bob], [x + fx * .1, y + fy * .1, bob + .01], .085, .075, solid(DUCK_BODY), 'solid');
  sphere(x + fx * .17, y + fy * .17, bob + .13, .05, DUCK_HEAD, 'solid');
  capsule([x + fx * .2, y + fy * .2, bob + .12], [x + fx * .27, y + fy * .27, bob + .1], .018, .012, solid(DUCK_BEAK), 'solid');
  for (let k = 1; k <= 6; k++) for (const side of [-1, 1]) waterPoint(x - fx * (.12 + k * .17) + sx * side * k * .075, y - fy * (.12 + k * .17) + sy * side * k * .075, FOAM);   // the V of its wake
}
/** Draws the birds of the sky, the ducks on the water and the fish under it. */
export function drawWildlife(time: number): void {
  if (!settings.fx) return;
  scan();
  birds(time, (x: number, y: number, z: number, yaw: number, perched: boolean, kind: number, m: number): void => {
    const a = project(x, y, z);
    if (on(a.sx, a.sy, 12)) drawBird(x, y, z, yaw, perched, kind, m, time);
  });
  if (season() === 3) return;                                              // the water is iced over: no duck, and the fish are out of sight
  const at: number[] = [0, 0, 0], nx: number[] = [0, 0, 0];
  for (let g = 0; g < ducks; g++) for (let m = 0; m < 3; m++) {
    duckAt(g, m, time, at); duckAt(g, m, time + .1, nx);
    const a = project(at[0], at[1], 0);
    if (on(a.sx, a.sy, 16)) drawDuck(at[0], at[1], Math.atan2(nx[1] - at[1], nx[0] - at[0]), time, m);
  }
  for (let s = 0; s < shoals; s++) {
    fishAt(s, 0, time, at);
    const a = project(at[0], at[1], 0);
    if (!on(a.sx, a.sy, 30)) continue;
    for (let i = 0; i < 6; i++) {
      fishAt(s, i, time, at);
      const fx = Math.cos(at[2]), fy = Math.sin(at[2]);
      for (let k = 0; k < 4; k++) waterPoint(at[0] - fx * k * .1, at[1] - fy * k * .1, FISH);
      waterPoint(at[0] - fx * .15 + fy * .05, at[1] - fy * .15 - fx * .05, FISH);
    }
    const clock = time / 17 + hash(s, 62) * 9, jump = clock - Math.floor(clock);
    if (jump < .05) { fishAt(s, 0, time, at); ripple(at[0], at[1], jump * 8, FOAM, true); }   // a fish breaks the surface
  }
}
