// zinc:canvas: an HTML Canvas 2D-style context on the shared rasterizer, so web canvas code ports with few changes.
// Paths are flattened and transformed here (Zinc), strokes become filled outlines (caps, joins, dashes), and fills go
// to the rasterizer as anti-aliased polygons with the nonzero or even-odd rule and optional gradient paint
// (native/canvas2d.host.cpp). Text and images use zinc:gfx. Guide and deviations: docs/plugins/canvas2d.md.
import {
  font as gfxFont, fontAscent, lineHeight, textWidth, drawText, imageWidth, imageHeight,
  clip as gfxClip, unclip, beginImage, endImage, createImage, destroyImage, rrect,
} from 'zinc:gfx';
import N from './native/canvas2d.spec';

// ---------------------------------------------------------------- CSS colours
const NAMES = 'aliceblue f0f8ff antiquewhite faebd7 aqua 00ffff aquamarine 7fffd4 azure f0ffff beige f5f5dc bisque ffe4c4 ' +
  'black 000000 blanchedalmond ffebcd blue 0000ff blueviolet 8a2be2 brown a52a2a burlywood deb887 cadetblue 5f9ea0 ' +
  'chartreuse 7fff00 chocolate d2691e coral ff7f50 cornflowerblue 6495ed cornsilk fff8dc crimson dc143c cyan 00ffff ' +
  'darkblue 00008b darkcyan 008b8b darkgoldenrod b8860b darkgray a9a9a9 darkgreen 006400 darkgrey a9a9a9 darkkhaki bdb76b ' +
  'darkmagenta 8b008b darkolivegreen 556b2f darkorange ff8c00 darkorchid 9932cc darkred 8b0000 darksalmon e9967a ' +
  'darkseagreen 8fbc8f darkslateblue 483d8b darkslategray 2f4f4f darkslategrey 2f4f4f darkturquoise 00ced1 darkviolet 9400d3 ' +
  'deeppink ff1493 deepskyblue 00bfff dimgray 696969 dimgrey 696969 dodgerblue 1e90ff firebrick b22222 floralwhite fffaf0 ' +
  'forestgreen 228b22 fuchsia ff00ff gainsboro dcdcdc ghostwhite f8f8ff gold ffd700 goldenrod daa520 gray 808080 green 008000 ' +
  'greenyellow adff2f grey 808080 honeydew f0fff0 hotpink ff69b4 indianred cd5c5c indigo 4b0082 ivory fffff0 khaki f0e68c ' +
  'lavender e6e6fa lavenderblush fff0f5 lawngreen 7cfc00 lemonchiffon fffacd lightblue add8e6 lightcoral f08080 lightcyan e0ffff ' +
  'lightgoldenrodyellow fafad2 lightgray d3d3d3 lightgreen 90ee90 lightgrey d3d3d3 lightpink ffb6c1 lightsalmon ffa07a ' +
  'lightseagreen 20b2aa lightskyblue 87cefa lightslategray 778899 lightslategrey 778899 lightsteelblue b0c4de lightyellow ffffe0 ' +
  'lime 00ff00 limegreen 32cd32 linen faf0e6 magenta ff00ff maroon 800000 mediumaquamarine 66cdaa mediumblue 0000cd ' +
  'mediumorchid ba55d3 mediumpurple 9370db mediumseagreen 3cb371 mediumslateblue 7b68ee mediumspringgreen 00fa9a ' +
  'mediumturquoise 48d1cc mediumvioletred c71585 midnightblue 191970 mintcream f5fffa mistyrose ffe4e1 moccasin ffe4b5 ' +
  'navajowhite ffdead navy 000080 oldlace fdf5e6 olive 808000 olivedrab 6b8e23 orange ffa500 orangered ff4500 orchid da70d6 ' +
  'palegoldenrod eee8aa palegreen 98fb98 paleturquoise afeeee palevioletred db7093 papayawhip ffefd5 peachpuff ffdab9 peru cd853f ' +
  'pink ffc0cb plum dda0dd powderblue b0e0e6 purple 800080 rebeccapurple 663399 red ff0000 rosybrown bc8f8f royalblue 4169e1 ' +
  'saddlebrown 8b4513 salmon fa8072 sandybrown f4a460 seagreen 2e8b57 seashell fff5ee sienna a0522d silver c0c0c0 skyblue 87ceeb ' +
  'slateblue 6a5acd slategray 708090 slategrey 708090 snow fffafa springgreen 00ff7f steelblue 4682b4 tan d2b48c teal 008080 ' +
  'thistle d8bfd8 tomato ff6347 turquoise 40e0d0 violet ee82ee wheat f5deb3 white ffffff whitesmoke f5f5f5 yellow ffff00 yellowgreen 9acd32';
const named = new Map<string, u32>();

function channel(s: string, scale: number): number {
  const v = s.endsWith('%') ? parseFloat(s.slice(0, s.length - 1)) * scale / 100 : parseFloat(s);
  return isNaN(v) ? 0 : Math.min(scale, Math.max(0, v));
}
function hue(h: number, m1: number, m2: number): number {
  if (h < 0) h += 1;
  if (h > 1) h -= 1;
  if (h * 6 < 1) return m1 + (m2 - m1) * h * 6;
  if (h * 2 < 1) return m2;
  if (h * 3 < 2) return m1 + (m2 - m1) * (2 / 3 - h) * 6;
  return m1;
}
/** CSS colour (#rgb, #rgba, #rrggbb, #rrggbbaa, rgb[a](), hsl[a](), names, 'transparent') as alpha * 2^24 + 0xRRGGBB
 *  with alpha 0..255; -1 when not a colour. */
