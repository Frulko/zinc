import { world } from '../world/world';
import { economy, Difficulty } from '../world/economy';

// The difficulty of a village (economy.json "difficulties", chosen in the new-village form, saved with the village): the start and three paces, in percent of the normal one.
// A sandbox (World.difficulty -1) and a file without difficulties use the neutral level: the top-level start, 100 % everywhere.

const NEUTRAL = new Difficulty();
/** The level in force. */
export function level(): Difficulty {
  const k = world.difficulty;
  return k >= 0 && k < economy.difficulties.length ? economy.difficulties[k] : NEUTRAL;
}
/** The level's name for the screens: its label, or the sandbox's. */
export const levelLabel = (): string => world.difficulty >= 0 && world.difficulty < economy.difficulties.length ? economy.difficulties[world.difficulty].label : 'Bac à sable';
/** The normal level of the form (the one called "normal", else the middle one, else -1). */
export function defaultLevel(): number {
  for (let k = 0; k < economy.difficulties.length; k++) if (economy.difficulties[k].id === 'normal') return k;
  return economy.difficulties.length > 0 ? Math.floor(economy.difficulties.length / 2) : -1;
}
