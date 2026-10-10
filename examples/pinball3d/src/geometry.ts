// Shapes from table data, shared by what draws the table (scene.ts) and what the ball collides with (physics.ts): a
// path with arcs becomes a polyline, a polyline a wall or a track, a profile a height. Everything here is in table
// coordinates (x right, y down the table, z up, centimetres); a Solid stores its triangles in the engine's (x right,
// y up, z towards the player), so the same lists go to zinc:3d and to zinc:physics3d.

const DEG = Math.PI / 180;
export function rad(degrees: number): number { return degrees * DEG; }

/** A path seen from above, as straight stretches. */
export class Polyline {
  xs: number[] = [];
  ys: number[] = [];
  /** The distance along the path to each point. */
  at: number[] = [];
  closed: boolean = false;
  length: number = 0;
  add(x: number, y: number): void {
    const n = this.xs.length;
    if (n > 0) {
      const dx = x - this.xs[n - 1], dy = y - this.ys[n - 1];
      if (dx * dx + dy * dy < 1e-10) return;
      this.length += Math.sqrt(dx * dx + dy * dy);
    }
    this.xs.push(x); this.ys.push(y); this.at.push(this.length);
  }
  count(): i32 { return this.xs.length; }
}

/** The polyline of a path of the format: [x, y] rows, [x, y, bulge] when the stretch to the next point is an arc.
 *  An arc is cut so that no piece turns more than 9 degrees. */
export function tessellate(points: number[][], closed: boolean): Polyline {
  const out = new Polyline();
  out.closed = closed;
  const n = points.length, last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p = points[i], q = points[(i + 1) % n];
    out.add(p[0], p[1]);
    const bulge = p.length > 2 ? p[2] : 0;
    if (bulge === 0) continue;
    const dx = q[0] - p[0], dy = q[1] - p[1], chord = Math.sqrt(dx * dx + dy * dy);
    if (chord === 0) continue;
    // the left of the direction of travel, as the top view shows it (y grows downwards): (dy, -dx)
    const nx = dy / chord, ny = -dx / chord;
    const half = chord / 2, s = bulge * half, r = (half * half + s * s) / (2 * Math.abs(s));
    const k = s - (s > 0 ? r : -r);
    const cx = (p[0] + q[0]) / 2 + nx * k, cy = (p[1] + q[1]) / 2 + ny * k;
    const turn = 4 * Math.atan2(Math.abs(bulge), 1);
    // the arc turns one way or the other around its centre: the way that passes through its apex
    const ax = (p[0] + q[0]) / 2 + nx * s, ay = (p[1] + q[1]) / 2 + ny * s;
    const vx = p[0] - cx, vy = p[1] - cy;
    const mid = (sign: number): number => {
      const a = sign * turn / 2, c = Math.cos(a), sn = Math.sin(a);
      const mx = cx + vx * c - vy * sn - ax, my = cy + vx * sn + vy * c - ay;
      return mx * mx + my * my;
    };
    const way = mid(1) < mid(-1) ? 1 : -1;
    const pieces: i32 = Math.max(2, Math.ceil(turn / (9 * DEG)));
    for (let j = 1; j < pieces; j++) {
      const a = way * turn * j / pieces, c = Math.cos(a), sn = Math.sin(a);
      out.add(cx + vx * c - vy * sn, cy + vx * sn + vy * c);
    }
  }
  if (!closed) out.add(points[n - 1][0], points[n - 1][1]);
  return out;
}

/** The height of a profile ([fraction, height] rows) at a fraction of the path. */
export function profileAt(profile: number[][], t: number): number {
  if (t <= profile[0][0]) return profile[0][1];
  for (let i = 1; i < profile.length; i++) {
    if (t <= profile[i][0]) {
      const a = profile[i - 1], b = profile[i];
      return a[1] + (b[1] - a[1]) * (t - a[0]) / (b[0] - a[0]);
    }
  }
  return profile[profile.length - 1][1];
}

