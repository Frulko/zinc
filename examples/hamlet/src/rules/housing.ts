import { world, Building } from '../world/world';
import { economy, Housing, HouseLevel } from '../world/economy';

// Housing levels: what a house holds, what it needs to climb, and the plain words for what it lacks. Pure functions of the world: the UI reads them, the daily slice acts on them.

const housing = (): Housing => economy.buildings[0].housing as Housing;
export function levelCount(): number { return housing().levels.length; }
export function levelOf(b: Building): HouseLevel { return housing().levels[Math.min(b.level, levelCount() - 1)]; }
/** How many people the house holds at its level. */
export function capacityOf(b: Building): number { return levelOf(b).capacity; }
/** The food kinds the house ate lately. */
export function foodKinds(b: Building): number { let n = 0; for (const k of housing().eats) if (b.fed[k] > 0) n++; return n; }

/** One requirement of a level: `met` now, with the words for it ("Il manque l’eau"). `id` is the service id, `food` or `appeal`. */
export class Requirement { id: string = ''; met: boolean = false; text: string = ''; }
function requirements(b: Building, lv: HouseLevel, slack: number): Requirement[] {
  const out: Requirement[] = [];
  for (const k of lv.services) {
    const r = new Requirement(); r.id = economy.services[k].id; r.met = b.cover[k] > 0;
    r.text = r.met ? economy.services[k].label + ' : desservie' : 'Il manque : ' + economy.services[k].label.toLowerCase() + ' (aucun service ne passe ici)';
    out.push(r);
  }
  if (lv.foods > 0) {
    const r = new Requirement(), have = foodKinds(b); r.id = 'food'; r.met = have >= lv.foods;
    r.text = r.met ? 'Nourriture : ' + have + ' sorte(s)' : 'Il manque : nourriture (' + have + ' sorte(s) sur ' + lv.foods + '), via un marché et des réserves';
    out.push(r);
  }
  if (lv.appeal > 0) {
    const r = new Requirement(), here = world.appeal[b.j * world.size + b.i]; r.id = 'appeal'; r.met = here >= lv.appeal - slack;
    r.text = r.met ? 'Quartier agréable (' + here + ')' : 'Il manque : un quartier plus agréable (' + here + ' sur ' + lv.appeal + '), des arbres, de l’eau, moins d’industrie';
    out.push(r);
  }
  return out;
}
const allMet = (list: Requirement[]): boolean => list.every((r: Requirement): boolean => r.met);

/** True when the house meets what the level asks. `slack` slackens the appeal (the margin a house keeps its level with). */
export function meets(b: Building, level: number, slack: number): boolean { return allMet(requirements(b, housing().levels[level], slack)); }

export class HousingReport {
  level: number = 0; levelName: string = ''; top: boolean = false; capacity: number = 0; residents: number = 0;
  next: Requirement[] = [];     // what the next level asks, met or not
  missing: Requirement[] = [];  // the ones not met
  atRisk: boolean = false;      // the house fails its own level and will lose it if nothing changes
  text: string = '';
}
/** The state of a house in words: its level, what the next level lacks, whether it is about to fall back. */
export function housingReport(b: Building): HousingReport {
  const r = new HousingReport(), h = housing();
  r.level = Math.min(b.level, h.levels.length - 1); r.levelName = h.levels[r.level].label; r.capacity = capacityOf(b); r.residents = b.residents;
  r.top = r.level >= h.levels.length - 1;
  if (r.level > 0) r.atRisk = !allMet(requirements(b, h.levels[r.level], h.margin));
  if (!r.top) { r.next = requirements(b, h.levels[r.level + 1], 0); r.missing = r.next.filter((q: Requirement): boolean => !q.met); }
  let text = r.levelName + ' (' + r.residents + '/' + r.capacity + ')';
  if (r.atRisk) text += '. Elle va reculer : ' + requirements(b, h.levels[r.level], h.margin).filter((q: Requirement): boolean => !q.met).map((q: Requirement): string => q.text).join(' ; ');
  else if (r.top) text += '. Niveau maximal.';
  else if (r.missing.length === 0) text += '. Elle s’agrandit bientôt.';
  else text += '. Pour devenir ' + h.levels[r.level + 1].label + ' : ' + r.missing.map((q: Requirement): string => q.text).join(' ; ');
  r.text = text;
  return r;
}
