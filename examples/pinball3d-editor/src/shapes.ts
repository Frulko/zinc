// What each thing of a table looks like from above: lines, filled outlines and discs in table coordinates (centimetres, x to the
// right, y down the table), with the height it stands at and reaches. The top view draws these shapes, picks with them and shows their
// heights in the side profile; nothing here draws.
// The shapes come from the same geometry as the game's scene (../../pinball3d/src/geometry): a path with arcs is the same polyline, a
// flipper the same outline. An element kind this file does not know is still shown, as its points and its paths (generic()).
import { Schema } from '../../pinball3d/src/format/schema';
import { TableDef, WallDef, GateDef, FlipperDef, PlungerDef, BumperDef, SlingshotDef, KickerDef, TargetDef, RolloverDef, SpinnerDef, RampDef, FloorDef, LightDef, ModelDef } from '../../pinball3d/src/format/table';
import { tessellate, profileAt, withProfilePoints, offset, flipperOutline, rad } from '../../pinball3d/src/geometry';
import { isPoint, isPath } from './doc';

export const enum Draw { Line, Fill, Disc }
export class Shape {
  draw: Draw;
  /** Line, Fill: x, y pairs. Disc: its centre. */
  pts: number[];
  /** Line: its width. Disc: its radius. */
  r: number;
  color: i32;
  alpha: i32;
  constructor(draw: Draw, pts: number[], r: number, color: i32, alpha: i32) { this.draw = draw; this.pts = pts; this.r = r; this.color = color; this.alpha = alpha; }
}

/** One thing of the table seen from above. */
export class Outline {
  /** Where it is in the table file: "bumpers[0]", "plunger". */
  path: string;
  shapes: Shape[] = [];
  /** The height of its foot and of its top above the playfield. */
  z0: number = 0;
  z1: number = 0;
  /** Its height along the table when it varies (a ramp): y, z pairs. Empty: a box from z0 to z1. */
  section: number[] = [];
  /** 0: in the board (lights, switches); 1: standing on it; 2: above it (ramps, upper levels). Drawn in that order. */
  layer: i32 = 1;
  x0: number = 0; y0: number = 0; x1: number = 0; y1: number = 0;
  /** Its colour where it is shown as one mark (the side profile). */
  tone: i32 = 0xb0b8c0;
  constructor(path: string) { this.path = path; }

  line(pts: number[], width: number, color: i32, alpha: i32 = 255): void { this.shapes.push(new Shape(Draw.Line, pts, width, color, alpha)); }
  fill(pts: number[], color: i32, alpha: i32 = 255): void { this.shapes.push(new Shape(Draw.Fill, pts, 0, color, alpha)); }
  disc(x: number, y: number, r: number, color: i32, alpha: i32 = 255): void { this.shapes.push(new Shape(Draw.Disc, [x, y], r, color, alpha)); }
  /** A small arrow head whose tip is (x, y), pointing along (dx, dy) (a unit vector). */
  head(x: number, y: number, dx: number, dy: number, size: number, color: i32): void {
    this.fill([x, y, x - dx * size - dy * size * 0.6, y - dy * size + dx * size * 0.6, x - dx * size + dy * size * 0.6, y - dy * size - dx * size * 0.6], color);
  }
  /** The box around its shapes and its colour, once they are all there. */
  bound(): void {
    let first = true, toned = false;
    for (const s of this.shapes) {
      if (!toned && s.alpha > 100 && s.color !== 0x05060a) { this.tone = s.color; toned = true; }
      const pad = s.draw === Draw.Disc ? s.r : s.draw === Draw.Line ? s.r / 2 : 0;
      for (let i = 0; i + 1 < s.pts.length; i += 2) {
        const x = s.pts[i], y = s.pts[i + 1];
        if (first) { this.x0 = x - pad; this.x1 = x + pad; this.y0 = y - pad; this.y1 = y + pad; first = false; continue; }
        this.x0 = Math.min(this.x0, x - pad); this.x1 = Math.max(this.x1, x + pad); this.y0 = Math.min(this.y0, y - pad); this.y1 = Math.max(this.y1, y + pad);
      }
    }
  }
  /** How far (x, y) is from it: 0 or less on it, more away from it. */
  distance(x: number, y: number): number {
    let best = 1e9;
    for (const s of this.shapes) {
      let d = 1e9;
      if (s.draw === Draw.Disc) d = Math.sqrt((x - s.pts[0]) * (x - s.pts[0]) + (y - s.pts[1]) * (y - s.pts[1])) - s.r;
      else {
        const n = s.pts.length / 2, closed = s.draw === Draw.Fill;
        for (let i = 0; i < (closed ? n : n - 1); i++) {
          const j = (i + 1) % n;
          d = Math.min(d, toSegment(x, y, s.pts[i * 2], s.pts[i * 2 + 1], s.pts[j * 2], s.pts[j * 2 + 1]));
        }
        if (closed) { if (within(s.pts, x, y)) d = 0; } else d -= s.r / 2;
      }
      best = Math.min(best, d);
    }
    return best;
  }
}

