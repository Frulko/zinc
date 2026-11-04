// Balote — strict Zinc TypeScript port of Pixel Plays, MIT. See LICENSE.upstream.
import { Color, Vec3, Pose, Palette, ShadowPart, W, H, S, SIN, COS, R2, SHADOW_X, SHADOW_Y, pix, zb, bakedPix, bakedZ, ground, shadowMask, groundZ, GRASS, rgb, rampOf, bayerAt, tint, clamp, lerp, ease, hash, noise, project, unproject, sphere, capsule, box, castShadow, applyShadows, shadeEdges, KIND_GRASS, kinds, WIND_FPS, STILL, staticShadow, growGrass, drawTufts, drawLeaves, bakeOcclusion, plot, growTree, figure, sphere2, dynamicAdd, pendingShadows, flushShadows, drawDots, haloDots, drawArrow, copyInto, queueShadow, configureRenderer, rgbColor } from '../renderer';
import { PixelGame } from '../game';
import { sound, ensureAudio } from '../audio';
interface Point { x: number; y: number; }
interface Ball { x: number; y: number; z: number; vx: number; vy: number; vz: number; team: number; r: number; mass: number; }
interface Result { winner: number; counted: Ball[]; }
interface AI { power: number; yaw: number; }



const pristinePix = Array.from({ length: W * H }, (): u32 => 0);
const trackMark = Array.from({ length: W * H }, (): number => 0);

