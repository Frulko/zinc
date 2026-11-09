import { world } from '../world/world';
import { updatePeople, assignJobs } from './villagers';
import { updateDeer } from './deer';
import { updateNature } from './nature';
import { saveGame } from '../world/save';
import { stepDay } from './day';
import { appealSlice } from '../rules/appeal';
import { economy } from '../world/economy';
import { updateOutlaws } from './crime';
import { SAVE_DELAY, TICK, DAY_TICKS } from '../constants';
import { Command } from '../world/world';
import { submit, runDue } from '../rules/commands';

/** One tick (TICK seconds) of the whole village. Pure game state: drawing never calls it; the scene feeds it whole ticks from its own accumulator. */
export function stepWorld(): void {
  world.tick++;
  world.time += TICK;
  world.jobTimer -= TICK;
  if (world.jobTimer <= 0) { world.jobTimer = 1; assignJobs(); }
  const slices = Math.min(economy.sim.appealSlices, DAY_TICKS), inDay = world.tick % DAY_TICKS;
  if (inDay >= DAY_TICKS - slices) appealSlice(inDay - (DAY_TICKS - slices), slices);   // the desirability pass, spread over the last ticks of the day (rules/appeal.ts)
  if (inDay === 0) stepDay();
  updatePeople(TICK);
  updateOutlaws(TICK);
  updateDeer(TICK);
  updateNature(TICK);
  if (world.autosave && world.saveDirty && world.time - world.lastSave > SAVE_DELAY) saveGame();
}

/** Steps n ticks, running the queued commands due before each one (rules/commands.ts). A paused village still runs its commands (an unpause among them) but its clock
 *  does not move: advance(0) only runs what is due. */
export function advance(n: number): void {
  runDue();
  for (let k = 0; k < n && !world.paused; k++) { stepWorld(); runDue(); }
}
/** The player's path: queue a command and run it at this tick, so the scene can answer at once. Its result is PLACE_OK or why it was refused. */
export function play(c: Command): number { submit(c); advance(0); return c.result; }
