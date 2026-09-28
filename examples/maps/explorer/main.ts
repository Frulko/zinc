// Map explorer: offline OpenStreetMap vector tiles of central Paris (tiles/, zoom 10-14, overzoomed beyond),
// drag / wheel / pinch / double-click to navigate, a place list, zoom buttons and a scale bar.
//   zinc run examples/maps/explorer                     offline sample
//   ZINC_MAP_ONLINE=1 zinc run examples/maps/explorer   + OpenFreeMap tiles for the rest of the world (cached in tile-cache/)
//   ZINC_MAP_DEMO=1: scripted pan/zoom that logs frame times (benchmark); ZINC_MAP_VIEW=lat,lon,zoom: start view
import { onFrame, clear, rrect, drawText, font, textWidth, rect, width, height, pointerX, pointerY, pointerDown, quit } from 'zinc:gfx';
import { exists } from 'zinc:fs';
import { env, clock } from 'zinc:sys';
import { MapView, metersPerPixel } from 'zinc:map';

interface Place { name: string; lat: number; lon: number; zoom: number }
const PLACES: Place[] = [
  { name: 'Paris', lat: 48.8566, lon: 2.3522, zoom: 11 },
  { name: 'Notre-Dame', lat: 48.8530, lon: 2.3499, zoom: 15 },
  { name: 'Louvre', lat: 48.8606, lon: 2.3376, zoom: 15 },
  { name: 'Châtelet', lat: 48.8584, lon: 2.3470, zoom: 16 },
  { name: 'Concorde', lat: 48.8656, lon: 2.3212, zoom: 15 },
  { name: 'Place des Vosges', lat: 48.8556, lon: 2.3655, zoom: 16 },
  { name: 'Panthéon', lat: 48.8462, lon: 2.3464, zoom: 15 },
  { name: 'Luxembourg', lat: 48.8462, lon: 2.3372, zoom: 15 },
];

// tiles/ next to this file, whatever the working directory (zinc run from the repo root, or the build directory)
let tiles = env('ZINC_MAP_TILES');
for (const d of ['tiles', 'examples/maps/explorer/tiles', '../../tiles']) if (tiles === '' && exists(`${d}/14`)) tiles = d;
const online = env('ZINC_MAP_ONLINE') !== '';
const map = new MapView({ tiles: tiles, url: online ? 'https://tiles.openfreemap.org/planet' : '', cache: online ? 'tile-cache' : '', sourceMinZoom: 0, sourceMaxZoom: 14, style: '' });
map.minZoom = online ? 1 : 10;
map.maxZoom = 19;
map.setView(48.8566, 2.3522, 14);
const view = env('ZINC_MAP_VIEW').split(',');  // "lat,lon,zoom" start view (screenshots)
if (view.length === 3) map.setView(parseFloat(view[0]), parseFloat(view[1]), parseFloat(view[2]));
if (tiles === '' && !online) console.error('explorer: no tiles/ directory found (set ZINC_MAP_TILES, or ZINC_MAP_ONLINE=1)');

const W = width(), H = height();
const PANEL = 168;
const f14 = font('sans', 14), f12 = font('sans', 12), fb16 = font('sans-bold', 16);
let wasDown = false;
let selected: i32 = 0;

function button(x: number, y: number, w: number, h: number, label: string, on: boolean, pressed: boolean): boolean {
  const px = pointerX(), py = pointerY();
  const hover = px >= x && py >= y && px < x + w && py < y + h;
  rrect(x, y, w, h, 6, on ? 0x2f6fde : hover ? 0xe8eef8 : 0xffffff, 235);
  drawText(f14, x + (w - textWidth(f14, label, 0)) / 2, y + (h - 15) / 2, label, on ? 0xffffff : 0x1f2937, 255, 0);
  return pressed && hover;
}