const COURT_X = 12, COURT_Y = 3.8, BOARD = 0.3;
const THROW_X = 9.5, GRAVITY = 12, LAUNCH_VZ = 3, ROLL_DECEL = 6, MAX_SPEED = 15;
const WIN_SCORE = 5, BALLS_PER_TEAM = 4;
const BALL_R = 0.3, JACK_R = 0.16, JACK_COLOR = [232, 200, 62];
const TEAM = [
  { ball: [176, 58, 44], shirt: [188, 60, 44], stripe: [240, 232, 214], legs: [48, 47, 58], hair: [38, 28, 24], skin: [222, 170, 132] },
  { ball: [42, 76, 112], shirt: [40, 72, 110], stripe: [226, 228, 224], legs: [84, 72, 58], hair: [120, 112, 104], skin: [196, 146, 110] },
];
const SAND =[224, 198, 152], DIRT = [132, 100, 72];
const SAND_TONES = [[200, 172, 130], [211, 185, 141], [220, 196, 151], [229, 207, 163]];
const KIND_COURT = 1, KIND_DIRT = 2;
function pickLevel(v: number, ix: number, iy: number) { return clamp(Math.floor(1.5 + v * 2.4 + (bayerAt(ix, iy) - .5) * .9), 1, 4); }
function groundColor(x: number, y: number, ix: number, iy: number, i: number) {
  const edge = Math.pow(Math.pow(Math.abs(x) / 16.2, 4) + Math.pow(Math.abs(y) / 7.4, 4), .25);
  const rough = edge + (noise(x * 1.3, y * 1.3) - .5) * .13;
  if (rough > 1.04) return 0;
  if (rough > .93 && hash(ix, iy) < (rough - .93) / .11) return 0;
  const fine = hash(ix, iy), pebble = fine > .975, pebbleShade = hash(ix - 1, iy - 1) > .975;
  const onCourt = Math.abs(x) <= COURT_X && Math.abs(y) <= COURT_Y;
  if (onCourt) {
    kinds[i] = KIND_COURT;
    if (Math.abs(Math.abs(x) - 8) < .07 && fine > .16) return rgb(246, 240, 224);
    const lane = Math.max(0, 1 - Math.abs(y) / 1.8);
    const rake = Math.sin(y * 5 + noise(x * .4, y) * 3) * .05;
    const scuff = Math.abs(x - THROW_X) < 1.5 && Math.abs(y) < 1.3 ? noise(x * 2, y * 2) * .3 : 0;
    const v = .5 + (noise(x * .7, y * .9) - .5) * .7 + lane * .18 + rake - scuff;
    const ramp = rampOf(SAND);
    if (pebble) return ramp[4];
    if (pebbleShade) return ramp[1];
    // close tones here, or the dither reads as a checkerboard across the whole court
    return rgbColor(SAND_TONES[clamp(Math.floor(v * 4 + (bayerAt(ix, iy) - .5) * .6), 0, 3)]);
  }
  const dirt = Math.max(Math.abs(x) - COURT_X, Math.abs(y) - COURT_Y);
  if (dirt < .3 + noise(x * 2.2, y * 2.2) * .9) {
    kinds[i] = KIND_DIRT;
    const ramp = rampOf(DIRT);
    if (pebble) return ramp[4];
    if (pebbleShade) return ramp[0];
    return ramp[pickLevel(.25 + noise(x * 3, y * 3) * .6, ix, iy)];
  }
  kinds[i] = KIND_GRASS;
  const t = noise(x * .9, y * .9) * 1.15 + (fine - .5) * .55 - .08;
  return rgbColor(GRASS[clamp(Math.floor(t * 4.2), 0, 3)]);
}
function stampTrack(b: Ball) {
  const p = project(b.x, b.y, 0), ix = p.sx | 0, iy = p.sy | 0;
  if (ix < 0 || iy < 0 || ix >= W || iy >= H) return;
  const i = iy * W + ix;
  if (kinds[i] !== KIND_COURT || trackMark[i]) return;
  trackMark[i] = 1;
  const c = bakedPix[i];
  bakedPix[i] = rgb((c & 255) * .88, (c >> 8 & 255) * .87, (c >> 16 & 255) * .9);
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

  const wood = [122, 84, 50], woodLight = [146, 104, 62];
  for (let x = -COURT_X - BOARD; x < COURT_X + BOARD; x += 3) {
    const w = (x / 3 | 0) % 2 ? wood : woodLight;
    box(x, -COURT_Y - BOARD, 0, Math.min(x + 3, COURT_X + BOARD), -COURT_Y, BOARD, w, x | 0);
    box(x, COURT_Y, 0, Math.min(x + 3, COURT_X + BOARD), COURT_Y + BOARD, BOARD, w, x + 40 | 0);
  }
  for (const side of [-COURT_X - BOARD, COURT_X]) box(side, -COURT_Y, 0, side + BOARD, COURT_Y, BOARD, wood, side | 0);

  // bench
  box(-2.3, -5.25, .62, 2.3, -4.65, .74, [156, 112, 66], 3);
  box(-2.3, -5.3, .9, 2.3, -5.2, 1.5, [132, 92, 54], 4);
  for (const x of [-2, 1.85]) box(x, -5.2, 0, x + .15, -4.7, .62, [60, 56, 54], 5);
  // jug and crate by the bench
  box(2.9, -5.5, 0, 3.8, -4.7, .5, [146, 108, 66], 6);
  const bottle = [68, 110, 76];
  capsule([3.35, -5.1, .6], [3.35, -5.1, 1], .16, .1, () => bottle, 'gloss');

  growTree(-9.5, -5.4);
  // shadows of the bench, crate and boards
  for (let t = -2.2; t <= 2.2; t += .3) castShadow(t, -4.95, .68, .3);
  castShadow(3.35, -5.1, .3, .5);
  castShadow(3.35, -5.1, .8, .14);
  // a neighbour watching the game
  pendingShadows.length = 0;
  figure(-4.4, -5.3, .9, { armR: .1, armL: .1, stance: .08 }, TEAM[1], dynamicAdd);
  flushShadows();
  bakeOcclusion();
  copyInto(staticShadow, shadowMask);
  applyShadows(groundZ);

  copyInto(pristinePix, pix);
  copyInto(bakedPix, pix);
  copyInto(bakedZ, zb);
}

