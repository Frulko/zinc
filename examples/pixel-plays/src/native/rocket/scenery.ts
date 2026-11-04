import {
  W, H, COS, SIN, R2, pix, zb, ground, groundZ, kinds, bakedPix, bakedZ, staticShadow, shadowMask,
  Color, Vec3, Palette, rgb, rgbColor, rampOf, hash, noise, clamp, lerp, bayerAt, project, unproject,
  box, capsule, sphere, plot, figure, castShadow, bakeOcclusion, applyShadows, copyInto,
  CachedModel, beginModel, captureModel, configureRenderer, setLighting,
} from '../renderer';
import { SLAB, inSlab } from '../odyssey/space';
import { wheel } from '../pitstop/wheel';

// "Objectif Lune": the Hergé rocket on its pad between two gantry towers, a desert behind, the blue jeep on the road.
export const HORIZON = 126;
export const TOWER_TOP = 15;
export const TOWERS: number[][] = [[-5, 5], [5, -5]];
const RED: Color = [232, 56, 36];
const WHITE: Color = [246, 243, 236];
const OCHRE: Color = [200, 146, 46];
const DARK: Color = [40, 38, 52];
const FRONT = Math.PI / 4;

let night = false;
let model: CachedModel | null = null;

/** The palette at night: the same colours, cooled and dimmed, so lit things come from the lamps. */
function T(c: Color): Color { return night ? [c[0] * .6 + 3, c[1] * .62 + 7, c[2] * .84 + 16] : c; }

const SKY_DAY: Color[] = [[44, 174, 228], [70, 190, 234], [108, 206, 238], [158, 224, 240]];
const SKY_NIGHT: Color[] = [[6, 10, 32], [12, 18, 52], [22, 30, 78], [42, 52, 112]];
const SAND_DAY: Color[] = [[190, 152, 90], [210, 174, 106], [228, 196, 126], [242, 214, 148]];
const SAND_NIGHT: Color[] = [[26, 30, 56], [36, 42, 74], [50, 56, 94], [66, 72, 112]];
const PAD: Color[] = [[112, 110, 120], [132, 130, 138], [152, 150, 156], [174, 172, 176]];
const ROAD: Color[] = [[46, 44, 54], [60, 58, 68], [76, 74, 84], [94, 92, 102]];
const WARM: Color = [255, 214, 130];

function tones(list: Color[]): Color[] { return night ? list.map((c: Color): Color => T(c)) : list; }
function pick(list: Color[], base: number, ix: number, iy: number, grain: number): u32 {
  return rgbColor(list[clamp(Math.floor(base + grain + (bayerAt(ix, iy) - .5) * .5), 0, 3)]);
}

/** Light of the pad lamps on the sand at night, in stepped, dithered pools. */
function pool(x: number, y: number): number {
  let level = 0;
  for (const t of TOWERS) level = Math.max(level, 1 - Math.hypot(x - t[0], y - t[1]) / 9.5);
  return Math.max(level, .7 * (1 - Math.hypot(x, y) / 8));
}

function ground2(x: number, y: number, ix: number, iy: number): u32 {
  const r = Math.hypot(x, y);
  const grain = (noise(x * .8, y * .8) - .5) * 2.2;
  let color: u32;
  if (r < 5.7) {
    const scorch = r < 2.8 ? -.9 - noise(x * 2, y * 2) * .6 : 0;
    if (r > 5.38 && r < 5.52) color = rgb(night ? 110 : 226, night ? 96 : 192, night ? 56 : 92);
    else color = pick(tones(PAD), 1.9 + scorch, ix, iy, grain * .5);
  } else if (Math.abs(x) < 1.55 && y > 3.0) {
    const mark = Math.abs(Math.abs(x) - .6) < .13 ? -.9 : 0;
    const edge = Math.abs(Math.abs(x) - 1.45) < .07 ? 1.4 : 0;
    color = pick(tones(ROAD), 1.4 + mark + edge, ix, iy, grain * .35);
  } else {
    const dune = noise(x * .17 + 3, y * .17) * 1.2;
    color = pick(night ? SAND_NIGHT : SAND_DAY, 1.2 + dune, ix, iy, grain * .7);
  }
  if (night) {
    const lit = pool(x, y);
    if (lit > 0) {
      const step = clamp(Math.floor(lit * 3.4 + (bayerAt(ix, iy) - .5) * 1.1), 0, 3);
      const k = [0, .16, .3, .46][step];
      color = rgb(lerp(color & 255, WARM[0], k), lerp(color >> 8 & 255, WARM[1], k), lerp(color >> 16 & 255, WARM[2], k * .8));
    }
  }
  return color;
}

