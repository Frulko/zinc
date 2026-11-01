import { height } from 'zinc:gfx';
import { world } from '../world/world';
import { economy, amountText, BuildingDef } from '../world/economy';
import { TOOL_HOUSE } from '../constants';
import { lockText } from '../rules/goals';
import { drawBuilding, drawResource } from './icons';
import { kit, col, slab, parchment, block, button, text, textR, measure, BTN_DISABLED } from './kit';
import { ui, act, columnX, TOP_H } from './state';

// The build flyouts: the categories and their entries are read from the economy data (what a building does decides where it goes), never listed here.
export class Category { label: string = ''; glyph: string = ''; types: number[] = []; }
let cats: Category[] = [];
let signature = -1;

function add(list: Category[], label: string, glyph: string, type: number): void {
  for (const c of list) if (c.label === label) { c.types.push(type); return; }
  const c = new Category(); c.label = label; c.glyph = glyph; c.types.push(type); list.push(c);
}
export function categories(): Category[] {
  if (signature === economy.buildings.length) return cats;
  signature = economy.buildings.length; cats = [];
  const order: number[] = economy.buildings.map((_d: BuildingDef, type: number): number => type);
  order.sort((a: number, b: number): number => economy.buildings[a].order - economy.buildings[b].order);
  for (const type of order) {
    const d = economy.buildings[type];
    let hasIn = false, hasOut = false;
    for (let k = 0; k < economy.resources.length; k++) { if (d.inputs[k] > 0) hasIn = true; if (d.outputs[k] > 0) hasOut = true; }
    if (d.housing !== null) add(cats, 'Habitat', 'house', type);
    else if (d.store) add(cats, 'Entrepôts', 'crate', type);
    else if (hasIn) add(cats, 'Ateliers', 'hammer', type);
    else if (hasOut) add(cats, 'Récolte', 'saw', type);
    else add(cats, 'Autres', 'gear', type);
  }
  const fixed = ['Habitat', 'Récolte', 'Ateliers', 'Entrepôts', 'Autres'];
  cats.sort((a: Category, b: Category): number => fixed.indexOf(a.label) - fixed.indexOf(b.label));
  return cats;
}

/** Why a building cannot be chosen now ('' when it can): a pond it needs, or stock it lacks. */
export function lockReason(type: number): string {
  const d = economy.buildings[type], locked = lockText(type);
  if (locked !== '') return locked;
  if (d.gather === 'shore' && !world.hasWater) return 'Il faut un étang sur la carte.';
  const missing = amountText(d.cost, world.stock);
  return missing === '' ? '' : 'Il manque : ' + missing + '.';
}
function list(amounts: number[]): string {
  const parts: string[] = [];
  for (let k = 0; k < amounts.length; k++) if (amounts[k] > 0) parts.push(economy.resources[k].label + ' ' + amounts[k]);
  return parts.join(', ');
}
/** The tooltip of a building: its cost, its workers, what it takes in and gives out. */
export function buildingTip(type: number): string {
  const d = economy.buildings[type], lines: string[] = [d.label];
  lines.push('Coût : ' + list(d.cost));
  if (d.workers > 0) lines.push('Ouvriers : ' + d.workers);
  if (d.housing !== null) lines.push('Loge ' + d.housing.capacity + ' habitants');
  const inputs = list(d.inputs), outputs = list(d.outputs);
  if (inputs !== '') lines.push('Consomme : ' + inputs);
  if (outputs !== '') lines.push('Produit : ' + outputs + (d.seconds > 0 ? ' / ' + d.seconds + ' s' : ''));
  if (d.store) lines.push('Stocke jusqu’à ' + d.stockCap + ' de chaque');
  if (d.hint !== '') lines.push(d.hint);
  const reason = lockReason(type);
  if (reason !== '') lines.push(reason);
  return lines.join('\n');
}

export const flyAnchor = { y: 0 };
const ROW = 46, FW = 280;
/** The open flyout, to the left of the column and level with the category button. */
export function drawFlyout(): void {
  if (ui.category < 0 || ui.category >= categories().length) return;
  const c = categories()[ui.category], h = c.types.length * (ROW + 4) + 16, x = columnX() - FW - 4;
  const y = Math.max(TOP_H + 4, Math.min(height() - h - 34, flyAnchor.y));
  slab(x, y, FW, h); block(x, y, FW, h);
  for (let i = 0; i < c.types.length; i++) {
    const type = c.types[i], d = economy.buildings[type], by = y + 8 + i * (ROW + 4), reason = lockReason(type), ok = reason === '';
    button('b:' + type, x + 8, by, FW - 16, ROW, buildingTip(type), ok, ui.tool === TOOL_HOUSE + type);
    drawBuilding(type, x + 12, by + 3, 40);
    text(kit.body, x + 58, by + 4, d.label, ok ? col('barText') : col('disabled'));
    let cx = x + 58;
    for (let k = 0; k < economy.resources.length; k++) {
      if (d.cost[k] <= 0) continue;
      drawResource(k, cx, by + 24, 16);
      const lack = world.stock[k] < d.cost[k];
      text(kit.small, cx + 18, by + 25, String(d.cost[k]), lack ? col('bad') : col('barText'));
      cx += 22 + measure(String(d.cost[k]));
    }
    if (!ok) textR(kit.small, x + FW - 14, by + 25, lockText(type) !== '' ? 'verrouillé' : d.gather === 'shore' && !world.hasWater ? 'étang requis' : 'manque', col('warn'));
  }
}
export function buildClick(id: string): boolean {
  if (!id.startsWith('b:')) return false;
  act.setTool(TOOL_HOUSE + Number(id.slice(2))); ui.category = -1;
  return true;
}
