// Build-time resources (UI-10, RT-14): fonts are rasterized from TrueType into anti-aliased glyph bitmaps for
// the sizes and characters the program uses (baked type, like PocketJS), images are decoded (PNG) or rasterized
// (SVG subset) to RGBA. Everything becomes constant data in zinc_resources.cpp; the sim gets the same metrics.
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as zlib from 'node:zlib';
import { ZINC_ROOT } from './frontend.ts';

// ---------------------------------------------------------------- geometry + scanline rasterizer
export type Pt = [number, number];
export type Poly = Pt[];

/** Nonzero-winding coverage with 4x4 supersampling; returns 0..255 alpha for a w x h box. */
export function rasterize(polys: Poly[], w: number, h: number): Uint8Array {
  const S = 4, out = new Uint8Array(w * h);
  const edges: { x0: number; y0: number; x1: number; y1: number; dir: number }[] = [];
  for (const p of polys) for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length];
    if (a[1] === b[1]) continue;
    edges.push(a[1] < b[1] ? { x0: a[0], y0: a[1], x1: b[0], y1: b[1], dir: 1 } : { x0: b[0], y0: b[1], x1: a[0], y1: a[1], dir: -1 });
  }
  const acc = new Uint16Array(w * h);
  for (let sy = 0; sy < h * S; sy++) {
    const y = (sy + 0.5) / S;
    const xs: { x: number; d: number }[] = [];
    for (const e of edges) if (y >= e.y0 && y < e.y1) xs.push({ x: e.x0 + (y - e.y0) * (e.x1 - e.x0) / (e.y1 - e.y0), d: e.dir });
    if (!xs.length) continue;
    xs.sort((a, b) => a.x - b.x);
    let wind = 0;
    const row = Math.floor(sy / S) * w;
    for (let k = 0; k < xs.length - 1; k++) {
      wind += xs[k].d;
      if (wind === 0) continue;
      const from = Math.max(0, Math.ceil(xs[k].x * S - 0.5)), to = Math.min(w * S - 1, Math.floor(xs[k + 1].x * S - 0.5));
      for (let sx = from; sx <= to; sx++) acc[row + (sx >> 2)]++;
    }
  }
  for (let i = 0; i < w * h; i++) out[i] = Math.min(255, Math.round(acc[i] * 255 / (S * S)));
  return out;
}

