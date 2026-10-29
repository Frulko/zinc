// Carving the stage into regions.
//
// Zones are not just labels: each one owns a slice of surface. We compute the Voronoi
// diagram of their positions — which gives exactly "the circle cut into sectors" for a
// circular layout, cells for a grid, and the matching tiling for a custom layout. One
// formula for all three.
//
// Method: half-plane clipping. Start from the stage rectangle and, for every other seed,
// cut along the perpendicular bisector. O(n²) over polygons of a few vertices — at twelve
// zones it is instant, and it avoids pulling in a geometry library.

import type { Point, Polygon } from './types.js';

/** Keeps the part of `poly` closer to `a` than to `b`. */
function clipHalfPlane(poly: Polygon, a: Point, b: Point): Polygon {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const nx = b.x - a.x;
  const ny = b.y - a.y;
  const side = (p: [number, number]) => (p[0] - mx) * nx + (p[1] - my) * ny; // < 0 = on a's side
  const out: Polygon = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % poly.length]!;
    const dp = side(p);
    const dq = side(q);
    if (dp <= 0) out.push(p);
    if (dp * dq < 0) {
      const t = dp / (dp - dq);
      out.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]);
    }
  }
  return out;
}

/** Voronoi cells of `pts` inside a w×h rectangle, in the same order. */
export function voronoi(pts: Point[], w: number, h: number): Polygon[] {
  return pts.map((p, i) => {
    let poly: Polygon = [
      [0, 0],
      [w, 0],
      [w, h],
      [0, h],
    ];
    for (let j = 0; j < pts.length && poly.length; j++) if (j !== i) poly = clipHalfPlane(poly, p, pts[j]!);
    return poly;
  });
}

/** Point-in-polygon by ray casting. */
export function inPolygon(poly: Polygon, x: number, y: number): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!;
    const [xj, yj] = poly[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/** SVG path of a polygon. */
export const pathOf = (poly: Polygon): string =>
  poly.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('') + 'Z';