// ---------- sky and mountains ----------
function ridgeFar(ix: number): number { return HORIZON - (24 + 30 * noise(ix * .018 + 1.3, 2) + 10 * noise(ix * .06 + 8, 1)); }
function ridgeNear(ix: number): number { return HORIZON - (9 + 16 * noise(ix * .03 + 5, 4) + 5 * noise(ix * .11, 2)); }
function cliff(ix: number): number { return HORIZON - 80 * Math.max(0, 1 - ix / 118) ** 1.25 - 10 * noise(ix * .1, 9) * (ix < 118 ? 1 : 0); }
const FAR: Color[] = [[84, 90, 124], [112, 118, 150], [142, 148, 176], [176, 180, 202]];
const NEAR: Color[] = [[92, 80, 90], [118, 104, 110], [146, 130, 128], [174, 156, 146]];
const ROCK: Color[] = [[128, 66, 34], [172, 94, 40], [202, 126, 54], [230, 162, 76]];

function mountain(ix: number, iy: number, top: number, left: number, right: number, list: Color[], snow: boolean): u32 {
  const depth = (iy - top) / Math.max(1, HORIZON - top);
  const slope = (left - right) / 6;
  const strata = Math.floor((iy + noise(ix * .05, 3) * 7) * .3) % 2 === 0 ? 0 : -.5;
  if (snow && top < HORIZON - 40 && iy - top < 6 + noise(ix * .3, iy * .3) * 9 + Math.max(0, slope) * 4) return rgbColor(T(slope > 0 ? [238, 240, 246] : [186, 192, 214]));
  const idx = clamp(Math.floor(1.9 - depth * 1.0 + slope * .22 + strata + (noise(ix * .3, iy * .3) - .5) * 1.3 + (bayerAt(ix, iy) - .5) * .6), 0, 3);
  return rgbColor(T(list[idx]));
}

function skyAt(ix: number, iy: number): u32 {
  const t = clamp((iy - 34) / (HORIZON - 34), 0, 1);
  if (!night) return pick(SKY_DAY, t * 3.2 - .1, ix, iy, 0);
  const star = hash(ix * 1.3, iy * 1.7);
  if (star > .9935) return rgb(236, 230, 210);
  if (star > .987) return rgb(130, 132, 190);
  return pick(SKY_NIGHT, t * 3.1 - .2, ix, iy, 0);
}