export function parseColor(css: string): number {
  const s = css.trim().toLowerCase();
  if (s.startsWith('#')) {
    const h = s.slice(1);
    if (h.length === 3 || h.length === 4) {
      let out = '';
      for (const ch of h) out += ch + ch;
      return parseColor('#' + out);
    }
    if (h.length !== 6 && h.length !== 8) return -1;
    const v = parseInt(h.slice(0, 6), 16), a = h.length === 8 ? parseInt(h.slice(6, 8), 16) : 255;
    return isNaN(v) || isNaN(a) ? -1 : a * 16777216 + v;
  }
  const open = s.indexOf('(');
  if (open > 0 && s.endsWith(')')) {
    const fn = s.slice(0, open).trim();
    const p = s.slice(open + 1, s.length - 1).replaceAll(',', ' ').replaceAll('/', ' ').split(' ').filter((x: string) => x.length > 0);
    if (p.length < 3) return -1;
    const a = p.length > 3 ? channel(p[3], 1) : 1;
    let r = 0, g = 0, b = 0;
    if (fn === 'rgb' || fn === 'rgba') { r = channel(p[0], 255); g = channel(p[1], 255); b = channel(p[2], 255); }
    else if (fn === 'hsl' || fn === 'hsla') {
      const hh = ((parseFloat(p[0]) % 360) + 360) % 360 / 360, ss = channel(p[1], 1), ll = channel(p[2], 1);
      const m2 = ll <= 0.5 ? ll * (ss + 1) : ll + ss - ll * ss, m1 = ll * 2 - m2;
      r = hue(hh + 1 / 3, m1, m2) * 255; g = hue(hh, m1, m2) * 255; b = hue(hh - 1 / 3, m1, m2) * 255;
    } else return -1;
    return Math.round(a * 255) * 16777216 + Math.round(r) * 65536 + Math.round(g) * 256 + Math.round(b);
  }
  if (s === 'transparent') return 0;
  if (named.size === 0) {
    const w = NAMES.split(' ');
    for (let i = 0; i + 1 < w.length; i += 2) named.set(w[i], parseInt(w[i + 1], 16));
  }
  if (!named.has(s)) return -1;
  return 255 * 16777216 + (named.get(s) ?? 0);
}

// ---------------------------------------------------------------- gradients, metrics, matrices
export class CanvasGradient {
  /** 1 linear, 2 radial */
  readonly kind: i32;
  readonly x0: number; readonly y0: number; readonly r0: number;
  readonly x1: number; readonly y1: number; readonly r1: number;
  /** (offset, 0xRRGGBB, alpha 0..255) triples sorted by offset */
  readonly stops: number[] = [];
  constructor(kind: i32, x0: number, y0: number, r0: number, x1: number, y1: number, r1: number) {
    this.kind = kind; this.x0 = x0; this.y0 = y0; this.r0 = r0; this.x1 = x1; this.y1 = y1; this.r1 = r1;
  }
  addColorStop(offset: number, color: string): void {
    const c = parseColor(color);
    if (c < 0) return;
    const o = Math.min(1, Math.max(0, offset));
    let at = this.stops.length;
    while (at > 0 && this.stops[at - 3] > o) at -= 3;
    const tail = this.stops.slice(at);
    this.stops.length = at;
    this.stops.push(o); this.stops.push(c % 16777216); this.stops.push(Math.floor(c / 16777216));
    for (const v of tail) this.stops.push(v);
  }
}

export class TextMetrics {
  width = 0;
  actualBoundingBoxLeft = 0; actualBoundingBoxRight = 0;
  actualBoundingBoxAscent = 0; actualBoundingBoxDescent = 0;
  fontBoundingBoxAscent = 0; fontBoundingBoxDescent = 0;
}

/** 2D affine matrix [a c e; b d f] (DOMMatrix subset). */
export class DOMMatrix {
  a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
}

/** Size of the surface a context draws on (the box given to begin(), or the image). */
export class CanvasSize { width: number = 0; height: number = 0; }

class State {
  a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
  fillStyle = '#000'; strokeStyle = '#000';
  fillGradient: CanvasGradient | null = null; strokeGradient: CanvasGradient | null = null;
  lineWidth = 1; lineCap = 'butt'; lineJoin = 'miter'; miterLimit = 10;
  dash: number[] = []; lineDashOffset = 0;
  globalAlpha = 1; font = '10px sans-serif'; textAlign = 'start'; textBaseline = 'alphabetic';
  clips: i32 = 0;
}

// ---------------------------------------------------------------- the context
/**
 * HTML CanvasRenderingContext2D subset. Draws into the current frame (begin(x, y, w, h) ... end(), inside onFrame or a
 * `<canvas onDraw>` callback) or into a Canvas's runtime image (canvas.getContext('2d'), begin() ... end()), whose pixels
 * persist between frames like a web canvas. `fillStyle = gradient` is spelled `fillGradient = gradient` (Zinc has no
 * string | object unions); setting a colour string clears the gradient.
 */
