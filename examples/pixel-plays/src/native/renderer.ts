// Pixel Plays renderer, ported to strict Zinc TypeScript. Upstream MIT: LICENSE.upstream.
export type Color = number[];
export type Vec3 = number[];
export interface Pose { z?: number; scale?: number; crouch?: number; lean?: number; stance?: number; armR?: number; armL?: number; }
export interface Palette { shirt: Color; stripe: Color; legs: Color; hair: Color; skin: Color; }
export interface Tuft { ix: number; iy: number; i: number; height: number; base: number; phase: number; bloom: u32; }
export interface Leaf { x: number; y: number; z: number; k: number; r: number; pixels: number[]; }
export interface ShadowPart { a: Vec3; ra: number; b: Vec3; rb: number; }

// Shared pixel renderer for every game: orthographic camera, depth buffer, ramps, shadows, edges and wind.
// A game sets window.PP_SCENE before loading this file, then draws through these globals.
export let W = 360, H = 280;       // a game may change them once with resizeBuffer (the city builder shows a wider window when zoomed out)
export let S = 10;                 // pixels per world unit; setView changes it (zoom), the other games never do
export const SIN = .5, COS = Math.sqrt(3) / 2, R2 = Math.SQRT2;
let OX = W / 2;
let OY = H / 2 + 22;
// The buffer shows the layer's pixels PX.. and PY..: every per-pixel pattern (dither, grain, wind phase) is read at (ix + PX, iy + PY), so a picture
// scrolled by whole pixels, or baked in pieces, is made of the very same pixels. Both stay 0 for a game that never scrolls.
export let PX = 0, PY = 0;
// Clip box [CX0, CX1) x [CY0, CY1): every primitive writes only inside it (the whole buffer by default). A game that redraws a part of its static picture sets it
// to that part, so the part is made of the very same pixels as a full draw (with setPixelOrigin keeping the patterns on the layer).
export let CX0 = 0, CY0 = 0, CX1 = 360, CY1 = 280;
export function setClip(x0: number, y0: number, x1: number, y1: number): void { CX0 = Math.max(0, x0); CY0 = Math.max(0, y0); CX1 = Math.min(W, x1); CY1 = Math.min(H, y1); }
export function clearClip(): void { CX0 = 0; CY0 = 0; CX1 = W; CY1 = H; }
export function setPixelOrigin(x: number, y: number): void { PX = x; PY = y; }
export let SHADOW_X = 1.3, SHADOW_Y = -.12;
export let pix: u32[] = Array.from({ length: W * H }, (): u32 => 0);
export let zb: number[] = Array.from({ length: W * H }, (): number => 0);
export let bakedPix: u32[] = Array.from({ length: W * H }, (): u32 => 0);
export let bakedZ: number[] = Array.from({ length: W * H }, (): number => 0);
export let ground: number[] = Array.from({ length: W * H }, (): number => 0);
export let shadowMask: number[] = Array.from({ length: W * H }, (): number => 0);
export let groundZ: number[] = Array.from({ length: W * H }, (): number => 0);
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + .5) / 16);
const COOL = [46, 38, 84], WARM = [255, 232, 180];
const SHOE = [226, 222, 212], BARK = [92, 74, 60];
export const GRASS: Color[] = [[34, 62, 50], [52, 88, 52], [82, 118, 54], [124, 146, 62], [168, 172, 76]];
let GRADIENT_Y = COS / (S * SIN);
const EDGE = .28;

export const rgb = (r: number, g: number, b: number): u32 => (255 << 24 | Math.min(255, b | 0) << 16 | Math.min(255, g | 0) << 8 | Math.min(255, r | 0)) >>> 0;
// hue-shifted ramp: shadows drift to violet, lights drift to warm yellow
const ramps = new Map<number, u32[]>();
export function rampOf(c: Color): u32[] {
  const key = c[0] + c[1] * 256 + c[2] * 65536;
  const cached = ramps.get(key);
  if (cached !== undefined) return cached as u32[];
  let ramp: u32[] = [];
  const mix = (m: number, tint: Color, k: number): u32 => rgb(lerp(c[0] * m, tint[0], k), lerp(c[1] * m, tint[1], k), lerp(c[2] * m, tint[2], k));
  ramp = [mix(.4, COOL, .34), mix(.62, COOL, .18), mix(.84, COOL, .05), mix(1, WARM, 0), mix(1.1, WARM, .22)];
  ramps.set(key, ramp);
  return ramp;
}
export const bayerAt = (ix: number, iy: number): number => BAYER[(iy & 3) * 4 + (ix & 3)];
export function tint(i: number, r: number, g: number, b: number) {
  const c = pix[i];
  pix[i] = rgb((c & 255) * r, (c >> 8 & 255) * g, (c >> 16 & 255) * b);
}
export const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const ease = (t: number): number => t * t * (3 - 2 * t);
export function hash(x: number, y: number) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
export function noise(x: number, y: number) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = ease(x - ix), fy = ease(y - iy);
  return lerp(lerp(hash(ix, iy), hash(ix + 1, iy), fx), lerp(hash(ix, iy + 1), hash(ix + 1, iy + 1), fx), fy);
}
export function project(x: number, y: number, z: number) {
  const u = (x - y) / R2, v = (x + y) / R2;
  return { sx: OX + u * S - PX, sy: OY + (v * SIN - z * COS) * S - PY, d: v * COS + z * SIN };
}
export function unproject(sx: number, sy: number) {
  const u = (sx + PX - OX) / S, v = (sy + PY - OY) / (S * SIN);
  return { x: (u + v) / R2, y: (v - u) / R2 };
}