function backdrop(): void {
  for (let iy = 0; iy < H; iy++) for (let ix = 0; ix < W; ix++) {
    if (!inSlab(ix, iy)) continue;
    const i = iy * W + ix;
    if (iy >= HORIZON) {
      const p = unproject(ix + .5, iy + .5);
      pix[i] = ground2(p.x, p.y, ix, iy);
      ground[i] = 1; kinds[i] = 0;
      zb[i] = (p.x + p.y) / R2 * COS; groundZ[i] = zb[i];
      continue;
    }
    let color = skyAt(ix, iy);
    const far = ridgeFar(ix), near = ridgeNear(ix), rock = cliff(ix);
    if (iy >= far) color = mountain(ix, iy, far, ridgeFar(ix - 3), ridgeFar(ix + 3), FAR, true);
    if (iy >= near) color = mountain(ix, iy, near, ridgeNear(ix - 3), ridgeNear(ix + 3), NEAR, false);
    if (iy >= rock && ix < 118) color = mountain(ix, iy, rock, cliff(ix - 3), cliff(ix + 3), ROCK, false);
    pix[i] = color; ground[i] = 0;
    zb[i] = -1e7; groundZ[i] = -1e7;
  }
  if (night) {
    for (let iy = 52; iy < 74; iy++) for (let ix = 272; ix < 296; ix++) {
      const dx = ix - 284, dy = iy - 62, d = Math.hypot(dx, dy);
      if (d > 9 || !inSlab(ix, iy)) continue;
      const shade = dx * .8 + dy * .45;
      pix[iy * W + ix] = d > 7.8 ? rgb(120, 124, 150) : shade > 3.5 ? rgb(176, 178, 192) : rgb(236, 232, 214);
    }
  }
}

/** Searchlight beams on the sky, from the tower tops to the rocket: a haze of dithered warm points. */
function beam(lx: number, ly: number, tx: number, ty: number, spread: number): void {
  const dx = tx - lx, dy = ty - ly, len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len;
  const x0 = Math.floor(Math.min(lx, tx) - spread - 20), x1 = Math.ceil(Math.max(lx, tx) + spread + 20);
  const y0 = Math.floor(Math.min(ly, ty) - spread - 20), y1 = Math.ceil(Math.max(ly, ty) + spread + 20);
  for (let iy = Math.max(1, y0); iy < Math.min(H - 1, y1); iy++) for (let ix = Math.max(1, x0); ix < Math.min(W - 1, x1); ix++) {
    const i = iy * W + ix;
    if (ground[i] || zb[i] < -1e8) continue;
    const rx = ix - lx, ry = iy - ly, s = (rx * ux + ry * uy) / len;
    if (s < 0 || s > 1.35) continue;
    const half = 1 + spread * s, perp = Math.abs(-rx * uy + ry * ux);
    if (perp > half) continue;
    const fade = (1 - perp / half) * (1 - s * .55);
    if (fade * .85 > bayerAt(ix, iy) * .8 + .03) {
      const c = pix[i];
      pix[i] = rgb(lerp(c & 255, 255, .42), lerp(c >> 8 & 255, 228, .42), lerp(c >> 16 & 255, 150, .34));
    }
  }
}

// ---------- the rocket ----------
// Proportions measured on Hergé's drawings (the album cover and the night panel), as fractions of the height: hull 14% wide at 55%,
// its flat foot at 20%, five rows of squares from 43% to 85%, six squares around with one centred, fins flaring to 26% at the ground.
const HEIGHT = 17.7, RADIUS = .07 * HEIGHT, WIDEST = .55 * HEIGHT, ROW_TOP = .85 * HEIGHT, ROW = .084 * HEIGHT;
export const HULL_FOOT = .2 * HEIGHT;
const OUTER_RHO = [.055, .14, .217, .26, .255], OUTER_Z = [.4, .26, .152, .065, 0];
const INNER_RHO = [.038, .076, .108, .13, .14], INNER_Z = [.2, .163, .098, .04, 0];

function bodyRadius(z: number): number {
  if (z >= WIDEST) { const t = clamp((z - WIDEST) / (HEIGHT - WIDEST), 0, 1); return RADIUS * (1 - t * t); }
  const t = clamp((WIDEST - z) / (WIDEST - HULL_FOOT), 0, 1);
  return RADIUS * (1 - .42 * t * t);
}

/** The renderer's light on a surface normal, 0..1. */
function lit(nx: number, ny: number, nz: number): number {
  const sx = (nx - ny) / R2, vb = (nx + ny) / R2, sy = vb * SIN - nz * COS, sz = vb * COS + nz * SIN;
  return clamp(-.55 * sx - .6 * sy + .58 * sz, 0, 1);
}