/* ---------- game state ---------- */
export const G = {
  phase: 'aim', team: 0, balls: [] as Ball[], jack: null as Ball | null, left: [BALLS_PER_TEAM, BALLS_PER_TEAM],
  score: [0, 0], yaw: Math.PI, power: 0, swing: 0, timer: 0, starter: 0, result: null as Result | null, ai: null as AI | null,
  time: 0, pointer: null as Point | null, status: '', released: false,
};

function setStatus(text: string) { G.status = text; }

function newFrame() {
  copyInto(bakedPix, pristinePix);
  trackMark.fill(0);
  G.balls = [];
  const jx = -8 + Math.random() * 5, jy = (Math.random() - .5) * 4.4;
  G.jack = makeBall(jx + 2.4, jy * .6, .9, -1, JACK_R, .25);
  G.jack!.vx = -3.6; G.jack!.vy = jy * .35; G.jack!.vz = 1.6;
  G.left = [BALLS_PER_TEAM, BALLS_PER_TEAM];
  G.result = null;
  G.phase = 'settle-jack';
}
function makeBall(x: number, y: number, z: number, team: number, r: number, mass: number): Ball {
  return { x, y, z, vx: 0, vy: 0, vz: 0, team, r, mass };
}
const allBalls = (): Ball[] => G.jack !== null ? [G.jack!, ...G.balls] : G.balls;
function nearest(team: number) {
  let best = Infinity;
  for (const b of G.balls) if (b.team === team) best = Math.min(best, Math.hypot(b.x - G.jack!.x, b.y - G.jack!.y));
  return best;
}
function nextTurn() {
  if (!G.left[0] && !G.left[1]) return endFrame();
  const d = [nearest(0), nearest(1)];
  let t;
  if (d[0] === Infinity && d[1] === Infinity) t = G.starter;
  else if (d[0] === Infinity) t = 0;
  else if (d[1] === Infinity) t = 1;
  else t = d[0] > d[1] ? 0 : 1;
  if (!G.left[t]) t = 1 - t;
  G.team = t;
  G.power = 0; G.swing = 0;
  G.yaw = Math.atan2(G.jack!.y, G.jack!.x - THROW_X);
  G.phase = 'aim';
  if (t === 1) { G.ai = planAI(); G.timer = 0; setStatus('rival is lining up'); }
  else setStatus('drag back, release to throw');
}
function planAI(): AI {
  const mine = nearest(1), yours = nearest(0);
  let tx = G.jack!.x, ty = G.jack!.y, extra = 0;
  if (yours < 1 && yours < mine && Math.random() < .45) {
    let target: Ball | null = null, best = Infinity;
    for (const b of G.balls) if (b.team === 0) {
      const d = Math.hypot(b.x - G.jack!.x, b.y - G.jack!.y);
      if (d < best) { best = d; target = b; }
    }
    tx = target!.x; ty = target!.y; extra = 3.2;
  }
  const dist = Math.hypot(tx - THROW_X, ty) + extra;
  // distance = air-time * v + v^2 / (2 * decel)
  const air = 2 * LAUNCH_VZ / GRAVITY + .08;
  const v = (-air + Math.sqrt(air * air + 2 * dist / ROLL_DECEL)) * ROLL_DECEL;
  const spread = 1 + (Math.random() - .5) * .13;
  return {
    power: clamp(v * spread / MAX_SPEED, .12, 1),
    yaw: Math.atan2(ty, tx - THROW_X) + (Math.random() - .5) * .07,
  };
}
function release() {
  if (G.power < .05) { G.power = 0; return; }
  G.phase = 'swing'; G.swing = 0; G.released = false;
  setStatus('');
}
function launch() {
  const fx = Math.cos(G.yaw), fy = Math.sin(G.yaw);
  const b = makeBall(THROW_X + fx * .8, fy * .8 + .42 * Math.cos(G.yaw) * 0, .72, G.team, BALL_R, 1);
  const v = G.power * MAX_SPEED;
  b.vx = fx * v; b.vy = fy * v; b.vz = LAUNCH_VZ;
  G.balls.push(b);
  G.left[G.team]--;
  sound('whoosh');
}
function endFrame() {
  const d = [nearest(0), nearest(1)], winner = d[0] < d[1] ? 0 : 1, other = d[1 - winner];
  const counted = G.balls.filter(b => b.team === winner && Math.hypot(b.x - G.jack!.x, b.y - G.jack!.y) < other);
  G.score[winner] += counted.length;
  G.starter = winner;
  G.result = { winner, counted };
  G.timer = 0;
  sound('point');
  const n = counted.length, who = winner === 0 ? 'you take' : 'rival takes';
  if (G.score[winner] >= WIN_SCORE) {
    G.phase = 'over';
    setStatus((winner === 0 ? 'you win' : 'rival wins') + ' ' + G.score[0] + '–' + G.score[1] + ' · tap to play again');
  } else {
    G.phase = 'frame-end';
    setStatus(who + ' ' + n + (n === 1 ? ' point' : ' points') + ' · tap to continue');
  }
}
function resetMatch() {
  G.score = [0, 0]; G.starter = 0;
  newFrame();
}

