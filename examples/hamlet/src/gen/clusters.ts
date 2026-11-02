// Helpers for things that come in groups: Worley regions (the nearest of jittered feature points, one per grid cell) and the falloff of a patch.
// Integer hash and + - * / only (no sin, no sqrt needed for the comparisons), so a seed gives the same regions on every engine.
import { hash } from '../world/noise';

/** The region of (x, y): the nearest feature point of a jittered grid of `cell` tiles. Returns a number in [0, 1) that is the same over the whole region (use it as a dice). */
export function worley(x: number, y: number, cell: number, seed: number): number {
  const gx = Math.floor(x / cell), gy = Math.floor(y / cell);
  let best = 1e18, id = 0;
  for (let b = gy - 1; b <= gy + 1; b++) for (let a = gx - 1; a <= gx + 1; a++) {
    const fx = (a + .15 + hash(a + seed, b * 3 + 17) * .7) * cell, fy = (b + .15 + hash(a * 5 + 3, b + seed) * .7) * cell, dx = x - fx, dy = y - fy, d = dx * dx + dy * dy;
    if (d < best) { best = d; id = hash(a * 31 + seed, b * 17 + 5); }
  }
  return id;
}

/** How rich a patch is at squared distance d2 from its centre, 1 in the middle, 0 at the radius r (a smooth bowl). */
export function falloff(d2: number, r: number): number { const u = 1 - d2 / (r * r + 1); return u <= 0 ? 0 : u * u; }

/** Clark-Evans index R of a point set in an area (nearest neighbour mean over the mean of a random scatter, .5 / sqrt(density)): about 1 for random, below 1 for clusters, 2.15 for a hexagonal grid. */
export function clarkEvans(xs: number[], ys: number[], area: number): number {
  const n = xs.length;
  if (n < 2) return 1;
  let sum = 0;
  for (let a = 0; a < n; a++) { let best = 1e18; for (let b = 0; b < n; b++) if (b !== a) { const dx = xs[a] - xs[b], dy = ys[a] - ys[b], d = dx * dx + dy * dy; if (d < best) best = d; } sum += Math.sqrt(best); }
  return (sum / n) / (.5 * Math.sqrt(area / n));
}