/** A smooth curve through evenly spaced keys, t in 0..1 (Catmull-Rom). */
function through(keys: number[], t: number): number {
  const last = keys.length - 1, x = clamp(t, 0, 1) * last, i = Math.min(last - 1, Math.floor(x)), f = x - i;
  const p0 = keys[Math.max(0, i - 1)], p1 = keys[i], p2 = keys[i + 1], p3 = keys[Math.min(last, i + 2)];
  return .5 * (2 * p1 + (p2 - p0) * f + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f * f + (3 * p1 - p0 - 3 * p2 + p3) * f * f * f);
}

function drawHull(): void {
  const red = rampOf(T(RED)), white = rampOf(T(WHITE)), trim = rampOf(T([214, 204, 172])), door = rampOf(T([30, 32, 48]));
  const doorLow = .34 * HEIGHT, doorHigh = .41 * HEIGHT;
  for (let z = HULL_FOOT; z < HEIGHT; z += .04) {
    const r = Math.max(bodyRadius(z), .03), slope = (bodyRadius(z + .02) - bodyRadius(z - .02)) / .04, nn = Math.hypot(1, slope), da = .035 / Math.max(r, .08);
    const row = Math.floor((ROW_TOP - z) / ROW), checked = row >= 0 && row < 5;
    for (let a = FRONT - 1.75; a <= FRONT + 1.75; a += da) {
      const rel = a - FRONT;
      let ramp = checked && (Math.floor((rel + Math.PI / 6) / (Math.PI / 3)) + row & 1) === 0 ? white : red;
      if (z > doorLow && z < doorHigh && rel > -.6 && rel < -.08) {
        ramp = rel < -.54 || rel > -.14 || z < doorLow + .12 || z > doorHigh - .12 ? trim : door;
      }
      const l = lit(Math.cos(a) / nn, Math.sin(a) / nn, -slope / nn);
      plot(r * Math.cos(a), r * Math.sin(a), z, ramp[clamp(Math.floor(l * 3 + 1.7), 2, 4)]);   // flat, bright bands: a drawing, not a study in shadow
    }
  }
}

/** One fin: a wide lens-shaped blade between the two measured curves, rounded across its width, with Hergé's panel line down the middle. */
function drawLeg(b: number): void {
  const red = rampOf(T(RED));
  const tx = -Math.sin(b), ty = Math.cos(b), bx = Math.cos(b), by = Math.sin(b);
  for (let t = 0; t <= 1; t += .004) {
    const oRho = through(OUTER_RHO, t) * HEIGHT, oZ = through(OUTER_Z, t) * HEIGHT, iRho = through(INNER_RHO, t) * HEIGHT, iZ = through(INNER_Z, t) * HEIGHT;
    const dr = oRho - iRho, dz = oZ - iZ, width = Math.hypot(dr, dz), ur = dr / width, uz = dz / width;
    const thick = .16 + .2 * t, ds = .045 / width;
    for (let s = -1; s <= 1; s += ds) {
      const k = (s + 1) / 2, rho = iRho + dr * k, z = Math.max(0, iZ + dz * k), round = Math.sqrt(Math.max(0, 1 - s * s));
      for (const side of [-1, 1]) {
        const nt = side * round, l = lit(tx * nt + bx * ur * s, ty * nt + by * ur * s, uz * s);
        let idx = clamp(Math.floor(l * 3 + 1.7), 2, 4);
        if (Math.abs(s) * width / 2 < .055 && t < .94) idx = 1;
        const off = side * thick * round;
        plot(rho * bx + tx * off, rho * by + ty * off, z, red[idx]);
      }
    }
  }
}

function bakeRocket(): void {
  beginModel();
  drawHull();
  for (const b of [FRONT + Math.PI / 3, FRONT - Math.PI / 3, FRONT + Math.PI]) drawLeg(b);
  capsule([0, 0, HEIGHT - .15], [0, 0, HEIGHT + 1.1], .045, .025, (): Color => T([52, 50, 60]), 'solid');
  model = captureModel();
}