let capture: number[] = [];
let capturing = false; // when set, sphere() records pixels instead of drawing them
export function sphere(x: number, y: number, z: number, r: number, c: Color, mode: string = '') {
  const ramp = rampOf(c);
  const p = project(x, y, z), rp = Math.max(r * S, .75);
  const y0 = Math.max(CY0, Math.floor(p.sy - rp)), y1 = Math.min(CY1 - 1, Math.ceil(p.sy + rp));
  const x0 = Math.max(CX0, Math.floor(p.sx - rp)), x1 = Math.min(CX1 - 1, Math.ceil(p.sx + rp));
  if (modelling && !capturing) touchBox(x0, y0, x1, y1);
  for (let iy = y0; iy <= y1; iy++) for (let ix = x0; ix <= x1; ix++) {
    const dx = (ix + .5 - p.sx) / rp, dy = (iy + .5 - p.sy) / rp, nn = dx * dx + dy * dy;
    if (nn > 1) continue;
    const nz = Math.sqrt(1 - nn), d = p.d + r * nz, i = iy * W + ix;
    if (d <= zb[i]) continue;
    let l = clamp(-.55 * dx - .6 * dy + .58 * nz, 0, 1);
    if (mode === 'rough') l += (hash(ix + PX, iy + PY) - .5) * .55;
    if (dy > .35) l = Math.max(l, .12 + dy * .24); // warm light bouncing off the ground
    if (capturing) {
      capture.push(ix, iy, d, ramp[clamp(Math.floor(l * 4.4 + .2 + (bayerAt(ix + PX, iy + PY) - .5) * .7), 0, 4)]);
      continue;
    }
    zb[i] = d;
    if (mode === 'gloss' && l > .9) { pix[i] = rgb(255, 250, 232); continue; }
    // figures get flat bands with no dither, so they read as sharp shapes against the textured ground
    if (mode === 'solid') { pix[i] = ramp[clamp(Math.floor(l * 4.4 + .2), 1, 4)]; continue; }
    pix[i] = ramp[clamp(Math.floor(l * 4.4 + .2 + (bayerAt(ix + PX, iy + PY) - .5) * .7), 0, 4)];
  }
}
export function capsule(a: Vec3, b: Vec3, r0: number, r1: number, colorOf: (z: number) => Color, mode: string = '') {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const n = Math.max(1, Math.ceil(len / (Math.min(r0, r1) * .45)));
  for (let k = 0; k <= n; k++) {
    const t = k / n, z = lerp(a[2], b[2], t);
    sphere(lerp(a[0], b[0], t), lerp(a[1], b[1], t), z, lerp(r0, r1, t), colorOf(z), mode);
  }
}
export function box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: Color, seed: number = 0) {
  const ramp = rampOf(c);
  const paint = (x: number, y: number, z: number, base: number, grain: number): void => {
    const p = project(x, y, z), ix = p.sx | 0, iy = p.sy | 0;
    if (ix < CX0 || iy < CY0 || ix >= CX1 || iy >= CY1) return;
    const i = iy * W + ix;
    if (p.d <= zb[i]) return;
    if (modelling) touchBox(ix, iy, ix, iy);
    zb[i] = p.d;
    pix[i] = ramp[clamp(Math.floor(base + (grain - .5) * 1.3 + (bayerAt(ix + PX, iy + PY) - .5) * .5), 0, 4)];
  };
  const step = .045, longX = x1 - x0 >= y1 - y0;
  for (let a = x0; a <= x1; a += step) for (let b = y0; b <= y1; b += step) {
    paint(a, b, z1, 3.4, longX ? noise(a * .8 + seed, b * 9) : noise(a * 9, b * .8 + seed));
  }
  for (let a = x0; a <= x1; a += step) for (let b = z0; b <= z1; b += step) paint(a, y1, b, 2.3, noise(a * .8 + seed, b * 9));
  for (let a = y0; a <= y1; a += step) for (let b = z0; b <= z1; b += step) paint(x1, a, b, 1.2, noise(a * .8 + seed, b * 9));
}
/** A game that redraws only what moves asks for the rows its shadows touched (row, first column, last column, three numbers each) instead of a scan of the whole buffer. */
export let trackShadows = false;
export const shadowSpans: number[] = [];
export function setTrackShadows(on: boolean): void { trackShadows = on; shadowSpans.length = 0; }
export function castShadow(x: number, y: number, z: number, r: number, strength: number = 1, dither: number = .4) {
  const p = project(x + SHADOW_X * z, y + SHADOW_Y * z, 0);
  const rx = r * S * 1.05, ry = rx * SIN + 1;
  const y0 = Math.max(CY0, Math.floor(p.sy - ry)), y1 = Math.min(CY1 - 1, Math.ceil(p.sy + ry));
  const x0 = Math.max(CX0, Math.floor(p.sx - rx)), x1 = Math.min(CX1 - 1, Math.ceil(p.sx + rx));
  if (trackShadows) for (let iy = y0; iy <= y1; iy++) shadowSpans.push(iy, x0, x1);
  for (let iy = y0; iy <= y1; iy++) for (let ix = x0; ix <= x1; ix++) {
    const dx = (ix + .5 - p.sx) / rx, dy = (iy + .5 - p.sy) / ry;
    if (dx * dx + dy * dy + (bayerAt(ix + PX, iy + PY) - .5) * dither > 1) continue;
    const i = iy * W + ix;
    if (shadowMask[i] < strength) shadowMask[i] = strength;
  }
}
export function applyShadows(refZ: number[]) {
  if (trackShadows) {
    for (let k = 0; k < shadowSpans.length; k += 3) {
      for (let i = shadowSpans[k] * W + shadowSpans[k + 1], end = shadowSpans[k] * W + shadowSpans[k + 2]; i <= end; i++) {
        const s = shadowMask[i];
        if (!s) continue;
        shadowMask[i] = 0;
        if (!ground[i] || zb[i] !== refZ[i]) continue;
        if (s === 1) tint(i, .54, .52, .72);
        else tint(i, .36, .34, .56);
      }
    }
    return;
  }
  for (let iy = CY0; iy < CY1; iy++) for (let ix = CX0; ix < CX1; ix++) {
    const i = iy * W + ix, s = shadowMask[i];
    if (!s) continue;
    shadowMask[i] = 0;
    if (!ground[i] || zb[i] !== refZ[i]) continue;
    if (s === 1) tint(i, .54, .52, .72);
    else tint(i, .36, .34, .56);
  }
}
// pixel-art edges from the depth buffer. The ground is never touched, so nothing halos around a figure:
// an object darkens its own silhouette against the ground, and gets a warm rim only over another object
export function shadeEdges() { shadeEdgesRect(0, 0, W, H); }
/** The same edges, only for the pixels of a rectangle (x0, y0 included, x1, y1 excluded): a game that redraws a part of the picture. */
export function shadeEdgesRect(x0: number, y0: number, x1: number, y1: number) {
  for (let iy = Math.max(1, y0); iy < Math.min(H - 1, y1); iy++) for (let ix = Math.max(1, x0); ix < Math.min(W - 1, x1); ix++) {
    const i = iy * W + ix, d = zb[i];
    if (d < -1e8 || d === groundZ[i]) continue;
    const a = i - W, b = i + W, c = i - 1, e = i + 1;
    if (zb[a] === groundZ[a] || zb[b] === groundZ[b] || zb[c] === groundZ[c] || zb[e] === groundZ[e]) {
      tint(i, .68, .66, .76);
    } else if (d - zb[a] - GRADIENT_Y > EDGE || d - zb[c] > EDGE) {
      const p = pix[i];
      pix[i] = rgb(lerp(p & 255, WARM[0], .3), lerp(p >> 8 & 255, WARM[1], .3), lerp(p >> 16 & 255, WARM[2], .22));
    } else if (zb[e] - d > EDGE || zb[b] - GRADIENT_Y - d > EDGE) {
      tint(i, .74, .72, .82);
    }
  }
}

