import { rect, line } from 'zinc:gfx';
import { unproject, W, H } from '../pixel';
import { world, tileI, tileJ } from '../world/world';
import { TERRAIN_WATER, TERRAIN_VOID, TILE } from '../constants';
import { economy } from '../world/economy';
import { jumpTo } from '../view/scenery';
import { col, well } from './kit';

// The overview map of the control column: one square per tile, the camera window outlined, a click or a drag moves the camera there.
const GRASS = 0x5f7a3f, TREE = 0x2f5a30, WATER = 0x4a7fa6, ROCK = 0x8a8578, ROAD = 0xd8c898, HOUSE = 0xd9694a, WORK = 0xe0b04a, PERSON = 0xfff6db, DEER = 0xb8865a, VIEW = 0xffffff;
const box = { x: 0, y: 0, side: 0, cell: 1 };

export function minimapContains(x: number, y: number): boolean { return x >= box.x - 3 && y >= box.y - 3 && x < box.x + box.side + 3 && y < box.y + box.side + 3; }
export function minimapClick(x: number, y: number): void {
  jumpTo(((x - box.x) / box.cell) * TILE - world.half, ((y - box.y) / box.cell) * TILE - world.half);
}
/** Draws the map in a well of (size x size) pixels; the grid is centred in it at the largest whole cell. */
export function drawMinimap(x: number, y: number, size: number): void {
  const c = Math.max(1, Math.floor((size - 6) / world.size)), s = c * world.size, ox = x + Math.floor((size - s) / 2), oy = y + Math.floor((size - s) / 2);
  box.x = ox; box.y = oy; box.side = s; box.cell = c;
  well(x, y, size, size);
  for (let t = 0; t < world.size * world.size; t++) {
    const terrain = world.terrain[t];
    if (terrain === TERRAIN_VOID) continue;
    const id = world.build[t];
    const color = terrain === TERRAIN_WATER ? WATER : world.road[t] !== 0 ? ROAD : id >= 0 ? (economy.buildings[world.buildings[id].type].housing !== null ? HOUSE : WORK)
      : world.tree[t] !== 0 ? TREE : world.rock[t] !== 0 ? ROCK : GRASS;
    rect(ox + tileI(t) * c, oy + tileJ(t) * c, c, c, color);
  }
  const d = Math.max(1, Math.floor(c / 2));
  for (const p of world.people) rect(ox + (p.x + world.half) / TILE * c, oy + (p.y + world.half) / TILE * c, d, d, PERSON);
  for (const e of world.deer) rect(ox + (e.x + world.half) / TILE * c, oy + (e.y + world.half) / TILE * c, d, d, DEER);
  // The camera window: its four corners, projected back onto the ground.
  const a = unproject(0, 0), b = unproject(W, 0), dd = unproject(W, H), e = unproject(0, H);
  const py = (v: number): number => oy + Math.max(0, Math.min(s, (v + world.half) / TILE * c));
  const px = (v: number): number => ox + Math.max(0, Math.min(s, (v + world.half) / TILE * c));
  line(px(a.x), py(a.y), px(b.x), py(b.y), VIEW); line(px(b.x), py(b.y), px(dd.x), py(dd.y), VIEW);
  line(px(dd.x), py(dd.y), px(e.x), py(e.y), VIEW); line(px(e.x), py(e.y), px(a.x), py(a.y), VIEW);
  rect(x, y, size, 1, col('stoneDeep'));
}