/** The rocket with its foot at altitude z (a pixel offset (jx, jy) shakes it). */
export function rocketAt(z: number, jx: number, jy: number): void { if (model !== null) model.drawAt(jx, jy, z); }

// ---------- gantry towers ----------
function bar(a: Vec3, b: Vec3): void { capsule(a, b, .08, .08, (): Color => T(OCHRE), 'solid'); }

function tower(cx: number, cy: number): void {
  const h = 1.5, floors = 8, step = TOWER_TOP / floors;
  box(cx - h, cy - h, 0, cx - h + .06, cy + h, TOWER_TOP, T(DARK));
  box(cx - h, cy - h, 0, cx + h, cy - h + .06, TOWER_TOP, T(DARK));
  for (let k = 0; k <= floors; k++) {
    const z = k * step;
    bar([cx + h, cy - h, z], [cx + h, cy + h, z]);
    bar([cx - h, cy + h, z], [cx + h, cy + h, z]);
    if (k > 0) {
      box(cx + h, cy - h, z - .03, cx + h + .45, cy + h + .45, z + .05, T([104, 98, 108]));
      box(cx - h, cy + h, z - .03, cx + h, cy + h + .45, z + .05, T([104, 98, 108]));
    }
  }
  for (let k = 0; k < floors; k++) {
    const z0 = k * step, z1 = z0 + step;
    bar([cx + h, cy - h, z0], [cx + h, cy + h, z1]); bar([cx + h, cy + h, z0], [cx + h, cy - h, z1]);
    bar([cx - h, cy + h, z0], [cx + h, cy + h, z1]); bar([cx + h, cy + h, z0], [cx - h, cy + h, z1]);
  }
  for (const sx of [-h, h]) for (const sy of [-h, h]) bar([cx + sx, cy + sy, 0], [cx + sx, cy + sy, TOWER_TOP]);
  box(cx - 1.1, cy - 1.1, TOWER_TOP, cx + 1.1, cy + 1.1, TOWER_TOP + .7, T([110, 112, 124]));
  box(cx - 1.2, cy - 1.2, TOWER_TOP + .7, cx + 1.2, cy + 1.2, TOWER_TOP + .8, T([86, 84, 96]));
  capsule([cx, cy, TOWER_TOP + .8], [cx, cy, TOWER_TOP + 2.6], .05, .05, (): Color => T([190, 190, 198]), 'solid');
  // lamps on every floor: lit at night, plain housings by day
  for (let k = 1; k <= floors; k++) {
    const z = k * step + .3;
    for (const p of [[cx + h + .38, cy - h + .25], [cx + h + .38, cy + h + .38], [cx - h + .25, cy + h + .38]]) {
      sphere(p[0], p[1], z, .12, night ? [255, 236, 170] : [150, 148, 156], 'solid');
    }
  }
}

/** A flat gangway between a tower and the rocket. */
function deck(ax: number, ay: number, bx: number, by: number, z: number, hw: number): void {
  const ramp = rampOf(T([120, 116, 126]));
  const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len, px = -uy, py = ux;
  for (let s = 0; s <= len; s += .05) for (let w = -hw; w <= hw; w += .05) plot(ax + ux * s + px * w, ay + uy * s + py * w, z, ramp[3]);
  for (let s = 0; s <= len; s += .05) for (let zz = z - .16; zz < z; zz += .05) {
    plot(ax + ux * s + px * hw, ay + uy * s + py * hw, zz, ramp[1]);
    plot(ax + ux * s - px * hw, ay + uy * s - py * hw, zz, ramp[2]);
  }
  for (const side of [-1, 1]) {
    capsule([ax + px * hw * side, ay + py * hw * side, z + .55], [bx + px * hw * side, by + py * hw * side, z + .55], .035, .035, (): Color => T(OCHRE), 'solid');
    for (let s = 0; s <= len; s += len / 2) capsule([ax + ux * s + px * hw * side, ay + uy * s + py * hw * side, z], [ax + ux * s + px * hw * side, ay + uy * s + py * hw * side, z + .55], .035, .035, (): Color => T(OCHRE), 'solid');
  }
}

