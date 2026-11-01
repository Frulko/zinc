import { world } from '../world/world';
import { updatePeople, assignJobs } from './villagers';
import { updateDeer } from './deer';
import { updateNature } from './nature';
import { saveGame } from '../world/save';
import { stepDay } from './day';
import { updateOutlaws } from './crime';
import { SAVE_DELAY, TICK, DAY_TICKS } from '../constants';

/** One tick (TICK seconds) of the whole village. Pure game state: drawing never calls it; the scene feeds it whole ticks from its own accumulator. */
export function stepWorld(): void {
  world.tick++;
  world.time += TICK;
  world.jobTimer -= TICK;
  if (world.jobTimer <= 0) { world.jobTimer = 1; assignJobs(); }
  if (world.tick % DAY_TICKS === 0) stepDay();
  updatePeople(TICK);
  updateOutlaws(TICK);
  updateDeer(TICK);
  updateNature(TICK);
  if (world.autosave && world.saveDirty && world.time - world.lastSave > SAVE_DELAY) saveGame();
}
