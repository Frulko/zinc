// ScrollLayer: an endless static picture made of chunks, baked ahead in slices and assembled by pixel rows into the renderer's buffers.
//
// The world is a grid of chunks (core CW x CH layer pixels). A chunk is baked by the shared renderer in a private buffer (core + margin all
// around) through the painter of the game, and its core is kept. The picture of a window is the cores laid side by side: pixel for pixel the
// one a single bake of the whole region gives, as long as the painter is a pure function of the layer position (hash of the position,
// canonical object order) and the margin covers what reaches across a seam (a shadow, a crown, the occlusion and the edges: 5 px).
// The layer pixel (wx, wy) is the renderer's (ix + PX, iy + PY): the camera is the pixel origin, never a new projection.
import {
  W, H, pix, zb, bakedPix, bakedZ, ground, groundZ, kinds, staticShadow, shadowMask,
  setPixelOrigin, enterBake, leaveBake, bakeOcclusion, applyShadows, copyInto, drawTuftList, drawLeafList,
} from './renderer';
import type { Tuft, Leaf } from './renderer';

/** What a game gives a layer: the picture of any layer rectangle, drawn through the renderer, a pure function of the position. */
export interface ScrollPainter {
  /** How many painting steps a chunk takes (the ground, then groups of objects): each step is one slice of the bake. */
  steps(): number;
  /** Paints step k for the layer pixels [x0, x1) x [y0, y1) (the renderer's pixel origin is already x0, y0). Draw every object whose pixels or shadow
   *  touch the rectangle, in an order that depends only on the object. Step 0 draws the ground and grows the grass. */
  paint(k: number, x0: number, y0: number, x1: number, y1: number): void;
}

export class Chunk {
  cx: number;
  cy: number;
  baked: u32[];
  depth: number[];
  ground: number[];
  groundZ: number[];
  kinds: number[];
  shade: number[];
  tufts: Tuft[] = [];
  leaves: Leaf[] = [];
  /** The world changed under it: it is still shown until a new bake takes its place, so nothing flashes white. */
  stale: boolean = false;
  constructor(cx: number, cy: number, n: number) {
    this.cx = cx; this.cy = cy;
    this.baked = Array.from({ length: n }, (): u32 => 0); this.depth = Array.from({ length: n }, (): number => 0);
    this.ground = Array.from({ length: n }, (): number => 0); this.groundZ = Array.from({ length: n }, (): number => 0);
    this.kinds = Array.from({ length: n }, (): number => 0); this.shade = Array.from({ length: n }, (): number => 0);
  }
}

/** A chunk being baked: its stage, and what the slices have grown so far. */
export class BakeJob {
  cx: number;
  cy: number;
  stage: number = 0;
  tufts: Tuft[] = [];
  leaves: Leaf[] = [];
  constructor(cx: number, cy: number) { this.cx = cx; this.cy = cy; }
}

export class ScrollLayer {
  readonly cw: number;
  readonly ch: number;
  readonly margin: number;
  private painter: ScrollPainter;
  private chunks: Map<number, Chunk> = new Map();
  /** Changes whenever a chunk is stored, dropped or invalidated: the window must be loaded again. */
  version: number = 0;
  constructor(painter: ScrollPainter, chunkWidth: number = 128, chunkHeight: number = 96, margin: number = 24) {
    this.painter = painter; this.cw = chunkWidth; this.ch = chunkHeight; this.margin = margin;
  }
  private key(cx: number, cy: number): number { return (cx + 32768) * 65536 + (cy + 32768); }
  has(cx: number, cy: number): boolean { return this.chunks.has(this.key(cx, cy)); }
  get(cx: number, cy: number): Chunk | undefined { return this.chunks.get(this.key(cx, cy)); }
  count(): number { return this.chunks.size; }
  /** The slices of one chunk: the painter's steps, the occlusion and shadows, the copy of the core. */
  stages(): number { return this.painter.steps() + 2; }

