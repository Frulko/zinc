import { env } from 'zinc:sys';
import { world } from '../world/world';
import { ensureBiomes, monthStep } from '../view/seasons';
import { HW, cam, view, stats, measureHeights, tileFi, tileFj, centerOnTile, panPixels, zoomAt, stepZoom, clampCamera, HH } from './geom';
import { initAtlas } from './atlas';
import { resetGround } from './ground';
import { drawMap, ghost, selection, tileDiamond, pickAt, pick } from './draw';
import { TILE } from '../constants';

// The Cité view (settings.view === 'cite', or ZINC_HAMLET_VIEW=cite): the world drawn with zinc:gfx as batched textured quads, culled to the screen.
// It reads the world and never writes it; the pixel renderer of src/view is not used while it runs.
export { cam, zoomAt, panPixels, pickAt, pick, tileDiamond, stats };
export const citeRequested: boolean = env('ZINC_HAMLET_VIEW') === 'cite';
export const SCALE0 = HW * Math.SQRT2 / 2;      // renderer pixels per world unit at zoom 1: what the shared overlays (project) need to land on this view

/** A village was made or loaded: forget the cached ground, measure the heights, look at the gate. */
export function citeReset(): void {
  ensureBiomes(); initAtlas();
  resetGround(); measureHeights();
  const g = world.gate;
  centerOnTile((g % world.size) + 6, Math.floor(g / world.size));
  cam.zoom = 1; cam.target = 1;
}
export function citeLayout(x: number, y: number, w: number, h: number): void { view.x = x; view.y = y; view.w = w; view.h = h; }
/** One step of the smooth zoom; true while it moves. */
export function citeStep(dt: number): boolean { return stepZoom(dt); }
/** What the shared overlays need so that renderer.project() gives screen pixels on this view: [scale, originX, originY]. */
export function citeProjection(): number[] {
  return [SCALE0 * cam.zoom, view.x + view.w / 2 - (cam.ci - cam.cj) * HW * cam.zoom, view.y + view.h / 2 + (world.half - (cam.ci + cam.cj)) * HH * cam.zoom];
}
/** Puts the world point (x, y) of the simulation at the middle of the view. */
export function citeJump(x: number, y: number): void { centerOnTile((x + world.half) / TILE, (y + world.half) / TILE); }
export function citeDraw(time: number, hover: number, ok: boolean, ghostType: number): void {
  drawMap(time, 3);
  if (hover >= 0) ghost(hover, ghostType, ok);
  selection();
}
export { clampCamera, monthStep };
/** The world point under a corner of the view (fx, fy: 0 or 1 across and down), for the minimap's camera rectangle. */
export function cornerWorld(fx: number, fy: number): { x: number; y: number } {
  const x = view.x + fx * view.w, y = view.y + fy * view.h;
  return { x: tileFi(x, y, 0) * TILE - world.half, y: tileFj(x, y, 0) * TILE - world.half };
}
