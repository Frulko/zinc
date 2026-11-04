import { captureLeaf } from '../renderer';
import { INK, PAPER, SIGNAL } from '../renderer';
// mini-ramp — strict Zinc TypeScript port of Pixel Plays, MIT. See LICENSE.upstream.
import { Color, Vec3, Pose, Palette, ShadowPart, W, H, S, SIN, COS, R2, SHADOW_X, SHADOW_Y, pix, zb, bakedPix, bakedZ, ground, shadowMask, groundZ, GRASS, rgb, rampOf, bayerAt, tint, clamp, lerp, ease, hash, noise, project, unproject, sphere, capsule, box, castShadow, applyShadows, shadeEdges, KIND_GRASS, kinds, WIND_FPS, STILL, staticShadow, growGrass, drawTufts, drawLeaves, bakeOcclusion, plot, growTree, figure, sphere2, dynamicAdd, pendingShadows, flushShadows, drawDots, haloDots, drawArrow, copyInto, queueShadow, configureRenderer, rgbColor, projectVector, castShadowVector } from '../renderer';
import { PixelGame } from '../game';
import { sound, ensureAudio } from '../audio';
import { readBest as readScore, saveBest as saveScore } from '../scores';
import { audioRain, setMotion } from '../audio';
interface Slam { board: { a:number; z:number; va:number; vz:number; spin:number; }; }




const FLAT = 3.6, RADIUS = 4.4, LIP_A = FLAT + RADIUS, DECK_A = 10.6, RAMP_W = 4.6;
const ARC = RADIUS * Math.PI / 2, LIP_S = FLAT + ARC;
const GRAVITY = 12, PUMP = 6, LOW_BOOST = 2.6, ROLL_DRAG = .2, AIR_DRAG = .0042, MIN_FLAT_SPEED = 5;
const MAX_AIR_SPEED = 12.5, LIP_INSET = .3, GAME_LENGTH = 60, MAX_MULTI = 5, GRAB_MIN = .2;
const SHADOW_ALONG = (SHADOW_X - SHADOW_Y) / R2, SHADOW_ACROSS = (SHADOW_X + SHADOW_Y) / R2;
const HINT_AFTER = 2.5, BEST_KEY = 'pixel-plays-mini-ramp-best';

const MASONITE = [150, 108, 74], PLY = [198, 160, 112], FRAME = [122, 88, 58], CONCRETE_TONES = [[176, 172, 164], [184, 180, 171], [192, 188, 178], [200, 196, 186]];
const STEEL = [176, 182, 186], DIRT = [132, 100, 72];
const RIDER = { hoodie: [216, 96, 44], pants: [44, 58, 84], skin: [222, 170, 132], hat: [34, 34, 38], deck: [232, 196, 60], wheel: [244, 238, 222] };
const FRIENDS = [
  { a: -9.9, w: -2.2, shirt: [62, 118, 112], stripe: [62, 118, 112], legs: [50, 48, 56], hair: [34, 28, 26], skin: [196, 146, 110] },
  { a: 9.2, w: -1, shirt: [226, 222, 208], stripe: [176, 64, 56], legs: [70, 84, 106], hair: [120, 76, 44], skin: [222, 170, 132] },
];
const PALMS = [[-11.2, -9, 1], [-5.6, -10.2, 1.22], [1.4, -8.6, .88], [7.4, -10.2, 1.18], [12.6, -8, .98], [15, -1.6, .8], [-15, -.6, .78]];
const PALM_BARK = [128, 104, 80], PALM_RING = [96, 76, 60], PALM_DEEP = [38, 88, 58], PALM_MID = [70, 128, 62], PALM_LIGHT = [132, 168, 72];
const KIND_CONCRETE = 1, KIND_DIRT = 2;
const rampMask = Array.from({ length: W * H }, (): number => 0);

