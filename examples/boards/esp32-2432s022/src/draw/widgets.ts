// Canvas drawings for the Controls and Music pages: a spinner with a progress bar, the play / pause button that
// morphs between its two shapes, the skip buttons, and procedurally painted album covers.
import { rrect, polygon, stroke, font, drawText, textWidth, gradient, clip, unclip } from 'zinc:gfx';

let label: i32 = -1;
function labelFont(): i32 { if (label < 0) label = font('sans', 12); return label; }

/** Spinner (a 100° arc turning), a caption and a rounded progress bar; `p` 0..1 loops. */
export function drawSync(x: number, y: number, w: number, h: number, p: number, accent: u32, track: u32, text: u32, muted: u32): void {
  const cx = x + 14, cy = y + h / 2, r = 10;
  const ring: number[] = [], arcPts: number[] = [];
  for (let i = 0; i <= 24; i++) { const a = i / 24 * 6.2832; ring.push(cx + Math.cos(a) * r); ring.push(cy + Math.sin(a) * r); }
  const a0 = p * 6.2832 * 6;
  for (let i = 0; i <= 10; i++) { const a = a0 + i / 10 * 1.75; arcPts.push(cx + Math.cos(a) * r); arcPts.push(cy + Math.sin(a) * r); }
  stroke(ring, 3, track, 255, true);
  stroke(arcPts, 3, accent, 255, false);
  const f = labelFont(), pct = `${Math.round(p * 100)} %`;
  drawText(f, x + 34, y + 1, 'Syncing photos', text, 255, 0);
  drawText(f, x + w - textWidth(f, pct, 0), y + 1, pct, muted, 255, 0);
  const bx = x + 34, bw = w - 34, by = y + h - 8;
  rrect(bx, by, bw, 6, 3, track, 255);
  rrect(bx, by, Math.max(6, bw * p), 6, 3, accent, 255);
}

/** Round play / pause button; `morph` 0 = play triangle, 1 = pause bars (the shapes blend in between). */
export function drawPlayPause(x: number, y: number, w: number, h: number, morph: number, fill: u32, glyph: u32): void {
  const cx = x + w / 2, cy = y + h / 2, r = Math.min(w, h) / 2;
  rrect(cx - r, cy - r, r * 2, r * 2, r, fill, 255);
  const s = r * 0.42;
  // each half of the play triangle travels to one pause bar: 4 corners each, interpolated
  const L = (ax: number, bx: number): number => ax + (bx - ax) * morph;
  const tri: number[] = [cx - s * 0.7, cy - s, cx + s * 0.15, cy - s * 0.5, cx + s * 0.15, cy + s * 0.5, cx - s * 0.7, cy + s];
  const barA: number[] = [cx - s * 0.75, cy - s, cx - s * 0.2, cy - s, cx - s * 0.2, cy + s, cx - s * 0.75, cy + s];
  const tri2: number[] = [cx + s * 0.15, cy - s * 0.5, cx + s * 1.0, cy, cx + s * 1.0, cy, cx + s * 0.15, cy + s * 0.5];
  const barB: number[] = [cx + s * 0.2, cy - s, cx + s * 0.75, cy - s, cx + s * 0.75, cy + s, cx + s * 0.2, cy + s];
  const a: number[] = [], b: number[] = [];
  for (let i = 0; i < 8; i++) { a.push(L(tri[i], barA[i])); b.push(L(tri2[i], barB[i])); }
  polygon(a, glyph, 255);
  polygon(b, glyph, 255);
}

/** Skip button: two triangles and a bar, pointing left (dir -1) or right (1). */
export function drawSkip(x: number, y: number, w: number, h: number, dir: number, color: u32): void {
  const cx = x + w / 2, cy = y + h / 2, s = Math.min(w, h) * 0.2;
  polygon([cx - dir * s * 1.1, cy - s, cx + dir * s * 0.1, cy, cx - dir * s * 1.1, cy + s], color, 255);
  polygon([cx - dir * s * 0.1, cy - s, cx + dir * s * 1.1, cy, cx - dir * s * 0.1, cy + s], color, 255);
  const bx = dir > 0 ? cx + s * 1.1 : cx - s * 1.1 - 2.5;
  rrect(bx, cy - s, 2.5, s * 2, 1, color, 255);
}

export class Cover { c1: u32; c2: u32; c3: u32; constructor(c1: u32, c2: u32, c3: u32) { this.c1 = c1; this.c2 = c2; this.c3 = c3; } }

/** Album cover: a gradient sky, a sun of rings that pulse with the music, and layered hills; `t` in seconds,
 *  `energy` 0..1 (0 when paused). Clipped to a rounded square. */
export function drawCover(x: number, y: number, w: number, h: number, c: Cover, t: number, energy: number): void {
  clip(x, y, w, h, 12);
  gradient(x, y, w, h, 0, c.c1, c.c2, true, 255);
  const sx = x + w * 0.62, sy = y + h * 0.42, sr = w * 0.18;
  for (let k = 3; k >= 1; k--) {
    const rr = sr + k * w * 0.07 * (1 + 0.25 * energy * Math.sin(t * 5 + k));
    rrect(sx - rr, sy - rr, rr * 2, rr * 2, rr, c.c3, 28 + 12 * (3 - k));
  }
  rrect(sx - sr, sy - sr, sr * 2, sr * 2, sr, c.c3, 255);
  for (let layer = 0; layer < 3; layer++) {
    const pts: number[] = [];
    const base = y + h * (0.62 + layer * 0.12), amp = h * (0.07 - layer * 0.015), ph = t * (0.4 + layer * 0.3) * energy + layer * 2;
    for (let i = 0; i <= 16; i++) { const px = x + w * i / 16; pts.push(px); pts.push(base + Math.sin(i * 0.6 + ph) * amp); }
    pts.push(x + w); pts.push(y + h); pts.push(x); pts.push(y + h);
    polygon(pts, 0x000000, 70 + layer * 45);
  }
  unclip();
}
