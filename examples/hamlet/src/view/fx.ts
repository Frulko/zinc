import { project, plot, sphere, capsule, castShadow, ripple, hash, rgb, Color } from '../pixel';
import { TREE_HEIGHT } from './models';
import { fxQueue, FxEvent, FX_LEAVES, FX_FELL, FX_CHIPS, FX_SPLASH, CHIP_SPARK, CHIP_FLOUR } from '../world/fx';
import { season } from '../rules/season';
import { sound } from '../audio';

// The transient layer of the village: what the work throws up. Each effect is a pure function of its age (no per-particle state): the event gives the origin
// and a seed, a hash of the particle number gives its velocity. Effects live on the view's clock; the frame redraws only the rectangles around them.
interface Live { e: FxEvent; t0: number; sounded: boolean; }
let live: Live[] = [];
const LIFE: number[] = [1.1, 2.6, .7, 1.0];
const GRAVITY = 7;
/** One row per tree variant of models.ts (world.tree - 1): the three pines of growing height, then the broad-leaved tree. `crowns` are (height fraction, radius) of the
 *  foliage masses along the trunk; `delay` the shiver before it goes, `fall` the seconds of the fall (a taller tree is slower and lands harder: `thump` is the volume of
 *  the sound); `leaves` indexes LEAVES by season (needles hardly change, the broad leaf goes bright, green, russet, bare). */
interface TreeFx { crowns: number[][]; trunk: number; green: Color; delay: number; fall: number; thump: number; leaves: number[]; burst: number; }
const TREE_FX: TreeFx[] = [
  { crowns: [[.4, .62], [.58, .5], [.76, .34], [.92, .2]], trunk: .11, green: [52, 96, 60], delay: .16, fall: .7, thump: .5, leaves: [0, 0, 0, 1], burst: 8 },
  { crowns: [[.4, .7], [.58, .58], [.76, .4], [.92, .22]], trunk: .13, green: [60, 106, 64], delay: .18, fall: .8, thump: .65, leaves: [0, 0, 0, 1], burst: 11 },
  { crowns: [[.38, .78], [.56, .66], [.74, .48], [.92, .26]], trunk: .15, green: [46, 86, 58], delay: .2, fall: .9, thump: .8, leaves: [0, 0, 0, 1], burst: 14 },
  { crowns: [[.5, .9], [.7, .8], [.88, .55]], trunk: .1, green: [70, 110, 60], delay: .15, fall: .65, thump: .45, leaves: [2, 3, 4, 5], burst: 16 },
];
const REST = .8;                                                  // seconds a felled tree lies before it is gone
const WOOD: Color = [120, 86, 58], FISH: Color = [150, 178, 166];
const solid = (c: Color): ((z: number) => Color) => (): Color => c;
/** Falling leaves by kind: needles, frosted needles, spring, summer, autumn, bare twigs. Each entry is the palette of the particles. */
const LEAVES: number[][][] = [
  [[52, 96, 60], [40, 78, 52], [76, 118, 66]], [[120, 150, 130], [90, 120, 100], [200, 214, 214]],
  [[140, 190, 90], [170, 210, 110], [220, 200, 220]], [[70, 124, 66], [100, 150, 70], [54, 100, 60]],
  [[214, 140, 50], [190, 90, 40], [226, 190, 70]], [[120, 96, 70], [96, 78, 60], [150, 120, 90]],
];
const leavesOf = (m: number): number[][] => LEAVES[TREE_FX[m].leaves[season()]];
/** Particle palettes of FX_CHIPS: stone, clay, ore, berries, sparks, chaff, sawdust, flour, dust. */
const CHIP_COLORS: number[][][] = [
  [[190, 186, 172], [150, 146, 136], [120, 118, 112]], [[190, 112, 80], [160, 90, 64], [210, 140, 100]], [[90, 90, 98], [60, 60, 68], [220, 130, 60]],
  [[200, 54, 70], [160, 40, 60], [230, 90, 90]], [[255, 214, 90], [255, 150, 50], [255, 244, 190]], [[226, 196, 100], [200, 170, 80], [244, 224, 150]],
  [[222, 190, 140], [196, 160, 110], [240, 214, 170]], [[244, 240, 228], [226, 222, 208], [255, 255, 250]], [[168, 140, 104], [146, 120, 90], [190, 164, 128]],
];
const SPEED: number[] = [1.6, 1.4, 1.6, 1.0, 2.4, 1.2, 1.0, .9, .8];

