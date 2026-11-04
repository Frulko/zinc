// The layer geometry, the same maths as the compositor (plugins/mapping/native/mapping.host.cpp). Output coordinates are 0..1 of the picture.
export type Mat3 = number[];
export type Point = [number, number];

export function multiply(a: Mat3, b: Mat3): Mat3 {
  const r: Mat3 = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
  }
  return r;
}

export function invert(m: Mat3): Mat3 {
  const A = m[4] * m[8] - m[5] * m[7], B = m[5] * m[6] - m[3] * m[8], C = m[3] * m[7] - m[4] * m[6];
  const det = m[0] * A + m[1] * B + m[2] * C;
  return [A, m[2] * m[7] - m[1] * m[8], m[1] * m[5] - m[2] * m[4], B, m[0] * m[8] - m[2] * m[6], m[2] * m[3] - m[0] * m[5], C, m[1] * m[6] - m[0] * m[7], m[0] * m[4] - m[1] * m[3]].map((v: number) => v / det);
}

export function apply(m: Mat3, x: number, y: number): Point {
  const w = m[6] * x + m[7] * y + m[8];
  return [(m[0] * x + m[1] * y + m[2]) / w, (m[3] * x + m[4] * y + m[5]) / w];
}

/** The homography from the unit square to the four corners (x, y pairs: top-left, top-right, bottom-right, bottom-left). */
export function homography(c: number[]): Mat3 {
  const dx1 = c[2] - c[4], dx2 = c[6] - c[4], dx3 = c[0] - c[2] + c[4] - c[6];
  const dy1 = c[3] - c[5], dy2 = c[7] - c[5], dy3 = c[1] - c[3] + c[5] - c[7];
  const det = dx1 * dy2 - dx2 * dy1;
  const g = Math.abs(det) > 1e-9 ? (dx3 * dy2 - dx2 * dy3) / det : 0;
  const k = Math.abs(det) > 1e-9 ? (dx1 * dy3 - dx3 * dy1) / det : 0;
  return [c[2] - c[0] + g * c[2], c[6] - c[0] + k * c[6], c[0], c[3] - c[1] + g * c[3], c[7] - c[1] + k * c[7], c[1], g, k, 1];
}

/** A layer as the geometry needs it. */
export interface Placement { corners: number[]; position: number[]; scale: number; rotation: number; mesh: number[] }

/** The layer's position, scale and rotation, around the centre of its corners. */
export function placementTransform(p: Placement, aspect: number): Mat3 {
  const c = p.corners;
  const cx = (c[0] + c[2] + c[4] + c[6]) / 4, cy = (c[1] + c[3] + c[5] + c[7]) / 4;
  const angle = p.rotation * Math.PI / 180;
  const cs = Math.cos(angle) * p.scale, sn = Math.sin(angle) * p.scale;
  const toCentre: Mat3 = [1, 0, -cx, 0, 1, -cy, 0, 0, 1];
  const turn: Mat3 = [cs, -sn / aspect, 0, sn * aspect, cs, 0, 0, 0, 1];
  const back: Mat3 = [1, 0, cx + p.position[0], 0, 1, cy + p.position[1], 0, 0, 1];
  return multiply(back, multiply(turn, toCentre));
}

/** From the layer's unit square to the output. */
export function placementMatrix(p: Placement, aspect: number): Mat3 {
  return multiply(placementTransform(p, aspect), homography(p.corners));
}

function controlPoint(mesh: number[], i: i32, j: i32): Point {
  const cols: i32 = mesh[0] as i32, rows: i32 = mesh[1] as i32;
  if (i < 0 || i >= cols) {
    const a = controlPoint(mesh, i < 0 ? 0 : cols - 1, j), b = controlPoint(mesh, i < 0 ? 1 : cols - 2, j);
    return [2 * a[0] - b[0], 2 * a[1] - b[1]];
  }
  if (j < 0 || j >= rows) {
    const a = controlPoint(mesh, i, j < 0 ? 0 : rows - 1), b = controlPoint(mesh, i, j < 0 ? 1 : rows - 2);
    return [2 * a[0] - b[0], 2 * a[1] - b[1]];
  }
  const at = 2 + (j * cols + i) * 2;
  return [mesh[at], mesh[at + 1]];
}