/* ---------- physics ---------- */
function stepPhysics(dt: number) {
  const list = allBalls();
  for (const b of list) {
    if (b.z > b.r || b.vz > 0) {
      b.vz -= GRAVITY * dt;
      b.z += b.vz * dt;
      if (b.z <= b.r) {
        b.z = b.r;
        if (b.vz < -1.6) { sound('thud', Math.min(1, -b.vz / 5)); b.vz *= -.22; b.vx *= .82; b.vy *= .82; }
        else b.vz = 0;
      }
    }
    // a clack between a ball and the smaller jack can push one into the ground
    if (b.z <= b.r && b.vz < 0) b.vz = 0;
    b.x += b.vx * dt; b.y += b.vy * dt;
    const sp =Math.hypot(b.vx, b.vy);
    if (b.z <= b.r + .001 && sp > 0) {
      if (sp > .4) stampTrack(b);
      const next = Math.max(0, sp - ROLL_DECEL * dt);
      const kick = 1 + (Math.random() - .5) * .002;
      b.vx *= next / sp * kick; b.vy *= next / sp / kick;
      if (next < .03) { b.vx = 0; b.vy = 0; }
    }
    if (b.z < BOARD + b.r) {
      const lx = COURT_X - b.r, ly = COURT_Y - b.r;
      if (Math.abs(b.x) > lx) { b.x = Math.sign(b.x) * lx; b.vx *= -.5; sound('board', Math.min(1, Math.abs(b.vx) / 4)); }
      if (Math.abs(b.y) > ly) { b.y = Math.sign(b.y) * ly; b.vy *= -.5; sound('board', Math.min(1, Math.abs(b.vy) / 4)); }
    }
  }
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i], b = list[j], minD = a.r + b.r;
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, dd = Math.hypot(dx, dy, dz);
    if (dd >= minD || dd === 0) continue;
    const nx = dx / dd, ny = dy / dd, nz = dz / dd, overlap = minD - dd, total = a.mass + b.mass;
    a.x -= nx * overlap * b.mass / total; a.y -= ny * overlap * b.mass / total;
    b.x += nx * overlap * a.mass / total; b.y += ny * overlap * a.mass / total;
    const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny + (b.vz - a.vz) * nz;
    if (rel >= 0) continue;
    const imp = -(1 + .82) * rel / (1 / a.mass + 1 / b.mass);
    a.vx -= imp / a.mass * nx; a.vy -= imp / a.mass * ny; a.vz -= imp / a.mass * nz;
    b.vx += imp / b.mass * nx; b.vy += imp / b.mass * ny; b.vz += imp / b.mass * nz;
    sound('clack', Math.min(1, -rel / 6));
  }
}
const atRest = () => allBalls().every(b => !b.vx && !b.vy && !b.vz && b.z <= b.r + .001);

