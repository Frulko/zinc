import { world } from '../world/world';

// The Cité view's geometry: iso diamond tiles of 64 x 32 px at zoom 1, one level of height = PXH px, a camera in tile units, a continuous zoom.
// Tile space: (fi, fj) floats, tile (i, j) covers [i, i + 1) x [j, j + 1). The view reads the world and never writes it.
export const HW = 32, HH = 16, PXH = 9.8;          // half tile width, half tile height, pixels of one height level at zoom 1
export const MAX_LEVEL = 15;
export const CH = 8;                               // tiles per chunk side
export const ZOOM_MIN = .2, ZOOM_MAX = 3;

/** Where the map is drawn on screen and where the camera looks (tile space), with a smooth zoom. */
export const cam = { ci: 12, cj: 12, zoom: 1, target: 1, ax: 0, ay: 0 };   // ax, ay: screen point the zoom is anchored on
export const view = { x: 0, y: 0, w: 1100, h: 800 };
export const stats = { chunks: 0, bakes: 0, quads: 0, sprites: 0, hmax: 0, bakeMs: 0, bakeMax: 0, viewRegions: 0, missingRegions: 0 };

// ---- heights ----
/** The level of a tile, 0..15: the generator's heightmap. */
export function heightAt(t: number): number { return world.height[t]; }
export function heightIJ(i: number, j: number): number {
  const n = world.size;
  return heightAt(Math.max(0, Math.min(n - 1, j)) * n + Math.max(0, Math.min(n - 1, i)));
}
/** Height of the grid vertex (a, b), the corner shared by tiles (a-1, b-1), (a, b-1), (a-1, b), (a, b): the average of the tiles of the 2x2 that join the tile `own` (0..3, in that order)
 *  through edges where the levels differ by 1 at most (a slope is smooth); a cliff (2 or more) cuts the group, so the tiles on each side keep their own surface. Both tiles of a non-cliff edge
 *  join the same group, so no seam opens between them. */
const hv = [0, 0, 0, 0];
export function vertexHeight(a: number, b: number, own: number): number {
  hv[0] = heightIJ(a - 1, b - 1); hv[1] = heightIJ(a, b - 1); hv[2] = heightIJ(a - 1, b); hv[3] = heightIJ(a, b);
  let mask = 1 << own, grew = true;
  while (grew) {
    grew = false;
    for (let k = 0; k < 4; k++) {
      if ((mask & (1 << k)) !== 0) continue;
      const q = k ^ 1, r = k ^ 2;      // the two tiles that share an edge with k
      if (((mask & (1 << q)) !== 0 && Math.abs(hv[k] - hv[q]) <= 1) || ((mask & (1 << r)) !== 0 && Math.abs(hv[k] - hv[r]) <= 1)) { mask |= 1 << k; grew = true; }
    }
  }
  let sum = 0, cnt = 0;
  for (let k = 0; k < 4; k++) if ((mask & (1 << k)) !== 0) { sum += hv[k]; cnt++; }
  return sum / cnt;
}
/** The four corner levels of tile (i, j): north (i, j), east (i+1, j), south (i+1, j+1), west (i, j+1). */
export const corner: number[] = [0, 0, 0, 0];
export function cornersOf(i: number, j: number): void {
  corner[0] = vertexHeight(i, j, 3); corner[1] = vertexHeight(i + 1, j, 2); corner[2] = vertexHeight(i + 1, j + 1, 0); corner[3] = vertexHeight(i, j + 1, 1);
}
/** The level under the tile-space point (fi, fj): the corners interpolated. */
export function levelAtPoint(fi: number, fj: number): number {
  const i = Math.floor(fi), j = Math.floor(fj);
  if (i < 0 || j < 0 || i >= world.size || j >= world.size) return 0;
  cornersOf(i, j);
  const u = fi - i, v = fj - j;
  return corner[0] * (1 - u) * (1 - v) + corner[1] * u * (1 - v) + corner[2] * u * v + corner[3] * (1 - u) * v;
}
/** The highest level of the map (the cull margins follow it); call when a village is made or loaded. */
export function measureHeights(): void {
  let hi = 0;
  for (let t = 0; t < world.size * world.size; t++) { const h = heightAt(t); if (h > hi) hi = h; }
  stats.hmax = hi;
}

// ---- projection ----
export function sx(fi: number, fj: number): number { return view.x + view.w / 2 + ((fi - fj) - (cam.ci - cam.cj)) * HW * cam.zoom; }
export function sy(fi: number, fj: number, level: number): number { return view.y + view.h / 2 + (((fi + fj) - (cam.ci + cam.cj)) * HH - level * PXH) * cam.zoom; }
/** Tile-space point under a screen point, at height `level`. */
export function tileFi(x: number, y: number, level: number): number {
  const u = (x - view.x - view.w / 2) / (HW * cam.zoom) + (cam.ci - cam.cj), v = (y - view.y - view.h / 2) / (HH * cam.zoom) + level * PXH / HH + (cam.ci + cam.cj);
  return (u + v) / 2;
}
export function tileFj(x: number, y: number, level: number): number {
  const u = (x - view.x - view.w / 2) / (HW * cam.zoom) + (cam.ci - cam.cj), v = (y - view.y - view.h / 2) / (HH * cam.zoom) + level * PXH / HH + (cam.ci + cam.cj);
  return (v - u) / 2;
}
export function inView(x: number, y: number, margin: number): boolean {
  return x > view.x - margin && x < view.x + view.w + margin && y > view.y - margin && y < view.y + view.h + margin;
}

/** Keeps the camera over the map. */
export function clampCamera(): void {
  const n = world.size;
  cam.ci = Math.max(0, Math.min(n, cam.ci)); cam.cj = Math.max(0, Math.min(n, cam.cj));
}
/** Pans by screen pixels (the world follows the pointer: dragging right moves the camera left). */
export function panPixels(dx: number, dy: number): boolean {
  if (dx === 0 && dy === 0) return false;
  const u = dx / (HW * cam.zoom), v = dy / (HH * cam.zoom);      // screen offset in (i - j, i + j) units
  const bi = cam.ci, bj = cam.cj;
  cam.ci += (u + v) / 2; cam.cj += (v - u) / 2;
  clampCamera();
  return cam.ci !== bi || cam.cj !== bj;
}
export function centerOnTile(fi: number, fj: number): void { cam.ci = fi; cam.cj = fj; clampCamera(); }
/** Zoom by a factor, anchored on a screen point: the tile under it stays under it as the zoom eases. */
export function zoomAt(factor: number, x: number, y: number): void {
  cam.target = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, cam.target * factor)); cam.ax = x; cam.ay = y;
}
/** One step of the smooth zoom (time based); true while it moves. */
export function stepZoom(dt: number): boolean {
  if (Math.abs(cam.target - cam.zoom) < cam.zoom * .0008) { if (cam.zoom !== cam.target) cam.zoom = cam.target; return false; }
  const fi = tileFi(cam.ax, cam.ay, 0), fj = tileFj(cam.ax, cam.ay, 0);
  cam.zoom *= Math.pow(cam.target / cam.zoom, 1 - Math.exp(-Math.min(dt, .1) / .09));
  const gi = tileFi(cam.ax, cam.ay, 0), gj = tileFj(cam.ax, cam.ay, 0);
  cam.ci += fi - gi; cam.cj += fj - gj;                           // the anchored tile stays under the pointer
  clampCamera();
  return true;
}
