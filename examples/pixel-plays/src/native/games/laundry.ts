// laundry — strict Zinc TypeScript port of Pixel Plays, MIT. See LICENSE.upstream.
import { Color, Vec3, Pose, Palette, ShadowPart, W, H, S, SIN, COS, R2, SHADOW_X, SHADOW_Y, pix, zb, bakedPix, bakedZ, ground, shadowMask, groundZ, GRASS, rgb, rampOf, bayerAt, tint, clamp, lerp, ease, hash, noise, project, unproject, sphere, capsule, box, castShadow, applyShadows, shadeEdges, KIND_GRASS, kinds, WIND_FPS, STILL, staticShadow, growGrass, drawTufts, drawLeaves, bakeOcclusion, plot, growTree, figure, sphere2, dynamicAdd, pendingShadows, flushShadows, drawDots, haloDots, drawArrow, copyInto, queueShadow, configureRenderer, rgbColor, projectVector, castShadowVector } from '../renderer';
import { PixelGame } from '../game';
import { sound, ensureAudio } from '../audio';
import { readBest as readScore, saveBest as saveScore } from '../scores';
import { audioRain, setMotion } from '../audio';
interface Point {x:number;y:number;}
interface ClothSpec {w:number;h:number;value:number;speed:number;}
interface Item {id:number;kind:string;w:number;h:number;value:number;speed:number;cx:number;ly:number;x:number;y:number;z:number;vx:number;vy:number;vz:number;state:string;wet:number;pop:number;rot:number;spin:number;phase:number;color:Color;accent:Color;stripes:boolean;}
interface Drop {x:number;y:number;z:number;}
interface Splash {x:number;y:number;life:number;}
interface Cloud {x:number;y:number;r:number;speed:number;from:number;}



const ROOF_X = 12.5, ROOF_Y = 7, WALL_DEPTH = 6, PARAPET_H = .6;
const POLE_X = 10, LINE_Z = 3.7, LINE_YS = [-4.2, -.8, 2.6], SPAN = 17;
const BASKET = { x: 9.8, y: 5.2, r: .95, h: 1 }, DROP_PX = 26, CARRY_Z = 1.7;
const STORM_FROM = 10, STORM_TO = 28, RAIN_FROM = 28, RAIN_TO = 36, GAME_LENGTH = 48;
const PAVER = [190, 120, 88], PLASTER = [234, 224, 202], STONE = [206, 194, 170], SHUTTER = [70, 112, 104], DARK = [44, 40, 50];
const POLE = [96, 84, 74], ROPE = [238, 234, 222], WICKER = [188, 146, 88], CLOUD = [150, 148, 170], POT = [176, 92, 62], LEAF = [92, 128, 72];
const HOST = { shirt: [62, 82, 120], stripe: [62, 82, 120], legs: [44, 44, 58], hair: [176, 170, 160], skin: [214, 164, 128] };
const KINDS = new Map<string, ClothSpec>([
  ['sheet', { w: 3, h: 2.4, value: 5, speed: 6.5 }],
  ['towel', { w: 1.5, h: 1.6, value: 3, speed: 9 }],
  ['shirt', { w: 1.9, h: 1.75, value: 3, speed: 10 }],
  ['trousers', { w: 1.25, h: 2.1, value: 3, speed: 10 }],
  ['sock', { w: .5, h: .8, value: 1, speed: 18 }],
]);
const CLOTHS = [[246, 244, 234], [238, 118, 96], [92, 148, 176], [246, 204, 92], [226, 150, 176], [124, 170, 124], [72, 88, 136], [244, 240, 226]];
const LINE_SETS = [
  ['sheet', 'shirt', 'towel', 'sheet', 'sock', 'sock', 'trousers'],
  ['towel', 'sheet', 'trousers', 'shirt', 'sock', 'shirt', 'towel'],
  ['shirt', 'sock', 'sheet', 'towel', 'sock', 'trousers', 'shirt'],
];

export const G = {
  phase: 'play', t: 0, time: 0, items: [] as Item[], held: null as Item | null, auto: false, pointer: null as Point | null, hover: 0,
  score: 0, gustIn: 8, gustDir: 1, gustGlow: 0, flash: 0, boltIn: 22, bolt: null as number[][] | null, status: '', best: 0, overT: 0, wetness: 0,
};
const itemBuf = Array.from({ length: W * H }, (): number => 0);
const puddle = Array.from({ length: W * H }, (): number => 0);
const lineZ = (x: number) => LINE_Z - .22 * (1 - (x / POLE_X) ** 2);
const stormLevel = () => ease(clamp((G.t - STORM_FROM) / (STORM_TO - STORM_FROM), 0, 1));
const rainLevel = () => clamp((G.t - RAIN_FROM) / (RAIN_TO - RAIN_FROM), 0, 1);

