import { Color, Vec3, SIN, COS, R2, rgb, rampOf, clamp, hash, plot, sphere, capsule } from '../renderer';

// A long white vessel in the spirit of the great film: a command sphere, a spine of tanks and trusses, folded radiators, one engine.
// It is built from the renderer's own volumes in a local frame (s along the axis, p and q across it), turned by a roll and a slow sway.
const WHITE: Color = [232, 230, 222], CREAM: Color = [214, 210, 198], GREY: Color = [150, 148, 158], DARK: Color = [86, 84, 96], WINDOW: Color = [34, 38, 56];
const PLATE: Color = [188, 186, 196];
export const LENGTH = 13.8;
const HEAD = 13.0;
const K = 1.35;            // one ship unit in world units

export interface Ship { x: number; y: number; z: number; roll: number; time: number; kind: number; }
const o: Vec3 = [0, 0, 0], a: Vec3 = [1, 0, 0], e1: Vec3 = [0, 1, 0], e2: Vec3 = [0, 0, 1];

const cross = (u: Vec3, v: Vec3): Vec3 => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
const unit = (v: Vec3): Vec3 => { const n = Math.hypot(v[0], v[1], v[2]); return [v[0] / n, v[1] / n, v[2] / n]; };
const P = (s: number, p: number, q: number): Vec3 => [o[0] + (a[0] * (s - LENGTH / 2) + e1[0] * p + e2[0] * q) * K, o[1] + (a[1] * (s - LENGTH / 2) + e1[1] * p + e2[1] * q) * K, o[2] + (a[2] * (s - LENGTH / 2) + e1[2] * p + e2[2] * q) * K];
const ball = (c: Vec3, r: number, color: Color, mode: string): void => sphere(c[0], c[1], c[2], r * K, color, mode);
const bar = (u: Vec3, v: Vec3, r0: number, r1: number, f: (z: number) => Color, mode: string): void => capsule(u, v, r0 * K, r1 * K, f, mode);
const tone = (c: Color) => (): Color => c;
const white = tone(WHITE), cream = tone(CREAM), grey = tone(GREY), dark = tone(DARK);

function pose(ship: Ship): void {
  const t = ship.time;
  if (ship.kind > 0) {
    // the starship and the freighter turn on themselves, about their own vertical axis, tipped a little toward us
    const up = unit([.2 + Math.sin(t * .27) * .04, .2, 1]);
    const h0: Vec3 = [1, -1, 0], d = h0[0] * up[0] + h0[1] * up[1] + h0[2] * up[2];
    const h1 = unit([h0[0] - up[0] * d, h0[1] - up[1] * d, h0[2] - up[2] * d]), h2 = cross(up, h1);
    const c = Math.cos(ship.roll), s = Math.sin(ship.roll);
    for (let i = 0; i < 3; i++) a[i] = h1[i] * c + h2[i] * s;
    const side = cross(up, [a[0], a[1], a[2]]);
    for (let i = 0; i < 3; i++) { e1[i] = side[i]; e2[i] = up[i]; }
    o[0] = ship.x + Math.sin(t * .17) * .3; o[1] = ship.y + Math.cos(t * .21) * .3; o[2] = ship.z + Math.sin(t * .6) * .3;
    return;
  }
  const axis = unit([1 + Math.sin(t * .23) * .05, -1, .22 + Math.sin(t * .31) * .07]);
  const b1 = unit(cross(axis, [0, 0, 1])), b2 = cross(axis, b1);
  const c = Math.cos(ship.roll), s = Math.sin(ship.roll);
  for (let i = 0; i < 3; i++) { a[i] = axis[i]; e1[i] = b1[i] * c + b2[i] * s; e2[i] = -b1[i] * s + b2[i] * c; }
  o[0] = ship.x + Math.sin(t * .17) * .35; o[1] = ship.y + Math.cos(t * .21) * .35; o[2] = ship.z + Math.sin(t * .6) * .3;
}

/** A lit flat plate (the radiators): points on a grid, shaded by the plate's own normal with the renderer's light, faint ribs across. */
function shades(n: Vec3, color: Color): u32[] {
  let sx = (n[0] - n[1]) / R2, vb = (n[0] + n[1]) / R2, sy = vb * SIN - n[2] * COS, sz = vb * COS + n[2] * SIN;
  if (sz < 0) { sx = -sx; sy = -sy; sz = -sz; }
  const l = clamp(-.55 * sx - .6 * sy + .58 * sz, 0, 1), ramp = rampOf(color);
  return [ramp[clamp(Math.floor(l * 4.4 + .2), 1, 4)], ramp[clamp(Math.floor(l * 4.4 - .8), 0, 3)]];
}