// ---------- the people and the vehicles ----------
function person(x: number, y: number, yaw: number, crouch: number, z: number, pal: Palette): void {
  figure(x, y, yaw, { z, scale: .95, crouch }, pal, (a: Vec3, b: Vec3, r0: number, r1: number, f: (z: number) => Color): void => capsule(a, b, r0, r1, f, 'solid'));
}
function palette(shirt: Color, hair: Color, legs: Color): Palette { return { shirt: T(shirt), stripe: T(shirt), legs: T(legs), hair: T(hair), skin: T([236, 188, 150]) }; }

function truck(x: number, y: number, body: Color, cab: Color): void {
  box(x - 1.3, y - .6, .3, x + 1.3, y + .6, .75, T(body));
  box(x - 1.3, y - .6, .75, x + .2, y + .6, 1.0, T([120, 100, 70]));
  box(x + .25, y - .6, .75, x + 1.3, y + .6, 1.5, T(cab));
  box(x + 1.0, y - .55, 1.05, x + 1.31, y + .55, 1.35, T([60, 80, 100]));
  for (const wx of [-.8, .85]) for (const wy of [-.55, .55]) wheel(x + wx, y + wy + (wy > 0 ? .1 : -.1), .35, 1, 0, [70, 70, 76], .35, .12);
  castShadow(x, y, .6, 1.2, 1, .4);
}

function jeep(cx: number, cy: number): void {
  const blue: Color = T([64, 150, 208]), tire: Color = T([44, 88, 62]);
  box(cx - .85, cy - 1.5, .38, cx + .85, cy + 1.5, .78, blue);
  box(cx - .85, cy - 1.5, .78, cx + .85, cy - .5, 1.15, blue);
  box(cx - .85, cy - .5, .78, cx - .7, cy + 1.5, 1.3, blue);
  box(cx + .7, cy - .5, .78, cx + .85, cy + 1.5, 1.3, blue);
  box(cx - .85, cy + 1.38, .78, cx + .85, cy + 1.5, 1.3, blue);
  box(cx - .7, cy - .1, .78, cx + .7, cy + .4, 1.02, T([112, 80, 52]));
  box(cx - .06, cy + 1.5, .85, cx + .06, cy + 1.53, 1.25, T([150, 204, 232]));
  box(cx - .3, cy + 1.5, 1.0, cx + .3, cy + 1.53, 1.1, T([150, 204, 232]));
  box(cx - .72, cy + 1.5, .46, cx - .32, cy + 1.53, .64, T([190, 50, 44]));
  for (const sx of [-1, 1]) for (const sy of [-.95, .95]) capsule([cx + sx * .76, cy + sy, .43], [cx + sx * .98, cy + sy, .43], .43, .43, (): Color => tire, 'solid');
  capsule([cx - .8, cy - .45, 1.15], [cx - .8, cy - .45, 1.95], .04, .04, (): Color => blue, 'solid');
  capsule([cx + .8, cy - .45, 1.15], [cx + .8, cy - .45, 1.95], .04, .04, (): Color => blue, 'solid');
  capsule([cx - .8, cy - .45, 1.95], [cx + .8, cy - .45, 1.95], .04, .04, (): Color => blue, 'solid');
  wheel(cx + .35, cy + 1.66, 1.0, 1, 0, [60, 120, 80], .42, .13);
  capsule([cx + .7, cy + 1.2, 1.3], [cx + .7, cy + 1.2, 3.3], .025, .025, (): Color => T([60, 60, 66]), 'solid');
  person(cx - .45, cy + .1, -Math.PI / 2, .75, .95, palette([88, 160, 214], [226, 132, 44], [66, 96, 140]));
  person(cx + .1, cy + .1, -Math.PI / 2, .75, .95, palette([78, 140, 96], [188, 188, 190], [60, 60, 70]));
  person(cx + .62, cy + .1, -Math.PI / 2, .75, .95, palette([232, 140, 48], [40, 36, 40], [200, 120, 44]));
  sphere(cx + .12, cy + .95, 1.08, .2, [244, 242, 236], 'solid');
  sphere(cx + .12, cy + .78, 1.3, .15, [244, 242, 236], 'solid');
  castShadow(cx, cy, .7, 1.5, 1, .4);
}