function toSegment(x: number, y: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2));
  const px = ax + dx * t - x, py = ay + dy * t - y;
  return Math.sqrt(px * px + py * py);
}
function within(pts: number[], x: number, y: number): boolean {
  let odd = false;
  const n = pts.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = pts[i * 2], yi = pts[i * 2 + 1], xj = pts[j * 2], yj = pts[j * 2 + 1];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) odd = !odd;
  }
  return odd;
}

// ---------------------------------------------------------------- colours

export function rgb(hex: string): i32 { return parseInt(hex.slice(1), 16); }
/** A colour mixed with another: `k` 0 gives `a`, 1 gives `b`. */
export function mix(a: i32, b: i32, k: number): i32 {
  const r = ((a >> 16) & 255) * (1 - k) + ((b >> 16) & 255) * k, g = ((a >> 8) & 255) * (1 - k) + ((b >> 8) & 255) * k, bl = (a & 255) * (1 - k) + (b & 255) * k;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
}
/** A colour made light enough to be read on the dark board of the top view. */
function seen(c: i32): i32 {
  const light = (((c >> 16) & 255) * 0.3 + ((c >> 8) & 255) * 0.59 + (c & 255) * 0.11) / 255;
  return light >= 0.42 ? c : mix(c, 0xffffff, Math.min(0.6, (0.42 - light) * 1.4));
}
const PLAIN: i32 = 0xb0b8c0, DARK: i32 = 0x05060a, SWITCH: i32 = 0x9aa3b8;

class Looks {
  ids: string[] = [];
  colors: i32[] = [];
  constructor(t: TableDef) { for (const l of t.looks) { this.ids.push(l.id); this.colors.push(rgb(l.color)); } }
  /** The colour of a look as the top view shows it. */
  of(id: string): i32 { const at = this.ids.indexOf(id); return seen(at < 0 ? PLAIN : this.colors[at]); }
}

// ---------------------------------------------------------------- each kind

function flat(xs: number[], ys: number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < xs.length; i++) { out.push(xs[i]); out.push(ys[i]); }
  return out;
}
/** x, y pairs around the origin, turned by `degrees` and put at (x, y). */
function placed(xy: number[], x: number, y: number, degrees: number): number[] {
  const c = Math.cos(rad(degrees)), s = Math.sin(rad(degrees)), out: number[] = [];
  for (let i = 0; i + 1 < xy.length; i += 2) { out.push(x + xy[i] * c - xy[i + 1] * s); out.push(y + xy[i] * s + xy[i + 1] * c); }
  return out;
}
function oval(rx: number, ry: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < 28; i++) { out.push(Math.cos(i * Math.PI / 14) * rx); out.push(Math.sin(i * Math.PI / 14) * ry); }
  return out;
}

