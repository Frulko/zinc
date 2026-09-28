// Eight generative artworks, drawn with zinc:gfx into any box. They animate with the clock and react to the
// pointer (`px`, `py` in 0..1 over the artwork, or -1 when it is elsewhere). The Gallery draws them small on
// cards, the Detail screen large; the same function serves both, so the shared-element transition is seamless.
import { rect, rrect, gradient, polygon, stroke } from 'zinc:gfx';
import { createSignal } from 'zinc:ui/solid';

export class Artwork {
  title: string; artist: string; year: string; about: string; tags: string[];
  liked: () => boolean; setLiked: (v: boolean) => void;
  constructor(title: string, artist: string, year: string, about: string, tags: string[]) {
    this.title = title; this.artist = artist; this.year = year; this.about = about; this.tags = tags;
    const [l, sl] = createSignal<boolean>(false); this.liked = l; this.setLiked = sl;
  }
}

export const ARTWORKS: Artwork[] = [
  new Artwork('Aurora', 'M. Vasquez', '2026', 'Three translucent bands drift over a night gradient. Move the pointer up and down to stir them.', ['waves', 'night']),
  new Artwork('Orbits', 'K. Oyelaran', '2025', 'Five planets on concentric orbits, each at its own period. The pointer tilts the system.', ['space', 'motion']),
  new Artwork('Bloom', 'L. Ferreira', '2026', 'Eight petals breathe around a warm core; the pointer opens the flower.', ['organic', 'warm']),
  new Artwork('Pulse Grid', 'A. Lindqvist', '2024', 'A field of dots swells as a wave passes, and around the pointer.', ['grid', 'minimal']),
  new Artwork('Tides', 'R. Haddad', '2025', 'Seventeen lines bend with slow tides; their phase follows the pointer.', ['lines', 'blue']),
  new Artwork('Confetti', 'S. Moreau', '2026', 'A deterministic storm of paper squares, rotating as they fall.', ['festive', 'color']),
  new Artwork('Ripples', 'T. Nakamura', '2024', 'Rings expand from the centre, or from wherever the pointer rests.', ['water', 'calm']),
  new Artwork('Phyllotaxis', 'E. Okafor', '2025', 'Four hundred seeds placed at the golden angle, slowly turning.', ['math', 'spiral']),
];

const TAU: number = 6.2831853;

function circle(cx: number, cy: number, r: number, color: u32, alpha: i32): void {
  if (r > 0.3) rrect(cx - r, cy - r, r * 2, r * 2, r, color, alpha);
}
/** A rotated ellipse as a polygon. */
function ellipse(cx: number, cy: number, rx: number, ry: number, angle: number, color: u32, alpha: i32): void {
  const pts: number[] = [];
  const c = Math.cos(angle), s = Math.sin(angle);
  for (let i = 0; i < 28; i++) {
    const a = TAU * i / 28, ex = Math.cos(a) * rx, ey = Math.sin(a) * ry;
    pts.push(cx + ex * c - ey * s); pts.push(cy + ex * s + ey * c);
  }
  polygon(pts, color, alpha);
}
function ring(cx: number, cy: number, r: number, width: number, color: u32, alpha: i32): void {
  const pts: number[] = [];
  const n: i32 = Math.max(24, Math.min(96, Math.round(r)));
  for (let i = 0; i < n; i++) { pts.push(cx + Math.cos(TAU * i / n) * r); pts.push(cy + Math.sin(TAU * i / n) * r); }
  stroke(pts, width, color, alpha, true);
}
/** Deterministic pseudo-random number in [0, 1) for index i. */
function hash(i: number): number { const s = Math.sin(i * 12.9898) * 43758.5453; return s - Math.floor(s); }

