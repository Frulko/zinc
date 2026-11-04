import { INK, PAPER, SIGNAL } from '../renderer';
// tie-break — strict Zinc TypeScript port of Pixel Plays, MIT. See LICENSE.upstream.
import { Color, Vec3, Pose, Palette, ShadowPart, W, H, S, SIN, COS, R2, SHADOW_X, SHADOW_Y, pix, zb, bakedPix, bakedZ, ground, shadowMask, groundZ, GRASS, rgb, rampOf, bayerAt, tint, clamp, lerp, ease, hash, noise, project, unproject, sphere, capsule, box, castShadow, applyShadows, shadeEdges, KIND_GRASS, kinds, WIND_FPS, STILL, staticShadow, growGrass, drawTufts, drawLeaves, bakeOcclusion, plot, growTree, figure, sphere2, dynamicAdd, pendingShadows, flushShadows, drawDots, haloDots, drawArrow, copyInto, queueShadow, configureRenderer, rgbColor, projectVector, castShadowVector } from '../renderer';
import { PixelGame } from '../game';
import { sound, ensureAudio } from '../audio';
import { readBest as readScore, saveBest as saveScore } from '../scores';
import { audioRain, setMotion } from '../audio';
interface Point3 { x:number;y:number;z:number; }
interface Dust { x:number;y:number;z:number;vx:number;vy:number;vz:number;life:number; }
interface Player { x:number;y:number;swing:number;serving:boolean;moved:number;dir:number;stretch:number;react:number;tx:number;ty:number; }
interface Ball { x:number;y:number;z:number;vx:number;vy:number;vz:number;held:boolean;by:number;kind:string;t:number;T:number;land:{x:number;y:number};landed:boolean;tc:number;after:number;v2x:number;v2y:number;judged:boolean;hit:boolean;wS:number;wE:number;passed:number|null; }
interface Target { x:number;y:number;serve:boolean; }




const COURT_X = 11, COURT_Y = 4.6, SERVICE_X = 6, APRON_X = 13.2, APRON_Y = 8.4;
const NET_Y = 5.2, NET_Z = 1.03, FENCE_X = -13.4, FENCE_Y = -8.8, FENCE_Z = 3.2;
const GRAVITY = 14, BALL_R = .22, BOUNCE_UP = .7, BOUNCE_ALONG = .55;
const BASE_X = 10.6, REACH_X = 1.3, REACH_Y = .45;
const SLOW_T = 1.25, FAST_T = .72, SLOW_WINDOW = .7, FAST_WINDOW = .42, PACE_RALLY = 14;
const SWEEP_Y = 6.4, SHOT_X = 7.2, SERVE_X = 4.4, SERVE_SWEEP = 3.7;
const TOSS_VZ = 7.2, TOSS_FROM = .34, TOSS_TO = .96;
const BOT_SPEED = 3.6, BOT_REACH = .8, WIN_SCORE = 7, PLAYER_SPEED = 16;

const TEAM = [
  { shirt: [240, 234, 218], stripe: [188, 60, 44], legs: [236, 230, 214], hair: [38, 28, 24], skin: [222, 170, 132], racket: [150, 42, 34] },
  { shirt: [40, 72, 110], stripe: [226, 228, 224], legs: [30, 48, 76], hair: [120, 112, 104], skin: [196, 146, 110], racket: [24, 36, 56] },
];
const CROWD = [
  { x: 1.8, shirt: [214, 170, 62], stripe: [214, 170, 62], legs: [70, 64, 60], hair: [60, 44, 34], skin: [222, 170, 132] },
  { x: 3.3, shirt: [96, 132, 112], stripe: [226, 228, 214], legs: [48, 47, 58], hair: [150, 142, 130], skin: [196, 146, 110] },
  { x: 4.3, shirt: [168, 88, 104], stripe: [168, 88, 104], legs: [84, 72, 58], hair: [34, 28, 26], skin: [214, 164, 128] },
  { x: 7.7, shirt: [70, 96, 138], stripe: [240, 234, 218], legs: [60, 58, 64], hair: [92, 62, 40], skin: [222, 170, 132] },
  { x: 9.4, shirt: [226, 222, 208], stripe: [226, 222, 208], legs: [54, 74, 92], hair: [46, 36, 30], skin: [190, 140, 104] },
];
const BALL_COLOR = [216, 236, 72];
const CLAY_TONES = [[172, 90, 58], [181, 97, 62], [190, 104, 67], [199, 112, 73]];
const CLAY = [190, 104, 67], DIRT = [132, 100, 72], LINE = rgb(246, 238, 220);
const KIND_CLAY = 1, KIND_DIRT = 2;