const KIND_NONE = 0;
export const KIND_GRASS = 3;
export let kinds: number[] = Array.from({ length: W * H }, (): number => 0);
/* ---------- wind ---------- */
export const WIND_FPS = 8; // stepped on purpose: the sway should feel hand-animated, not simulated
export let STILL = false;
const tufts: Tuft[] = [], leaves: Leaf[] = [];
export let staticShadow: number[] = Array.from({ length: W * H }, (): number => 0);
const tuftLit = GRASS.map(c => rgb(c[0], c[1], c[2])), tuftDark = GRASS.map(c => rgb(c[0] * .54, c[1] * .52, c[2] * .72));
export function growGrass() {
  for (let iy = 3; iy < H; iy++) for (let ix = 0; ix < W; ix++) {
    const i = iy * W + ix, wx = ix + PX, wy = iy + PY;   // the layer's pixel, not the buffer's: a chunk grows the tufts the whole picture would
    if (kinds[i] !== KIND_GRASS || hash(wx * 3, wy * 5) > .17) continue;
    const height = 1 + (hash(wx, wy * 2) * 3 | 0);
    tufts.push({
      ix, iy, i, height, base: Math.round(noise(wx * .09, wy * .18) * 2.2),
      phase: wx * .11 + wy * .19 + hash(wx, wy) * .9,
      bloom: hash(wx * 7, wy) < .022 ? (hash(wx, wy) > .5 ? rgb(250, 246, 226) : rgb(240, 200, 84)) : 0,
    });
  }
}
export function drawTufts(t: number) { drawTuftList(tufts, 0, 0, t); }
/** The tufts of a list (a scrolling chunk's, in the chunk's pixels) moved by (dx, dy) pixels, clipped to the buffer. */
export function drawTuftList(list: Tuft[], dx: number, dy: number, t: number): void {
  for (const tuft of list) {
    const bx = tuft.ix + dx, by = tuft.iy + dy;
    if (bx < CX0 + 2 || bx >= CX1 - 2 || by < CY0 || by >= CY1 + 4) continue;
    const gust = Math.sin(t * .8 + tuft.phase) + .5 * Math.sin(t * 2.1 + tuft.phase * 2.3);
    const colors = by < H && staticShadow[by * W + bx] ? tuftDark : tuftLit;
    for (let k = 1; k <= tuft.height; k++) {
      const jx = bx + Math.round(gust * .95 * k / 3), jy = by - k;
      if (jx < 0 || jx >= W || jy < 0 || jy >= H) continue;
      const j = jy * W + jx;
      if ((kinds[j] !== KIND_GRASS && kinds[j] !== KIND_NONE) || zb[j] !== groundZ[j]) continue;
      pix[j] = tuft.bloom && k === tuft.height ? tuft.bloom : colors[clamp(tuft.base + k + (gust > 1 ? 1 : 0), 1, 4)];
    }
  }
}
export function drawLeaves(t: number) { drawLeafList(leaves, 0, 0, t); }
/** The captured leaves of a list moved by (dx, dy) pixels: the wind and the shadows are those of the leaf's own world position. */
export function drawLeafList(list: Leaf[], offX: number, offY: number, t: number): void {
  for (const leaf of list) {
    const reach = clamp((leaf.z - 2.5) / 3, .3, 1);
    const swayX = (Math.sin(t * .9 + leaf.x * .5 + leaf.z * .7) + .55 * Math.sin(t * 2.3 + leaf.k * 1.7)) * reach;
    const dx = Math.round(swayX * .9) + offX, dy = Math.round(Math.sin(t * 1.3 + leaf.y + leaf.k) * reach * .45) + offY;
    const px = leaf.pixels;
    for (let n = 0; n < px.length; n += 4) {
      const ix = px[n] + dx, iy = px[n + 1] + dy;
      if (ix < CX0 || iy < CY0 || ix >= CX1 || iy >= CY1) continue;
      const i = iy * W + ix;
      if (px[n + 2] <= zb[i]) continue;
      zb[i] = px[n + 2];
      pix[i] = px[n + 3];
    }
    if (leaf.k % 2 === 0) castShadow(leaf.x + swayX * .12, leaf.y, leaf.z, leaf.r);
  }
}
export function bakeOcclusion() {
  const offsets: number[][] = [];
  for (const r of [2, 4]) for (let k = 0; k < 8; k++) {
    offsets.push([Math.round(Math.cos(k * Math.PI / 4) * r), Math.round(Math.sin(k * Math.PI / 4) * r * .7)]);
  }
  for (let iy = Math.max(4, CY0); iy < Math.min(H - 4, CY1); iy++) for (let ix = Math.max(4, CX0); ix < Math.min(W - 4, CX1); ix++) {
    const i = iy * W + ix;
    if (!ground[i] || zb[i] !== groundZ[i]) continue;
    let hits = 0;
    for (const [ox, oy] of offsets) {
      const j = (iy + oy) * W + ix + ox;
      if (zb[j] !== groundZ[j]) hits++;
    }
    if (!hits) continue;
    if (hits >= 8) tint(i, .56, .54, .72);
    else if (hits / 8 > bayerAt(ix + PX, iy + PY)) tint(i, .74, .72, .84);
  }
}
export function plot(x: number, y: number, z: number, color: u32) {
  const p = project(x, y, z), ix = p.sx | 0, iy = p.sy | 0;
  if (ix < CX0 || iy < CY0 || ix >= CX1 || iy >= CY1) return;
  const i = iy * W + ix;
  if (p.d <= zb[i]) return;
  if (modelling) touchBox(ix, iy, ix, iy);
  zb[i] = p.d;
  pix[i] = color;
}
// a gnarled trunk, then a dark core under silver-green leaf clusters that sway in drawLeaves
const CROWN = [[.1, 0, 3.7, 1.6], [-1.4, -.7, 3.3, 1.2], [1.6, .7, 3.4, 1.25], [-.6, 1.1, 3.9, 1.1], [.9, -1.1, 4, 1.1], [.2, .1, 4.9, 1.05]];
const LEAF_DEEP = [58, 84, 62], LEAF_MID = [100, 126, 78], LEAF_SILVER = [146, 162, 112];
export function growTree(x: number, y: number, scale: number = 1, count: number = 420, seed: number = 0) {
  const bark = () => BARK;
  capsule([x, y, 0], [x + .3 * scale, y + .1 * scale, 2.2 * scale], .36 * scale, .22 * scale, bark, 'rough');
  capsule([x + .3 * scale, y + .1 * scale, 2.2 * scale], [x - .8 * scale, y - .4 * scale, 3.3 * scale], .2 * scale, .13 * scale, bark, 'rough');
  capsule([x + .3 * scale, y + .1 * scale, 2.2 * scale], [x + 1.2 * scale, y + .4 * scale, 3.4 * scale], .2 * scale, .13 * scale, bark, 'rough');
  for (let n = 0; n < count; n++) {
    const k = n + seed, [cx, cy, cz, spread] = CROWN[n % CROWN.length];
    const a = hash(k, 7) * 6.283, tilt = hash(k, 8) * 2 - 1, d = Math.cbrt(hash(k, 9)) * spread, flat = Math.sqrt(1 - tilt * tilt);
    const rx = cx + Math.cos(a) * flat * d, ry = cy + Math.sin(a) * flat * d, rz = cz + tilt * d * .8;
    const tone = hash(k, 10) + (rz - 4.2) * .22 + (d / spread - .5) * .3;
    const leaf = tone > .72 ? LEAF_SILVER : tone > .3 ? LEAF_MID : LEAF_DEEP;
    capture = []; capturing = true;
    sphere(x + rx * scale, y + ry * scale, rz * scale, (.2 + hash(k, 11) * .22) * scale, leaf, 'rough');
    leaves.push({ x: x + rx * scale, y: y + ry * scale, z: rz * scale, k, r: .42 * scale, pixels: capture });
    capturing = false;
  }
}
export function figure(px: number, py: number, yaw: number, pose: Pose, palette: Palette, addBone: (a: Vec3, b: Vec3, r0: number, r1: number, f: (z: number) => Color) => void) {
  const fx = Math.cos(yaw), fy = Math.sin(yaw), sx = -fy, sy = fx, base = pose.z ?? 0, k = pose.scale ?? 1;
  const P = (a: number, b: number, c: number): Vec3 => [px + (fx * a + sx * b) * k, py + (fy * a + sy * b) * k, c * k + base];
  const add = (a: Vec3, b: Vec3, r0: number, r1: number, f: (z: number) => Color): void => addBone(a, b, r0 * k, r1 * k, f);
  const t = palette;
  const shirt = (z: number): Color => (Math.floor(z * 3.2) % 2 ? t.shirt : t.stripe); // about 3px bands: thinner ones read as noise
  const legs = () => t.legs, skin = () => t.skin;
  const crouch = pose.crouch ?? 0, lean = pose.lean ?? 0;
  const hipZ = 1.28 - crouch * .4;
  const hipA = -crouch * .15;
  const shA = hipA + Math.sin(lean) * .95, shZ = hipZ + Math.cos(lean) * .95;
  const neck = P(shA, 0, shZ + .08), head = P(shA + Math.sin(lean) * .32, 0, shZ + .36);
  const stance = pose.stance == null ? .2 : pose.stance;
  const footB = P(-stance * 1.2, .2, .12), footF = P(stance * 2, -.2, .12);
  const kneeB = P(-stance * .4 + crouch * .12, .22, .68 - crouch * .1);
  const kneeF = P(stance * 1.2 + crouch * .34, -.22, .72 - crouch * .08);
  const hipB = P(hipA, .15, hipZ), hipF = P(hipA, -.15, hipZ);
  add(hipB, kneeB, .17, .13, legs); add(kneeB, footB, .13, .1, legs);
  add(hipF, kneeF, .17, .13, legs); add(kneeF, footF, .13, .1, legs);
  add(footB, P(-stance * 1.2 + .16, .2, .08), .1, .09, () => SHOE);
  add(footF, P(stance * 2 + .16, -.2, .08), .1, .09, () => SHOE);
  add(P(hipA, 0, hipZ), neck, .3, .32, shirt);
  add(neck, head, .11, .12, skin);
  sphere2(add, head, .24, t.skin);
  sphere2(add, [head[0] - fx * .06, head[1] - fy * .06, head[2] + .08], .205, t.hair);
  const shR = P(shA, .36, shZ - .03), shL = P(shA, -.36, shZ - .03);
  const armR = pose.armR == null ? 0 : pose.armR, armL = pose.armL == null ? .08 : pose.armL;
  const elbowR = P(shA + Math.sin(armR) * .46, .4, shZ - .03 - Math.cos(armR) * .46);
  const handR = P(shA + Math.sin(armR + .18) * .95, .42, shZ - .03 - Math.cos(armR + .18) * .95);
  const elbowL = P(shA + Math.sin(armL) * .46, -.42, shZ - .03 - Math.cos(armL) * .46);
  const handL = P(shA + Math.sin(armL + .2) * .9, -.43, shZ - .03 - Math.cos(armL + .2) * .9);
  add(shR, elbowR, .12, .1, shirt); add(elbowR, handR, .09, .08, skin);
  add(shL, elbowL, .12, .1, shirt); add(elbowL, handL, .09, .08, skin);
  return handR;
}
export function sphere2(add: (a: Vec3, b: Vec3, r0: number, r1: number, f: (z: number) => Color) => void, c: Vec3, r: number, color: Color) { add(c, c, r, r, () => color); }
export const dynamicAdd = (a: Vec3, b: Vec3, r0: number, r1: number, f: (z: number) => Color): void => { capsule(a, b, r0, r1, f, 'solid'); queueShadow(a, r0, b, r1); };
export const pendingShadows: ShadowPart[] = [];
export function flushShadows() {
  for (const shadow of pendingShadows) {
    const a = shadow.a, ra = shadow.ra, c = shadow.b;
    const n = Math.max(1, Math.ceil(Math.hypot(c[0] - a[0], c[1] - a[1], c[2] - a[2]) / .25));
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      castShadow(lerp(a[0], c[0], t), lerp(a[1], c[1], t), lerp(a[2], c[2], t), ra * .9, 1, 0);
    }
    if (a[2] < .25) castShadow(a[0], a[1], 0, .2, 2, 0); // contact under the feet
  }
}
export function drawDots(points: number[][], color: u32) {
  for (const [sx, sy] of points) {
    const ix = sx | 0, iy = sy | 0;
    if (ix >= 0 && iy >= 0 && ix < W && iy < H) pix[iy * W + ix] = color;
  }
}
const ARROW: string[] = [
  '....ooooo....',
  '....oXXXo....',
  '....oXXXo....',
  '....oXXXo....',
  'oooooXXXooooo',
  'oXXXXXXXXXXXo',
  '.oXXXXXXXXXo.',
  '..oXXXXXXXo..',
  '...oXXXXXo...',
  '....oXXXo....',
  '.....oXo.....',
  '......o......',
];
export const INK = rgb(28, 27, 25), SIGNAL = rgb(255, 214, 10), PAPER = rgb(255, 255, 255);
// signals get a white halo, so they separate from whatever busy detail sits behind them
export function haloDots(points: number[][]) {
  const halo: number[][] = [];
  for (const [x, y] of points) for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) halo.push([x + dx, y + dy]);
  drawDots(halo, PAPER);
}
// a bobbing arrow whose tip points at (sx, sy)
export function drawArrow(sx: number, sy: number, time: number, color: u32 = SIGNAL) {
  const bob = STILL ? 0 : Math.floor(time * 3) % 2 * 2;
  const left = Math.round(sx) - 6, top = Math.round(sy) - ARROW.length - bob;
  const ink: number[][] = [], fill: number[][] = [];
  ARROW.forEach((row: string, y: number) => { for (let x = 0; x < row.length; x++) {
    if (row[x] === 'o') ink.push([left + x, top + y]);
    if (row[x] === 'X') fill.push([left + x, top + y]);
  } });
  haloDots(ink);
  drawDots(ink, INK);
  drawDots(fill, color);
}