// the ramp runs along screen-horizontal `a`; `w` runs towards the camera
const world = (a: number, w: number, z: number) => [(a + w) / R2, (w - a) / R2, z];
function pointOnRamp(s: number) {
  const n = Math.abs(s), sign = s < 0 ? -1 : 1;
  if (n <= FLAT) return { a: s, z: 0, th: 0 };
  if (n >= LIP_S) return { a: sign * LIP_A + (s - sign * LIP_S), z: RADIUS, th: 0 };
  const t = (n - FLAT) / RADIUS;
  return { a: sign * (FLAT + RADIUS * Math.sin(t)), z: RADIUS * (1 - Math.cos(t)), th: sign * t };
}
function surfaceAt(a: number, w: number) {
  if (Math.abs(w) > RAMP_W) return 0;
  const n = Math.abs(a);
  if (n <= FLAT) return 0;
  if (n >= DECK_A) return 0;
  if (n >= LIP_A) return RADIUS;
  const d = n - FLAT;
  return RADIUS - Math.sqrt(RADIUS * RADIUS - d * d);
}

function groundColor(x: number, y: number, ix: number, iy: number, i: number) {
  const a = (x - y) / R2, w = (x + y) / R2;
  const edge = Math.pow(Math.pow(Math.abs(a) / 16.6, 4) + Math.pow(Math.abs(w + .6) / 11.4, 4), .25);
  const rough = edge + (noise(x * 1.3, y * 1.3) - .5) * .1;
  if (rough > 1.04) return 0;
  if (rough > .94 && hash(ix, iy) < (rough - .94) / .1) return 0;
  const fine = hash(ix, iy);
  if (Math.abs(a) < 13.4 && w < 6.4 && w > -6) {
    kinds[i] = KIND_CONCRETE;
    const joint = Math.abs(a / 4 - Math.round(a / 4)) < .012 || Math.abs((w + 6) / 4 - Math.round((w + 6) / 4)) < .018;
    if (joint && fine > .15) return rgb(150, 146, 140);
    if (fine > .985) return rgb(150, 146, 140);
    const v = .5 + (noise(a * .5, w * .7) - .5) * .8;
    return rgbColor(CONCRETE_TONES[clamp(Math.floor(v * 4 + (bayerAt(ix, iy) - .5) * .6), 0, 3)]);
  }
  if (Math.max(Math.abs(a) - 13.4, w - 6.4, -6 - w) < .3 + noise(x * 2.2, y * 2.2) * .8) {
    kinds[i] = KIND_DIRT;
    return rampOf(DIRT)[clamp(Math.floor(1.5 + (.25 + noise(x * 3, y * 3) * .6) * 2.4 + (bayerAt(ix, iy) - .5) * .9), 1, 4)];
  }
  kinds[i] = KIND_GRASS;
  const t = noise(x * .9, y * .9) * 1.15 + (fine - .5) * .55 - .08;
  return rgbColor(GRASS[clamp(Math.floor(t * 4.2), 0, 3)]);
}
function paint(a: number, w: number, z: number, color: u32, onRamp: boolean = false) {
  const [x, y] = world(a, w, z), p = project(x, y, z), ix = p.sx | 0, iy = p.sy | 0;
  if (ix < 0 || iy < 0 || ix >= W || iy >= H) return;
  const i = iy * W + ix;
  if (p.d <= zb[i]) return;
  zb[i] = p.d;
  pix[i] = color;
  rampMask[i] = onRamp ? 1 : 0;
}
// a leaning ringed trunk under drooping fronds; the fronds sway in drawLeaves like any other leaves
function growPalm(a: number, w: number, scale: number, seed: number) {
  const [bx, by] = world(a, w, 0), height = 5.6 * scale, turn = hash(seed, 1) * 6.283;
  const leanX = Math.cos(turn) * 1.1 * scale, leanY = Math.sin(turn) * 1.1 * scale;
  const trunkAt = (t: number) => [bx + leanX * t * t, by + leanY * t * t, height * t];
  for (let k = 0; k < 7; k++) {
    capsule(trunkAt(k / 7), trunkAt((k + 1) / 7), lerp(.3, .17, k / 7) * scale, lerp(.3, .17, (k + 1) / 7) * scale, z => (Math.floor(z * 3.4) % 2 ? PALM_BARK : PALM_RING), 'rough');
    const q = trunkAt(k / 7);
    castShadow(q[0], q[1], q[2], .24 * scale);
  }
  const top = trunkAt(1);
  for (const [dx, dy] of [[.16, 0], [-.1, .14], [-.04, -.16]]) sphere(top[0] + dx * scale, top[1] + dy * scale, top[2] - .12, .13 * scale, [110, 76, 44], 'solid');
  const fronds = 10;
  for (let f = 0; f < fronds; f++) {
    const angle = f / fronds * 6.283 + hash(seed, f) * .5, length = (2.7 + hash(seed, f + 20) * .9) * scale;
    const fx = Math.cos(angle), fy = Math.sin(angle), rise = .9 + hash(seed, f + 40) * .8;
    for (let n = 1; n <= 11; n++) {
      const u = n / 11, along = length * u, drop = top[2] + scale * (rise * u - 2.4 * u * u);
      const width = .42 * scale * (1 - u * .55);
      for (const side of [-1, 0, 1]) {
        const k = seed * 1000 + f * 40 + n * 3 + side + 1;
        const tone = hash(k, 3) + (side ? 0 : .35) - u * .2;
        const color = tone > .85 ? PALM_LIGHT : tone > .35 ? PALM_MID : PALM_DEEP;
        const lx = top[0] + fx * along - fy * width * side, ly = top[1] + fy * along + fx * width * side;
        captureLeaf(lx, ly, drop - (side ? .22 * scale : 0), (side ? .15 : .12) * scale, color, k, .26 * scale, drop);
      }
    }
  }
}
function bakeRamp() {
  const mason = rampOf(MASONITE), ply = rampOf(PLY), frame = rampOf(FRAME);
  const pick = (ramp: u32[], level: number, ix: number, iy: number) => ramp[clamp(Math.floor(level + (bayerAt(ix, iy) - .5) * .6), 0, 4)];
  for (let s = -LIP_S - (DECK_A - LIP_A); s <= LIP_S + (DECK_A - LIP_A); s += .04) {
    const q = pointOnRamp(s), onDeck = Math.abs(s) > LIP_S;
    const facing = Math.sin(q.th);
    const shade = 3 + (facing > 0 ? .85 * facing : 1.5 * facing);
    for (let w = -RAMP_W; w <= RAMP_W; w += .07) {
      const p = projectVector(world(q.a, w, q.z)), ix = p.sx | 0, iy = p.sy | 0;
      const seamS = Math.abs(s / 2.44 - Math.round(s / 2.44)) < .016, seamW = Math.abs(w / 2.3 - Math.round(w / 2.3)) < .022;
      let level = shade + (noise(s * 1.6, w * 1.6) - .5) * .5;
      if (seamS || seamW) level -= 1;
      if (Math.abs(s) < LIP_S && Math.abs(w - .3) < 1.3) level -= .35; // the line everyone rides is worn darker
      paint(q.a, w, q.z, pick(onDeck ? ply : mason, onDeck ? level + .4 : level, ix, iy), true);
    }
  }
  // the near side shows the ramp's section and its timber frame
  for (let a = -DECK_A; a <= DECK_A; a += .05) {
    const top = surfaceAt(a, 0);
    for (let z = 0; z <= top; z += .05) {
      const p = projectVector(world(a, RAMP_W, z)), ix = p.sx | 0, iy = p.sy | 0;
      const stud = Math.abs(a / 1.7 - Math.round(a / 1.7)) < .03, rail = top - z < .16 || z < .14;
      paint(a, RAMP_W, z, pick(stud || rail ? frame : ply, stud || rail ? 2.4 : 1.9 + (noise(a * 2, z * 3) - .5) * .6, ix, iy));
    }
  }
  for (const side of [-1, 1]) {
    capsule(world(side * LIP_A, -RAMP_W, RADIUS + .03), world(side * LIP_A, RAMP_W, RADIUS + .03), .1, .1, () => STEEL, 'gloss');
    for (const a of [LIP_A + .9, DECK_A - .2]) {
      capsule(world(side * a, -RAMP_W, RADIUS), world(side * a, -RAMP_W, RADIUS + 1.5), .06, .06, () => [70, 74, 78], 'solid');
    }
    capsule(world(side * (LIP_A + .9), -RAMP_W, RADIUS + 1.5), world(side * (DECK_A - .2), -RAMP_W, RADIUS + 1.5), .06, .06, () => [70, 74, 78], 'solid');
  }
  // ladder up to the left deck
  for (const off of [-.5, .5]) capsule(world(-8.6 + off, RAMP_W + .22, 0), world(-8.6 + off, RAMP_W + .22, RADIUS + .5), .06, .06, () => [86, 88, 90], 'solid');
  for (let z = .6; z < RADIUS; z += .75) capsule(world(-9.1, RAMP_W + .22, z), world(-8.1, RAMP_W + .22, z), .05, .05, () => [86, 88, 90], 'solid');
  for (let w = -RAMP_W; w <= RAMP_W; w += .3) for (let z = .4; z <= RADIUS; z += .5) castShadowVector(world(DECK_A, w, z), .32, 1, .4);
}
function bake() {
  zb.fill(-1e9);
  pix.fill(rgb(255, 255, 255));
  for (let iy = 0; iy < H; iy++) for (let ix = 0; ix < W; ix++) {
    const g = unproject(ix + .5, iy + .5), i = iy * W + ix, c = groundColor(g.x, g.y, ix, iy, i);
    if (!c) continue;
    pix[i] = c; ground[i] = 1;
    zb[i] = (g.x + g.y) / R2 * COS;
  }
  growGrass();
  copyInto(groundZ, zb);
  PALMS.forEach(([a, w, scale], k) => growPalm(a, w, scale, k + 1));
  bakeRamp();
  // cone and a crate by the front of the ramp
  const cone = world(-12, 4.4, 0);
  capsule(cone, [cone[0], cone[1], .9], .34, .06, z => (z > .35 && z < .6 ? [240, 236, 224] : [226, 96, 44]), 'solid');
  castShadow(cone[0], cone[1], .3, .3);
  const crate = world(11.8, 5.2, 0);
  box(crate[0] - .5, crate[1] - .5, 0, crate[0] + .5, crate[1] + .5, .7, [146, 108, 66], 6);
  castShadow(crate[0], crate[1], .35, .6);
  bakeOcclusion();
  copyInto(staticShadow, shadowMask);
  applyShadows(groundZ);
  // from here the ramp's surface takes moving shadows like the ground does
  for (let i = 0; i < W * H; i++) if (rampMask[i]) ground[i] = 1;
  copyInto(bakedPix, pix);
  copyInto(bakedZ, zb);
}