/* ---------- scene ---------- */
function groundColor(x: number, y: number, ix: number, iy: number) {
  if (Math.abs(x) > ROOF_X || Math.abs(y) > ROOF_Y) return 0;
  const fx = x / 1.5, row = Math.floor(fx), fy = y / 1.5 + (row % 2) * .5, col = Math.floor(fy);
  const joint = fx - row < .08 || fy - col < .08;
  const ramp = rampOf(PAVER);
  if (joint) return ramp[1];
  const tone = hash(row, col), fine = hash(ix, iy);
  if (fine > .975) return ramp[4];
  if (noise(x * .5, y * .5) > .7 && fine > .55) return rgb(116, 122, 70); // moss in the damp patches
  return ramp[clamp(Math.floor(2.2 + tone * 1.6 + (bayerAt(ix, iy) - .5) * .5), 2, 4)];
}
function wallColor(a: number, z: number, base: number) {
  const fz = (z + 40) * 1.6, course = Math.floor(fz), fa = a * 1.2 + (course % 2) * .5, block = Math.floor(fa);
  // plaster with patches fallen away to the stone behind
  if (noise(a * .4, z * .5 + 4) > .68) {
    const mortar = fz - course < .14 || fa - block < .1;
    return rampOf(STONE)[clamp(base - (mortar ? 1 : 0) + (hash(block, course) > .7 ? 1 : 0), 0, 4)];
  }
  return rampOf(PLASTER)[clamp(base + (hash(a * 9 | 0, z * 9 | 0) > .9 ? -1 : 0), 0, 4)];
}
// the building drops away below the roof and dissolves into the white page
function wallPixel(x: number, y: number, z: number, a: number, base: number) {
  const fade = (-z - (WALL_DEPTH - 3)) / 3;
  if (fade > 0 && hash(a * 23 | 0, z * 23 | 0) < fade) return;
  plot(x, y, z, wallColor(a, z, base));
}
function buildWalls() {
  const step = .045;
  for (let x = -ROOF_X; x <= ROOF_X; x += step) for (let z = 0; z >= -WALL_DEPTH; z -= step) wallPixel(x, ROOF_Y, z, x, 3);
  for (let y = -ROOF_Y; y <= ROOF_Y; y += step) for (let z = 0; z >= -WALL_DEPTH; z -= step) wallPixel(ROOF_X, y, z, y, 2);
  const windows = (place: (a: number,z: number,c: u32)=>void, count: number, span: number) => {
    for (let k = 0; k < count; k++) {
      const c = (k + .5) / count * span * 2 - span;
      for (let a = -.45; a <= .45; a += step) for (let z = -2.8; z <= -1; z += step) place(c + a, z, rampOf(DARK)[Math.abs(a) < .03 || Math.abs(z + 1.9) < .03 ? 3 : 1]);
      for (const side of [-1, 1]) for (let a = .45; a <= .95; a += step) for (let z = -2.8; z <= -1; z += step) {
        place(c + side * a, z, rampOf(SHUTTER)[Math.floor((z + 3) * 7) % 2 ? 3 : 2]);
      }
    }
  };
  windows((a, z, c) => plot(a, ROOF_Y + .14, z, c), 5, ROOF_X);
  windows((a, z, c) => plot(ROOF_X + .14, a, z, c), 3, ROOF_Y);
}

