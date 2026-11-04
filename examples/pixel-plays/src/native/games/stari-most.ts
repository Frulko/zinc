import { INK, PAPER, SIGNAL } from '../renderer';
// stari-most — strict Zinc TypeScript port of Pixel Plays, MIT. See LICENSE.upstream.
import { Color, Vec3, Pose, Palette, ShadowPart, W, H, S, SIN, COS, R2, SHADOW_X, SHADOW_Y, pix, zb, bakedPix, bakedZ, ground, shadowMask, groundZ, GRASS, rgb, rampOf, bayerAt, tint, clamp, lerp, ease, hash, noise, project, unproject, sphere, capsule, box, castShadow, applyShadows, shadeEdges, KIND_GRASS, kinds, WIND_FPS, STILL, staticShadow, growGrass, drawTufts, drawLeaves, bakeOcclusion, plot, growTree, figure, sphere2, dynamicAdd, pendingShadows, flushShadows, drawDots, haloDots, drawArrow, copyInto, queueShadow, configureRenderer, rgbColor, projectVector, castShadowVector } from '../renderer';
import { PixelGame } from '../game';
import { sound, ensureAudio } from '../audio';
import { readBest as readScore, saveBest as saveScore } from '../scores';
import { audioRain, setMotion } from '../audio';
interface Tourist { x:number; y:number; tx:number; ty:number; speed:number; wait:number; gait:number; yaw:number; look:number; phone:boolean; walking:boolean; palette:Palette; }
interface Drop { x:number; y:number; z:number; vx:number; vy:number; vz:number; }
interface Ring { x:number; y:number; r:number; life:number; }
interface Streak { x:number; y0:number; speed:number; len:number; bright:boolean; }



const STONE = [216, 206, 184], SLATE = [120, 112, 110], TILE = [168, 96, 70], DARK = [44, 40, 50];
const WATER_TONES = [[34, 102, 108], [44, 122, 120], [62, 146, 134], [94, 172, 150]];
const BEACH_TONES = [[186, 178, 158], [202, 194, 174], [216, 210, 190], [230, 224, 204]];
const KIND_BEACH = 1, KIND_WATER = 2;
// The real bridge is a wide, thin crescent: a slightly pointed arch made of two circular arcs, with
// the deck rising to a soft peak over a crown barely thicker than the ring.
const ARCH_A = 7.2, ARCH_C = 1.2, ARCH_R = ARCH_A + ARCH_C, ARCH_BASE = 2.2;
const DECK_END = 8.4, DECK_LOW = 6.9, DECK_TOP = 11.2, DECK_REACH = 10.2, HALF_W = 1.15;
const JUMP_Y = 1.05, PARAPET = .45, GRAVITY = 8.5, DIVES = 5;
const DIVER_SCALE = .85, HIP_HEIGHT = 1.25 * DIVER_SCALE, ENTRY_Z = .85;
const DIVER = { skin: [214, 160, 122], hair: [40, 30, 26], trunks: [190, 52, 44] };
const TOURIST_SCALE = .78, TOURIST_COUNT = 14, CROWD_GAP = .72, DIVER_CLEARANCE = 2.6;
const TOURIST_SHIRTS = [[232, 96, 84], [244, 196, 74], [64, 160, 168], [244, 242, 232], [226, 128, 164], [84, 120, 196], [148, 186, 92], [240, 148, 72]];
const TOURIST_LEGS = [[52, 58, 82], [196, 176, 136], [236, 232, 220], [72, 68, 64], [104, 124, 150]];
const TOURIST_HAIR = [[44, 32, 26], [120, 84, 50], [206, 176, 110], [176, 170, 160], [236, 228, 200], [198, 72, 58]];
const TOURIST_SKIN = [[232, 184, 148], [214, 160, 122], [176, 122, 88], [122, 82, 58]];

const archZ = (x: number) => ARCH_BASE + Math.sqrt(Math.max(0, ARCH_R ** 2 - (Math.abs(x) + ARCH_C) ** 2));
const deckZ = (x: number) => {
  const a = Math.abs(x);
  return a >= DECK_END ? DECK_LOW : DECK_TOP - (DECK_TOP - DECK_LOW) * (a / DECK_END) ** 1.6;
};
const riverHalf = (y: number) => 6 + (noise(y * .25 + 9, 3) - .5) * 1.2;
const toneOf = (tones: Color[], v: number, ix: number, iy: number) => rgbColor(tones[clamp(Math.floor(v * 4 + (bayerAt(ix, iy) - .5) * .7), 0, 3)]);

