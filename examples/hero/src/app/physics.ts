// Playground physics: balls under gravity, bouncing off the walls and each other; one can be grabbed and thrown.
// Plain numbers, stepped at a fixed 240 Hz whatever the frame rate, so the simulation is stable and the canvas
// just draws the current state each frame.
import { createSignal } from 'zinc:ui/solid';

export class Ball {
  x: number; y: number; vx: number = 0; vy: number = 0; r: number; color: u32;
  constructor(x: number, y: number, r: number, color: u32) { this.x = x; this.y = y; this.r = r; this.color = color; }
}
export class Spark {
  x: number; y: number; vx: number; vy: number; life: number = 1; color: u32;
  constructor(x: number, y: number, vx: number, vy: number, color: u32) { this.x = x; this.y = y; this.vx = vx; this.vy = vy; this.color = color; }
}

const COLORS: u32[] = [0x6366f1, 0xf43f5e, 0x10b981, 0xf59e0b, 0x0ea5e9, 0xa855f7, 0xec4899, 0x14b8a6];
const STEP: number = 1 / 240;
const MAX_BALLS: i32 = 40;

export const balls: Ball[] = [];
export const sparks: Spark[] = [];
/** Box of the simulation, in canvas pixels (set by the canvas when it is drawn). */
export let boxW: number = 600, boxH: number = 400;
export const [gravity, setGravity] = createSignal<i32>(1);   // 1 down, 0 zero-g, -1 up
export const [ballCount, setBallCount] = createSignal<i32>(0);

let grabbed: Ball | null = null;
let grabDX: number = 0, grabDY: number = 0, pointerX: number = 0, pointerY: number = 0;
let accumulator: number = 0;
let seed: number = 1;
function rand(): number { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }

export function resize(w: number, h: number): void { boxW = w; boxH = h; }

export function addBall(x: number, y: number): void {
  if (balls.length >= MAX_BALLS) balls.shift();
  const b = new Ball(x, y, 14 + rand() * 20, COLORS[balls.length % COLORS.length]);
  b.vx = (rand() - 0.5) * 300; b.vy = -rand() * 200;
  balls.push(b);
  setBallCount(balls.length);
}
export function resetBalls(): void {
  balls.length = 0; sparks.length = 0; grabbed = null;
  for (let i = 0; i < 12; i++) addBall(60 + rand() * Math.max(100, boxW - 120), 40 + rand() * Math.max(60, boxH / 2));
}
/** Throws every ball in a random direction. */
export function shake(): void {
  for (const b of balls) { b.vx += (rand() - 0.5) * 1400; b.vy -= 300 + rand() * 900; }
}
export function burst(x: number, y: number, color: u32): void {
  for (let i = 0; i < 18; i++) {
    const a = rand() * 6.2831853, s = 80 + rand() * 260;
    sparks.push(new Spark(x, y, Math.cos(a) * s, Math.sin(a) * s, color));
  }
}

/** Pointer pressed at (x, y): grab the ball under it, else pop sparks and drop a new ball. */
export function press(x: number, y: number): void {
  pointerX = x; pointerY = y;
  for (let i = balls.length - 1; i >= 0; i--) {
    const b = balls[i], dx = x - b.x, dy = y - b.y;
    if (dx * dx + dy * dy <= b.r * b.r) { grabbed = b; grabDX = dx; grabDY = dy; return; }
  }
  burst(x, y, COLORS[Math.floor(rand() * COLORS.length)]);
  addBall(x, y);
}
export function drag(x: number, y: number): void { pointerX = x; pointerY = y; }
export function release(): void { grabbed = null; }
export function holding(): boolean { return grabbed !== null; }

const RESTITUTION: number = 0.8;     // bounciness of wall and ball impacts
const REST_SPEED: number = 60;       // px/s: slower impacts do not bounce (resting contact, no jitter)
const MAX_SPEED: number = 3200;      // px/s: a throw is capped so nothing tunnels through a wall

/** Separates two overlapping balls and exchanges momentum along the contact normal (mass ~ area). */
function collide(a: Ball, b: Ball): void {
  const dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy, min = a.r + b.r;
  if (d2 >= min * min) return;
  const d = Math.sqrt(Math.max(d2, 0.0001)), nx = d2 > 0.0001 ? dx / d : 1, ny = d2 > 0.0001 ? dy / d : 0;
  // a grabbed ball is immovable (infinite mass): it pushes the others
  const ia = a === grabbed ? 0 : 1 / (a.r * a.r), ib = b === grabbed ? 0 : 1 / (b.r * b.r), sum = ia + ib;
  if (sum <= 0) return;
  const overlap = min - d;
  a.x -= nx * overlap * ia / sum; a.y -= ny * overlap * ia / sum;
  b.x += nx * overlap * ib / sum; b.y += ny * overlap * ib / sum;
  const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (rel >= 0) return;   // already separating
  const e = -rel < REST_SPEED ? 0 : RESTITUTION;
  const j = -(1 + e) * rel / sum;
  a.vx -= j * nx * ia; a.vy -= j * ny * ia;
  b.vx += j * nx * ib; b.vy += j * ny * ib;
}

/** Keeps a ball inside the box; impacts faster than REST_SPEED bounce, slower ones just stop. */
function walls(b: Ball): void {
  const bounce = (v: number): number => Math.abs(v) < REST_SPEED ? 0 : -v * RESTITUTION;
  if (b.x < b.r) { b.x = b.r; if (b.vx < 0) b.vx = bounce(b.vx); }
  if (b.x > boxW - b.r) { b.x = boxW - b.r; if (b.vx > 0) b.vx = bounce(b.vx); }
  if (b.y < b.r) { b.y = b.r; if (b.vy < 0) b.vy = bounce(b.vy); }
  if (b.y > boxH - b.r) {
    b.y = boxH - b.r;
    if (b.vy > 0) b.vy = bounce(b.vy);
    b.vx *= 0.996;   // rolling friction on the floor
  }
}

function stepOnce(): void {
  const g = gravity() * 1400;
  for (const b of balls) {
    if (b === grabbed) {
      // the grabbed ball follows the pointer; its velocity is the pointer's, so letting go throws it
      const tx = pointerX - grabDX, ty = pointerY - grabDY;
      b.vx = (tx - b.x) * 0.3 / STEP; b.vy = (ty - b.y) * 0.3 / STEP;
      const s = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
      if (s > MAX_SPEED) { b.vx *= MAX_SPEED / s; b.vy *= MAX_SPEED / s; }
      b.x += (tx - b.x) * 0.3; b.y += (ty - b.y) * 0.3;
    } else {
      b.vy += g * STEP;
      b.vx *= 0.9997; b.vy *= 0.9997;   // air drag
      b.x += b.vx * STEP; b.y += b.vy * STEP;
    }
  }
  // a few relaxation passes: stacks settle without sinking into each other
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < balls.length; i++) for (let j = i + 1; j < balls.length; j++) collide(balls[i], balls[j]);
    for (const b of balls) walls(b);
  }
}

/** Advances the simulation by dt seconds (fixed substeps) and ages the sparks. */
export function stepPhysics(dt: number): void {
  accumulator = Math.min(accumulator + dt, 0.1);
  while (accumulator >= STEP) { stepOnce(); accumulator -= STEP; }
  let i: i32 = 0;
  while (i < sparks.length) {
    const s = sparks[i];
    s.life -= dt * 1.6; s.vy += 500 * dt; s.x += s.vx * dt; s.y += s.vy * dt;
    if (s.life <= 0) sparks.splice(i, 1); else i++;
  }
}