  /** Bakes a whole chunk now (a first screen, the tests); a game bakes ahead with `slice`. */
  bake(cx: number, cy: number): Chunk {
    const job = new BakeJob(cx, cy);
    while (!this.slice(job)) { /* one slice after the other */ }
    return this.get(cx, cy) as Chunk;
  }
  /** Runs the next slice of a job; true when the chunk is finished and stored. The frame's buffers are untouched between two slices. */
  slice(job: BakeJob): boolean {
    const m = this.margin, w = this.cw + 2 * m, h = this.ch + 2 * m, steps = this.painter.steps();
    const x0 = job.cx * this.cw - m, y0 = job.cy * this.ch - m, k = job.stage;
    enterBake(w, h, k > 0);
    setPixelOrigin(x0, y0);
    if (k < steps) this.painter.paint(k, x0, y0, x0 + w, y0 + h);
    else if (k === steps) { bakeOcclusion(); copyInto(staticShadow, shadowMask); applyShadows(groundZ); copyInto(bakedPix, pix); copyInto(bakedZ, zb); }
    else this.store(job, w);
    const grown = leaveBake();
    for (const t of grown.tufts) job.tufts.push(t);
    for (const l of grown.leaves) job.leaves.push(l);
    job.stage++;
    if (k < steps + 1) return false;
    return true;
  }
  /** Copies the core of the baked buffers into a new chunk, with the tufts and leaves that belong to it in the chunk's own pixels. */
  private store(job: BakeJob, w: number): void {
    const m = this.margin, c = new Chunk(job.cx, job.cy, this.cw * this.ch);
    for (let y = 0; y < this.ch; y++) {
      const from = (y + m) * w + m, to = y * this.cw;
      for (let x = 0; x < this.cw; x++) {
        c.baked[to + x] = bakedPix[from + x]; c.depth[to + x] = bakedZ[from + x]; c.ground[to + x] = ground[from + x];
        c.groundZ[to + x] = groundZ[from + x]; c.kinds[to + x] = kinds[from + x]; c.shade[to + x] = staticShadow[from + x];
      }
    }
    // a tuft belongs to the chunk whose core holds its base, a leaf to the one whose core holds its first pixel; both in the chunk's own pixels
    for (const t of job.tufts) {
      if (t.ix >= m && t.ix < m + this.cw && t.iy >= m && t.iy < m + this.ch) c.tufts.push({ ix: t.ix - m, iy: t.iy - m, i: 0, height: t.height, base: t.base, phase: t.phase, bloom: t.bloom });
    }
    for (const l of job.leaves) {
      if (l.pixels.length < 4) continue;
      const ax = l.pixels[0], ay = l.pixels[1];
      if (ax < m || ax >= m + this.cw || ay < m || ay >= m + this.ch) continue;
      const moved: number[] = [];
      for (let n = 0; n < l.pixels.length; n += 4) moved.push(l.pixels[n] - m, l.pixels[n + 1] - m, l.pixels[n + 2], l.pixels[n + 3]);
      c.leaves.push({ x: l.x, y: l.y, z: l.z, k: l.k, r: l.r, pixels: moved });
    }
    this.chunks.set(this.key(job.cx, job.cy), c);
    this.version++;
  }