function groundColor(x: number, y: number, ix: number, iy: number, i: number) {
  const edge = Math.pow(Math.pow(Math.abs(x) / 15.6, 4) + Math.pow(Math.abs(y) / 10.4, 4), .25);
  const rough = edge + (noise(x * 1.3, y * 1.3) - .5) * .13;
  if (rough > 1.04) return 0;
  if (rough > .93 && hash(ix, iy) < (rough - .93) / .11) return 0;
  const half = riverHalf(y), fine = hash(ix, iy), a = Math.abs(x);
  if (a < half) {
    kinds[i] = KIND_WATER;
    const shore = a / half;
    return toneOf(WATER_TONES, .1 + shore * shore * .7 + (noise(x * .6, y * .3) - .5) * .35, ix, iy);
  }
  if (a < half + 1.1 + noise(x * 2, y * 2) * .9) {
    kinds[i] = KIND_BEACH;
    if (fine > .96) return rgb(240, 236, 220);
    if (hash(ix - 1, iy - 1) > .96) return rgb(150, 142, 126);
    return toneOf(BEACH_TONES, .25 + noise(x * 3, y * 3) * .6, ix, iy);
  }
  kinds[i] = KIND_GRASS;
  const t = noise(x * .9, y * .9) * 1.15 + (fine - .5) * .55 - .08;
  return rgbColor(GRASS[clamp(Math.floor(t * 4.2), 0, 3)]);
}