/** The same copy for the pixels of a rectangle (x1, y1 excluded) of buffers W wide: the part of the picture that is shown. */
export function copyRect<T>(destination: T[], source: T[], x0: number, y0: number, x1: number, y1: number): void {
  for (let y = y0; y < y1; y++) for (let i = y * W + x0, end = y * W + x1; i < end; i++) destination[i] = source[i];
}
export function copyInto<T>(destination: T[], source: T[]): void {
  for (let i = 0; i < source.length; i++) destination[i] = source[i];
}
export function queueShadow(a: Vec3, ra: number, b: Vec3, rb: number): void {
  pendingShadows.push({ a, ra, b, rb });
}
/** Gives every per-pixel buffer a new window size. The contents are lost: the caller bakes its scene again. */
export function resizeBuffer(w: number, h: number): void {
  if (w === W && h === H) return;
  W = w; H = h; CX0 = 0; CY0 = 0; CX1 = w; CY1 = h;
  const n = w * h;
  pix = Array.from({ length: n }, (): u32 => 0); zb = Array.from({ length: n }, (): number => -1e9);
  bakedPix = Array.from({ length: n }, (): u32 => 0); bakedZ = Array.from({ length: n }, (): number => -1e9);
  ground = Array.from({ length: n }, (): number => 0); shadowMask = Array.from({ length: n }, (): number => 0);
  groundZ = Array.from({ length: n }, (): number => -1e9); kinds = Array.from({ length: n }, (): number => 0);
  staticShadow = Array.from({ length: n }, (): number => 0);
  tufts.length = 0; leaves.length = 0; pendingShadows.length = 0;
}
/* A second set of per-pixel buffers for baking a piece of a bigger picture (a scrolling chunk) without touching the frame on screen. */
interface BufferSet { w: number; h: number; pix: u32[]; zb: number[]; bakedPix: u32[]; bakedZ: number[]; ground: number[]; shadowMask: number[]; groundZ: number[]; kinds: number[]; staticShadow: number[]; }
let parked: BufferSet | null = null, saved: BufferSet | null = null, savedPX = 0, savedPY = 0;
const bakeLists = { tufts: [] as Tuft[], leaves: [] as Leaf[] };
function currentSet(): BufferSet { return { w: W, h: H, pix, zb, bakedPix, bakedZ, ground, shadowMask, groundZ, kinds, staticShadow }; }
function install(b: BufferSet): void {
  W = b.w; H = b.h; pix = b.pix; zb = b.zb; bakedPix = b.bakedPix; bakedZ = b.bakedZ; ground = b.ground; shadowMask = b.shadowMask; groundZ = b.groundZ; kinds = b.kinds; staticShadow = b.staticShadow;
}
/** Starts a bake of a w x h piece (or, with `resume`, takes up the one that the last slice left in the buffers): the renderer's buffers are swapped for a cleared set of that size (kept for the next bake), the clip and the layer origin
 *  are reset (the caller sets them), and the tufts and leaves grown meanwhile are collected apart. leaveBake() puts the frame's buffers back. */
