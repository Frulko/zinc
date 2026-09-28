// zinc:ink — handwriting surface: pen samples -> pressure-variable strokes, stroke eraser, undo, clear, JSON/SVG export.
// Latency path: each pen sample of the frame (gfx pen queue, nothing lost between frames) becomes one 2-point stroke
// command appended after the canvas image, so the frame diff damages only the new segment and an e-ink driver can use
// its fast waveform on a tiny rectangle. Finished strokes are baked into a runtime image with the very same commands
// (identical pixels: the display driver's own pixel diff then sees nothing to refresh when the image takes over).
import { stroke, rect, drawImage, createImage, destroyImage, beginImage, endImage, penCount, penX, penY, penPressure, penFlags, PenFlag } from 'zinc:gfx';
import * as ui from 'zinc:ui';

export class Stroke {
  color: i32;
  width: number;          // width at full pressure, px
  pts: number[] = [];     // x, y, pressure triples, canvas coordinates
  x0: number = 1e9; y0: number = 1e9; x1: number = -1e9; y1: number = -1e9;
  constructor(color: i32, width: number) { this.color = color; this.width = width; }
  add(x: number, y: number, p: number): void {
    this.pts.push(x); this.pts.push(y); this.pts.push(p);
    this.x0 = Math.min(this.x0, x); this.y0 = Math.min(this.y0, y); this.x1 = Math.max(this.x1, x); this.y1 = Math.max(this.y1, y);
  }
  count(): i32 { return this.pts.length / 3; }
  /** Width of segment i (point i-1 -> i; i = 0 is the initial dot). ponytail: linear pressure curve, tune on hardware. */
  segWidth(i: i32): number {
    const a = Math.max(0, i - 1) * 3, b = i * 3;
    return Math.max(1, this.width * (0.3 + 0.7 * (this.pts[a + 2] + this.pts[b + 2]) / 2));
  }
}

/** Draws segment i of `s` shifted by (ox, oy): live frames and baking use exactly this call. */
function segment(s: Stroke, i: i32, ox: number, oy: number): void {
  const p = s.pts, a = Math.max(0, i - 1) * 3, b = i * 3;
  stroke([p[a] + ox, p[a + 1] + oy, p[b] + ox, p[b + 1] + oy], s.segWidth(i), s.color, 255, false);
}

/** Point-to-polyline distance test (stroke eraser). */
function near(s: Stroke, x: number, y: number, r: number): boolean {
  const p = s.pts;
  for (let i = 0; i < p.length; i += 3) {
    const a = Math.max(0, i - 3);
    const ax = p[a], ay = p[a + 1], dx = p[i] - ax, dy = p[i + 1] - ay, l = dx * dx + dy * dy;
    const t = l > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l)) : 0;
    const ex = ax + t * dx - x, ey = ay + t * dy - y;
    if (ex * ex + ey * ey <= r * r) return true;
  }
  return false;
}

const HEX = '0123456789abcdef';
function hex(c: i32): string { let s = '#'; for (let k = 20; k >= 0; k -= 4) s += HEX.at((c >> k) & 15); return s; }

/** A page of ink. Draw it with <InkCanvas ink={doc} /> or from any canvas: onDraw={(x, y, w, h) => doc.draw(x, y, w, h)}. */
export class Ink {
  strokes: Stroke[] = [];
  color: i32 = 0x000000;
  width: number = 4;
  eraser: boolean = false;        // eraser tool (the Marker's eraser end always erases)
  eraserRadius: number = 12;
  background: i32 = 0xffffff;
  version: i32 = 0;               // bumps on every change (autosave, dirty flags)
  w: i32 = 0; h: i32 = 0;         // size of the last draw
  live: Stroke | null = null;     // stroke under the pen
  tail: Stroke | null = null;     // stroke whose segments from `baked` on are frame commands, not image pixels yet
  baked: i32 = 0;
  img: i32 = -1;
  stale: boolean = true;          // image must be rebuilt from every stroke
  erasing: boolean = false;
  erasedNow: boolean = false;
  history: Stroke[][] = [];