/** A polyline with a point wherever the profile bends, so that a track follows its height exactly. */
export function withProfilePoints(line: Polyline, profile: number[][]): Polyline {
  const out = new Polyline();
  out.closed = line.closed;
  let next = 0;
  for (let i = 0; i < line.count(); i++) {
    while (next < profile.length && profile[next][0] * line.length < line.at[i] - 1e-6) {
      const d = profile[next][0] * line.length;
      if (i > 0 && d > line.at[i - 1] + 1e-6) {
        const f = (d - line.at[i - 1]) / (line.at[i] - line.at[i - 1]);
        out.add(line.xs[i - 1] + (line.xs[i] - line.xs[i - 1]) * f, line.ys[i - 1] + (line.ys[i] - line.ys[i - 1]) * f);
      }
      next++;
    }
    out.add(line.xs[i], line.ys[i]);
  }
  return out;
}

/** The two sides of a path, `half` away from it: left and right of the direction of travel, joints mitred. */
export class Sides {
  lx: number[] = []; ly: number[] = [];
  rx: number[] = []; ry: number[] = [];
}
export function offset(line: Polyline, half: number): Sides {
  const s = new Sides();
  const n = line.count();
  for (let i = 0; i < n; i++) {
    const hasPrev = i > 0 || line.closed, hasNext = i < n - 1 || line.closed;
    const p = (i + n - 1) % n, q = (i + 1) % n;
    let ax = 0, ay = 0, bx = 0, by = 0;
    if (hasPrev) { const dx = line.xs[i] - line.xs[p], dy = line.ys[i] - line.ys[p], l = Math.sqrt(dx * dx + dy * dy); ax = dy / l; ay = -dx / l; }
    if (hasNext) { const dx = line.xs[q] - line.xs[i], dy = line.ys[q] - line.ys[i], l = Math.sqrt(dx * dx + dy * dy); bx = dy / l; by = -dx / l; }
    if (!hasPrev) { ax = bx; ay = by; }
    if (!hasNext) { bx = ax; by = ay; }
    // the mitre: along the mean of the two normals, longer where the path turns (at most three times: a hairpin is cut)
    let mx = ax + bx, my = ay + by;
    const ml = Math.sqrt(mx * mx + my * my);
    if (ml < 1e-6) { mx = ax; my = ay; } else { mx /= ml; my /= ml; }
    const k = Math.min(3, 1 / Math.max(0.2, mx * ax + my * ay)) * half;
    s.lx.push(line.xs[i] + mx * k); s.ly.push(line.ys[i] + my * k);
    s.rx.push(line.xs[i] - mx * k); s.ry.push(line.ys[i] - my * k);
  }
  return s;
}

/** Triangles with normals, for a mesh to draw and a shape to collide with. Points are given in table coordinates. */
export class Solid {
  pos: number[] = [];
  nrm: number[] = [];
  idx: i32[] = [];

  /** A vertex at table (x, y, z) with table normal (nx, ny, nz). */
  vertex(x: number, y: number, z: number, nx: number, ny: number, nz: number): i32 {
    this.pos.push(x); this.pos.push(z); this.pos.push(y);
    this.nrm.push(nx); this.nrm.push(nz); this.nrm.push(ny);
    return this.pos.length / 3 - 1;
  }
  /** A triangle, turned so that its front is on the side its vertices' normals point to. */
  triangle(a: i32, b: i32, c: i32): void {
    const p = this.pos, n = this.nrm;
    const ux = p[b * 3] - p[a * 3], uy = p[b * 3 + 1] - p[a * 3 + 1], uz = p[b * 3 + 2] - p[a * 3 + 2];
    const vx = p[c * 3] - p[a * 3], vy = p[c * 3 + 1] - p[a * 3 + 1], vz = p[c * 3 + 2] - p[a * 3 + 2];
    const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
    const facing = fx * (n[a * 3] + n[b * 3] + n[c * 3]) + fy * (n[a * 3 + 1] + n[b * 3 + 1] + n[c * 3 + 1]) + fz * (n[a * 3 + 2] + n[b * 3 + 2] + n[c * 3 + 2]);
    this.idx.push(a);
    if (facing >= 0) { this.idx.push(b); this.idx.push(c); } else { this.idx.push(c); this.idx.push(b); }
  }
  quad(a: i32, b: i32, c: i32, d: i32): void { this.triangle(a, b, c); this.triangle(a, c, d); }
  /** A flat four-sided face through four table points, facing (nx, ny, nz). */
  face(p: number[], q: number[], r: number[], s: number[], nx: number, ny: number, nz: number): void {
    this.quad(this.vertex(p[0], p[1], p[2], nx, ny, nz), this.vertex(q[0], q[1], q[2], nx, ny, nz),
      this.vertex(r[0], r[1], r[2], nx, ny, nz), this.vertex(s[0], s[1], s[2], nx, ny, nz));
  }
  triangles(): i32 { return this.idx.length / 3; }
}