export function enterBake(w: number, h: number, resume: boolean = false): void {
  if (saved) throw new Error('bake already started');
  saved = currentSet(); savedPX = PX; savedPY = PY;
  const n = w * h;
  if (resume && parked && parked.w === w && parked.h === h) {   // the next slice of the same bake: what the buffers hold stays
    install(parked);
    CX0 = 0; CY0 = 0; CX1 = w; CY1 = h; pendingShadows.length = 0;
    return;
  }
  if (!parked || parked.w !== w || parked.h !== h) {
    parked = { w, h, pix: Array.from({ length: n }, (): u32 => 0), zb: Array.from({ length: n }, (): number => -1e9), bakedPix: Array.from({ length: n }, (): u32 => 0), bakedZ: Array.from({ length: n }, (): number => -1e9),
      ground: Array.from({ length: n }, (): number => 0), shadowMask: Array.from({ length: n }, (): number => 0), groundZ: Array.from({ length: n }, (): number => -1e9),
      kinds: Array.from({ length: n }, (): number => 0), staticShadow: Array.from({ length: n }, (): number => 0) };
  } else {
    parked.pix.fill(0); parked.zb.fill(-1e9); parked.bakedPix.fill(0); parked.bakedZ.fill(-1e9); parked.ground.fill(0); parked.shadowMask.fill(0); parked.groundZ.fill(-1e9); parked.kinds.fill(0); parked.staticShadow.fill(0);
  }
  install(parked);
  bakeLists.tufts = tufts.splice(0, tufts.length); bakeLists.leaves = leaves.splice(0, leaves.length);   // the frame's own lists wait
  CX0 = 0; CY0 = 0; CX1 = w; CY1 = h; PX = 0; PY = 0; pendingShadows.length = 0;
}
/** Ends the bake: returns what it grew, puts the frame's buffers and lists back. The baked set is the one given back by the next enterBake: copy what you keep first. */
export function leaveBake(): { tufts: Tuft[]; leaves: Leaf[] } {
  if (!saved) throw new Error('no bake started');
  const grown = { tufts: tufts.splice(0, tufts.length), leaves: leaves.splice(0, leaves.length) };
  for (const t of bakeLists.tufts) tufts.push(t);
  for (const l of bakeLists.leaves) leaves.push(l);
  bakeLists.tufts = []; bakeLists.leaves = [];
  install(saved); saved = null; PX = savedPX; PY = savedPY;
  CX0 = 0; CY0 = 0; CX1 = W; CY1 = H;
  return grown;
}
/** Zoom and camera: S pixels per world unit, and the screen position of the world origin. Everything projected after it follows. */
export function setView(scale: number, originX: number, originY: number): void {
  S = scale; OX = originX; OY = originY;
  GRADIENT_Y = COS / (S * SIN);
}
/** Runs `draw` with the view at the middle of the buffer (and no scrolling), as a model bake needs, then puts the camera back. */
export function inBakeView(draw: () => void): void {
  const ox = OX, oy = OY, px = PX, py = PY, c0 = CX0, c1 = CY0, c2 = CX1, c3 = CY1;
  OX = W / 2; OY = H * .6; PX = 0; PY = 0; CX0 = 0; CY0 = 0; CX1 = W; CY1 = H;
  draw();
  OX = ox; OY = oy; PX = px; PY = py; CX0 = c0; CY0 = c1; CX1 = c2; CY1 = c3;
}
/** A number that changes when the light, the ramps or the zoom change: what a baked frame depends on besides its own draw code. */
export function lightingHash(): number {
  let h = 2166136261;
  const mixIn = (v: number): void => { h = Math.imul(h ^ (Math.round(v * 1000) | 0), 16777619) >>> 0; };
  for (let i = 0; i < 3; i++) { mixIn(COOL[i]); mixIn(WARM[i]); }
  for (const probe of [[128, 128, 128], [200, 90, 60], [60, 120, 200]]) for (const c of rampOf(probe)) mixIn(c);
  mixIn(S); mixIn(W); mixIn(H);
  return h;
}
export function configureRenderer(originY: number, shadowX: number, shadowY: number): void {
  setLighting([46, 38, 84], [255, 232, 180]);
  setVegetation([[34,62,50],[52,88,52],[82,118,54],[124,146,62],[168,172,76]], [58,84,62], [100,126,78], [146,162,112]);
  OY = H / 2 + originY;
  SHADOW_X = shadowX;
  SHADOW_Y = shadowY;
  pix.fill(rgb(255, 255, 255)); zb.fill(-1e9); groundZ.fill(-1e9);
  ground.fill(0); kinds.fill(0); shadowMask.fill(0); staticShadow.fill(0);
  bakedPix.fill(0); bakedZ.fill(-1e9);
  tufts.length = 0; leaves.length = 0; pendingShadows.length = 0;
}