function groundColor(x: number, y: number, ix: number, iy: number, i: number) {
  const edge = Math.pow(Math.pow(Math.abs(x) / 16.2, 4) + Math.pow(Math.abs(y) / 11, 4), .25);
  const rough = edge + (noise(x * 1.3, y * 1.3) - .5) * .1;
  if (rough > 1.04) return 0;
  if (rough > .94 && hash(ix, iy) < (rough - .94) / .1) return 0;
  const fine = hash(ix, iy), ax = Math.abs(x), ay = Math.abs(y);
  if (ax <= APRON_X && ay <= APRON_Y) {
    kinds[i] = KIND_CLAY;
    const baseline = Math.abs(ax - COURT_X) < .09 && ay <= COURT_Y + .09;
    const sideline = Math.abs(ay - COURT_Y) < .09 && ax <= COURT_X;
    const service = Math.abs(ax - SERVICE_X) < .07 && ay <= COURT_Y;
    const centre = ay < .07 && ax <= SERVICE_X;
    if ((baseline || sideline || service || centre) && fine > .07) return LINE;
    // the baselines wear pale where players run, and the rest stays in close tones so dither never reads as a checkerboard
    const wear = Math.max(0, 1 - Math.abs(ax - BASE_X) / 1.4) * Math.max(0, 1 - ay / 6) * .34;
    const v = .46 + (noise(x * .6, y * .7) - .5) * .6 + wear + Math.sin(y * 4 + noise(x * .3, y) * 3) * .04;
    if (fine > .985) return rampOf(CLAY)[4];
    return rgbColor(CLAY_TONES[clamp(Math.floor(v * 4 + (bayerAt(ix, iy) - .5) * .6), 0, 3)]);
  }
  const dirt = Math.max(ax - APRON_X, ay - APRON_Y);
  if (dirt < .2 + noise(x * 2.2, y * 2.2) * .8) {
    kinds[i] = KIND_DIRT;
    return rampOf(DIRT)[clamp(Math.floor(1.5 + (.25 + noise(x * 3, y * 3) * .6) * 2.4 + (bayerAt(ix, iy) - .5) * .9), 1, 4)];
  }
  kinds[i] = KIND_GRASS;
  const t = noise(x * .9, y * .9) * 1.15 + (fine - .5) * .55 - .08;
  return rgbColor(GRASS[clamp(Math.floor(t * 4.2), 0, 3)]);
}
function fence(x0: number, y0: number, x1: number, y1: number) {
  const wire = rgb(116, 122, 116), steel = [92, 96, 94];
  const len = Math.hypot(x1 - x0, y1 - y0);
  for (let a = 0; a <= len; a += .035) for (let z = 0; z <= FENCE_Z; z += .035) {
    const f = (a + z) * 1.5, g = (a - z) * 1.5;
    if (f - Math.floor(f) > .11 && g - Math.floor(g) > .11) continue;
    const t = a / len;
    plot(lerp(x0, x1, t), lerp(y0, y1, t), z, wire);
  }
  for (let a = 0; a <= len + .01; a += 4) {
    const t = a / len, x = lerp(x0, x1, t), y = lerp(y0, y1, t);
    box(x - .07, y - .07, 0, x + .07, y + .07, FENCE_Z, steel, a | 0);
    castShadow(x, y, 1.2, .1);
  }
  capsule([x0, y0, FENCE_Z], [x1, y1, FENCE_Z], .05, .05, () => steel, 'solid');
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

  growTree(-15, 2.6, .9, 300);
  growTree(3, -10.3, .8, 260, 500);
  fence(FENCE_X, FENCE_Y, 13.2, FENCE_Y);
  fence(FENCE_X, FENCE_Y, FENCE_X, 8.4);

  // net: a mesh of single pixels under a white tape, so the ball stays visible behind it
  const netWire = rgb(58, 60, 62), tape = rgb(248, 244, 232);
  for (let y = -NET_Y; y <= NET_Y; y += .03) for (let z = .02; z <= NET_Z; z += .03) {
    const top = z > NET_Z - .13, f = y * 2.8, g = z * 3.4;
    if (top) plot(0, y, z, tape);
    else if (f - Math.floor(f) < .2 || g - Math.floor(g) < .24) plot(0, y, z, netWire);
  }
  for (const y of [-NET_Y, NET_Y]) box(-.08, y - .08, 0, .08, y + .08, NET_Z + .1, [44, 58, 54], y | 0);
  for (let y = -NET_Y; y <= NET_Y; y += .15) castShadow(0, y, .75, .09, 1, .5);

  // umpire on a high chair beside the net
  const chair = [130, 92, 56], chairDark = [96, 68, 44];
  for (const [x, y] of [[-.45, -7.1], [.45, -7.1], [-.45, -6.2], [.45, -6.2]]) box(x - .06, y - .06, 0, x + .06, y + .06, 1.7, chairDark, x * 5 | 0);
  box(-.55, -7.2, 1.7, .55, -6.1, 1.8, chair, 2);
  for (let z = .5; z < 1.7; z += .45) box(-.45, -6.2, z, .45, -6.14, z + .06, chairDark, 3);
  pendingShadows.length = 0;
  figure(0, -6.7, Math.PI / 2, { z: 1.8, scale: .85, armR: .4, armL: .3, stance: .04 }, { shirt: [60, 74, 74], stripe: [60, 74, 74], legs: [44, 44, 52], hair: [160, 152, 140], skin: [212, 166, 130] }, dynamicAdd);
  for (let z = 0; z < 1.8; z += .3) castShadow(0, -6.65, z, .45);

  // bench, bags and a basket of spare balls on the far side
  const seat = [156, 112, 66];
  box(-9.4, -8.5, .6, -5.2, -7.9, .72, seat, 7);
  box(-9.4, -8.55, .9, -5.2, -8.45, 1.45, [132, 92, 54], 8);
  for (const x of [-9.2, -5.5]) box(x, -8.45, 0, x + .14, -7.95, .6, [60, 56, 54], 9);
  for (let x = -9.2; x <= -5.4; x += .3) castShadow(x, -8.2, .66, .28);
  box(-8.6, -8.3, .72, -7.5, -7.95, 1.05, [64, 104, 92], 10);
  capsule([-6.2, -8.2, .8], [-6.2, -8.2, 1.25], .13, .1, () => [226, 226, 218], 'gloss');
  box(-3.9, -8.4, 0, -3, -7.6, .7, [120, 124, 118], 11);
  castShadow(-3.45, -8, .4, .55);
  for (let k = 0; k < 9; k++) sphere(-3.75 + hash(k, 3) * .6, -8.25 + hash(k, 4) * .5, .78, BALL_R * .85, BALL_COLOR, 'gloss');
  flushShadows();
  bakeOcclusion();
  copyInto(staticShadow, shadowMask);
  applyShadows(groundZ);

  copyInto(pristinePix, pix);
  copyInto(bakedPix, pix);
  copyInto(bakedZ, zb);
}
const pristinePix = Array.from({ length: W * H }, (): u32 => 0);