/** Where a tree stands inside its tile (the scenery's offset). */
const treeX = (t: number, x: number): number => x + (hash(t, 7) - .5) * .7;
const treeY = (t: number, y: number): number => y + (hash(t, 8) - .5) * .7;
// Work chips (palette from sparks to flour) start in front of the worker, `n` being his heading; a splash is 2.1 ahead of the angler, at the bobber.
const inFront = (e: FxEvent): number => e.kind === FX_SPLASH ? 2.1 : e.kind === FX_CHIPS && e.m >= CHIP_SPARK && e.m <= CHIP_FLOUR ? .6 : 0;
const heading = (e: FxEvent): number => e.kind === FX_SPLASH ? e.a : e.n;
const originX = (e: FxEvent): number => e.kind === FX_LEAVES || e.kind === FX_FELL ? treeX(e.n, e.x) : e.x + Math.cos(heading(e)) * inFront(e);
const originY = (e: FxEvent): number => e.kind === FX_LEAVES || e.kind === FX_FELL ? treeY(e.n, e.y) : e.y + Math.sin(heading(e)) * inFront(e);

/** Takes what the simulation raised since last frame and forgets the effects that ended. */
export function drainFx(time: number): void {
  for (const e of fxQueue) live.push({ e, t0: time, sounded: false });
  fxQueue.length = 0;
  live = live.filter((f: Live): boolean => { const age = time - f.t0; return age >= 0 && age < (f.e.kind === FX_FELL ? TREE_FX[f.e.m].delay + TREE_FX[f.e.m].fall + REST : LIFE[f.e.kind]); });
}

/** The rectangles to redraw: `add(sx, sy, left, up, right, down)` in screen pixels around each effect. */
export function fxDirty(add: (sx: number, sy: number, left: number, up: number, right: number, down: number) => void, scale: number): void {
  for (const f of live) {
    const a = project(originX(f.e), originY(f.e), 0);
    if (f.e.kind === FX_FELL) add(a.sx, a.sy, 3.8 * scale, 4.4 * scale, 3.8 * scale, 2.4 * scale);
    else add(a.sx, a.sy, 2 * scale, 3.4 * scale, 2 * scale, 1.6 * scale);
  }
}

/** Bits that fly from a point and fall back: `n` particles of `colors`, each a pixel (a leaf is two). */
function scatter(x: number, y: number, z: number, age: number, n: number, speed: number, up: number, colors: number[][], seed: number, flutter: boolean): void {
  for (let k = 0; k < n; k++) {
    const ang = hash(k, seed) * 6.283, v = (.3 + hash(k, seed + 1)) * speed, vz = (.4 + hash(k, seed + 2)) * up;
    const g = flutter ? GRAVITY * .08 : GRAVITY;
    const pz = z + vz * age - .5 * g * age * age;
    if (pz < 0) continue;
    const c = colors[Math.floor(hash(k, seed + 3) * colors.length)], col = rgb(c[0], c[1], c[2]);
    const px = x + Math.cos(ang) * v * age + (flutter ? Math.sin(age * 7 + k) * .12 : 0), py = y + Math.sin(ang) * v * age;
    plot(px, py, pz, col);
    if (flutter) plot(px + .05, py, pz, col);
  }
}

