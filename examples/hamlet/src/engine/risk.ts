import { HOUSE, BS_IDLE } from '../constants';
import { world, Alert, random, recount, tileI, tileJ, tileIndex } from '../world/world';
import { economy } from '../world/economy';
import { population, removeResidents, releaseWorkers } from './villagers';
import { level } from '../rules/difficulty';
import { sendRobber } from './crime';

// Risks: fire, collapse and petty theft, from the daily counters of each building (economy.json "risk" per building, "risks" for the rules). The numbers follow the classic
// city builders as a calibration only: a building's fire counter rises on its own day (one day in `slots`), wear every day, and a safety walker passing within two tiles
// resets the counter (engine/services.ts, guard). Past a threshold the event happens: a burning ruin that spreads to its neighbours and leaves rubble the player must demolish,
// a collapse that leaves rubble at once, a theft that takes a little from the stock. Nothing runs below `minPopulation` people (the first houses are safe) or when the
// village was created without risks (world.risks). The only random draw is the day's fire slot, so a seed replays.

export const isRuin = (type: number): boolean => type === economy.risk.ruin;
const label = (type: number): string => economy.buildings[type].label;
function raise(kind: string, text: string, tile: number): void { const a = new Alert(); a.kind = kind; a.text = text; a.tile = tile; world.alerts.push(a); }

/** What a building adds to its fire counter on its day: a house by its level (an empty one burns nothing), another building by its own weight. */
export function fireWeight(b: { type: number; level: number; residents: number }): number {
  const w = economy.buildings[b.type].risk;
  if (w === null || (b.type === HOUSE && b.residents === 0)) return 0;
  return w.fire[Math.min(b.level, w.fire.length - 1)];
}
/** Which of the `slots` days a building's fire counter rises on (fixed for the building). */
const slotOf = (id: number): number => (id * 5 + world.buildings[id].i * 3 + world.buildings[id].j * 7) % economy.risk.slots;

/** Turns a building into the ruin: its people leave, its goods are lost, the tile now holds rubble (burning for `burn` days). */
function destroy(id: number, burn: number): void {
  const b = world.buildings[id];
  if (b.type === HOUSE) removeResidents(id); else releaseWorkers(id);
  for (let k = 0; k < b.stock.length; k++) b.stock[k] = 0;
  b.type = economy.risk.ruin; b.residents = 0; b.workers = 0; b.level = 0; b.streak = 0; b.happy = 60; b.state = BS_IDLE; b.waitFor = -1;
  b.fire = 0; b.damage = 0; b.crime = 0; b.burn = burn;
  recount(); world.revision++; world.netRev++; world.saveDirty = true;
}
function ignite(id: number): void {
  const b = world.buildings[id], name = label(b.type), people = b.type === HOUSE ? b.residents : 0, tile = tileIndex(b.i, b.j);
  destroy(id, economy.risk.burnDays);
  raise('fire', 'Incendie : ' + name + ' en flammes !' + (people > 0 ? ' Les habitants fuient le hameau.' : '') + ' Les voisins sont menacés.', tile);
}
function collapse(id: number): void {
  const b = world.buildings[id], name = label(b.type), people = b.type === HOUSE ? b.residents : 0, tile = tileIndex(b.i, b.j);
  destroy(id, 0);
  raise('collapse', 'Effondrement : ' + name + ', le bâtiment s’est écroulé.' + (people > 0 ? ' Les habitants ont fui.' : '') + ' Démolissez les décombres pour libérer la place.', tile);
}
/** A theft: the dearest goods the building holds free (not promised to a porter), `theft` units at most. */
function steal(id: number): void {
  const b = world.buildings[id];
  let best = -1;
  for (let k = 0; k < b.stock.length; k++) if (b.stock[k] - b.reserved[k] >= 1 && (best < 0 || economy.resources[k].price > economy.resources[best].price)) best = k;
  if (best < 0) return;
  const n = Math.min(economy.risk.theft, Math.floor(b.stock[best] - b.reserved[best]));
  b.stock[best] -= n; recount(); world.saveDirty = true;
  raise('theft', 'Vol : ' + n + ' ' + economy.resources[best].label.toLowerCase() + ' dérobé' + (n > 1 ? 's' : '') + ' (' + label(b.type) + ').', tileIndex(b.i, b.j));
}

/** The fire of a burning ruin passes to the buildings around it, and it burns down by a day. */
function burnDown(id: number): void {
  const b = world.buildings[id], r = economy.risk;
  for (let dj = -1; dj <= b.h; dj++) for (let di = -1; di <= b.w; di++) {
    const i = b.i + di, j = b.j + dj;
    if ((di >= 0 && di < b.w && dj >= 0 && dj < b.h) || i < 0 || j < 0 || i >= world.size || j >= world.size) continue;
    const n = world.build[tileIndex(i, j)];
    if (n >= 0 && world.buildings[n].alive && !world.buildings[n].fixed && !isRuin(world.buildings[n].type)) world.buildings[n].fire += r.spread;
  }
  b.burn--;
  if (b.burn <= 0) raise('rubble', 'Le feu s’est éteint : il ne reste que des décombres. Démolissez-les pour libérer la case.', tileIndex(b.i, b.j));
}

/** The daily slice for risks (engine/day.ts). Does nothing, and draws no random number, in a village without risks. A fire already burning goes on whatever the population; new
 *  counters rise only from `minPopulation` people. */
export function dailyRisks(): void {
  const r = economy.risk;
  if (!world.risks || r.ruin < 0) return;
  for (let id = 0; id < world.buildings.length; id++) if (world.buildings[id].alive && isRuin(world.buildings[id].type) && world.buildings[id].burn > 0) burnDown(id);
  if (population() < r.minPopulation) return;
  const today = Math.floor(random() * r.slots), crimeRate = world.mood >= 75 ? 0 : world.mood < 50 ? 2 : 1;
  for (let id = 0; id < world.buildings.length; id++) {
    const b = world.buildings[id];
    if (!b.alive || b.fixed || isRuin(b.type)) continue;
    const w = economy.buildings[b.type].risk;
    if (w === null || (b.type === HOUSE && b.residents === 0)) continue;
    const mine = slotOf(id) === today, pace = level().risk / 100;      // the difficulty scales how fast every counter rises
    if (mine) b.fire += fireWeight(b) * pace;
    if (!(b.type === HOUSE && b.level === 0)) b.damage += (mine ? 3 : 1) * w.collapse * pace;      // a hut does not wear out
    b.crime += w.crime * crimeRate * pace;
  }
  for (let id = 0; id < world.buildings.length; id++) {
    const b = world.buildings[id];
    if (!b.alive || b.fixed || isRuin(b.type)) continue;
    if (b.fire > r.fireAt) ignite(id);
    else if (b.damage > r.collapseAt) collapse(id);
    else if (b.crime > r.crimeAt) { b.crime = 0; if (!sendRobber(id)) steal(id); }
  }
}
