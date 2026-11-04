import {
  W, H, COS, SIN, R2, pix, zb, bakedPix, bakedZ, pendingShadows, Color, Vec3, Palette,
  rgb, rgbColor, rampOf, hash, clamp, lerp, ease, project, plot, figure, dynamicAdd, capsule, sphere, box, castShadow,
  flushShadows, applyShadows, shadeEdges, drawLeaves, drawTufts, copyInto,
} from '../renderer';
import { CORNERS, MARK_X, pit, stageOf, JACK_UP } from './state';
import { carAt, RED, INK } from './scenery';
import { wheel, SILVER, WHEEL_R, WHEEL_HALF } from './wheel';
import { CREAM, BRICK } from '../harbor/palette';

const LIFT = .42;
const GUN = 0, WHEELMAN = 1, JACK_F = 2, JACK_R = 3, LOLLI = 4, EXTINGUISHER = 5, ENGINEER = 6;
const COMPOUNDS: Color[] = [[200, 66, 52], [226, 186, 70], [226, 214, 176]];
const HELMETS: Color[] = [[78, 118, 154], [96, 148, 104], [226, 184, 70], [226, 184, 70], [224, 215, 186], [176, 62, 48], [120, 120, 130]];
const VISOR: Color = [44, 48, 64];

interface Member { role: number; corner: number; idleX: number; idleY: number; }
const crew: Member[] = [
  { role: GUN, corner: 0, idleX: 2.2, idleY: 4.75 }, { role: WHEELMAN, corner: 0, idleX: 3.4, idleY: 4.75 },
  { role: GUN, corner: 2, idleX: -3.4, idleY: 4.75 }, { role: WHEELMAN, corner: 2, idleX: -2.2, idleY: 4.75 },
  { role: GUN, corner: 1, idleX: 2.2, idleY: -4.95 }, { role: WHEELMAN, corner: 1, idleX: 3.4, idleY: -4.95 },
  { role: GUN, corner: 3, idleX: -3.4, idleY: -4.95 }, { role: WHEELMAN, corner: 3, idleX: -2.2, idleY: -4.95 },
  { role: JACK_F, corner: 0, idleX: 8.2, idleY: -3.6 }, { role: JACK_R, corner: 0, idleX: -8.6, idleY: -3.8 },
  { role: LOLLI, corner: 0, idleX: 11.0, idleY: -2.4 }, { role: EXTINGUISHER, corner: 0, idleX: -10.4, idleY: 3.9 },
];
interface Puff { x: number; y: number; z: number; age: number; }
const puffs: Puff[] = [];
let anchor = MARK_X;
let spawn = 0;

function paletteOf(role: number): Palette {
  return { shirt: [150, 56, 46], stripe: CREAM, legs: INK, hair: HELMETS[role], skin: VISOR };
}

/** Smoke from the tyres under hard braking and at the launch. */
export function stepEffects(dt: number): void {
  for (let i = puffs.length - 1; i >= 0; i--) { puffs[i].age += dt; if (puffs[i].age > .7) puffs.splice(i, 1); }
  spawn -= dt;
  const braking = pit.phase === 'approach' && pit.pressure > .6 && pit.speed > 4;
  const launching = pit.phase === 'launch' && pit.time - pit.launchAt > .25 && pit.time - pit.launchAt < 1.1;
  if (spawn <= 0 && (braking || launching)) {
    spawn = braking ? .16 : .09;
    for (const c of CORNERS) if (c.x < 0 && c.side > 0 || launching && c.x < 0) puffs.push({ x: pit.x + c.x - .3, y: c.y + c.side * .3, z: .3, age: 0 });
  }
  if (pit.phase === 'ready') puffs.length = 0;
}

// ---------- wheels ----------
function newCompound(): Color { return COMPOUNDS[pit.run % 3]; }

