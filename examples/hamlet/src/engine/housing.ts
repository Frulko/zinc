import { HOUSE } from '../constants';
import { world } from '../world/world';
import { economy, Housing } from '../world/economy';
import { take } from '../rules/stock';
import { levelCount, capacityOf, meets } from '../rules/housing';
import { evictResidents } from './villagers';

export const FOOD_DAYS = 3;   // days one meal of a kind lasts

/** The daily slice for houses: meals, then evolution with hysteresis. */
export function dailyHousing(): void {
  const h = economy.buildings[HOUSE].housing as Housing;
  for (let id = 0; id < world.buildings.length; id++) {
    const b = world.buildings[id];
    if (!b.alive || b.type !== HOUSE) continue;
    for (const k of h.eats.concat(h.uses)) if (b.fed[k] > 0) b.fed[k]--;
    // a house buys its meals at the market that serves it: as many kinds as the next level (or its own) asks, one unit per two people for FOOD_DAYS days
    const reach = h.mealsFrom < 0 || b.cover[h.mealsFrom] > 0;
    if (b.residents > 0 && reach) {
      let wanted = 1, have = 0;
      for (let l = 0; l <= Math.min(b.level + 1, levelCount() - 1); l++) wanted = Math.max(wanted, h.levels[l].foods);
      for (const k of h.eats) if (b.fed[k] > 0) have++;
      for (const k of h.eats) {
        if (have >= wanted) break;
        if (b.fed[k] > 0 || world.stock[k] < 1) continue;
        take(k, Math.ceil(b.residents / 2)); b.fed[k] = FOOD_DAYS; have++;
      }
    }
    if (b.residents > 0 && reach) for (const k of h.uses) if (b.fed[k] <= 0 && world.stock[k] >= 1) { take(k, Math.ceil(b.residents / 4)); b.fed[k] = FOOD_DAYS; }   // candles: lit for a few days
    // evolution: `evolveDays` days in a row meeting the next level, or `devolveDays` failing the own one (with the margin), moves one level
    if (b.level + 1 < levelCount() && meets(b, b.level + 1, 0)) {
      b.streak = Math.max(b.streak, 0) + 1;
      if (b.streak >= h.evolveDays) { b.level++; b.streak = 0; world.revision++; world.saveDirty = true; }
    } else if (b.level > 0 && !meets(b, b.level, h.margin)) {
      b.streak = Math.min(b.streak, 0) - 1;
      if (-b.streak >= h.devolveDays) {
        b.level--; b.streak = 0; world.revision++; world.saveDirty = true;
        if (b.residents > capacityOf(b)) evictResidents(id, capacityOf(b));
      }
    } else b.streak = 0;
  }
}