/** A wall: the path raised from z0 to z1, `thickness` wide. */
export function wall(out: Solid, line: Polyline, z0: number, z1: number, thickness: number): void {
  const s = offset(line, thickness / 2), n = line.count();
  const last = line.closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const j = (i + 1) % n;
    const dx = line.xs[j] - line.xs[i], dy = line.ys[j] - line.ys[i], l = Math.sqrt(dx * dx + dy * dy);
    const nx = dy / l, ny = -dx / l;
    out.face([s.lx[i], s.ly[i], z0], [s.lx[j], s.ly[j], z0], [s.lx[j], s.ly[j], z1], [s.lx[i], s.ly[i], z1], nx, ny, 0);
    out.face([s.rx[i], s.ry[i], z0], [s.rx[j], s.ry[j], z0], [s.rx[j], s.ry[j], z1], [s.rx[i], s.ry[i], z1], -nx, -ny, 0);
    out.face([s.lx[i], s.ly[i], z1], [s.lx[j], s.ly[j], z1], [s.rx[j], s.ry[j], z1], [s.rx[i], s.ry[i], z1], 0, 0, 1);
    out.face([s.lx[i], s.ly[i], z0], [s.lx[j], s.ly[j], z0], [s.rx[j], s.ry[j], z0], [s.rx[i], s.ry[i], z0], 0, 0, -1);
  }
  if (!line.closed) {
    const e = n - 1;
    const tx = (line.xs[1] - line.xs[0]), ty = (line.ys[1] - line.ys[0]), tl = Math.sqrt(tx * tx + ty * ty);
    out.face([s.lx[0], s.ly[0], z0], [s.rx[0], s.ry[0], z0], [s.rx[0], s.ry[0], z1], [s.lx[0], s.ly[0], z1], -tx / tl, -ty / tl, 0);
    const ux = (line.xs[e] - line.xs[e - 1]), uy = (line.ys[e] - line.ys[e - 1]), ul = Math.sqrt(ux * ux + uy * uy);
    out.face([s.lx[e], s.ly[e], z0], [s.rx[e], s.ry[e], z0], [s.rx[e], s.ry[e], z1], [s.lx[e], s.ly[e], z1], ux / ul, uy / ul, 0);
  }
}

/** A track: a ribbon `width` wide that follows the path at the height of the profile, `thickness` thick, with side
 *  walls `rim` high (0: none). Where its underside is lower than `skirt` (0: nowhere) it is closed down to the playfield:
 *  the sides go down, and a lip crosses under it where it gets high enough for a ball to pass. */