export class CanvasRenderingContext2D {
  readonly canvas = new CanvasSize();
  // state (save/restore)
  private fillCss = '#000';
  private strokeCss = '#000';
  /** Gradient fill, instead of the colour (web: fillStyle = gradient); setting fillStyle clears it. */
  fillGradient: CanvasGradient | null = null;
  strokeGradient: CanvasGradient | null = null;
  lineWidth = 1;
  /** 'butt' | 'round' | 'square' */
  lineCap = 'butt';
  /** 'miter' | 'round' | 'bevel' */
  lineJoin = 'miter';
  miterLimit = 10;
  lineDashOffset = 0;
  globalAlpha = 1;
  /** CSS font shorthand: "[italic] [bold|100..900] <size>px <family>" (sans-serif, monospace, or a baked family). */
  font = '10px sans-serif';
  /** 'start' | 'left' | 'center' | 'right' | 'end' */
  textAlign = 'start';
  /** 'alphabetic' | 'top' | 'hanging' | 'middle' | 'ideographic' | 'bottom' */
  textBaseline = 'alphabetic';
  /** Accepted and ignored: only source-over compositing, no shadows. */
  globalCompositeOperation = 'source-over';
  shadowBlur = 0; shadowColor = 'transparent'; shadowOffsetX = 0; shadowOffsetY = 0;
  /** false: runtime images (Canvas, video frames...) are scaled nearest-neighbour (cheaper, pixel art). */
  imageSmoothingEnabled = true;
  /** clearRect paints this colour; 'transparent' (default) does nothing on screen, where every frame starts empty,
   *  and paints black in an image (images have no alpha). */
  clearColor = 'transparent';

  /** CSS colour string; clears fillGradient. */
  get fillStyle(): string { return this.fillCss; }
  set fillStyle(v: string) { this.fillCss = v; this.fillGradient = null; }
  get strokeStyle(): string { return this.strokeCss; }
  set strokeStyle(v: string) { this.strokeCss = v; this.strokeGradient = null; }

  private a = 1; private b = 0; private c = 0; private d = 1; private e = 0; private f = 0;
  private ox = 0; private oy = 0;
  private dash: number[] = [];
  private clips: i32 = 0;
  private stack: State[] = [];
  private image: i32;
  private active = false;
  // current path: device-space polylines
  private subs: number[][] = [];
  private closed: boolean[] = [];
  private cx = 0; private cy = 0; private sx = 0; private sy = 0; private hasPoint = false;
  // parse caches
  private fillKey = ''; private fillVal = 0;
  private strokeKey = ''; private strokeVal = 0;
  private fontKey = ''; private fontId: i32 = -1;

  /** image: a runtime image (gfx.createImage) to draw into, -1 for the screen. */
  constructor(image: i32 = -1) {
    this.image = image;
    if (image >= 0) { this.canvas.width = imageWidth(image); this.canvas.height = imageHeight(image); }
  }

  /** Starts drawing: screen contexts take the box (x, y, w, h) they draw in (origin and clip); image contexts ignore it. */
  begin(x: number = 0, y: number = 0, w: number = 0, h: number = 0): void {
    if (this.active) this.end();
    this.active = true;
    if (this.image >= 0) {
      beginImage(this.image);
      this.ox = 0; this.oy = 0;
      this.canvas.width = imageWidth(this.image); this.canvas.height = imageHeight(this.image);
    } else {
      this.ox = x; this.oy = y;
      this.canvas.width = w; this.canvas.height = h;
      gfxClip(x, y, w, h);
    }
    this.clips = this.image >= 0 ? 0 : 1;
    this.stack.length = 0;
    this.beginPath();
  }
  /** Ends drawing: pops the clips, renders an image context into its image. */
  end(): void {
    if (!this.active) return;
    this.active = false;
    for (let i = 0; i < this.clips; i++) unclip();
    this.clips = 0;
    if (this.image >= 0) endImage();
  }

  // ------------------------------------------------ state
  save(): void {
    const s = new State();
    s.a = this.a; s.b = this.b; s.c = this.c; s.d = this.d; s.e = this.e; s.f = this.f;
    s.fillStyle = this.fillCss; s.strokeStyle = this.strokeCss; s.fillGradient = this.fillGradient; s.strokeGradient = this.strokeGradient;
    s.lineWidth = this.lineWidth; s.lineCap = this.lineCap; s.lineJoin = this.lineJoin; s.miterLimit = this.miterLimit;
    s.dash = this.dash; s.lineDashOffset = this.lineDashOffset; s.globalAlpha = this.globalAlpha; s.font = this.font;
    s.textAlign = this.textAlign; s.textBaseline = this.textBaseline; s.clips = this.clips;
    this.stack.push(s);
  }
  restore(): void {
    if (this.stack.length === 0) return;
    const s = this.stack.pop();
    this.a = s.a; this.b = s.b; this.c = s.c; this.d = s.d; this.e = s.e; this.f = s.f;
    this.fillCss = s.fillStyle; this.strokeCss = s.strokeStyle; this.fillGradient = s.fillGradient; this.strokeGradient = s.strokeGradient;
    this.lineWidth = s.lineWidth; this.lineCap = s.lineCap; this.lineJoin = s.lineJoin; this.miterLimit = s.miterLimit;
    this.dash = s.dash; this.lineDashOffset = s.lineDashOffset; this.globalAlpha = s.globalAlpha; this.font = s.font;
    this.textAlign = s.textAlign; this.textBaseline = s.textBaseline;
    for (; this.clips > s.clips; this.clips--) unclip();
  }

