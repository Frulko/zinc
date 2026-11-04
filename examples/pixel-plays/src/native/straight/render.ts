import {
  W, H, pix, zb, bakedPix, bakedZ, shadowMask, Color, Vec3, Pose, Palette, copyRect, setClip, clearClip, shadeEdgesRect,
  project, plot, rgb, sphere, capsule, castShadow, figure, dynamicAdd, pendingShadows, flushShadows,
  applyShadows, ease, clamp, hash, noise, bayerAt, lerp,
} from '../renderer';
import { waterPoint } from '../models/water';
import { gull } from '../models/animals';
import {
  g, Tile, KIND_BEACH, KIND_TREASURE, VIEW_X, VIEW_Y, VIEW_W, VIEW_H, shoreU, xOf, yOf, yawOf, world, setOrigin,
} from './state';
import { drawRowboat, drawChest, tileVisible } from './scenery';
import type { ScrollLayer } from '../scroll';

// A pirate: red bandana, striped shirt, a sash, boots, a short beard and a gold ring in the ear.
const PIRATE: Palette = { shirt: [232, 226, 206], stripe: [46, 44, 58], legs: [58, 60, 78], hair: [38, 30, 28], skin: [208, 156, 118] };
const WHITE = rgb(255, 255, 255);
const STEEL: Color = [200, 206, 210], HAT: Color = [38, 34, 46], HANDLE: Color = [140, 98, 56], GOLD: Color = [232, 182, 64];
const RED: Color = [186, 44, 50], BOOT: Color = [48, 34, 30], BEARD: Color = [44, 32, 28];
const at = (u: number, v: number, z: number): Vec3 => [xOf(u, v), yOf(u, v), z];
const steel = (): Color => STEEL, handle = (): Color => HANDLE, hat = (): Color => HAT, gold = (): Color => GOLD;
const red = (): Color => RED, boot = (): Color => BOOT, beard = (): Color => BEARD;
export const GULL_CYCLE = 26;

/** A point in the pirate's frame: `a` along its facing, `b` to its side, `c` up. */
function frame(px: number, py: number, yaw: number, k: number) {
  const fx = Math.cos(yaw), fy = Math.sin(yaw), sx = -fy, sy = fx;
  return (a: number, b: number, c: number): Vec3 => [px + (fx * a + sx * b) * k, py + (fy * a + sy * b) * k, c * k];
}

