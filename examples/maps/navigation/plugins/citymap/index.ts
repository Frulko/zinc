// zinc:citymap — a rotatable vector city map for navigation views.
//
// zinc:map renders north-up raster tiles; a heading-up navigation camera needs the map to turn every frame, which
// cached tile images cannot do cheaply. This plugin keeps the city as vector geometry instead (a compact binary made
// by the example's tools/build-data.mjs from OpenStreetMap) and draws only what the camera sees, every frame:
//   - a uniform grid (200 m cells) finds the features near the view, their bounding boxes cull the rest;
//   - `Projection` maps world metres to the screen: rotation (travel direction up), zoom, and a cheap perspective
//     tilt (points ahead shrink toward a horizon);
//   - areas of one kind become one `path` (one nonzero fill), roads are `stroke`s (round joins) with a casing below;
//   - level of detail: small features, buildings and minor roads drop out as the camera zooms out, points closer
//     than 1.5 px are skipped.
// Road outlines use more points than the default per-frame pool of zinc:gfx (32768 floats), so plugin.json raises it,
// like the svg and canvas2d plugins do.
import { path, stroke } from 'zinc:gfx';

/** Feature kinds, in drawing order (city.bin stores features sorted by kind). */
export const PARK: i32 = 0, WATER: i32 = 1, BUILDING: i32 = 2, PEDESTRIAN: i32 = 3, SERVICE: i32 = 4, MINOR: i32 = 5,
  TERTIARY: i32 = 6, SECONDARY: i32 = 7, PRIMARY: i32 = 8, TUNNEL: i32 = 9;
export const KINDS: i32 = 10;

/** Road widths in metres, and the minimum on screen in px (zoomed out, roads stay visible). */
const ROAD_M: number[] = [0, 0, 0, 5, 4, 8, 10, 11, 13, 6];
const ROAD_MIN: number[] = [0, 0, 0, 1, 1, 1.5, 2, 2.2, 2.6, 1];
const CELL: number = 200;

/** World (metres; x east, y south) to screen: heading-up rotation, zoom and perspective tilt. */
export class Projection {
  /** Camera: the world point shown at the anchor (ax, ay), the travel direction (radians, 0 = east, clockwise). */
  cx: number = 0;
  cy: number = 0;
  bearing: number = 0;
  /** Pixels per metre. */
  scale: number = 1;
  ax: number = 0;
  ay: number = 0;
  /** 0 = flat; 0.6 = things 1 screen height ahead are drawn at 1 / 1.6 of their size. */
  tilt: number = 0;
  /** Screen height the tilt is relative to. */
  depth: number = 600;
  /** Results of project(): screen point and its size factor. */
  x: number = 0;
  y: number = 0;
  f: number = 1;
  /** Results of toWorld(). */
  wx: number = 0;
  wy: number = 0;
  /** World box around the view, from viewBox(). */
  minX: number = 0;
  minY: number = 0;
  maxX: number = 0;
  maxY: number = 0;
  private c: number = 1;
  private s: number = 0;

  /** Call after changing the camera fields. */
  update(): void { this.c = Math.cos(this.bearing); this.s = Math.sin(this.bearing); }

  project(wx: number, wy: number): void {
    const dx = wx - this.cx, dy = wy - this.cy;
    const sx = (-dx * this.s + dy * this.c) * this.scale;   // along the right-hand side of travel
    const sy = -(dx * this.c + dy * this.s) * this.scale;   // ahead is up
    const f = this.tilt > 0 ? 1 / Math.max(0.25, 1 - this.tilt * sy / this.depth) : 1;
    this.x = this.ax + sx * f; this.y = this.ay + sy * f; this.f = f;
  }

  toWorld(x: number, y: number): void {
    let py = y - this.ay;
    if (this.tilt > 0) py = Math.max(py, -0.95 * this.depth / this.tilt);   // not above the horizon
    const sy = this.tilt > 0 ? py / (1 + this.tilt * py / this.depth) : py;
    const f = this.tilt > 0 ? 1 / Math.max(0.25, 1 - this.tilt * sy / this.depth) : 1;
    const a = (x - this.ax) / f / this.scale, b = -sy / this.scale;
    this.wx = this.cx - this.s * a + this.c * b;
    this.wy = this.cy + this.c * a + this.s * b;
  }

