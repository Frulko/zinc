import { HOUSE } from '../constants';
import { world, growSpot, resizeBuilding } from '../world/world';
import { economy, Housing } from '../world/economy';
import { take } from '../rules/stock';
import { levelCount, capacityOf, meets, feed } from '../rules/housing';
import { evictResidents } from './villagers';

/** The daily slice for houses: meals, then evolution with hysteresis. */
export function dailyHousing(): void {
  const h = economy.buildings[HOUSE].housing as Housing;
  for (let id = 0; id < world.buildings.length; id++) {
    const b = world.buildings[id];
    if (!b.alive || b.type !== HOUSE) continue;
    for (const k of h.eats.concat(h.uses)) if (b.fed[k] > 0) b.fed[k]--;
    // with a market in the rules the vendor hands the meals out on its round (engine/services.ts); without one the house buys at the stores
    if (h.mealsFrom < 0) feed(b, take);
    // evolution: `evolveDays` days in a row meeting the next level, or `devolveDays` failing the own one (with the margin), moves one level
    if (b.level + 1 < levelCount() && meets(b, b.level + 1, 0)) {
      b.streak = Math.max(b.streak, 0) + 1;
      if (b.streak >= h.evolveDays) {
        const lv = h.levels[b.level + 1];
        const spot = lv.w > b.w || lv.h > b.h ? growSpot(b, lv.w, lv.h) : -2;
        if (spot === -1) continue;                                   // no room after all: it waits (meets() asked for it already)
        if (spot >= 0) resizeBuilding(id, lv.w, lv.h, spot);
        b.level++; b.streak = 0; world.revision++; world.saveDirty = true;
      }
    } else if (b.level > 0 && !meets(b, b.level, h.margin)) {
      b.streak = Math.min(b.streak, 0) - 1;
      if (-b.streak >= h.devolveDays) {
        b.level--; b.streak = 0; world.revision++; world.saveDirty = true;
        if (h.levels[b.level].w < b.w || h.levels[b.level].h < b.h) resizeBuilding(id, h.levels[b.level].w, h.levels[b.level].h);
        if (b.residents > capacityOf(b)) evictResidents(id, capacityOf(b));
      }
    } else b.streak = 0;
  }
}
