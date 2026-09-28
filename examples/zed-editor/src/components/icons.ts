// Icons drawn with zinc:gfx strokes and shapes in a 16 x 16 design box, scaled to the canvas: file types by
// extension, folders, the tree chevron and the toolbar / status bar glyphs.
import { stroke, polygon, rrect, border, drawText, font, textWidth } from 'zinc:gfx';
import { Theme } from '../app/theme';

export const I_SIDEBAR: i32 = 0, I_TERMINAL: i32 = 1, I_SEARCH: i32 = 2, I_SUN: i32 = 3, I_MOON: i32 = 4, I_WRAP: i32 = 5,
  I_CLOSE: i32 = 6, I_PLAY: i32 = 7, I_ERROR: i32 = 8, I_WARNING: i32 = 9, I_BRANCH: i32 = 10, I_STOP: i32 = 11,
  I_COMMAND: i32 = 12, I_FILE: i32 = 13, I_MINIMAP: i32 = 14, I_CHECK: i32 = 15;

/** Maps design-box coordinates to the canvas. */
class Box {
  x: number; y: number; k: number;
  constructor(x: number, y: number, size: number) { this.x = x; this.y = y; this.k = size / 16; }
  pts(p: number[]): number[] { const out: number[] = []; for (let i = 0; i + 1 < p.length; i += 2) { out.push(this.x + p[i] * this.k); out.push(this.y + p[i + 1] * this.k); } return out; }
  line(p: number[], w: number, c: i32, a: i32 = 255): void { stroke(this.pts(p), w * this.k, c, a, false); }
  loop(p: number[], w: number, c: i32, a: i32 = 255): void { stroke(this.pts(p), w * this.k, c, a, true); }
  fill(p: number[], c: i32, a: i32 = 255): void { polygon(this.pts(p), c, a); }
  rect(x: number, y: number, w: number, h: number, r: number, c: i32, a: i32 = 255): void { rrect(this.x + x * this.k, this.y + y * this.k, w * this.k, h * this.k, r * this.k, c, a); }
  frame(x: number, y: number, w: number, h: number, r: number, lw: number, c: i32): void { border(this.x + x * this.k, this.y + y * this.k, w * this.k, h * this.k, r * this.k, lw * this.k, c, 255); }
  circle(cx: number, cy: number, r: number): number[] {
    const out: number[] = [];
    for (let i = 0; i < 20; i++) { const a = i * Math.PI / 10; out.push(cx + Math.cos(a) * r); out.push(cy + Math.sin(a) * r); }
    return out;
  }
  /** Centred label in a small bold font (file type badges). */
  label(s: string, cx: number, cy: number, c: i32): void {
    const f = font('sans-bold', 8);
    drawText(f, this.x + cx * this.k - textWidth(f, s, 0) / 2, this.y + cy * this.k - 5, s, c, 255, 0);
  }
}

/** Tree chevron: `open` 0 points right, 1 points down (animated by a spring). */
export function drawChevron(x: number, y: number, size: number, open: number, color: i32): void {
  const b = new Box(x, y, size), a = open * Math.PI / 2, ca = Math.cos(a), sa = Math.sin(a);
  // the right-pointing chevron (6,4) (10,8) (6,12), rotated around the centre
  const p: number[] = [6, 4.5, 9.5, 8, 6, 11.5], out: number[] = [];
  for (let i = 0; i < p.length; i += 2) { const dx = p[i] - 8, dy = p[i + 1] - 8; out.push(8 + dx * ca - dy * sa); out.push(8 + dx * sa + dy * ca); }
  b.line(out, 1.4, color);
}

function ext(name: string): string { const d = name.lastIndexOf('.'); return d <= 0 ? name.toLowerCase() : name.slice(d + 1).toLowerCase(); }