function drawPirate(): void {
  const k = .85, x = xOf(g.u, g.v), y = yOf(g.u, g.v), yaw = yawOf(g.dir);
  const beat = Math.floor(g.time * 10) % 4;                      // hand-stepped, like the river's paddle
  const swing = g.moving ? (beat === 0 ? 1 : beat === 2 ? -1 : 0) : 0;
  let crouch = 0, lean = 0, armR = 0, armL = .08;
  if (swing !== 0) { armR = swing * .6; armL = -swing * .6; }
  if (g.endShovel === 1) { crouch = .15; armR = 1.05; armL = 1.05; }
  if (g.endShovel === 2) { crouch = .65; lean = .5; armR = 1.25; armL = 1.25; }
  const stance = g.moving ? swing * .32 : .2;
  const pose: Pose = { scale: k, stance, crouch, lean, armR, armL };
  const hand = figure(x, y, yaw, pose, PIRATE, dynamicAdd);
  const P = frame(x, y, yaw, k);
  const hipZ = 1.28 - crouch * .4, hipA = -crouch * .15, shA = hipA + Math.sin(lean) * .95, shZ = hipZ + Math.cos(lean) * .95;
  const headA = shA + Math.sin(lean) * .32, headZ = shZ + .36;
  // boots over the white shoes the shared figure wears
  const kneeB = P(-stance * .4 + crouch * .12, .22, .68 - crouch * .1), footB = P(-stance * 1.2, .2, .12);
  const kneeF = P(stance * 1.2 + crouch * .34, -.22, .72 - crouch * .08), footF = P(stance * 2, -.2, .12);
  dynamicAdd(kneeB, footB, .18 * k, .14 * k, boot); dynamicAdd(kneeF, footF, .18 * k, .14 * k, boot);
  dynamicAdd(footB, P(-stance * 1.2 + .2, .2, .08), .13 * k, .12 * k, boot);
  dynamicAdd(footF, P(stance * 2 + .2, -.2, .08), .13 * k, .12 * k, boot);
  // the sash, its tail, and a gold buckle
  dynamicAdd(P(hipA, -.3, hipZ + .3), P(hipA, .3, hipZ + .3), .31 * k, .31 * k, red);
  dynamicAdd(P(hipA + .02, .34, hipZ + .26), P(hipA - .16, .42, hipZ - .3), .09 * k, .06 * k, red);
  const buckle = P(hipA + .32, 0, hipZ + .3);
  dynamicAdd(buckle, buckle, .1 * k, .1 * k, gold);
  // bandana, its knot, a short beard and a gold ring
  const cap = P(headA, 0, headZ + .1);
  dynamicAdd(cap, cap, .25 * k, .25 * k, red);
  dynamicAdd(P(headA - .22, 0, headZ + .12), P(headA - .55, .12, headZ - .12), .08 * k, .05 * k, red);
  dynamicAdd(P(headA + .2, 0, headZ - .16), P(headA + .13, 0, headZ - .3), .12 * k, .1 * k, beard);
  const ear = P(headA, .24, headZ - .02);
  dynamicAdd(ear, ear, .06 * k, .06 * k, gold);
  if (g.hat) {                                                   // the tricorne, with a gold edge
    dynamicAdd(P(headA, -.46, headZ + .22), P(headA, .46, headZ + .22), .11 * k, .11 * k, hat);
    dynamicAdd(P(headA - .4, -.2, headZ + .2), P(headA + .4, -.2, headZ + .2), .08 * k, .08 * k, hat);
    dynamicAdd(P(headA - .4, .2, headZ + .2), P(headA + .4, .2, headZ + .2), .08 * k, .08 * k, hat);
    const top = P(headA, 0, headZ + .36);
    dynamicAdd(top, top, .24 * k, .24 * k, hat);
    const edge = P(headA + .42, 0, headZ + .26);
    dynamicAdd(edge, edge, .07 * k, .07 * k, gold);
  }
  if (g.sword) {                                                 // a curved cutlass on the hip
    const grip = P(shA - .1, -.5, hipZ + .15), mid = P(shA - .5, -.58, hipZ - .45), tip = P(shA - .72, -.5, hipZ - .95);
    dynamicAdd(grip, grip, .1 * k, .1 * k, gold);
    dynamicAdd(grip, mid, .045 * k, .04 * k, steel);
    dynamicAdd(mid, tip, .04 * k, .02 * k, steel);
  }
  if (g.shovel) {                                                // over the shoulder
    const top = P(shA - .55, .5, shZ + 1.1);
    dynamicAdd([hand[0], hand[1], hand[2] - .3 * k], top, .05 * k, .05 * k, handle);
    dynamicAdd(top, [top[0] - Math.cos(yaw) * .12 * k, top[1] - Math.sin(yaw) * .12 * k, top[2] + .34 * k], .17 * k, .19 * k, steel);
  }
  if (g.endShovel === 1) {                                       // carried low, in front
    const tip = P(shA + 1.3, .42, .5);
    dynamicAdd(hand, tip, .05 * k, .05 * k, handle);
    dynamicAdd(tip, P(shA + 1.5, .42, .2), .19 * k, .16 * k, steel);
  }
  if (g.endShovel === 2) {                                       // planted in the sand
    const grip = P(shA + 1.0, .42, 1.9), blade = P(shA + 1.05, .42, .12), hole = P(1.1, 0, 0);
    dynamicAdd(hand, grip, .05 * k, .05 * k, handle);
    dynamicAdd(grip, blade, .05 * k, .05 * k, handle);
    dynamicAdd(blade, P(shA + 1.05, .42, 0), .2 * k, .12 * k, steel);
    for (let n = 0; n < 9; n++) {                                // sand thrown out of the hole
      const age = (g.timerAnim * 1.6 + hash(n, 3)) % 1, a = hash(n, 5) * 6.283;
      plot(hole[0] + Math.cos(a) * age * 1.2, hole[1] + Math.sin(a) * age * 1.2, age * 2.2 - age * age * 2.4 + .2, rgb(214, 184, 118));
    }
  }
}