// masonry: staggered courses with mortar joints and a little variation per block
function masonry(a: number, z: number, base: number, c: Color = STONE) {
  const fz = z * 1.6, course = Math.floor(fz), fa = a * 1.2 + (course % 2) * .5, block = Math.floor(fa);
  const mortar = fz - course < .14 || fa - block < .1;
  const tone = hash(block, course);
  return rampOf(c)[clamp(base + (tone > .75 ? 1 : tone < .2 ? -1 : 0) - (mortar ? 1 : 0), 0, 4)];
}
function buildBridge() {
  const step = .04;
  // underside of the arch, swept along each arc so its steep haunches have no gaps
  const crownAngle = Math.acos(ARCH_C / ARCH_R);
  for (let t = 0; t <= crownAngle; t += .002) {
    const a = ARCH_R * Math.cos(t) - ARCH_C, z = ARCH_BASE + ARCH_R * Math.sin(t);
    for (let y = -HALF_W; y <= HALF_W; y += step) {
      plot(-a, y, z, masonry(y + t * 4, t * 8, 2));
      plot(a, y, z, masonry(y + t * 4, t * 8, 1));
    }
  }
  for (const side of [-1, 1]) {
    const x0 = side < 0 ? -ARCH_A : ARCH_A - 1.1;
    box(x0, -HALF_W - .3, 0, x0 + 1.1, HALF_W + .3, ARCH_BASE, STONE, 40 + side);
  }
  for (let x = -DECK_REACH; x <= DECK_REACH; x += step) {
    const top = deckZ(x), a = Math.abs(x);
    const low = a < ARCH_A ? archZ(x) : 0;
    for (let z = low; z <= top; z += step) {
      const radial = Math.hypot(a + ARCH_C, z - ARCH_BASE);
      if (z > top - .24 && z < top - .1) {
        plot(x, HALF_W, z, rampOf(STONE)[4]); // the string course under the parapet
      } else if (z > ARCH_BASE && radial < ARCH_R + .62) {
        // the pale ring of voussoirs that draws the arch's line
        const joint = (Math.atan2(z - ARCH_BASE, a + ARCH_C) * 26) % 1;
        plot(x, HALF_W, z, rampOf(STONE)[joint < .16 ? 2 : 4]);
      } else {
        plot(x, HALF_W, z, masonry(x, z, 3));
      }
    }
    // ribbed deck: the old bridge is ridged for grip on its steep hump
    for (let y = -HALF_W; y <= HALF_W; y += step) {
      plot(x, y, top, rampOf(STONE)[Math.floor(x * 2.6) % 2 === 0 ? 3 : 4]);
    }
    for (const side of [-1, 1]) {
      for (let z = top; z <= top + PARAPET; z += step) {
        plot(x, side * HALF_W, z, masonry(x, z, 3));
        plot(x, side * (HALF_W - .2), z, masonry(x, z, 2));
      }
      for (let w = HALF_W - .2; w <= HALF_W; w += step) plot(x, side * w, top + PARAPET, rampOf(STONE)[4]);
    }
  }
}
function squareTower(x0: number, y0: number, x1: number, y1: number, z1: number) {
  const step = .045;
  for (let a = x0; a <= x1; a += step) for (let z = 0; z <= z1; z += step) plot(a, y1, z, masonry(a, z, 3));
  for (let a = y0; a <= y1; a += step) for (let z = 0; z <= z1; z += step) plot(x1, a, z, masonry(a, z, 2));
  for (const [wx, wz] of [[.35, .3], [.65, .55], [.35, .78]]) {
    const cx = lerp(x0, x1, wx), cz = z1 * wz;
    for (let a = cx - .22; a <= cx + .22; a += step) for (let z = cz - .4; z <= cz + .4; z += step) plot(a, y1 + .14, z, rampOf(DARK)[1]);
  }
  roof(x0 - .15, y0 - .15, x1 + .15, y1 + .15, z1, 1.4, SLATE);
}
function roundTower(cx: number, cy: number, r: number, z1: number) {
  const step = .045;
  for (let t = 0; t < 6.283; t += .016) {
    const nx = Math.cos(t), ny = Math.sin(t), l = -.5 * nx + .85 * ny;
    for (let z = 0; z <= z1; z += step) {
      const base = clamp(Math.round(2.4 + l * 1.3), 1, 4);
      plot(cx + nx * r, cy + ny * r, z, masonry(t * r, z, base));
    }
  }
  for (let t = 0; t < 6.283; t += .02) {
    const nx = Math.cos(t), ny = Math.sin(t), l = -.5 * nx + .85 * ny;
    for (let q = 0; q <= 1; q += .012) {
      const rr = (r + .2) * (1 - q);
      plot(cx + nx * rr, cy + ny * rr, z1 + q * 2.1, rampOf(SLATE)[clamp(Math.round(2.4 + l * 1.4 + (Math.floor(q * 12) % 2) * .4), 1, 4)]);
    }
  }
  for (const [t, wz] of [[1.2, .45], [.5, .72]]) {
    for (let a = t - .1; a <= t + .1; a += .01) for (let z = z1 * wz - .4; z <= z1 * wz + .4; z += step) {
      plot(cx + Math.cos(a) * (r + .14), cy + Math.sin(a) * (r + .14), z, rampOf(DARK)[1]);
    }
  }
}
function roof(x0: number, y0: number, x1: number, y1: number, z: number, rise: number, c: Color) {
  const step = .04, yc = (y0 + y1) / 2, half = (y1 - y0) / 2;
  for (let x = x0; x <= x1; x += step) for (let y = y0; y <= y1; y += step) {
    const q = Math.abs(y - yc) / half, row = Math.floor(q * half * 3.4) % 2;
    plot(x, y, z + rise * (1 - q), rampOf(c)[clamp((y > yc ? 3 : 1) + row - (hash(x * 3 | 0, y * 9 | 0) > .85 ? 1 : 0), 0, 4)]);
  }
  for (let y = y0; y <= y1; y += step) {
    const q = Math.abs(y - yc) / half;
    for (let h = 0; h <= rise * (1 - q); h += step) plot(x1, y, z + h, masonry(y, z + h, 2));
  }
}
function house(x0: number, y0: number, x1: number, y1: number, z1: number, c: Color) {
  const step = .045;
  for (let a = x0; a <= x1; a += step) for (let z = 0; z <= z1; z += step) plot(a, y1, z, masonry(a, z, 3));
  for (let a = y0; a <= y1; a += step) for (let z = 0; z <= z1; z += step) plot(x1, a, z, masonry(a, z, 2));
  const windows = Math.max(1, Math.floor((x1 - x0) / 1.6));
  for (let k = 0; k < windows; k++) {
    const cx = lerp(x0, x1, (k + .5) / windows);
    for (let a = cx - .24; a <= cx + .24; a += step) for (let z = z1 * .55; z <= z1 * .55 + .8; z += step) {
      plot(a, y1 + .14, z, rampOf(DARK)[Math.abs(a - cx) < .03 ? 3 : 1]);
    }
  }
  roof(x0 - .2, y0 - .2, x1 + .2, y1 + .2, z1, 1.3, c);
}
function shadowBox(x0: number, y0: number, x1: number, y1: number, z1: number) {
  for (let x = x0; x <= x1; x += .5) for (let y = y0; y <= y1; y += .5) for (let z = .3; z <= z1; z += .7) castShadow(x, y, z, .55);
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

  // limestone boulders where the river meets the banks
  const rocks: number[][] = [];
  for (let k = 0; k < 44; k++) {
    const y = -9.6 + 19.2 * hash(k, 21), side = k % 2 ? 1 : -1, r = .35 + hash(k, 22) * .7;
    rocks.push([side * (riverHalf(y) + (hash(k, 23) - .3) * 1.2), y, r]);
  }
  rocks.push([3.7, -5.6, .7], [-3.9, 6.6, .85], [-3.2, 7.4, .45], [4.1, 7.8, .55]);
  for (const [x, y, r] of rocks) {
    if (Math.abs(y) < 1.8) continue;
    sphere(x, y, r * .28, r, STONE, 'rough');
    castShadow(x, y, r * .6, r * .9);
  }

  buildBridge();
  squareTower(-12.4, -2, -10.2, 2, 10.2);
  roundTower(11.8, 0, 1.9, 9.4);
  house(-14.6, -6.6, -11.4, -3.6, 3, SLATE);
  house(-13.8, 3.6, -10.6, 6.6, 3.4, TILE);
  house(11, -7, 14.2, -3.8, 3.2, TILE);
  house(10.2, 4.4, 13.2, 7, 2.8, SLATE);
  growTree(-9.6, 7.8, .72, 260, 500);
  growTree(8.8, -8, .85, 300, 900);
  growTree(14.2, 2.6, .62, 220, 1400);

  // cast shadows: the arch and the buildings
  for (let x = -DECK_END; x <= DECK_END; x += .3) {
    const low = Math.abs(x) < ARCH_A ? archZ(x) : 0;
    for (let z = low; z <= deckZ(x); z += .45) for (let y = -.9; y <= .9; y += .6) castShadow(x, y, z, .5);
  }
  shadowBox(-12.4, -2, -10.2, 2, 10.2);
  shadowBox(9.9, -1.9, 13.7, 1.9, 9.4);
  shadowBox(-14.6, -6.6, -11.4, -3.6, 3.6);
  shadowBox(-13.8, 3.6, -10.6, 6.6, 4);
  shadowBox(11, -7, 14.2, -3.8, 3.8);
  shadowBox(10.2, 4.4, 13.2, 7, 3.4);
  bakeOcclusion();
  copyInto(staticShadow, shadowMask);
  applyShadows(groundZ);

  copyInto(bakedPix, pix);
  copyInto(bakedZ, zb);
}