export function track(out: Solid, line: Polyline, profile: number[][], width: number, thickness: number, rim: number, skirt: number): void {
  const path = withProfilePoints(line, profile);
  const n = path.count(), wallT = Math.min(0.3, width * 0.1);
  const inner = offset(path, width / 2), outer = offset(path, width / 2 + wallT);
  const z: number[] = [];
  for (let i = 0; i < n; i++) z.push(profileAt(profile, path.length > 0 ? path.at[i] / path.length : 0));
  for (let i = 0; i + 1 < n; i++) {
    const j = i + 1;
    const dx = path.xs[j] - path.xs[i], dy = path.ys[j] - path.ys[i], l = Math.sqrt(dx * dx + dy * dy);
    const nx = dy / l, ny = -dx / l;
    // the slope of the track tilts its normal backwards
    const slope = (z[j] - z[i]) / l, up = 1 / Math.sqrt(1 + slope * slope);
    const ux = -dx / l * slope * up, uy = -dy / l * slope * up;
    out.face([outer.lx[i], outer.ly[i], z[i]], [outer.lx[j], outer.ly[j], z[j]], [outer.rx[j], outer.ry[j], z[j]], [outer.rx[i], outer.ry[i], z[i]], ux, uy, up);
    out.face([outer.lx[i], outer.ly[i], z[i] - thickness], [outer.lx[j], outer.ly[j], z[j] - thickness], [outer.rx[j], outer.ry[j], z[j] - thickness], [outer.rx[i], outer.ry[i], z[i] - thickness], -ux, -uy, -up);
    const top = rim > 0 ? rim : 0;
    // the outer faces of the two sides, from the underside (or the playfield, under a low stretch) to the top of the rim
    const low = Math.min(z[i], z[j]) - thickness < skirt;
    const fi = low ? 0 : z[i] - thickness, fj = low ? 0 : z[j] - thickness;
    out.face([outer.lx[i], outer.ly[i], fi], [outer.lx[j], outer.ly[j], fj], [outer.lx[j], outer.ly[j], z[j] + top], [outer.lx[i], outer.ly[i], z[i] + top], nx, ny, 0);
    out.face([outer.rx[i], outer.ry[i], fi], [outer.rx[j], outer.ry[j], fj], [outer.rx[j], outer.ry[j], z[j] + top], [outer.rx[i], outer.ry[i], z[i] + top], -nx, -ny, 0);
    // the lip: across the track where a low stretch meets one a ball can pass under, or where the track ends low
    const lowNext = j + 1 < n && Math.min(z[j], z[j + 1]) - thickness < skirt;
    if (low !== lowNext && z[j] - thickness > 0.01) {
      const way = low ? 1 : -1;
      out.face([outer.lx[j], outer.ly[j], 0], [outer.rx[j], outer.ry[j], 0], [outer.rx[j], outer.ry[j], z[j] - thickness], [outer.lx[j], outer.ly[j], z[j] - thickness], dx / l * way, dy / l * way, 0);
    }
    if (i === 0 && low && z[0] - thickness > 0.01) {
      out.face([outer.lx[0], outer.ly[0], 0], [outer.rx[0], outer.ry[0], 0], [outer.rx[0], outer.ry[0], z[0] - thickness], [outer.lx[0], outer.ly[0], z[0] - thickness], -dx / l, -dy / l, 0);
    }
    if (rim > 0) {
      // the inner faces, which the ball rides against, and the top of each rim
      out.face([inner.lx[i], inner.ly[i], z[i]], [inner.lx[j], inner.ly[j], z[j]], [inner.lx[j], inner.ly[j], z[j] + rim], [inner.lx[i], inner.ly[i], z[i] + rim], -nx, -ny, 0);
      out.face([inner.rx[i], inner.ry[i], z[i]], [inner.rx[j], inner.ry[j], z[j]], [inner.rx[j], inner.ry[j], z[j] + rim], [inner.rx[i], inner.ry[i], z[i] + rim], nx, ny, 0);
      out.face([inner.lx[i], inner.ly[i], z[i] + rim], [inner.lx[j], inner.ly[j], z[j] + rim], [outer.lx[j], outer.ly[j], z[j] + rim], [outer.lx[i], outer.ly[i], z[i] + rim], 0, 0, 1);
      out.face([inner.rx[i], inner.ry[i], z[i] + rim], [inner.rx[j], inner.ry[j], z[j] + rim], [outer.rx[j], outer.ry[j], z[j] + rim], [outer.rx[i], outer.ry[i], z[i] + rim], 0, 0, 1);
    }
  }
}

/** A wire that follows a path at a height above the profile, `side` away from it (negative: to the right): a square
 *  rod of half width `r`. Four of them draw a habitrail. */