function update(dt: number) {
  G.time += dt;
  for (let k = 0; k < 4; k++) stepPhysics(dt / 4);
  if (G.phase === 'settle-jack') {
    setStatus('');
    if (atRest()) nextTurn();
  } else if (G.phase === 'aim' && G.team === 1) {
    G.timer += dt;
    const t = clamp((G.timer - .55) / .7, 0, 1);
    G.yaw = lerp(G.yaw, G.ai!.yaw, Math.min(1, dt * 6));
    G.power = G.ai!.power * ease(t);
    if (t >= 1 && G.timer > 1.45) release();
  } else if (G.phase === 'swing') {
    G.swing = Math.min(1, G.swing + dt / .22);
    if (!G.released && G.swing > .62) { G.released = true; launch(); }
    if (G.swing >= 1) { G.phase = 'roll'; G.timer = 0; }
  } else if (G.phase === 'roll') {
    G.timer += dt;
    if (G.timer > .25 && atRest()) nextTurn();
  } else if (G.phase === 'frame-end' || G.phase === 'over') {
    G.timer += dt;
  }
}

/* ---------- drawing ---------- */
function poseFor(active: boolean): Pose {
  const breathe = Math.sin(G.time * 1.8) * .012;
  if (!active) return { armR: .05 + breathe, armL: .1, stance: .08, lean: breathe };
  const pull = G.phase === 'aim' ? G.power : 0;
  if (G.phase === 'aim') {
    return { crouch: .35 + pull * .45, lean: .3 + pull * .24, stance: .2 + pull * .1, armR: -.1 - pull * 1.15, armL: .38 + pull * .3 };
  }
  if (G.phase === 'swing') {
    const t = ease(G.swing), from = -.1 - G.power * 1.15;
    return { crouch: lerp(.35 + G.power * .45, .42, t), lean: lerp(.3 + G.power * .24, .5, t), stance: .3, armR: lerp(from, 1.35, t), armL: lerp(.38, -.25, t) };
  }
  const settle = clamp(G.timer * 1.5, 0, 1);
  return { crouch: lerp(.42, .08, ease(settle)), lean: lerp(.5, .08, ease(settle)), stance: lerp(.3, .14, settle), armR: lerp(1.35, .1, ease(settle)), armL: lerp(-.25, .1, settle) };
}
function drawAim() {
  const fx = Math.cos(G.yaw), fy = Math.sin(G.yaw), v = G.power * MAX_SPEED;
  if (G.power < .05) return;
  const dots: number[][] = [];
  let t = .05, x = THROW_X + fx * .8, y = fy * .8, z = .72, vz = LAUNCH_VZ;
  let landed: Point | null = null;
  for (let k = 0; k < 40; k++) {
    x += fx * v * .03; y += fy * v * .03; vz -= GRAVITY * .03; z += vz * .03;
    if (z <= BALL_R) { landed = { x, y }; break; }
    if (k % 2 === 0) { const p = project(x, y, z); dots.push([p.sx, p.sy]); }
    t += .03;
  }
  const dark = rgb(28, 27, 25);
  drawDots(dots, dark);
  if (landed) {
    const p = project(landed.x, landed.y, 0), cross: number[][] = [];
    for (let k = -2; k <= 2; k++) cross.push([p.sx + k, p.sy], [p.sx, p.sy + k]);
    drawDots(cross, dark);
  }
}
function drawResult() {
  if (!G.result) return;
  const j = project(G.jack!.x, G.jack!.y, .05);
  const tick = Math.floor(G.time * 6) % 2;
  const color = rgbColor(TEAM[G.result!.winner].ball);
  for (const b of G.result!.counted) {
    const p = project(b.x, b.y, .05), n = Math.ceil(Math.hypot(p.sx - j.sx, p.sy - j.sy) / 2), dots: number[][] = [];
    for (let k = 0; k <= n; k++) if ((k + tick) % 2) dots.push([lerp(j.sx, p.sx, k / n), lerp(j.sy, p.sy, k / n)]);
    drawDots(dots, color);
  }
}
function draw() {
  copyInto(pix, bakedPix);
  copyInto(zb, bakedZ);
  const thrower = G.team, waiter = 1 - G.team;
  const showActive = G.phase === 'aim' || G.phase === 'swing' || G.phase === 'roll';
  pendingShadows.length = 0;
  const pActive = poseFor(showActive);
  const hand = figure(THROW_X, 0, G.yaw, pActive, TEAM[thrower], dynamicAdd);
  figure(11.2, waiter === 0 ? 2.7 : -2.7, Math.PI + (waiter === 0 ? .25 : -.25), poseFor(false), TEAM[waiter], dynamicAdd);
  if (G.phase === 'aim' && G.left[G.team] > 0) {
    sphere(hand[0], hand[1], hand[2] - .04, BALL_R, TEAM[G.team].ball, 'gloss');
    queueShadow(hand, BALL_R, hand, BALL_R);
  }
  for (const b of allBalls()) {
    sphere(b.x, b.y, b.z, b.r, b.team < 0 ? JACK_COLOR : TEAM[b.team].ball, 'gloss');
    castShadow(b.x, b.y, b.z - b.r, b.r * .96, 1, 0);
    if (b.z < b.r + .1) castShadow(b.x, b.y, 0, b.r * .72, 2, 0);
  }
  const windT = STILL ? 0 : Math.floor(G.time * WIND_FPS) / WIND_FPS;
  drawLeaves(windT);
  drawTufts(windT);
  flushShadows();
  // shadows only touch pixels still at ground depth, so balls and figures stay clean
  applyShadows(bakedZ);
  shadeEdges();
  if (G.phase === 'aim') drawAim();
  drawResult();
}