function quad(out: Pt[], a: Pt, c: Pt, b: Pt, n = 8) {
  for (let i = 1; i <= n; i++) { const t = i / n, u = 1 - t; out.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]); }
}
function cubic(out: Pt[], a: Pt, c1: Pt, c2: Pt, b: Pt, n = 12) {
  for (let i = 1; i <= n; i++) {
    const t = i / n, u = 1 - t;
    out.push([u * u * u * a[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * b[0], u * u * u * a[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * b[1]]);
  }
}

// ---------------------------------------------------------------- TrueType
interface TTF { unitsPerEm: number; ascent: number; descent: number; lineGap: number; cmap: Map<number, number>; glyph(g: number): Poly[]; advance(g: number): number }

export function parseTTF(buf: Buffer): TTF {
  const tables = new Map<string, number>();
  const n = buf.readUInt16BE(4);
  for (let i = 0; i < n; i++) { const o = 12 + i * 16; tables.set(buf.toString('latin1', o, o + 4), buf.readUInt32BE(o + 8)); }
  const t = (name: string) => { const o = tables.get(name); if (o === undefined) throw new Error(`font: missing table ${name}`); return o; };
  const head = t('head'), hhea = t('hhea'), maxp = t('maxp'), hmtx = t('hmtx'), loca = t('loca'), glyf = t('glyf'), cmapT = t('cmap');
  const unitsPerEm = buf.readUInt16BE(head + 18), longLoca = buf.readInt16BE(head + 50) === 1;
  const numGlyphs = buf.readUInt16BE(maxp + 4), numH = buf.readUInt16BE(hhea + 34);
  const cmap = new Map<number, number>();
  const nsub = buf.readUInt16BE(cmapT + 2);
  let best = -1, bestFmt = 0;
  for (let i = 0; i < nsub; i++) {
    const pid = buf.readUInt16BE(cmapT + 4 + i * 8), eid = buf.readUInt16BE(cmapT + 6 + i * 8), off = cmapT + buf.readUInt32BE(cmapT + 8 + i * 8);
    const fmt = buf.readUInt16BE(off);
    if ((pid === 3 && (eid === 10 || eid === 1)) || pid === 0) if (fmt === 12 || (fmt === 4 && bestFmt !== 12)) { best = off; bestFmt = fmt; }
  }
  if (bestFmt === 4) {
    const segs = buf.readUInt16BE(best + 6) / 2, ends = best + 14, starts = ends + segs * 2 + 2, deltas = starts + segs * 2, ranges = deltas + segs * 2;
    for (let s = 0; s < segs; s++) {
      const end = buf.readUInt16BE(ends + s * 2), start = buf.readUInt16BE(starts + s * 2), delta = buf.readInt16BE(deltas + s * 2), ro = buf.readUInt16BE(ranges + s * 2);
      for (let c = start; c <= end && c !== 0xffff; c++) {
        let g = 0;
        if (!ro) g = (c + delta) & 0xffff;
        else { const gi = ranges + s * 2 + ro + (c - start) * 2; g = buf.readUInt16BE(gi); if (g) g = (g + delta) & 0xffff; }
        if (g) cmap.set(c, g);
      }
    }
  } else if (bestFmt === 12) {
    const ng = buf.readUInt32BE(best + 12);
    for (let i = 0; i < ng; i++) {
      const o = best + 16 + i * 12, s = buf.readUInt32BE(o), e = buf.readUInt32BE(o + 4), g0 = buf.readUInt32BE(o + 8);
      for (let c = s; c <= e && c < 0x30000; c++) cmap.set(c, g0 + c - s);
    }
  }
  const locOf = (g: number) => longLoca ? buf.readUInt32BE(loca + g * 4) : buf.readUInt16BE(loca + g * 2) * 2;
  const glyph = (g: number, depth = 0): Poly[] => {
    if (g >= numGlyphs || depth > 4) return [];
    const o = glyf + locOf(g);
    if (locOf(g + 1) === locOf(g)) return [];
    const nc = buf.readInt16BE(o);
    if (nc < 0) {  // composite: offsets (+ uniform scale)
      const polys: Poly[] = [];
      let p = o + 10, flags = 0;
      do {
        flags = buf.readUInt16BE(p); const gi = buf.readUInt16BE(p + 2); p += 4;
        let dx = 0, dy = 0;
        if (flags & 1) { dx = buf.readInt16BE(p); dy = buf.readInt16BE(p + 2); p += 4; } else { dx = buf.readInt8(p); dy = buf.readInt8(p + 1); p += 2; }
        let sx = 1, sy = 1;
        if (flags & 8) { sx = sy = buf.readInt16BE(p) / 16384; p += 2; }
        else if (flags & 0x40) { sx = buf.readInt16BE(p) / 16384; sy = buf.readInt16BE(p + 2) / 16384; p += 4; }
        else if (flags & 0x80) { sx = buf.readInt16BE(p) / 16384; sy = buf.readInt16BE(p + 6) / 16384; p += 8; }
        for (const poly of glyph(gi, depth + 1)) polys.push(poly.map(([x, y]) => [x * sx + dx, y * sy + dy] as Pt));
      } while (flags & 0x20);
      return polys;
    }
    const endPts: number[] = [];
    for (let i = 0; i < nc; i++) endPts.push(buf.readUInt16BE(o + 10 + i * 2));
    const npts = nc ? endPts[nc - 1] + 1 : 0;
    let p = o + 10 + nc * 2;
    p += 2 + buf.readUInt16BE(p);
    const fl: number[] = [];
    while (fl.length < npts) { const f = buf[p++]; fl.push(f); if (f & 8) { let r = buf[p++]; while (r--) fl.push(f); } }
    const xs: number[] = [], ys: number[] = [];
    let v = 0;
    for (const f of fl) { if (f & 2) { const d = buf[p++]; v += f & 16 ? d : -d; } else if (!(f & 16)) { v += buf.readInt16BE(p); p += 2; } xs.push(v); }
    v = 0;
    for (const f of fl) { if (f & 4) { const d = buf[p++]; v += f & 32 ? d : -d; } else if (!(f & 32)) { v += buf.readInt16BE(p); p += 2; } ys.push(v); }
    const polys: Poly[] = [];
    let s = 0;
    for (const e of endPts) {
      const pts = [] as { x: number; y: number; on: boolean }[];
      for (let i = s; i <= e; i++) pts.push({ x: xs[i], y: ys[i], on: !!(fl[i] & 1) });
      s = e + 1;
      if (!pts.length) continue;
      // start on an on-curve point (or the midpoint of two off-curve points)
      let k = pts.findIndex(q => q.on);
      let start: Pt;
      if (k < 0) { start = [(pts[0].x + pts[1 % pts.length].x) / 2, (pts[0].y + pts[1 % pts.length].y) / 2]; k = 0; }
      else { start = [pts[k].x, pts[k].y]; k = k + 1; }
      const poly: Pt[] = [start];
      let prev: Pt = start, ctrl: Pt | null = null;
      for (let i = 0; i < pts.length; i++) {
        const q = pts[(k + i) % pts.length];
        if (q.on) { if (ctrl) quad(poly, prev, ctrl, [q.x, q.y]); else poly.push([q.x, q.y]); prev = [q.x, q.y]; ctrl = null; }
        else {
          if (ctrl) { const mid: Pt = [(ctrl[0] + q.x) / 2, (ctrl[1] + q.y) / 2]; quad(poly, prev, ctrl, mid); prev = mid; }
          ctrl = [q.x, q.y];
        }
      }
      if (ctrl) quad(poly, prev, ctrl, start);
      polys.push(poly);
    }
    return polys;
  };
  const advance = (g: number) => buf.readUInt16BE(hmtx + Math.min(g, numH - 1) * 4);
  return { unitsPerEm, ascent: buf.readInt16BE(hhea + 4), descent: buf.readInt16BE(hhea + 6), lineGap: buf.readInt16BE(hhea + 8), cmap, glyph, advance };
}

// ---------------------------------------------------------------- baked fonts
export interface BakedGlyph { cp: number; x0: number; y0: number; w: number; h: number; adv: number; off: number }
export interface BakedFont { name: string; px: number; ascent: number; descent: number; lineGap: number; glyphs: BakedGlyph[]; bitmap: number[] }

/** Rasterizes `chars` of a font at `px` pixels. `grid` forces a monospace cell (legacy 8x8 gfx.text). */
export function bakeFont(file: string, name: string, px: number, chars: number[], grid?: { cell: number; threshold: boolean }): BakedFont {
  const ttf = parseTTF(fs.readFileSync(file));
  const scale = px / ttf.unitsPerEm;
  const glyphs: BakedGlyph[] = [];
  const bitmap: number[] = [];
  for (const cp of [...new Set(chars)].sort((a, b) => a - b)) {
    const g = ttf.cmap.get(cp);
    if (g === undefined) continue;
    const polys = ttf.glyph(g).map(p => p.map(([x, y]) => [x * scale, -y * scale] as Pt));
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of polys) for (const [x, y] of p) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
    let adv = Math.round(ttf.advance(g) * scale * 64);
    if (grid) adv = grid.cell * 64;
    if (!polys.length) { glyphs.push({ cp, x0: 0, y0: 0, w: 0, h: 0, adv, off: bitmap.length }); continue; }
    let x0 = Math.floor(minX), y0 = Math.floor(minY);
    if (grid) x0 = Math.min(x0, Math.floor((grid.cell - (maxX - minX)) / 2 - minX + minX));
    const w = Math.ceil(maxX) - x0, h = Math.ceil(maxY) - y0;
    const a = rasterize(polys.map(p => p.map(([x, y]) => [x - x0, y - y0] as Pt)), w, h);
    glyphs.push({ cp, x0, y0, w, h, adv, off: bitmap.length });
    for (const v of a) bitmap.push(grid?.threshold ? (v > 72 ? 255 : 0) : v);
  }
  return { name, px, ascent: Math.round(ttf.ascent * scale), descent: Math.round(-ttf.descent * scale), lineGap: Math.round(ttf.lineGap * scale), glyphs, bitmap };
}

// ---------------------------------------------------------------- images
/** `scale`: pixels per logical pixel (HiDPI bakes); layout uses w/scale x h/scale. */
export interface BakedImage { name: string; w: number; h: number; rgba: Uint8Array; scale: number }

export function decodePNG(buf: Buffer): { w: number; h: number; rgba: Uint8Array } {
  let p = 8, w = 0, h = 0, depth = 8, ctype = 6, pal: Buffer | null = null, trns: Buffer | null = null;
  const idat: Buffer[] = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString('latin1', p + 4, p + 8), data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; ctype = data[9]; if (data[12]) throw new Error('png: interlaced images are not supported'); }
    else if (type === 'PLTE') pal = data;
    else if (type === 'tRNS') trns = data;
    else if (type === 'IDAT') idat.push(data);
    p += 12 + len;
  }
  if (depth !== 8) throw new Error(`png: bit depth ${depth} not supported (use 8-bit)`);
  const ch = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[ctype];
  const raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * ch, img = new Uint8Array(w * h * ch);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1;
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? img[y * stride + x - ch] : 0, b = y ? img[(y - 1) * stride + x] : 0, c = x >= ch && y ? img[(y - 1) * stride + x - ch] : 0;
      let v = raw[src + x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      img[y * stride + x] = v & 255;
    }
  }
  const rgba = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const s = img.subarray(i * ch, i * ch + ch);
    if (ctype === 6) rgba.set(s, i * 4);
    else if (ctype === 2) rgba.set([s[0], s[1], s[2], 255], i * 4);
    else if (ctype === 0) rgba.set([s[0], s[0], s[0], 255], i * 4);
    else if (ctype === 4) rgba.set([s[0], s[0], s[0], s[1]], i * 4);
    else { const k = s[0] * 3; rgba.set([pal![k], pal![k + 1], pal![k + 2], trns && s[0] < trns.length ? trns[s[0]] : 255], i * 4); }
  }
  return { w, h, rgba };
}

