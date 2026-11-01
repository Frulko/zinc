import { world } from '../world/world';
import { TICK } from '../constants';
import { MONTH_SECONDS, monthIndex } from '../rules/season';

// The words of the village calendar (the numbers are rules/season.ts).
export { MONTH_SECONDS, monthIndex, season } from '../rules/season';
const MONTHS: string[] = ['Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre', 'Janvier', 'Février'];
export const SEASONS: string[] = ['Printemps', 'Été', 'Automne', 'Hiver'];
export function year(): number { return Math.floor(monthIndex() / 12) + 1; }
export function dateText(): string {
  const t = world.tick * TICK, day = Math.floor((t % MONTH_SECONDS) / MONTH_SECONDS * 30) + 1;
  return day + ' ' + MONTHS[monthIndex() % 12] + ' · An ' + year();
}