export class Balote extends PixelGame {
  constructor() { super('balote', 'BALOTE', 'Tirer puis relâcher · Flèches : direction / force · Espace : lancer'); }
  override init(): void { configureRenderer(22, 1.3, -.12); bake(); resetMatch(); }
  override reset(): void { resetMatch(); }
  override update(dt: number): void { update(dt); this.status = G.status; this.score = 'VOUS ' + G.score[0] + '  —  ' + G.score[1] + ' BOT'; }
  override draw(): void { draw(); }
  override pointer(x: number, y: number, phase: i32): void {
    if (phase === 0) {
      if (G.phase === 'frame-end' && G.timer > .5) { newFrame(); return; }
      if (G.phase === 'over' && G.timer > .5) { resetMatch(); return; }
      if (G.phase === 'aim' && G.team === 0) G.pointer = { x, y };
    } else if (phase === 1 && G.pointer !== null) {
      const start = G.pointer!;
      const dx = (x - start.x) / S, dy = (y - start.y) / (S * SIN);
      const wx = (dx + dy) / R2, wy = (dy - dx) / R2, length = Math.hypot(wx, wy);
      G.power = clamp(length / 18, 0, 1);
      if (length > .4 && wx > 0) G.yaw = Math.atan2(-wy, -wx);
    } else if (phase === 2 && G.pointer !== null) { G.pointer = null; release(); }
    else if (phase === 3) { G.pointer = null; G.power = 0; }
  }
  override key(name: string, down: boolean): void {
    if (!down) return;
    if (name === ' ' || name === 'Enter') {
      if (G.phase === 'frame-end') newFrame();
      else if (G.phase === 'over') resetMatch();
      else if (G.phase === 'aim' && G.team === 0) release();
    } else if (G.phase === 'aim' && G.team === 0) {
      if (name === 'ArrowLeft') G.yaw -= .015;
      if (name === 'ArrowRight') G.yaw += .015;
      if (name === 'ArrowUp') G.power = clamp(G.power + .02, 0, 1);
      if (name === 'ArrowDown') G.power = clamp(G.power - .02, 0, 1);
    }
  }
}