/* ---------- game ---------- */
export const G = {
  phase: 'ready', dive: 0, total: 0, scores: [] as number[], finished: false, best: 0, wind: 0, power: 0,
  x: 0, y: JUMP_Y, z: 0, vy: 0, vz: 0, pitch: 0, spin: 0, baseSpin: 0, holding: false, tuck: 0,
  timer: 0, time: 0, swim: 0, status: '', cheer: 0,
};
const tourists: Tourist[] = [];
for (let k = 0; k < TOURIST_COUNT; k++) {
  const pick = (list: Color[], seed: number) => list[Math.floor(hash(k + 3, seed) * list.length)];
  const shirt = pick(TOURIST_SHIRTS, 41);
  tourists.push({
    x: (k / (TOURIST_COUNT - 1) - .5) * 15, y: (hash(k, 42) - .5) * 1.4, tx: 0, ty: 0,
    speed: .45 + hash(k, 43) * .4, wait: hash(k, 44) * 4, gait: hash(k, 45) * 6, yaw: Math.PI / 2,
    look: Math.PI / 2, phone: false, walking: false,
    palette: { shirt, stripe: hash(k, 46) > .75 ? [244, 240, 228] : shirt, legs: pick(TOURIST_LEGS, 47), hair: pick(TOURIST_HAIR, 48), skin: pick(TOURIST_SKIN, 49) },
  });
}
function pickTarget(t: Tourist) {
  // people drift towards the crown to take photos and watch the divers, bunching up either side of the
  // diver and leaving the middle of the skyline clear so the jump stays readable
  const crown = Math.random() < .68, side = Math.random() < .5 ? -1 : 1;
  t.tx = crown ? side * (DIVER_CLEARANCE + .1 + Math.random() * 3.4) : side * (DIVER_CLEARANCE + .1 + Math.random() * 7);
  t.ty = (Math.random() < .55 ? 1 : -1) * (.25 + Math.random() * .47);
  t.walking = true;
}
function updateTourists(dt: number) {
  const watching = G.phase === 'charge' || G.phase === 'air';
  for (const t of tourists) {
    t.gait += dt * 7 * t.speed;
    if (t.walking) {
      const dx = t.tx - t.x, dy = t.ty - t.y, d = Math.hypot(dx, dy);
      if (d < .15) {
        t.walking = false;
        t.wait = 1.5 + Math.random() * 6;
        t.phone = Math.random() < .55;
        t.look = t.y > 0 ? Math.PI / 2 : -Math.PI / 2;
      } else {
        t.x += dx / d * t.speed * dt;
        t.y += dy / d * t.speed * dt;
        t.look = Math.atan2(dy, dx);
      }
    } else if ((t.wait -= dt) <= 0) {
      pickTarget(t);
    }
    if (watching && !t.walking && Math.abs(t.x) < 7) { t.look = Math.PI / 2; t.phone = true; }
    let turn = t.look - t.yaw;
    turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    t.yaw += turn * Math.min(1, dt * 6);
  }
  // a soft shove keeps the crowd from walking through itself or the diver's spot on the parapet
  const clearDiver = G.phase === 'ready' || G.phase === 'charge';
  for (let i = 0; i < tourists.length; i++) {
    const a = tourists[i];
    for (let j = i + 1; j < tourists.length; j++) {
      const b = tourists[j], dx = b.x - a.x, dy = b.y - a.y, d = (Math.hypot(dx, dy) === 0 ? .01 : Math.hypot(dx, dy));
      if (d >= CROWD_GAP) continue;
      const push = (CROWD_GAP - d) * Math.min(1, dt * 5) / 2;
      a.x -= dx / d * push; a.y -= dy / d * push;
      b.x += dx / d * push; b.y += dy / d * push;
    }
    if (clearDiver) {
      const dx = a.x, dy = a.y - JUMP_Y, d = Math.hypot(dx, dy) || .01;
      if (d < DIVER_CLEARANCE) { a.x += dx / d * (DIVER_CLEARANCE - d) * Math.min(1, dt * 6); a.y += dy / d * (DIVER_CLEARANCE - d) * Math.min(1, dt * 6); }
    }
    a.x = clamp(a.x, -DECK_REACH + .2, DECK_REACH - .2);
    a.y = clamp(a.y, -.72, .72);
  }
}
function drawTourists() {
  for (const t of tourists) {
    const cheering = G.cheer > 0 && Math.abs(t.x) < 7;
    // gait steps through a few discrete poses, in keeping with the hand-animated wind
    const swing = t.walking ? Math.sin(Math.floor(t.gait * 1.3) * Math.PI / 2 + .8) : 0;
    const pose: Pose = { z: deckZ(t.x), scale: TOURIST_SCALE, stance: t.walking ? swing * .13 : .06 };
    if (cheering) {
      const beat = Math.floor(G.time * 7 + t.x) % 2;
      pose.armR = 2.8 + beat * .3; pose.armL = 2.8 - beat * .3; pose.z = (pose.z ?? 0) + beat * .06;
    } else if (t.phone && !t.walking) {
      pose.armR = 1.35; pose.armL = 1.25;
    } else {
      pose.armR = -swing * .4; pose.armL = swing * .4;
    }
    figure(t.x, t.y, t.yaw, pose, t.palette, dynamicAdd);
  }
}
const splash = { drops: [] as Drop[], rings: [] as Ring[] };
function windWords() {
  const w = Math.abs(G.wind);
  if (w < .08) return 'no wind';
  return (w > .2 ? 'strong ' : 'light ') + (G.wind > 0 ? 'wind at your back' : 'headwind');
}
function ready() {
  G.phase = 'ready';
  G.power = 0; G.pitch = 0; G.spin = 0; G.tuck = 0; G.holding = false;
  G.x = 0; G.y = JUMP_Y;
  G.z = deckZ(0) + PARAPET + HIP_HEIGHT;
  G.wind = (Math.random() - .5) * .6;
  splash.drops.length = 0;
  setStatus(windWords() + ' · hold, then release to jump');
}
function jump() {
  const p = G.power;
  G.vy = 1.4 + 1.2 * p;
  G.vz = 2 + 3.2 * p;
  G.baseSpin = .25 + .85 * p + G.wind;
  G.spin = G.baseSpin;
  G.phase = 'air';
  setStatus('hold to tuck, release to open');
  sound('jump');
}
function entry() {
  const half = G.pitch / Math.PI;
  const err = Math.abs(half - Math.round(half)) * Math.PI;
  const quality = clamp(1 - err / (Math.PI / 3), 0, 1);
  const flips = Math.abs(Math.round(half)) / 2;
  const headFirst = Math.abs(Math.round(half)) % 2 === 1;
  const points = Math.round(quality * 10 * (1 + flips * .6) * 10) / 10;
  G.total = Math.round((G.total + points) * 10) / 10;
  G.scores.push(points);
  G.dive++;
  G.phase = 'under';
  G.timer = 0;
  G.tuck = 0;
  const word = quality >= .88 ? 'rip entry' : quality >= .55 ? 'clean' : quality > 0 ? 'rough' : 'belly flop';
  const count = Math.round(8 + (1 - quality) * 90);
  for (let k = 0; k < count; k++) {
    const a = Math.random() * 6.283, reach = Math.random() * (.5 + (1 - quality) * 2.6), lift = 2 + Math.random() * (quality > .88 ? 8 : 5);
    splash.drops.push({ x: G.x + Math.cos(a) * reach * .3, y: G.y + Math.sin(a) * reach * .3, z: .1, vx: Math.cos(a) * reach, vy: Math.sin(a) * reach, vz: lift });
  }
  splash.rings.push({ x: G.x, y: G.y, r: .3, life: 1 }, { x: G.x, y: G.y, r: 0, life: 1.3 });
  sound('splash', 1 - quality * .75);
  if (quality >= .55) { sound('cheer', quality); G.cheer = 1.8; }
  const flipText = flips !== 0 && quality > 0 ? ' · ' + flips + (flips === 1 ? ' flip' : ' flips') : '';
  const entryText = quality > 0 ? (headFirst ? ' · head first' : ' · feet first') : '';
  const line = word + entryText + flipText + ' · +' + points.toFixed(1);
  if (G.dive >= DIVES) {
    const isBest = G.total > G.best;
    if (isBest) { G.best = G.total; saveBest(G.total); }
    setStatus(line + ' · total ' + G.total.toFixed(1) + (isBest ? ', a new best' : ', best ' + G.best.toFixed(1)) + ' · tap to dive again');
    G.finished = true;
  } else {
    setStatus(line + ' · tap for the next dive');
    G.finished = false;
  }
}
function press() {
  ensureAudio();
  if (G.phase === 'ready') { G.phase = 'charge'; G.power = 0; }
  else if (G.phase === 'air') G.holding = true;
  else if (G.phase === 'under' && G.timer > .5) {
    if (G.finished) { G.dive = 0; G.total = 0; G.scores = []; }
    ready();
  }
}
function releasePress() {
  if (G.phase === 'charge') jump();
  G.holding = false;
}
function update(dt: number) {
  G.time += dt;
  G.cheer = Math.max(0, G.cheer - dt);
  updateTourists(dt);
  if (G.phase === 'charge') G.power = Math.min(1, G.power + dt / .9);
  if (G.phase === 'air') {
    G.tuck += ((G.holding ? 1 : 0) - G.tuck) * Math.min(1, dt * 14);
    const target = G.baseSpin + G.tuck * 7.5;
    G.spin += (target - G.spin) * Math.min(1, dt * 12);
    G.pitch += G.spin * dt;
    G.vz -= GRAVITY * dt;
    G.z += G.vz * dt;
    G.y += G.vy * dt;
    if (G.z <= ENTRY_Z) entry();
  } else if (G.phase === 'under') {
    G.timer += dt;
    G.z = Math.max(-3, G.z - dt * 7);
  }
  for (const d of splash.drops) {
    d.vz -= GRAVITY * dt;
    d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
  }
  splash.drops = splash.drops.filter(d => d.z > 0);
  for (const r of splash.rings) { r.r += dt * 1.5 * r.life; r.life -= dt * .4; }
  splash.rings = splash.rings.filter(r => r.life > 0);
}