function scaleBar(x: number, y: number): void {
  const mpp = metersPerPixel(map.lat, map.zoom);
  let m = 1;
  while (m * 2 / mpp < 110) m *= m.toString().startsWith('2') ? 2.5 : 2;  // 1, 2, 5, 10, 20, 50 ...
  const px = m / mpp;
  const label = m >= 1000 ? `${m / 1000} km` : `${m} m`;
  rrect(x - 6, y - 20, px + 12, 30, 4, 0xffffff, 200);
  rect(x, y, px, 3, 0x333333);
  rect(x, y - 5, 2, 8, 0x333333);
  rect(x + px - 2, y - 5, 2, 8, 0x333333);
  drawText(f12, x, y - 18, label, 0x333333, 255, 0);
}

// ---- benchmark: scripted pan / zoom, frame times per phase
const demo = env('ZINC_MAP_DEMO') !== '';
let demoFrame: i32 = 0, phaseStart = 0, phaseMax = 0, phaseFrames: i32 = 0, lastT = 0;
const PHASES: string[] = ['load z14', 'pan z14', 'zoom to 15', 'pan z15', 'zoom to 12', 'pan z12'];
function demoStep(ms: number): void {
  const phase: i32 = Math.floor(demoFrame / 120);
  const k = demoFrame % 120;
  if (phase >= PHASES.length) { quit(); return; }
  if (k === 0) { phaseStart = clock(); phaseMax = 0; phaseFrames = 0; map.stats(); }
  if (phase === 1 || phase === 3 || phase === 5) map.panBy(-6, -2);  // 360 px/s at 60 fps
  if (phase === 2 && k === 0) map.zoomAround(1, (W - PANEL) / 2, H / 2);
  if (phase === 4 && k === 0) map.zoomAround(-3, (W - PANEL) / 2, H / 2);
  if (k > 0) { phaseMax = Math.max(phaseMax, ms); phaseFrames++; }
  if (k === 119) console.log(`${PHASES[phase].padEnd(11)} avg ${((clock() - phaseStart) / phaseFrames).toFixed(2)} ms  max ${phaseMax.toFixed(1)} ms  ${map.stats()}`);
  demoFrame++;
}

onFrame((dt: number) => {
  const now = clock(), ms = lastT > 0 ? now - lastT : 0;
  lastT = now;
  const down = pointerDown(), pressed = down && !wasDown;
  wasDown = down;
  map.update(dt, PANEL, 0, W - PANEL, H);
  if (demo) demoStep(ms);
  clear(0xf2efe9);
  map.draw(0, 0, W, H);

  // side panel: places and zoom
  rrect(8, 8, PANEL - 16, H - 16, 10, 0xffffff, 225);
  drawText(fb16, 20, 18, 'Places', 0x111827, 255, 0);
  for (let i = 0; i < PLACES.length; i++) {
    const p = PLACES[i];
    if (button(16, 44 + i * 34, PANEL - 32, 30, p.name, i === selected, pressed)) { selected = i; map.flyTo(p.lat, p.lon, p.zoom); }
  }
  const zy = 44 + PLACES.length * 34 + 10;
  if (button(16, zy, (PANEL - 40) / 2, 34, '+', false, pressed)) map.zoomAround(1, (W + PANEL) / 2, H / 2);
  if (button(24 + (PANEL - 40) / 2, zy, (PANEL - 40) / 2, 34, '-', false, pressed)) map.zoomAround(-1, (W + PANEL) / 2, H / 2);
  drawText(f12, 20, zy + 44, `zoom ${map.zoom.toFixed(1)}`, 0x4b5563, 255, 0);
  drawText(f12, 20, zy + 60, `${map.lat.toFixed(4)}, ${map.lon.toFixed(4)}`, 0x4b5563, 255, 0);
  if (map.pending > 0) drawText(f12, 20, zy + 76, `loading ${map.pending}`, 0x9ca3af, 255, 0);

  scaleBar(PANEL + 14, H - 16);
  const attr = '© OpenStreetMap contributors · OpenFreeMap';
  const aw = textWidth(f12, attr, 0);
  rrect(W - aw - 14, H - 22, aw + 10, 18, 3, 0xffffff, 200);
  drawText(f12, W - aw - 9, H - 21, attr, 0x333333, 255, 0);
});