export function wire(out: Solid, line: Polyline, profile: number[][], side: number, lift: number, r: number): void {
  const path = withProfilePoints(line, profile);
  const n = path.count();
  const a = offset(path, side - r), b = offset(path, side + r);
  const z: number[] = [];
  for (let i = 0; i < n; i++) z.push(profileAt(profile, path.length > 0 ? path.at[i] / path.length : 0) + lift);
  for (let i = 0; i + 1 < n; i++) {
    const j = i + 1;
    const dx = path.xs[j] - path.xs[i], dy = path.ys[j] - path.ys[i], l = Math.sqrt(dx * dx + dy * dy);
    const nx = dy / l, ny = -dx / l;
    out.face([b.lx[i], b.ly[i], z[i] - r], [b.lx[j], b.ly[j], z[j] - r], [b.lx[j], b.ly[j], z[j] + r], [b.lx[i], b.ly[i], z[i] + r], nx, ny, 0);
    out.face([a.lx[i], a.ly[i], z[i] - r], [a.lx[j], a.ly[j], z[j] - r], [a.lx[j], a.ly[j], z[j] + r], [a.lx[i], a.ly[i], z[i] + r], -nx, -ny, 0);
    out.face([a.lx[i], a.ly[i], z[i] + r], [a.lx[j], a.ly[j], z[j] + r], [b.lx[j], b.ly[j], z[j] + r], [b.lx[i], b.ly[i], z[i] + r], 0, 0, 1);
    out.face([a.lx[i], a.ly[i], z[i] - r], [a.lx[j], a.ly[j], z[j] - r], [b.lx[j], b.ly[j], z[j] - r], [b.lx[i], b.ly[i], z[i] - r], 0, 0, -1);
  }
}

/** A box between two table points seen from above, `thickness` wide, from z0 to z1 (a target, a band, a gate). */
export function slab(out: Solid, ax: number, ay: number, bx: number, by: number, z0: number, z1: number, thickness: number): void {
  const line = new Polyline();
  line.add(ax, ay); line.add(bx, by);
  wall(out, line, z0, z1, thickness);
}

/** A solid of revolution around the vertical through (cx, cy): the profile is [radius, height] rows from the bottom
 *  up (a bumper, a post, a cap, a rim). */
export function lathe(out: Solid, cx: number, cy: number, z0: number, profile: number[][], segments: i32): void {
  for (let k = 0; k + 1 < profile.length; k++) {
    const r0 = profile[k][0], h0 = profile[k][1], r1 = profile[k + 1][0], h1 = profile[k + 1][1];
    // the normal of this band: outwards, tilted by its slope
    const dr = r1 - r0, dh = h1 - h0, l = Math.sqrt(dr * dr + dh * dh);
    if (l === 0) continue;
    const no = dh / l, nz = -dr / l;
    let prevA = -1, prevB = -1, firstA = -1, firstB = -1;
    for (let s = 0; s < segments; s++) {
      const a = 2 * Math.PI * s / segments, c = Math.cos(a), sn = Math.sin(a);
      const va = out.vertex(cx + c * r0, cy + sn * r0, z0 + h0, c * no, sn * no, nz);
      const vb = out.vertex(cx + c * r1, cy + sn * r1, z0 + h1, c * no, sn * no, nz);
      if (s === 0) { firstA = va; firstB = vb; } else out.quad(prevA, va, vb, prevB);
      prevA = va; prevB = vb;
    }
    out.quad(prevA, firstA, firstB, prevB);
  }
}

/** A flat shape on a level: a polygon (x, y pairs) at height z, facing up. Convex, or star-shaped around its first point. */
export function plate(out: Solid, xy: number[], z: number): void {
  const first = out.vertex(xy[0], xy[1], z, 0, 0, 1);
  let prev = out.vertex(xy[2], xy[3], z, 0, 0, 1);
  for (let i = 4; i + 1 < xy.length; i += 2) {
    const v = out.vertex(xy[i], xy[i + 1], z, 0, 0, 1);
    out.triangle(first, prev, v);
    prev = v;
  }
}

/** The triangles (indices into the outline) of a simple polygon, by clipping ears. `xs`, `ys`: its outline. */
export function triangulate(xs: number[], ys: number[]): i32[] {
  const n = xs.length, out: i32[] = [];
  let area = 0;
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; area += xs[i] * ys[j] - xs[j] * ys[i]; }
  const order: i32[] = [];
  for (let i = 0; i < n; i++) order.push(area > 0 ? i : n - 1 - i);
  const cross = (a: i32, b: i32, c: i32): number => (xs[b] - xs[a]) * (ys[c] - ys[a]) - (ys[b] - ys[a]) * (xs[c] - xs[a]);
  let guard = n * n;
  while (order.length > 3 && guard-- > 0) {
    let cut = false;
    for (let i = 0; i < order.length; i++) {
      const a = order[(i + order.length - 1) % order.length], b = order[i], c = order[(i + 1) % order.length];
      if (cross(a, b, c) <= 1e-9) continue;   // a reflex corner is no ear
      let empty = true;
      for (const p of order) {
        if (p === a || p === b || p === c) continue;
        if (cross(a, b, p) >= 0 && cross(b, c, p) >= 0 && cross(c, a, p) >= 0) { empty = false; break; }
      }
      if (!empty) continue;
      out.push(a); out.push(b); out.push(c);
      order.splice(i, 1);
      cut = true;
      break;
    }
    if (!cut) break;   // a polygon that crosses itself: what is left is dropped
  }
  if (order.length === 3) { out.push(order[0]); out.push(order[1]); out.push(order[2]); }
  return out;
}