/** SVG subset: circle, ellipse, rect (rx), polygon, path (M L H V C S Q T A→line Z, abs/rel), fill, opacity, fill-opacity, translate/scale groups. */
export function rasterizeSVG(text: string, outW?: number): { w: number; h: number; rgba: Uint8Array } {
  const attr = (s: string, n: string) => { const m = new RegExp(`\\b${n}="([^"]*)"`).exec(s); return m ? m[1] : undefined; };
  const svgTag = /<svg\b[^>]*>/.exec(text)![0];
  const vb = (attr(svgTag, 'viewBox') ?? `0 0 ${parseFloat(attr(svgTag, 'width') ?? '64')} ${parseFloat(attr(svgTag, 'height') ?? '64')}`).split(/[\s,]+/).map(Number);
  const iw = parseFloat(attr(svgTag, 'width') ?? String(vb[2])), ih = parseFloat(attr(svgTag, 'height') ?? String(vb[3]));
  const w = Math.round(outW ?? iw), h = Math.round(w * ih / iw), sx = w / vb[2], sy = h / vb[3];
  const rgba = new Float64Array(w * h * 4);
  const color = (c: string | undefined): [number, number, number] | null => {
    if (!c || c === 'none') return null;
    if (c.startsWith('#')) { const x = c.length === 4 ? c.slice(1).split('').map(d => d + d).join('') : c.slice(1); return [parseInt(x.slice(0, 2), 16), parseInt(x.slice(2, 4), 16), parseInt(x.slice(4, 6), 16)]; }
    const named: Record<string, [number, number, number]> = { black: [0, 0, 0], white: [255, 255, 255], red: [255, 0, 0], blue: [0, 0, 255], green: [0, 128, 0] };
    return named[c] ?? [0, 0, 0];
  };
  const stack: [number, number, number, number][] = [[0, 0, 1, 1]];  // translate x, y, scale x, y
  const tagRe = /<(\/?)(\w+)([^>]*?)(\/?)>/g;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(text))) {
    const [, close, tag, rest, selfClose] = m;
    if (tag === 'g') {
      if (close) { stack.pop(); continue; }
      const [tx, ty, ks, kt] = stack[stack.length - 1];
      const tr = attr(rest, 'transform') ?? '';
      const t = /translate\(([-\d.]+)[ ,]*([-\d.]*)\)/.exec(tr), sc = /scale\(([-\d.]+)[ ,]*([-\d.]*)\)/.exec(tr);
      const nx = t ? parseFloat(t[1]) : 0, ny = t ? parseFloat(t[2] || '0') : 0, s1 = sc ? parseFloat(sc[1]) : 1, s2 = sc ? parseFloat(sc[2] || sc[1]) : 1;
      if (!selfClose) stack.push([tx + nx * ks, ty + ny * kt, ks * s1, kt * s2]);
      continue;
    }
    if (close) continue;
    const fill = color(attr(rest, 'fill') ?? 'black');
    if (!fill) continue;
    const op = parseFloat(attr(rest, 'opacity') ?? '1') * parseFloat(attr(rest, 'fill-opacity') ?? '1');
    const [tx, ty, ks, kt] = stack[stack.length - 1];
    const P = (x: number, y: number): Pt => [((x * ks + tx) - vb[0]) * sx, ((y * kt + ty) - vb[1]) * sy];
    const num = (n: string) => parseFloat(attr(rest, n) ?? '0');
    let polys: Poly[] = [];
    if (tag === 'circle' || tag === 'ellipse') {
      const cx = num('cx'), cy = num('cy'), rx = tag === 'circle' ? num('r') : num('rx'), ry = tag === 'circle' ? num('r') : num('ry');
      const pts: Pt[] = [];
      for (let i = 0; i < 64; i++) pts.push(P(cx + rx * Math.cos(i / 64 * Math.PI * 2), cy + ry * Math.sin(i / 64 * Math.PI * 2)));
      polys = [pts];
    } else if (tag === 'rect') {
      const x = num('x'), y = num('y'), rw = num('width'), rh = num('height'), r = Math.min(num('rx') || num('ry'), rw / 2, rh / 2);
      const pts: Pt[] = [];
      const corner = (cx: number, cy: number, a0: number) => { for (let i = 0; i <= 8; i++) { const a = a0 + i / 8 * Math.PI / 2; pts.push(P(cx + r * Math.cos(a), cy + r * Math.sin(a))); } };
      if (r > 0) { corner(x + rw - r, y + r, -Math.PI / 2); corner(x + rw - r, y + rh - r, 0); corner(x + r, y + rh - r, Math.PI / 2); corner(x + r, y + r, Math.PI); }
      else pts.push(P(x, y), P(x + rw, y), P(x + rw, y + rh), P(x, y + rh));
      polys = [pts];
    } else if (tag === 'polygon') {
      const v = (attr(rest, 'points') ?? '').trim().split(/[\s,]+/).map(Number), pts: Pt[] = [];
      for (let i = 0; i + 1 < v.length; i += 2) pts.push(P(v[i], v[i + 1]));
      polys = [pts];
    } else if (tag === 'path') polys = svgPath(attr(rest, 'd') ?? '').map(p => p.map(([x, y]) => P(x, y)));
    else continue;
    const cov = rasterize(polys, w, h);
    for (let i = 0; i < w * h; i++) {
      const a = cov[i] / 255 * op;
      if (!a) continue;
      const da = rgba[i * 4 + 3], oa = a + da * (1 - a);
      for (let k = 0; k < 3; k++) rgba[i * 4 + k] = (fill[k] * a + rgba[i * 4 + k] * da * (1 - a)) / oa;
      rgba[i * 4 + 3] = oa;
    }
  }
  const out = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) { for (let k = 0; k < 3; k++) out[i * 4 + k] = Math.round(rgba[i * 4 + k]); out[i * 4 + 3] = Math.round(rgba[i * 4 + 3] * 255); }
  return { w, h, rgba: out };
}