/* ---------- game state ---------- */
export const G = {
  phase: 'ready', s: LIP_S, v: 0, air: false, airT: 0, airTotal: 0, airSign: 1, vz: 0, z: RADIUS,
  hold: false, holdT: 0, grabT: 0, score: 0, multi: 1, airs: 0, left: GAME_LENGTH, timer: 0, time: 0,
  best: 0, bestAir: 0, status: '', slam: null as Slam | null, cheer: 0, sinceAir: 0,
};
function resetGame() {
  G.phase = 'ready';
  G.s = LIP_S;
  G.v = 0;
  G.air = false;
  G.z = RADIUS;
  G.hold = false;
  G.score = 0;
  G.multi = 1;
  G.airs = 0;
  G.left = GAME_LENGTH;
  G.timer = 0;
  G.slam = null;
  G.bestAir = 0;
  G.sinceAir = 0;
  setStatus('tap to drop in');
}
function dropIn() {
  G.phase = 'ride';
  G.s = LIP_S - .05;
  G.v = -.6;
  sound('clack', .5);
}
function press() {
  ensureAudio();
  if (G.phase === 'over') { if (G.timer > .8) resetGame(); return; }
  if (G.phase === 'ready') { dropIn(); return; }
  G.hold = true;
  G.holdT = 0;
}
function release() { G.hold = false; }