/* ---------- game state ---------- */
export const G = {
  phase: 'serve-wait', score: [0, 0], first: 0, server: 0, faults: 0, side: 1, rally: 0, longest: 0,
  ball: null as Ball | null, timer: 0, time: 0, status: '', clap: 0, spark: 0, sparkAt: null as Point3 | null, dust: [] as Dust[], lockout: 0,
  who: [
    { x: BASE_X, y: 0, swing: -1, serving: false, moved: 0, dir: Math.PI, stretch:0, react:0, tx:BASE_X, ty:0 },
    { x: -BASE_X, y: 0, swing: -1, serving: false, moved: 0, dir: 0, stretch: 0, react: 0, tx: -BASE_X, ty: 0 },
  ],
};
const totalPoints = () => G.score[0] + G.score[1];
const pace = () => clamp(G.rally / PACE_RALLY, 0, 1);

/* ---------- points ---------- */
function startPoint() {
  const n = totalPoints();
  G.server = (G.first + Math.floor((n + 1) / 2)) % 2;
  G.side = n % 2 ? -1 : 1;
  G.faults = 0;
  G.rally = 0;
  readyServe();
}
function readyServe() {
  const srv = G.who[G.server], rcv = G.who[1 - G.server], sign = G.server === 0 ? 1 : -1;
  srv.x = sign * (COURT_X + .4); srv.y = G.side * 1.6; srv.swing = -1; srv.serving = true;
  rcv.x = -sign * BASE_X; rcv.y = -G.side * 3; rcv.swing = -1; rcv.serving = false;
  rcv.tx = rcv.x; rcv.ty = rcv.y;
  G.ball = { x: srv.x - sign * .45, y: srv.y - sign * .42, z: 1.15, vx: 0, vy: 0, vz: 0, held: true, by: G.server, kind:'',t:0,T:0,land:{x:0,y:0},landed:false,tc:0,after:0,v2x:0,v2y:0,judged:false,hit:false,wS:0,wE:0,passed:null };
  G.phase = 'serve-wait';
  G.timer = 0;
  if (G.server === 0) setStatus(G.faults ? 'second serve · tap to toss' : 'tap to toss');
  else setStatus(G.faults ? 'rival: second serve' : 'rival to serve');
}
function toss() {
  G.ball!.held = false;
  G.ball!.vz = TOSS_VZ;
  G.ball!.t = 0;
  G.phase = 'toss';
  setStatus('');
}
function strike(by: number, x: number, y: number, T: number, kind: string) {
  const b = G.ball!, hitter = G.who[by];
  const vx = (x - b.x) / T, vy = (y - b.y) / T, vz = (BALL_R - b.z + .5 * GRAVITY * T * T) / T;
  const up = (GRAVITY * T - vz) * BOUNCE_UP, after = up / GRAVITY * 1.15;
  const shot: Ball = {
    x: b.x, y: b.y, z: b.z, vx, vy, vz, by, kind, t: 0, T, land: { x, y }, landed: false, held: false,
    tc: T + after, after, v2x: vx * BOUNCE_ALONG, v2y: vy * BOUNCE_ALONG, judged: false, hit: false, wS:0, wE:0, passed:null,
  };
  const wide = 2 * .8 * up / GRAVITY;
  const W = Math.min(lerp(SLOW_WINDOW, FAST_WINDOW, pace()), wide);
  shot.wS = shot.tc - W / 2; shot.wE = shot.tc + W / 2;
  G.ball = shot;
  hitter.swing = .35; hitter.serving = kind === 'serve';
  G.spark = .09; G.sparkAt = { x: b.x, y: b.y, z: b.z };
  G.rally++;
  G.longest = Math.max(G.longest, G.rally);
  G.phase = 'rally';
  sound(kind === 'serve' ? 'serve' : 'hit', .4 + pace() * .6);
  if (by === 0) planBot();
  else {
    const me = G.who[0], c = ballAt(shot, shot.wS);
    me.tx = c.x + REACH_X; me.ty = c.y + REACH_Y;
  }
}
function ballAt(b: Ball, t: number) {
  return { x: b.land.x + b.v2x * (t - b.T), y: b.land.y + b.v2y * (t - b.T) };
}
// the rival sets off after a beat and decides from how far it had to run how good its reply can be
function planBot() {
  const b = G.ball!, bot = G.who[1], c = ballAt(b, b.tc);
  bot.tx = c.x - REACH_X; bot.ty = c.y - REACH_Y;
  bot.react = .1;
  const d = Math.hypot(bot.tx - bot.x, bot.ty - bot.y);
  bot.stretch = d / (BOT_SPEED * Math.max(.2, b.tc - .1));
}
function botReturn() {
  const bot = G.who[1], b = G.ball!, gap = Math.hypot(bot.tx - bot.x, bot.ty - bot.y);
  b.hit = true;
  if (gap > BOT_REACH) { b.passed = G.time; return; }
  const s = clamp(bot.stretch, 0, 1), miss = .02 + .26 * s * s * s + pace() * .03;
  const T = lerp(SLOW_T, FAST_T, pace());
  if (Math.random() < miss) {
    const kind = Math.random();
    if (kind < .35) return strike(1, 2, b.y * .4, .7, 'rally');
    if (kind < .7) return strike(1, 12.4, (Math.random() - .5) * 6, Math.max(T, 1), 'rally');
    return strike(1, lerp(5, 9, Math.random()), (Math.random() < .5 ? -1 : 1) * (5.2 + Math.random() * 1.6), T, 'rally');
  }
  const side = G.who[0].y > 0 ? -1 : 1;
  if (s < .55) strike(1, lerp(6.5, 8.2, Math.random()), side * (2.8 + Math.random() * 1.5), Math.max(FAST_T - .06, T - .06), 'rally');
  else strike(1, lerp(6.5, 8.2, Math.random()), (Math.random() - .5) * 3.6, T + .15, 'rally');
}
// where a shot hit right now would land; null when the player cannot hit
function aim(): Target | null {
  const b = G.ball!;
  if (G.phase === 'toss' && G.server === 0) {
    if (b.t < TOSS_FROM || b.t > TOSS_TO) return null;
    const c = -G.side * 2.3;
    return { x: -SERVE_X, y: lerp(c - SERVE_SWEEP, c + SERVE_SWEEP, (b.t - TOSS_FROM) / (TOSS_TO - TOSS_FROM)), serve: true };
  }
  if (G.phase === 'rally' && b.by === 1 && !b.hit && b.t >= b.wS && b.t <= b.wE) {
    return { x: -SHOT_X, y: lerp(-SWEEP_Y, SWEEP_Y, (b.t - b.wS) / (b.wE - b.wS)), serve: false };
  }
  return null;
}
function isIn(target: Target) {
  if (Math.abs(target.y) > COURT_Y) return false;
  return !target.serve || Math.sign(target.y) === -G.side;
}
function tap() {
  ensureAudio();
  if (G.phase === 'over') { if (G.timer > .5) resetMatch(); return; }
  if (G.phase === 'point-end') { if (G.timer > .4) startPoint(); return; }
  if (G.lockout > 0) return;
  if (G.phase === 'serve-wait' && G.server === 0) return toss();
  const me = G.who[0], target = aim();
  if (target) {
    me.serving = target.serve;
    return strike(0, target.x, target.y, target.serve ? .76 : lerp(SLOW_T, FAST_T, pace()), target.serve ? 'serve' : 'rally');
  }
  if (G.phase === 'toss' || G.phase === 'rally') { me.swing = 0; G.lockout = .18; }
}
function pointEnd(winner: number, text: string) {
  if (G.phase === 'point-end' || G.phase === 'over') return;
  G.score[winner]++;
  const [a, b] = G.score, lead = Math.abs(a - b);
  G.timer = 0;
  if (winner === 0 && G.rally > 2 || text === 'winner') G.clap = 1.4;
  sound('point', winner === 0 ? 1 : .4);
  if (Math.max(a, b) >= WIN_SCORE && lead >= 2) {
    G.phase = 'over';
    G.clap = 2.4;
    setStatus((winner === 0 ? 'you win ' : 'rival wins ') + a + '–' + b + ' · longest rally ' + G.longest + ' · tap to play again');
  } else {
    G.phase = 'point-end';
    setStatus(text);
  }
}
function fault(text: string) {
  G.faults++;
  if (G.faults >= 2) return pointEnd(1 - G.server, 'double fault');
  G.phase = 'fault-wait';
  G.timer = 0;
  setStatus(text);
  sound('net', .5);
}
function resetMatch() {
  G.score = [0, 0];
  G.first = 1 - G.first;
  G.longest = 0;
  copyInto(bakedPix, pristinePix);
  startPoint();
}

