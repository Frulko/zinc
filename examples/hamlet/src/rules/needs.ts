import { HOUSE, DAY_TICKS, ROLE_SETTLER, ROLE_RESIDENT } from '../constants';
import { world, Building, Person } from '../world/world';
import { economy, ServiceDef, Service, Housing } from '../world/economy';
import { foodKinds, levelOf, litBonus } from './housing';

// What the residents need and how they feel. Pure functions of the world (engine/mood.ts applies them once a day, engine/routine.ts lives the daily round).
// The mechanics follow the classic city builders: a house's contentment moves a little each day toward what the house offers, the village's average decides
// whether newcomers come or people leave, and the numbers are Hamlet's own, tuned by play.

/** Fraction of the day gone (0 at dawn). The last part of it is night: people sleep at home, animals lie up. */
export function dayFraction(): number { return (world.tick % DAY_TICKS) / DAY_TICKS; }
export function isNight(): boolean { return dayFraction() > .72; }

export const FEEL_CONTENT = 0, FEEL_SOSO = 1, FEEL_HUNGRY = 2, FEEL_TIRED = 3, FEEL_JOBLESS = 4, FEEL_HOMELESS = 5, FEEL_ANGRY = 6;
/** Short words (the bubble, the window), by FEEL_*. */
export const FEEL_WORDS: string[] = ['Content', 'Ça va', 'Affamé', 'Fatigué', 'Sans travail', 'Sans abri', 'En colère'];
/** The free-time places: a person with nothing to do walks to the nearest and comes back a little lifted. */
export const FREE_PLACES: string[] = ['market', 'well', 'tavern'];

export const HAPPY_STEP = 2;          // most a house's contentment moves in a day
export const MOOD_STEP = 4;           // most a person's mood moves in a day
export const TIRED_AT = 80;           // fatigue from which a person is tired
export const SLEEP_RECOVERY = 15;     // fatigue lost per second asleep
export const BUBBLE_MOOD = 50;        // the bubbles over heads show people who are not content

/** The service ids the village offers (1) or not (0), per service of economy.json. */
export function servicesOffered(): number[] {
  const out: number[] = economy.services.map((_s: Service): number => 0);
  for (const b of world.buildings) if (b.alive && economy.buildings[b.type].service !== null) out[(economy.buildings[b.type].service as ServiceDef).service] = 1;
  return out;
}
/** Workplaces (not houses, not stores) the village has: without any, being idle is not being jobless. */
export function worksites(): number {
  let n = 0;
  for (const b of world.buildings) if (b.alive && b.type !== HOUSE && !b.fixed && economy.buildings[b.type].workers > 0) n++;
  return n;
}

export class HouseNeeds { target: number = 0; lack: string = ''; hungry: boolean = false; }
/** What a house offers its people: food variety, its level, the neighbourhood, the services that reach it, minus the village's unemployment. `lack` is the worst gap (a service id, `food`, `jobs`, or ''). */
export function houseNeeds(b: Building, offered: number[]): HouseNeeds {
  const out = new HouseNeeds(), h = economy.buildings[HOUSE].housing as Housing, tile = b.j * world.size + b.i;
  let target = 52, worst = 0;
  const note = (id: string, cost: number): void => { if (cost > worst) { worst = cost; out.lack = id; } };
  const have = foodKinds(b), want = levelOf(b).foods, expected = h.mealsFrom < 0 || offered[h.mealsFrom] === 1;
  if (expected && have === 0) { target -= 22; out.hungry = true; note('food', 22); }
  else if (have > 0) target += 8 + Math.min(14, Math.max(0, have - want) * 7);
  target += Math.min(9, b.level * 3);
  const here = world.appeal[tile] + litBonus(b);
  target += Math.max(-8, Math.min(14, here * 2)); if (here < 0) note('appeal', -here * 2);
  for (let k = 0; k < offered.length; k++) {
    if (offered[k] !== 1) continue;
    if (b.cover[k] > 0) target += 5; else { target -= 7; note(economy.services[k].id, 7); }
  }
  const unemployment = Math.min(12, Math.max(0, (world.jobless - 8) * .4));
  target -= unemployment; note('jobs', unemployment);
  out.target = Math.max(0, Math.min(100, Math.round(target)));
  return out;
}
/** Moves a value at most `step` toward a target. */
export function approach(v: number, target: number, step: number): number { return v < target ? Math.min(target, v + step) : Math.max(target, v - step); }