function props(): void {
  truck(6.2, -1.6, [226, 196, 70], [226, 196, 70]);
  truck(-3.4, .4, [78, 148, 110], [78, 148, 110]);
  jeep(.2, 8.4);
  const overall: Palette[] = [palette([88, 112, 150], [60, 50, 44], [70, 74, 90]), palette([200, 188, 160], [90, 70, 50], [96, 88, 76]), palette([226, 140, 60], [40, 36, 40], [72, 74, 88])];
  person(2.6, .9, 2.2, 0, 0, overall[0]);
  person(-2.4, -1.9, .5, 0, 0, overall[1]);
  person(4.8, 0, 3.3, 0, 0, overall[2]);
  // a few rocks to break the sand
  for (let k = 0; k < 26; k++) {
    const x = -20 + hash(k, 5) * 40, y = -14 + hash(k, 6) * 34;
    const p = project(x, y, 0);
    if (Math.hypot(x, y) < 6.5 || Math.abs(x) < 2.6 && y > 2 || p.sy < HORIZON + 6 || p.sy > 222 || p.sx < 40 || p.sx > 320) continue;
    sphere(x, y, .1, .22 + hash(k, 7) * .3, T(k % 2 === 0 ? [176, 140, 98] : [150, 118, 84]), 'rough');
  }
}

/** A gangway from a tower's inner corner to the hull, at height z. side -1 is the left tower. */
function armTo(side: number, z: number): void {
  const e = bodyRadius(z) * .7071 - .03, c = TOWERS[side < 0 ? 0 : 1];
  deck(c[0] - side * 1.5, c[1] + side * 1.5, side * e, -side * e, z, .5);
}

/** The whole static scene. Everything the launch moves is drawn per frame over it. */
export function bakeScene(isNight: boolean): void {
  night = isNight;
  configureRenderer(64, .55, -.5);
  if (night) setLighting([8, 12, 44], [255, 206, 140]);
  pix.fill(rgb(255, 255, 255)); zb.fill(-1e9); groundZ.fill(-1e9); ground.fill(0); kinds.fill(0); shadowMask.fill(0);
  backdrop();
  if (night) for (const t of TOWERS) {
    const lamp = project(t[0] - (t[0] < 0 ? -1 : 1) * .9, t[1] - (t[1] < 0 ? -1 : 1) * .9, TOWER_TOP + 1.3);
    for (const z of [5.5, 12]) {
      const target = project(0, 0, z);
      beam(lamp.sx, lamp.sy, target.sx, target.sy, 15);
    }
  }
  for (const t of TOWERS) tower(t[0], t[1]);
  armTo(-1, 10.6); armTo(-1, 6.4);
  armTo(1, 10.6); armTo(1, 6.4);
  props();
  for (const t of TOWERS) for (let z = 0; z < TOWER_TOP; z += .6) castShadow(t[0], t[1], z, 1.5, 1, .9);
  bakeOcclusion(); copyInto(staticShadow, shadowMask); applyShadows(groundZ);
  copyInto(bakedPix, pix); copyInto(bakedZ, zb);
  bakeRocket();
}

export function isNight(): boolean { return night; }
export const SLAB_TOP = SLAB.cy - SLAB.hy;