/* ---------- physics ---------- */
function markClay(x: number, y: number) {
  const p = project(x, y, 0);
  for (let dy = -1; dy <= 1; dy++) for (let dx = -2; dx <= 2; dx++) {
    if (Math.abs(dx) === 2 && dy) continue;
    const ix = (p.sx | 0) + dx, iy = (p.sy | 0) + dy;
    if (ix < 0 || iy < 0 || ix >= W || iy >= H) continue;
    const i = iy * W + ix;
    if (kinds[i] !== KIND_CLAY || bakedPix[i] === LINE) continue;
    const c = bakedPix[i];
    bakedPix[i] = rgb((c & 255) * .88, (c >> 8 & 255) * .84, (c >> 16 & 255) * .82);
  }
}
function land(b: Ball) {
  b.landed = true;
  markClay(b.x, b.y);
  sound('bounce', .7);
  for (let k = 0; k < 6; k++) G.dust.push({ x: b.x, y: b.y, z: .1, vx: (Math.random() - .5) * 2.4 + b.vx * .06, vy: (Math.random() - .5) * 2.4 + b.vy * .06, vz: 1 + Math.random() * 1.4, life: .32 });
  if (b.judged || G.phase !== 'rally') return;
  b.judged = true;
  const far = b.by === 0 ? b.x < 0 : b.x > 0;
  if (b.kind === 'serve') {
    const inBox = far && Math.abs(b.x) <= SERVICE_X && Math.abs(b.y) <= COURT_Y && Math.sign(b.y) === -G.side;
    if (!inBox) fault('fault');
    return;
  }
  if (!far) return pointEnd(1 - b.by, b.by === 0 ? 'net' : 'rival netted it');
  if (Math.abs(b.x) > COURT_X || Math.abs(b.y) > COURT_Y) pointEnd(1 - b.by, b.by === 0 ? 'out' : 'rival hit it out');
}
function stepBall(b: Ball, dt: number) {
  if (b.held) return;
  const px = b.x;
  b.x += b.vx * dt; b.y += b.vy * dt;
  b.z += b.vz * dt - .5 * GRAVITY * dt * dt;
  b.vz -= GRAVITY * dt;
  if (px * b.x < 0 && b.z < NET_Z + BALL_R && Math.abs(b.y) < NET_Y) {
    b.x = px; b.vx *= -.08; b.vy *= .3; b.vz = Math.min(b.vz, 0);
    sound('net', .8);
    if (G.phase === 'rally') {
      b.judged = true;
      if (b.kind === 'serve') fault('net');
      else pointEnd(1 - b.by, b.by === 0 ? 'net' : 'rival netted it');
    }
  }
  if (b.z <= BALL_R) {
    b.z = BALL_R;
    if (!b.landed && b.T) {
      land(b);
      b.vz = -b.vz * BOUNCE_UP; b.vx *= BOUNCE_ALONG; b.vy *= BOUNCE_ALONG;
    } else if (b.vz < -1) {
      b.vz *= -BOUNCE_UP; b.vx *= .8; b.vy *= .8;
      sound('bounce', .3);
    } else {
      b.vz = 0;
      const sp = Math.hypot(b.vx, b.vy), next = Math.max(0, sp - 5 * dt);
      if (sp > 0) { b.vx *= next / sp; b.vy *= next / sp; }
    }
  }
  if (Math.abs(b.x) > APRON_X) { b.x = Math.sign(b.x) * APRON_X; b.vx *= -.25; }
  if (Math.abs(b.y) > APRON_Y) { b.y = Math.sign(b.y) * APRON_Y; b.vy *= -.25; }
}
function moveTo(p: Player, tx: number, ty: number, speed: number, dt: number) {
  const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy), step = Math.min(d, speed * dt);
  if (d > .001) { p.x += dx / d * step; p.y += dy / d * step; }
  p.moved = dt > 0 ? step / dt : 0;
}
function update(dt: number) {
  G.time += dt;
  G.lockout = Math.max(0, G.lockout - dt);
  G.clap = Math.max(0, G.clap - dt);
  G.spark = Math.max(0, G.spark - dt);
  G.timer += dt;
  const b = G.ball!, me = G.who[0], bot = G.who[1];
  for (const p of G.who) if (p.swing >= 0) { p.swing += dt / .3; if (p.swing >= 1) { p.swing = -1; p.serving = false; } }
  for (const d of G.dust) { d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt; d.vz -= 7 * dt; d.life -= dt; }
  if (G.dust.length) G.dust = G.dust.filter(d => d.life > 0 && d.z > 0);

  if (G.phase === 'serve-wait') {
    me.moved = bot.moved = 0;
    if (G.server === 1 && G.timer > .85) toss();
  } else if (G.phase === 'toss') {
    b.t += dt;
    if (G.server === 1 && b.t >= .55) {
      const fails = Math.random() < (G.faults ? .03 : .14);
      const y = fails ? -G.side * (5.2 + Math.random()) : -G.side * lerp(.9, 3.9, Math.random());
      strike(1, SERVE_X, y, .82, 'serve');
    } else if (b.z < 1.15 && b.vz < 0) {
      readyServe(); // an unhit toss is caught and costs nothing
    }
  } else if (G.phase === 'rally' && b !== null) {
    b.t += dt;
    if (b.by === 1 && !b.hit) {
      if (b.t >= b.wS) { me.tx = b.x + REACH_X; me.ty = b.y + REACH_Y; }
      const left = b.wS - b.t;
      moveTo(me, me.tx, me.ty, left > .02 ? Math.min(PLAYER_SPEED, Math.hypot(me.tx - me.x, me.ty - me.y) / left) : PLAYER_SPEED, dt);
      moveTo(bot, -BASE_X, bot.y * .3, 2.6, dt);
      if (b.landed && b.t > b.wE) {
        b.hit = true;
        return pointEnd(1, b.kind === 'serve' ? 'ace' : 'missed');
      }
    } else if (b.by === 0 && !b.hit) {
      moveTo(me, BASE_X, 0, 6, dt);
      if (b.t < bot.react) bot.moved = 0;
      else moveTo(bot, bot.tx, bot.ty, BOT_SPEED, dt);
      if (b.landed && b.t >= b.tc) {
        botReturn();
        if (G.ball!.passed != null) pointEnd(0, 'winner');
      }
    }
  } else if (G.phase === 'fault-wait') {
    if (G.timer > .95) readyServe();
    me.moved = bot.moved = 0;
  } else {
    moveTo(me, me.x, me.y, 0, dt);
    bot.moved = 0;
    if (G.phase === 'point-end' && G.timer > 1.7) startPoint();
  }
  if (G.ball !== null && !(G.ball!.held)) for (let k = 0; k < 4; k++) stepBall(G.ball!, dt / 4);
}

