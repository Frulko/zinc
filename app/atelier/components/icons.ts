// Icons drawn with zinc:gfx strokes and shapes in a 16 x 16 design box, scaled to the canvas.
import { stroke, polygon, rrect } from 'zinc:gfx';

export const I_PLAY: i32 = 0, I_STOP: i32 = 1, I_CLOSE: i32 = 2, I_SEARCH: i32 = 3, I_SUN: i32 = 4, I_MOON: i32 = 5, I_ERROR: i32 = 6,
  I_CHECK: i32 = 7, I_BUG: i32 = 8, I_PLUS: i32 = 9, I_DOWN: i32 = 10, I_UP: i32 = 11, I_COMMAND: i32 = 12, I_GRID: i32 = 13, I_DOT: i32 = 14;

/** Maps design-box coordinates to the canvas. */
class Box {
  x: number; y: number; k: number;
  constructor(x: number, y: number, size: number) { this.x = x; this.y = y; this.k = size / 16; }
  pts(p: number[]): number[] { const out: number[] = []; for (let i = 0; i + 1 < p.length; i += 2) { out.push(this.x + p[i] * this.k); out.push(this.y + p[i + 1] * this.k); } return out; }
  line(p: number[], w: number, c: i32, a: i32 = 255): void { stroke(this.pts(p), w * this.k, c, a, false); }
  loop(p: number[], w: number, c: i32, a: i32 = 255): void { stroke(this.pts(p), w * this.k, c, a, true); }
  fill(p: number[], c: i32, a: i32 = 255): void { polygon(this.pts(p), c, a); }
  rect(x: number, y: number, w: number, h: number, r: number, c: i32, a: i32 = 255): void { rrect(this.x + x * this.k, this.y + y * this.k, w * this.k, h * this.k, r * this.k, c, a); }
  circle(cx: number, cy: number, r: number): number[] {
    const out: number[] = [];
    for (let i = 0; i < 20; i++) { const a = i * Math.PI / 10; out.push(cx + Math.cos(a) * r); out.push(cy + Math.sin(a) * r); }
    return out;
  }
}

/** `back` is the colour behind the icon (cut-outs). */
export function drawIcon(kind: i32, x: number, y: number, size: number, c: i32, back: i32): void {
  const b = new Box(x, y, size);
  if (kind === I_PLAY) b.fill([4.8, 3, 13.2, 8, 4.8, 13], c);
  else if (kind === I_STOP) b.rect(4, 4, 8, 8, 2, c);
  else if (kind === I_CLOSE) { b.line([4.5, 4.5, 11.5, 11.5], 1.4, c); b.line([11.5, 4.5, 4.5, 11.5], 1.4, c); }
  else if (kind === I_SEARCH) { b.loop(b.circle(7, 7, 4.2), 1.4, c); b.line([10.2, 10.2, 13.8, 13.8], 1.6, c); }
  else if (kind === I_SUN) {
    b.loop(b.circle(8, 8, 2.8), 1.3, c);
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; b.line([8 + Math.cos(a) * 4.8, 8 + Math.sin(a) * 4.8, 8 + Math.cos(a) * 6.3, 8 + Math.sin(a) * 6.3], 1.3, c); }
  } else if (kind === I_MOON) { b.fill(b.circle(8, 8, 5.5), c); b.fill(b.circle(10.5, 5.8, 4.6), back); }
  else if (kind === I_ERROR) { b.fill(b.circle(8, 8, 6.2), c); b.line([8, 4.6, 8, 8.8], 1.6, back); b.fill(b.circle(8, 11.2, 0.95), back); }
  else if (kind === I_CHECK) b.line([3.5, 8.5, 6.5, 11.5, 12.5, 4.5], 1.6, c);
  else if (kind === I_BUG) {
    b.rect(5, 5, 6, 8.5, 3, c);
    b.line([6, 4.6, 5, 2.8], 1.2, c); b.line([10, 4.6, 11, 2.8], 1.2, c);
    b.line([5, 7.5, 2.5, 6.5], 1.2, c); b.line([11, 7.5, 13.5, 6.5], 1.2, c);
    b.line([5, 10, 2.5, 10.5], 1.2, c); b.line([11, 10, 13.5, 10.5], 1.2, c);
    b.line([5.4, 12.2, 3.2, 14], 1.2, c); b.line([10.6, 12.2, 12.8, 14], 1.2, c);
  } else if (kind === I_PLUS) { b.line([8, 3.5, 8, 12.5], 1.5, c); b.line([3.5, 8, 12.5, 8], 1.5, c); }
  else if (kind === I_DOWN) b.line([4.5, 6.5, 8, 10, 11.5, 6.5], 1.5, c);
  else if (kind === I_UP) b.line([4.5, 9.5, 8, 6, 11.5, 9.5], 1.5, c);
  else if (kind === I_COMMAND) {
    b.loop(b.circle(4.5, 4.5, 1.8), 1.2, c); b.loop(b.circle(11.5, 4.5, 1.8), 1.2, c);
    b.loop(b.circle(4.5, 11.5, 1.8), 1.2, c); b.loop(b.circle(11.5, 11.5, 1.8), 1.2, c);
    b.loop([6.3, 6.3, 9.7, 6.3, 9.7, 9.7, 6.3, 9.7], 1.2, c);
  } else if (kind === I_GRID) { b.rect(2.5, 2.5, 4.6, 4.6, 1.2, c); b.rect(8.9, 2.5, 4.6, 4.6, 1.2, c); b.rect(2.5, 8.9, 4.6, 4.6, 1.2, c); b.rect(8.9, 8.9, 4.6, 4.6, 1.2, c); }
  else if (kind === I_DOT) b.fill(b.circle(8, 8, 4.6), c);
}
