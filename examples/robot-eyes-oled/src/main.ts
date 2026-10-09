// robot-eyes-oled: Cozmo's eye model (pycozmo's ProceduralFace, MIT) on a 128x64 SSD1306, the original's resolution.
// Per eye: size, 4 elliptical corner radii, upper and lower lid (height, angle, bend); lids are black masks.
// Presets are pycozmo / expressive-eyes values for the left eye, the right one mirrors the lid angles.
// Simplified vs the original: no eye or face rotation, the corner radii of one eye are set by the upper-x value only.
//   ZINC_DEMO=<name>  holds an expression (neutral anger sadness happy surprise fear suspicion skepticism tired
//                     asleep confused excited fury), ZINC_DEMO=tour cycles them; a click (emulator) steps to the next
//   the pointer stands in for head tracking (the real robots turn their head, the eyes only shift a little): the gaze follows it while it moves; after 4 s without movement the random saccades resume
import { onFrame, clear, polygon, clip, unclip, width, height, pointerDown, pointerX, pointerY } from 'zinc:gfx';
import { env } from 'zinc:sys';

const FG: u32 = 0xffffff, BG: u32 = 0x000000;
const EW: number = 28, EH: number = 40, CR: number = 12.8;   // base eye and corner radius unit (W/20 + H/10 of the screen)
const OFFSET: number = 20;                                    // eye centres sit at +-20 px from the middle

// [scaleX, scaleY, centreY px, upper y, upper angle deg, upper bend, lower y, lower angle, lower bend, upper radius x]
const NAMES: string[] = ['neutral', 'anger', 'sadness', 'happy', 'surprise', 'fear', 'suspicion', 'skepticism', 'tired', 'asleep', 'confused', 'excited', 'fury'];
const LEFT: number[][] = [
  [0.8, 0.8, 0, 0, 0, 0, 0, 0, 0, 0.5],
  [1, 1, 0, 0.6, -30, 0, 0, 0, 0, 0.5],
  [1, 1, 0, 0.6, 20, 0, 0, 0, 0, 0.5],
  [1, 1, 0, 0, 0, 0, 0.4, 0, 0.4, 1.0],
  [1.25, 1.25, 0, 0, 0, 0, 0, 0, 0, 0.5],
  [1, 1, 0, 0, 30, 0.1, 0.4, 10, 0, 0.5],
  [1, 1, 0, 0.4, -10, 0, 0.5, 0, 0, 0.5],
  [1, 1, 0, 0.4, -10, 0, 0, 0, 0, 0.5],
  [1, 1, 0, 0.4, 5, 0, 0.5, 0, 0, 0.5],
  [1, 1, 12, 0.45, 0, 0, 0.5, 0, 0, 0.5],
  [1, 1, 0, 0, 0, 0, 0.2, 0, 0.2, 0.5],
  [1, 1, 0, 0, 0, 0, 0.3, 0, 0.2, 0.5],
  [1, 1, 0, 0.3, -30, 0, 0.4, 0, 0, 0.5],
];
// right eye where it differs from the mirror of the left one (skepticism, confused); -1 = mirror
const RIGHT_OVERRIDE: number[][] = [
  [], [], [], [], [], [], [], [1, 1, 0, 0.15, 25, 0, 0, 0, 0, 0.5], [], [], [1, 1, 0, 0.3, -10, 0, 0.2, 0, 0.2, 0.5], [], [],
];

function right(i: i32): number[] {
  if (RIGHT_OVERRIDE[i].length > 0) return RIGHT_OVERRIDE[i].slice();
  const r = LEFT[i].slice();
  r[4] = -r[4]; r[7] = -r[7];
  return r;
}

let expr: i32 = 0;
const L: number[] = LEFT[0].slice(), R: number[] = right(0);
let gx: number = 0, gy: number = 0, tgx: number = 0, tgy: number = 0;
let blink: number = 0, nextBlink: number = 2, nextGaze: number = 1, nextExpr: number = 3, held: boolean = false, px: number = -1, py: number = -1, still: number = 9, seed: u32 = 4242;
const demo = env('ZINC_DEMO');
const tour: boolean = demo === 'tour';
for (let i = 0; i < NAMES.length; i++) if (NAMES[i] === demo) expr = i;
const fixed: boolean = demo !== '' && !tour;

function rnd(): number { seed = seed * 1664525 + 1013904223; return (seed >>> 8) / 16777216; }
const RAD: number = Math.PI / 180;

