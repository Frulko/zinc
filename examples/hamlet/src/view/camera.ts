import { W, H, SIN, R2, setView, setPixelOrigin, unproject, clamp } from '../pixel';
import { world } from '../world/world';

// The renderer draws a W x H window. A village can be bigger: its ground is baked once into a larger "layer" per zoom level, and the camera
// is the position of the window over that layer. Zooming changes the pixels per world unit (S), so every level has its own layer and models.
// Pixels per world unit, from the closest view to the farthest: five steps in, the normal view, five steps out.
// Zooming in draws the art bigger (levels 0 to 4). Zooming out keeps the art at the normal size and shows a wider window instead (ZOOM_VIEW, the window's size
// as a multiple of the normal one), so no detail is lost: the picture is just shown with smaller pixels.
export const ZOOM_SCALES: number[] = [20, 18, 16, 14, 12, 10, 10, 10, 10, 10, 10];
export const ZOOM_VIEW: number[] = [1, 1, 1, 1, 1, 1, 1.2, 1.5, 1.8, 2.1, 2.4];
export const DEFAULT_ZOOM = 5;
const MARGIN_LEFT = 10, MARGIN_TOP_ROWS = 22, MARGIN_RIGHT = 10, MARGIN_BOTTOM_ROWS = 32;   // pixels kept around the visible crop (shadows and tall models reach in from outside)
/** The screen area the map fills and the whole-number scale (screen pixels per picture pixel) of the normal view: the window follows the area, so the map always fills it. */
export const fit = { vw: 1020, vh: 678, s0: 3 };
export function setFit(vw: number, vh: number): void {
  fit.vw = Math.max(64, Math.floor(vw)); fit.vh = Math.max(64, Math.floor(vh));
  fit.s0 = Math.max(1, Math.round(Math.min(fit.vw / 340, fit.vh / 226)));
}
/** The picture's visible size at a level: what fills the area at that level's screen scale (the normal scale divided by the window's growth). */
export function cropWidth(level: number): number { return Math.ceil(fit.vw * ZOOM_VIEW[level] / fit.s0); }
export function cropHeight(level: number): number { return Math.ceil(fit.vh * ZOOM_VIEW[level] / fit.s0); }
/** Levels that draw at the same scale share one baked ground and one set of models. */
export function artLevel(level: number): number { return Math.min(level, DEFAULT_ZOOM); }
export function windowWidth(level: number): number { return cropWidth(level) + MARGIN_LEFT + MARGIN_RIGHT; }
export function windowHeight(level: number): number { return cropHeight(level) + MARGIN_TOP_ROWS + MARGIN_BOTTOM_ROWS; }
export function cropX(): number { return MARGIN_LEFT; }
export function cropY(): number { return MARGIN_TOP_ROWS; }
const MARGIN_X = 200, MARGIN_TOP = 140, MARGIN_BOTTOM = 110;   // room around the diamond: the dissolved border, tall buildings, and the dark space the camera may show beyond the village

export const camera = { level: DEFAULT_ZOOM, x: 0, y: 0 };

export function scaleOf(level: number): number { return ZOOM_SCALES[level]; }
export function layerWidth(level: number): number { return Math.ceil(2 * world.half * R2 * ZOOM_SCALES[level]) + 2 * MARGIN_X; }
export function layerHeight(level: number): number { return Math.ceil(2 * world.half * R2 * SIN * ZOOM_SCALES[level]) + MARGIN_TOP + MARGIN_BOTTOM; }
export function layerOriginX(level: number): number { return layerWidth(level) / 2; }
export function layerOriginY(level: number): number { return MARGIN_TOP + world.half * R2 * SIN * ZOOM_SCALES[level]; }

/** Keeps the window over the layer (centred when the layer is smaller than the window), then points the renderer at it. */
export function applyCamera(): void {
  const level = camera.level;
  const maxX = layerWidth(level) - W, maxY = layerHeight(level) - H;
  camera.x = Math.round(maxX <= 0 ? maxX / 2 : clamp(camera.x, 0, maxX));
  camera.y = Math.round(maxY <= 0 ? maxY / 2 : clamp(camera.y, 0, maxY));
  setView(scaleOf(level), layerOriginX(level), layerOriginY(level));          // the window slides over the layer: the pixel origin is the camera, so every pattern stays on the layer
  setPixelOrigin(camera.x, camera.y);
}

/** Puts the world point (x, y) at the centre of the window. */
export function centerOn(x: number, y: number): void {
  const level = camera.level, s = scaleOf(level);
  camera.x = layerOriginX(level) + (x - y) / R2 * s - W / 2;
  camera.y = layerOriginY(level) + (x + y) / R2 * SIN * s - H / 2;
  applyCamera();
}

/** The world point now at the centre of the window. */
export function centerPoint(): { x: number; y: number } { return unproject(W / 2, H / 2); }

/** Moves the window by (dx, dy) source pixels; true when it actually moved. */
export function panBy(dx: number, dy: number): boolean {
  const before = camera.x * 100000 + camera.y;
  camera.x += dx; camera.y += dy;
  applyCamera();
  return camera.x * 100000 + camera.y !== before;
}
