import { HOUSE, ROLE_PEDDLER } from '../constants';
import { world, Person } from '../world/world';
import { servicesOffered, worksites, houseNeeds, HouseNeeds, approach, personTarget, feelFrom, isJobless, HAPPY_STEP, MOOD_STEP, leavingToday } from '../rules/needs';
import { isConnected, evictResidents } from './villagers';

/** The daily slice for the residents' contentment: houses move toward what they offer, people toward their own round, the village average decides who leaves (and, in updateSettlers, who comes). */
export function dailyMood(): void {
  const offered = servicesOffered(), jobs = worksites() > 0;
  let pop = 0, jobless = 0;
  for (const p of world.people) if (p.role !== ROLE_PEDDLER) { pop++; if (jobs && isJobless(p)) jobless++; }
  world.jobless = pop === 0 ? 0 : Math.round(100 * jobless / pop);
  const needs: HouseNeeds[] = world.buildings.map((b): HouseNeeds => b.alive && b.type === HOUSE ? houseNeeds(b, offered) : new HouseNeeds());
  for (let id = 0; id < world.buildings.length; id++) {
    const b = world.buildings[id];
    if (b.alive && b.type === HOUSE && b.residents > 0) b.happy = approach(b.happy, needs[id].target, HAPPY_STEP);
  }
  let sum = 0, n = 0;
  for (const p of world.people) {
    const b = world.buildings[p.home];
    if (p.role === ROLE_PEDDLER || b === undefined || !b.alive) continue;
    p.mood = approach(p.mood, personTarget(p, b, jobs), MOOD_STEP);
    if (p.fun > 0) p.fun--;
    p.feel = feelFrom(p.mood, p.fatigue, jobs && isJobless(p), needs[p.home].hungry, !isConnected(b));
    sum += p.mood; n++;
  }
  world.mood = n === 0 ? 70 : Math.round(sum / n);
  let left = 0;
  for (let k = leavingToday(world.mood, n); k > 0; k--) {          // the unhappiest leaves
    let worst: Person | null = null;
    for (const p of world.people) if (p.role !== ROLE_PEDDLER && (worst === null || p.mood < worst.mood)) worst = p;
    if (worst === null) break;
    let inHouse = 0;
    for (const p of world.people) if (p.home === worst.home && p.role !== ROLE_PEDDLER) inHouse++;
    evictResidents(worst.home, inHouse - 1); left++;
  }
  if (left > 0) { world.news.push(left === 1 ? 'Un habitant quitte le hameau, mécontent.' : left + ' habitants quittent le hameau, mécontents.'); world.saveDirty = true; }
}