/** A lit round plate: a saucer face or a wing, shaded by its normal, darker toward its rim. */
function disc(c: Vec3, n: Vec3, u: Vec3, v: Vec3, r: number, color: Color): void {
  const tone = shades(n, color);
  for (let rr = 0; rr <= r; rr += .045) {
    const steps = Math.ceil(6.2832 * rr / .045) + 1;
    for (let k = 0; k < steps; k++) {
      const t = k * 6.2832 / steps, cu = Math.cos(t) * rr, cv = Math.sin(t) * rr;
      plot(c[0] + u[0] * cu + v[0] * cv, c[1] + u[1] * cu + v[1] * cv, c[2] + u[2] * cu + v[2] * cv, rr > r - .09 ? tone[1] : tone[0]);
    }
  }
}

function plate(origin: Vec3, u: Vec3, v: Vec3, color: Color): void {
  let n = unit(cross(u, v));
  let sx = (n[0] - n[1]) / R2, vb = (n[0] + n[1]) / R2, sy = vb * SIN - n[2] * COS, sz = vb * COS + n[2] * SIN;
  if (sz < 0) { sx = -sx; sy = -sy; sz = -sz; }
  const l = clamp(-.55 * sx - .6 * sy + .58 * sz, 0, 1);
  const ramp = rampOf(color), lit = ramp[clamp(Math.floor(l * 4.4 + .2), 1, 4)], rib = ramp[clamp(Math.floor(l * 4.4 - .8), 0, 3)];
  const nu = Math.ceil(Math.hypot(u[0], u[1], u[2]) / .045), nv = Math.ceil(Math.hypot(v[0], v[1], v[2]) / .045);
  for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) {
    const f = i / nu, g = j / nv;
    plot(origin[0] + u[0] * f + v[0] * g, origin[1] + u[1] * f + v[1] * g, origin[2] + u[2] * f + v[2] * g, (i % 9 === 0 || j === 0 || j === nv) ? rib : lit);
  }
}


/** The vessel. `blink` is the stepped navigation light, `eye` how bright the red lens is (0 to 1). */
function drawDiscovery(blink: boolean, eye: number): Vec3 {
  // command sphere, with its ring of windows and the red lens
  const head = P(HEAD, 0, 0);
  ball(head, 1.6, WHITE, 'gloss');
  for (let k = 0; k < 6; k++) {
    const beta = k * Math.PI / 3 + .3, gamma = .95;
    const w = P(HEAD + Math.cos(gamma) * 1.62, Math.sin(gamma) * 1.62 * Math.cos(beta), Math.sin(gamma) * 1.62 * Math.sin(beta));
    ball(w, .17, WINDOW, 'solid');
  }
  const lens = P(HEAD + Math.cos(1.5) * 1.6, Math.sin(1.5) * 1.62, 0);
  ball(lens, .2, eye > .5 ? [255, 60, 44] : [168, 34, 30], 'gloss');
  const dishBase = P(HEAD, 0, 1.55), dishTip = P(HEAD, 0, 2.7);
  bar(dishBase, dishTip, .05, .05, grey, 'solid');
  ball(dishTip, .2, GREY, 'solid');
  // neck and cabin
  bar(P(11.6, 0, 0), P(9.8, 0, 0), .85, .85, white, 'solid');
  bar(P(9.8, 0, 0), P(7.4, 0, 0), .78, .78, cream, 'solid');
  // tanks on struts around the front of the spine
  for (let k = 0; k < 4; k++) {
    const d = Math.PI / 4 + k * Math.PI / 2, p = Math.cos(d) * 1.35, q = Math.sin(d) * 1.35;
    bar(P(8.0, 0, 0), P(8.0, p * .8, q * .8), .05, .05, grey, 'solid');
    const tank = P(8.0, p, q);
    ball(tank, .52, WHITE, 'solid');
  }
  // the spine, in ribbed sections
  for (let s = 7.4; s > 2.2; s -= 1.15) bar(P(s, 0, 0), P(Math.max(s - 1.15, 2.2), 0, 0), .34, .34, Math.floor(s / 1.15) % 2 ? cream : grey, 'solid');
  // four radiator plates in a cross, folded close to the engine
  for (let k = 0; k < 4; k++) {
    const d = k * Math.PI / 2 + Math.PI / 4;
    const dir: Vec3 = [e1[0] * Math.cos(d) + e2[0] * Math.sin(d), e1[1] * Math.cos(d) + e2[1] * Math.sin(d), e1[2] * Math.cos(d) + e2[2] * Math.sin(d)];
    const base = P(4.9, 0, 0);
    plate([base[0] + dir[0] * .3 * K, base[1] + dir[1] * .3 * K, base[2] + dir[2] * .3 * K], [-a[0] * 2.6 * K, -a[1] * 2.6 * K, -a[2] * 2.6 * K], [dir[0] * 2.3 * K, dir[1] * 2.3 * K, dir[2] * 2.3 * K], PLATE);
    const tip = P(3.9, Math.cos(d) * 2.6, Math.sin(d) * 2.6);
    ball(tip, .1, k === 0 ? (blink ? [255, 70, 56] : [120, 40, 40]) : k === 2 ? (blink ? [90, 230, 120] : [40, 90, 56]) : GREY, 'solid');
  }
  // engine collar and bell
  bar(P(2.2, 0, 0), P(1.5, 0, 0), .45, .6, dark, 'solid');
  bar(P(1.5, 0, 0), P(.2, 0, 0), .6, .98, dark, 'solid');
  const throat = P(.1, 0, 0);
  ball(throat, .45, [255, 176, 96], 'solid');
  return lens;
}