function wallOutline(o: Outline, w: WallDef, looks: Looks): void {
  const line = tessellate(w.points, w.closed), pts = flat(line.xs, line.ys);
  if (w.closed) { pts.push(line.xs[0]); pts.push(line.ys[0]); }
  o.line(pts, w.thickness, looks.of(w.look));
  o.z0 = w.z; o.z1 = w.z + w.height;
}
function gateOutline(o: Outline, g: GateDef, looks: Looks): void {
  const c = looks.of(g.look), dx = g.b[0] - g.a[0], dy = g.b[1] - g.a[1], l = Math.max(0.001, Math.sqrt(dx * dx + dy * dy));
  o.line([g.a[0], g.a[1], g.b[0], g.b[1]], 0.25, c);
  o.disc(g.a[0], g.a[1], 0.35, c); o.disc(g.b[0], g.b[1], 0.35, c);
  // the way a ball passes: from the left of a to b to its right
  const nx = -dy / l, ny = dx / l, mx = (g.a[0] + g.b[0]) / 2, my = (g.a[1] + g.b[1]) / 2;
  o.head(mx + nx * 1.5, my + ny * 1.5, nx, ny, 1.1, c);
  o.z0 = g.z; o.z1 = g.z + g.height;
}
function flipperShapes(o: Outline, f: FlipperDef, looks: Looks): void {
  const bat = flipperOutline(f.length, f.baseRadius, f.tipRadius), c = looks.of(f.look);
  o.fill(placed(bat, f.pivot[0], f.pivot[1], f.rest + f.stroke), c, 56);   // where it swings to
  o.fill(placed(bat, f.pivot[0], f.pivot[1], f.rest), c);
  o.disc(f.pivot[0], f.pivot[1], f.baseRadius * 0.42, DARK);
  o.z0 = f.z; o.z1 = f.z + f.height;
}
function plungerOutline(o: Outline, p: PlungerDef, looks: Looks): void {
  const c = looks.of(p.look), h = p.width / 2;
  o.line(placed([-0.5, 0, -p.travel - 6, 0], p.at[0], p.at[1], p.angle), p.width * 0.3, mix(c, 0x000000, 0.35));
  o.fill(placed([-0.5, -h, 0.5, -h, 0.5, h, -0.5, h], p.at[0], p.at[1], p.angle), c);
  const tip = placed([4.2, 0], p.at[0], p.at[1], p.angle);
  o.line(placed([1.4, 0, 3.6, 0], p.at[0], p.at[1], p.angle), 0.2, c, 150);
  o.head(tip[0], tip[1], Math.cos(rad(p.angle)), Math.sin(rad(p.angle)), 1, c);
  o.z0 = p.z; o.z1 = p.z + p.height;
}
function bumperOutline(o: Outline, b: BumperDef, looks: Looks): void {
  o.disc(b.at[0], b.at[1], b.radius * 1.15, looks.of(b.cap));
  o.disc(b.at[0], b.at[1], b.radius * 0.62, looks.of(b.look));
  o.disc(b.at[0], b.at[1], b.radius * 0.2, looks.of(b.cap));
  o.z0 = b.z; o.z1 = b.z + b.height;
}
function slingshotOutline(o: Outline, s: SlingshotDef, looks: Looks): void {
  const c = looks.of(s.look), dx = s.b[0] - s.a[0], dy = s.b[1] - s.a[1], l = Math.max(0.001, Math.sqrt(dx * dx + dy * dy));
  o.line([s.a[0], s.a[1], s.b[0], s.b[1]], s.thickness, c);
  // where it kicks: to the left of a to b
  const nx = dy / l, ny = -dx / l, mx = (s.a[0] + s.b[0]) / 2, my = (s.a[1] + s.b[1]) / 2;
  o.head(mx + nx * 2, my + ny * 2, nx, ny, 1.2, c);
  o.z0 = s.z; o.z1 = s.z + s.height;
}
function kickerOutline(o: Outline, k: KickerDef, looks: Looks): void {
  const c = looks.of(k.look), dx = Math.cos(rad(k.angle)), dy = Math.sin(rad(k.angle)), x = k.at[0] + k.exit[0], y = k.at[1] + k.exit[1];
  o.disc(k.at[0], k.at[1], k.radius + 0.45, c);
  o.disc(k.at[0], k.at[1], k.radius, DARK);
  o.line([x + dx * (k.radius + 0.8), y + dy * (k.radius + 0.8), x + dx * (k.radius + 2.6), y + dy * (k.radius + 2.6)], 0.2, c, 170);
  o.head(x + dx * (k.radius + 3.4), y + dy * (k.radius + 3.4), dx, dy, 1, c);
  o.z0 = k.z; o.z1 = k.z + 0.25;
  o.layer = 0;
}
function targetOutline(o: Outline, g: TargetDef, looks: Looks): void {
  const c = looks.of(g.look), cs = Math.cos(rad(g.angle)), sn = Math.sin(rad(g.angle)), h = g.width / 2;
  // a drop target goes down into a slot behind its face
  if (g.kind === 'drop') o.line([g.at[0] + sn * h - cs * 0.7, g.at[1] - cs * h - sn * 0.7, g.at[0] - sn * h - cs * 0.7, g.at[1] + cs * h - sn * 0.7], 0.5, DARK);
  o.line([g.at[0] + sn * h, g.at[1] - cs * h, g.at[0] - sn * h, g.at[1] + cs * h], Math.max(g.thickness, 0.6), c);
  o.line([g.at[0] + cs * 0.5, g.at[1] + sn * 0.5, g.at[0] + cs * 1.3, g.at[1] + sn * 1.3], 0.2, c, 170);
  o.z0 = g.z; o.z1 = g.z + g.height;
}
function rolloverOutline(o: Outline, r: RolloverDef): void {
  o.line([r.a[0], r.a[1], r.b[0], r.b[1]], 0.5, DARK);
  o.line([r.a[0], r.a[1], r.b[0], r.b[1]], 0.16, SWITCH);
  o.z0 = r.z; o.z1 = r.z;
  o.layer = 0;
}
function spinnerOutline(o: Outline, sp: SpinnerDef, looks: Looks): void {
  const c = looks.of(sp.look), dx = sp.b[0] - sp.a[0], dy = sp.b[1] - sp.a[1], l = Math.max(0.001, Math.sqrt(dx * dx + dy * dy));
  const mx = (sp.a[0] + sp.b[0]) / 2, my = (sp.a[1] + sp.b[1]) / 2, angle = Math.atan2(dy, dx) * 180 / Math.PI, half = Math.max(0.4, l / 2 - 0.5);
  o.line([sp.a[0], sp.a[1], sp.b[0], sp.b[1]], 0.16, c);
  o.fill(placed([-half, -0.7, half, -0.7, half, 0.7, -half, 0.7], mx, my, angle), c, 150);
  o.disc(sp.a[0], sp.a[1], 0.32, c); o.disc(sp.b[0], sp.b[1], 0.32, c);
  o.z0 = sp.z; o.z1 = sp.z + sp.height + 0.4;
}
function rampOutline(o: Outline, r: RampDef, looks: Looks, glass: number): void {
  const c = looks.of(r.look), path = withProfilePoints(tessellate(r.points, false), r.profile), n = path.count();
  const z: number[] = [];
  let low = 1e9, high = 0;
  for (let i = 0; i < n; i++) { const h = profileAt(r.profile, path.length > 0 ? path.at[i] / path.length : 0); z.push(h); low = Math.min(low, h); high = Math.max(high, h); }
  if (r.style === 'wire') {
    const side = r.width / 2 + 0.12, a = offset(path, side), b = offset(path, side * 0.55);
    o.line(flat(a.lx, a.ly), 0.24, c); o.line(flat(a.rx, a.ry), 0.24, c);
    o.line(flat(b.lx, b.ly), 0.18, c, 150); o.line(flat(b.rx, b.ry), 0.18, c, 150);
  } else {
    const s = offset(path, r.width / 2);
    // the track, each stretch as light as it is high: the shade is the height
    for (let i = 0; i + 1 < n; i++) {
      const k = Math.min(1, (z[i] + z[i + 1]) / 2 / Math.max(1, glass));
      o.fill([s.lx[i], s.ly[i], s.lx[i + 1], s.ly[i + 1], s.rx[i + 1], s.ry[i + 1], s.rx[i], s.ry[i]], mix(mix(c, 0x000000, 0.55), mix(c, 0xffffff, 0.25), k), 215);
    }
    if (r.wall > 0) { o.line(flat(s.lx, s.ly), 0.3, c); o.line(flat(s.rx, s.ry), 0.3, c); }
  }
  // the way it is ridden: a chevron every few centimetres
  let next = 3;
  for (let i = 0; i + 1 < n; i++) {
    while (next < path.at[i + 1]) {
      const dx = path.xs[i + 1] - path.xs[i], dy = path.ys[i + 1] - path.ys[i], l = Math.max(0.001, Math.sqrt(dx * dx + dy * dy)), t = (next - path.at[i]) / l;
      const x = path.xs[i] + dx * t, y = path.ys[i] + dy * t, ux = dx / l, uy = dy / l, w = r.width * 0.26;
      o.line([x - ux * w - uy * w, y - uy * w + ux * w, x, y, x - ux * w + uy * w, y - uy * w - ux * w], 0.16, 0xffffff, 120);
      next += 6;
    }
  }
  for (let i = 0; i < n; i++) { o.section.push(path.ys[i]); o.section.push(z[i]); }
  o.z0 = low; o.z1 = high + r.wall;
  o.layer = 2;
}
function floorOutline(o: Outline, f: FloorDef, looks: Looks): void {
  const line = tessellate(f.points, true), pts = flat(line.xs, line.ys), c = looks.of(f.look);
  o.fill(pts, c, 110);
  const edge = pts.slice();
  edge.push(pts[0]); edge.push(pts[1]);
  o.line(edge, 0.2, c);
  o.z0 = f.z - f.thickness; o.z1 = f.z;
  o.layer = 2;
}
function lightOutline(o: Outline, l: LightDef): void {
  const c = rgb(l.color), s = l.size;
  if (l.shape === 'round') o.disc(l.at[0], l.at[1], s, c, 215);
  else if (l.shape === 'arrow') {
    o.fill(placed([s, 0, 0, s * 0.75, 0, -s * 0.75], l.at[0], l.at[1], l.angle), c, 215);
    o.fill(placed([0, s * 0.3, -s, s * 0.3, -s, -s * 0.3, 0, -s * 0.3], l.at[0], l.at[1], l.angle), c, 215);
  } else o.fill(placed([s, s * 0.28, -s, s * 0.28, -s, -s * 0.28, s, -s * 0.28], l.at[0], l.at[1], l.angle), c, 215);
  o.z0 = l.z; o.z1 = l.z;
  o.layer = 0;
}
function modelOutline(o: Outline, m: ModelDef, looks: Looks): void {
  const c = looks.of(m.look), hx = m.scale[0] / 2, hy = m.scale[1] / 2;
  // a mesh file is shown as the box of its scale: its real outline is not read here
  const round = m.mesh === '' && m.shape !== 'box';
  const pts = placed(round ? oval(hx, hy) : [-hx, -hy, hx, -hy, hx, hy, -hx, hy], m.at[0], m.at[1], m.rotation[2]);
  o.fill(pts, c, 96);
  const edge = pts.slice();
  edge.push(pts[0]); edge.push(pts[1]);
  o.line(edge, 0.2, c);
  o.z0 = m.at[2]; o.z1 = m.at[2] + m.scale[2];
}
/** A kind this file does not know: its points as dots, its paths as lines. */
function generic(o: Outline, s: Schema, item: any): void {
  for (const f of s.fields) {
    const v: any = item[f.name];
    if (isPoint(f)) { const x: number = v[0], y: number = v[1]; o.disc(x, y, 1, PLAIN); }
    else if (isPath(f)) {
      const pts: number[] = [];
      for (let i = 0; i < v.length; i++) { const x: number = v[i][0], y: number = v[i][1]; pts.push(x); pts.push(y); }
      o.line(pts, 0.3, PLAIN);
    }
  }
  const z: any = item.z, h: any = item.height;
  if (typeof z === 'number') { o.z0 = z; o.z1 = z; }
  if (typeof h === 'number') { const up: number = h; o.z1 = o.z0 + up; }
}

