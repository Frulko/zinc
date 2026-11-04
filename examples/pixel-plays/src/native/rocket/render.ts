import {
  W, H, pix, zb, bakedPix, bakedZ, Color, rgb, rampOf, hash, clamp, lerp, ease, project, sphere, castShadow,
  applyShadows, shadeEdges, copyInto, setClip, clearClip, bayerAt,
} from '../renderer';
import { rocket, ZONE, MISSES, COUNT_FROM } from './state';
import { rocketAt, isNight, TOWERS, TOWER_TOP, SLAB_TOP, HULL_FOOT } from './scenery';

interface Puff { x: number; y: number; z: number; vx: number; vy: number; vz: number; age: number; life: number; size: number; grow: number; seed: number; }
const puffs: Puff[] = [];
let counter = 0;
let spawnClock = 0;
let lastFlash = -10;
const FLAME: Color[] = [[255, 252, 230], [255, 226, 120], [255, 176, 60], [240, 110, 40], [196, 60, 36]];
const GLYPHS: string[] = ['111101101101111', '010110010010111', '111001111100111', '111001111001111', '101101111001001', '111100111001111', '111100111101111', '111001001001001', '111101111101111', '111101111001111'];
const GLYPH_T = '111010010010010', GLYPH_MINUS = '000000111000000', GLYPH_PLUS = '000010111010000';

function rnd(): number { counter++; return hash(counter * 1.37, counter * .71 + 3); }

function puff(x: number, y: number, z: number, vx: number, vy: number, vz: number, size: number, grow: number, life: number): void {
  if (puffs.length > 110) puffs.shift();
  puffs.push({ x, y, z, vx, vy, vz, age: 0, life, size, grow, seed: rnd() * 50 });
}

/** Clear the smoke, back to a quiet pad. */
export function resetEffects(): void { puffs.length = 0; spawnClock = 0; lastFlash = -10; }