  /** World bounding box of the screen rectangle. */
  viewBox(x: number, y: number, w: number, h: number): void {
    this.minX = 1e9; this.minY = 1e9; this.maxX = -1e9; this.maxY = -1e9;
    for (let i: i32 = 0; i < 4; i++) {
      this.toWorld(i % 2 === 0 ? x : x + w, i < 2 ? y : y + h);
      this.minX = Math.min(this.minX, this.wx); this.maxX = Math.max(this.maxX, this.wx);
      this.minY = Math.min(this.minY, this.wy); this.maxY = Math.max(this.maxY, this.wy);
    }
  }
}

/** Colours of one map style. Roads: fill and casing per kind. */
export class Palette {
  park: u32 = 0xc9e7c0;
  water: u32 = 0xa4d4f0;
  building: u32 = 0xdfdbd3;
  road: u32[] = [0, 0, 0, 0xf7f5f2, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffe9a8, 0xe8e4de];
  casing: u32[] = [0, 0, 0, 0xd9d4cc, 0xd4cfc6, 0xcfc9bf, 0xc9c2b6, 0xc2baad, 0xe0bc6a, 0xe8e4de];
}

export class CityMap {
  // features: kind, first ring, ring count, bounding box (minx, miny, maxx, maxy)
  private kind: i32[] = [];
  private ring0: i32[] = [];
  private nrings: i32[] = [];
  private bb: number[] = [];
  // rings: first point, point count; points: x, y in metres
  private pt0: i32[] = [];
  private npts: i32[] = [];
  private xy: number[] = [];
  // grid of feature ids
  private gx0: number = 0;
  private gy0: number = 0;
  private gw: i32 = 0;
  private gh: i32 = 0;
  private cells: i32[][] = [];
  private stamp: i32[] = [];
  private frame: i32 = 0;
  /** Floats sent to the rasterizer by the last draw (per-frame budget check). */
  points: i32 = 0;
  /** Features drawn by the last draw. */
  drawn: i32 = 0;