/** File icon by extension; folders when `dir` (open or closed). */
export function drawFileIcon(name: string, dir: boolean, open: boolean, x: number, y: number, size: number, t: Theme): void {
  const b = new Box(x, y, size);
  if (dir) {
    const c = t.muted;
    if (open) {
      b.loop([1.5, 3.5, 6, 3.5, 7.5, 5, 13, 5, 13, 7], 1.2, c);
      b.fill([1.5, 13, 3.5, 7, 15, 7, 13, 13], c, 90);
      b.loop([1.5, 3.5, 1.5, 13, 13, 13, 15, 7, 3.5, 7, 1.5, 13], 1.2, c);
    } else {
      b.fill([1.5, 3.5, 6, 3.5, 7.5, 5, 14.5, 5, 14.5, 13, 1.5, 13], c, 60);
      b.loop([1.5, 3.5, 6, 3.5, 7.5, 5, 14.5, 5, 14.5, 13, 1.5, 13], 1.2, c);
    }
    return;
  }
  const e = ext(name);
  if (e === 'ts' || e === 'mts') { b.rect(2, 2, 12, 12, 2.5, 0x3178c6); b.label('TS', 8.4, 9.6, 0xffffff); return; }
  if (e === 'js' || e === 'mjs' || e === 'cjs') { b.rect(2, 2, 12, 12, 2.5, 0xd8b43a); b.label('JS', 8.4, 9.6, 0x2b2b2b); return; }
  if (e === 'tsx' || e === 'jsx') {
    // an atom: three orbits and a nucleus
    const c = 0x5fb4d8;
    for (let k = 0; k < 3; k++) {
      const a = k * Math.PI / 3, pts: number[] = [];
      for (let i = 0; i < 24; i++) {
        const u = i * Math.PI / 12, ex = Math.cos(u) * 6.5, ey = Math.sin(u) * 2.6;
        pts.push(8 + ex * Math.cos(a) - ey * Math.sin(a)); pts.push(8 + ex * Math.sin(a) + ey * Math.cos(a));
      }
      b.loop(pts, 1, c);
    }
    b.fill(b.circle(8, 8, 1.4), c);
    return;
  }
  if (e === 'json') {
    const c = 0xcbb04a;
    b.line([6, 2.5, 4.5, 3, 4.5, 7, 3, 8, 4.5, 9, 4.5, 13, 6, 13.5], 1.3, c);
    b.line([10, 2.5, 11.5, 3, 11.5, 7, 13, 8, 11.5, 9, 11.5, 13, 10, 13.5], 1.3, c);
    return;
  }
  if (e === 'md' || e === 'markdown') {
    const c = 0x7a9fd6;
    b.frame(1, 3.5, 14, 9, 2, 1.1, c);
    b.line([3.5, 10, 3.5, 6, 5.5, 8, 7.5, 6, 7.5, 10], 1.2, c);
    b.line([11, 6, 11, 10], 1.2, c); b.line([9.5, 8.5, 11, 10, 12.5, 8.5], 1.2, c);
    return;
  }
  if (e === 'css' || e === 'scss') {
    const c = 0xa77bd4;
    b.line([6.5, 2.5, 5, 13.5], 1.4, c); b.line([11, 2.5, 9.5, 13.5], 1.4, c);
    b.line([3, 6, 13.5, 6], 1.4, c); b.line([2.5, 10, 13, 10], 1.4, c);
    return;
  }
  if (e === 'gitignore' || name === '.gitignore') {
    const c = 0xe0724f;
    b.fill([8, 1.5, 14.5, 8, 8, 14.5, 1.5, 8], c);
    b.line([6, 5, 8, 7, 8, 11], 1.2, 0xffffff); b.fill(b.circle(8, 11, 1.2), 0xffffff); b.fill(b.circle(10, 9, 1.2), 0xffffff); b.line([8, 7, 10, 9], 1.2, 0xffffff);
    return;
  }
  if (e === 'png' || e === 'jpg' || e === 'svg' || e === 'gif') {
    const c = 0x8fbf6a;
    b.frame(1.5, 2.5, 13, 11, 2, 1.1, c);
    b.fill([3, 12, 7, 7, 10, 10, 11.5, 8.5, 13.5, 12], c);
    b.fill(b.circle(11, 5.5, 1.2), c);
    return;
  }
  if (e === 'lock' || e === 'toml' || e === 'yaml' || e === 'yml') {
    const c = t.faint;
    b.frame(3, 7, 10, 7.5, 1.5, 1.2, c);
    b.line([5, 7, 5, 5, 6, 3, 8, 2.5, 10, 3, 11, 5, 11, 7], 1.2, c);
    return;
  }
  // any other file: a page with a folded corner
  const c = t.faint;
  b.loop([3, 1.5, 9.5, 1.5, 13, 5, 13, 14.5, 3, 14.5], 1.2, c);
  b.line([9.5, 1.5, 9.5, 5, 13, 5], 1.2, c);
}