function aurora(x: number, y: number, w: number, h: number, t: number, px: number, py: number): void {
  gradient(x, y, w, h, 0, 0x0f172a, 0x3b0764, true, 255);
  const colors: u32[] = [0x2dd4bf, 0xa78bfa, 0xf472b6];
  const stir = py >= 0 ? (py - 0.5) * 2 : Math.sin(t * 0.3);
  for (let b = 0; b < 3; b++) {
    const pts: number[] = [];
    const base = y + h * (0.35 + b * 0.15), amp = h * (0.08 + 0.05 * b) * (1 + stir * 0.6);
    for (let i = 0; i <= 32; i++) {
      const u = i / 32;
      pts.push(x + u * w); pts.push(base + Math.sin(u * 5 + t * (0.6 + b * 0.25) + b) * amp);
    }
    pts.push(x + w); pts.push(y + h); pts.push(x); pts.push(y + h);
    polygon(pts, colors[b], 70);
  }
  for (let i = 0; i < 40; i++) circle(x + hash(i) * w, y + hash(i + 99) * h * 0.5, 0.8 + hash(i + 7), 0xffffff, Math.round(120 + 100 * Math.sin(t * 2 + i)));
}

function orbits(x: number, y: number, w: number, h: number, t: number, px: number, py: number): void {
  rect(x, y, w, h, 0x0b1020);
  const cx = x + w / 2 + (px >= 0 ? (px - 0.5) * w * 0.15 : 0), cy = y + h / 2 + (py >= 0 ? (py - 0.5) * h * 0.15 : 0);
  const m = Math.min(w, h);
  for (let k = 6; k >= 1; k--) circle(cx, cy, m * 0.02 * k + m * 0.04, 0xfbbf24, 22);
  circle(cx, cy, m * 0.06, 0xfde68a, 255);
  const colors: u32[] = [0x60a5fa, 0xf87171, 0x34d399, 0xc084fc, 0xfb923c];
  for (let i = 0; i < 5; i++) {
    const r = m * (0.14 + i * 0.075), a = t * (1.2 / (i + 1)) + i * 1.7;
    ring(cx, cy, r, 1, 0x94a3b8, 60);
    circle(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.92, m * (0.018 + 0.006 * (i % 3)), colors[i], 255);
  }
}

function bloom(x: number, y: number, w: number, h: number, t: number, px: number, py: number): void {
  gradient(x, y, w, h, 0, 0xfff7ed, 0xffe4e6, true, 255);
  const cx = x + w / 2, cy = y + h / 2, m = Math.min(w, h);
  const open = px >= 0 ? 0.7 + px * 0.6 : 1 + Math.sin(t * 0.8) * 0.12;
  for (let layer = 0; layer < 2; layer++) {
    for (let i = 0; i < 8; i++) {
      const a = TAU * i / 8 + t * 0.15 + layer * 0.39;
      const r = m * (0.2 - layer * 0.06) * open;
      ellipse(cx + Math.cos(a) * r, cy + Math.sin(a) * r, r * 0.95, r * 0.42, a, layer === 0 ? 0xfb7185 : 0xf97316, 150);
    }
  }
  circle(cx, cy, m * 0.08, 0xfacc15, 255);
  for (let i = 0; i < 12; i++) circle(cx + Math.cos(TAU * i / 12 + t) * m * 0.05, cy + Math.sin(TAU * i / 12 + t) * m * 0.05, m * 0.008, 0x92400e, 200);
}

function pulseGrid(x: number, y: number, w: number, h: number, t: number, px: number, py: number): void {
  rect(x, y, w, h, 0xfafafa);
  const step = Math.max(10, Math.min(w, h) / 14);
  const wx = x + (px >= 0 ? px * w : w / 2 + Math.cos(t * 0.7) * w * 0.3), wy = y + (py >= 0 ? py * h : h / 2 + Math.sin(t * 0.9) * h * 0.3);
  for (let gy = y + step / 2; gy < y + h; gy += step) {
    for (let gx = x + step / 2; gx < x + w; gx += step) {
      const d = Math.sqrt((gx - wx) * (gx - wx) + (gy - wy) * (gy - wy)) / step;
      const s = 0.5 + 0.5 * Math.sin(d * 0.9 - t * 4);
      const r = step * (0.08 + 0.3 * s / (1 + d * 0.15));
      circle(gx, gy, r, d < 3 ? 0x4f46e5 : 0x18181b, Math.round(90 + 160 * s));
    }
  }
}