function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
}

/** Where the deformation grid sends (s, t) of the layer's unit square. */
export function warp(mesh: number[], s: number, t: number): Point {
  const cols: i32 = mesh[0] as i32, rows: i32 = mesh[1] as i32;
  const fx = s * (cols - 1), fy = t * (rows - 1);
  const i: i32 = Math.min(Math.floor(fx), cols - 2) as i32, j: i32 = Math.min(Math.floor(fy), rows - 2) as i32;
  const u = fx - i, v = fy - j;
  const xs: number[] = [], ys: number[] = [];
  for (let b: i32 = 0; b < 4; b++) {
    const p0 = controlPoint(mesh, i - 1, j - 1 + b), p1 = controlPoint(mesh, i, j - 1 + b);
    const p2 = controlPoint(mesh, i + 1, j - 1 + b), p3 = controlPoint(mesh, i + 2, j - 1 + b);
    xs.push(catmullRom(p0[0], p1[0], p2[0], p3[0], u));
    ys.push(catmullRom(p0[1], p1[1], p2[1], p3[1], u));
  }
  return [catmullRom(xs[0], xs[1], xs[2], xs[3], v), catmullRom(ys[0], ys[1], ys[2], ys[3], v)];
}

/** The pixels of the output the layer covers: a media of this size is shown 1:1, a bigger one wastes decoding. */
export function footprint(p: Placement, aspect: number, pixels: number[]): Point {
  const T = placementTransform(p, aspect);
  const corner = (i: i32): Point => {
    const a = apply(T, p.corners[i * 2], p.corners[i * 2 + 1]);
    return [a[0] * pixels[0], a[1] * pixels[1]];
  };
  const q0 = corner(0), q1 = corner(1), q2 = corner(2), q3 = corner(3);
  const length = (a: Point, b: Point): number => Math.hypot(a[0] - b[0], a[1] - b[1]);
  return [Math.max(length(q0, q1), length(q3, q2)), Math.max(length(q0, q3), length(q1, q2))];
}

function evenUp(value: number): number { return Math.max(2, Math.ceil(value / 2) * 2); }

/** The size a media should have for a layer: the pixels it covers, shaped like the real surface when its size is known (0 when not). */
export function mediaSize(covered: Point, surfaceW: number, surfaceH: number): Point {
  if (surfaceW <= 0 || surfaceH <= 0) return [evenUp(covered[0]), evenUp(covered[1])];
  const shape = surfaceW / surfaceH;
  if (covered[0] / covered[1] > shape) return [evenUp(covered[0]), evenUp(covered[0] / shape)];
  return [evenUp(covered[1] * shape), evenUp(covered[1])];
}

const MASK_HEADER: i32 = 2;   // feather and invert come before the points

/** Puts a point in a mask's outline on the edge nearest to it, so that clicking around a shape never makes the outline cross itself. */
export function insertMaskPoint(mask: number[], x: number, y: number): void {
  const count: i32 = ((mask.length - MASK_HEADER) / 2) as i32;
  let bestEdge: i32 = count - 1, bestDistance = Infinity;
  for (let edge: i32 = 0; edge < count; edge++) {
    const ax = mask[MASK_HEADER + edge * 2], ay = mask[MASK_HEADER + edge * 2 + 1];
    const next: i32 = (edge + 1) % count;
    const bx = mask[MASK_HEADER + next * 2], by = mask[MASK_HEADER + next * 2 + 1];
    const dx = bx - ax, dy = by - ay;
    const lengthSquared = dx * dx + dy * dy;
    const along = lengthSquared > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / lengthSquared)) : 0;
    const distance = Math.hypot(ax + along * dx - x, ay + along * dy - y);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestEdge = edge;
    }
  }
  mask.splice(MASK_HEADER + (bestEdge + 1) * 2, 0, x, y);
}