/** Exhaust smoke: a blast along the ground at ignition, a column behind the rocket, steam from the fuelled hull while it waits. */
export function stepEffects(dt: number): void {
  for (let i = puffs.length - 1; i >= 0; i--) {
    const p = puffs[i];
    p.age += dt;
    if (p.age > p.life) { puffs.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    const drag = Math.max(0, 1 - dt * 1.4);
    p.vx *= drag; p.vy *= drag; p.vz = p.vz * drag + .35 * dt;
    p.size += p.grow * dt;
  }
  spawnClock -= dt;
  const burning = rocket.phase === 'ignition' || rocket.phase === 'flight';
  if (spawnClock <= 0 && burning && rocket.thrust > .08) {
    spawnClock = .045;
    const low = rocket.z < 5;
    if (low) for (let k = 0; k < 2; k++) {
      const a = rnd() * 6.2832, s = (2.5 + rnd() * 3.5) * (.4 + rocket.thrust);
      puff(Math.cos(a) * 1.2, Math.sin(a) * 1.2, .25 + rnd() * .3, Math.cos(a) * s, Math.sin(a) * s, .2 + rnd() * .5, .9 + rnd() * .6, 1.5, 3.4 + rnd() * 1.4);
    }
    if (rocket.phase === 'flight') puff((rnd() - .5) * .5, (rnd() - .5) * .5, rocket.z + .4, (rnd() - .5) * .8, (rnd() - .5) * .8, -.8, 1.0, 1.0, 3.4 + rnd());
  }
  if (rocket.time - rocket.flash < .05 && rocket.flash !== lastFlash) {
    lastFlash = rocket.flash;
    for (let k = 0; k < 7; k++) {
      const a = rnd() * 6.2832;
      puff(Math.cos(a) * 1.1, Math.sin(a) * 1.1, .3, Math.cos(a) * 2.2, Math.sin(a) * 2.2, .5, .7, 1.0, 1.6);
    }
  }
  if ((rocket.phase === 'count' || rocket.phase === 'window') && rnd() < dt * 3) {
    const a = 1.2 + rnd() * 1.4;
    puff(Math.cos(a) * 1.45, Math.sin(a) * 1.45, 8.4 + rnd() * 1.5, Math.cos(a) * .25, Math.sin(a) * .25, -.2, .22, .3, 1.8);
  }
  if (rocket.phase === 'ready') puffs.length = 0;
}

// ---------- the frame ----------
function pixelMix(i: number, r: number, g: number, b: number, k: number): void {
  const c = pix[i];
  pix[i] = rgb(lerp(c & 255, r, k), lerp(c >> 8 & 255, g, k), lerp(c >> 16 & 255, b, k));
}

function smoke(): void {
  const dark = isNight();
  const ramp = rampOf(dark ? [132, 132, 156] : [238, 234, 230]);
  for (const p of puffs) {
    const at = project(p.x, p.y, p.z), r = Math.max(2, p.size * 5.2), f = p.age / p.life;
    const y0 = Math.max(SLAB_TOP + 3, Math.floor(at.sy - r)), y1 = Math.min(H - 1, Math.ceil(at.sy + r));
    const x0 = Math.max(0, Math.floor(at.sx - r)), x1 = Math.min(W - 1, Math.ceil(at.sx + r));
    for (let iy = y0; iy <= y1; iy++) for (let ix = x0; ix <= x1; ix++) {
      const dx = (ix + .5 - at.sx) / r, dy = (iy + .5 - at.sy) / r, nn = dx * dx + dy * dy;
      if (nn > 1) continue;
      const i = iy * W + ix;
      if (at.d + (1 - nn) * .3 <= zb[i]) continue;
      if (hash(ix * 1.7 + p.seed, iy * 1.3) < f * f * 1.15 + (nn > .55 ? .16 : 0)) continue;
      const l = clamp(-.55 * dx - .6 * dy + .58 * Math.sqrt(1 - nn), 0, 1);
      pix[i] = ramp[clamp(Math.floor(l * 3.6 + .5 + (bayerAt(ix, iy) - .5) * .6), 0, 4)];
    }
  }
}

function blast(thrust: number, frame: number): void {
  if (rocket.z > 4 || thrust < .05) return;
  const c = project(0, 0, .05), rx = (12 + thrust * 26) * (1 - rocket.z / 5), ry = rx * .5;
  for (let iy = Math.max(SLAB_TOP + 3, Math.floor(c.sy - ry)); iy <= Math.min(H - 1, Math.ceil(c.sy + ry)); iy++) {
    for (let ix = Math.max(0, Math.floor(c.sx - rx)); ix <= Math.min(W - 1, Math.ceil(c.sx + rx)); ix++) {
      const d = Math.hypot((ix + .5 - c.sx) / rx, (iy + .5 - c.sy) / ry);
      if (d > 1) continue;
      const i = iy * W + ix;
      if (hash(ix + frame * 3, iy) > thrust * (1 - d * .8)) continue;
      pix[i] = d < .3 ? rgb(255, 250, 220) : d < .6 ? rgb(255, 204, 90) : rgb(240, 120, 44);
    }
  }
}

function flame(thrust: number, frame: number): void {
  if (thrust < .04) return;
  const z0 = rocket.z + HULL_FOOT + .1, length = (1.4 + 5.2 * thrust) * (1 + (hash(frame, 4) - .5) * .2);
  for (let k = 0; k <= 16; k++) {
    const t = k / 16, z = z0 - t * length;
    if (z < .1) break;
    const r = (.66 * (1 - t) ** .8 + .06) * (.35 + thrust * .65) * (1 + (hash(frame, k) - .5) * .18);
    sphere((hash(frame, k + 9) - .5) * .12, (hash(frame, k + 19) - .5) * .12, z, r, FLAME[Math.min(4, Math.floor(t * 5))], 'solid');
  }
}

/** The fire lights the pad: a stepped, dithered pool of warm light that follows the foot of the rocket. */
function glow(): void {
  const k = rocket.thrust;
  if (k < .05) return;
  const c = project(0, 0, Math.min(rocket.z + .5, 10)), night = isNight();
  const R = (night ? 46 : 22) + k * (night ? 70 : 30), power = night ? .5 : .24;
  for (let iy = Math.max(SLAB_TOP + 3, Math.floor(c.sy - R * .62)); iy <= Math.min(H - 1, Math.ceil(c.sy + R * .62)); iy++) {
    for (let ix = Math.max(0, Math.floor(c.sx - R)); ix <= Math.min(W - 1, Math.ceil(c.sx + R)); ix++) {
      const d = Math.hypot(ix + .5 - c.sx, (iy + .5 - c.sy) * 1.6) / R;
      if (d > 1) continue;
      const i = iy * W + ix;
      if (zb[i] < -1e8) continue;
      const level = (1 - d) * k * (rocket.z > 12 ? Math.max(0, 1 - (rocket.z - 12) / 14) : 1);
      const step = clamp(Math.floor(level * 3.2 + (bayerAt(ix, iy) - .5) * 1.1), 0, 3);
      if (step > 0) pixelMix(i, 255, 190, 100, [0, .16, .3, .44][step] * power * 2);
    }
  }
}

function beacons(frame: number): void {
  const on = Math.floor(frame / 8) % 2 === 0;
  for (const t of TOWERS) {
    sphere(t[0], t[1], TOWER_TOP + 2.7, .17, on ? [236, 70, 56] : [92, 42, 44], 'solid');
    if (on && isNight()) {
      const c = project(t[0], t[1], TOWER_TOP + 2.7);
      for (let a = 0; a < 6.28; a += .5) pixelMix(Math.round(c.sy + Math.sin(a) * 4) * W + Math.round(c.sx + Math.cos(a) * 4), 255, 90, 70, .5);
    }
  }
}

// ---------- the launch panel ----------
function fill(x0: number, y0: number, x1: number, y1: number, color: u32): void {
  for (let iy = y0; iy < y1; iy++) for (let ix = x0; ix < x1; ix++) pix[iy * W + ix] = color;
}
function glyph(bits: string, x: number, y: number, scale: number, color: u32): void {
  for (let k = 0; k < 15; k++) if (bits.charAt(k) === '1') fill(x + (k % 3) * scale, y + Math.floor(k / 3) * scale, x + (k % 3 + 1) * scale, y + (Math.floor(k / 3) + 1) * scale, color);
}

function clock(): void {
  const x = 40, y = 46, flash = rocket.time - rocket.flash < .3;
  const ticking = rocket.phase === 'count';
  const live = rocket.phase === 'flight' || rocket.phase === 'ignition' || rocket.phase === 'gone';
  fill(x - 3, y - 3, x + 47, y + 24, rgb(214, 204, 172));
  fill(x - 1, y - 1, x + 45, y + 22, rgb(24, 24, 34));
  const amber = rgb(255, 184, 66), green = rgb(110, 226, 124), red = rgb(240, 78, 62);
  let color = amber;
  let digits = String(rocket.count);
  let mark = GLYPH_MINUS;
  if (rocket.phase === 'window') { color = flash ? red : Math.floor(rocket.time * 4) % 2 === 0 ? green : rgb(46, 110, 60); digits = '0'; }
  else if (live || rocket.launched) { color = green; mark = GLYPH_PLUS; digits = String(Math.min(9, Math.floor(rocket.since))); }
  else if (rocket.phase === 'ready') color = rgb(120, 94, 44);
  else if (rocket.phase === 'over') { color = red; digits = '0'; }
  glyph(GLYPH_T, x + 3, y + 3, 3, color);
  glyph(mark, x + 15, y + 3, 3, color);
  glyph(GLYPHS[Number(digits)], x + 28, y + 3, 3, color);
  // five lamps: one goes out each second
  for (let k = 0; k < COUNT_FROM; k++) {
    const lit = rocket.phase === 'ready' || (ticking ? k < rocket.count : rocket.phase === 'window');
    fill(x + 3 + k * 8, y + 25, x + 8 + k * 8, y + 29, lit ? (rocket.phase === 'window' ? green : red) : rgb(60, 44, 46));
  }
}

function gauge(): void {
  const x0 = 152, x1 = 300, y0 = 228, y1 = 238, width = x1 - x0;
  const showing = rocket.phase !== 'ready' && rocket.phase !== 'count';
  const flash = rocket.time - rocket.flash < .3;
  fill(x0 - 3, y0 - 3, x1 + 3, y1 + 3, flash ? rgb(240, 78, 62) : rgb(28, 27, 25));
  fill(x0, y0, x1, y1, rgb(40, 44, 62));
  if (showing || rocket.phase === 'count') {
    const a = Math.round(x0 + (rocket.centre - ZONE) * width), b = Math.round(x0 + (rocket.centre + ZONE) * width);
    if (showing) {
      fill(a, y0, b, y1, rgb(86, 190, 104));
      fill(Math.round(x0 + rocket.centre * width) - 2, y0, Math.round(x0 + rocket.centre * width) + 2, y1, rgb(196, 252, 204));
    }
  }
  for (let k = 1; k < 10; k++) fill(x0 + Math.round(k * width / 10), y1 - 2, x0 + Math.round(k * width / 10) + 1, y1, rgb(120, 126, 150));
  if (showing) {
    const nx = Math.round(x0 + rocket.needle * width);
    fill(nx - 1, y0 - 4, nx + 2, y1 + 4, rgb(255, 244, 214));
    fill(nx - 3, y0 - 6, nx + 4, y0 - 4, rgb(255, 244, 214));
    fill(nx - 2, y0 - 4, nx + 3, y0 - 3, rgb(255, 244, 214));
  }
  for (let k = 0; k < MISSES; k++) fill(x1 + 9 + k * 8, y0 + 1, x1 + 14 + k * 8, y0 + 6, k < rocket.misses ? rgb(240, 78, 62) : rgb(70, 44, 48));
}

export function drawLaunch(): void {
  const frame = Math.floor(rocket.time * 12);
  copyInto(pix, bakedPix);
  copyInto(zb, bakedZ);
  setClip(0, SLAB_TOP + 3, W, H);
  const shake = rocket.phase === 'ignition' ? rocket.thrust * .13 : rocket.phase === 'flight' && rocket.z < 6 ? .06 : 0;
  const jx = Math.sin(frame * 2.9) * shake, jy = Math.cos(frame * 2.3) * shake;
  blast(rocket.thrust, frame);
  rocketAt(rocket.z, jx, jy);
  flame(rocket.thrust, frame);
  for (let z = 0; z < 17; z += .65) if (rocket.z + z < 14) castShadow(0, 0, rocket.z + z, 1.1, 1, .5);
  applyShadows(bakedZ);
  shadeEdges();
  clearClip();
  smoke();
  glow();
  beacons(frame);
  clock();
  gauge();
}