export function svgPath(d: string): Poly[] {
  const tok = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? [];
  const polys: Poly[] = [];
  let cur: Pt[] = [], x = 0, y = 0, sx = 0, sy = 0, cmd = '', i = 0, lc: Pt | null = null;
  const n = () => parseFloat(tok[i++]);
  while (i < tok.length) {
    if (/[a-zA-Z]/.test(tok[i])) cmd = tok[i++];
    const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase(), ox = rel ? x : 0, oy = rel ? y : 0;
    if (C === 'M') { if (cur.length) polys.push(cur); x = n() + ox; y = n() + oy; sx = x; sy = y; cur = [[x, y]]; cmd = rel ? 'l' : 'L'; }
    else if (C === 'L') { x = n() + ox; y = n() + oy; cur.push([x, y]); }
    else if (C === 'H') { x = n() + ox; cur.push([x, y]); }
    else if (C === 'V') { y = n() + oy; cur.push([x, y]); }
    else if (C === 'C' || C === 'S') {
      const c1: Pt = C === 'C' ? [n() + ox, n() + oy] : lc ? [2 * x - lc[0], 2 * y - lc[1]] : [x, y];
      const c2: Pt = [n() + ox, n() + oy], e: Pt = [n() + ox, n() + oy];
      cubic(cur, [x, y], c1, c2, e); lc = c2; [x, y] = e; continue;
    } else if (C === 'Q') { const c: Pt = [n() + ox, n() + oy], e: Pt = [n() + ox, n() + oy]; quad(cur, [x, y], c, e); [x, y] = e; }
    else if (C === 'A') { n(); n(); n(); n(); n(); x = n() + ox; y = n() + oy; cur.push([x, y]); }  // ponytail: arcs as chords
    else if (C === 'Z') { if (cur.length) polys.push(cur); cur = []; x = sx; y = sy; }
    else i++;
    lc = null;
  }
  if (cur.length) polys.push(cur);
  return polys;
}

