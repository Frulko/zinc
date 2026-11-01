import { HOUSE, SAWMILL, LODGE, FISHERY, WORKERS_PER_SITE } from './constants';
import { world } from './world/world';
import { population, isConnected } from './engine/villagers';

function count(type: number): number {
  let n = 0;
  for (const b of world.buildings) if (b.alive && b.type === type) n++;
  return n;
}
export function resourceLine(): string {
  return 'Bois ' + world.wood + '   ·   Gibier ' + world.meat + (world.hasWater ? '   ·   Poisson ' + world.fish : '') + '   ·   Habitants ' + population();
}
/** The one sentence that tells the player what to try next: the game teaches itself from its own state. */
export function adviceLine(): string {
  if (count(HOUSE) === 0) return 'Tracez une route depuis la porte du hameau, puis posez une maison à son bord.';
  let linked = false;
  for (const b of world.buildings) if (b.alive && b.type === HOUSE && isConnected(b)) linked = true;
  if (!linked) return 'La maison doit être reliée à la porte du hameau par la route.';
  if (population() === 0) return 'Les premiers habitants arrivent par la route…';
  if (count(SAWMILL) === 0) return 'Les habitants ne font rien : posez une scierie pour qu’ils coupent du bois.';
  if (count(LODGE) === 0) return 'Un atelier de chasse forme des chasseurs qui rapportent du gibier.';
  if (world.hasWater && count(FISHERY) === 0) return 'Un étang : posez un atelier de pêche au bord de l’eau, près d’une route.';
  let open = 0;
  for (const b of world.buildings) if (b.alive && b.type !== HOUSE) open += WORKERS_PER_SITE - b.workers;
  if (open > 0 && population() < (count(SAWMILL) + count(LODGE) + count(FISHERY)) * WORKERS_PER_SITE) return 'Il manque des bras : posez une maison de plus au bord de la route.';
  if (world.waitingForMeat) return 'Les nouveaux venus attendent du gibier avant de s’installer.';
  return 'Le hameau vit. Ajoutez des maisons et des routes pour l’agrandir.';
}
