import { HOUSE } from './constants';
import { computeHints, hintText, HINT_BUILD_NEXT } from './rules/hints';
import { world } from './world/world';
import { economy, BuildingDef, Housing } from './world/economy';
import { population, isConnected } from './engine/villagers';

function count(type: number): number {
  let n = 0;
  for (const b of world.buildings) if (b.alive && b.type === type) n++;
  return n;
}
/** A resource shows once the village holds some or a building that makes it stands. */
export function resourceShown(k: number): boolean {
  let made = false;
  for (const b of world.buildings) if (b.alive && economy.buildings[b.type].outputs[k] > 0) made = true;
  return world.stock[k] > 0 || made || economy.start[k] > 0;
}
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
    if (type === HOUSE) continue;
    if (def.hint !== '' && count(type) === 0 && (def.gather !== 'shore' || world.hasWater)) return def.hint;
  }
  for (const b of world.buildings) if (b.alive && b.type !== HOUSE) { open += economy.buildings[b.type].workers - b.workers; jobs += economy.buildings[b.type].workers; }
  if (open > 0 && population() < jobs) return 'Il manque des bras : posez une maison de plus au bord de la route.';
  if (world.waitingForFood) return 'Les nouveaux venus attendent : ' + economy.resources[(economy.buildings[HOUSE].housing as Housing).eats[0]].label.toLowerCase() + ' ou poisson.';
  return 'Le hameau vit. Ajoutez des maisons et des routes pour l’agrandir.';
}
