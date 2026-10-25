// Gameplay switches: lines crossed by a ball between two Box2D positions.
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