/** Every placed thing of a table seen from above, in the order of the file. `placedLists`: the lists of the table whose items have a
 *  place, `placedObjects`: its objects that have one (the plunger), both as the format's schema gives them; `data`: the table's tree. */
export function outlines(t: TableDef, data: any, root: Schema, placedLists: string[], placedObjects: string[]): Outline[] {
  const looks = new Looks(t), out: Outline[] = [];
  for (const list of placedLists) {
    const items: any = data[list], n: i32 = items.length;
    for (let i = 0; i < n; i++) {
      const o = new Outline(`${list}[${i}]`);
      if (list === 'walls') wallOutline(o, t.walls[i], looks);
      else if (list === 'gates') gateOutline(o, t.gates[i], looks);
      else if (list === 'flippers') flipperShapes(o, t.flippers[i], looks);
      else if (list === 'bumpers') bumperOutline(o, t.bumpers[i], looks);
      else if (list === 'slingshots') slingshotOutline(o, t.slingshots[i], looks);
      else if (list === 'kickers') kickerOutline(o, t.kickers[i], looks);
      else if (list === 'targets') targetOutline(o, t.targets[i], looks);
      else if (list === 'rollovers') rolloverOutline(o, t.rollovers[i]);
      else if (list === 'spinners') spinnerOutline(o, t.spinners[i], looks);
      else if (list === 'ramps') rampOutline(o, t.ramps[i], looks, t.playfield.glass);
      else if (list === 'floors') floorOutline(o, t.floors[i], looks);
      else if (list === 'lights') lightOutline(o, t.lights[i]);
      else if (list === 'models') modelOutline(o, t.models[i], looks);
      else { const f = root.field(list); if (f !== null && f.of !== null) generic(o, f.of as Schema, items[i]); }
      o.bound();
      out.push(o);
    }
  }
  for (const name of placedObjects) {
    const o = new Outline(name);
    if (name === 'plunger') plungerOutline(o, t.plunger, looks);
    else { const f = root.field(name); if (f !== null && f.of !== null) generic(o, f.of as Schema, data[name]); }
    o.bound();
    out.push(o);
  }
  return out;
}
/** The colour of the board in the top view. */
export function boardColor(t: TableDef): i32 {
  for (const l of t.looks) if (l.id === t.playfield.look) return rgb(l.color);
  return 0x16224a;
}
