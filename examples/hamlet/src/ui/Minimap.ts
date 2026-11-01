import { width, height, rect, line } from 'zinc:gfx';
import { unproject, W, H } from '../pixel';
import { world, tileI, tileJ } from '../world/world';
import { TERRAIN_WATER, TERRAIN_VOID, TILE } from '../constants';
import { settings, MINIMAP_CELLS } from '../settings';
import { jumpTo } from '../view/scenery';

// A top-down map of the village, drawn where `settings.minimapCorner` says, one square per tile. "Ultra" fits the whole map in a fixed square so a 32x32 village
// can be read from very far; the camera window is outlined, and a click moves the camera there.
const MARGIN = 12, ULTRA_SIDE = 256;
const GRASS = 0x5f7a3f, TREE = 0x2f5a30, WATER = 0x4a7fa6, ROCK = 0x8a8578, ROAD = 0xd8c898, HOUSE = 0xd9694a, WORK = 0xe0b04a, PERSON = 0xfff6db, DEER = 0xb8865a, FRAME = 0x28292e, VIEW = 0xffffff;

function cell(): number {
  const c = MINIMAP_CELLS[settings.minimapSize];
  return c > 0 ? c : Math.max(1, Math.floor(ULTRA_SIDE / world.size));
}
function side(): number { return cell() * world.size; }
function originX(): number {
  const s = side(), k = settings.minimapCorner;
  return k === 2 || k === 3 ? width() - s - MARGIN : k === 5 ? (width() - s) / 2 : MARGIN;
}
function originY(): number {
  const s = side(), k = settings.minimapCorner;
  return k === 3 || k === 4 ? height() - s - MARGIN - 150 : k === 5 ? (height() - s) / 2 : MARGIN + 70;
}
export function minimapVisible(): boolean { return settings.minimapCorner > 0; }
export function minimapContains(x: number, y: number): boolean {
  return minimapVisible() && x >= originX() - 2 && y >= originY() - 2 && x < originX() + side() + 2 && y < originY() + side() + 2;
}
/** A click or drag on the map: the camera centres on the point under the cursor. */
export function minimapClick(x: number, y: number): void {
  const c = cell();
  jumpTo(((x - originX()) / c) * TILE - world.half, ((y - originY()) / c) * TILE - world.half);
}

export function drawMinimap(): void {
  if (!minimapVisible()) return;
  const c = cell(), s = side(), ox = originX(), oy = originY();
  rect(ox - 2, oy - 2, s + 4, s + 4, FRAME);
  for (let t = 0; t < world.size * world.size; t++) {
    const terrain = world.terrain[t];
    if (terrain === TERRAIN_VOID) continue;
    let color = terrain === TERRAIN_WATER ? WATER : world.road[t] !== 0 ? ROAD : world.build[t] >= 0 ? (world.buildings[world.build[t]].type === 0 ? HOUSE : WORK)
      : world.tree[t] !== 0 ? TREE : world.rock[t] !== 0 ? ROCK : GRASS;
    rect(ox + tileI(t) * c, oy + tileJ(t) * c, c, c, color);
  }
  if (settings.minimapUnits) {
    const d = Math.max(1, Math.floor(c / 2));
    for (const p of world.people) rect(ox + (p.x + world.half) / TILE * c, oy + (p.y + world.half) / TILE * c, d, d, PERSON);
    for (const e of world.deer) rect(ox + (e.x + world.half) / TILE * c, oy + (e.y + world.half) / TILE * c, d, d, DEER);
  }
  // The camera window: its four corners, projected back onto the ground.
  const a = unproject(0, 0), b = unproject(W, 0), d = unproject(W, H), e = unproject(0, H);
  const py = (v: number): number => oy + Math.max(0, Math.min(s, (v + world.half) / TILE * c));
  const px = (v: number): number => ox + Math.max(0, Math.min(s, (v + world.half) / TILE * c));
  line(px(a.x), py(a.y), px(b.x), py(b.y), VIEW); line(px(b.x), py(b.y), px(d.x), py(d.y), VIEW);
  line(px(d.x), py(d.y), px(e.x), py(e.y), VIEW); line(px(e.x), py(e.y), px(a.x), py(a.y), VIEW);
}
