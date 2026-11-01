import { world } from '../world/world';
import { TICK } from '../constants';

// The village calendar, derived from the simulation's tick (so it is saved with the village): 15 seconds a month, a year of 12 months starting in March.
export const MONTH_SECONDS = 15;
const MONTHS: string[] = ['Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre', 'Janvier', 'Février'];
export const SEASONS: string[] = ['Printemps', 'Été', 'Automne', 'Hiver'];
export function monthIndex(): number { return Math.floor(world.tick * TICK / MONTH_SECONDS); }
export function year(): number { return Math.floor(monthIndex() / 12) + 1; }
export function season(): number { return Math.floor((monthIndex() % 12) / 3); }
export function dateText(): string {
  const t = world.tick * TICK, day = Math.floor((t % MONTH_SECONDS) / MONTH_SECONDS * 30) + 1;
  return day + ' ' + MONTHS[monthIndex() % 12] + ' · An ' + year();
}