/* ---------- drawing ---------- */
function drawDiver() {
  const c = G.phase === 'charge' ? G.power : 0, t = G.tuck;
  const air = G.phase === 'air' || G.phase === 'under' ? 1 : 0;
  const spread = air ? 1 - t : .1 + c * .25;
  const cp = Math.cos(G.pitch), sp = Math.sin(G.pitch);
  const breathe = air ? 0 : Math.sin(G.time * 1.8) * .012;
  const hipDrop = .45 * c;
  const k = DIVER_SCALE;
  const at = (s: number, f: number, z: number) => [G.x + s * k, G.y + (f * cp + z * sp) * k, G.z + (breathe - hipDrop + z * cp - f * sp) * k];
  const bone = (a: Vec3, b: Vec3, boneR0: number, boneR1: number, color: Color) => {
    const r0 = boneR0 * k, r1 = boneR1 * k;
    const pa = at(a[0], a[1], a[2]), pb = at(b[0], b[1], b[2]);
    if (pa[2] < .02 && pb[2] < .02) return;
    if (pa[2] < .02) { const k = (.02 - pa[2]) / (pb[2] - pa[2]); pa[0] += (pb[0] - pa[0]) * k; pa[1] += (pb[1] - pa[1]) * k; pa[2] = .02; }
    if (pb[2] < .02) { const k = (.02 - pb[2]) / (pa[2] - pb[2]); pb[0] += (pa[0] - pb[0]) * k; pb[1] += (pa[1] - pb[1]) * k; pb[2] = .02; }
    dynamicAdd(pa, pb, r0, r1, () => color);
  };
  const skin = DIVER.skin;
  const neck = [0, .25 * t + .1 * c, .95 - .12 * t], head = [0, .45 * t + .16 * c, 1.27 - .2 * t];
  bone(neck, head, .11, .12, skin);
  bone(head, head, .24, .24, skin);
  bone([0, head[1] - .05, head[2] + .08], [0, head[1] - .05, head[2] + .08], .205, .205, DIVER.hair);
  bone([0, 0, 0], neck, .26, .3, skin);
  for (const side of [-1, 1]) {
    const footS = side * .17;
    const knee = [footS, lerp(.35 * c, .6, t), lerp(-.62 + .2 * c, .1, t)];
    const foot = [footS, lerp(.06 * c, .15, t), lerp(-1.25 + hipDrop, -.25, t)];
    bone([footS, 0, 0], knee, .17, .13, skin);
    bone(knee, foot, .13, .1, skin);
    const shoulder = [side * .34, neck[1], neck[2] - .05];
    const hand = [
      side * lerp(lerp(.42, 1.2, spread), .2, t),
      lerp(.05 + c * -.3, .62, t),
      lerp(lerp(-.02, neck[2] + .12, spread), .02, t),
    ];
    const elbow = [(shoulder[0] + hand[0]) / 2, (shoulder[1] + hand[1]) / 2, (shoulder[2] + hand[2]) / 2];
    bone(shoulder, elbow, .12, .1, skin);
    bone(elbow, hand, .09, .08, skin);
    bone([side * .15, 0, -.02], [side * .17, lerp(0, .3, t), lerp(-.28, -.02, t)], .2, .17, DIVER.trunks);
  }
}
function drawSwimmer() {
  if (G.timer < 1) return;
  const swim = (G.timer - 1) * .55, x = G.x + (G.x >= 0 ? 1 : -1) * Math.min(swim, 3.4);
  const bob = Math.sin(G.time * 3) * .03;
  sphere(x, G.y, .22 + bob, .24, DIVER.skin, 'solid');
  sphere(x - .05, G.y - .05, .32 + bob, .19, DIVER.hair, 'solid');
}
const STREAKS: Streak[] = [];
for (let k = 0; k < 340; k++) {
  STREAKS.push({ x: (hash(k, 31) - .5) * 11, y0: hash(k, 32) * 21, speed: .9 + hash(k, 33) * 1.1, len: 2 + (hash(k, 34) * 3 | 0), bright: hash(k, 35) > .72 });
}
function drawWater(t: number) {
  const lit = rgb(150, 208, 180), soft = rgb(104, 180, 158), dim = rgb(58, 112, 120);
  for (const s of STREAKS) {
    const y = ((s.y0 + t * s.speed) % 21) - 10.5;
    for (let k = 0; k < s.len; k++) {
      const p = project(s.x + Math.sin(y * .4 + s.y0) * .3, y + k * .11, 0), ix = p.sx | 0, iy = p.sy | 0;
      if (ix < 0 || iy < 0 || ix >= W || iy >= H) continue;
      const i = iy * W + ix;
      if (kinds[i] !== KIND_WATER || zb[i] !== groundZ[i]) continue;
      pix[i] = staticShadow[i] ? dim : s.bright ? lit : soft;
    }
  }
}
function drawRings() {
  const color = rgb(226, 240, 226);
  for (const r of splash.rings) {
    const n = Math.max(10, Math.ceil(r.r * 22));
    for (let k = 0; k < n; k++) {
      if (hash(k, r.r * 40 | 0) > r.life) continue;
      const a = k / n * 6.283, p = project(r.x + Math.cos(a) * r.r, r.y + Math.sin(a) * r.r, 0), ix = p.sx | 0, iy = p.sy | 0;
      if (ix < 0 || iy < 0 || ix >= W || iy >= H) continue;
      const i = iy * W + ix;
      if (kinds[i] === KIND_WATER && zb[i] === groundZ[i]) pix[i] = color;
    }
  }
}
function drawDrops() {
  const color = rgb(244, 250, 244);
  for (const d of splash.drops) {
    const p = project(d.x, d.y, d.z), ix = p.sx | 0, iy = p.sy | 0;
    if (ix >= 0 && iy >= 0 && ix < W && iy < H) pix[iy * W + ix] = color;
  }
}
function drawMarker() {
  if (G.phase !== 'ready') return;
  const p = project(G.x, G.y, G.z + 1.7);
  drawArrow(p.sx, p.sy, G.time);
}
function drawChargeBar() {
  if (G.phase !== 'charge') return;
  const p = project(G.x, G.y, G.z + 1.7), left = Math.round(p.sx) - 8, top = Math.round(p.sy) - 7;
  const frame: number[][] = [], fill: number[][] = [], empty: number[][] = [], n = Math.round(G.power * 15);
  for (let x = 0; x < 17; x++) for (let y = 0; y < 5; y++) {
    const inner = x > 0 && x < 16 && y > 0 && y < 4;
    (inner ? (x - 1 < n ? fill : empty) : frame).push([left + x, top + y]);
  }
  haloDots(frame);
  drawDots(frame, INK);
  drawDots(empty, PAPER);
  drawDots(fill, SIGNAL);
}
function draw() {
  copyInto(pix, bakedPix);
  copyInto(zb, bakedZ);
  pendingShadows.length = 0;
  drawTourists();
  if (G.phase !== 'under' || G.z > -1.4) drawDiver();
  if (G.phase === 'under') drawSwimmer();
  const windT = STILL ? 0 : Math.floor(G.time * WIND_FPS) / WIND_FPS;
  drawLeaves(windT);
  drawTufts(windT);
  drawWater(windT);
  drawRings();
  flushShadows();
  applyShadows(groundZ); // moving shadows stay on the ground and water, never on the masonry
  shadeEdges();
  drawDrops();
  drawMarker();
  drawChargeBar();
}


function setStatus(text: string): void { G.status = text; }

function saveBest(value: number): void { saveScore('stari-most', value); }

export class StariMost extends PixelGame {
 constructor() { super('stari-most', 'STARI MOST', 'Maintenir pour sauter · En vol : maintenir pour tourner, relâcher pour entrer droit'); }
 override init():void { configureRenderer(46,.55,-.08); G.best=readScore('stari-most'); bake(); this.reset(); }
 override reset():void { G.dive=0; G.total=0; G.scores=[]; G.finished=false; ready(); }
 override update(dt:number):void { update(dt); this.status=G.status; this.score=G.total.toFixed(1)+' points · '+Math.min(5,G.dive+1)+'/5 sauts · record '+G.best.toFixed(1); }
 override draw():void { draw(); }
 override pointer(x:number,y:number,phase:i32):void { if(phase===0) press(); else if(phase===2||phase===3) releasePress(); }
 override key(name:string,down:boolean):void { if(name===' '||name==='Enter') { if(down) press(); else releasePress(); } }
}