  /** Parses city.bin: "CITY", u32 count, then per feature u8 kind, u8 rings, per ring u16 n + n × (i16 x, i16 y) in ¼ m. */
  constructor(b: u8[]) {
    let p: i32 = 8;
    const count: i32 = b[4] | (b[5] << 8) | (b[6] << 16) | (b[7] << 24);
    let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
    for (let f: i32 = 0; f < count; f++) {
      this.kind.push(b[p]);
      const rings: i32 = b[p + 1];
      p += 2;
      this.ring0.push(this.npts.length); this.nrings.push(rings);
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (let r: i32 = 0; r < rings; r++) {
        const n: i32 = b[p] | (b[p + 1] << 8);
        p += 2;
        this.pt0.push(this.xy.length / 2); this.npts.push(n);
        for (let k: i32 = 0; k < n; k++) {
          let x: i32 = b[p] | (b[p + 1] << 8), y: i32 = b[p + 2] | (b[p + 3] << 8);
          if (x >= 32768) x -= 65536;
          if (y >= 32768) y -= 65536;
          p += 4;
          const mx = x / 4, my = y / 4;
          this.xy.push(mx); this.xy.push(my);
          x0 = Math.min(x0, mx); x1 = Math.max(x1, mx); y0 = Math.min(y0, my); y1 = Math.max(y1, my);
        }
      }
      this.bb.push(x0); this.bb.push(y0); this.bb.push(x1); this.bb.push(y1);
      minX = Math.min(minX, x0); minY = Math.min(minY, y0); maxX = Math.max(maxX, x1); maxY = Math.max(maxY, y1);
      this.stamp.push(0);
    }
    this.gx0 = minX; this.gy0 = minY;
    this.gw = Math.floor((maxX - minX) / CELL) + 1; this.gh = Math.floor((maxY - minY) / CELL) + 1;
    for (let i: i32 = 0; i < this.gw * this.gh; i++) this.cells.push([]);
    for (let f: i32 = 0; f < count; f++) {
      const cx0 = this.cellX(this.bb[f * 4]), cy0 = this.cellY(this.bb[f * 4 + 1]), cx1 = this.cellX(this.bb[f * 4 + 2]), cy1 = this.cellY(this.bb[f * 4 + 3]);
      for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) this.cells[cy * this.gw + cx].push(f);
    }
  }

  get featureCount(): i32 { return this.kind.length; }

  private cellX(x: number): i32 { return Math.max(0, Math.min(this.gw - 1, Math.floor((x - this.gx0) / CELL))); }
  private cellY(y: number): i32 { return Math.max(0, Math.min(this.gh - 1, Math.floor((y - this.gy0) / CELL))); }

  /** Visible feature ids, sorted (= drawing order). */
  private visible(p: Projection): i32[] {
    this.frame++;
    const out: i32[] = [];
    const cx0 = this.cellX(p.minX), cx1 = this.cellX(p.maxX), cy0 = this.cellY(p.minY), cy1 = this.cellY(p.maxY);
    const tiny = 2 / p.scale;   // features smaller than 2 px are skipped
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      for (const f of this.cells[cy * this.gw + cx]) {
        if (this.stamp[f] === this.frame) continue;
        this.stamp[f] = this.frame;
        const b = f * 4;
        if (this.bb[b + 2] < p.minX || this.bb[b] > p.maxX || this.bb[b + 3] < p.minY || this.bb[b + 1] > p.maxY) continue;
        if (this.bb[b + 2] - this.bb[b] < tiny && this.bb[b + 3] - this.bb[b + 1] < tiny) continue;
        out.push(f);
      }
    }
    out.sort((a: i32, b: i32): number => a - b);
    return out;
  }

  /** Ring r projected to the screen, [x0, y0, x1, y1...], skipping points closer than 1.5 px to the previous one. */
  private screenRing(p: Projection, r: i32, closed: boolean): number[] {
    const out: number[] = [];
    const n = this.npts[r], o = this.pt0[r] * 2;
    let lx = -1e9, ly = -1e9;
    for (let k: i32 = 0; k < n; k++) {
      p.project(this.xy[o + k * 2], this.xy[o + k * 2 + 1]);
      if (k > 0 && k < n - 1 && Math.abs(p.x - lx) + Math.abs(p.y - ly) < 1.5) continue;
      out.push(p.x); out.push(p.y);
      lx = p.x; ly = p.y;
    }
    if (closed && out.length < 6) return [];
    return out;
  }

  /** Size factor of the perspective at the middle of feature f. */
  private depthOf(p: Projection, f: i32): number {
    const b = f * 4;
    p.project((this.bb[b] + this.bb[b + 2]) / 2, (this.bb[b + 1] + this.bb[b + 3]) / 2);
    return p.f;
  }

  /** Draws the map for the camera `p` in the screen box; `lite` drops buildings and road casings (slow devices). */
  draw(p: Projection, pal: Palette, x: number, y: number, w: number, h: number, lite: boolean): void {
    p.update();
    p.viewBox(x, y, w, h);
    const ids = this.visible(p);
    this.points = 0; this.drawn = ids.length;
    const s = p.scale;
    // areas: one nonzero path per kind
    const areaColors: u32[] = [pal.park, pal.water, pal.building];
    let i: i32 = 0;
    for (let kind: i32 = PARK; kind <= BUILDING; kind++) {
      const contours: number[] = [];
      while (i < ids.length && this.kind[ids[i]] === kind) {
        const f = ids[i++];
        // buildings: close up only, and not far toward the horizon (tiny there, and most of the raster work)
        if (kind === BUILDING && (lite || s < 0.75 || this.depthOf(p, f) < 0.72)) continue;
        for (let r: i32 = 0; r < this.nrings[f]; r++) {
          const ring = this.screenRing(p, this.ring0[f] + r, true);
          if (ring.length === 0) continue;
          contours.push(ring.length / 2);
          for (const v of ring) contours.push(v);
        }
      }
      if (contours.length > 0) { path(contours, areaColors[kind], 255); this.points += contours.length; }
    }
    // roads: project once, casings first (all kinds), then fills from minor to major
    const lines: number[][] = [], kinds: i32[] = [], widths: number[] = [];
    for (; i < ids.length; i++) {
      const f = ids[i], k = this.kind[f];
      if ((k === SERVICE || k === PEDESTRIAN || k === TUNNEL) && s < 0.6) continue;
      if (k === MINOR && s < 0.2) continue;
      const line = this.screenRing(p, this.ring0[f], false);
      if (line.length < 4) continue;
      lines.push(line); kinds.push(k);
      widths.push(Math.max(ROAD_MIN[k], ROAD_M[k] * s) * this.depthOf(p, f));
    }
    const casing = !lite && s > 0.35;
    if (casing) for (let j: i32 = 0; j < lines.length; j++) {
      if (kinds[j] === TUNNEL) continue;
      stroke(lines[j], widths[j] + Math.max(1.5, widths[j] * 0.18), pal.casing[kinds[j]], 255, false);
      this.points += lines[j].length * 14;
    }
    for (let pass: i32 = 0; pass < 2; pass++) for (let j: i32 = 0; j < lines.length; j++) {
      if ((kinds[j] === TUNNEL) !== (pass === 0)) continue;   // tunnels first, faded, under the streets
      stroke(lines[j], widths[j], pal.road[kinds[j]], kinds[j] === TUNNEL ? 120 : 255, false);
      this.points += lines[j].length * 14;
    }
  }
}
