import { dailyServices } from './services';
import { dailyHousing } from './housing';

/** The slice of the simulation that runs once a day (every DAY_TICKS ticks): never per tick, so a big village costs nothing between two days. */
export function stepDay(): void {
  dailyServices();
  dailyHousing();
}