function buildRoof() {
  const h = PARAPET_H, t = .3;
  box(-ROOF_X, ROOF_Y - t, 0, ROOF_X, ROOF_Y, h, PLASTER, 1);
  box(ROOF_X - t, -ROOF_Y, 0, ROOF_X, ROOF_Y, h, PLASTER, 2);
  box(-ROOF_X, -ROOF_Y, 0, ROOF_X, -ROOF_Y + t, h, PLASTER, 3);
  box(-ROOF_X, -ROOF_Y, 0, -ROOF_X + t, ROOF_Y, h, PLASTER, 4);
  // stair head with a door, a water tank on top
  const step = .045;
  box(-12.2, -6.7, 0, -8.4, -3.2, 3.6, PLASTER, 5);
  box(-12.5, -7, 3.6, -8.1, -2.9, 3.85, STONE, 6);
  for (let a = -10.9; a <= -9.7; a += step) for (let z = 0; z <= 2.5; z += step) plot(a, -3.06, z, rampOf(SHUTTER)[Math.floor(a * 3) % 2 ? 2 : 1]);
  capsule([-10.8, -5, 4.5], [-9.4, -5, 4.5], .55, .55, () => STONE, 'rough');
  castShadow(-10, -5, 4.2, .9);
  // chimney with a cowl, and an aerial
  box(3, -6.5, 0, 4.2, -5.3, 2.8, STONE, 7);
  box(2.85, -6.65, 2.8, 4.35, -5.15, 3, PLASTER, 8);
  box(3.3, -6.2, 3, 3.9, -5.6, 3.35, POT, 9);
  for (let z = 0; z <= 5; z += step) plot(6.8, -6.3, z, rampOf(DARK)[2]);
  for (const [z, w] of [[4.8, .7], [4.4, 1], [4, 1.3]]) for (let a = -w; a <= w; a += step) plot(6.8 + a, -6.3 - a * .3, z, rampOf(DARK)[2]);
  // potted plants against the parapet, and a small lemon tree
  for (const [x, y, r] of [[-3, 6.1, .5], [-1.6, 6.15, .42], [5.6, 6.1, .46], [11.5, -2.2, .5], [11.55, -.9, .4]]) {
    box(x - r * .8, y - r * .8, 0, x + r * .8, y + r * .8, r * 1.4, POT, x | 0);
    for (let k = 0; k < 14; k++) {
      const a = hash(k, x * 3) * 6.28, d = hash(k, y * 5) * r;
      sphere(x + Math.cos(a) * d, y + Math.sin(a) * d, r * 1.7 + hash(k, 9) * r, .22, LEAF, 'rough');
    }
    castShadow(x, y, r, r);
  }
  box(-11.7, 4.6, 0, -10.5, 5.8, .9, POT, 12);
  growTree(-11.1, 5.2, .58, 200, 300);
  // poles and rope
  for (const y of LINE_YS) {
    for (const x of [-POLE_X, POLE_X]) {
      box(x - .09, y - .09, 0, x + .09, y + .09, LINE_Z + .25, POLE, 13);
      for (let z = .3; z < LINE_Z; z += .4) castShadow(x, y, z, .12, 1, 0);
    }
    for (let x = -POLE_X; x <= POLE_X; x += .04) plot(x, y, lineZ(x), rampOf(ROPE)[3]);
    for (let x = -POLE_X; x <= POLE_X; x += .4) castShadow(x, y, lineZ(x), .05, 1, 0);
  }
  // the basket
  for (let t = 0; t < 6.283; t += .02) for (let z = 0; z <= BASKET.h; z += step) {
    const nx = Math.cos(t), ny = Math.sin(t), weave = (Math.floor(z * 8) + Math.floor(t * 7)) % 2;
    plot(BASKET.x + nx * BASKET.r, BASKET.y + ny * BASKET.r, z, rampOf(WICKER)[clamp(Math.round(2.6 - .5 * nx + .85 * ny) + weave - 1 + (z > BASKET.h - .1 ? 1 : 0), 0, 4)]);
  }
  for (let a = 0; a < 6.283; a += .05) for (let q = 0; q < BASKET.r; q += step) plot(BASKET.x + Math.cos(a) * q, BASKET.y + Math.sin(a) * q, BASKET.h - .04, rampOf(DARK)[1]);
  castShadow(BASKET.x, BASKET.y, .5, BASKET.r);
  for (let x = -12.2; x <= -8.4; x += .5) for (let y = -6.7; y <= -3.2; y += .5) for (let z = .4; z < 3.6; z += .6) castShadow(x, y, z, .5);
  for (let z = .4; z < 3; z += .5) castShadow(3.6, -5.9, z, .6);
  for (let x = -ROOF_X; x <= ROOF_X; x += .4) for (const z of [.1, .35, .55]) castShadow(x, -ROOF_Y + .15, z, .22);
}
function bake() {
  zb.fill(-1e9);
  pix.fill(rgb(255, 255, 255));
  for (let iy = 0; iy < H; iy++) for (let ix = 0; ix < W; ix++) {
    const g = unproject(ix + .5, iy + .5), c = groundColor(g.x, g.y, ix, iy), i = iy * W + ix;
    if (!c) continue;
    pix[i] = c; ground[i] = 1;
    zb[i] = (g.x + g.y) / R2 * COS;
    puddle[i] = noise(g.x * .55 + 3, g.y * .8 + 7);
  }
  copyInto(groundZ, zb);
  buildWalls();
  buildRoof();
  bakeOcclusion();
  copyInto(staticShadow, shadowMask);
  applyShadows(groundZ);
  copyInto(bakedPix, pix);
  copyInto(bakedZ, zb);
}