export function rgbColor(c: Color): u32 { return rgb(c[0], c[1], c[2]); }
export function projectVector(point: Vec3) { return project(point[0], point[1], point[2]); }
export function castShadowVector(point: Vec3, radius: number, strength: number, dither: number): void { castShadow(point[0], point[1], point[2], radius, strength, dither); }
export function captureLeaf(x: number, y: number, z: number, radius: number, color: Color, k: number, shadowRadius: number, windHeight: number): void {
  capture = [];
  capturing = true;
  sphere(x, y, z, radius, color, 'rough');
  leaves.push({ x, y, z: windHeight, k, r: shadowRadius, pixels: capture });
  capturing = false;
}

/** The packed form of a CachedModel (what an atlas file holds): one entry per lit pixel, offsets from the bake origin. */
export interface ModelArrays { originX: number; originY: number; xs: number[]; ys: number[]; depths: number[]; colors: u32[]; }

/** A model is baked once; its lit color/depth samples remain in the same world projection. */
export class CachedModel {
  private xs: number[] = [];
  private ys: number[] = [];
  private depths: number[] = [];
  private colors: u32[] = [];
  /** Tight pixel extents from the bake origin: x0, y0, x1, y1 (ends excluded). */
  bounds: number[] = [0, 0, 0, 0];
  private originX: number;
  private originY: number;
  /** Reads the pixels of the buffer inside the box (x0, y0 included, x1, y1 excluded), row by row. */
  constructor(x0: number, y0: number, x1: number, y1: number) {
    const origin = project(0, 0, 0);
    this.originX = origin.sx; this.originY = origin.sy;
    for (let iy = y0; iy < y1; iy++) for (let ix = x0; ix < x1; ix++) {
      const i = iy * W + ix;
      if (zb[i] <= -1e8) continue;
      this.xs.push(ix); this.ys.push(iy);
      this.depths.push(zb[i]); this.colors.push(pix[i]);
    }
    this.measureBounds();
  }
  get count(): number { return this.colors.length; }
  private measureBounds(): void {
    if (this.xs.length === 0) return;
    let x0 = this.xs[0], y0 = this.ys[0], x1 = x0, y1 = y0;
    for (let k = 1; k < this.xs.length; k++) {
      x0 = Math.min(x0, this.xs[k]); y0 = Math.min(y0, this.ys[k]);
      x1 = Math.max(x1, this.xs[k]); y1 = Math.max(y1, this.ys[k]);
    }
    this.bounds = [x0 - this.originX, y0 - this.originY, x1 + 1 - this.originX, y1 + 1 - this.originY];
  }
  toArrays(): ModelArrays { return { originX: this.originX, originY: this.originY, xs: this.xs.slice(), ys: this.ys.slice(), depths: this.depths.slice(), colors: this.colors.slice() }; }
  static fromArrays(a: ModelArrays): CachedModel {
    const m = new CachedModel(0, 0, 0, 0);
    m.originX = a.originX; m.originY = a.originY; m.xs = a.xs.slice(); m.ys = a.ys.slice(); m.depths = a.depths.slice(); m.colors = a.colors.slice();
    m.measureBounds();
    return m;
  }
  drawAt(x: number, y: number, z: number): void {
    const at = project(x, y, z);
    const dx = Math.round(at.sx - this.originX), dy = Math.round(at.sy - this.originY);
    for (let k = 0; k < this.colors.length; k++) {
      const ix = this.xs[k] + dx, iy = this.ys[k] + dy;
      if (ix < CX0 || ix >= CX1 || iy < CY0 || iy >= CY1) continue;
      const index = iy * W + ix, depth = this.depths[k] + at.d;
      if (depth <= zb[index]) continue;
      pix[index] = this.colors[k]; zb[index] = depth;
    }
  }
}

