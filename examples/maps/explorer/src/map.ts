// The map: a zinc:map view over the offline tiles (or OpenFreeMap online), its per-frame update, the canvas
// drawing (tiles + scale bar) and the navigation helpers the panel buttons call.
import { rrect, rect, shadow, drawText, font, width, height } from 'zinc:gfx';
import { exists } from 'zinc:fs';
import { env } from 'zinc:sys';
import { MapView, metersPerPixel } from 'zinc:map';
import { createSignal } from 'zinc:ui/solid';

/** Width of the side panel: the map takes gestures only to its right. */
export const PANEL_WIDTH = 240;

/** tiles/ at the project root, whatever the working directory (repo root, project, or the build directory). */
function findTiles(): string {
  const configured = env('ZINC_MAP_TILES');
  if (configured !== '') return configured;
  for (const dir of ['tiles', 'examples/maps/explorer/tiles', '../../tiles', '../../../tiles']) if (exists(`${dir}/14`)) return dir;
  return '';
}

const tiles = findTiles();
const online = env('ZINC_MAP_ONLINE') !== '';
if (tiles === '' && !online) console.error('explorer: no tiles/ directory found (set ZINC_MAP_TILES, or ZINC_MAP_ONLINE=1)');

export const map = new MapView({
  tiles: tiles,
  url: online ? 'https://tiles.openfreemap.org/planet' : '',
  cache: online ? 'tile-cache' : '',
  sourceMinZoom: 0,
  sourceMaxZoom: 14,
  style: '',
});
map.minZoom = online ? 1 : 10;
map.maxZoom = 19;
map.setView(48.8566, 2.3522, 14);

// ZINC_MAP_VIEW="lat,lon,zoom": start view (screenshots)
const startView = env('ZINC_MAP_VIEW').split(',');
if (startView.length === 3) map.setView(parseFloat(startView[0]), parseFloat(startView[1]), parseFloat(startView[2]));

/** Zoom level and centre, refreshed every frame for the panel. */
export const [position, setPosition] = createSignal<string>('');

let sincePosition = 1;

/** Per frame: gestures on the map area, animations, tile loading. */
export function updateMap(dt: number): void {
  map.update(dt, PANEL_WIDTH, 0, width() - PANEL_WIDTH, height());
  // the position text changes on every panned frame: refresh it 5 times a second, not 60 (it costs a layout)
  sincePosition += dt;
  if (sincePosition < 0.2) return;
  sincePosition = 0;
  const loading = map.pending > 0 ? ` · loading ${map.pending}` : '';
  setPosition(`z${map.zoom.toFixed(1)} · ${map.lat.toFixed(4)}, ${map.lon.toFixed(4)}${loading}`);
}

/** Zooms one level in (+1) or out (-1) around the centre of the map area. */
export function zoomBy(levels: i32): void {
  map.zoomAround(levels, (width() + PANEL_WIDTH) / 2, height() / 2);
}

/** A round length (1, 2, 5, 10, 20, 50 m...) about 110 px long at the current zoom, and its width in pixels. */
function scaleLength(): number {
  const mpp = metersPerPixel(map.lat, map.zoom);
  let meters = 1;
  while (meters * 2 / mpp < 110) meters *= meters.toString().startsWith('2') ? 2.5 : 2;
  return meters;
}

/** Scale bar in a white pill, bottom left of the map area. */
function drawScaleBar(x: number, y: number): void {
  const meters = scaleLength();
  const px = meters / metersPerPixel(map.lat, map.zoom);
  const label = meters >= 1000 ? `${meters / 1000} km` : `${meters} m`;
  shadow(x - 10, y - 24, px + 20, 36, 8, 6, 0x000000, 30);
  rrect(x - 10, y - 24, px + 20, 36, 8, 0xffffff, 255);
  drawText(font('sans', 12), x, y - 20, label, 0x3f3f46, 255, 0);
  rect(x, y, px, 2, 0x3f3f46);
  rect(x, y - 4, 2, 6, 0x3f3f46);
  rect(x + px - 2, y - 4, 2, 6, 0x3f3f46);
}

/** Canvas callback: the whole map, then the scale bar. */
export function drawMap(x: i32, y: i32, w: i32, h: i32): void {
  map.draw(x, y, w, h);
  drawScaleBar(x + PANEL_WIDTH + 24, y + h - 20);
}