// ---------------------------------------------------------------- program scan + C++/sim output
/** Tailwind text sizes in px (the same table is in lib/std/ui.ts). */
export const TEXT_SIZES: Record<string, number> = { xs: 12, sm: 14, base: 16, lg: 18, xl: 20, '2xl': 24, '3xl': 30, '4xl': 36, '5xl': 48, '6xl': 60 };
export const FONT_FILES: Record<string, string> = {
  sans: path.join(ZINC_ROOT, 'lib/fonts/Inter-Regular.ttf'),
  'sans-bold': path.join(ZINC_ROOT, 'lib/fonts/Inter-Bold.ttf'),
  mono: path.join(ZINC_ROOT, 'lib/fonts/JetBrainsMono-Regular.ttf'),
};

export interface ResourceSet { fonts: BakedFont[]; images: BakedImage[]; ttf: { name: string; file: string }[] }

/**
 * Decides what to bake from the program text: every Tailwind text size mentioned (plus 16px), regular and bold,
 * the characters of all string/JSX literals plus printable ASCII, and every image file in the assets directory.
 */
/** `hiScale`: pixels per logical pixel the target may display (0: small target, no TTF embedding, 1x images). */
export function collectResources(sources: { fileName: string; text: string }[], assetsDir: string | undefined, extraSizes: number[] = [], hiScale = 0): ResourceSet {
  const embedTtf = hiScale > 0;
  const all = sources.map(s => s.text).join('\n');
  const sizes = new Set<number>([16, ...extraSizes]);
  for (const m of all.matchAll(/text-(xs|sm|base|lg|xl|[2-6]xl)\b/g)) sizes.add(TEXT_SIZES[m[1]]);
  for (const m of all.matchAll(/text-\[(\d+)(?:px)?\]/g)) sizes.add(Number(m[1]));
  for (const m of all.matchAll(/font-size\s*:\s*(\d+)px/g)) sizes.add(Number(m[1]));
  // canvas font strings ('bold 24px sans-serif', zinc:canvas)
  for (const m of all.matchAll(/['"`](?:(?:bold|normal|italic|[1-9]00)\s+)*(\d+)px\s+[\w\s,"-]*(?:sans|serif|mono|system-ui|Inter|Arial|Helvetica)/g)) sizes.add(Number(m[1]));
  const chars = new Set<number>();
  for (let c = 32; c < 127; c++) chars.add(c);
  for (const m of all.matchAll(/(["'`])((?:\\.|(?!\1).)*)\1|>([^<>{}]+)</g)) for (const ch of (m[2] ?? m[3] ?? '')) chars.add(ch.codePointAt(0)!);
  const cps = [...chars];
  const fonts: BakedFont[] = [];
  // families: Inter regular/bold always, JetBrains Mono when `font-mono` is used, and every TTF in the assets
  // (`font-[FileName]`, the file name without .ttf; FileName-Bold.ttf is its bold)
  const families: Record<string, string> = { sans: FONT_FILES.sans, 'sans-bold': FONT_FILES['sans-bold'] };
  if (/\bfont-mono\b/.test(all)) families.mono = FONT_FILES.mono;
  const custom: string[] = [];
  const findTtf = (d: string | undefined) => { if (!d || !fs.existsSync(d)) return; for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) findTtf(p); else if (/\.[ot]tf$/i.test(f)) { const n = f.replace(/\.[ot]tf$/i, ''); families[n] = p; custom.push(n); } } };
  findTtf(assetsDir);
  for (const px of [...sizes].sort((a, b) => a - b))
    for (const [name, file] of Object.entries(families)) fonts.push(bakeFont(file, name, px, cps));
  // legacy gfx.text(x, y, s, color, scale): crisp monospace on an 8px grid; the larger cells serve HiDPI screens
  for (const k of [1, 2, 3, 4, 6, 8]) { const g = bakeFont(FONT_FILES.mono, 'grid', Math.round(8 * k * 1.3), [...Array(95)].map((_, i) => i + 32), { cell: 8 * k, threshold: true }); g.px = 8 * k; g.ascent = Math.round(7 * k); g.descent = k; g.lineGap = 0; fonts.push(g); }
  const images: BakedImage[] = [];
  const walk = (d: string, pre: string) => {
    if (!d || !fs.existsSync(d)) return;
    for (const f of fs.readdirSync(d).sort()) {
      const p = path.join(d, f);
      if (fs.statSync(p).isDirectory()) { walk(p, pre + f + '/'); continue; }
      const hi = /@([234])x\.png$/.exec(f);
      if (hi) { if (embedTtf) images.push({ name: pre + f.replace(/@[234]x\.png$/, '.png'), ...decodePNG(fs.readFileSync(p)), scale: Number(hi[1]) }); }
      else if (f.endsWith('.png')) { if (!(embedTtf && [2, 3, 4].some(k => fs.existsSync(p.replace(/\.png$/, `@${k}x.png`))))) images.push({ name: pre + f, ...decodePNG(fs.readFileSync(p)), scale: 1 }); }
      else if (f.endsWith('.svg')) {
        // vector art: baked at the target's display scale (capped at 1024 px wide), so it stays sharp
        const text = fs.readFileSync(p, 'utf8'), base = rasterizeSVG(text);
        const k = embedTtf ? Math.max(1, Math.min(hiScale, Math.floor(1024 / Math.max(1, base.w)))) : 1;
        images.push(k > 1 ? { name: pre + f, ...rasterizeSVG(text, base.w * k), scale: k } : { name: pre + f, ...base, scale: 1 });
      }
    }
  };
  if (assetsDir) walk(assetsDir, '');
  return { fonts, images, ttf: embedTtf ? Object.entries({ ...families, mono: FONT_FILES.mono }).map(([name, file]) => ({ name, file })) : [] };
}

export function resourcesCpp(r: ResourceSet): string {
  const out = ['// Generated by zinc: baked fonts and images (compiler/src/resources.ts).', '#include "zrt.h"', '#include "zrt_raster.h"', 'namespace zrt { namespace raster {'];
  r.fonts.forEach((f, i) => {
    out.push(`static const uint8_t fb${i}[] = {${f.bitmap.length ? f.bitmap.join(',') : '0'}};`);
    out.push(`static const Glyph fg${i}[] = {${f.glyphs.map(g => `{${g.cp},${g.x0},${g.y0},${g.w},${g.h},${g.adv},${g.off}}`).join(',')}};`);
  });
  out.push(`const Font fonts[] = {${r.fonts.map((f, i) => `{"${f.name}", ${f.px}, ${f.ascent}, ${f.descent}, ${f.lineGap}, ${f.glyphs.length}, fg${i}, fb${i}}`).join(', ') || '{"", 0, 0, 0, 0, 0, nullptr, nullptr}'}};`);
  out.push(`const int font_count = ${r.fonts.length};`);
  r.images.forEach((im, i) => out.push(`static const uint8_t ib${i}[] = {${Array.from(im.rgba).join(',')}};`));
  out.push(`const Image images[] = {${r.images.map((im, i) => `{"${im.name}", ${im.w}, ${im.h}, ib${i}, ${im.scale}}`).join(', ') || '{"", 0, 0, nullptr, 1}'}};`);
  out.push(`const int image_count = ${r.images.length};`);
  // TTF sources for runtime rasterization (HiDPI, unbaked sizes): string literals compile much faster than arrays
  r.ttf.forEach((t, i) => {
    const b = fs.readFileSync(t.file);
    let lit = '';
    for (let k = 0; k < b.length; k++) lit += '\\' + b[k].toString(8).padStart(3, '0');
    out.push(`static const char tt${i}[] = "${lit}";`);
  });
  out.push(`const TtfFile ttf_files[] = {${r.ttf.map((t, i) => `{"${t.name}", (const uint8_t*)tt${i}, ${fs.statSync(t.file).size}u}`).join(', ') || '{"", nullptr, 0}'}};`);
  out.push(`const int ttf_count = ${r.ttf.length};`);
  out.push('}}', '');
  return out.join('\n');
}

/** Metrics only (advances), so sim layouts match native ones exactly. */
export function resourcesJson(r: ResourceSet): string {
  return JSON.stringify({
    fonts: r.fonts.map(f => ({ name: f.name, px: f.px, ascent: f.ascent, descent: f.descent, lineGap: f.lineGap, adv: Object.fromEntries(f.glyphs.map(g => [g.cp, g.adv])) })),
    images: r.images.map(im => ({ name: im.name, w: Math.round(im.w / im.scale), h: Math.round(im.h / im.scale) })),
  });
}