  // ------------------------------------------------ transforms
  translate(x: number, y: number): void { this.e += this.a * x + this.c * y; this.f += this.b * x + this.d * y; }
  scale(x: number, y: number): void { this.a *= x; this.b *= x; this.c *= y; this.d *= y; }
  rotate(angle: number): void {
    const cs = Math.cos(angle), sn = Math.sin(angle);
    const a = this.a * cs + this.c * sn, b = this.b * cs + this.d * sn;
    this.c = this.c * cs - this.a * sn; this.d = this.d * cs - this.b * sn;
    this.a = a; this.b = b;
  }
  transform(a: number, b: number, c: number, d: number, e: number, f: number): void {
    const na = this.a * a + this.c * b, nb = this.b * a + this.d * b;
    const nc = this.a * c + this.c * d, nd = this.b * c + this.d * d;
    this.e += this.a * e + this.c * f; this.f += this.b * e + this.d * f;
    this.a = na; this.b = nb; this.c = nc; this.d = nd;
  }
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void {
    this.a = a; this.b = b; this.c = c; this.d = d; this.e = e; this.f = f;
  }
  resetTransform(): void { this.setTransform(1, 0, 0, 1, 0, 0); }
  getTransform(): DOMMatrix {
    const m = new DOMMatrix();
    m.a = this.a; m.b = this.b; m.c = this.c; m.d = this.d; m.e = this.e; m.f = this.f;
    return m;
  }
  private scaleFactor(): number { return Math.sqrt(Math.abs(this.a * this.d - this.b * this.c)); }
  private tx(x: number, y: number): number { return this.a * x + this.c * y + this.e + this.ox; }
  private ty(x: number, y: number): number { return this.b * x + this.d * y + this.f + this.oy; }

