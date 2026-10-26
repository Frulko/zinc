// zinc:ink — handwriting surface: pen samples -> strokes drawn with a writing tool (xochitl's set: ballpoint, fineliner, marker, pencil,
// calligraphy, highlighter), stroke and area erasers, undo/redo, clear, JSON/SVG export (docs/reports/ink-tools-and-annotation-formats.md).
// Latency path: each pen sample of the frame (gfx pen queue, nothing lost between frames) becomes one 2-point stroke
// command appended after the canvas image, so the frame diff damages only the new segment and an e-ink driver can use
// its fast waveform on a tiny rectangle. Finished strokes are baked into a runtime image with the very same commands
// (identical pixels: the display driver's own pixel diff then sees nothing to refresh when the image takes over).
// A reader draws the ink over its page with drawOver: the page goes into the same image, under the finished strokes.
import { stroke, rect, clip, unclip, drawImage, createImage, destroyImage, beginImage, endImage, penCount, penX, penY, penPressure, penFlags, PenFlag } from 'zinc:gfx';
import * as ui from 'zinc:ui';

/** The writing tools a stroke can be drawn with (xochitl's names; their .rm v6 pen ids are in the report above). */
export const TOOLS: string[] = ['ballpoint', 'fineliner', 'marker', 'pencil', 'calligraphy', 'highlighter'];
/** The tools that remove ink: 'eraser' takes the strokes it touches, 'area' the strokes with a point in the rectangle it drags. */
export const ERASERS: string[] = ['eraser', 'area'];
/** Opacity of a highlighter stroke (0..255): the only translucent tool, drawn under the other ink. */
export const HIGHLIGHTER_ALPHA: i32 = 90;

/** c mixed toward white: f = 1 keeps it, 0 is white (the pencil's lighter grain). */
function lighten(c: i32, f: number): i32 {
  const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
  return ((255 - Math.round((255 - r) * f)) << 16) | ((255 - Math.round((255 - g) * f)) << 8) | (255 - Math.round((255 - b) * f));
}

export class Stroke {
  color: i32;
  width: number;          // the chosen width (thin / medium / thick), px; each tool scales it (segWidth)
  tool: string = 'ballpoint';
  pts: number[] = [];     // x, y, pressure triples, canvas coordinates
  x0: number = 1e9; y0: number = 1e9; x1: number = -1e9; y1: number = -1e9;
  constructor(color: i32, width: number) { this.color = color; this.width = width; }
  add(x: number, y: number, p: number): void {
    this.pts.push(x); this.pts.push(y); this.pts.push(p);
    this.x0 = Math.min(this.x0, x); this.y0 = Math.min(this.y0, y); this.x1 = Math.max(this.x1, x); this.y1 = Math.max(this.y1, y);
  }
  count(): i32 { return this.pts.length / 3; }
  /** Width of segment i (point i-1 -> i; i = 0 is the initial dot). ponytail: linear pressure curves, tune on hardware. */
  segWidth(i: i32): number {
    const a = Math.max(0, i - 1) * 3, b = i * 3, p = (this.pts[a + 2] + this.pts[b + 2]) / 2, t = this.tool;
    if (t === 'fineliner') return Math.max(1, this.width * 0.8);                       // constant
    if (t === 'highlighter') return this.width * 5;                                    // wide, constant
    if (t === 'marker') return Math.max(1, this.width * 1.5 * (0.6 + 0.4 * p));
    if (t === 'pencil') return Math.max(1, this.width * (0.5 + 0.5 * p));
    if (t === 'calligraphy') {   // a broad nib held at 45 degrees: thick across it, a hairline along it
      const dx = this.pts[b] - this.pts[a], dy = this.pts[b + 1] - this.pts[a + 1], l = Math.sqrt(dx * dx + dy * dy);
      const k = l > 0 ? Math.abs(dx + dy) / (l * 1.4142135623730951) : 0.5;
      return Math.max(1, this.width * (0.3 + 1.5 * k) * (0.6 + 0.4 * p));
    }
    return Math.max(1, this.width * (0.3 + 0.7 * p));   // ballpoint
  }
  /** Colour of segment i: the pencil is lighter where it presses less. */
  segColor(i: i32): i32 {
    if (this.tool !== 'pencil') return this.color;
    const a = Math.max(0, i - 1) * 3, b = i * 3;
    return lighten(this.color, 0.35 + 0.45 * (this.pts[a + 2] + this.pts[b + 2]) / 2);
  }
  alpha(): i32 { return this.tool === 'highlighter' ? HIGHLIGHTER_ALPHA : 255; }
}