/* ---------- washing ---------- */
function shuffle<T>(list: T[]): T[] {
  for (let k = list.length - 1; k > 0; k--) {
    const j = Math.floor(Math.random() * (k + 1));
    [list[k], list[j]] = [list[j], list[k]];
  }
  return list;
}
function hangWashing() {
  G.items = [];
  LINE_YS.forEach((y, line) => {
    const kinds = shuffle(LINE_SETS[line].slice());
    const total = kinds.reduce((sum, k) => sum + KINDS.get(k)!.w, 0);
    const gap = Math.min(1.1, (SPAN - total) / Math.max(1, kinds.length - 1));
    let x = -(total + gap * (kinds.length - 1)) / 2;
    for (const kind of kinds) {
      const spec = KINDS.get(kind)!, cx = x + spec.w / 2;
      G.items.push({
        id: G.items.length + 1, kind, ...spec, cx, ly: y, x: cx, y, z: lineZ(cx), vx: 0, vy: 0, vz: 0,
        state: 'line', wet: 0, pop: 0, rot: 0, spin: 0, phase: Math.random() * 6.28,
        color: CLOTHS[Math.floor(Math.random() * CLOTHS.length)], accent: CLOTHS[Math.floor(Math.random() * CLOTHS.length)], stripes: Math.random() > .55,
      });
      x += spec.w + gap;
    }
  });
}
const inside = (item: Item, u: number, v: number) => {
  const w = item.w, h = item.h, a = Math.abs(u);
  if (item.kind === 'shirt') return a < w * .3 || v < h * .32 + (a - w * .3) * -.3;
  if (item.kind === 'trousers') return v < h * .32 || a > .06;
  if (item.kind === 'sock') return v < h * .62 ? a < w * .3 : u > -w * .3;
  return true;
};
function drawCloth(item: Item, t: number) {
  const pinned = item.state === 'line' || item.state === 'loose';
  const flying = item.state === 'flying' || item.state === 'falling';
  const flat = item.state === 'ground';
  const gusty = 1 + stormLevel() * .9 + G.gustGlow * 1.2;
  const amp = item.state === 'loose' ? .55 : flying || item.state === 'held' ? .4 : .12 * gusty;
  const speed = item.state === 'loose' ? 9 : 3 + stormLevel() * 2;
  const ramp = rampOf(item.color), alt = rampOf(item.accent);
  const cr = Math.cos(item.rot), sr = Math.sin(item.rot), step = .055;
  const dryness = Math.floor(item.wet * 1.8);
  const trailX = item.state === 'held' ? clamp(item.vx * .05, -.7, .7) : 0;
  for (let u = -item.w / 2; u <= item.w / 2; u += step) for (let v = 0; v <= item.h; v += step) {
    if (!inside(item, u, v)) continue;
    const wave = u * 3.2 + t * speed + item.phase + v * 1.2, s = Math.sin(wave), c = Math.cos(wave);
    let px, py, pz;
    if (flat) {
      px = item.x + u; py = item.y + v - item.h / 2; pz = .05 + (s + 1) * .03;
    } else {
      const reach = pinned ? v / item.h + .12 : 1;
      px = item.x + u * cr - v * sr - trailX * v;
      py = item.y + s * amp * reach;
      pz = item.z - v * cr - u * sr;
      if (pz < .05) pz = .05;
    }
    const level = clamp(3 + Math.round(c * 1.1) - dryness, 0, 4);
    const stripe = item.stripes && Math.floor((item.kind === 'sheet' ? u * 2.4 : v * 5) + 40) % 2 !== 0;
    const p = project(px, py, pz), ix = p.sx | 0, iy = p.sy | 0;
    if (ix < 0 || iy < 0 || ix >= W || iy >= H) continue;
    const i = iy * W + ix;
    if (p.d <= zb[i]) continue;
    zb[i] = p.d;
    pix[i] = (stripe ? alt : ramp)[level];
    itemBuf[i] = item.id;
  }
  if (pinned) {
    const n = item.kind === 'sock' ? 1 : 2;
    for (let k = 0; k < n; k++) {
      const a = n === 1 ? 0 : (k ? .42 : -.42) * item.w;
      plot(item.x + a, item.y + .04, item.z + .06, item.state === 'loose' ? rgb(255, 214, 10) : rgb(120, 92, 62));
    }
  }
  if (!flat) {
    const samples = item.kind === 'sock' ? 1 : 3;
    for (let k = 0; k < samples; k++) {
      const a = samples === 1 ? 0 : (k / (samples - 1) - .5) * item.w * .75;
      castShadow(item.x + a, item.y, Math.max(.05, item.z - item.h / 2), Math.max(.22, item.h * .34), 1, .4);
    }
  }
}
function drawPile() {
  const banked = G.items.filter(i => i.state === 'basket');
  banked.forEach((item, k) => {
    const a = hash(k, 51) * 6.28, d = hash(k, 52) * BASKET.r * .55;
    sphere(BASKET.x + Math.cos(a) * d, BASKET.y + Math.sin(a) * d, BASKET.h + Math.min(1.1, k * .06) + hash(k, 53) * .2, item.kind === 'sock' ? .2 : .42, item.color, 'solid');
  });
}