  // ------------------------------------------------ paths (points are transformed when added, like the web)
  beginPath(): void { this.subs.length = 0; this.closed.length = 0; this.hasPoint = false; }
  moveTo(x: number, y: number): void {
    this.subs.push([this.tx(x, y), this.ty(x, y)]);
    this.closed.push(false);
    this.cx = x; this.cy = y; this.sx = x; this.sy = y; this.hasPoint = true;
  }
  lineTo(x: number, y: number): void {
    if (!this.hasPoint) { this.moveTo(x, y); return; }
    const p = this.subs[this.subs.length - 1];
    p.push(this.tx(x, y)); p.push(this.ty(x, y));
    this.cx = x; this.cy = y;
  }
  closePath(): void {
    if (!this.hasPoint) return;
    this.closed[this.closed.length - 1] = true;
    this.moveTo(this.sx, this.sy);  // the next segment starts a new subpath at the start point
  }
  private segments(len: number): i32 { return Math.max(2, Math.min(100, Math.ceil(Math.sqrt(len * this.scaleFactor()) * 1.4))); }
  quadraticCurveTo(qx: number, qy: number, x: number, y: number): void {
    if (!this.hasPoint) this.moveTo(qx, qy);
    const x0 = this.cx, y0 = this.cy;
    const n = this.segments(Math.hypot(qx - x0, qy - y0) + Math.hypot(x - qx, y - qy));
    for (let i = 1; i <= n; i++) {
      const t = i / n, u = 1 - t;
      this.lineTo(u * u * x0 + 2 * u * t * qx + t * t * x, u * u * y0 + 2 * u * t * qy + t * t * y);
    }
  }
  bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): void {
    if (!this.hasPoint) this.moveTo(c1x, c1y);
    const x0 = this.cx, y0 = this.cy;
    const n = this.segments(Math.hypot(c1x - x0, c1y - y0) + Math.hypot(c2x - c1x, c2y - c1y) + Math.hypot(x - c2x, y - c2y));
    for (let i = 1; i <= n; i++) {
      const t = i / n, u = 1 - t;
      const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
      this.lineTo(a * x0 + b * c1x + c * c2x + d * x, a * y0 + b * c1y + c * c2y + d * y);
    }
  }
  arc(x: number, y: number, r: number, start: number, end: number, anticlockwise: boolean = false): void {
    this.ellipse(x, y, r, r, 0, start, end, anticlockwise);
  }
  ellipse(x: number, y: number, rx: number, ry: number, rotation: number, start: number, end: number, anticlockwise: boolean = false): void {
    if (rx < 0 || ry < 0) return;
    const TAU = Math.PI * 2;
    let sweep = end - start;
    if (!anticlockwise) sweep = sweep >= TAU ? TAU : ((sweep % TAU) + TAU) % TAU;
    else sweep = -sweep >= TAU ? -TAU : -((((start - end) % TAU) + TAU) % TAU);
    // segments for ~0.25 px of error at the device radius
    const rd = Math.max(rx, ry) * this.scaleFactor();
    const step = rd > 0.5 ? 2 * Math.atan2(Math.sqrt(Math.max(0, 1 - (1 - 0.25 / rd) * (1 - 0.25 / rd))), 1 - 0.25 / rd) : TAU / 4;
    const n: i32 = Math.max(2, Math.min(512, Math.ceil(Math.abs(sweep) / Math.max(step, 0.01))));
    const cr = Math.cos(rotation), sr = Math.sin(rotation);
    for (let i = 0; i <= n; i++) {
      const t = start + sweep * i / n, ex = Math.cos(t) * rx, ey = Math.sin(t) * ry;
      const px = x + ex * cr - ey * sr, py = y + ex * sr + ey * cr;
      if (i === 0) { if (this.hasPoint) this.lineTo(px, py); else this.moveTo(px, py); }
      else this.lineTo(px, py);
    }
  }
  arcTo(x1: number, y1: number, x2: number, y2: number, r: number): void {
    if (!this.hasPoint) this.moveTo(x1, y1);
    const x0 = this.cx, y0 = this.cy;
    const ax = x0 - x1, ay = y0 - y1, bx = x2 - x1, by = y2 - y1;
    const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
    const cross = ax * by - ay * bx;
    if (r <= 0 || la === 0 || lb === 0 || Math.abs(cross) < 1e-9) { this.lineTo(x1, y1); return; }
    const cosT = (ax * bx + ay * by) / (la * lb);
    const half = Math.atan2(Math.sqrt(Math.max(0, 1 - cosT * cosT)), cosT) / 2;  // half the angle at the corner
    const dist = r / Math.tan(half);
    const tx0 = x1 + ax / la * dist, ty0 = y1 + ay / la * dist, tx1 = x1 + bx / lb * dist, ty1 = y1 + by / lb * dist;
    // centre along the bisector
    const mx = ax / la + bx / lb, my = ay / la + by / lb, ml = Math.hypot(mx, my), cd = r / Math.sin(half);
    const ccx = x1 + mx / ml * cd, ccy = y1 + my / ml * cd;
    this.lineTo(tx0, ty0);
    const a0 = Math.atan2(ty0 - ccy, tx0 - ccx), a1 = Math.atan2(ty1 - ccy, tx1 - ccx);
    this.arc(ccx, ccy, r, a0, a1, cross > 0);
  }
  rect(x: number, y: number, w: number, h: number): void {
    this.moveTo(x, y); this.lineTo(x + w, y); this.lineTo(x + w, y + h); this.lineTo(x, y + h);
    this.closePath();
  }
  /** Rounded rectangle with one radius for every corner (the web also takes per-corner radii). */
  roundRect(x: number, y: number, w: number, h: number, radius: number = 0): void {
    const r = Math.min(Math.abs(radius), Math.min(Math.abs(w), Math.abs(h)) / 2);
    if (r <= 0) { this.rect(x, y, w, h); return; }
    const sx = w < 0 ? -1 : 1, sy = h < 0 ? -1 : 1;
    this.moveTo(x + r * sx, y);
    this.arcTo(x + w, y, x + w, y + h, r);
    this.arcTo(x + w, y + h, x, y + h, r);
    this.arcTo(x, y + h, x, y, r);
    this.arcTo(x, y, x + w, y, r);
    this.closePath();
  }

  // ------------------------------------------------ fill, stroke, clip
  /** 'nonzero' (default) or 'evenodd' */
  fill(rule: string = 'nonzero'): void {
    const out: number[] = [];
    for (const p of this.subs) {
      if (p.length < 6) continue;
      out.push(p.length / 2);
      for (const v of p) out.push(v);
    }
    this.paint(out, true, rule === 'evenodd');
  }
  stroke(): void { this.paint(this.strokeContours(), false, false); }
  /** The stroke of the current path as filled contours [count, x, y, ...]* (screen coordinates). */
  strokeContours(): number[] {
    const hw = this.lineWidth * this.scaleFactor() / 2;
    const out: number[] = [];
    if (!(hw > 0)) return out;
    for (let i = 0; i < this.subs.length; i++) {
      const p = this.subs[i];
      if (this.dash.length === 0) { strokePoly(p, this.closed[i], hw, this.lineCap, this.lineJoin, this.miterLimit, out); continue; }
      for (const piece of dashes(p, this.closed[i], this.dash, this.lineDashOffset, this.scaleFactor())) strokePoly(piece, false, hw, this.lineCap, this.lineJoin, this.miterLimit, out);
    }
    return out;
  }
  /** Hit test of the current path's fill; (x, y) in canvas pixels (not transformed), like the web. */
  isPointInPath(x: number, y: number, rule: string = 'nonzero'): boolean {
    const out: number[] = [];
    for (const p of this.subs) { if (p.length < 6) continue; out.push(p.length / 2); for (const v of p) out.push(v); }
    return inside(out, x + this.ox, y + this.oy, rule === 'evenodd');
  }
  /** Hit test of the current path's stroke outline (lineWidth, caps, joins, dashes). */
  isPointInStroke(x: number, y: number): boolean { return inside(this.strokeContours(), x + this.ox, y + this.oy, false); }
  /** Clips to the bounding box of the current path (an exact clip for rectangles). */
  clip(): void {
    let x0 = 1e30, y0 = 1e30, x1 = -1e30, y1 = -1e30;
    for (const p of this.subs) {
      for (let i = 0; i + 1 < p.length; i += 2) { x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]); y0 = Math.min(y0, p[i + 1]); y1 = Math.max(y1, p[i + 1]); }
    }
    if (x0 > x1) { x0 = 0; y0 = 0; x1 = 0; y1 = 0; }
    gfxClip(x0, y0, x1 - x0, y1 - y0);
    this.clips++;
  }
  fillRect(x: number, y: number, w: number, h: number): void {
    if (this.b === 0 && this.c === 0 && this.fillGradient === null) {  // axis-aligned: one rectangle command
      const c = this.color(true);
      const x0 = this.tx(x, y), y0 = this.ty(x, y), x1 = this.tx(x + w, y + h), y1 = this.ty(x + w, y + h);
      const al = Math.round(Math.floor(c / 16777216) * this.globalAlpha);
      if (al > 0) rrect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0), 0, c % 16777216, al);
      return;
    }
    this.withPath(() => { this.rect(x, y, w, h); this.fill(); });
  }
  strokeRect(x: number, y: number, w: number, h: number): void { this.withPath(() => { this.rect(x, y, w, h); this.stroke(); }); }
  clearRect(x: number, y: number, w: number, h: number): void {
    let c = parseColor(this.clearColor);
    if (c <= 0 && this.image < 0) return;
    if (c < 0) c = 255 * 16777216;
    const x0 = this.tx(x, y), y0 = this.ty(x, y), x1 = this.tx(x + w, y + h), y1 = this.ty(x + w, y + h);
    rrect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0), 0, c % 16777216, 255);
  }
  setLineDash(segments: number[]): void {
    const d: number[] = [];
    for (const v of segments) { if (v < 0 || isNaN(v)) return; d.push(v); }
    if (d.length % 2 === 1) for (let i = 0, n = d.length; i < n; i++) d.push(d[i]);
    const empty: number[] = [];
    this.dash = d.every((v: number) => v === 0) ? empty : d;
  }
  getLineDash(): number[] { return this.dash.slice(); }

  // ------------------------------------------------ gradients
  createLinearGradient(x0: number, y0: number, x1: number, y1: number): CanvasGradient { return new CanvasGradient(1, x0, y0, 0, x1, y1, 0); }
  createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): CanvasGradient { return new CanvasGradient(2, x0, y0, r0, x1, y1, r1); }

  // ------------------------------------------------ text
  fillText(text: string, x: number, y: number, maxWidth: number = NaN): void { this.text(text, x, y, true); }
  /** Approximation: the glyphs are filled with the stroke style (no outline). */
  strokeText(text: string, x: number, y: number, maxWidth: number = NaN): void { this.text(text, x, y, false); }
  measureText(text: string): TextMetrics {
    const m = new TextMetrics();
    const k = this.scaleFactor();
    const f = this.fontFor(k);
    m.width = textWidth(f, text, 0) / k;  // user units, measured with the font drawn at this scale
    const asc = fontAscent(f) / k, desc = (lineHeight(f) - fontAscent(f)) / k;
    m.actualBoundingBoxRight = m.width;
    m.actualBoundingBoxAscent = asc; m.actualBoundingBoxDescent = desc;
    m.fontBoundingBoxAscent = asc; m.fontBoundingBoxDescent = desc;
    return m;
  }

  // ------------------------------------------------ images
  /** drawImage(image, dx, dy), (image, dx, dy, dw, dh) or (image, sx, sy, sw, sh, dx, dy, dw, dh). `image` is a gfx
   *  image id (gfx.image('x.png'), gfx.createImage, canvas.image). Rotation and skew are not applied to images. */
  drawImage(image: i32, a: number, b: number, c: number = NaN, d: number = NaN, e: number = NaN, f: number = NaN, g: number = NaN, h: number = NaN): void {
    const iw = imageWidth(image), ih = imageHeight(image);
    if (iw <= 0 || ih <= 0) return;
    let sx = 0, sy = 0, sw: number = iw, sh: number = ih, dx = a, dy = b, dw: number = iw, dh: number = ih;
    if (!isNaN(h)) { sx = a; sy = b; sw = c; sh = d; dx = e; dy = f; dw = g; dh = h; }
    else if (!isNaN(d)) { dw = c; dh = d; }
    if (sw === 0 || sh === 0 || dw === 0 || dh === 0) return;
    const kx = Math.hypot(this.a, this.b), ky = Math.hypot(this.c, this.d);
    const cxd = this.tx(dx + dw / 2, dy + dh / 2), cyd = this.ty(dx + dw / 2, dy + dh / 2);
    const w = Math.abs(dw) * kx, hh = Math.abs(dh) * ky, x0 = cxd - w / 2, y0 = cyd - hh / 2;
    const al: i32 = Math.round(255 * Math.min(1, Math.max(0, this.globalAlpha)));
    const smooth = this.imageSmoothingEnabled;
    if (sx === 0 && sy === 0 && sw === iw && sh === ih) { N.image(image, x0, y0, w, hh, al, smooth); return; }
    // source rectangle: clip to the destination, draw the whole image scaled so the source maps onto it
    const fx = w / sw, fy = hh / sh;
    gfxClip(x0, y0, w, hh);
    N.image(image, x0 - sx * fx, y0 - sy * fy, iw * fx, ih * fy, al, smooth);
    unclip();
  }

  // ------------------------------------------------ internals
  private withPath(f: () => void): void {
    const subs = this.subs, closed = this.closed, cx = this.cx, cy = this.cy, sx = this.sx, sy = this.sy, has = this.hasPoint;
    this.subs = []; this.closed = []; this.hasPoint = false;
    f();
    this.subs = subs; this.closed = closed; this.cx = cx; this.cy = cy; this.sx = sx; this.sy = sy; this.hasPoint = has;
  }
  /** alpha * 2^24 + rgb of the fill or stroke colour (parsed once per distinct string). */
  private color(fill: boolean): number {
    const s = fill ? this.fillCss : this.strokeCss;
    if (fill) {
      if (s !== this.fillKey) { this.fillKey = s; const v = parseColor(s); this.fillVal = v < 0 ? 255 * 16777216 : v; }
      return this.fillVal;
    }
    if (s !== this.strokeKey) { this.strokeKey = s; const v = parseColor(s); this.strokeVal = v < 0 ? 255 * 16777216 : v; }
    return this.strokeVal;
  }
  private paint(contours: number[], fill: boolean, evenodd: boolean): void {
    if (contours.length < 7) return;
    const g = fill ? this.fillGradient : this.strokeGradient;
    const ga = Math.min(1, Math.max(0, this.globalAlpha));
    if (g === null || g.stops.length === 0) {
      const c = this.color(fill);
      const al: i32 = Math.round(Math.floor(c / 16777216) * ga);
      if (al > 0) N.fill(contours, c % 16777216, al, evenodd, []);
      return;
    }
    // gradient geometry in device space (radii scaled by the transform's mean scale)
    const k = this.scaleFactor();
    const p: number[] = [g.kind, this.tx(g.x0, g.y0), this.ty(g.x0, g.y0), g.r0 * k, this.tx(g.x1, g.y1), this.ty(g.x1, g.y1), g.r1 * k, g.stops.length / 3];
    for (const v of g.stops) p.push(v);
    N.fill(contours, 0, Math.round(255 * ga), evenodd, p);
  }
  /** gfx font for the current `font` at `scale` device pixels per user unit. */
  private fontFor(scale: number): i32 {
    const key = this.font + '@' + scale.toFixed(3);
    if (key === this.fontKey) return this.fontId;
    let px = 10, bold = false, mono = false, family = '';
    for (const w of this.font.replaceAll(',', ' ').split(' ')) {
      const t = w.trim().toLowerCase().replaceAll('"', '').replaceAll('\'', '');
      if (t.length === 0) continue;
      if (t === 'bold' || t === 'bolder' || t === '600' || t === '700' || t === '800' || t === '900') bold = true;
      else if (t.endsWith('px') && !isNaN(parseFloat(t))) px = parseFloat(t.slice(0, t.indexOf('px')));
      else if (t.endsWith('pt') && !isNaN(parseFloat(t))) px = parseFloat(t) * 4 / 3;
      else if (t.includes('mono') || t === 'courier' || t === 'consolas' || t === 'menlo') mono = true;
      else if (family.length === 0 && t !== 'italic' && t !== 'normal' && t !== 'oblique' && t !== 'sans-serif' && t !== 'serif' && isNaN(parseFloat(t))) family = w.trim();
    }
    const size: i32 = Math.max(1, Math.round(px * scale));
    let f: i32 = -1;
    if (family.length > 0) f = gfxFont(family, size);
    if (f < 0 && mono) f = gfxFont('mono', size);
    if (f < 0) f = gfxFont(bold ? 'sans-bold' : 'sans', size);
    this.fontKey = key; this.fontId = f;
    return f;
  }
  private text(s: string, x: number, y: number, fill: boolean): void {
    const k = this.scaleFactor();
    const f = this.fontFor(k);
    if (f < 0) return;
    const g = fill ? this.fillGradient : this.strokeGradient;
    let c = this.color(fill);
    if (g !== null && g.stops.length >= 3) c = g.stops[2] * 16777216 + g.stops[1];  // gradients: the first stop's colour
    const al: i32 = Math.round(Math.floor(c / 16777216) * Math.min(1, Math.max(0, this.globalAlpha)));
    if (al <= 0) return;
    const w = textWidth(f, s, 0), asc = fontAscent(f), lh = lineHeight(f);
    let px = this.tx(x, y), py = this.ty(x, y);
    const al2 = this.textAlign;
    if (al2 === 'center') px -= w / 2;
    else if (al2 === 'right' || al2 === 'end') px -= w;
    const bl = this.textBaseline;
    if (bl === 'alphabetic') py -= asc;
    else if (bl === 'middle') py -= lh / 2;
    else if (bl === 'bottom' || bl === 'ideographic') py -= lh;
    drawText(f, px, py, s, c % 16777216, al, 0);
  }
}

