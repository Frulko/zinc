// robot-eyes: Cozmo/Vector-style eyes, parametric (not a timeline): each eye is a rounded rectangle, the lids are
// background-coloured masks. Expressions are just target parameters; everything eases toward them.
//   drag           look around (the eyes follow the finger)
//   tap            next expression          (no touch for 6 s: idle gaze + auto expressions)
//   ZINC_DEMO=tour cycles expressions every 2 s (emulator screenshots)
import { onFrame, clear, rrect, polygon, clip, unclip, width, height, pointerDown, pointerX, pointerY } from 'zinc:gfx';
import { env } from 'zinc:sys';

const BG: u32 = 0x000000, FG: u32 = 0x22e6ff;

// [height scale, top lid cover 0..1, top lid tilt (+ = inner edge lower: angry), bottom lid cover, corner radius 0..1]
const NAMES: string[] = ['neutral', 'happy', 'angry', 'sad', 'sleepy', 'surprised', 'suspicious'];
const EXPR: number[][] = [
  [1.00, 0.00,  0.0, 0.00, 0.30],
  [0.80, 0.00,  0.0, 0.45, 0.45],   // bottom lid pushes up: smiling eyes
  [0.90, 0.25,  0.9, 0.00, 0.20],
  [0.90, 0.25, -0.9, 0.00, 0.30],
  [0.45, 0.35,  0.0, 0.00, 0.30],
  [1.25, 0.00,  0.0, 0.00, 0.50],
  [0.90, 0.40,  0.0, 0.20, 0.25],
];

let cur: number[] = EXPR[0].slice();
let expr: i32 = 0, lookX: number = 0, lookY: number = 0, tx: number = 0, ty: number = 0;
let blink: number = 0, nextBlink: number = 2, idle: number = 0, nextGaze: number = 1, nextExpr: number = 4;
let held: boolean = false, seed: u32 = 12345;
const tour: boolean = env('ZINC_DEMO') === 'tour';

function rnd(): number { seed = seed * 1664525 + 1013904223; return (seed >>> 8) / 16777216; }

function eye(cx: number, cy: number, w: number, h: number, p: number[], side: number): void {
  const r = Math.min(w, h) / 2 * p[4];
  const x = cx - w / 2, y = cy - h / 2;
  rrect(x, y, w, h, r, FG, 255);
  clip(x, y, w, h);
  const t = y + p[1] * h, slope = p[2] * side * h * 0.5;   // side: -1 left eye (inner = right), +1 right eye
  if (p[1] > 0 || p[2] !== 0) polygon([x - 2, y - 2, x + w + 2, y - 2, x + w + 2, t + slope, x - 2, t - slope], BG, 255);
  if (p[3] > 0) rrect(x - 2, y + h * (1 - p[3]), w + 4, h, 0, BG, 255);
  unclip();
}

function ease(a: number, b: number, k: number): number { return a + (b - a) * k; }

onFrame((dt: number) => {
  const W = width(), H = height();
  // input
  if (pointerDown()) {
    tx = Math.max(-1, Math.min(1, (pointerX() - W / 2) / (W / 2)));
    ty = Math.max(-1, Math.min(1, (pointerY() - H / 2) / (H / 4)));
    idle = 0;
    if (!held) { held = true; expr = (expr + 1) % EXPR.length; }
  } else held = false;
  idle += dt;
  if (tour) { nextExpr -= dt; if (nextExpr < 0) { nextExpr = 2; expr = (expr + 1) % EXPR.length; } }
  else if (idle > 6) {
    nextGaze -= dt; if (nextGaze < 0) { nextGaze = 1 + rnd() * 2; tx = rnd() * 2 - 1; ty = (rnd() * 2 - 1) * 0.6; }
    nextExpr -= dt; if (nextExpr < 0) { nextExpr = 3 + rnd() * 3; expr = Math.floor(rnd() * EXPR.length); }
  }
  nextBlink -= dt;
  if (nextBlink < 0) { nextBlink = 2 + rnd() * 4; blink = 1; }
  blink = Math.max(0, blink - dt * 7);

  // ease toward targets
  const k = 1 - Math.exp(-dt * 14);
  for (let i = 0; i < 5; i++) cur[i] = ease(cur[i], EXPR[expr][i], k);
  lookX = ease(lookX, tx, k); lookY = ease(lookY, ty, k);

  // draw: the eye pair fills the width, blink squashes the height
  const ew = W * 0.34, eh = ew * 1.1 * cur[0] * (1 - Math.sin(blink * Math.PI) * 0.92);
  const gap = W * 0.08, cy = H * 0.42 + lookY * H * 0.06;
  const shift = lookX * W * 0.06;
  clear(BG);
  eye(W / 2 - gap / 2 - ew / 2 + shift, cy, ew, eh, cur, -1);
  eye(W / 2 + gap / 2 + ew / 2 + shift, cy, ew, eh, cur, 1);
});