/* ---------- play ---------- */
function reset() {
  G.t = 0; G.score = 0; G.held = null; G.auto = false; G.pointer = null; G.phase = 'play';
  G.gustIn = 8; G.gustGlow = 0; G.flash = 0; G.boltIn = 22; G.bolt = null; G.wetness = 0; G.overT = 0;
  splashes.length = 0;
  hangWashing();
  setStatus('drag the washing into the basket');
}
const live = (i: Item) => i.state !== 'basket' && i.state !== 'lost';
function bank(item: Item) {
  item.state = 'basket';
  G.score = Math.round((G.score + item.value * (1 - item.wet * .7)) * 10) / 10;
  sound('drop');
}
function gust() {
  const storm = stormLevel(), count = 1 + Math.round(storm * 2);
  const hanging = shuffle(G.items.filter(i => i.state === 'line'));
  G.gustGlow = 1;
  sound('gust');
  for (const item of hanging.slice(0, count)) {
    item.state = 'loose';
    item.pop = .9;
  }
  for (const item of G.items) if (item.state === 'ground' && Math.random() < .5) launch(item);
}
function launch(item: Item) {
  // an item near an edge blows back across the roof, so there is always time to catch it
  const side = Math.abs(item.x) > 3 ? -Math.sign(item.x) : (Math.random() < .5 ? -1 : 1);
  const a = (Math.random() - .5) * .7, speed = 3.2 + stormLevel() * 1.8;
  item.state = 'flying';
  item.vx = side * Math.cos(a) * speed;
  item.vy = Math.sin(a) * speed;
  item.spin = (Math.random() - .5) * 2.6;
  item.z = Math.max(item.z, 2.4);
}
function endGame() {
  G.phase = 'over';
  G.overT = 0;
  if (G.held) { G.held.state = 'falling'; G.held = null; }
  const banked = G.items.filter(i => i.state === 'basket');
  const dry = banked.filter(i => i.wet < .25).length, lost = G.items.filter(i => i.state === 'lost').length;
  const isBest = G.score > G.best;
  if (isBest) { G.best = G.score; saveBest(G.score); }
  const parts = [dry + ' dry', (banked.length - dry) + ' wet', lost + ' lost'].join(' · ');
  setStatus(parts + (isBest ? ' · a new best' : ' · best ' + G.best) + ' · tap to hang it again');
}
function statusLine() {
  if (G.held) return G.auto ? 'carrying to the basket' : 'drop it in the basket';
  if (G.t < STORM_FROM) return 'drag the washing into the basket';
  if (G.t < RAIN_FROM) return 'the sky is turning';
  return G.t < RAIN_TO ? 'rain' : 'it is pouring';
}
const pointerWorld = () => {
  const g = unproject(G.pointer!.x, G.pointer!.y + CARRY_Z * COS * S);
  return { x: clamp(g.x, -ROOF_X - 1, ROOF_X + 1), y: clamp(g.y, -ROOF_Y - 1, ROOF_Y + 1) };
};
function overBasket(item: Item) {
  const a = project(item.x, item.y, item.z - item.h / 2), b = project(BASKET.x, BASKET.y, BASKET.h);
  return Math.hypot(a.sx - b.sx, a.sy - b.sy) < DROP_PX;
}
function update(dt: number) {
  G.time += dt;
  G.gustGlow = Math.max(0, G.gustGlow - dt * .8);
  G.flash = Math.max(0, G.flash - dt * 3.2);
  if (G.bolt && G.flash < .35) G.bolt = null;
  if (G.phase === 'play') {
    G.t += dt;
    setStatus(statusLine());
    if ((G.gustIn -= dt) <= 0) {
      gust();
      G.gustIn = lerp(7, 3, stormLevel()) * (.8 + Math.random() * .4);
    }
    if (G.t >= GAME_LENGTH || !G.items.some(live)) endGame();
  } else {
    // the storm breaks whenever you finish: a quick player gets to watch it from the dry side
    G.overT += dt;
    G.t = Math.min(GAME_LENGTH, G.t + dt * 2);
  }
  if (G.t > 18 && (G.boltIn -= dt) <= 0) {
    strike();
    G.boltIn = 3.5 + Math.random() * 4;
  }
  const rain = rainLevel();
  G.wetness = Math.min(1, G.wetness + rain * dt / 14);
  for (const item of G.items) {
    if (item.state === 'basket' || item.state === 'lost') continue;
    item.wet = Math.min(1, item.wet + rain * dt / 8);
    if (item.state === 'loose') {
      if ((item.pop -= dt) <= 0) { launch(item); sound('pop'); }
    } else if (item.state === 'flying') {
      item.x += item.vx * dt; item.y += item.vy * dt; item.rot += item.spin * dt;
      const away = Math.abs(item.x) > ROOF_X + 1.2 || Math.abs(item.y) > ROOF_Y + 1.2;
      item.vz = away ? -9 : Math.sin(G.time * 2.7 + item.phase) * 1.1 + (3 - item.z) * .7;
      item.z += item.vz * dt;
      if (item.z < -7) item.state = 'lost';
    } else if (item.state === 'falling') {
      item.vz -= 14 * dt;
      item.z += item.vz * dt;
      item.rot *= .9;
      if (item.z < .6) { item.state = 'ground'; item.rot = 0; item.vz = 0; }
    } else if (item.state === 'held') {
      const target = G.auto ? { x: BASKET.x, y: BASKET.y } : pointerWorld();
      const dx = target.x - item.x, dy = target.y - item.y, d = Math.hypot(dx, dy);
      const move = Math.min(d, item.speed * dt), px = item.x;
      if (d > 0) { item.x += dx / d * move; item.y += dy / d * move; }
      item.vx = (item.x - px) / Math.max(dt, .001);
      item.z += (CARRY_Z + item.h / 2 - item.z) * Math.min(1, dt * 10);
      item.rot *= .8;
      if (G.auto && overBasket(item)) { G.held = null; G.auto = false; bank(item); }
    }
  }
  updateRain(dt, rain);
}
function grab(item: Item, auto: boolean) {
  G.held = item;
  G.auto = auto;
  item.state = 'held';
  item.vz = 0;
  sound('pop');
}
function letGo() {
  const item = G.held;
  if (!item) return;
  G.held = null;
  if (overBasket(item)) bank(item);
  else { item.state = 'falling'; item.vz = 0; }
}
function priority(state: string): number { if(state==='flying')return 0;if(state==='loose')return 1;if(state==='ground'||state==='falling')return 2;if(state==='line')return 3;return 99; }
function nextItem(): Item | null { const items=G.items.filter((item: Item): boolean=>priority(item.state)<99); items.sort((a: Item,b: Item):number=>{const d=priority(a.state)-priority(b.state);return d!==0?d:b.value-a.value;}); return items.length>0?items[0]:null; }
/* ---------- storm ---------- */
const drops: Drop[] = [], splashes: Splash[] = [];
const CELLS_W = (W >> 3) + 1, CELLS_H = (H >> 3) + 1, cloudCells = Array.from({ length: CELLS_W * CELLS_H }, (): number => 0);
let cloudStamp = -1;
const CLOUDS: Cloud[] = [];
for (let k = 0; k < 26; k++) {
  CLOUDS.push({ x: hash(k, 61) * W, y: 20 + hash(k, 62) * 26, r: 8 + hash(k, 63) * 9, speed: 3 + hash(k, 64) * 3, from: hash(k, 65) });
}
function updateRain(dt: number, rain: number) {
  const want = Math.floor(rain * 520);
  while (drops.length < want) drops.push(newDrop(true));
  if (drops.length > want) drops.length = want;
  const wind = 3 + G.gustGlow * 5;
  for (let k = 0; k < drops.length; k++) {
    const d = drops[k];
    d.z -= 26 * dt;
    d.x += wind * dt;
    if (d.z <= 0) {
      if (Math.abs(d.x) < ROOF_X && Math.abs(d.y) < ROOF_Y) splashes.push({ x: d.x, y: d.y, life: .12 });
      drops[k] = newDrop(false);
    }
  }
  for (const s of splashes) s.life -= dt;
  while (splashes.length > 0 && splashes[0].life <= 0) splashes.shift();
  audioRain(rain);
}
function newDrop(anywhere: boolean) {
  return { x: (Math.random() - .5) * (ROOF_X * 2 + 4) - 2, y: (Math.random() - .5) * ROOF_Y * 2.2, z: anywhere ? Math.random() * 14 : 12 + Math.random() * 3 };
}
function strike() {
  G.flash = 1;
  const x0 = Math.random() < .5 ? 40 + Math.random() * 50 : 270 + Math.random() * 50;
  const points = [[x0, 44]];
  let x = x0, y = 44;
  while (y < 150) { x += (Math.random() - .5) * 18; y += 8 + Math.random() * 10; points.push([x, y]); }
  G.bolt = points;
  sound('thunder');
}
function drawClouds(storm: number, windT: number) {
  if (storm <= 0) return;
  const ramp = rampOf(CLOUD);
  for (const c of CLOUDS) {
    const show = clamp(storm * 1.5 - c.from * .6, 0, 1);
    if (show <= 0) continue;
    const cx = 30 + ((c.x + windT * c.speed) % (W - 60));
    const edge = clamp((Math.min(cx, W - cx) - 18) / 34, 0, 1), alpha = show * edge;
    const rx = c.r * 1.5, ry = c.r;
    for (let iy = Math.max(0, c.y - ry | 0); iy <= c.y + ry && iy < H; iy++) for (let ix = Math.max(0, cx - rx | 0); ix <= cx + rx && ix < W; ix++) {
      const dx = (ix - cx) / rx, dy = (iy - c.y) / ry, nn = dx * dx + dy * dy;
      if (nn > 1) continue;
      const i = iy * W + ix;
      if (zb[i] > -1e8 || bayerAt(ix, iy) > alpha * 1.6 * (1.15 - nn * .4)) continue;
      const l = -.45 * dx - .75 * dy + .5 * Math.sqrt(1 - nn);
      pix[i] = ramp[clamp(Math.floor(l * 3.2 + 1 + (bayerAt(ix, iy) - .5) * .6), 0, 4)];
    }
  }
}
function drawBolt() {
  if (!G.bolt) return;
  const core = rgb(120, 112, 214), bright = rgb(250, 240, 150);
  for (let k = 0; k < G.bolt!.length - 1; k++) {
    const [ax, ay] = G.bolt![k], [bx, by] = G.bolt[k + 1], n = Math.ceil(Math.hypot(bx - ax, by - ay));
    for (let j = 0; j <= n; j++) {
      const sx = lerp(ax, bx, j / n) | 0, sy = lerp(ay, by, j / n) | 0;
      for (const [ox, c] of [[0, bright], [-1, core], [1, core]]) {
        const ix = sx + ox;
        if (ix < 0 || ix >= W || sy < 0 || sy >= H) continue;
        const i = sy * W + ix;
        if (zb[i] < -1e8) pix[i] = c;
      }
    }
  }
}
function drawRain() {
  const color = rgb(112, 134, 188), wind = (3 + G.gustGlow * 5) / 26;
  for (const d of drops) {
    for (let k = 0; k < 4; k++) {
      const p = project(d.x - wind * k * .3, d.y, d.z + k * .3), ix = p.sx | 0, iy = p.sy | 0;
      if (ix < 0 || iy < 0 || ix >= W || iy >= H) continue;
      const i = iy * W + ix;
      if (p.d > zb[i]) pix[i] = color;
    }
  }
  const pale = rgb(212, 224, 244);
  for (const s of splashes) {
    const p = project(s.x, s.y, 0), ix = p.sx | 0, iy = p.sy | 0;
    if (ix < 1 || iy < 0 || ix >= W - 1 || iy >= H) continue;
    const i = iy * W + ix;
    if (zb[i] === groundZ[i]) { pix[i] = pale; pix[i - 1] = pale; pix[i + 1] = pale; }
  }
}
// the whole picture cools and darkens with the storm; cloud shadows drift over it, and rain wets the roof
function gradeStorm(storm: number, windT: number) {
  if (storm <= 0 && G.flash <= 0) return;
  if (windT !== cloudStamp) {
    cloudStamp = windT;
    for (let cy = 0; cy < CELLS_H; cy++) for (let cx = 0; cx < CELLS_W; cx++) {
      cloudCells[cy * CELLS_W + cx] = noise(cx * .14 - windT * .22, cy * .2 + 3);
    }
  }
  const rm = 1 - .46 * storm, gm = 1 - .36 * storm, bm = 1 - .2 * storm;
  const ra = 8 * storm, ga = 12 * storm, ba = 26 * storm;
  const wet = G.wetness, flash = G.flash * .4, puddleAt = 1 - wet * .42;
  for (let iy = 0; iy < H; iy++) for (let ix = 0; ix < W; ix++) {
    const i = iy * W + ix;
    if (zb[i] < -1e8) continue;
    const c = pix[i];
    let r = (c & 255) * rm + ra, g = (c >> 8 & 255) * gm + ga, b = (c >> 16 & 255) * bm + ba;
    if (cloudCells[(iy >> 3) * CELLS_W + (ix >> 3)] + bayerAt(ix, iy) * .22 > 1 - storm * .62) { r *= .76; g *= .76; b *= .82; }
    if (wet > 0 && zb[i] === groundZ[i]) {
      const damp = 1 - wet * .24;
      r *= damp; g *= damp; b *= damp + wet * .05;
      if (puddle[i] > puddleAt) { r = lerp(r, 92, .7); g = lerp(g, 108, .7); b = lerp(b, 140, .7); }
    }
    if (flash > 0) { r = lerp(r, 244, flash); g = lerp(g, 244, flash); b = lerp(b, 255, flash); }
    pix[i] = rgb(r, g, b);
  }
}
function draw() {
  copyInto(pix, bakedPix);
  copyInto(zb, bakedZ);
  itemBuf.fill(0);
  pendingShadows.length = 0;
  const windT = STILL ? 0 : Math.floor(G.time * WIND_FPS) / WIND_FPS;
  const storm = stormLevel();
  // the neighbour in the doorway looks up as the weather turns, then throws up their arms in the rain
  const beat = Math.floor(G.time * 3) % 2;
  const arms = rainLevel() > 0 ? 2.6 + beat * .35 : storm > .3 ? .5 : .08;
  figure(-10.3, -2.5, .35, { scale: .9, armR: arms, armL: arms - (rainLevel() > 0 ? 0 : .04), stance: .08, lean: Math.sin(G.time * 1.8) * .012 }, HOST, dynamicAdd);
  drawPile();
  for (const item of G.items) if (item.state !== 'basket' && item.state !== 'lost') drawCloth(item, windT);
  drawLeaves(windT);
  flushShadows();
  applyShadows(groundZ);
  shadeEdges();
  gradeStorm(storm, windT);
  drawClouds(storm, windT);
  drawBolt();
  drawRain();
  if (G.held && !G.auto) {
    const p = project(BASKET.x, BASKET.y, BASKET.h + 1.3);
    drawArrow(p.sx, p.sy, G.time);
  }
}


