import { env } from 'zinc:sys';
import { world } from '../world/world';
import { noise } from '../world/noise';

// The Cité view's geometry: iso diamond tiles of 64 x 32 px at zoom 1, one level of height = PXH px, a camera in tile units, a continuous zoom.
// Tile space: (fi, fj) floats, tile (i, j) covers [i, i + 1) x [j, j + 1). The view reads the world and never writes it.
export const HW = 32, HH = 16, PXH = 9.8;          // half tile width, half tile height, pixels of one height level at zoom 1
export const MAX_LEVEL = 15;
export const CH = 8;                               // tiles per chunk side
export const ZOOM_MIN = .2, ZOOM_MAX = 3;

/** Where the map is drawn on screen and where the camera looks (tile space), with a smooth zoom. */
export const cam = { ci: 12, cj: 12, zoom: 1, target: 1, ax: 0, ay: 0 };   // ax, ay: screen point the zoom is anchored on
export const view = { x: 0, y: 0, w: 1100, h: 800 };
export const stats = { chunks: 0, bakes: 0, quads: 0, sprites: 0, hmax: 0, bakeMs: 0, bakeMax: 0 };

// ---- heights ----
const testOn = env('ZINC_HAMLET_TEST_HEIGHT') === '1';
let testHeights: number[] = [];
let testSize = 0;
function ridge(i: number, j: number): number { return 1 - Math.abs(noise(i * .09 + 7, j * .09 + 3) * 2 - 1); }       // ridged noise: ranges
function hill(i: number, j: number): number { return noise(i * .2 + 40, j * .2 + 9); }
/** The synthetic heightmap of ZINC_HAMLET_TEST_HEIGHT=1: ridges and hills, flat around the middle, water at 0. */
function testLevel(i: number, j: number, n: number, t: number): number {
  const r = ridge(i, j), h = hill(i, j);
  const edge = Math.min(1, Math.min(i, j, n - 1 - i, n - 1 - j) / 4);
  const dx = i - n / 2, dy = j - n / 2, centre = Math.min(1, Math.sqrt(dx * dx + dy * dy) / (n * .12));
  const v = world.terrain[t] === 1 ? 0 : Math.round((r * r * 14 + h * 3 - 3) * centre * edge);
  return Math.max(0, Math.min(MAX_LEVEL, v));
}
/** The level of a tile, 0..15. world.height (the generator's heightmap) when it exists; a synthetic one behind ZINC_HAMLET_TEST_HEIGHT=1. */
export function heightAt(t: number): number {
  // integration with item A (one line): `if (world.height.length === world.size * world.size) return world.height[t];`
  // (a cast of `world` to a look-alike interface copies the whole record: do not read it by cast)
  if (!testOn) return 0;
  if (testSize !== world.size) {
    testSize = world.size; testHeights = [];
    const n = world.size;
    for (let k = 0; k < n * n; k++) {
      const i = k % n, j = Math.floor(k / n);
      testHeights.push(testLevel(i, j, n, k));
    }
  }
  return testHeights[t];
}
export function heightIJ(i: number, j: number): number {
  const n = world.size;
  return heightAt(Math.max(0, Math.min(n - 1, j)) * n + Math.max(0, Math.min(n - 1, i)));
}
/** Height of the grid vertex (a, b), the corner shared by tiles (a-1, b-1), (a, b-1), (a-1, b), (a, b): smooth on a slope (spread of 1 at most), nan next to a cliff. */
export function vertexHeight(a: number, b: number, own: number): number {
  const h0 = heightIJ(a - 1, b - 1), h1 = heightIJ(a, b - 1), h2 = heightIJ(a - 1, b), h3 = heightIJ(a, b);
  const lo = Math.min(Math.min(h0, h1), Math.min(h2, h3)), hi = Math.max(Math.max(h0, h1), Math.max(h2, h3));
  return hi - lo <= 1 ? (h0 + h1 + h2 + h3) / 4 : own;
}
/** The four corner levels of tile (i, j): north (i, j), east (i+1, j), south (i+1, j+1), west (i, j+1). */
export const corner: number[] = [0, 0, 0, 0];
export function cornersOf(i: number, j: number): void {
  const own = heightIJ(i, j);
  corner[0] = vertexHeight(i, j, own); corner[1] = vertexHeight(i + 1, j, own); corner[2] = vertexHeight(i + 1, j + 1, own); corner[3] = vertexHeight(i, j + 1, own);
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
  testSize = 0;
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