/** A level: the outline as a slab with its top at z. */
export function floor(out: Solid, line: Polyline, z: number, thickness: number): void {
  const tris = triangulate(line.xs, line.ys);
  for (const side of [1, -1]) {
    const h = side > 0 ? z : z - thickness;
    const base = out.pos.length / 3;
    for (let i = 0; i < line.count(); i++) out.vertex(line.xs[i], line.ys[i], h, 0, 0, side);
    for (let i = 0; i + 2 < tris.length; i += 3) out.triangle(base + tris[i], base + tris[i + 1], base + tris[i + 2]);
  }
  const n = line.count();
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const dx = line.xs[j] - line.xs[i], dy = line.ys[j] - line.ys[i], l = Math.sqrt(dx * dx + dy * dy);
    // the outside of an edge: away from the polygon, whichever way it winds (the triangle() test would need a point inside)
    const mx = (line.xs[i] + line.xs[j]) / 2 + dy / l * 0.01, my = (line.ys[i] + line.ys[j]) / 2 - dx / l * 0.01;
    const outward = inside(line, mx, my) ? -1 : 1;
    out.face([line.xs[i], line.ys[i], z - thickness], [line.xs[j], line.ys[j], z - thickness], [line.xs[j], line.ys[j], z], [line.xs[i], line.ys[i], z], dy / l * outward, -dx / l * outward, 0);
  }
}

/** Whether (x, y) is inside the closed outline. */
export function inside(line: Polyline, x: number, y: number): boolean {
  let odd = false;
  const n = line.count();
  for (let i = 0, j = n - 1; i < n; j = i++) {
    if ((line.ys[i] > y) !== (line.ys[j] > y) && x < (line.xs[j] - line.xs[i]) * (y - line.ys[i]) / (line.ys[j] - line.ys[i]) + line.xs[i]) odd = !odd;
  }
  return odd;
}

/** The outline of a flipper seen from above, its pivot at (0, 0) and its tip along +x: the base circle, the tip
 *  circle and the two lines that touch both. x, y pairs. */
export function flipperOutline(length: number, baseRadius: number, tipRadius: number): number[] {
  const out: number[] = [];
  const reach = length - tipRadius;   // the centre of the tip circle
  const lean = (baseRadius - tipRadius) / reach;
  const a = Math.atan2(lean, Math.sqrt(1 - lean * lean));   // how far the touching lines lean
  const steps = 6;
  for (let i = 0; i <= steps; i++) { const t = Math.PI / 2 + a + (Math.PI - 2 * a) * i / steps; out.push(Math.cos(t) * baseRadius); out.push(Math.sin(t) * baseRadius); }
  for (let i = 0; i <= steps; i++) { const t = -Math.PI / 2 - a + (Math.PI + 2 * a) * i / steps; out.push(reach + Math.cos(t) * tipRadius); out.push(Math.sin(t) * tipRadius); }
  return out;
}

/** A prism: an outline (x, y pairs around the origin) raised from 0 to `height`, for a body that is then placed and turned. */
export function prism(out: Solid, xy: number[], height: number): void {
  const n = xy.length / 2;
  plate(out, xy, height);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const dx = xy[j * 2] - xy[i * 2], dy = xy[j * 2 + 1] - xy[i * 2 + 1], l = Math.sqrt(dx * dx + dy * dy);
    if (l === 0) continue;
    // the outline goes round its inside: the outside of an edge is on its right when the area is positive
    out.face([xy[i * 2], xy[i * 2 + 1], 0], [xy[j * 2], xy[j * 2 + 1], 0], [xy[j * 2], xy[j * 2 + 1], height], [xy[i * 2], xy[i * 2 + 1], height], dy / l, -dx / l, 0);
  }
}
