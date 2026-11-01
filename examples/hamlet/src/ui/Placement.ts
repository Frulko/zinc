import { width } from 'zinc:gfx';
import { world } from '../world/world';
import { economy, amountText } from '../world/economy';
import { TOOL_ROAD, TOOL_ERASE, TOOL_HOUSE, PLACE_OK, PLACE_NO_ROAD, PLACE_NO_STOCK, PLACE_NO_WATER, PLACE_LOCKED, PLACE_NO_LODE } from '../constants';
import { checkTool, destroyBuilding, addBuilding } from '../rules/build';
import { give } from '../rules/stock';
import { lockText } from '../rules/goals';
import { recount } from '../world/world';
import { drawResource } from './icons';
import { tint } from './Overlays';
import { RoadPlan } from '../rules/roadplan';
import { kit, col, parchment, text, measure, wrap } from './kit';

// Placement feedback: the label that follows the pointer (cost, why not), the count of a drag, and Ctrl+Z.
const A_ROAD = 0, A_BUILD = 1, A_ERASE_ROAD = 2, A_ERASE_BUILDING = 3;
class Action { kind: number = 0; tile: number = 0; type: number = 0; }
const groups: Action[][] = [];
let current: Action[] = [];
export const drag = { active: false, count: 0 };
/** The line a road or demolition drag would act on (null when no line is being drawn): drawn as a ghost, counted in the label. */
export let linePlan: RoadPlan | null = null;
export let lineErase: number[] = [];
export function showLine(plan: RoadPlan | null, erase: number[] = []): void { linePlan = plan; lineErase = erase; }
/** The ghost of the line: green where the road will go, pale where one already stands, red on the obstacle that ends it. */
export function drawLine(): void {
  if (linePlan !== null) {
    for (const t of linePlan.tiles) tint(t, t === linePlan.blocked ? 0xc8452f : world.road[t] !== 0 ? 0xe0b13c : 0x3f9a45, t === linePlan.blocked ? 190 : 140);
  }
  for (const t of lineErase) tint(t, 0xc8452f, 150);
}

export function beginGroup(): void { current = []; drag.active = true; drag.count = 0; }
export function endGroup(): void { if (current.length > 0) { groups.push(current); if (groups.length > 30) groups.shift(); } current = []; drag.active = false; }
/** Notes what a tool did on a tile (called before the tool runs: it reads what stood there). */
export class Snapshot { road: boolean = false; building: number = -1; type: number = -1; }
export function look(t: number): Snapshot {
  const s = new Snapshot(); s.road = world.road[t] !== 0; s.building = world.build[t];
  s.type = s.building >= 0 ? world.buildings[s.building].type : -1; return s;
}
export function record(tool: number, t: number, before: Snapshot): void {
  const a = new Action(); a.tile = t; drag.count++;
  if (tool === TOOL_ROAD) a.kind = A_ROAD;
  else if (tool === TOOL_ERASE) { a.kind = before.building >= 0 ? A_ERASE_BUILDING : A_ERASE_ROAD; a.type = before.type; }
  else { a.kind = A_BUILD; a.type = tool - TOOL_HOUSE; }
  current.push(a);
}
/** Takes back the last drag or placement. Returns the sentence to say ('' when there is nothing to undo). */
export function undo(): string {
  const group = groups.pop();
  if (group === undefined) return '';
  for (let i = group.length - 1; i >= 0; i--) {
    const a = group[i];
    if (a.kind === A_ROAD) world.road[a.tile] = 0;
    else if (a.kind === A_ERASE_ROAD) world.road[a.tile] = 1;
    else if (a.kind === A_BUILD) {
      if (world.build[a.tile] >= 0) destroyBuilding(world.build[a.tile]);
      const cost = economy.buildings[a.type].cost;
      for (let k = 0; k < cost.length; k++) if (cost[k] > 0) give(k, cost[k]);
    } else if (world.build[a.tile] < 0) addBuilding(a.type, a.tile);
  }
  recount(); world.revision++; world.saveDirty = true;
  return group.length > 1 ? 'Annulé : ' + group.length + ' cases.' : 'Annulé.';
}

export function reasonText(tool: number, code: number): string {
  if (code === PLACE_NO_WATER) return 'Ce bâtiment se pose au bord de l’étang.';
  if (code === PLACE_LOCKED) return lockText(tool - TOOL_HOUSE);
  if (code === PLACE_NO_LODE) return 'Aucun gisement de ce genre à moins de huit cases : posez-le près de la roche ou du minerai.';
  if (code === PLACE_NO_ROAD) return 'Il faut poser le bâtiment au bord d’une route.';
  if (code === PLACE_NO_STOCK) return 'Il manque : ' + amountText(economy.buildings[tool - TOOL_HOUSE].cost, world.stock) + '.';
  return 'Cette case n’est pas libre.';
}

/** The label by the pointer: what the tool is, what it costs, and why it cannot act on this tile. */
export function drawPlacementLabel(tool: number, tile: number, px: number, py: number): void {
  if (tile < 0 && !drag.active) return;
  const code = tile >= 0 ? checkTool(tool, tile) : 1, ok = code === PLACE_OK;
  const build = tool >= TOOL_HOUSE && tool < TOOL_ERASE, name = build ? economy.buildings[tool - TOOL_HOUSE].label : tool === TOOL_ROAD ? 'Route' : 'Démolir';
  const line = linePlan !== null ? linePlan.fresh.length : lineErase.length > 0 ? lineErase.length : 0;
  const head = linePlan !== null && line > 0 ? name + ' · ' + line + (line > 1 ? ' cases' : ' case') : lineErase.length > 1 ? name + ' · ' + line + ' cases' : drag.active && drag.count > 1 ? name + ' · ' + drag.count + ' cases' : name;
  const stop = linePlan !== null && linePlan.blocked >= 0;
  const reason = stop ? wrap('Un obstacle arrête la route.', 230) : !ok && tile >= 0 && (build || tool === TOOL_ERASE) && lineErase.length === 0 ? wrap(reasonText(tool, code), 230) : [];
  let w = Math.max(measure(head), 70);
  if (build) { let cw = 0; for (let k = 0; k < economy.resources.length; k++) if (economy.buildings[tool - TOOL_HOUSE].cost[k] > 0) cw += 26 + measure(String(economy.buildings[tool - TOOL_HOUSE].cost[k])); w = Math.max(w, cw); }
  for (const l of reason) w = Math.max(w, measure(l));
  w += 16; const h = 8 + kit.lineH + (build ? 20 : 0) + reason.length * kit.lineH + 4;
  const x = Math.max(4, Math.min(width() - w - 200, px + 20)), y = py + 22;
  parchment(x, y, w, h);
  text(kit.body, x + 8, y + 5, head, ok && !stop ? col('good') : col('bad'));
  let cy = y + 6 + kit.lineH;
  if (build) {
    const cost = economy.buildings[tool - TOOL_HOUSE].cost;
    let cx = x + 8;
    for (let k = 0; k < cost.length; k++) { if (cost[k] <= 0) continue; drawResource(k, cx, cy, 16); text(kit.small, cx + 18, cy + 1, String(cost[k]), world.stock[k] < cost[k] ? col('bad') : col('ink')); cx += 26 + measure(String(cost[k])); }
    cy += 20;
  }
  for (const l of reason) { text(kit.body, x + 8, cy, l, col('bad')); cy += kit.lineH; }
}