/** Draws segment i of `s`, ink point p at (x, y) + (p - (ox, oy)) * z: live frames and baking use exactly this call. */
function segment(s: Stroke, i: i32, x: number, y: number, ox: number, oy: number, z: number): void {
  const p = s.pts, a = Math.max(0, i - 1) * 3, b = i * 3;
  stroke([x + (p[a] - ox) * z, y + (p[a + 1] - oy) * z, x + (p[b] - ox) * z, y + (p[b + 1] - oy) * z], s.segWidth(i) * z, s.segColor(i), 255, false);
}

/** A translucent stroke (the highlighter) is one polyline, so its segments do not darken where they overlap. ponytail: a stroke of more
 *  than 2000 points is cut in polylines that overlap at one point. */
function whole(s: Stroke, x: number, y: number, ox: number, oy: number, z: number): void {
  const p = s.pts;
  let xy: number[] = [];
  for (let i = 0; i < p.length; i += 3) {
    xy.push(x + (p[i] - ox) * z); xy.push(y + (p[i + 1] - oy) * z);
    if (xy.length >= 4000) { stroke(xy, s.segWidth(0) * z, s.color, s.alpha(), false); xy = [xy[xy.length - 2], xy[xy.length - 1]]; }
  }
  if (xy.length === 2) { xy.push(xy[0] + 0.01); xy.push(xy[1]); }   // a dot
  if (xy.length >= 4) stroke(xy, s.segWidth(0) * z, s.color, s.alpha(), false);
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
  tool: string = 'ballpoint';     // a TOOLS name for new strokes, or an ERASERS name
  eraser: boolean = false;        // eraser tool, as tool 'eraser' (the Marker's eraser end always erases)
  eraserRadius: number = 12;
  background: i32 = 0xffffff;
  version: i32 = 0;               // bumps on every change (autosave, dirty flags)
  w: i32 = 0; h: i32 = 0;         // size of the last draw (toJSON, toSVG; a reader sets its page's before saving)
  iw: i32 = 0; ih: i32 = 0;       // size of the image
  live: Stroke | null = null;     // stroke under the pen
  tail: Stroke | null = null;     // stroke whose segments from `baked` on are frame commands, not image pixels yet
  baked: i32 = 0;
  img: i32 = -1;
  stale: boolean = true;          // image must be rebuilt from every stroke
  ox: number = 0; oy: number = 0; z: number = 1; key: number = 0;   // the image's view transform and background version (drawOver)
  erasing: boolean = false;
  erasedNow: boolean = false;
  history: Stroke[][] = [];
  future: Stroke[][] = [];        // what undo took back, for redo
  area: number[] = [];            // the area eraser's rectangle while the pen drags it: x0, y0, x1, y1

  /** One pen sample in canvas coordinates. Live input and scripted replays take this path. */
  feed(x: number, y: number, pressure: number, flags: i32): void {
    if ((flags & PenFlag.Down) === 0) {
      if (this.area.length === 4) { const r = this.area; this.area = []; this.eraseArea(r[0], r[1], r[2], r[3]); }
      this.live = null; this.erasing = false; return;
    }
    if (this.eraser || this.tool === 'eraser' || (flags & PenFlag.Eraser) !== 0) { this.eraseAt(x, y); return; }
    if (this.tool === 'area') {
      if (this.area.length === 0) this.area = [x, y, x, y]; else { this.area[2] = x; this.area[3] = y; }
      this.version++;   // the rectangle is drawn over the ink
      return;
    }
    let s = this.live;
    if (s === null) {
      if (this.tail !== null) this.bakeTail();
      this.remember();
      s = new Stroke(this.color, this.width);
      s.tool = this.tool;
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

  /** Removes the strokes with a point inside the rectangle (the area eraser; any two corners). */
  eraseArea(ax: number, ay: number, bx: number, by: number): void {
    const x0 = Math.min(ax, bx), x1 = Math.max(ax, bx), y0 = Math.min(ay, by), y1 = Math.max(ay, by);
    const keep: Stroke[] = [];
    for (const s of this.strokes) {
      let inside = false;
      if (!(s.x1 < x0 || s.x0 > x1 || s.y1 < y0 || s.y0 > y1))
        for (let i = 0; i < s.pts.length && !inside; i += 3) inside = s.pts[i] >= x0 && s.pts[i] <= x1 && s.pts[i + 1] >= y0 && s.pts[i + 1] <= y1;
      if (!inside) keep.push(s);
    }
    if (keep.length !== this.strokes.length) { this.remember(); this.strokes = keep; }
    this.changed();   // the rectangle goes away in any case
  }

  remember(): void {
    this.history.push(this.strokes.slice());
    if (this.history.length > 50) this.history.shift();
    this.future = [];
  }
  changed(): void { this.live = null; this.tail = null; this.stale = true; this.version++; }
  canUndo(): boolean { return this.history.length > 0; }
  canRedo(): boolean { return this.future.length > 0; }
  undo(): void { if (this.history.length > 0) { this.future.push(this.strokes); this.strokes = this.history.pop(); this.changed(); } }
  redo(): void { if (this.future.length > 0) { this.history.push(this.strokes); this.strokes = this.future.pop(); this.changed(); } }
  clear(): void { if (this.strokes.length > 0) { this.remember(); this.strokes = []; this.changed(); } }
  /** Replaces the page content (page switch, load); forgets the undo history. */
  setStrokes(list: Stroke[]): void { this.strokes = list; this.history = []; this.future = []; this.changed(); }

  /** Canvas onDraw: consumes this frame's pen samples inside (x, y, w, h), then draws image + live segments; zoomed, ink point p shows
   *  at (x, y) + (p - (ox, oy)) * z (a ZoomView's committed view). */
  draw(x: i32, y: i32, w: i32, h: i32, ox: number = 0, oy: number = 0, z: number = 1): void {
    for (let i = 0; i < penCount(); i++) {
      const sx = penX(i) - x, sy = penY(i) - y, f = penFlags(i);
      const outside = sx < 0 || sy < 0 || sx >= w || sy >= h;
      if (outside && this.live === null && !this.erasing && this.area.length === 0 && (f & PenFlag.Down) !== 0) continue;  // strokes start inside
      this.feed(ox + sx / z, oy + sy / z, penPressure(i), f);
    }
    this.paint(x, y, w, h, ox, oy, z, 0, null);
  }

  /** The ink over a reader's page in the view (x, y, w, h): ink point p shows at (x, y) + (p - (ox, oy)) * z, and bg(w, h) draws the
   *  page from (0, 0). Page and finished strokes are one image, drawn again only when the transform, `key` (the caller's version of
   *  the page), the size or the strokes change; while the pen writes, a frame is that image plus the live stroke's new segments.
   *  The caller feeds the pen samples (feed) in ink coordinates. */
  drawOver(x: i32, y: i32, w: i32, h: i32, ox: number, oy: number, z: number, key: number, bg: (w: i32, h: i32) => void): void {
    clip(x, y, w, h);
    this.paint(x, y, w, h, ox, oy, z, key, bg);
    unclip();
  }

  paint(x: i32, y: i32, w: i32, h: i32, ox: number, oy: number, z: number, key: number, bg: ((w: i32, h: i32) => void) | null): void {
    this.w = w; this.h = h;
    if (w !== this.iw || h !== this.ih || this.img < 0) {
      if (this.img >= 0) destroyImage(this.img);
      this.img = createImage(w, h);
      this.iw = w; this.ih = h; this.stale = true;
    }
    if (ox !== this.ox || oy !== this.oy || z !== this.z || key !== this.key) { this.ox = ox; this.oy = oy; this.z = z; this.key = key; this.stale = true; }
    const t = this.tail;
    if (t !== null && (t !== this.live || (t.tool !== 'highlighter' && t.count() - this.baked > 200))) this.bakeTail();
    if (this.stale) this.rebake(bg);
    drawImage(this.img, x, y, w, h, 255, 0);
    const s = this.tail;
    if (s !== null) {
      if (s.tool === 'highlighter') whole(s, x, y, ox, oy, z);   // the whole stroke each frame: a translucent stroke is one polyline
      else for (let i = this.baked; i < s.count(); i++) segment(s, i, x, y, ox, oy, z);
    }
    const r = this.area;
    if (r.length === 4) stroke([x + (r[0] - ox) * z, y + (r[1] - oy) * z, x + (r[2] - ox) * z, y + (r[1] - oy) * z, x + (r[2] - ox) * z, y + (r[3] - oy) * z,
      x + (r[0] - ox) * z, y + (r[3] - oy) * z], 2, 0x000000, 255, true);
  }

  /** Moves the tail's pending segments into the image (same commands, same pixels). */
  bakeTail(): void {
    const s = this.tail;
    if (s === null || this.img < 0) return;
    if (s.tool === 'highlighter') {   // a finished highlighter goes under the other ink: the image is drawn again
      if (s !== this.live) { this.tail = null; this.stale = true; }
      return;
    }
    beginImage(this.img);
    for (let i = this.baked; i < s.count(); i++) {
      segment(s, i, 0, 0, this.ox, this.oy, this.z);
      if ((i - this.baked) % 200 === 199) { endImage(); beginImage(this.img); }  // frame pools are finite
    }
    endImage();
    this.baked = s.count();
    if (s !== this.live) this.tail = null;
  }

  rebake(bg: ((w: i32, h: i32) => void) | null): void {
    this.stale = false;
    if (this.img < 0) return;
    beginImage(this.img);
    rect(0, 0, this.iw, this.ih, this.background);
    if (bg !== null) (bg as (w: i32, h: i32) => void)(this.iw, this.ih);
    const ox = this.ox, oy = this.oy, z = this.z, x1 = ox + this.iw / z, y1 = oy + this.ih / z;
    let n = 0;
    for (let pass = 0; pass < 2; pass++)   // highlighters first, under the other ink
      for (const s of this.strokes) {
        const hl = s.tool === 'highlighter';
        if (hl !== (pass === 0) || (hl && s === this.live)) continue;   // a highlighter being written is drawn whole each frame
        const m = s.width * 5;   // the ink reaches half its (widest) width past its points
        if (s.x1 + m < ox || s.x0 - m > x1 || s.y1 + m < oy || s.y0 - m > y1) continue;
        if (hl) { whole(s, 0, 0, ox, oy, z); if (++n % 200 === 0) { endImage(); beginImage(this.img); } continue; }
        for (let i = 0; i < s.count(); i++) {
          segment(s, i, 0, 0, ox, oy, z);
          if (++n % 200 === 0) { endImage(); beginImage(this.img); }
        }
      }
    endImage();
    const t = this.tail;
    this.baked = t !== null ? t.count() : 0;
  }

  /** {"version":1,"width":W,"height":H,"strokes":[{"color":"#rrggbb","tool":"pencil","width":4,"points":[x,y,pressure,...]}]}; "tool" is
   *  left out for a ballpoint, so files of before the tools read and write the same. */
  toJSON(): string {
    const parts: string[] = [];
    for (const s of this.strokes) {
      const pts: string[] = [];
      for (let i = 0; i < s.pts.length; i += 3) pts.push(`${s.pts[i].toFixed(1)},${s.pts[i + 1].toFixed(1)},${s.pts[i + 2].toFixed(3)}`);
      const tool = s.tool === 'ballpoint' ? '' : `"tool":"${s.tool}",`;
      parts.push(`{"color":"${hex(s.color)}",${tool}"width":${s.width},"points":[${pts.join(',')}]}`);
    }
    return `{"version":1,"width":${this.w},"height":${this.h},"strokes":[${parts.join(',')}]}`;
  }

  /** SVG with the same geometry as the screen: runs of equal width and colour become round-capped polylines, each group says its tool
   *  (data-tool, none for a ballpoint), and a highlighter is one translucent polyline under the other ink. */
  toSVG(): string {
    const out: string[] = [`<svg xmlns="http://www.w3.org/2000/svg" width="${this.w}" height="${this.h}" viewBox="0 0 ${this.w} ${this.h}">`,
      `<rect width="100%" height="100%" fill="${hex(this.background)}"/>`];
    for (const s of this.strokes) {
      if (s.tool !== 'highlighter') continue;
      const xy: string[] = [];
      for (let i = 0; i < s.pts.length; i += 3) xy.push(`${s.pts[i].toFixed(1)},${s.pts[i + 1].toFixed(1)}`);
      out.push(`<polyline data-tool="highlighter" points="${xy.join(' ')}" fill="none" stroke="${hex(s.color)}" stroke-opacity="${(s.alpha() / 255).toFixed(2)}" stroke-width="${Math.round(s.segWidth(0) * 10) / 10}" stroke-linecap="round" stroke-linejoin="round" style="mix-blend-mode:multiply"/>`);
    }
    for (const s of this.strokes) {
      if (s.tool === 'highlighter') continue;
      out.push(`<g fill="none" stroke="${hex(s.color)}" stroke-linecap="round" stroke-linejoin="round"${s.tool === 'ballpoint' ? '' : ` data-tool="${s.tool}"`}>`);
      let run = '', rw = -1, rc = s.color;
      for (let i = 0; i < s.count(); i++) {
        const w = Math.round(s.segWidth(i) * 10) / 10, c = s.segColor(i), a = Math.max(0, i - 1) * 3, b = i * 3;
        if (w !== rw || c !== rc) {
          if (run.length > 0) out.push(polyline(run, rw, rc, s.color));
          rw = w; rc = c; run = `${s.pts[a].toFixed(1)},${s.pts[a + 1].toFixed(1)}`;
        }
        run += ` ${s.pts[b].toFixed(1)},${s.pts[b + 1].toFixed(1)}`;
      }
      if (run.length > 0) out.push(polyline(run, rw, rc, s.color));
      out.push('</g>');
    }
    out.push('</svg>');
    return out.join('\n');
  }
}

function polyline(run: string, w: number, c: i32, group: i32): string {
  return c === group ? `<polyline points="${run}" stroke-width="${w}"/>` : `<polyline points="${run}" stroke-width="${w}" stroke="${hex(c)}"/>`;
}

/** Strokes from toJSON() output (a stroke without "tool" is a ballpoint). ponytail: reads only the format toJSON writes, not arbitrary JSON. */
export function parseStrokes(json: string): Stroke[] {
  const out: Stroke[] = [];
  const parts = json.split('{"color":"#');
  for (let i = 1; i < parts.length; i++) {
    const t = parts[i];
    const s = new Stroke(ui.parseHex(t.slice(0, 6)), parseFloat(t.slice(t.indexOf('"width":') + 8, t.indexOf(',"points"'))));
    const at = t.indexOf('"tool":"');
    if (at >= 0) s.tool = t.slice(at + 8, t.indexOf('"', at + 8));
    const v = t.slice(t.indexOf('[') + 1, t.indexOf(']')).split(',');
    for (let k = 0; k + 2 < v.length; k += 3) s.add(parseFloat(v[k]), parseFloat(v[k + 1]), parseFloat(v[k + 2]));
    out.push(s);
  }
  return out;
}

export interface InkProps { ink: Ink; className?: string }
/** <InkCanvas ink={doc} className="grow" />: a canvas node that captures and renders `ink`. */
export function InkCanvas(props: InkProps): i32 {
  const n = ui.createNode(ui.CANVAS);
  const c = props.className ?? '';
  if (c.length > 0) ui.setClass(n, c);
  const ink = props.ink;
  ui.draw(n, (x: i32, y: i32, w: i32, h: i32) => { ink.draw(x, y, w, h); });
  return n;
}
