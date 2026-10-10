// Where a line of sight meets a 3D model: what puts a point of interest on the place of the object the author clicked. Pure code: the
// triangles are read from the text of an OBJ file (the renderer keeps its meshes to itself), the line comes from the object viewer
// (../src/viewer.ts `ray`).

/** The triangles of a model: `at` holds x, y, z of every vertex, `corners` three vertex numbers per triangle. */
export class Shape {
  at: number[] = [];
  corners: i32[] = [];
}

/** The triangles of an OBJ text: its `v` and `f` lines (a face of more than three corners is cut in a fan; `f 1/2/3` and negative numbers
 *  are read as the format says). */
export function parseShape(obj: string): Shape {
  const shape = new Shape();
  let from: i32 = 0;
  while (from < obj.length) {
    let end = obj.indexOf('\n', from);
    if (end < 0) end = obj.length;
    const a = obj.charCodeAt(from), b = obj.charCodeAt(from + 1);
    if (a === 118 && b === 32) {   // "v "
      const p = obj.slice(from + 2, end).trim().split(' ');
      for (let i = 0; i < 3; i++) shape.at.push(i < p.length ? parseFloat(p[i]) : 0);
    } else if (a === 102 && b === 32) {   // "f "
      const p = obj.slice(from + 2, end).trim().split(' ').filter((w: string) => w.length > 0), n: i32 = shape.at.length / 3, ids: i32[] = [];
      for (const w of p) {
        const v: i32 = parseInt(w, 10);   // "12/7/3": parseInt stops at the slash
        ids.push(v < 0 ? n + v : v - 1);
      }
      for (let i = 1; i + 1 < ids.length; i++) { shape.corners.push(ids[0]); shape.corners.push(ids[i]); shape.corners.push(ids[i + 1]); }
    }
    from = end + 1;
  }
  return shape;
}

/** How far along the line o + t d the shape is first met, from either side of a triangle: t, or -1 when the line misses it.
 *  ponytail: every triangle is tried (12,000 for the sample vase, a few milliseconds a click); a grid over the triangles when models of
 *  hundreds of thousands are dragged over. */
export function hit(shape: Shape, o: number[], d: number[]): number {
  const p = shape.at, c = shape.corners;
  let best = -1;
  for (let i = 0; i + 2 < c.length; i += 3) {
    const a = c[i] * 3, b = c[i + 1] * 3, e = c[i + 2] * 3;
    // Möller and Trumbore: the triangle's two edges, and the line against them
    const e1x = p[b] - p[a], e1y = p[b + 1] - p[a + 1], e1z = p[b + 2] - p[a + 2], e2x = p[e] - p[a], e2y = p[e + 1] - p[a + 1], e2z = p[e + 2] - p[a + 2];
    const hx = d[1] * e2z - d[2] * e2y, hy = d[2] * e2x - d[0] * e2z, hz = d[0] * e2y - d[1] * e2x, det = e1x * hx + e1y * hy + e1z * hz;
    if (det > -1e-12 && det < 1e-12) continue;   // the line lies in the triangle's plane
    const sx = o[0] - p[a], sy = o[1] - p[a + 1], sz = o[2] - p[a + 2], u = (sx * hx + sy * hy + sz * hz) / det;
    if (u < 0 || u > 1) continue;
    const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x, v = (d[0] * qx + d[1] * qy + d[2] * qz) / det;
    if (v < 0 || u + v > 1) continue;
    const t = (e2x * qx + e2y * qy + e2z * qz) / det;
    if (t > 0 && (best < 0 || t < best)) best = t;
  }
  return best;
}