  /** One pen sample in canvas coordinates. Live input and scripted replays take this path. */
  feed(x: number, y: number, pressure: number, flags: i32): void {
    if ((flags & PenFlag.Down) === 0) { this.live = null; this.erasing = false; return; }
    if (this.eraser || (flags & PenFlag.Eraser) !== 0) { this.eraseAt(x, y); return; }
    let s = this.live;
    if (s === null) {
      if (this.tail !== null) this.bakeTail();
      this.remember();
      s = new Stroke(this.color, this.width);
      this.strokes.push(s);
      this.live = s; this.tail = s; this.baked = 0;
    }
    const n = s.pts.length;
    if (n > 0 && Math.abs(s.pts[n - 3] - x) + Math.abs(s.pts[n - 2] - y) < 0.5) return;  // sub-pixel move
    s.add(x, y, Math.max(0, Math.min(1, pressure)));
    this.version++;
  }

  eraseAt(x: number, y: number): void {
    if (!this.erasing) { this.erasing = true; this.erasedNow = false; }
    const r = this.eraserRadius;
    const keep: Stroke[] = [];
    for (const s of this.strokes) {
      const m = r + s.width / 2;
      if (x < s.x0 - m || x > s.x1 + m || y < s.y0 - m || y > s.y1 + m || !near(s, x, y, m)) keep.push(s);
    }
    if (keep.length === this.strokes.length) return;
    if (!this.erasedNow) { this.remember(); this.erasedNow = true; }
    this.strokes = keep;
    this.changed();
  }

  remember(): void {
    this.history.push(this.strokes.slice());
    if (this.history.length > 50) this.history.shift();
  }
  changed(): void { this.live = null; this.tail = null; this.stale = true; this.version++; }
  canUndo(): boolean { return this.history.length > 0; }
  undo(): void { if (this.history.length > 0) { this.strokes = this.history.pop(); this.changed(); } }
  clear(): void { if (this.strokes.length > 0) { this.remember(); this.strokes = []; this.changed(); } }
  /** Replaces the page content (page switch, load); forgets the undo history. */
  setStrokes(list: Stroke[]): void { this.strokes = list; this.history = []; this.changed(); }

  /** Canvas onDraw: consumes this frame's pen samples inside (x, y, w, h), then draws image + live segments. */
  draw(x: i32, y: i32, w: i32, h: i32): void {
    for (let i = 0; i < penCount(); i++) {
      const sx = penX(i) - x, sy = penY(i) - y, f = penFlags(i);
      const outside = sx < 0 || sy < 0 || sx >= w || sy >= h;
      if (outside && this.live === null && !this.erasing && (f & PenFlag.Down) !== 0) continue;  // strokes start inside
      this.feed(sx, sy, penPressure(i), f);
    }
    if (w !== this.w || h !== this.h || this.img < 0) {
      if (this.img >= 0) destroyImage(this.img);
      this.img = createImage(w, h);
      this.w = w; this.h = h; this.stale = true;
    }
    if (this.stale) this.rebake();
    const t = this.tail;
    if (t !== null && (t !== this.live || t.count() - this.baked > 200)) this.bakeTail();
    drawImage(this.img, x, y, w, h, 255, 0);
    const s = this.tail;
    if (s !== null) for (let i = this.baked; i < s.count(); i++) segment(s, i, x, y);
  }

  /** Moves the tail's pending segments into the image (same commands, same pixels). */
  bakeTail(): void {
    const s = this.tail;
    if (s === null || this.img < 0) return;
    beginImage(this.img);
    for (let i = this.baked; i < s.count(); i++) {
      segment(s, i, 0, 0);
      if ((i - this.baked) % 200 === 199) { endImage(); beginImage(this.img); }  // frame pools are finite
    }
    endImage();
    this.baked = s.count();
    if (s !== this.live) this.tail = null;
  }