function footprints(t: Tile): void {
  const color = rgb(166, 126, 74), dark = rgb(120, 88, 52);
  const s = t.steps;
  for (let i = 0; i < s.length; i += 2) {
    plot(xOf(s[i], s[i + 1]), yOf(s[i], s[i + 1]), .02, i % 4 === 0 ? color : dark);
    plot(xOf(s[i] + .12, s[i + 1]), yOf(s[i] + .12, s[i + 1]), .02, color);
  }
}

function dynamicItems(t: Tile): void {
  if (t.sword) {
    dynamicAdd(at(t.swordU - .6, 1.5, .1), at(t.swordU + .1, 1.5, .12), .05, .04, steel);
    dynamicAdd(at(t.swordU + .1, 1.5, .12), at(t.swordU + .6, 1.7, .1), .04, .02, steel);
    dynamicAdd(at(t.swordU - .65, 1.5, .1), at(t.swordU - .65, 1.5, .1), .12, .12, gold);
  }
  if (t.hat) {
    dynamicAdd(at(t.hatU - .4, 1.5, .18), at(t.hatU + .4, 1.5, .18), .12, .12, hat);
    dynamicAdd(at(t.hatU, 1.5, .3), at(t.hatU, 1.5, .3), .26, .26, hat);
    dynamicAdd(at(t.hatU + .4, 1.5, .24), at(t.hatU + .4, 1.5, .24), .07, .07, gold);
  }
  if (t.shovel) {
    dynamicAdd(at(3.0, -1.6, .12), at(4.0, -1.6, .12), .045, .045, handle);
    dynamicAdd(at(2.9, -1.6, .1), at(2.35, -1.6, .08), .19, .17, steel);
  }
  if (g.endSword && t === g.tile) {                              // left standing where the pirate dropped it
    dynamicAdd(at(-7.44, 1, .05), at(-7.44, 1, 1.35), .05, .035, steel);
    dynamicAdd(at(-7.78, 1, 1.0), at(-7.1, 1, 1.0), .06, .06, gold);
  }
}

/** Swells run in from the open sea: short crests that tighten, whiten and break on the shore, leaving a thin film of
 *  foam on the wet sand that slides back out. Each crest keeps its own place along the beach and its own pace. */
function swells(time: number): void {
  for (let n = 0; n < 34; n++) {
    const v0 = (hash(n, 61) - .5) * 15, long = 1 + hash(n, 62) * 1.4, pace = .32 + hash(n, 63) * .18;
    const travel = 6.5, run = (time * pace + hash(n, 64) * 9) % 1;       // 0 far out .. 1 on the shore
    const dist = travel * (1 - run), near = clamp(1 - dist / 2.4, 0, 1);
    const fade = run > .9 ? (1 - run) * 10 : 1;
    if (fade < .3) continue;
    for (let s = -long; s <= long; s += .12) {
      const v = v0 + s;
      if (v < -6.3 || v > 7) continue;
      const u = shoreU(v) - dist + s * s * .12;                           // a shallow arc
      const crest = near > .6 ? rgb(228, 242, 230) : near > .25 ? rgb(176, 214, 196) : rgb(120, 178, 160);
      waterPoint(xOf(u, v), yOf(u, v), crest);
      if (near > .25) waterPoint(xOf(u - .13, v), yOf(u - .13, v), near > .6 ? rgb(176, 214, 196) : rgb(94, 154, 140));
    }
  }
  const cycle = (time * .4) % 1;                                          // the film of foam climbs, then slides back
  const wash = cycle < .3 ? Math.sin(cycle / .3 * Math.PI * .5) : Math.max(0, 1 - (cycle - .3) / .7);
  for (let v = -5.4; v < 5.6; v += .09) {
    if (noise(v * 1.4, 3) < .3 + (1 - wash) * .25) continue;
    const front = shoreU(v) + .15 + wash * 1.1 + Math.sin(v * 2.4) * .08;
    plot(xOf(front, v), yOf(front, v), .02, rgb(236, 244, 232));
    if (wash > .35) plot(xOf(front - .2, v), yOf(front - .2, v), .02, rgb(198, 222, 206));
  }
}

function sparkles(time: number): void {
  for (let n = 0; n < 260; n++) {
    const phase = (time * .35 + hash(n, 43)) % 1;
    if (phase > .3) continue;                                     // each glint lives a moment, then another appears
    const u = (hash(n, 41) - .5) * 31, v = (hash(n, 42) - .5) * 24;
    waterPoint(xOf(u, v), yOf(u, v), phase < .15 ? rgb(150, 200, 178) : rgb(118, 176, 158));
  }
}

