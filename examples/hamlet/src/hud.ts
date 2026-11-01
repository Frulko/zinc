import { HOUSE } from './constants';
import { world } from './world/world';
import { economy } from './world/economy';
import { population, isConnected } from './engine/villagers';

function count(type: number): number {
  let n = 0;
  for (const b of world.buildings) if (b.alive && b.type === type) n++;
  return n;
}
/** A resource shows once the village holds some or a building that makes it stands. */
export function resourceLine(): string {
  const parts: string[] = [];
  for (let k = 0; k < economy.resources.length; k++) {
    let made = false;
    for (const b of world.buildings) if (b.alive && economy.buildings[b.type].outputs[k] > 0) made = true;
    if (world.stock[k] > 0 || made || economy.start[k] > 0) parts.push(economy.resources[k].label + ' ' + world.stock[k]);
  }
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
  let open = 0, jobs = 0;
  for (let type = 1; type < economy.buildings.length; type++) {
    const def = economy.buildings[type];
    if (def.hint !== '' && count(type) === 0 && (def.gather !== 'shore' || world.hasWater)) return def.hint;
  }
  for (const b of world.buildings) if (b.alive && b.type !== HOUSE) { open += economy.buildings[b.type].workers - b.workers; jobs += economy.buildings[b.type].workers; }
  if (open > 0 && population() < jobs) return 'Il manque des bras : posez une maison de plus au bord de la route.';
  if (world.waitingForFood) return 'Les nouveaux venus attendent de quoi manger avant de s’installer.';
  return 'Le hameau vit. Ajoutez des maisons et des routes pour l’agrandir.';
}
