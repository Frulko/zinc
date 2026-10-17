// zinc:canvas in the browser (docs/targets/web.md, "Plugins"): the same API as index.ts over the browser's own Canvas2D, with nothing re-implemented. A context that draws
// into an image (Canvas, new CanvasRenderingContext2D(image)) is the real 2D context of that gfx image's canvas; a context of the screen draws into a canvas of the box that
// begin(x, y, w, h) gives and end() shows it there as an image, in paint order (so it keeps its place among the other zinc:gfx draws, in canvas and DOM mode).
// Differences from the desktop's rasterizer: text, anti-aliasing and gradients are the browser's; drawImage takes gfx image ids as on the desktop (and a canvas or an
// ImageBitmap too); rotation of drawImage is applied (the desktop ignores it).
import { createImage, destroyImage, drawImage as gfxDrawImage, imageWidth, imageHeight } from 'zinc:gfx';

const g: any = globalThis;
const Z: any = g.__zincWeb;

export class CssColor {
  rgb: number; alpha: number;
  constructor(rgb: number, alpha: number) { this.rgb = rgb; this.alpha = alpha; }
}
let probe: any = null;
/** CSS colour as the browser reads it: 0xRRGGBB and alpha 0..255; null when not a colour. */
export function parseColor(css: string): CssColor | null {
  if (probe === null) probe = g.document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  probe.clearRect(0, 0, 1, 1);
  probe.fillStyle = '#010203';
  probe.fillStyle = css;
  if (probe.fillStyle === '#010203' && css.trim().toLowerCase() !== '#010203' && css.trim().toLowerCase() !== '#123') return null;
  probe.globalCompositeOperation = 'copy';
  probe.fillRect(0, 0, 1, 1);
  const d = probe.getImageData(0, 0, 1, 1).data;
  const a = d[3];
  // getImageData is premultiplied-then-unpremultiplied: good to within a unit for opaque and half-transparent colours
  return new CssColor(d[0] * 65536 + d[1] * 256 + d[2], a);
}
export const CanvasGradient: any = g.CanvasGradient;
export const DOMMatrix: any = g.DOMMatrix;
export const TextMetrics: any = g.TextMetrics;
export class CanvasSize { width: number = 0; height: number = 0; }

/** The browser's 2D context behind the begin / end of zinc:canvas. */
export class CanvasRenderingContext2D {
  constructor(image: number = -1) {
    const self: any = this;
    self._image = image;
    self._real = null;
    self._box = null;
    self.canvas = new CanvasSize();
    if (image >= 0) { self.canvas.width = imageWidth(image); self.canvas.height = imageHeight(image); }
    return new Proxy(self, {
      get(t: any, k: any): any {
        if (k in t) return t[k];
        const r = t._real || t._peek();
        const v = r[k];
        return typeof v === 'function' ? v.bind(r) : v;
      },
      set(t: any, k: any, v: any): boolean {
        if (k in t) { t[k] = v; return true; }
        (t._real || t._peek())[k] = v;
        return true;
      },
    });
  }
  /** A context for property reads before begin(): the image's own one, or a scratch one for the screen. */
  _peek(): any {
    const self: any = this;
    if (self._image >= 0) { self._real = Z.images.canvas(self._image).getContext('2d'); return self._real; }
    if (self._scratch === undefined) self._scratch = g.document.createElement('canvas').getContext('2d');
    return self._scratch;
  }
  /** Starts drawing: a screen context takes the box (x, y, w, h) it draws in; an image context ignores it. */
  begin(x: number = 0, y: number = 0, w: number = 0, h: number = 0): void {
    const self: any = this;
    if (self._image >= 0) {
      const cv = Z.images.canvas(self._image);
      self.canvas.width = imageWidth(self._image); self.canvas.height = imageHeight(self._image);
      self._real = cv.getContext('2d');
    } else {
      const cv = self._cv || (self._cv = g.document.createElement('canvas'));
      const dpr = Math.max(1, Math.min(3, g.devicePixelRatio || 1));
      cv.width = Math.max(1, Math.round(w * dpr)); cv.height = Math.max(1, Math.round(h * dpr));
      self.canvas.width = w; self.canvas.height = h;
      self._real = cv.getContext('2d');
      self._real.setTransform(dpr, 0, 0, dpr, 0, 0);
      self._box = [x, y, w, h];
    }
    self._real.save();
  }
  /** Ends drawing: a screen context shows its canvas in the box (as an image, in paint order); an image context marks its image changed. */
  end(): void {
    const self: any = this;
    if (self._real === null) return;
    self._real.restore();
    if (self._image >= 0) Z.images.touch(self._image);
    else if (self._box !== null) {
      const cv = self._cv;
      if (self._shown === undefined || self._shownW !== cv.width || self._shownH !== cv.height) {
        if (self._shown !== undefined) destroyImage(self._shown);
        self._shown = createImage(cv.width, cv.height); self._shownW = cv.width; self._shownH = cv.height;
        Z.images.resize(self._shown, cv.width, cv.height);
      }
      const c = Z.images.canvas(self._shown);
      const q = c.getContext('2d');
      q.clearRect(0, 0, c.width, c.height);
      q.drawImage(cv, 0, 0);
      Z.images.touch(self._shown);
      gfxDrawImage(self._shown, self._box[0], self._box[1], self._box[2], self._box[3], 255);
    }
    self._real = null; self._box = null;
  }
  /** drawImage(image, dx, dy), (image, dx, dy, dw, dh) or (image, sx, sy, sw, sh, dx, dy, dw, dh): `image` is a gfx image id, a canvas or a bitmap. */
  drawImage(image: any, ...a: number[]): void {
    const self: any = this;
    const r = self._real || self._peek();
    const src = typeof image === 'number' ? Z.images.canvas(image) : image;
    if (src) r.drawImage(src, ...a);
  }
}

/** An offscreen canvas: a gfx image whose pixels persist; draw it with gfx.drawImage(canvas.image, ...) or ctx.drawImage(canvas.image, ...). */
export class Canvas {
  readonly width: number;
  readonly height: number;
  readonly image: number;
  private ctx: CanvasRenderingContext2D | null = null;
  constructor(width: number, height: number) {
    this.width = width; this.height = height;
    this.image = createImage(width, height);
  }
  getContext(kind: string = '2d'): CanvasRenderingContext2D {
    const c = this.ctx ?? new CanvasRenderingContext2D(this.image);
    this.ctx = c;
    return c;
  }
  dispose(): void { destroyImage(this.image); }
}