function wheelmanPos(i: number, e: number): Vec3 {
  let m = crew[0];
  for (const c of crew) if (c.role === WHEELMAN && c.corner === i) m = c;
  const s = station(m), c = CORNERS[i];
  // the fresh wheel stands beside its wheelman and goes where he goes
  return [lerp(m.idleX, s[0], e) + (c.x > 0 ? 1.1 : -2.3), lerp(m.idleY, s[1], e) - c.side * .7, 0];
}

function drawWheels(): void {
  const e = engagement();
  const t = pit.service;
  const carZ = pit.lift * LIFT;
  const rot = pit.x / WHEEL_R;
  const serving = pit.phase === 'service' || pit.phase === 'release' || pit.phase === 'launch' || pit.phase === 'over';
  for (let i = 0; i < 4; i++) {
    const c = CORNERS[i], hx = pit.x + c.x, out = c.side, fx = anchor + c.x;
    const { stage, k } = serving ? stageOf(i, t) : { stage: 0, k: 0 };
    const old: Color = COMPOUNDS[2];
    if (stage <= 1) wheel(hx, c.y, WHEEL_R + carZ, 1, rot, old);
    else if (stage === 2) {
      const e = ease(k);
      wheel(hx, c.y + out * 1.25 * e, lerp(WHEEL_R + carZ, WHEEL_R, e), 1, rot, old);
    } else {
      // the old wheel rolls out and topples on the lane
      const e = ease(stage === 3 ? k : 1);
      if (pit.phase !== 'over') wheel(fx + (c.x > 0 ? -1 : 1) * .5 * e, c.y + out * (1.25 + .9 * e), lerp(WHEEL_R, WHEEL_HALF, e > .85 ? 1 : 0), e > .85 ? 2 : 1, rot, old);
    }
    const fresh = newCompound();
    const wp = wheelmanPos(i, engagement());
    if (stage <= 2) {
      wheel(wp[0], wp[1], WHEEL_R, 1, 0, fresh);
    } else if (stage === 3) {
      const e = ease(k);
      wheel(lerp(wp[0], hx, e), lerp(wp[1], c.y, e), WHEEL_R + .25 * Math.sin(e * Math.PI) + carZ * e, 1, e * 3, fresh);
    } else {
      wheel(hx, c.y, WHEEL_R + carZ, 1, stage === 4 ? k * 9 : rot, fresh);
    }
  }
}

// ---------- the crew ----------
function station(m: Member): Vec3 {
  if (m.role === GUN || m.role === WHEELMAN) {
    const c = CORNERS[m.corner];
    return [anchor + c.x + (m.role === GUN ? -.55 : .6), c.side * 2.85, -c.side * Math.PI / 2];
  }
  if (m.role === JACK_F) return [anchor + 5.7, 0, Math.PI];
  if (m.role === JACK_R) return [anchor - 5.0, 0, 0];
  if (m.role === LOLLI) return [anchor + 7.9, .6, Math.PI];
  return [anchor - 6.6, -2.7, .4];
}

function idleYaw(m: Member): number {
  if (m.role === GUN || m.role === WHEELMAN) return -CORNERS[m.corner].side * Math.PI / 2;
  return station(m)[2];
}

/** 0 waiting at the wall and garage, 1 at the car. */
function engagement(): number {
  if (pit.phase === 'ready') return 0;
  if (pit.phase === 'approach') return 0;
  if (pit.phase === 'service' || pit.phase === 'release') return ease(clamp(pit.service / .45, 0, 1));
  if (pit.phase === 'launch' || pit.phase === 'over') return 1 - ease(clamp((pit.time - pit.launchAt - .35) / .8, 0, 1));
  return 1;
}

function gunSparks(tip: Vec3, frame: number): void {
  for (let k = 0; k < 7; k++) {
    const h = hash(frame * 3.1 + k, tip[0] * 5.7 + tip[1]);
    const a = h * 6.28, d = .15 + hash(frame, k * 1.7) * .35;
    plot(tip[0] + Math.cos(a) * d * .5, tip[1] + Math.sin(a) * d * .5, tip[2] + .2 + Math.abs(Math.sin(a * 2)) * d, k % 2 ? rgb(255, 232, 140) : rgb(250, 160, 60));
  }
}

