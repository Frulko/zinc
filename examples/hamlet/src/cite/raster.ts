// A tiny CPU rasterizer for the sprite atlas: filled polygons (even-odd, anti-aliased by three sub-scanlines and exact horizontal coverage) composited
// over straight RGBA pixels. The render targets of beginImage are opaque, so the atlas (which needs transparency) is made here and sent with updatePixels.
export const page = { w: 0, h: 0, px: [] as u32[], x: 0, y: 0, k: 1 };      // x, y: where the sprite being drawn sits in the page; k: pixels per sprite unit (2: the double-resolution atlas)
const SUB = 3;
let cov: number[] = [];
const xs: number[] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

/** A new transparent page; `use` points the raster at a page already made. */
export function openPage(w: number, h: number): u32[] {
  const px = Array.from({ length: w * h }, (): u32 => 0);
  use(px, w, h);
  return px;
}
export function use(px: u32[], w: number, h: number): void {
  page.w = w; page.h = h; page.px = px;
  if (cov.length < w + 2) cov = Array.from({ length: w + 2 }, (): number => 0);
}

/** Fills a polygon [x0, y0, x1, y1, ...] (relative to the sprite) with a 0xRRGGBB colour at alpha 0..255. */
export function fillPolygon(pts: number[], color: number, alpha: number): void {
  const n = pts.length >> 1, K = page.k;
  if (n < 3) return;
  let minY = 1e9, maxY = -1e9, minX = 1e9, maxX = -1e9;
  for (let k = 0; k < n; k++) {
    const x = pts[2 * k] * K + page.x, y = pts[2 * k + 1] * K + page.y;
    if (y < minY) minY = y; if (y > maxY) maxY = y; if (x < minX) minX = x; if (x > maxX) maxX = x;
  }
  const y0 = Math.max(0, Math.floor(minY)), y1 = Math.min(page.h - 1, Math.ceil(maxY)), x0 = Math.max(0, Math.floor(minX)), x1 = Math.min(page.w - 1, Math.ceil(maxX));
  const r = (color >> 16) & 255, g = (color >> 8) & 255, b = color & 255, sa = alpha / 255;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1 + 1; x++) cov[x] = 0;
    let any = false;
    for (let sub = 0; sub < SUB; sub++) {
      const sy = y + (sub + .5) / SUB;
      let m = 0;
      for (let k = 0; k < n; k++) {
        const ax = pts[2 * k] * K + page.x, ay = pts[2 * k + 1] * K + page.y, k2 = k + 1 === n ? 0 : k + 1, bx = pts[2 * k2] * K + page.x, by = pts[2 * k2 + 1] * K + page.y;
        if ((ay <= sy && by > sy) || (by <= sy && ay > sy)) { if (m < 24) { xs[m] = ax + (sy - ay) / (by - ay) * (bx - ax); m++; } }
      }
      for (let i = 1; i < m; i++) { const v = xs[i]; let j = i - 1; while (j >= 0 && xs[j] > v) { xs[j + 1] = xs[j]; j--; } xs[j + 1] = v; }
      for (let i = 0; i + 1 < m; i += 2) {
        const a = Math.max(xs[i], x0), c = Math.min(xs[i + 1], x1 + 1);
        if (c <= a) continue;
        any = true;
        const fa = Math.floor(a), fc = Math.floor(c);
        if (fa === fc) cov[fa] += (c - a) / SUB;
        else {
          cov[fa] += (fa + 1 - a) / SUB;
          for (let x = fa + 1; x < fc; x++) cov[x] += 1 / SUB;
          if (fc <= x1) cov[fc] += (c - fc) / SUB;
        }
      }
    }
    if (!any) continue;
    for (let x = x0; x <= x1; x++) {
      const c = cov[x] * sa;
      if (c <= 0.004) continue;
      const idx = y * page.w + x, d = page.px[idx], da = (d >>> 24) / 255;
      const oa = c + da * (1 - c);
      const dr = d & 255, dg = (d >> 8) & 255, db = (d >> 16) & 255, w = da * (1 - c);
      const or = (r * c + dr * w) / oa, og = (g * c + dg * w) / oa, ob = (b * c + db * w) / oa;
      page.px[idx] = ((Math.round(oa * 255) << 24) | (Math.round(ob) << 16) | (Math.round(og) << 8) | Math.round(or)) >>> 0;
    }
  }
}

const quad: number[] = [0, 0, 0, 0, 0, 0, 0, 0];
/** A stroked polyline of `width` pixels (butt joins; the joints are covered by the overlap of the segments). */
export function strokeLine(pts: number[], width: number, color: number, alpha: number): void {
  const n = pts.length >> 1, h = width / 2;
  for (let k = 0; k + 1 < n; k++) {
    const ax = pts[2 * k], ay = pts[2 * k + 1], bx = pts[2 * k + 2], by = pts[2 * k + 3];
    let dx = bx - ax, dy = by - ay;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < .001) continue;
    dx = dx / len * h; dy = dy / len * h;
    quad[0] = ax - dy - dx * .5; quad[1] = ay + dx - dy * .5; quad[2] = ax + dy - dx * .5; quad[3] = ay - dx - dy * .5;
    quad[4] = bx + dy + dx * .5; quad[5] = by - dx + dy * .5; quad[6] = bx - dy + dx * .5; quad[7] = by + dx + dy * .5;
    fillPolygon(quad, color, alpha);
  }
}
