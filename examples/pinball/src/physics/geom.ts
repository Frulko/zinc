// Swept (continuous) collision primitives: a ball centre moving from p to p + d against a circle and against a
// segment "inflated" by the ball radius (a capsule). Each test reports the earliest time of impact t in [0, 1] and
// the contact normal in `hit`. The displacement is relative to the shape (a moving flipper or plunger subtracts its
// own motion); a ball already overlapping the shape and moving further in reports t = 0 with the push-out normal. No allocation: results go to one object.
//
// Every division is guarded with `<=` against a tiny value: under the fixed-point profile (ps1, Q20.12) small
// numbers round to 0, and an integer division by zero would trap.

export class Hit {
  t: number = 2;         // > 1: no hit
  nx: number = 0;        // unit normal, pointing from the shape towards the ball
  ny: number = 0;
  inside: boolean = false;
}

export const hit = new Hit();

/** Moving point (px, py) + t (dx, dy) against the circle (cx, cy, r). Sets `hit` when it improves on hit.t. */
export function sweepCircle(px: number, py: number, dx: number, dy: number, cx: number, cy: number, r: number): boolean {
  const mx = px - cx, my = py - cy;
  const b = mx * dx + my * dy;
  const c = mx * mx + my * my - r * r;
  if (c < 0) {
    // already inside: a contact now, if moving further in (a separating overlap is left to the push-out pass)
    const len = Math.sqrt(mx * mx + my * my);
    if (b >= 0 || len <= 1e-6 || hit.t <= 0) return false;
    hit.t = 0; hit.nx = mx / len; hit.ny = my / len; hit.inside = true;
    return true;
  }
  if (b >= 0) return false;                 // moving away
  const a = dx * dx + dy * dy;
  if (a <= 1e-9) return false;
  const disc = b * b - a * c;
  if (disc < 0) return false;
  const t = (-b - Math.sqrt(disc)) / a;
  if (t < 0 || t > 1 || t >= hit.t) return false;
  const hx = mx + dx * t, hy = my + dy * t;
  const hl = Math.sqrt(hx * hx + hy * hy);
  if (hl <= 1e-6) return false;
  hit.t = t; hit.nx = hx / hl; hit.ny = hy / hl; hit.inside = false;
  return true;
}

/**
 * Moving point against the segment a -> b (unit tangent tx, ty, length len, unit normal nx, ny) inflated by r.
 * `oneSided`: only the side the normal points to collides (gates, flipper edges, the plunger); `caps`: test the
 * rounded ends too (off for flipper edges, whose ends are the flipper's circles).
 */
export function sweepSegment(px: number, py: number, dx: number, dy: number, ax: number, ay: number, tx: number, ty: number,
  len: number, nx: number, ny: number, r: number, oneSided: boolean, caps: boolean): boolean {
  const rx = px - ax, ry = py - ay;
  const dist = rx * nx + ry * ny;
  const u = rx * tx + ry * ty;
  if (oneSided && dist < 0) return false;
  const side: number = dist >= 0 ? 1 : -1;
  const sd = dist * side;                   // unsigned distance to the line
  let found = false;
  const vn = (dx * nx + dy * ny) * side;    // < 0: moving towards the line
  if (sd < r && u >= 0 && u <= len) {
    if (vn < 0 && hit.t > 0) { hit.t = 0; hit.nx = nx * side; hit.ny = ny * side; hit.inside = true; found = true; }
  } else if (vn < 0 && sd >= r) {
    const t = (sd - r) / -vn;
    if (t <= 1 && t < hit.t) {
      const uh = u + t * (dx * tx + dy * ty);
      if (uh >= 0 && uh <= len) { hit.t = t; hit.nx = nx * side; hit.ny = ny * side; hit.inside = false; found = true; }
    }
  }
  if (caps && !found) {
    if (sweepCircle(px, py, dx, dy, ax, ay, r)) found = true;
    if (sweepCircle(px, py, dx, dy, ax + tx * len, ay + ty * len, r)) found = true;
  }
  return found;
}

/** Signed distance of a point to a segment's line and its position along it (for sensors): results in cross. */
export class Crossing { t: number = 0; dir: number = 0; }
export const cross = new Crossing();

/** Did the move p0 -> p1 cross the segment a -> b? Sets cross.dir (+1: towards the normal side, -1: away). */
export function crosses(x0: number, y0: number, x1: number, y1: number, ax: number, ay: number, tx: number, ty: number,
  len: number, nx: number, ny: number): boolean {
  const s0 = (x0 - ax) * nx + (y0 - ay) * ny;
  const s1 = (x1 - ax) * nx + (y1 - ay) * ny;
  if ((s0 < 0) === (s1 < 0)) return false;
  const den = s0 - s1;
  if (den <= 1e-9 && den >= -1e-9) return false;
  const t = s0 / den;
  const u = (x0 + (x1 - x0) * t - ax) * tx + (y0 + (y1 - y0) * t - ay) * ty;
  if (u < 0 || u > len) return false;
  cross.t = t; cross.dir = s1 > s0 ? 1 : -1;
  return true;
}
