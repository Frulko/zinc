import { dailyServices } from './services';
import { dailyHousing } from './housing';
import { goalReady } from '../rules/goals';
import { issue } from '../rules/commands';
import { dailyTrade } from './trade';
import { dailyMood } from './mood';
import { dailyRisks } from './risk';
import { dailyCrime } from './crime';
import { dailyAnimals } from './deer';
import { dailyWild } from './wild';
import { economy } from '../world/economy';
import { world } from '../world/world';

/** The slice of the simulation that runs once a day (every DAY_TICKS ticks): never per tick, so a big village costs nothing between two days. */
export function stepDay(): void {
  dailyServices();
  dailyHousing();
  dailyMood();
  dailyRisks();               // after the services reset the counters of the day before
  dailyCrime();               // the peace rating, then robbers and riots
  dailyAnimals();
  dailyWild();                // far animals fall asleep as counts, near ones wake (engine/wild.ts)
  dailyTrade();
  if (world.progression) for (let i = world.expeditions.length - 1; i >= 0; i--) { world.expeditions[i].left--; if (world.expeditions[i].left <= 0) issue('adventure_return', i); }
  if (world.progression) for (let k = 0; k < economy.goals.length; k++) if (goalReady(k)) issue('goal', k);   // the reward is a command: it is logged, so it replays
}