/** The gull circles over the bay, lands on the boat's mast to watch the pirate, then takes off again. */
function drawGull(time: number): void {
  const T = time % GULL_CYCLE, cx = -6, cv = .5, R = 6.5;
  const circle = (a: number): Vec3 => [cx + Math.cos(a) * R, cv + Math.sin(a) * R * .8, 4 + Math.sin(a * 1.4) * .5];
  const heading = (a: number): number => {
    const du = -Math.sin(a) * R, dv = Math.cos(a) * R * .8;
    return Math.atan2((dv - du) / Math.SQRT2, (du + dv) / Math.SQRT2);
  };
  const perch: Vec3 = [-2.3, 3.1, 3.55];
  let p: Vec3 = perch, yaw = yawOf(3), flying = true;
  if (T < 14) { p = circle(T * .5); yaw = heading(T * .5); }
  else if (T < 17) {
    const e = ease((T - 14) / 3), s = circle(7);
    p = [lerp(s[0], perch[0], e), lerp(s[1], perch[1], e), lerp(s[2], perch[2], e)];
    yaw = e < .85 ? heading(7) : yawOf(3);
  } else if (T < 23) {
    flying = false;
    if (T > 20 && T < 20.4) p = [perch[0], perch[1], perch[2] + .25];
  } else {
    const e = ease((T - 23) / 3), s = circle(0);
    p = [lerp(perch[0], s[0], e), lerp(perch[1], s[1], e), lerp(perch[2], s[2], e)];
    yaw = e < .15 ? yawOf(3) : heading(0);
  }
  gull(xOf(p[0], p[1]), yOf(p[0], p[1]), p[2], time, flying, yaw);
}

function sea(time: number): void {
  sparkles(time); swells(time);
  const bob = Math.round(Math.sin(time * 1.2) * 1) / 10;         // a small ship far out
  capsule(at(-13.4, -5.2, .15 + bob), at(-12.2, -5.2, .15 + bob), .22, .26, (): Color => [226, 222, 206], 'solid');
  capsule(at(-12.8, -5.2, .3 + bob), at(-12.8, -5.2, 1.6 + bob), .03, .03, handle, 'solid');
  for (let n = 0; n < 6; n++) sphere(xOf(-12.9 + n * .06, -5.2), yOf(-12.9 + n * .06, -5.2), .6 + n * .15 + bob, .15, [240, 236, 220], 'solid');
  castShadow(xOf(-12.8, -5.2), yOf(-12.8, -5.2), .3, .5);
  drawGull(time);
}

function treasure(time: number): void {
  const dug = !g.neverLost || g.timerAnim > 1 || g.end === 0 || g.end === 3;
  if (!dug) {
    const crossed = rgb(206, 44, 54);
    for (let s = -1.2; s <= 1.2; s += .05) {
      plot(xOf(1.2 + s, .2 + s * 1.6), yOf(1.2 + s, .2 + s * 1.6), .02, crossed);
      plot(xOf(1.2 + s, .2 - s * 1.6), yOf(1.2 + s, .2 - s * 1.6), .02, crossed);
    }
    return;
  }
  drawChest(xOf(1.2, .2), yOf(1.2, .2), g.neverLost);
  sphere(xOf(2.9, -.9), yOf(2.9, -.9), .3, .8, [214, 184, 118], 'rough');
  if (g.neverLost) {                                              // glints on the gold
    for (let n = 0; n < 7; n++) {
      const phase = (time * 1.3 + hash(n, 6)) % 1;
      if (phase > .25) continue;
      const u = 1.2 + (hash(n, 7) - .5) * 1.9, v = .2 + (hash(n, 8) - .5) * 1;
      plot(xOf(u, v), yOf(u, v), 1.3 + hash(n, 9) * .3, rgb(255, 246, 200));
    }
  }
}

function eyes(t: Tile): void {
  if (t.eyesV === 0 || g.time % 3.2 > 3) return;
  const p = project(xOf(t.eyesU, t.eyesV), yOf(t.eyesU, t.eyesV), .9), ix = Math.round(p.sx), iy = Math.round(p.sy);
  for (const dx of [0, 3]) {
    const x = ix + dx;
    if (x >= 0 && x < W && iy >= 0 && iy < H) pix[iy * W + x] = rgb(255, 36, 56);
  }
}

