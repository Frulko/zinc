import { W, H, setView, inBakeView, beginModel, captureModel, shadowMask, resizeBuffer, configureRenderer, bayerAt, rampOf, rgb, COS, SIN } from '../pixel';

// The baker of the Cite sprites: it runs the real Pixel Plays drawing of the old view (the lit volumes of view/models.ts, actors.ts, beasts.ts, the pine) through the
// shared renderer's model capture, so a sprite has the same light, ramps, dither and depth as the object in the old view. A frame is captured into a Cell (art pixels:
// colour and depth), given the soft shadow the old view casts on the ground and the dark and warm outlines of its depth pass, and then written into an atlas page with
// every art pixel one atlas pixel (the view draws it ART = 64 / 28.28 map pixels wide, nearest). The 2x set is lit again at twice the scale, it is not an enlarged 1x.
export const S_ART = 10;                       // art pixels per world unit at 1x: the old view's own scale (a tile of 2 units is 28 art pixels across); drawn at ART map pixels each, the 2x set is lit at 20
export const EMPTY = -1e9;
const WARM = [255, 232, 180];

/** A picture in art pixels: `px` straight RGBA (red in the low byte), `depth` where the model drew (EMPTY elsewhere). (ax, ay) is where the world origin is inside it. */
export class Cell {
  w: number = 0; h: number = 0; ax: number = 0; ay: number = 0; px: u32[] = []; depth: number[] = [];
  constructor(w: number, h: number, ax: number, ay: number) {
    this.w = w; this.h = h; this.ax = ax; this.ay = ay;
    this.px = Array.from({ length: w * h }, (): u32 => 0); this.depth = Array.from({ length: w * h }, (): number => EMPTY);
  }
}
export function argb(c: number[], a: number): u32 { return ((a << 24) | (Math.min(255, Math.round(c[2])) << 16) | (Math.min(255, Math.round(c[1])) << 8) | Math.min(255, Math.round(c[0]))) >>> 0; }

/** Lights the renderer as the old view does, in a buffer big enough for a sprite, with the scale of the set (k: 1 or 2). */
let lit = false;
export function prepare(k: number): void {
  if (!lit) { lit = true; resizeBuffer(360, 280); configureRenderer(8, 1.1, -.25); }
  setView(S_ART * k, W / 2, H * .6);
}

/** Runs `draw` (it paints at the world origin) and returns what it made as a Cell of w x h art pixels with the origin at (ax, ay). `shadow` casts the ground shadow into the mask. */
export function capture(draw: () => void, shadow: (() => void) | null, w: number, h: number, ax: number, ay: number, k: number): Cell {
  const cell = new Cell(w, h, ax, ay);
  prepare(k);
  let ox = 0, oy = 0, xs: number[] = [], ys: number[] = [], ds: number[] = [], cs: u32[] = [];
  inBakeView((): void => {
    shadowMask.fill(0); beginModel(); draw(); if (shadow !== null) shadow();
    const m = captureModel().toArrays();
    ox = Math.round(m.originX); oy = Math.round(m.originY); xs = m.xs; ys = m.ys; ds = m.depths; cs = m.colors;
  });
  for (let n = 0; n < cs.length; n++) {
    const x = xs[n] - ox + ax, y = ys[n] - oy + ay;
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    cell.px[y * w + x] = cs[n]; cell.depth[y * w + x] = ds[n];
  }
  const x0 = Math.max(0, ox - ax), y0 = Math.max(0, oy - ay), x1 = Math.min(W, ox - ax + w), y1 = Math.min(H, oy - ay + h);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const s = shadowMask[y * W + x];
    if (s === 0) continue;
    shadowMask[y * W + x] = 0;
    const i = (y - oy + ay) * w + (x - ox + ax);
    if (cell.depth[i] === EMPTY) cell.px[i] = s === 1 ? 0x75300000 : 0xa3320000;      // the ground under it, darkened toward violet like the old view's tint
  }
  edges(cell, S_ART * k);
  return cell;
}

/** The outlines of the old view's depth pass (renderer shadeEdges) for a model alone: dark against empty, a warm rim on a lit step, dark under a step down. */
function edges(c: Cell, s: number): void {
  const grad = COS / (s * SIN), out: u32[] = c.px.slice();
  for (let y = 1; y < c.h - 1; y++) for (let x = 1; x < c.w - 1; x++) {
    const i = y * c.w + x, d = c.depth[i];
    if (d === EMPTY) continue;
    const a = c.depth[i - c.w], b = c.depth[i + c.w], l = c.depth[i - 1], r = c.depth[i + 1], p = c.px[i];
    const pr = p & 255, pg = (p >> 8) & 255, pb = (p >> 16) & 255;
    if (a === EMPTY || b === EMPTY || l === EMPTY || r === EMPTY) out[i] = rgb(pr * .68, pg * .66, pb * .76);
    else if (d - a - grad > .28 || d - l > .28) out[i] = rgb(pr + (WARM[0] - pr) * .3, pg + (WARM[1] - pg) * .3, pb + (WARM[2] - pb) * .22);
    else if (r - d > .28 || b - grad - d > .28) out[i] = rgb(pr * .74, pg * .72, pb * .82);
  }
  c.px = out;
}

/** A tree leaning at its top by `amount` art pixels (the sway): every row is shifted in proportion to its height above the foot. */
export function shear(c: Cell, amount: number): Cell {
  const o = new Cell(c.w, c.h, c.ax, c.ay);
  for (let y = 0; y < c.h; y++) {
    const up = Math.max(0, c.ay - y), dx = Math.round(amount * up / c.ay);
    for (let x = 0; x < c.w; x++) {
      const nx = x + dx;
      if (nx < 0 || nx >= c.w) continue;
      o.px[y * c.w + nx] = c.px[y * c.w + x]; o.depth[y * c.w + nx] = c.depth[y * c.w + x];
    }
  }
  return o;
}

/** Writes a Cell into an atlas page (pw pixels wide) at (x, y). Empty pixels leave the page as it is. */
export function blit(c: Cell, page: u32[], pw: number, x: number, y: number): void {
  for (let j = 0; j < c.h; j++) for (let i = 0; i < c.w; i++) {
    const v = c.px[j * c.w + i];
    if (v !== 0) page[(y + j) * pw + x + i] = v;
  }
}

/** A dithered disc of a ramp colour for the small effects: lit from the upper left, edge broken by the same Bayer pattern as the figures. */
export function disc(c: Cell, cx: number, cy: number, rx: number, ry: number, color: number[], alpha: number, soft: number): void {
  const ramp = rampOf(color);
  for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++) for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
    if (x < 0 || y < 0 || x >= c.w || y >= c.h) continue;
    const dx = (x + .5 - cx) / rx, dy = (y + .5 - cy) / ry, n = dx * dx + dy * dy;
    if (n + (bayerAt(x, y) - .5) * soft > 1) continue;
    const l = Math.max(0, Math.min(1, .55 - .5 * dx - .5 * dy));
    const v = ramp[Math.max(1, Math.min(4, Math.floor(l * 4.4 + .2 + (bayerAt(x, y) - .5) * .7)))];
    c.px[y * c.w + x] = (v & 0xffffff) | (alpha << 24);
  }
}