function drawCrew(time: number): void {
  const frame = Math.floor(time * 12);
  const e = engagement();
  const service = pit.phase === 'service' || pit.phase === 'release';
  const ready = service && pit.service >= pit.readyAt;
  const green = pit.phase === 'release' || pit.phase === 'launch';
  for (let id = 0; id < crew.length; id++) {
    const m = crew[id], s = station(m);
    const moving = e > .02 && e < .98;
    const x = lerp(m.idleX, s[0], e), y = lerp(m.idleY, s[1], e), yaw = idleYaw(m);
    const breathe = Math.sin(time * 2 + id) * .05;
    let crouch = 0, lean = .04, armR = .3 + breathe, armL = .3 - breathe, stance = .12;
    let stage = 0, k = 0;
    if (m.role === GUN || m.role === WHEELMAN) {
      const st = e >= 1 && (service || pit.phase === 'launch') ? stageOf(m.corner, pit.service) : { stage: 0, k: 0 };
      stage = st.stage; k = st.k;
    }
    const buzz = Math.sin(time * 52) * .04;
    if (moving) { stance = .2 + Math.sin(time * 15 + id) * .3; lean = .22; armR = .9 + Math.sin(time * 15 + id) * .5; armL = .9 - Math.sin(time * 15 + id) * .5; }
    else if (e >= 1 && m.role === GUN) {
      crouch = .4; lean = .3; armR = 1.35; armL = 1.2;
      if (stage === 1 || stage === 4) { crouch = .5; lean = .38; armR += buzz; }
      if (stage === 5 || ready && stage >= 4) { crouch = 0; lean = 0; armR = 2.9; armL = .3; }
    } else if (e >= 1 && m.role === WHEELMAN) {
      crouch = .35; lean = .2; armR = 1.1; armL = 1.1;
      if (stage === 2) { crouch = .5; lean = -.12; armR = 1.35; armL = 1.35; }
      if (stage === 3) { crouch = .4; lean = .34; armR = 1.5; armL = 1.5; }
      if (stage === 5) { crouch = 0; lean = 0; armR = .3; armL = 2.9; }
    } else if (e >= 1 && (m.role === JACK_F || m.role === JACK_R)) {
      const lifting = service && pit.service < JACK_UP + .15;
      crouch = lifting ? .5 : .25; lean = .25;
      armR = lifting ? 1.0 + Math.sin(time * 20) * .3 : 1.0; armL = 1.2;
      if (ready || green) { crouch = 0; lean = 0; armR = 2.9; armL = .3; }
    } else if (m.role === LOLLI) {
      armR = ready || green ? 2.7 : 2.1; armL = .3;
      if (pit.phase === 'launch') armR = lerp(2.7, .5, clamp((pit.time - pit.launchAt) / .5, 0, 1));
    } else if (m.role === EXTINGUISHER) { armR = .9; armL = .3; lean = .08; }
    const hand = figure(x, y, yaw, { z: 0, scale: 1.05, crouch, lean, stance, armR, armL }, paletteOf(m.role), dynamicAdd);
    const fx = Math.cos(yaw), fy = Math.sin(yaw);
    if (m.role === GUN) {
      const tip: Vec3 = [hand[0] + fx * .6, hand[1] + fy * .6, hand[2] - .02];
      capsule(hand, tip, .1, .07, (): Color => INK, 'solid');
      sphere(tip[0], tip[1], tip[2], .09, SILVER, 'solid');
      if (stage === 1 || stage === 4) gunSparks([tip[0] + fx * .25, tip[1] + fy * .25, tip[2]], frame + id);
    } else if (m.role === LOLLI) {
      const top: Vec3 = [hand[0], hand[1], hand[2] + 1.25];
      capsule([hand[0], hand[1], Math.max(.1, hand[2] - .9)], top, .05, .05, (): Color => SILVER, 'solid');
      board(top, green || ready);
    } else if (m.role === EXTINGUISHER) {
      capsule([hand[0], hand[1], hand[2] - .1], [hand[0], hand[1], hand[2] + .5], .1, .1, (): Color => RED, 'solid');
    } else if (m.role === JACK_F) {
      const jackX = anchor + 3.55 + (1 - ease(e)) * 2.5;
      const height = .18 + pit.lift * LIFT * .8;
      box(jackX - .5, -.5, 0, jackX + .5, .5, height, [226, 184, 70]);
      box(jackX - .1, -.1, height, jackX + .1, .1, height + .12, INK);
      capsule([hand[0], hand[1], hand[2]], [jackX + .2, 0, height + .1], .05, .05, (): Color => INK, 'solid');
    } else if (m.role === JACK_R) {
      const jackX = anchor - 3.85 - (1 - ease(e)) * 2.5;
      const height = .18 + pit.lift * LIFT * .8;
      box(jackX - .4, -.45, 0, jackX + .4, .45, height, [226, 184, 70]);
      capsule([hand[0], hand[1], hand[2]], [jackX, 0, height + .1], .05, .05, (): Color => INK, 'solid');
    }
  }
}