  rebake(): void {
    this.stale = false;
    if (this.img < 0) return;
    beginImage(this.img);
    rect(0, 0, this.w, this.h, this.background);
    let n = 0;
    for (const s of this.strokes) for (let i = 0; i < s.count(); i++) {
      segment(s, i, 0, 0);
      if (++n % 200 === 0) { endImage(); beginImage(this.img); }
    }
    endImage();
    const t = this.tail;
    this.baked = t !== null ? t.count() : 0;
  }

  /** {"version":1,"width":W,"height":H,"strokes":[{"color":"#rrggbb","width":4,"points":[x,y,pressure,...]}]} */
  toJSON(): string {
    const parts: string[] = [];
    for (const s of this.strokes) {
      const pts: string[] = [];
      for (let i = 0; i < s.pts.length; i += 3) pts.push(`${s.pts[i].toFixed(1)},${s.pts[i + 1].toFixed(1)},${s.pts[i + 2].toFixed(3)}`);
      parts.push(`{"color":"${hex(s.color)}","width":${s.width},"points":[${pts.join(',')}]}`);
    }
    return `{"version":1,"width":${this.w},"height":${this.h},"strokes":[${parts.join(',')}]}`;
  }

  /** SVG with the same geometry as the screen: runs of equal width become round-capped polylines. */
  toSVG(): string {
    const out: string[] = [`<svg xmlns="http://www.w3.org/2000/svg" width="${this.w}" height="${this.h}" viewBox="0 0 ${this.w} ${this.h}">`,
      `<rect width="100%" height="100%" fill="${hex(this.background)}"/>`];
    for (const s of this.strokes) {
      out.push(`<g fill="none" stroke="${hex(s.color)}" stroke-linecap="round" stroke-linejoin="round">`);
      let run = '', rw = -1;
      for (let i = 0; i < s.count(); i++) {
        const w = Math.round(s.segWidth(i) * 10) / 10, a = Math.max(0, i - 1) * 3, b = i * 3;
        if (w !== rw) {
          if (run.length > 0) out.push(`<polyline points="${run}" stroke-width="${rw}"/>`);
          rw = w; run = `${s.pts[a].toFixed(1)},${s.pts[a + 1].toFixed(1)}`;
        }
        run += ` ${s.pts[b].toFixed(1)},${s.pts[b + 1].toFixed(1)}`;
      }
      if (run.length > 0) out.push(`<polyline points="${run}" stroke-width="${rw}"/>`);
      out.push('</g>');
    }
    out.push('</svg>');
    return out.join('\n');
  }
}

/** Strokes from toJSON() output. ponytail: reads only the format toJSON writes, not arbitrary JSON. */
export function parseStrokes(json: string): Stroke[] {
  const out: Stroke[] = [];
  const parts = json.split('{"color":"#');
  for (let i = 1; i < parts.length; i++) {
    const t = parts[i];
    const s = new Stroke(ui.parseHex(t.slice(0, 6)), parseFloat(t.slice(t.indexOf('"width":') + 8, t.indexOf(',"points"'))));
    const v = t.slice(t.indexOf('[') + 1, t.indexOf(']')).split(',');
    for (let k = 0; k + 2 < v.length; k += 3) s.add(parseFloat(v[k]), parseFloat(v[k + 1]), parseFloat(v[k + 2]));
    out.push(s);
  }
  return out;
}

export interface InkProps { ink: Ink; class?: string }
/** <InkCanvas ink={doc} class="grow" />: a canvas node that captures and renders `ink`. */
export function InkCanvas(props: InkProps): i32 {
  const n = ui.createNode(ui.CANVAS);
  const c = props.class ?? '';
  if (c.length > 0) ui.setClass(n, c);
  const ink = props.ink;
  ui.draw(n, (x: i32, y: i32, w: i32, h: i32) => { ink.draw(x, y, w, h); });
  return n;
}