const HULL: Color = [214, 216, 222], PANEL: Color = [120, 124, 134], COPPER: Color = [214, 150, 80], FREIGHTER: Color = [200, 196, 184];
const hullTone = tone(HULL), freighterTone = tone(FREIGHTER), panelTone = tone(PANEL);
const along = (c: Vec3, u: Vec3, k: number): Vec3 => [c[0] + u[0] * k, c[1] + u[1] * k, c[2] + u[2] * k];

/** A saucer, a neck, an engineering hull and two nacelles on pylons: the starship of the other great series. */
function drawEnterprise(blink: boolean, glow: number): void {
  const c = P(9.4, 0, 1.0), r = 3.2 * K;
  disc(along(c, e2, .16 * K), e2, a, e1, r, HULL);
  disc(along(c, e2, -.16 * K), [-e2[0], -e2[1], -e2[2]], a, e1, r, HULL);
  for (let k = 0; k < 44; k++) {
    const t = k * 6.2832 / 44;
    ball([c[0] + (a[0] * Math.cos(t) + e1[0] * Math.sin(t)) * r, c[1] + (a[1] * Math.cos(t) + e1[1] * Math.sin(t)) * r, c[2] + (a[2] * Math.cos(t) + e1[2] * Math.sin(t)) * r], .2, k % 11 === 0 ? [236, 200, 110] : HULL, 'solid');
  }
  disc(along(c, e2, .32 * K), e2, a, e1, 1.7 * K, [196, 200, 210]);
  disc(along(c, e2, .46 * K), e2, a, e1, .95 * K, HULL);
  ball(P(9.4, 0, 1.55), .5, HULL, 'gloss');
  ball(P(6.3, 0, 1.0), .28, glow > .5 ? [255, 120, 80] : [190, 70, 60], 'solid');
  bar(P(8.8, 0, .8), P(7.6, 0, -1.0), .48, .5, hullTone, 'solid');
  bar(P(8.6, 0, -1.5), P(2.8, 0, -1.5), .66, .52, hullTone, 'solid');
  ball(P(8.7, 0, -1.5), .5, glow > .5 ? [255, 210, 130] : COPPER, 'gloss');
  for (const side of [-1, 1]) {
    bar(P(4.4, 0, -1.4), P(3.9, side * 2.4, .1), .15, .15, panelTone, 'solid');
    bar(P(6.4, side * 2.4, .1), P(.8, side * 2.4, .1), .42, .42, hullTone, 'solid');
    ball(P(6.5, side * 2.4, .1), .38, glow > .5 || blink ? [255, 96, 70] : [170, 52, 44], 'gloss');
    ball(P(.7, side * 2.4, .1), .3, [110, 170, 240], 'solid');
  }
}

