// Playground physics: balls under gravity, bouncing off the walls and each other; one can be grabbed and thrown.
// Plain numbers, stepped at a fixed 240 Hz whatever the frame rate, so the simulation is stable and the canvas
// just draws the current state each frame.
import { createSignal } from 'zinc:ui/solid';

export class Ball {
  x: number; y: number; vx: number = 0; vy: number = 0; r: number; color: u32;
  squash: number = 0;   // visual squash after an impact, decays to 0
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

function collide(a: Ball, b: Ball): void {
  const dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy, min = a.r + b.r;
  if (d2 >= min * min || d2 < 0.0001) return;
  const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, overlap = min - d;
  // push apart in proportion to size (area as mass), then exchange momentum along the normal
  const ma = a.r * a.r, mb = b.r * b.r, total = ma + mb;
  a.x -= nx * overlap * mb / total; a.y -= ny * overlap * mb / total;
  b.x += nx * overlap * ma / total; b.y += ny * overlap * ma / total;
  const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (rel > 0) return;
  const j = -1.85 * rel / (1 / ma + 1 / mb);
  a.vx -= j * nx / ma; a.vy -= j * ny / ma;
  b.vx += j * nx / mb; b.vy += j * ny / mb;
}

function stepOnce(): void {
  const g = gravity() * 1400;
  for (const b of balls) {
    if (b === grabbed) {
      // the grabbed ball follows the pointer; its velocity is the pointer's, so letting go throws it
      const tx = pointerX - grabDX, ty = pointerY - grabDY;
      b.vx = (tx - b.x) / STEP * 0.25; b.vy = (ty - b.y) / STEP * 0.25;
      b.x += (tx - b.x) * 0.25; b.y += (ty - b.y) * 0.25;
    } else {
      b.vy += g * STEP;
      b.vx *= 0.9995; b.vy *= 0.9995;
      b.x += b.vx * STEP; b.y += b.vy * STEP;
    }
    const bounce = 0.78;
    if (b.x < b.r) { b.x = b.r; if (b.vx < 0) { b.squash = Math.min(1, -b.vx / 900); b.vx = -b.vx * bounce; } }
    if (b.x > boxW - b.r) { b.x = boxW - b.r; if (b.vx > 0) { b.squash = Math.min(1, b.vx / 900); b.vx = -b.vx * bounce; } }
    if (b.y < b.r) { b.y = b.r; if (b.vy < 0) { b.squash = Math.min(1, -b.vy / 900); b.vy = -b.vy * bounce; } }
    if (b.y > boxH - b.r) {
      b.y = boxH - b.r;
      if (b.vy > 0) { b.squash = Math.min(1, b.vy / 900); b.vy = -b.vy * bounce; if (Math.abs(b.vy) < 30) b.vy = 0; }
      b.vx *= 0.995;   // rolling friction
    }
  }
  for (let i = 0; i < balls.length; i++) for (let j = i + 1; j < balls.length; j++) collide(balls[i], balls[j]);
}

/** Advances the simulation by dt seconds (fixed substeps) and ages the sparks. */
export function stepPhysics(dt: number): void {
  accumulator = Math.min(accumulator + dt, 0.1);
  while (accumulator >= STEP) { stepOnce(); accumulator -= STEP; }
  for (const b of balls) b.squash *= Math.pow(0.02, dt);
  let i: i32 = 0;
  while (i < sparks.length) {
    const s = sparks[i];
    s.life -= dt * 1.6; s.vy += 500 * dt; s.x += s.vx * dt; s.y += s.vy * dt;
    if (s.life <= 0) sparks.splice(i, 1); else i++;
  }
}
