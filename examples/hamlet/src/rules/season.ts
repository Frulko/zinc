import { world } from '../world/world';
import { TICK } from '../constants';

// The village calendar, derived from the simulation's tick (so it is saved with the village): 15 seconds a month, a year of 12 months starting in March.
// The rules read it too (a beehive sleeps in winter), so it lives here and the clock of the HUD only words it.
export const MONTH_SECONDS = 15;
export const WINTER = 3;
export function monthIndex(): number { return Math.floor(world.tick * TICK / MONTH_SECONDS); }
/** 0 spring, 1 summer, 2 autumn, 3 winter. */
export function season(): number { return Math.floor((monthIndex() % 12) / 3); }