/** The solid parts, drawn with the actors (lit, shadowed, edged): the felled tree and the jumping fish. */
export function drawFxBodies(time: number): void {
  for (const f of live) {
    const e = f.e, age = time - f.t0, ox = originX(e), oy = originY(e);
    if (e.kind === FX_FELL) {
      const fx = TREE_FX[e.m], h = TREE_HEIGHT[e.m], dx = Math.cos(e.a), dy = Math.sin(e.a), landed = fx.delay + fx.fall;
      const u = Math.max(0, Math.min(1, (age - fx.delay) / fx.fall));
      // a shiver before it goes, then it gathers speed and settles with a small bounce
      let theta = age < fx.delay ? Math.sin(age * 70) * .035 : 1.5 * u * u;
      if (u >= 1) theta = 1.5 - Math.max(0, Math.sin((age - landed) * 22)) * .05 * Math.exp(-(age - landed) * 5);
      const at = (s: number): number[] => [ox + dx * h * s * Math.sin(theta), oy + dy * h * s * Math.sin(theta), Math.max(.12, h * s * Math.cos(theta))];
      const low = at(.4);
      capsule([ox, oy, 0], [low[0], low[1], low[2]], fx.trunk, fx.trunk * .7, solid(WOOD), 'solid');
      for (const [s, r] of fx.crowns) { const p = at(s); sphere(p[0], p[1], p[2] + r * .3, r, fx.green, 'rough'); }
      for (const s of [.3, .6, .9]) { const p = at(s); castShadow(p[0], p[1], p[2], .35 + (1 - s) * .2); }
      if (!f.sounded && age >= landed) { f.sounded = true; sound('fall', fx.thump); }
    } else if (e.kind === FX_SPLASH) {
      const t = age / .7;
      if (t < 1) {
        const z = Math.sin(t * Math.PI) * .9, dz = Math.cos(t * Math.PI) * .9;
        capsule([ox, oy, z + .05], [ox - .22, oy, z + .05 - dz * .12], .06, .03, solid(FISH), 'solid');
      }
    }
  }
}

/** The loose pixels and rings, drawn last (not lit, not edged): leaves, chips, droplets, the ring where the fish fell back. */
export function drawFxSparks(time: number): void {
  for (const f of live) {
    const e = f.e, age = time - f.t0, ox = originX(e), oy = originY(e), seed = e.n * 3 + Math.floor(f.t0 * 10) % 17;
    if (e.kind === FX_LEAVES) scatter(ox, oy, 2.3, age, 7, .5, .6, leavesOf(e.m), seed, true);
    else if (e.kind === FX_CHIPS) scatter(ox, oy, .5, age, e.a, SPEED[e.m], 2.6, CHIP_COLORS[e.m], seed, false);
    else if (e.kind === FX_FELL) {
      const fx = TREE_FX[e.m], hit = age - (fx.delay + fx.fall - .1);
      if (hit > 0) {                                              // the crown hits the ground: leaves burst, then dust where it lay
        const h = TREE_HEIGHT[e.m], dx = Math.cos(e.a), dy = Math.sin(e.a);
        scatter(ox + dx * h * .8, oy + dy * h * .8, .3, hit, fx.burst, 1.4, 1.8, leavesOf(e.m), seed, true);
        scatter(ox + dx * h * .4, oy + dy * h * .4, .1, hit, 8, 1.1, .8, CHIP_COLORS[8], seed + 9, false);
      }
    } else if (e.kind === FX_SPLASH) {
      const t = age / .7;
      if (t >= .85 || t < 0) { const q = Math.max(0, age - .6); ripple(ox, oy, .12 + q * 1.4, rgb(214, 232, 220), true); if (q > .15) ripple(ox, oy, .12 + (q - .15) * 1.4, rgb(143, 177, 146), true); }
      if (t > .1) scatter(ox, oy, .05, Math.max(0, age - .5), 9, .5, 1.6, [[230, 244, 240], [190, 220, 224]], seed, false);
    }
  }
}
