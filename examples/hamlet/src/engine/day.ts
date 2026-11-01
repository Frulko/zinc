import { dailyServices } from './services';
import { dailyHousing } from './housing';
import { computeAppeal } from '../rules/appeal';
import { goalReady } from '../rules/goals';
import { issue } from '../rules/commands';
import { dailyTrade } from './trade';
import { dailyMood } from './mood';
import { dailyAnimals } from './deer';
import { economy } from '../world/economy';
import { world } from '../world/world';

/** The slice of the simulation that runs once a day (every DAY_TICKS ticks): never per tick, so a big village costs nothing between two days. */
export function stepDay(): void {
  computeAppeal();            // before the houses read it
  dailyServices();
  dailyHousing();
  dailyMood();
  dailyAnimals();
  dailyTrade();
  if (world.progression) for (let i = world.expeditions.length - 1; i >= 0; i--) { world.expeditions[i].left--; if (world.expeditions[i].left <= 0) issue('adventure_return', i); }
  if (world.progression) for (let k = 0; k < economy.goals.length; k++) if (goalReady(k)) issue('goal', k);   // the reward is a command: it is logged, so it replays
}