// The mist is a ragged cloud, not a frame: a rounded window whose edge is pushed in and out by noise, then dithered with
// grain. It never changes, so it is computed once as two lists of pixels.
const fogWhite: number[] = [], fogTint: number[] = [];
let fogReady = false;
function buildMist(): void {
  fogReady = true;
  const cx = VIEW_X + VIEW_W / 2, cy = VIEW_Y + VIEW_H / 2, hx = VIEW_W / 2, hy = VIEW_H / 2;
  for (let iy = VIEW_Y; iy < VIEW_Y + VIEW_H; iy++) {
    for (let ix = VIEW_X; ix < VIEW_X + VIEW_W; ix++) {
      const nx = Math.abs(ix + .5 - cx) / hx, ny = Math.abs(iy + .5 - cy) / hy;
      const r = Math.pow(nx * nx * nx + ny * ny * ny, 1 / 3);
      const v = clamp((r - .62) / .42 + (noise(ix * .045 + 7, iy * .06 + 3) - .5) * .6 + (noise(ix * .16, iy * .21) - .5) * .22, 0, 1);
      if (v <= 0) continue;
      const grain = hash(ix * 3.1, iy * 1.7), w = v * 1.3;
      if (grain < w * w) fogWhite.push(iy * W + ix);
      else if (grain < w * 1.1) fogTint.push(iy * W + ix);
    }
  }
}
function mist(): void {
  if (!fogReady) buildMist();
  for (const i of fogTint) { const c = pix[i]; pix[i] = rgb(lerp(c & 255, 255, .55), lerp(c >> 8 & 255, 255, .55), lerp(c >> 16 & 255, 255, .55)); }
  for (const i of fogWhite) pix[i] = WHITE;
}

/** One frame of the world seen from (camX, camY): the baked picture of the chunks, then everything that moves, tile by tile in its own frame. */
export function drawScene(layer: ScrollLayer, camX: number, camY: number): void {
  const time = Math.floor(g.time * 8) / 8;
  // only the part of the buffer that is shown (the crop, a few pixels wider for the edges) is worked on
  const sx0 = VIEW_X - 2, sy0 = VIEW_Y - 6, sx1 = VIEW_X + VIEW_W + 2, sy1 = VIEW_Y + VIEW_H + 2;
  setClip(sx0, sy0, sx1, sy1);
  copyRect(pix, bakedPix, sx0, sy0, sx1, sy1); copyRect(zb, bakedZ, sx0, sy0, sx1, sy1); shadowMask.fill(0); pendingShadows.length = 0;
 
  layer.wind(camX, camY, time);
  const seen: Tile[] = [];
  for (const t of world) {
    if (!tileVisible(t, camX, camY, W, H)) continue;
    seen.push(t);
    setOrigin(t.u0, t.v0);
    if (t.kind === KIND_BEACH) { sea(time); drawRowboat(xOf(-3.2, 3.1), yOf(-3.2, 3.1)); }
    if (t.kind === KIND_TREASURE) treasure(time);
    footprints(t);
    dynamicItems(t);
  }
 
  setOrigin(g.tile.u0, g.tile.v0);
  drawPirate();
  flushShadows(); applyShadows(bakedZ); shadeEdgesRect(sx0 + 1, sy0 + 1, sx1 - 1, sy1 - 1);
  for (const t of seen) { setOrigin(t.u0, t.v0); eyes(t); }
  setOrigin(0, 0);
  clearClip();
  mist();
}

/** The change of scene, in place on the live frame: the place dissolves into the mist, then the next one comes out of it.
 *  Patches go first, then the grain, so it reads as cloud rolling over the picture. */
export function composeFade(t: number): void {
  const first = t < .5, a = ease(first ? t * 2 : (t - .5) * 2);
  for (let iy = VIEW_Y; iy < VIEW_Y + VIEW_H; iy++) {
    for (let ix = VIEW_X; ix < VIEW_X + VIEW_W; ix++) {
      const covered = hash(ix, iy) * .5 + noise(ix * .05, iy * .08) * .5 < a * 1.05;
      if (first ? covered : !covered) pix[iy * W + ix] = WHITE;
    }
  }
}