function tides(x: number, y: number, w: number, h: number, t: number, px: number, py: number): void {
  gradient(x, y, w, h, 0, 0xe0f2fe, 0x0369a1, true, 255);
  const phase = px >= 0 ? px * TAU : t * 0.5;
  for (let l = 0; l < 17; l++) {
    const pts: number[] = [];
    const base = y + h * (l + 1) / 18;
    for (let i = 0; i <= 40; i++) {
      const u = i / 40;
      pts.push(x + u * w);
      pts.push(base + Math.sin(u * 7 + phase + l * 0.35 + t * 0.8) * h * 0.025 * (1 + l / 8));
    }
    stroke(pts, Math.max(1, h / 160), l < 8 ? 0x0c4a6e : 0xf0f9ff, 170, false);
  }
}

function confetti(x: number, y: number, w: number, h: number, t: number, px: number, py: number): void {
  rect(x, y, w, h, 0x111827);
  const colors: u32[] = [0xf43f5e, 0xfbbf24, 0x34d399, 0x60a5fa, 0xa78bfa, 0xfb923c];
  const s = Math.max(4, Math.min(w, h) / 30);
  for (let i = 0; i < 70; i++) {
    const fall = (hash(i) + t * (0.05 + hash(i + 3) * 0.08)) % 1;
    const cx = x + hash(i + 11) * w + Math.sin(t + i) * s * 2, cy = y + fall * (h + s * 4) - s * 2;
    const a = t * (1 + hash(i + 5) * 3) + i, c = Math.cos(a), sn = Math.sin(a) * (0.3 + 0.7 * Math.abs(Math.sin(t * 2 + i)));
    polygon([cx - s * c, cy - s * sn, cx + s * sn, cy - s * c, cx + s * c, cy + s * sn, cx - s * sn, cy + s * c], colors[i % 6], 230);
  }
}

function ripples(x: number, y: number, w: number, h: number, t: number, px: number, py: number): void {
  gradient(x, y, w, h, 0, 0xecfeff, 0xccfbf1, true, 255);
  const cx = x + (px >= 0 ? px : 0.5) * w, cy = y + (py >= 0 ? py : 0.5) * h, m = Math.max(w, h);
  for (let i = 0; i < 7; i++) {
    const p = (t * 0.25 + i / 7) % 1;
    ring(cx, cy, p * m * 0.75, Math.max(1, m / 180) * (1 - p) * 3, 0x0d9488, Math.round(220 * (1 - p)));
  }
  circle(cx, cy, m * 0.012, 0x0f766e, 255);
}

function phyllotaxis(x: number, y: number, w: number, h: number, t: number, px: number, py: number): void {
  rect(x, y, w, h, 0x1c1917);
  const cx = x + w / 2, cy = y + h / 2, m = Math.min(w, h), golden = 2.39996323;
  const spin = t * 0.1 + (px >= 0 ? px : 0);
  for (let i = 1; i < 400; i++) {
    const r = Math.sqrt(i / 400) * m * 0.46, a = i * golden + spin;
    const k = i / 400;
    const color: u32 = k < 0.33 ? 0xfde047 : k < 0.66 ? 0xfb923c : 0xef4444;
    circle(cx + Math.cos(a) * r, cy + Math.sin(a) * r, m * (0.004 + 0.01 * k), color, 230);
  }
}

/** Draws artwork `i` into the box. */
export function drawArt(i: i32, x: number, y: number, w: number, h: number, t: number, px: number, py: number): void {
  if (i === 0) aurora(x, y, w, h, t, px, py);
  else if (i === 1) orbits(x, y, w, h, t, px, py);
  else if (i === 2) bloom(x, y, w, h, t, px, py);
  else if (i === 3) pulseGrid(x, y, w, h, t, px, py);
  else if (i === 4) tides(x, y, w, h, t, px, py);
  else if (i === 5) confetti(x, y, w, h, t, px, py);
  else if (i === 6) ripples(x, y, w, h, t, px, py);
  else phyllotaxis(x, y, w, h, t, px, py);
}