function board(top: Vec3, go: boolean): void {
  const face = go ? rgb(88, 150, 96) : rgb(186, 60, 48), rim = rgb(228, 218, 190);
  for (let r = 0; r < .62; r += .035) {
    const steps = Math.ceil(6.28 * r / .035) + 1;
    for (let k = 0; k < steps; k++) {
      const a = k * 6.28 / steps;
      plot(top[0], top[1] + Math.cos(a) * r, top[2] + .6 + Math.sin(a) * r, r > .5 ? rim : face);
    }
  }
}

// ---------- the frame ----------
function smoke(): void {
  for (const puff of puffs) {
    const age = puff.age, size = 1 + Math.floor(age * 3);
    const base = project(puff.x - age * .8, puff.y, puff.z + age * 1.1);
    const tone = 200 + age * 40;
    for (let dy = -size; dy <= size; dy++) for (let dx = -size; dx <= size; dx++) {
      if (dx * dx + dy * dy > size * size + 1) continue;
      if (hash(dx + puff.x * 7, dy + puff.age * 13) < .25 + age * .6) continue;
      const ix = Math.round(base.sx) + dx, iy = Math.round(base.sy) + dy;
      if (ix >= 0 && ix < W && iy >= 0 && iy < H) pix[iy * W + ix] = rgb(tone, tone - 3, tone + 6);
    }
  }
}

function lights(): void {
  const go = pit.phase === 'release' || pit.phase === 'launch' || pit.phase === 'over';
  const lamp = (z: number, lit: boolean, on: Color, off: Color): void => { sphere(9.0, 5.14, z, .17, lit ? on : off, 'solid'); };
  lamp(3.95, !go, [236, 70, 56], [84, 50, 50]);
  lamp(3.3, go, [110, 224, 120], [46, 70, 56]);
}

function flag(time: number): void {
  const gust = Math.round(Math.sin(time * 2.6) * 1.5) / 10;
  for (let x = 0; x < 1.1; x += .05) for (let z = 0; z < .6 * (1 - x / 1.1); z += .05) plot(-12.5 + x, -8 + gust * x, 7.2 - z, rgbColor(BRICK));
}

export function drawPit(): void {
  const time = Math.floor(pit.time * 12) / 12;
  anchor = pit.phase === 'approach' || pit.phase === 'ready' ? MARK_X : pit.stopX;   // the crew works where the car really stopped: nobody slides
  copyInto(pix, bakedPix);
  copyInto(zb, bakedZ);
  pendingShadows.length = 0;
  drawLeaves(time);
  drawTufts(time);
  if (pit.phase !== 'ready') {
    carAt(pit.x, pit.lift * LIFT);
    drawWheels();
    for (let x = -3; x <= 4; x += 1.4) castShadow(pit.x + x, 0, .6 + pit.lift * LIFT, .85);
  }
  drawCrew(time);
  lights();
  flag(time);
  flushShadows();
  applyShadows(bakedZ);
  shadeEdges();
  smoke();
}
