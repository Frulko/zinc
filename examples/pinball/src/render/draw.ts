// Drawing helpers over the camera: table-space shapes (polylines, circles, extruded walls) projected into flat point
// lists for zinc:gfx. One scratch array is reused (gfx copies the points when a command is recorded).
import { polygon, stroke } from 'zinc:gfx';
import { Camera } from './camera';

export const N_CIRCLE: i32 = 20;
export const COS: number[] = [];
export const SIN: number[] = [];
for (let i: i32 = 0; i <= N_CIRCLE; i++) { COS.push(Math.cos(Math.PI * 2 * i / N_CIRCLE)); SIN.push(Math.sin(Math.PI * 2 * i / N_CIRCLE)); }

export const pts: number[] = [];

/** Colour arithmetic: mix two 0xRRGGBB colours (t = 0: a, 1: b). */
export function mix(a: u32, b: u32, t: number): u32 {
  const k = Math.max(0, Math.min(1, t));
  const r = Math.round(((a >> 16) & 255) * (1 - k) + ((b >> 16) & 255) * k);
  const g = Math.round(((a >> 8) & 255) * (1 - k) + ((b >> 8) & 255) * k);
  const bl = Math.round((a & 255) * (1 - k) + (b & 255) * k);
  return ((r << 16) | (g << 8) | bl) as u32;
}

/** Projected circle (an ellipse on screen) of radius r around (x, y) at height z, into `pts`. */
export function circlePts(cam: Camera, x: number, y: number, z: number, r: number): void {
  pts.length = 0;
  for (let i: i32 = 0; i < N_CIRCLE; i++) { cam.project(x + COS[i] * r, y + SIN[i] * r, z); pts.push(cam.x); pts.push(cam.y); }
}

export function disc(cam: Camera, x: number, y: number, z: number, r: number, color: u32, alpha: i32): void {
  circlePts(cam, x, y, z, r);
  polygon(pts, color, alpha);
}

export function ring(cam: Camera, x: number, y: number, z: number, r: number, width: number, color: u32, alpha: i32): void {
  circlePts(cam, x, y, z, r);
  stroke(pts, width, color, alpha, true);
}

/** A vertical cylinder from z0 to z1: its silhouette (both end ellipses and the band between their widest points). */
export function cylinder(cam: Camera, x: number, y: number, z0: number, z1: number, r: number, color: u32, alpha: i32): void {
  pts.length = 0;
  // lower half of the bottom ellipse (front), then the upper half of the top one (back)
  for (let i: i32 = 0; i <= N_CIRCLE / 2; i++) { cam.project(x + COS[i] * r, y + SIN[i] * r, z0); pts.push(cam.x); pts.push(cam.y); }
  for (let i: i32 = N_CIRCLE / 2; i <= N_CIRCLE; i++) { cam.project(x + COS[i] * r, y + SIN[i] * r, z1); pts.push(cam.x); pts.push(cam.y); }
  polygon(pts, color, alpha);
}

/** Polygon from table points at one height. */
export function flat(cam: Camera, xs: number[], ys: number[], z: number, color: u32, alpha: i32): void {
  pts.length = 0;
  for (let i: i32 = 0; i < xs.length; i++) { cam.project(xs[i], ys[i], z); pts.push(cam.x); pts.push(cam.y); }
  polygon(pts, color, alpha);
}

/** Polyline from table points at one height (z per point when zs is given). */
export function line3(cam: Camera, xs: number[], ys: number[], z: number, zs: number[] | null, width: number, color: u32, alpha: i32): void {
  pts.length = 0;
  for (let i: i32 = 0; i < xs.length; i++) { cam.project(xs[i], ys[i], zs !== null ? zs[i] + z : z); pts.push(cam.x); pts.push(cam.y); }
  stroke(pts, width, color, alpha, false);
}

/** One wall segment's face: the quad between z0 and z1 above a -> b. */
export function face(cam: Camera, ax: number, ay: number, bx: number, by: number, z0: number, z1: number, color: u32, alpha: i32): void {
  pts.length = 0;
  cam.project(ax, ay, z0); pts.push(cam.x); pts.push(cam.y);
  cam.project(bx, by, z0); pts.push(cam.x); pts.push(cam.y);
  cam.project(bx, by, z1); pts.push(cam.x); pts.push(cam.y);
  cam.project(ax, ay, z1); pts.push(cam.x); pts.push(cam.y);
  polygon(pts, color, alpha);
}

/** An arrow insert pointing along `angle` (radians, table space), `size` long, into `pts`. */
export function arrowPts(cam: Camera, x: number, y: number, angle: number, size: number): void {
  const c = Math.cos(angle), s = Math.sin(angle);
  const shape: number[] = [0.5, 0, 0, 0.42, 0.05, 0.16, -0.5, 0.16, -0.5, -0.16, 0.05, -0.16, 0, -0.42];
  pts.length = 0;
  for (let i: i32 = 0; i < shape.length; i += 2) {
    const u = shape[i] * size, v = shape[i + 1] * size;
    cam.project(x + u * c - v * s, y + u * s + v * c, 0);
    pts.push(cam.x); pts.push(cam.y);
  }
}

/** A chevron insert (rank ladder) pointing up the table. */
export function chevronPts(cam: Camera, x: number, y: number, w: number, h: number): void {
  const shape: number[] = [0, -0.5, 0.5, 0.1, 0.5, 0.5, 0, -0.1, -0.5, 0.5, -0.5, 0.1];
  pts.length = 0;
  for (let i: i32 = 0; i < shape.length; i += 2) { cam.project(x + shape[i] * w, y + shape[i + 1] * h, 0); pts.push(cam.x); pts.push(cam.y); }
}

/** Copy of the scratch points (inserts keep their projected outline). */
export function keepPts(): number[] { return pts.slice(0); }