/** A round freighter: flat disc, two forward mandibles with a notch between them, a cockpit tube off to one side, a dish, a row of engines. */
function drawFalcon(glow: number): void {
  const c = P(6.0, 0, 0), r = 3.6 * K;
  const dirs = (t: number, rad: number): Vec3 => [c[0] + (a[0] * Math.cos(t) + e1[0] * Math.sin(t)) * rad, c[1] + (a[1] * Math.cos(t) + e1[1] * Math.sin(t)) * rad, c[2] + (a[2] * Math.cos(t) + e1[2] * Math.sin(t)) * rad];
  disc(along(c, e2, .34 * K), e2, a, e1, r, FREIGHTER);
  disc(along(c, e2, -.34 * K), [-e2[0], -e2[1], -e2[2]], a, e1, r, FREIGHTER);
  // hull plating: dark rings and a worn patchwork on the top face
  for (const rad of [1.0, 2.2, 2.9]) for (let k = 0; k < 90; k++) { const p = dirs(k * 6.2832 / 90, rad * K); plot(p[0] + e2[0] * .36 * K, p[1] + e2[1] * .36 * K, p[2] + e2[2] * .36 * K, rgb(120, 118, 116)); }
  for (let k = 0; k < 26; k++) {
    const t = hash(k, 3) * 6.2832, rad = (.7 + hash(k, 5) * 2.5) * K;
    const p = dirs(t, rad);
    disc([p[0] + e2[0] * .37 * K, p[1] + e2[1] * .37 * K, p[2] + e2[2] * .37 * K], e2, a, e1, (.1 + hash(k, 7) * .18) * K, k % 4 === 0 ? [158, 134, 108] : [164, 160, 152]);
  }
  for (let k = 0; k < 72; k++) { const t = k * 6.2832 / 72; ball(dirs(t, r), .34, k % 9 === 4 ? PANEL : FREIGHTER, 'solid'); }
  // mandibles: flat wedges with a thick edge, and the dark notch between them
  for (const side of [-1, 1]) {
    const root = P(8.4, side * 1.25, .34), tip = P(12.2, side * 1.05, .34);
    plate(root, [tip[0] - root[0], tip[1] - root[1], tip[2] - root[2]], [e1[0] * side * 1.3 * K, e1[1] * side * 1.3 * K, e1[2] * side * 1.3 * K], FREIGHTER);
    bar(P(8.4, side * 2.55, .05), P(12.3, side * 2.35, .05), .3, .26, freighterTone, 'solid');
    bar(P(8.4, side * 1.25, -.2), P(12.2, side * 1.05, -.2), .3, .26, panelTone, 'solid');
    ball(P(12.35, side * 1.7, .05), .3, PANEL, 'solid');
  }
  disc(along(P(9.6, 0, 0), e2, .0), e2, a, e1, 1.0 * K, [58, 56, 62]);
  // cockpit tube on the right, with its glass
  bar(P(7.6, 3.5, 0), P(10.9, 3.5, 0), .42, .38, freighterTone, 'solid');
  ball(P(11.0, 3.5, 0), .44, FREIGHTER, 'solid');
  ball(P(11.15, 3.5, .22), .26, [60, 84, 112], 'gloss');
  // dish on a stem
  bar(P(5.6, -1.9, .4), P(5.6, -1.9, 1.15), .07, .07, panelTone, 'solid');
  disc(P(5.6, -1.9, 1.25), unit([e2[0] + a[0] * .5, e2[1] + a[1] * .5, e2[2] + a[2] * .5]), a, e1, .42 * K, PANEL);
  // engines along the rear edge, lit
  const blue: Color = glow > .5 ? [200, 236, 255] : [112, 184, 255];
  for (let k = -3; k <= 3; k++) {
    const t = Math.PI + k * .24, p = dirs(t, r + .1);
    ball(p, glow > .5 ? .36 : .3, blue, 'solid');
  }
}

/** The vessel of the chosen kind (0 the long white explorer, 1 the starship, 2 the freighter). Returns the red lens of the first, which the game lights. */
export function drawVessel(ship: Ship, blink: boolean, glow: number): Vec3 | null {
  pose(ship);
  if (ship.kind === 1) { drawEnterprise(blink, glow); return null; }
  if (ship.kind === 2) { drawFalcon(glow); return null; }
  return drawDiscovery(blink, glow);
}

/** A small round pod with two arms, drifting near the ship. */
export function drawPod(x: number, y: number, z: number, yaw: number): void {
  const fx = Math.cos(yaw), fy = Math.sin(yaw);
  sphere(x, y, z, .62, WHITE, 'gloss');
  sphere(x + fx * .45, y + fy * .45, z + .08, .26, WINDOW, 'solid');
  for (const side of [-1, 1]) {
    capsule([x + fx * .3 - fy * side * .45, y + fy * .3 + fx * side * .45, z - .35], [x + fx * 1.05 - fy * side * .45, y + fy * 1.05 + fx * side * .45, z - .45], .07, .05, tone(GREY), 'solid');
  }
  capsule([x, y, z + .55], [x, y, z + .95], .04, .04, tone(GREY), 'solid');
}