function takeOff(sign: number) {
  const speed = Math.min(Math.abs(G.v), MAX_AIR_SPEED);
  G.air = true; G.airSign = sign; G.vz = speed; G.z = RADIUS; G.airT = 0;
  G.airTotal = 2 * speed / GRAVITY;
  G.grabT = 0;
  sound('clack', .8);
}
function land() {
  const height = G.vz * G.vz / (2 * GRAVITY);
  G.air = false;
  G.s = G.airSign * LIP_S;
  G.v = -G.airSign * G.vz * .985;
  G.z = RADIUS;
  if (G.hold && G.holdT > .1) return slam();
  G.airs++;
  G.bestAir = Math.max(G.bestAir, height);
  const grabbed = G.grabT >= GRAB_MIN;
  const points = Math.round((10 + height * 12 + (grabbed ? G.grabT * 60 : 0)) * G.multi);
  G.score += points;
  setStatus('+' + points + (grabbed ? ' · grab ' + G.grabT.toFixed(1) + 's' : ''));
  if (grabbed) G.multi = Math.min(MAX_MULTI, G.multi + 1);
  if (height > 3.5) G.cheer = 1.2;
  sound('land', .7);
}
function slam() {
  G.phase = 'slam';
  G.timer = 0;
  G.multi = 1;
  G.slam = { board: { a: pointOnRamp(G.s).a, z: RADIUS, va: -G.airSign * 3, vz: 3.4, spin: 0 } };
  G.v = -G.airSign * 7;
  setStatus('slam · let go before landing');
  sound('slam');
}
// the pump hint shows while learning and comes back whenever speed has been lost
const needsHint = () => G.airs < 2 || G.sinceAir > HINT_AFTER;
function rollStep(dt: number) {
  const th = pointOnRamp(G.s).th, slope = Math.sin(th), dir = (G.v !== 0 ? Math.sign(G.v) : G.s !== 0 ? -Math.sign(G.s) : 1);
  // below the lip a pump counts for more and mistakes for less, so lost speed comes back in a pass or two
  const low = clamp(1 - (G.v * G.v / 2 + GRAVITY * pointOnRamp(G.s).z) / (GRAVITY * RADIUS * 1.25), 0, 1);
  G.v -= GRAVITY * slope * dt;
  if (G.hold) {
    if (!slope || G.v * slope < 0) G.v += dir * PUMP * (Math.abs(slope) + low * LOW_BOOST) * dt;
    else G.v -= dir * PUMP * Math.abs(slope) * (1 - low) * .5 * dt;
  }
  const speed = Math.abs(G.v), next = Math.max(0, speed - (ROLL_DRAG * (1 - low * .7) + AIR_DRAG * speed * speed) * dt);
  if (speed > 0) G.v *= next / speed;
  if (Math.abs(G.s) <= FLAT && Math.abs(G.v) < MIN_FLAT_SPEED) G.v = ((G.v !== 0 ? Math.sign(G.v) : 1)) * MIN_FLAT_SPEED;
  G.s += G.v * dt;
  if (Math.abs(G.s) >= LIP_S && G.v * G.s > 0) {
    const sign = Math.sign(G.s);
    G.s = sign * LIP_S;
    takeOff(sign);
  }
}
function airStep(dt: number) {
  G.airT += dt;
  G.z = RADIUS + G.vz * G.airT - .5 * GRAVITY * G.airT * G.airT;
  if (G.hold) G.grabT += dt;
  if (G.airT >= G.airTotal) land();
}
function update(dt: number) {
  G.time += dt;
  G.timer += dt;
  G.cheer = Math.max(0, G.cheer - dt);
  if (G.hold) G.holdT += dt;
  if (G.phase === 'ride' || G.phase === 'slam') {
    G.left = Math.max(0, G.left - dt);
  }
  if (G.phase === 'ride') {
    if (G.air) { airStep(dt); G.sinceAir = 0; }
    else {
      rollStep(dt);
      G.sinceAir += dt;
      if (needsHint()) {
        const slope = Math.sin(pointOnRamp(G.s).th);
        if (slope) setStatus(G.v * slope < 0 ? 'hold on the way down' : 'let go on the way up');
      }
    }
    if (G.left <= 0 && !G.air) finish();
  } else if (G.phase === 'slam') {
    const b = G.slam!.board;
    b.a += b.va * dt; b.vz -= GRAVITY * dt; b.z += b.vz * dt; b.spin += dt * 11;
    const floor = surfaceAt(b.a, 0);
    if (b.z < floor) { b.z = floor; b.vz = Math.abs(b.vz) > 2 ? -b.vz * .4 : 0; b.va *= .7; b.spin *= .9; }
    // the rider slides to the flat and gets up
    rollStep(dt);
    if (Math.abs(G.s) < LIP_S - .1 && G.hold) G.hold = false;
    if (G.timer > 1.25) {
      G.phase = 'ride';
      G.slam = null;
      G.v = (Math.sign(G.v) || 1) * Math.max(Math.abs(G.v), 8);
      G.sinceAir = 0;
      if (G.left <= 0) finish();
    }
  }
}
function finish() {
  G.phase = 'over';
  G.timer = 0;
  G.hold = false;
  G.v = 0;
  const record = G.score > G.best;
  if (record) {
    G.best = G.score;
    saveScore('mini-ramp',G.best);
  }
  setStatus(G.score + (record ? ' · new best' : '') + ' · highest air ' + G.bestAir.toFixed(1) + ' m · tap to skate again');
}