function setStatus(text: string): void { G.status = text; }
function pickAt(sx: number, sy: number): Item | null {
  // a few pixels of slack, so socks can be caught on a phone
  for (let radius = 0; radius <= 6; radius++) {
    for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
      const ix = Math.round(sx) + dx, iy = Math.round(sy) + dy;
      if (ix < 0 || iy < 0 || ix >= W || iy >= H) continue;
      const id = itemBuf[iy * W + ix];
      if (id) return G.items[id - 1];
    }
  }
  return null;
}

function saveBest(value: number):void {saveScore('laundry',value);}

export class Laundry extends PixelGame {
 constructor(){super('laundry','ROOFTOP LAUNDRY','Glisser le linge dans le panier · Espace : attraper et porter une pièce');}
 override init():void {configureRenderer(-18,.9,-.35);G.best=readScore('laundry');bake();reset();}
 override reset():void {reset();}
 override update(dt:number):void {update(dt);this.status=G.status;this.score=G.score.toFixed(1)+' points · '+Math.max(0,Math.ceil(GAME_LENGTH-G.t))+' s · record '+G.best;}
 override draw():void {draw();}
 override pointer(x:number,y:number,phase:i32):void {
  if(phase===0){if(G.phase==='over'){if(G.overT>.5)reset();return;}if(G.held!==null)return;G.pointer={x,y};const item=pickAt(x,y);if(item!==null)grab(item,false);}
  else if(phase===1&&G.held!==null&&!G.auto)G.pointer={x,y};
  else if((phase===2||phase===3)&&!G.auto)letGo();
 }
 override key(name:string,down:boolean):void {
  if(!down||(name!==' '&&name!=='Enter'))return;
  if(G.phase==='over'){if(G.overT>.5)reset();return;}
  if(G.held!==null)return;
  const item=nextItem();if(item!==null)grab(item,true);
 }
}