export const isJobless = (p: Person): boolean => (p.role === ROLE_RESIDENT || p.role === ROLE_SETTLER) && p.job < 0;
/** What a person's own life adds to the contentment of the house: work (or the lack of it), rest, a visit to the market or tavern. */
export function personTarget(p: Person, house: Building, jobs: boolean): number {
  let t = house.happy;
  if (p.job >= 0) t += 3; else if (jobs && isJobless(p)) t -= 8;
  if (p.fatigue >= TIRED_AT) t -= 8;
  if (p.fun > 0) t += 6;
  return Math.max(0, Math.min(100, t));
}
/** The plain state of a person, the worst thing first. */
export function feelFrom(mood: number, fatigue: number, jobless: boolean, hungry: boolean, homeless: boolean): number {
  if (mood < 25) return FEEL_ANGRY;
  if (homeless) return FEEL_HOMELESS;
  if (hungry) return FEEL_HUNGRY;
  if (fatigue >= TIRED_AT) return FEEL_TIRED;
  if (jobless) return FEEL_JOBLESS;
  return mood >= 55 ? FEEL_CONTENT : FEEL_SOSO;
}
/** What a person thinks, in a sentence; `lack` is the house's worst gap (HouseNeeds.lack). */
export function thoughtOf(feel: number, lack: string): string {
  if (feel === FEEL_HUNGRY) return 'J’ai faim.';
  if (feel === FEEL_TIRED) return 'Je suis épuisé.';
  if (feel === FEEL_JOBLESS) return 'Pas de travail pour moi.';
  if (feel === FEEL_HOMELESS) return 'Aucune route ne mène à ma maison.';
  const k = lack === '' || lack === 'food' || lack === 'jobs' || lack === 'appeal' ? -1 : economy.serviceOf(lack);
  const gap = k >= 0 ? 'Il nous manque : ' + economy.services[k].label.toLowerCase() + '.' : lack === 'appeal' ? 'Le quartier est triste.' : lack === 'jobs' ? 'Trop de gens sans travail.' : '';
  if (feel === FEEL_ANGRY) return gap !== '' ? gap + ' Ça ne peut plus durer !' : 'Ça ne peut plus durer !';
  if (feel === FEEL_SOSO) return gap !== '' ? gap : 'On fait aller.';
  return 'Tout va bien au hameau.';
}
/** The word for the whole village. */
export function villageWord(mood: number): string { return mood >= 70 ? 'Heureux' : mood >= 55 ? 'Content' : mood >= 40 ? 'Mécontent' : 'Furieux'; }

/** How fast a person works: a discontented or tired one is slower. */
export function workPace(p: Person): number {
  let pace = p.mood < 30 ? .65 : p.mood < 50 ? .85 : 1;
  if (p.fatigue >= TIRED_AT) pace *= .85;
  return pace;
}
/** Settlers come faster in a happy village and not at all in an unhappy one (the multiplier of the interval between two arrivals; 0: nobody comes). */
export function arrivalFactor(mood: number): number { return mood >= 70 ? .6 : mood >= 60 ? .85 : mood >= 50 ? 1 : 0; }
/** People leaving each day, by the village's mood: a share of the population, at least one, nobody while it is small. */
export function leavingToday(mood: number, population: number): number {
  if (population <= 6 || mood >= 40) return 0;
  const share = mood <= 20 ? 25 : mood <= 30 ? 15 : 8;
  return Math.max(1, Math.floor(population * share / 100));
}