  /** The chunks a window of w x h pixels at (camX, camY) needs, closest to its centre first, widened by `ahead` pixels on every side. */
  missing(camX: number, camY: number, w: number, h: number, ahead: number): number[][] {
    const out: number[][] = [];
    const c0 = Math.floor((camX - ahead) / this.cw), c1 = Math.floor((camX + w + ahead - 1) / this.cw);
    const r0 = Math.floor((camY - ahead) / this.ch), r1 = Math.floor((camY + h + ahead - 1) / this.ch);
    const mx = camX + w / 2, my = camY + h / 2;
    for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) { const c = this.get(cx, cy); if (c === undefined || c.stale) out.push([cx, cy]); }
    out.sort((a: number[], b: number[]): number => {
      const da = Math.abs((a[0] + .5) * this.cw - mx) + Math.abs((a[1] + .5) * this.ch - my), db = Math.abs((b[0] + .5) * this.cw - mx) + Math.abs((b[1] + .5) * this.ch - my);
      return da - db;
    });
    return out;
  }
  /** Marks the chunks that touch the layer rectangle [x0, x1) x [y0, y1) for baking again (the world changed there); they stay shown until then. */
  invalidate(x0: number, y0: number, x1: number, y1: number): void {
    for (const [k, c] of this.chunks) {
      const cx0 = c.cx * this.cw, cy0 = c.cy * this.ch;
      if (cx0 < x1 && cx0 + this.cw > x0 && cy0 < y1 && cy0 + this.ch > y0) { c.stale = true; }
    }
  }
  /** Forgets the chunks farther than `keep` pixels from the window. */
  drop(camX: number, camY: number, w: number, h: number, keep: number): void {
    for (const [k, c] of this.chunks) {
      const x0 = c.cx * this.cw, y0 = c.cy * this.ch;
      if (x0 + this.cw < camX - keep || x0 > camX + w + keep || y0 + this.ch < camY - keep || y0 > camY + h + keep) { this.chunks.delete(k); this.version++; }
    }
  }
  /** Lays the window at (camX, camY) into the renderer's baked buffers (the picture before anything moves), row by row from the chunks; what no chunk covers is white. */
  load(camX: number, camY: number, rx0: number = 0, ry0: number = 0, rx1: number = W, ry1: number = H): void {
    for (let y = ry0; y < ry1; y++) for (let i = y * W + rx0, end = y * W + rx1; i < end; i++) { bakedPix[i] = 0xFFFFFFFF; bakedZ[i] = -1e9; ground[i] = 0; groundZ[i] = -1e9; kinds[i] = 0; staticShadow[i] = 0; }
    const c0 = Math.floor((camX + rx0) / this.cw), c1 = Math.floor((camX + rx1 - 1) / this.cw), r0 = Math.floor((camY + ry0) / this.ch), r1 = Math.floor((camY + ry1 - 1) / this.ch);
    for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) {
      const c = this.get(cx, cy);
      if (!c) continue;
      const ox = cx * this.cw - camX, oy = cy * this.ch - camY;   // the chunk's corner in the window
      const xa = Math.max(0, rx0 - ox), xb = Math.min(this.cw, rx1 - ox), ya = Math.max(0, ry0 - oy), yb = Math.min(this.ch, ry1 - oy);
      for (let y = ya; y < yb; y++) {
        let to = (oy + y) * W + ox + xa, from = y * this.cw + xa;
        for (let x = xa; x < xb; x++, to++, from++) {
          bakedPix[to] = c.baked[from]; bakedZ[to] = c.depth[from]; ground[to] = c.ground[from]; groundZ[to] = c.groundZ[from]; kinds[to] = c.kinds[from]; staticShadow[to] = c.shade[from];
        }
      }
    }
  }
  /** Draws the wind-moved grass and leaves of the loaded chunks over the window at (camX, camY): after the baked picture is copied into the frame. */
  wind(camX: number, camY: number, t: number): void {
    const c0 = Math.floor((camX - 40) / this.cw), c1 = Math.floor((camX + W + 40) / this.cw), r0 = Math.floor((camY - 40) / this.ch), r1 = Math.floor((camY + H + 40) / this.ch);
    for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) {
      const c = this.get(cx, cy);
      if (!c) continue;
      drawTuftList(c.tufts, cx * this.cw - camX, cy * this.ch - camY, t);
    }
    for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) {
      const c = this.get(cx, cy);
      if (c) drawLeafList(c.leaves, cx * this.cw - camX, cy * this.ch - camY, t);
    }
  }
}
