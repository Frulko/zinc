// App icons for macOS bundles (zinc build / zinc export): a generated default, or the project's own picture.
//
// zinc.json "icon":
//   "assets/icon.png"                                  your picture (square, ideally 1024 px)
//   { "letter": "Z", "background": "#4f46e5", "background2": "#7c3aed", "color": "#ffffff" }   generated
//   (absent)                                           generated: the first letter of the app name on a colour
//                                                      picked from the name, so every app gets its own
// The generated icon follows the macOS grid: a 824 px rounded square (continuous corners) centred in 1024 px,
// a vertical gradient, a soft drop shadow, and the letter in Inter Bold.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseTTF, rasterize, type Pt, type Poly } from './resources.ts';
import { encode } from './png.ts';
import { ZINC_ROOT } from './frontend.ts';

export interface IconSpec { letter?: string; background?: string; background2?: string; color?: string }

// Tailwind 500 / 700 pairs: a colourful but calm palette
const PALETTE: [string, string][] = [
  ['#6366f1', '#4338ca'], ['#10b981', '#047857'], ['#f43f5e', '#be123c'], ['#f59e0b', '#b45309'],
  ['#0ea5e9', '#0369a1'], ['#8b5cf6', '#6d28d9'], ['#14b8a6', '#0f766e'], ['#f97316', '#c2410c'],
  ['#ec4899', '#be185d'], ['#64748b', '#334155'],
];

function rgbOf(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const v = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
/** A darker shade of a colour (the gradient's bottom when only one colour is given). */
function darker(hex: string): string {
  const [r, g, b] = rgbOf(hex);
  const d = (x: number) => Math.round(x * 0.72).toString(16).padStart(2, '0');
  return `#${d(r)}${d(g)}${d(b)}`;
}
function hash(s: string): number { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.codePointAt(0)!, 16777619); return h >>> 0; }

/** The full spec for an app: defaults from its name. */
export function iconSpecFor(name: string, spec: IconSpec = {}): Required<IconSpec> {
  const [c1, c2] = PALETTE[hash(name) % PALETTE.length];
  const letter = spec.letter ?? ([...name.replace(/[^\p{L}\p{N}]/gu, '')][0] ?? 'Z').toUpperCase();
  const background = spec.background ?? c1;
  return { letter, background, background2: spec.background2 ?? (spec.background ? darker(spec.background) : c2), color: spec.color ?? '#ffffff' };
}

/** Continuous-corner rounded square (a superellipse, like macOS icons) as a polygon. */
function squircle(cx: number, cy: number, half: number, n = 5): Poly {
  const pts: Pt[] = [];
  for (let i = 0; i < 256; i++) {
    const t = (i / 256) * Math.PI * 2, c = Math.cos(t), s = Math.sin(t);
    pts.push([cx + half * Math.sign(c) * Math.abs(c) ** (2 / n), cy + half * Math.sign(s) * Math.abs(s) ** (2 / n)]);
  }
  return pts;
}

/** 1024 x 1024 PNG of a generated icon. */
export function generateIcon(spec: Required<IconSpec>, size = 1024): Buffer {
  const W = size, k = size / 1024;
  const shape = rasterize([squircle(512 * k, 512 * k, 412 * k)], W, W);
  const shadow = rasterize([squircle(512 * k, 530 * k, 420 * k)], W, W);   // a larger, lower copy, blurred below
  // letter: Inter Bold glyph outlines, scaled so the cap height is ~46% of the icon and centred optically
  const ttf = parseTTF(fs.readFileSync(path.join(ZINC_ROOT, 'lib/fonts/Inter-Bold.ttf')));
  const cp = spec.letter.codePointAt(0)!;
  const g = ttf.cmap.get(cp) ?? ttf.cmap.get(63)!;
  const polys = ttf.glyph(g);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of polys) for (const [x, y] of p) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
  const scale = (430 * k) / Math.max(1, Math.max(maxY - minY, (maxX - minX) * 0.85));
  const gx = 512 * k - ((minX + maxX) / 2) * scale, gy = 512 * k + ((minY + maxY) / 2) * scale;
  const letter = rasterize(polys.map(p => p.map(([x, y]) => [gx + x * scale, gy - y * scale] as Pt)), W, W);
  // compose over transparency: blurred shadow, gradient body with a faint top highlight, the letter
  const blur = boxBlur(shadow, W, Math.round(18 * k));
  const [r1, g1, b1] = rgbOf(spec.background), [r2, g2, b2] = rgbOf(spec.background2), [lr, lg, lb] = rgbOf(spec.color);
  const rgba = Buffer.alloc(W * W * 4);
  for (let y = 0; y < W; y++) {
    const t = Math.min(1, Math.max(0, (y - 100 * k) / (824 * k)));
    const br = r1 + (r2 - r1) * t, bg = g1 + (g2 - g1) * t, bb = b1 + (b2 - b1) * t;
    const hi = Math.max(0, 1 - (y - 100 * k) / (260 * k)) * 0.10;   // gloss near the top edge
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const sa = (blur[i] / 255) * 0.28, a = shape[i] / 255, la = letter[i] / 255;
      // shadow (black) under the body
      let R = 0, G = 0, B = 0, A = sa;
      const body = a;
      if (body > 0) {
        let cr = br + (255 - br) * hi, cg = bg + (255 - bg) * hi, cb = bb + (255 - bb) * hi;
        const l = la * a;
        cr = cr * (1 - l) + lr * l; cg = cg * (1 - l) + lg * l; cb = cb * (1 - l) + lb * l;
        const outA = body + A * (1 - body);
        R = (cr * body + R * A * (1 - body)) / outA; G = (cg * body + G * A * (1 - body)) / outA; B = (cb * body + B * A * (1 - body)) / outA;
        A = outA;
      }
      rgba[i * 4] = Math.round(R); rgba[i * 4 + 1] = Math.round(G); rgba[i * 4 + 2] = Math.round(B); rgba[i * 4 + 3] = Math.round(A * 255);
    }
  }
  return encodeRGBA(W, W, rgba);
}

function boxBlur(a: Uint8Array, w: number, r: number): Uint8Array {
  const tmp = new Float32Array(w * w), out = new Uint8Array(w * w);
  for (let y = 0; y < w; y++) { let s = 0; for (let x = -r; x < w + r; x++) { if (x + r < w) s += a[y * w + Math.min(w - 1, x + r)]; if (x - r - 1 >= 0) s -= a[y * w + x - r - 1]; if (x >= 0 && x < w) tmp[y * w + x] = s / (2 * r + 1); } }
  for (let x = 0; x < w; x++) { let s = 0; for (let y = -r; y < w + r; y++) { if (y + r < w) s += tmp[Math.min(w - 1, y + r) * w + x]; if (y - r - 1 >= 0) s -= tmp[(y - r - 1) * w + x]; if (y >= 0 && y < w) out[y * w + x] = Math.round(s / (2 * r + 1)); } }
  return out;
}

function encodeRGBA(w: number, h: number, rgba: Buffer): Buffer { return encode({ w, h, rgb: rgba }, true); }

/** The icon PNG for a project: its own file, or a generated one written under `dir`. Cached by spec. */
export function iconPng(name: string, icon: string | IconSpec | undefined, projectDir: string, dir: string): string {
  if (typeof icon === 'string') return path.isAbsolute(icon) ? icon : path.join(projectDir, icon);
  const spec = iconSpecFor(name, icon ?? {});
  const file = path.join(dir, `icon-${hash(JSON.stringify(spec)).toString(16)}.png`);
  if (!fs.existsSync(file)) { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(file, generateIcon(spec)); }
  return file;
}