// Baking a model. beginModel points the renderer at a private scratch picture (same size, kept clean) so the live scene is never touched: the
// scene's own pix and zb come back at captureModel, and a model can be baked in the middle of a frame. The box of what the draw calls wrote is
// tracked, so a bake reads and clears only that box. A game that draws a model into its live scene and calls captureModel alone still gets
// the whole buffer scanned, as before.
let modelling = false;
let liveColors: u32[] = [], liveDepth: number[] = [];
let scratchColors: u32[] = [], scratchDepth: number[] = [];
let boxX0 = 1e9, boxY0 = 1e9, boxX1 = -1, boxY1 = -1;      // pixels written since beginModel: x0, y0 included, x1, y1 included
function touchBox(x0: number, y0: number, x1: number, y1: number): void {
  if (x0 < boxX0) boxX0 = x0;
  if (y0 < boxY0) boxY0 = y0;
  if (x1 > boxX1) boxX1 = x1;
  if (y1 > boxY1) boxY1 = y1;
}
/** For code that rewrites the whole picture while baking (the fixed-detail resize): the next capture reads everything. */
export function touchModelBuffer(): void { touchBox(0, 0, W - 1, H - 1); }
function clearModelBox(): void {
  for (let iy = Math.max(0, boxY0); iy <= Math.min(H - 1, boxY1); iy++) for (let ix = Math.max(0, boxX0); ix <= Math.min(W - 1, boxX1); ix++) { scratchColors[iy * W + ix] = 0; scratchDepth[iy * W + ix] = -1e9; }
  boxX0 = 1e9; boxY0 = 1e9; boxX1 = -1; boxY1 = -1;
}
/** For the tests: make every bake read the whole buffer, as the first version did, to prove the box loses nothing. */
let fullModelScan = false;
export function setFullModelScan(on: boolean): void { fullModelScan = on; }
export function beginModel(): void {
  if (modelling) { clearModelBox(); if (fullModelScan) touchModelBuffer(); return; }
  if (scratchColors.length !== W * H) { scratchColors = Array.from({ length: W * H }, (): u32 => 0); scratchDepth = Array.from({ length: W * H }, (): number => -1e9); }
  liveColors = pix; liveDepth = zb; pix = scratchColors; zb = scratchDepth; modelling = true;
  boxX0 = 1e9; boxY0 = 1e9; boxX1 = -1; boxY1 = -1;
  if (fullModelScan) touchModelBuffer();
}
export function captureModel(): CachedModel {
  if (!modelling) return new CachedModel(0, 0, W, H);
  const m = new CachedModel(Math.max(0, boxX0), Math.max(0, boxY0), Math.min(W, boxX1 + 1), Math.min(H, boxY1 + 1));
  clearModelBox();
  scratchColors = pix; scratchDepth = zb; pix = liveColors; zb = liveDepth; modelling = false;
  return m;
}

export function setLighting(cool: Color, warm: Color): void {
  for (let i = 0; i < 3; i++) { COOL[i] = cool[i]; WARM[i] = warm[i]; }
  ramps.clear();
}
export function setVegetation(grass: Color[], deep: Color, mid: Color, light: Color): void {
  for (let i = 0; i < grass.length; i++) {
    GRASS[i] = grass[i];
    tuftLit[i] = rgbColor(grass[i]);
    tuftDark[i] = rgb(grass[i][0] * .54, grass[i][1] * .52, grass[i][2] * .72);
  }
  for (let i = 0; i < 3; i++) { LEAF_DEEP[i] = deep[i]; LEAF_MID[i] = mid[i]; LEAF_SILVER[i] = light[i]; }
}
