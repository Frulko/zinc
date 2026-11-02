import { HOUSE } from './constants';
import { computeHints, hintText, HINT_BUILD_NEXT } from './rules/hints';
import { world } from './world/world';
import { economy, BuildingDef, Housing } from './world/economy';
import { isUnlocked } from './rules/goals';
import { population, isConnected } from './engine/villagers';
import { labourStats, Labour } from './rules/labour';
import { ui } from './ui/state';

function count(type: number): number {
  let n = 0;
  for (const b of world.buildings) if (b.alive && b.type === type) n++;
  return n;
}
// The top bar and the advisors read the village through this snapshot, refreshed about once a second or when the map changes: the scans over buildings and people cost O(1) per frame.
export class Summary { shown: number[] = []; matters: number[] = []; food: number[] = []; people: number = 0; labour: Labour = new Labour(); rev: number = -1; at: number = -100; }
const snap = new Summary();
/** The snapshot, refreshed when a second went by (real time) or the village changed. */
export function summary(): Summary {
  if (snap.rev === world.revision && ui.time - snap.at < 1 && ui.time >= snap.at) return snap;
  snap.rev = world.revision; snap.at = ui.time;
  snap.shown = []; snap.matters = [];
  const made: boolean[] = economy.resources.map((): boolean => false), paid: boolean[] = economy.resources.map((): boolean => false);
  for (const b of world.buildings) if (b.alive) { const d = economy.buildings[b.type]; for (let k = 0; k < made.length; k++) if (d.outputs[k] > 0) made[k] = true; }
  for (const d of economy.buildings) if (d.buildable) for (let k = 0; k < paid.length; k++) if (d.cost[k] > 0) paid[k] = true;
  const h = economy.buildings[HOUSE].housing as Housing;
  snap.food = h.eats.slice();
  for (let k = 0; k < economy.resources.length; k++) {
    if (world.stock[k] > 0 || made[k] || economy.start[k] > 0) { snap.shown.push(k); if (paid[k] && snap.food.indexOf(k) < 0) snap.matters.push(k); }
  }
  snap.people = population(); snap.labour = labourStats();
  return snap;
}
/** A resource shows once the village holds some or a building that makes it stands. */
export function resourceShown(k: number): boolean { return summary().shown.indexOf(k) >= 0; }
/** The stock of all the foods the houses eat. */
export function foodStock(): number { let n = 0; for (const k of summary().food) n += world.stock[k]; return n; }
export function resourceLine(): string {
  const parts: string[] = [];
  for (let k = 0; k < economy.resources.length; k++) if (resourceShown(k)) parts.push(economy.resources[k].label + ' ' + world.stock[k]);
  parts.push('Habitants ' + population());
  return parts.join('   ·   ');
}
/** The one sentence that tells the player what to try next: the game teaches itself from its own state. */
export function adviceLine(): string {
  if (count(HOUSE) === 0) return 'Tracez une route depuis la porte du hameau, puis posez une maison à son bord.';
  let linked = false;
  for (const b of world.buildings) if (b.alive && b.type === HOUSE && isConnected(b)) linked = true;
  if (!linked) return 'La maison doit être reliée à la porte du hameau par la route.';
  if (population() === 0) return 'Les premiers habitants arrivent par la route…';
  const hints = computeHints();                            // what the simulation says is wrong, most severe first
  if (hints.length > 0 && hints[0].kind !== HINT_BUILD_NEXT && hints[0].severity >= 2) return hintText(hints[0]);
  let open = 0, jobs = 0;
  const byOrder: number[] = economy.buildings.map((_d: BuildingDef, type: number): number => type);
  byOrder.sort((a: number, b: number): number => economy.buildings[a].order - economy.buildings[b].order);
  for (const type of byOrder) {
    const def = economy.buildings[type];
    if (type === HOUSE || !isUnlocked(type)) continue;
    if (def.hint !== '' && count(type) === 0 && (def.gather !== 'shore' || world.hasWater)) return def.hint;
  }
  for (const b of world.buildings) if (b.alive && b.type !== HOUSE) { open += economy.buildings[b.type].workers - b.workers; jobs += economy.buildings[b.type].workers; }
  if (open > 0 && population() < jobs) return 'Il manque des bras : posez une maison de plus au bord de la route.';
  if (world.waitingForFood) return 'Les nouveaux venus attendent : ' + economy.resources[(economy.buildings[HOUSE].housing as Housing).eats[0]].label.toLowerCase() + ' ou poisson.';
  return 'Le hameau vit. Ajoutez des maisons et des routes pour l’agrandir.';
}