/** Toolbar, tab and status bar glyphs. `back` is the surface colour (cut-outs). */
export function drawIcon(kind: i32, x: number, y: number, size: number, c: i32, back: i32): void {
  const b = new Box(x, y, size);
  if (kind === I_SIDEBAR) { b.frame(1.5, 2.5, 13, 11, 2, 1.2, c); b.line([6, 3, 6, 13], 1.2, c); b.rect(2.5, 3.5, 3, 9, 1, c, 60); }
  else if (kind === I_TERMINAL) { b.frame(1.5, 2.5, 13, 11, 2, 1.2, c); b.line([4.5, 6, 6.5, 8, 4.5, 10], 1.2, c); b.line([8, 10.5, 11.5, 10.5], 1.2, c); }
  else if (kind === I_SEARCH) { b.loop(b.circle(7, 7, 4.2), 1.3, c); b.line([10.2, 10.2, 13.8, 13.8], 1.5, c); }
  else if (kind === I_SUN) {
    b.loop(b.circle(8, 8, 2.8), 1.2, c);
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; b.line([8 + Math.cos(a) * 4.8, 8 + Math.sin(a) * 4.8, 8 + Math.cos(a) * 6.3, 8 + Math.sin(a) * 6.3], 1.2, c); }
  } else if (kind === I_MOON) { b.fill(b.circle(8, 8, 5.5), c); b.fill(b.circle(10.5, 5.8, 4.6), back); }
  else if (kind === I_WRAP) {
    b.line([2, 4, 14, 4], 1.2, c); b.line([2, 12, 5.5, 12], 1.2, c);
    b.line([2, 8, 12, 8, 13.4, 8.6, 14, 10, 13.4, 11.4, 12, 12, 8.5, 12], 1.2, c);
    b.line([10, 10.5, 8.5, 12, 10, 13.5], 1.2, c);
  } else if (kind === I_CLOSE) { b.line([4.5, 4.5, 11.5, 11.5], 1.3, c); b.line([11.5, 4.5, 4.5, 11.5], 1.3, c); }
  else if (kind === I_PLAY) b.fill([4.5, 3, 13, 8, 4.5, 13], c);
  else if (kind === I_STOP) b.rect(4, 4, 8, 8, 1.5, c);
  else if (kind === I_ERROR) { b.loop(b.circle(8, 8, 5.8), 1.2, c); b.line([5.8, 5.8, 10.2, 10.2], 1.2, c); b.line([10.2, 5.8, 5.8, 10.2], 1.2, c); }
  else if (kind === I_WARNING) { b.loop([8, 2, 14.5, 13.5, 1.5, 13.5], 1.2, c); b.line([8, 6.5, 8, 9.5], 1.3, c); b.fill(b.circle(8, 11.6, 0.8), c); }
  else if (kind === I_CHECK) { b.line([3.5, 8.5, 6.5, 11.5, 12.5, 4.5], 1.4, c); }
  else if (kind === I_BRANCH) {
    b.loop(b.circle(5, 3.5, 1.6), 1.1, c); b.loop(b.circle(5, 12.5, 1.6), 1.1, c); b.loop(b.circle(11, 5.5, 1.6), 1.1, c);
    b.line([5, 5.1, 5, 10.9], 1.1, c); b.line([11, 7.1, 11, 8, 10, 9.5, 5.5, 10.5], 1.1, c);
  } else if (kind === I_COMMAND) {
    b.loop(b.circle(4.5, 4.5, 1.8), 1.1, c); b.loop(b.circle(11.5, 4.5, 1.8), 1.1, c);
    b.loop(b.circle(4.5, 11.5, 1.8), 1.1, c); b.loop(b.circle(11.5, 11.5, 1.8), 1.1, c);
    b.frame(6.3, 6.3, 3.4, 3.4, 0, 1.1, c);
  } else if (kind === I_MINIMAP) {
    b.frame(1.5, 2.5, 13, 11, 2, 1.2, c);
    b.line([4, 5.5, 8, 5.5], 1, c); b.line([4, 8, 10, 8], 1, c); b.line([4, 10.5, 7, 10.5], 1, c); b.rect(11, 4, 2, 4, 0.5, c, 120);
  } else b.loop([3, 1.5, 9.5, 1.5, 13, 5, 13, 14.5, 3, 14.5], 1.2, c);
}