/** Winding test of (x, y) against contours [count, x, y, ...]*. */
function inside(c: number[], x: number, y: number, evenodd: boolean): boolean {
  let wind = 0;
  for (let i = 0; i < c.length;) {
    const n = c[i], p = i + 1;
    for (let k = 0; k < n; k++) {
      const j = (k + 1) % n;
      const ax = c[p + k * 2], ay = c[p + k * 2 + 1], bx = c[p + j * 2], by = c[p + j * 2 + 1];
      if ((ay <= y) !== (by <= y)) {
        const cx = ax + (y - ay) * (bx - ax) / (by - ay);
        if (cx > x) wind += by > ay ? 1 : -1;
      }
    }
    i = p + n * 2;
  }
  return evenodd ? wind % 2 !== 0 : wind !== 0;
}

// ---------------------------------------------------------------- stroking (device space)
/** Appends a polygon [n, x, y, ...] to `out`, counter-clockwise on screen (positive winding), so overlapping pieces
 *  of one stroke add up under the nonzero rule. */
function piece(pts: number[], out: number[]): void {
  const n = pts.length / 2;
  if (n < 3) return;
  let area = 0;
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; area += pts[i * 2] * pts[j * 2 + 1] - pts[j * 2] * pts[i * 2 + 1]; }
  if (Math.abs(area) < 1e-6) return;
  out.push(n);
  if (area > 0) { for (const v of pts) out.push(v); return; }
  for (let i = n - 1; i >= 0; i--) { out.push(pts[i * 2]); out.push(pts[i * 2 + 1]); }
}
function disc(x: number, y: number, r: number, out: number[]): void {
  const n: i32 = Math.max(8, Math.min(48, Math.ceil(r * 2.5)));
  const p: number[] = [];
  for (let i = 0; i < n; i++) { const t = Math.PI * 2 * i / n; p.push(x + Math.cos(t) * r); p.push(y + Math.sin(t) * r); }
  piece(p, out);
}
function strokePoly(src: number[], isClosed: boolean, hw: number, cap: string, join: string, miterLimit: number, out: number[]): void {
  let closed = isClosed;
  // drop repeated points
  const p: number[] = [];
  for (let i = 0; i + 1 < src.length; i += 2) {
    const n = p.length;
    if (n >= 2 && Math.abs(p[n - 2] - src[i]) < 1e-6 && Math.abs(p[n - 1] - src[i + 1]) < 1e-6) continue;
    p.push(src[i]); p.push(src[i + 1]);
  }
  let n = p.length / 2;
  // ends that meet (full arcs) are joined like a closed path, so no wedge opens between the flattened end segments
  if (n > 3 && Math.abs(p[0] - p[n * 2 - 2]) < 1e-3 && Math.abs(p[1] - p[n * 2 - 1]) < 1e-3) { p.length = p.length - 2; n--; closed = true; }
  if (n === 1) {
    if (cap === 'round') disc(p[0], p[1], hw, out);
    else if (cap === 'square') piece([p[0] - hw, p[1] - hw, p[0] + hw, p[1] - hw, p[0] + hw, p[1] + hw, p[0] - hw, p[1] + hw], out);
    return;
  }
  if (n < 2) return;
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const j = (i + 1) % n;
    const x0 = p[i * 2], y0 = p[i * 2 + 1], x1 = p[j * 2], y1 = p[j * 2 + 1];
    const len = Math.hypot(x1 - x0, y1 - y0), nx = -(y1 - y0) / len * hw, ny = (x1 - x0) / len * hw;
    piece([x0 + nx, y0 + ny, x1 + nx, y1 + ny, x1 - nx, y1 - ny, x0 - nx, y0 - ny], out);
  }
  // joins
  const first = closed ? 0 : 1, last = closed ? n - 1 : n - 2;
  for (let v = first; v <= last; v++) {
    const pv = (v - 1 + n) % n, nv = (v + 1) % n;
    const x = p[v * 2], y = p[v * 2 + 1];
    let d1x = x - p[pv * 2], d1y = y - p[pv * 2 + 1], d2x = p[nv * 2] - x, d2y = p[nv * 2 + 1] - y;
    const l1 = Math.hypot(d1x, d1y), l2 = Math.hypot(d2x, d2y);
    d1x /= l1; d1y /= l1; d2x /= l2; d2y /= l2;
    const cross = d1x * d2y - d1y * d2x, dot = d1x * d2x + d1y * d2y;
    if (Math.abs(cross) < 1e-6 && dot > 0) continue;
    if (join === 'round') { disc(x, y, hw, out); continue; }
    const s = cross > 0 ? -1 : 1;  // outer side
    const ax = x - d1y * hw * s, ay = y + d1x * hw * s, bx = x - d2y * hw * s, by = y + d2x * hw * s;
    const ratio = 1 / Math.sqrt(Math.max(1e-9, (1 + dot) / 2));
    if (join === 'miter' && ratio <= miterLimit) {
      let mx = -d1y - d2y, my = d1x + d2x;
      const ml = Math.hypot(mx, my);
      mx = mx / ml * hw * ratio * s; my = my / ml * hw * ratio * s;
      piece([x, y, ax, ay, x + mx, y + my, bx, by], out);
    } else piece([x, y, ax, ay, bx, by], out);
  }
  if (closed) return;
  // caps
  for (let e = 0; e < 2; e++) {
    const i = e === 0 ? 0 : n - 1, k = e === 0 ? 1 : n - 2;
    const x = p[i * 2], y = p[i * 2 + 1];
    if (cap === 'round') { disc(x, y, hw, out); continue; }
    if (cap !== 'square') continue;
    const dl = Math.hypot(x - p[k * 2], y - p[k * 2 + 1]);
    const dx = (x - p[k * 2]) / dl * hw, dy = (y - p[k * 2 + 1]) / dl * hw;
    piece([x - dy, y + dx, x + dx - dy, y + dy + dx, x + dx + dy, y + dy - dx, x + dy, y - dx], out);
  }
}
/** Splits a polyline along a dash pattern (user units, scaled to device pixels by `k`). */
function dashes(p: number[], closed: boolean, pattern: number[], offset: number, k: number): number[][] {
  const pts = p.slice();
  if (closed && pts.length >= 4) { pts.push(pts[0]); pts.push(pts[1]); }
  let total = 0;
  for (const v of pattern) total += v * k;
  const out: number[][] = [];
  if (total <= 0) return out;
  let idx: i32 = 0, left = 0, on = true;
  let o = ((offset * k) % total + total) % total;
  while (o > 0) {  // skip the offset into the pattern
    const len = pattern[idx] * k;
    if (o < len) { left = len - o; break; }
    o -= len; idx = (idx + 1) % pattern.length;
  }
  if (left === 0) left = pattern[idx] * k;
  on = idx % 2 === 0;
  let cur: number[] = on ? [pts[0], pts[1]] : [];
  for (let i = 2; i + 1 < pts.length; i += 2) {
    let x0 = pts[i - 2], y0 = pts[i - 1];
    const x1 = pts[i], y1 = pts[i + 1];
    let seg = Math.hypot(x1 - x0, y1 - y0);
    while (seg > left) {
      const t = left / seg;
      x0 = x0 + (x1 - x0) * t; y0 = y0 + (y1 - y0) * t; seg -= left;
      if (on) { cur.push(x0); cur.push(y0); out.push(cur); cur = []; }
      else cur = [x0, y0];
      on = !on;
      idx = (idx + 1) % pattern.length;
      left = pattern[idx] * k;
    }
    left -= seg;
    if (on) { cur.push(x1); cur.push(y1); }
  }
  if (on && cur.length >= 4) out.push(cur);
  return out;
}

// ---------------------------------------------------------------- canvases with their own pixels
/** An offscreen canvas: a runtime image whose pixels persist between frames (trails, paint programs, textures for
 *  zinc:3d or three). Draw it with gfx.drawImage(canvas.image, ...) or ctx.drawImage(canvas.image, ...). */
export class Canvas {
  readonly width: i32;
  readonly height: i32;
  readonly image: i32;
  private ctx: CanvasRenderingContext2D | null = null;
  constructor(width: i32, height: i32) {
    this.width = width; this.height = height;
    this.image = createImage(width, height);
  }
  /** The context drawing into this canvas ('2d' only); wrap drawing in ctx.begin() / ctx.end(). */
  getContext(kind: string = '2d'): CanvasRenderingContext2D {
    const c = this.ctx ?? new CanvasRenderingContext2D(this.image);
    this.ctx = c;
    return c;
  }
  dispose(): void { destroyImage(this.image); }
}
