import { world } from '../world/world';
import { updatePeople, assignJobs } from './villagers';
import { updateDeer } from './deer';
import { updateNature } from './nature';
import { saveGame } from '../world/save';
import { SAVE_DELAY } from '../constants';

let jobTimer = 0;
/** One step of the whole village. Pure game state: drawing never calls it. */
export function stepWorld(dt: number): void {
  world.time += dt;
  jobTimer -= dt;
  if (jobTimer <= 0) { jobTimer = 1; assignJobs(); }
  updatePeople(dt);
  updateDeer(dt);
  updateNature(dt);
  if (world.autosave && world.saveDirty && world.time - world.lastSave > SAVE_DELAY) saveGame();
}