/* ---------- drawing ---------- */
function poseOf(p: Player, ready: boolean): { pose: Pose; twist: number } {
  const running = p.moved > 1.2;
  const stride = running ? .16 + Math.sin(G.time * 15) * .2 : .2;
  const base = { crouch: running ? .2 : .28, lean: running ? .24 : .18, stance: stride, armL: .55, armR: .5 };
  let twist = 0;
  if (p.swing >= 0) {
    const t = ease(p.swing);
    if (p.serving) return { pose: { crouch: .05, lean: lerp(-.1, .4, t), stance: .22, armR: lerp(3.5, .7, t), armL: lerp(2.4, .2, t) }, twist: lerp(.4, -.3, t) };
    twist = lerp(.95, -.8, t);
    return { pose: { ...base, crouch: .34, armR: lerp(-2, 2.6, t), armL: lerp(.9, .2, t) }, twist };
  }
  if (p.serving) {
    const up = G.phase === 'toss' ? 1 : 0;
    return { pose: { crouch: up * .12, lean: 0, stance: .22, armR: up ? 3.6 : .4, armL: up ? 2.8 : .75 }, twist: up * .45 };
  }
  if (ready) return { pose: { ...base, crouch: .36, armR: -2, armL: .9 }, twist: .9 };
  return { pose: base, twist: 0 };
}
function drawPlayer(i: number) {
  const p = G.who[i], b = G.ball!;
  const ready = b !== null && !b.held && !b.hit && b.by === 1 - i && G.phase === 'rally' && b.t > (i === 0 ? b.wS : b.tc - .28) - .08;
  const { pose, twist } = poseOf(p, ready);
  const yaw = p.dir + twist * (i === 0 ? 1 : -1);
  const hand = figure(p.x, p.y, yaw, pose, TEAM[i], dynamicAdd);
  const a = (pose.armR ?? 0) + .18, fx = Math.cos(yaw), fy = Math.sin(yaw);
  const dx = fx * Math.sin(a) - fy * .2, dy = fy * Math.sin(a) + fx * .2, dz = -Math.cos(a);
  const neck = [hand[0] + dx * .32, hand[1] + dy * .32, hand[2] + dz * .32];
  const head = [hand[0] + dx * .66, hand[1] + dy * .66, hand[2] + dz * .66];
  dynamicAdd(hand, neck, .05, .05, () => TEAM[i].racket);
  dynamicAdd(head, head, .22, .22, () => TEAM[i].racket);
  sphere(head[0], head[1], head[2] + .04, .13, [236, 228, 200], 'solid');
}
function drawCrowd() {
  const b = G.ball!, cx = b !== null ? b.x : 0, cy = b !== null ? b.y : 0, clapping = G.clap > 0;
  CROWD.forEach((c, k) => {
    // heads follow the ball in coarse steps, like a crowd at a real match
    const yaw = Math.round(Math.atan2(cy + 8.1, cx - c.x) / .35) * .35;
    const beat = clapping ? Math.floor(G.time * 9 + k * 1.6) % 2 : 0;
    figure(c.x, -8.1, yaw, { scale: .85, stance: .06, armR: clapping ? (beat ? 1.5 : 1.15) : .1, armL: clapping ? (beat ? 1.5 : 1.15) : .12 }, c, dynamicAdd);
  });
}
function drawTarget(t: Target) {
  const p = project(t.x, t.y, 0), ok = isIn(t), rx = 8, ry = 4;
  const ring: number[][] = [], outer: number[][] = [];
  for (let a = 0; a < 6.283; a += .12) {
    ring.push([p.sx + Math.cos(a) * rx, p.sy + Math.sin(a) * ry], [p.sx + Math.cos(a) * (rx - 1), p.sy + Math.sin(a) * (ry - 1)]);
    outer.push([p.sx + Math.cos(a) * (rx + 1), p.sy + Math.sin(a) * (ry + 1)]);
  }
  // yellow on black means in, black on white means out: red would vanish into the clay
  drawDots(outer, ok ? INK : PAPER);
  drawDots(ring, ok ? SIGNAL : INK);
  drawDots([[p.sx, p.sy], [p.sx - 1, p.sy], [p.sx + 1, p.sy], [p.sx, p.sy - 1], [p.sx, p.sy + 1]], ok ? SIGNAL : INK);
}
function draw() {
  copyInto(pix, bakedPix);
  copyInto(zb, bakedZ);
  pendingShadows.length = 0;
  drawCrowd();
  drawPlayer(1);
  drawPlayer(0);
  const b = G.ball!;
  if (b !== null) {
    sphere(b.x, b.y, b.z, BALL_R, BALL_COLOR, 'gloss');
    castShadow(b.x, b.y, b.z - BALL_R, BALL_R * .96, 1, 0);
    if (b.z < BALL_R + .3) castShadow(b.x, b.y, 0, BALL_R * .8, 2, 0);
  }
  const windT = STILL ? 0 : Math.floor(G.time * WIND_FPS) / WIND_FPS;
  drawLeaves(windT);
  drawTufts(windT);
  flushShadows();
  applyShadows(bakedZ);
  shadeEdges();
  const dust = G.dust.map(d => { const q = project(d.x, d.y, d.z); return [q.sx, q.sy]; });
  drawDots(dust, rgb(224, 170, 130));
  if (G.spark > 0 && G.sparkAt) {
    const q = project(G.sparkAt.x, G.sparkAt.y, G.sparkAt.z), dots: number[][] = [];
    for (const r of [3, 4]) dots.push([q.sx - r, q.sy], [q.sx + r, q.sy], [q.sx, q.sy - r], [q.sx, q.sy + r]);
    drawDots(dots, PAPER);
  }
  const target = aim();
  if (target) drawTarget(target);
}


function setStatus(text: string): void { G.status = text; }

export class TieBreak extends PixelGame {
 constructor(){super('tie-break','TIE-BREAK','Toucher / Espace : lancer la balle puis frapper · Le moment de frappe choisit sa destination');}
 override init():void {configureRenderer(10,.9,-.6);bake();resetMatch();}
 override reset():void {resetMatch();}
 override update(dt:number):void {update(dt);this.status=G.status;this.score='VOUS '+G.score[0]+' — '+G.score[1]+' BOT · échange '+G.rally;}
 override draw():void {draw();}
 override pointer(x:number,y:number,phase:i32):void {if(phase===0)tap();}
 override key(name:string,down:boolean):void {if(down&&(name===' '||name==='Enter'))tap();}
}