/** Elliptical corner as polyline points: centre (cx, cy), radii (rx, ry), angle a0..a1 degrees. */
function corner(out: number[], cx: number, cy: number, rx: number, ry: number, a0: number, a1: number): void {
  for (let k = 0; k <= 5; k++) {
    const a = (a0 + (a1 - a0) * k / 5) * RAD;
    out.push(cx + Math.cos(a) * rx); out.push(cy + Math.sin(a) * ry);
  }
}

/** One lid: edge at `y` fraction of the eye height from its own side, tilted by `ang`, bulging by `bend`. */
function lid(cx: number, top: number, w: number, h: number, y: number, ang: number, bend: number, upper: boolean): void {
  if (y <= 0 && Math.abs(ang) < 0.5 && bend <= 0) return;
  const pts: number[] = [], half = w * 0.6, edge = upper ? top + y * h : top + h * (1 - y), tn = Math.tan(ang * RAD);
  const bulge = bend * h * (1 - y) * (upper ? 1 : -1);
  for (let k = 0; k <= 8; k++) {
    const x = -half + 2 * half * k / 8, u = x / half;
    pts.push(cx + x); pts.push(edge - tn * x + bulge * (1 - u * u));
  }
  const far = upper ? top - h : top + 2 * h;
  pts.push(cx + half); pts.push(far); pts.push(cx - half); pts.push(far);
  polygon(pts, BG, 255);
}

/** p: the 10 parameters above (lid angles already mirrored for the right eye); near: size factor. */
function eye(cx: number, cy: number, p: number[], near: number): void {
  const w = EW * p[0] * near, h = Math.max(1, EH * p[1] * near * (1 - Math.sin(blink * Math.PI) * 0.97));
  const x = cx - w / 2, y = cy + p[2] - h / 2;
  const rx = Math.min(CR * 0.5, w / 2), ry = Math.min(CR * 0.5, h / 2);             // default radius 0.5
  const urx = Math.min(CR * p[9], w / 2);                                           // upper corners: radius x
  const pts: number[] = [];
  corner(pts, x + urx, y + ry, urx, ry, 180, 270);                                  // top-left
  corner(pts, x + w - urx, y + ry, urx, ry, 270, 360);                              // top-right
  corner(pts, x + w - rx, y + h - ry, rx, ry, 0, 90);                               // bottom-right
  corner(pts, x + rx, y + h - ry, rx, ry, 90, 180);                                 // bottom-left
  polygon(pts, FG, 255);
  clip(x - 1, y - 1, w + 2, h + 2);
  lid(cx, y, w, h, p[3], p[4], p[5], true);
  lid(cx, y, w, h, p[6], p[7], p[8], false);
  unclip();
}

onFrame((dt: number) => {
  if (pointerDown()) { if (!held) { held = true; expr = (expr + 1) % NAMES.length; } } else held = false;
  if (tour) { nextExpr -= dt; if (nextExpr < 0) { nextExpr = 2; expr = (expr + 1) % NAMES.length; } }
  else if (!fixed) { nextExpr -= dt; if (nextExpr < 0) { nextExpr = 2.5 + rnd() * 2; expr = Math.floor(rnd() * NAMES.length); } }
  const mx = pointerX(), my = pointerY();
  if (mx !== px || my !== py) { px = mx; py = my; still = 0; }
  still += dt;
  nextGaze -= dt;
  if (still < 4) { tgx = Math.max(-1, Math.min(1, (mx - width() / 2) / (width() / 2))) * 7; tgy = Math.max(-1, Math.min(1, (my - height() / 2) / (height() / 2))) * 4; }
  else if (nextGaze < 0) { nextGaze = 0.3 + rnd() * 1.8; tgx = (rnd() * 2 - 1) * 7; tgy = (rnd() * 2 - 1) * 4; }
  nextBlink -= dt;
  if (nextBlink < 0) { nextBlink = 2 + rnd() * 4; blink = 1; }
  blink = Math.max(0, blink - dt * 6);   // blink lasts 1/6 s

  const k = 1 - Math.exp(-dt * 16), kg = 1 - Math.exp(-dt * 24), tl = LEFT[expr], tr = right(expr);
  for (let i = 0; i < 10; i++) { L[i] += (tl[i] - L[i]) * k; R[i] += (tr[i] - R[i]) * k; }
  gx += (tgx - gx) * kg; gy += (tgy - gy) * kg;

  const W = width(), H = height();
  clear(BG);
  // the eye on the side of the gaze is a little bigger, as in pycozmo's saccades
  eye(W / 2 - OFFSET + gx, H / 2 + gy, L, 1 - gx * 0.01);
  eye(W / 2 + OFFSET + gx, H / 2 + gy, R, 1 + gx * 0.01);
});
