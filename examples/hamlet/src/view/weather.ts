import { rrect } from 'zinc:gfx';
import { W, H, pix, kinds, zb, groundZ, hash, rgb, project, unproject, clamp, KIND_GRASS } from '../pixel';
import { world, tileAt, tileX, tileY } from '../world/world';
import { TICK } from '../constants';
import { settings } from '../settings';
import { dayFraction } from '../rules/needs';
import { monthIndex } from '../rules/season';
import { camera, cropX, cropY, cropWidth, cropHeight, ZOOM_VIEW } from './camera';
import { monthStep, mix, broadAt, snowShare } from './seasons';

// The weather and the light of the day, all view side: nothing here reads or writes the simulation's random numbers (a shower, a snowfall, the light are pure
// functions of the tick and the view clock, so a screenshot of a given tick is always the same). Particles are screen pixels drawn over the finished picture as
// loose runs (the frame restores them from the static picture next frame), under a budget; the tint of the sky is one translucent rectangle drawn by the GPU.
const KIND_WATER = 2;
const BUDGET = 150, SHOWER_SECONDS = 6;
/** Chance that a six-second spell rains, by season (spring, summer, autumn, winter); where the ground takes snow the same spells snow. */
const SHOWER: number[] = [.3, .05, .35, .3];
const smooth = (a: number, b: number, x: number): number => { const k = clamp((x - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };

/** The rain or snow now, 0..1: spells of a few seconds picked by hash from the tick, swelling and fading. */
export function precipitation(): number {
  if (!settings.fx) return 0;
  const sec = world.tick * TICK, spell = Math.floor(sec / SHOWER_SECONDS), f = sec / SHOWER_SECONDS - spell, m = monthStep();
  if (hash(spell, 91) >= mix(SHOWER, m)) return 0;
  return clamp(Math.sin(Math.PI * f) * 2.4, 0, 1) * (.55 + .45 * hash(spell, 92));
}
/** The share of the ground that is white where the camera looks (the biome of the middle of the picture). */
function snowHere(m: number): number {
  const c = unproject(W / 2, H / 2), t = tileAt(clamp(c.x, -world.half + .01, world.half - .01), clamp(c.y, -world.half + .01, world.half - .01));
  return t < 0 ? 0 : snowShare(world.biome[t], m);
}
/** Rain for the sound and the sky: precipitation where it does not snow. */
export function rainAmount(): number { return settings.fx && snowHere(monthStep()) < .12 ? precipitation() : 0; }
/** True from dusk to dawn: the windows and lanterns are lit. */
export function lightsOn(): boolean { return dayFraction() > .66; }

/** The tint laid over the picture: [r, g, b, alpha 0..255]. Dawn warm, noon neutral, dusk orange, night blue; summer evenings last, winter is grey, rain darkens. */
export function skyTint(): number[] {
  const m = monthStep(), f = dayFraction() - mix([0, .05, 0, -.04], m);
  const night = smooth(.66, .8, f) * (1 - smooth(.93, 1, f)), dusk = Math.max(0, 1 - Math.abs(f - .67) / .1);
  const dawn = f < 0 ? 0 : f < .1 ? 1 - f / .1 : f > .96 ? (f - .96) / .04 : 0;
  const rain = rainAmount(), grey = mix([0, 0, .03, .1], m);
  const layers = [[14, 22, 64, night * .36], [255, 138, 48, dusk * .14], [255, 176, 112, dawn * .1], [170, 180, 196, grey], [40, 52, 72, rain * .22]];
  let a = 1, r = 0, g = 0, b = 0, w = 0;
  for (const l of layers) { a *= 1 - l[3]; r += l[0] * l[3]; g += l[1] * l[3]; b += l[2] * l[3]; w += l[3]; }
  return w <= 0 ? [0, 0, 0, 0] : [r / w, g / w, b / w, (1 - a) * 255];
}
/** Draws the tint over the picture's area on the screen (a rectangle: the cost does not depend on the picture). */
export function drawSky(x: number, y: number, w: number, h: number): void {
  if (!settings.fx) return;
  const t = skyTint();
  if (t[3] >= 1) rrect(x, y, w, h, 0, (Math.round(t[0]) << 16) | (Math.round(t[1]) << 8) | Math.round(t[2]), Math.round(t[3]));
}

// ---- the particles ----
let out: number[] = [], left = 0, vx0 = 0, vy0 = 0, vw = 0, vh = 0;
/** One pixel of colour `c` blended over what is there by `k` (1 puts it), remembered as a run to put back next frame. */
function put(x: number, y: number, c: number, k: number): void {
  const ix = Math.floor(x), iy = Math.floor(y);
  if (ix < vx0 || iy < vy0 || ix >= vx0 + vw || iy >= vy0 + vh) return;
  const i = iy * W + ix;
  if (kinds[i] === 0 && zb[i] === groundZ[i]) return;                  // nothing falls over the void around the map
  if (k >= 1) pix[i] = c;
  else {
    const o = pix[i], q = 1 - k;
    pix[i] = rgb(((o & 255) * q + (c & 255) * k), (((o >> 8) & 255) * q + ((c >> 8) & 255) * k), (((o >> 16) & 255) * q + ((c >> 16) & 255) * k));
  }
  out.push(iy, ix, ix);
}
const WHITE = rgb(246, 248, 252);
/** The ground kind under a screen point (0 outside the picture's visible area). */
function kindAt(x: number, y: number): number {
  const ix = Math.floor(x), iy = Math.floor(y);
  return ix < vx0 || iy < vy0 || ix >= vx0 + vw || iy >= vy0 + vh ? 0 : kinds[iy * W + ix] & 7;
}

// Broad-leaved trees in view: the source of falling leaves and petals (found again when the village or the camera changes).
let treesFor = -1, treesSig = -1, treesVisible: number[] = [];
function broadTrees(): number[] {
  const sig = camera.x * 7919 + camera.y * 31 + camera.level * 100003;
  if (treesFor === world.revision && treesSig === sig) return treesVisible;
  treesFor = world.revision; treesSig = sig; treesVisible = [];
  for (let t = 0; t < world.tree.length; t++) {
    if (world.tree[t] !== 4) continue;
    const a = project(tileX(t), tileY(t), 1.5);
    if (a.sx >= vx0 - 6 && a.sx < vx0 + vw + 6 && a.sy >= vy0 - 6 && a.sy < vy0 + vh + 14) treesVisible.push(t);
  }
  return treesVisible;
}
const rate = (k: number, scale: number): number => Math.min(k * scale, left) | 0;

function drift(time: number, m: number, wind: number, scale: number): void {
  const now = broadAt(m), next = broadAt((m + 1) % 12);
  const fall = clamp((now.leaves - next.leaves) * 5, 0, 1), petals = m < 3 ? clamp((now.blossom - .25) * 2, 0, 1) : 0;
  if (fall <= 0 && petals <= 0) return;
  const list = broadTrees();
  if (list.length === 0) return;
  const per = Math.max(1, Math.round(2 * (fall > 0 ? fall : petals))), stride = Math.max(1, Math.ceil(list.length * per / Math.max(1, rate(BUDGET * .8, scale))));
  const colors = fall > 0 ? [now.crown, now.light, [214, 140, 50]] : [[250, 226, 232], [244, 200, 214], [255, 244, 240]];
  for (let n = 0; n < list.length; n += stride) {
    const t = list[n];
    for (let j = 0; j < per && left > 0; j++) {
      const ph = (time * (.16 + .1 * hash(t, j + 40)) + hash(j, t + 41)) % 1, z = 2.3 * (1 - ph) * (1 - ph * .15);
      const a = project(tileX(t) + (hash(t, 7) - .5) * .7, tileY(t) + (hash(t, 8) - .5) * .7, z);
      const c = colors[Math.floor(hash(t, j + 42) * colors.length)];
      put(a.sx + ph * 9 * wind + Math.sin(time * 2.1 + t + j * 3) * 1.6, a.sy + ph * 3 + Math.cos(time * 1.7 + j) * .6, rgb(c[0], c[1], c[2]), 1); left--;
    }
  }
}

function precip(time: number, amount: number, snow: boolean, wind: number, scale: number): void {
  const n = rate(BUDGET * amount * (snow ? 1 : 1.2), scale);
  for (let k = 0; k < n; k++) {
    if (snow) {
      const x = vx0 + (hash(k, 1) * vw + Math.sin(time * .9 + k) * 3 + time * wind * 4) % vw, y = vy0 + (time * (11 + 8 * hash(k, 3)) + hash(k, 2) * vh) % vh;
      put(x, y, WHITE, 1); if (hash(k, 4) > .88) put(x + 1, y, WHITE, .7);
    } else {
      const y = vy0 + (time * 80 + hash(k, 2) * vh) % vh, x = vx0 + (hash(k, 1) * vw + y * .12 * wind) % vw;
      put(x, y, rgb(190, 208, 228), .55); put(x - .35, y - 1, rgb(190, 208, 228), .35); put(x - .7, y - 2, rgb(190, 208, 228), .2);
    }
  }
  left -= n;
  if (snow) return;
  const step = Math.floor(time * 5), age = time * 5 - step;                   // rings on the water: a handful of drops land on it each fifth of a second
  for (let r = 0; r < amount * 70 * scale && left > 0; r++) {
    const x = vx0 + hash(r + step * 7, 5) * vw, y = vy0 + hash(r * 3, step + 6) * vh;
    if (kindAt(x, y) !== KIND_WATER) continue;
    const q = 1 + age * 2.2, c = rgb(200, 222, 228);
    put(x - q, y, c, .6 * (1 - age)); put(x + q, y, c, .6 * (1 - age)); put(x, y - q * .5, c, .6 * (1 - age)); put(x, y + q * .5, c, .6 * (1 - age)); left -= 4;
  }
}

/** A puff of breath by each person or animal in the cold, a little above the head: rises and fades. */
function breath(time: number, cold: number): void {
  if (cold < .2) return;
  const each = (id: number, x: number, y: number, z: number): void => {
    if (left <= 0 || hash(id, 55) > cold + .15) return;
    const ph = (time * .8 + hash(id, 56)) % 1;
    if (ph > .7) return;
    const a = project(x, y, z);
    put(a.sx + 2 + ph * 3, a.sy - ph * 5, WHITE, .55 * (1 - ph / .7)); left--;
    if (ph > .2) { put(a.sx + 3 + ph * 4, a.sy - ph * 6, WHITE, .3 * (1 - ph / .7)); left--; }
  };
  for (let k = 0; k < world.people.length; k++) each(k, world.people[k].x, world.people[k].y, 1.75);
  for (const d of world.deer) each(1000 + d.id, d.x, d.y, 1.15);
}

function fireflies(time: number, glow: number, scale: number): void {
  const n = rate(34 * glow, scale);
  for (let k = 0; k < n; k++) {
    const x = vx0 + hash(k, 61) * vw + Math.sin(time * .7 + k * 1.3) * 6, y = vy0 + hash(k, 62) * vh + Math.cos(time * .6 + k * 2.1) * 4;
    if (kindAt(x, y) !== KIND_GRASS) continue;
    const p = Math.max(0, Math.sin(time * 2.3 + k * 2.7));
    if (p < .15) continue;
    put(x, y, rgb(214, 255, 120), Math.min(1, p * 1.4)); put(x + 1, y, rgb(150, 190, 80), p * .35); left--;
  }
}

/** Warm midday air over the grass: a few pixels brighter and wavering. */
function haze(time: number, hot: number, scale: number): void {
  const n = rate(40 * hot, scale);
  for (let k = 0; k < n; k++) {
    const x = vx0 + hash(k, 71) * vw, y = vy0 + hash(k, 72) * vh, wave = Math.round(Math.sin(time * 3 + k) * 1.2);
    if (kindAt(x, y) !== KIND_GRASS) continue;
    put(x + wave, y, WHITE, .14); put(x + 1 + wave, y, WHITE, .1); left--;
  }
}

/** Seasonal particles over the finished picture, appended as runs (row, first column, last column) to `loose`. `time` is the view clock. */
export function drawWeather(time: number, loose: number[]): void {
  if (!settings.fx) return;
  out = loose; vx0 = cropX(); vy0 = cropY(); vw = cropWidth(camera.level); vh = cropHeight(camera.level); left = BUDGET * 2;
  const m = monthStep(), wind = settings.wind, scale = Math.min(1.6, vw * vh / (340 * 226)) / Math.max(1, ZOOM_VIEW[camera.level] * .8);
  const f = dayFraction() - mix([0, .05, 0, -.04], m), here = snowHere(m), rain = precipitation(), snow = here >= .12;
  const amount = snow ? Math.max(rain, mix([0, 0, .1, .25], m) * Math.min(1, here * 2)) : rain;
  if (amount > .02) precip(time, amount, snow, wind, scale);
  drift(time, m, wind, scale);
  breath(time, mix([0, 0, .4, 1], m) + (f > .6 || f < .06 ? .25 : 0));
  if (rain < .1) {
    const evening = Math.max(0, 1 - Math.abs(f - .74) / .16), hot = f > .1 && f < .55 ? mix([0, 1, .05, 0], m) : 0;
    if (evening > 0) fireflies(time, evening * mix([.5, 1, .1, 0], m), scale);
    if (hot > .05) haze(time, hot, scale);
  }
}