/* ---------- drawing ---------- */
function riderFrame() {
  if (G.air) {
    const p = G.airT / G.airTotal, sign = G.airSign;
    // the board levels out at the top of the air and tips back to the wall on the way down
    return { a: sign * (LIP_A - LIP_INSET), z: G.z, th: sign * Math.PI / 2 * Math.abs(1 - 2 * p) };
  }
  if (G.phase === 'ready') return { a: LIP_A + .9, z: RADIUS, th: 0 };
  return pointOnRamp(G.s);
}
function drawRider(): Vec3 | null {
  const f = riderFrame(), c = Math.cos(f.th), s = Math.sin(f.th), w0 = .3;
  const P = (t: number, n: number, side: number = 0) => world(f.a + t * c - n * s, w0 + side, f.z + t * s + n * c);
  const add = (a: Vec3, b: Vec3, r0: number, r1: number, color: Color) => dynamicAdd(a, b, r0, r1, () => color);
  const r = RIDER, flip = G.v > 0 ? 1 : -1;
  if (G.phase === 'slam') {
    add(P(-.95 * flip, .2), P(-.4 * flip, .25), .12, .15, r.pants);
    add(P(-.4 * flip, .25), P(0, .25), .15, .17, r.pants);
    add(P(0, .28), P(.75 * flip, .3), .3, .3, r.hoodie);
    add(P(1.1 * flip, .3), P(1.1 * flip, .3), .24, .24, r.skin);
    add(P(1.15 * flip, .38), P(1.15 * flip, .38), .2, .2, r.hat);
    add(P(.7 * flip, .3, .35), P(1.3 * flip, .15, .55), .1, .08, r.hoodie);
    const b = G.slam!.board, sc = Math.cos(b.spin), ss = Math.sin(b.spin);
    const at = (t: number, n: number) => world(b.a + t * sc - n * ss, w0, b.z + .15 + t * ss + n * sc);
    add(at(-.62, 0), at(.62, 0), .07, .07, r.deck);
    for (const t of [-.38, .38]) add(at(t, -.13), at(t, -.13), .09, .09, r.wheel);
    return null;
  }
  const grabbing = G.air && G.hold, pumping = !G.air && G.hold && G.phase === 'ride';
  const crouch = grabbing ? 1 : pumping ? .75 : G.phase === 'ready' || G.phase === 'over' ? .05 : .22;
  const hipN = 1.28 - crouch * .55, shN = hipN + .92 - crouch * .28, lean = (pumping ? .22 : .08) * (G.v >= 0 ? 1 : -1);
  // board and wheels
  add(P(-.6, .24), P(.6, .24), .07, .07, r.deck);
  add(P(.6, .24), P(.76, .33), .07, .06, r.deck);
  add(P(-.6, .24), P(-.76, .33), .07, .06, r.deck);
  for (const t of [-.38, .38]) add(P(t, .1), P(t, .1), .09, .09, r.wheel);
  // legs
  const knee = .42 + crouch * .12, kneeN = .8 - crouch * .26;
  add(P(-.36, .34, .07), P(-knee, kneeN, .17), .1, .13, r.pants);
  add(P(.36, .34, -.07), P(knee, kneeN, -.05), .1, .13, r.pants);
  add(P(-knee, kneeN, .17), P(lean - .13, hipN, .06), .13, .17, r.pants);
  add(P(knee, kneeN, -.05), P(lean + .13, hipN, -.02), .13, .17, r.pants);
  // torso and head
  const sh = P(lean * 1.6, shN);
  add(P(lean, hipN), sh, .3, .32, r.hoodie);
  const head = P(lean * 2, shN + .4);
  add(head, head, .24, .24, r.skin);
  const hat = P(lean * 2, shN + .49);
  add(hat, hat, .21, .21, r.hat);
  // arms: out for balance, or one hand down to the board in a grab
  const back = P(lean * 1.6 - .34, shN - .04, .06), front = P(lean * 1.6 + .34, shN - .04, .06);
  if (grabbing) {
    add(front, P(.34, .42, .12), .11, .08, r.hoodie);
    add(P(.34, .42, .12), P(.34, .42, .12), .09, .09, r.skin);
    add(back, P(-1, shN + .3, .1), .11, .08, r.hoodie);
    add(P(-1, shN + .3, .1), P(-1, shN + .3, .1), .09, .09, r.skin);
  } else {
    const raise = pumping ? -.28 : .1;
    add(back, P(-.95, shN + raise, .1), .11, .08, r.hoodie);
    add(front, P(.95, shN + raise, .1), .11, .08, r.hoodie);
    add(P(-.95, shN + raise, .1), P(-.95, shN + raise, .1), .09, .09, r.skin);
    add(P(.95, shN + raise, .1), P(.95, shN + raise, .1), .09, .09, r.skin);
  }
  return head;
}
function drawFriends() {
  const f = riderFrame(), cheering = G.cheer > 0;
  FRIENDS.forEach((p, k) => {
    const [x, y] = world(p.a, p.w, 0);
    const [tx, ty] = world(f.a, .3, 0);
    const yaw = Math.round(Math.atan2(ty - y, tx - x) / .4) * .4;
    const beat = cheering ? Math.floor(G.time * 8 + k * 2) % 2 : 0;
    figure(x, y, yaw, { z: RADIUS, scale: .9, stance: .08, armR: cheering ? (beat ? 3 : 2.5) : .12, armL: cheering ? (beat ? 2.5 : 3) : .1 }, p, dynamicAdd);
  });
}
// shadows bend over the ramp: drop each point along the light until it meets the surface
function stampShadow(a: number, w: number, z: number, r: number, strength: number) {
  let h = Math.max(0, z - surfaceAt(a, w)), sa = a + h * SHADOW_ALONG, sw = w + h * SHADOW_ACROSS;
  let sz = surfaceAt(sa, sw);
  h = Math.max(0, z - sz); sa = a + h * SHADOW_ALONG; sw = w + h * SHADOW_ACROSS; sz = surfaceAt(sa, sw);
  const p = projectVector(world(sa, sw, sz)), rx = r * S * 1.05, ry = rx * SIN + 1;
  const y0 = Math.max(0, Math.floor(p.sy - ry)), y1 = Math.min(H - 1, Math.ceil(p.sy + ry));
  const x0 = Math.max(0, Math.floor(p.sx - rx)), x1 = Math.min(W - 1, Math.ceil(p.sx + rx));
  for (let iy = y0; iy <= y1; iy++) for (let ix = x0; ix <= x1; ix++) {
    const dx = (ix + .5 - p.sx) / rx, dy = (iy + .5 - p.sy) / ry;
    if (dx * dx + dy * dy > 1) continue;
    const i = iy * W + ix;
    if (shadowMask[i] < strength) shadowMask[i] = strength;
  }
}
function flushRampShadows() {
  for (const shadow of pendingShadows) {
    const p=shadow.a, r=shadow.ra, q=shadow.b;
    const n = Math.max(1, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) / .25));
    for (let k = 0; k <= n; k++) {
      const t = k / n, x = lerp(p[0], q[0], t), y = lerp(p[1], q[1], t);
      stampShadow((x - y) / R2, (x + y) / R2, lerp(p[2], q[2], t), r * .9, 1);
    }
  }
}
const BANG = ['.ooo.', '.oXo.', '.oXo.', '.oXo.', '.ooo.', '.oXo.', '.ooo.'];
function drawBang(sx: number, sy: number) {
  const ink: number[][] = [], fill: number[][] = [];
  BANG.forEach((row, y) => [...row].forEach((cell, x) => {
    if (cell === 'o') ink.push([sx - 2 + x, sy + y]);
    if (cell === 'X') fill.push([sx - 2 + x, sy + y]);
  }));
  haloDots(ink);
  drawDots(ink, INK);
  drawDots(fill, SIGNAL);
}
function draw() {
  copyInto(pix, bakedPix);
  copyInto(zb, bakedZ);
  pendingShadows.length = 0;
  drawFriends();
  const head = drawRider();
  const windT = STILL ? 0 : Math.floor(G.time * WIND_FPS) / WIND_FPS;
  drawLeaves(windT);
  drawTufts(windT);
  flushRampShadows();
  applyShadows(bakedZ);
  shadeEdges();
  if (head !== null) {
    const p = projectVector(head);
    const falling = G.air && G.hold && G.airTotal - G.airT < .5;
    if (falling && Math.floor(G.time * 10) % 2 === 0) drawBang(Math.round(p.sx), Math.round(p.sy) - 16);
    else if (G.phase === 'ride' && !G.air && needsHint() && !G.hold && G.v * Math.sin(pointOnRamp(G.s).th) <= 0) drawArrow(p.sx, p.sy - 5, G.time);
  }
}


function setStatus(text: string): void { G.status = text; }

export class MiniRamp extends PixelGame {
 constructor(){super('mini-ramp','MINI RAMP','Maintenir en descente pour prendre de la vitesse · Relâcher en montée · Maintenir en vol pour attraper');}
 override init():void {configureRenderer(26,.9,-.6);G.best=readScore('mini-ramp');bake();resetGame();}
 override reset():void {resetGame();}
 override update(dt:number):void {update(dt);setMotion('skate',G.phase==='ride'&&!G.air?Math.abs(G.v)/18:0);this.status=G.status;this.score=G.score+' points · x'+G.multi+' · '+Math.ceil(G.left)+' s · record '+G.best;}
 override draw():void {draw();}
 override pointer(x:number,y:number,phase:i32):void {if(phase===0)press();else if(phase===2||phase===3)release();}
 override key(name:string,down:boolean):void {if(name===' '||name==='Enter'){if(down)press();else release();}}
}