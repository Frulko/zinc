import { DEPOSIT_MODELS } from '../constants';

// The economy of the village: resources, buildings and what they make, read from assets/economy.json (schema in ECONOMY.md).
// A building or a chain is added in that file and nowhere else (plus one model in view/models.ts). Classes, not interfaces: they are read and shared by reference.

/** What gathering a raw resource gives, per source (`variants`: tree species, doe or stag) in economy.json "harvest": a cycle takes `time` game seconds (0: the building's `seconds`) and
 *  brings `units` x `percent` / 100 (x the season's percent, x the tool bonus when `tool` is in the stores); the fraction is rolled. `chance` percent of the cycles succeed (a fish bites,
 *  an arrow hits) and `depletion` percent of them use up one load of the deposit. */
export class Harvest {
  label: string = ''; time: number = 0; units: number = 1; percent: number = 100; chance: number = 100; depletion: number = 100;
  seasons: number[] = [100, 100, 100, 100]; tool: number = -1; toolBonus: number = 0;
}
export class Resource { id: string = ''; label: string = ''; carry: string = ''; price: number = 0; target: number = 0; harvest: Harvest | null = null; variants: Harvest[] = []; }
/** A service the houses may lack (water, market...): `Building.cover[k]` counts the days a house stays covered. */
/** `risk` (fire, collapse, crime) makes it a safety service: its walker resets that counter of every building beside its round (engine/risk.ts). `weight` scales its share of the houses' mood (1: like water). */
export class Service { id: string = ''; label: string = ''; risk: string = ''; weight: number = 1; }
export const RISK_KINDS: string[] = ['', 'fire', 'collapse', 'crime'];
/** What a building adds to its counters each day (economy.json "risk"): `fire` on its slot day (a house: per level, the last repeating), `collapse` every day, `crime` every day. */
export class RiskWeights { fire: number[] = [0]; collapse: number = 0; crime: number = 0; }
/** The risk rules of the village (economy.json "risks"): the ruin a destroyed building leaves, the grace below `minPopulation` people, the counters' thresholds, days a fire burns, the
 *  fire a burning neighbour adds each day, `slots` (a building's fire day comes 1 in `slots`), the units a theft takes. */
/** Public order (economy.json "risks.peace"): the peace rating is 100 minus the unrest of a low mood (below `moodFloor`, x1.5), of joblessness (above `joblessFloor` percent, x0.7), of houses no watchman
 *  passes (`gap` points when none does) and of the recent crimes (`heat`, each theft adds `theftHeat`, each riot `riotHeat`, and it fades by `fade` percent a day). Below `calm` a robber may come (at most one
 *  every `robberEvery` days, he takes the `theft` units of the village's risks); a riot needs a mood below `riotMood` and a peace below `riotPeace` (every `riotEvery` days; it ruins `riotDamage` percent of a building's collapse counter). */
export class PeaceRules {
  calm: number = 70; moodFloor: number = 60; joblessFloor: number = 10; gap: number = 25; theftHeat: number = 10; riotHeat: number = 25; fade: number = 10;
  robberEvery: number = 4; riotMood: number = 35; riotPeace: number = 40; riotEvery: number = 15; riotDamage: number = 60;
}
export class RiskRules {
  peace: PeaceRules = new PeaceRules();
  ruin: number = -1; minPopulation: number = 10; fireAt: number = 60; collapseAt: number = 120; crimeAt: number = 30; burnDays: number = 2; spread: number = 25; slots: number = 8; theft: number = 2;
}
/** What a service building gives: a walker on a round of `range` steps over the roads, or (no walker) every house within `radius` tiles. */
export class ServiceDef { service: number = -1; walker: boolean = false; range: number = 16; radius: number = 0; }
/** What a house of a level holds and what it needs to reach (and to keep) that level. */
export class HouseLevel { label: string = ''; capacity: number = 0; services: number[] = []; foods: number = 0; appeal: number = 0; }
/** `capacity` is the first level's. A house gains a level after `evolveDays` days meeting the next one's needs and loses one after `devolveDays` days failing its own (needs slackened by `margin` appeal). */
export class Housing {
  capacity: number = 0; free: number = 0; eats: number[] = []; uses: number[] = []; lamp: number = 1; levels: HouseLevel[] = []; mealsFrom: number = -1;
  evolveDays: number = 2; devolveDays: number = 4; margin: number = 1;
}
/** Flowers near a building (`bloom`: the flower tiles of world.deco) or fertile plain near a farm (`soil`: world.biome) speed its work: each tile within `radius` adds `per` of speed, up to `max` tiles. */
export class Bloom { radius: number = 4; per: number = .1; max: number = 6; }
export class BuildingDef {
  id: string = ''; label: string = ''; short: string = ''; hint: string = ''; order: number = 0; model: string = '';
  cost: number[] = []; workers: number = 0; role: string = ''; roleId: number = -1;
  inputs: number[] = []; outputs: number[] = []; seconds: number = 0; gather: string = '';
  stockCap: number = 8; store: boolean = false; needsRoad: boolean = true;
  housing: Housing | null = null; service: ServiceDef | null = null; lode: number = -1; appeal: number[] = [];   // appeal: the rings it adds around itself
  smoke: number[][] = []; glow: number[][] = [];   // view effects at a working building, in tile-local units: [x, y, z] chimney smoke ([x, y, z, 1]: steam), and warm lights shown at night
  buildable: boolean = true; risk: RiskWeights | null = null;   // buildable false: a leftover (the ruin) the player cannot place, only demolish
  offSeasons: number[] = []; bloom: Bloom | null = null; soil: Bloom | null = null; startSound: string = '';   // seasons without work (0 spring..3 winter), flowers that speed it, the sound of a work cycle's start
}
/** One line of the peddler's table: he sells (`sell`: the village buys) or buys (`buy`: the village sells) `qty` of a resource. */
export class TradeEntry { side: string = ''; resource: number = -1; qty: number = 0; }
/** The peddler: every `everyDays` days he stays `stayDays` at the gate with `offers` lines drawn from the table. */
export class Trade { everyDays: number = 0; stayDays: number = 2; offers: number = 3; table: TradeEntry[] = []; coin: number = -1; }
/** An adventure: `workers` villagers leave for `days` days, `cost` is paid at the start, each of them is lost with `risk` percent chance, and `rewards` come home with the survivors. */
export class Adventure { id: string = ''; title: string = ''; text: string = ''; days: number = 1; workers: number = 1; risk: number = 0; cost: number[] = []; rewards: number[] = []; }
/** What roads cost (economy.json "roads"): per tile of dirt road, per tile of bridge (a road over water, on top of the dirt), per tree cleared; `refund` percent comes back on demolition,
 *  `yield` is what a cleared tree brings. Amounts may be fractions: a plan pays the rounded-up total, not tile by tile. */
export class RoadCosts { dirt: number[] = []; bridge: number[] = []; clear: number[] = []; yield: number[] = []; refund: number = 50; }
export class Economy {
  deposits: Deposit[] = []; goals: Goal[] = []; trade: Trade = new Trade(); adventures: Adventure[] = [];
  appeal: AppealSource[] = []; appealMax: number = 8; risk: RiskRules = new RiskRules();
  roads: RoadCosts = new RoadCosts(); difficulties: Difficulty[] = []; resources: Resource[] = []; services: Service[] = []; buildings: BuildingDef[] = []; start: number[] = []; hall: number = -1;
  typeOf(id: string): number { for (let k = 0; k < this.buildings.length; k++) if (this.buildings[k].id === id) return k; return -1; }
  serviceOf(id: string): number { for (let k = 0; k < this.services.length; k++) if (this.services[k].id === id) return k; return -1; }
  resourceOf(id: string): number { for (let k = 0; k < this.resources.length; k++) if (this.resources[k].id === id) return k; return -1; }
}
/** The loaded economy. Empty until loadEconomy runs (the scene at start-up, the tests); a building type is its index here. */
export const economy = new Economy();

/** A terrain source of desirability: every tile of this kind adds `rings[d - 1]` to the tiles at distance d (1 to rings.length). */
export class AppealSource { kind: string = ''; rings: number[] = []; }
export const APPEAL_KINDS: string[] = ['tree', 'water', 'rock', 'plaza'];
/** A kind of deposit the generator scatters (economy.json "deposits"). `near` and the numbers are the generator's (gen/deposits.ts). */
export class Deposit { resource: number = -1; model: number = 0; near: number = 0; density: number = 1; amount: number = 10; required: boolean = false; active: boolean = true; }
/** One requirement of a goal: `kind` building (count of that type standing), stock (that resource in the stores), population, houses (count at level or above). */
export class Condition { kind: string = ''; id: number = -1; count: number = 0; level: number = 0; }
/** A goal: what must hold, and the reward (buildings unlocked, resources given). `requires` names earlier goals; `final` ends the scenario when done. */
export class Goal {
  id: string = ''; title: string = ''; text: string = ''; requires: number[] = []; when: Condition[] = []; unlock: number[] = []; give: number[] = []; final: boolean = false;
}
/** A difficulty of the new-village form (economy.json "difficulties"): what the village holds at the start (`start`, replacing the sandbox's top-level one) and, in percent of the normal pace, how fast
 *  settlers come (`arrival`), how much the houses eat (`eat`) and how fast the risk counters rise (`risk`). The index is saved with the village (World.difficulty; -1: a sandbox, which has the top-level start). */
export class Difficulty { id: string = ''; label: string = ''; hint: string = ''; start: number[] = []; arrival: number = 100; eat: number = 100; risk: number = 100; }
export const GATHER_KINDS: string[] = ['', 'tree', 'deer', 'shore'];

function num(obj: any, key: string, fallback: number, where: string, errors: string[]): number {
  const v: any = obj[key];
  if (v === undefined) return fallback;
  if (typeof v !== 'number' || v < 0) { errors.push('negative-number: ' + where + '.' + key + ' must be a number of 0 or more'); return fallback; }
  return v as number;
}
function amounts(map: any, ids: string[], where: string, errors: string[]): number[] {
  const out: number[] = ids.map((_id: string): number => 0);
  if (map === undefined || map === null) return out;
  for (const key of Object.keys(map)) {
    const k = ids.indexOf(key), n: any = map[key];
    if (k < 0) errors.push('unknown-resource: ' + where + ' uses "' + key + '"');
    else if (typeof n !== 'number' || n < 0) errors.push('negative-number: ' + where + '.' + key + ' must be a number of 0 or more');
    else out[k] = n as number;
  }
  return out;
}

/** One harvest block: `base` supplies what a variant does not state. Errors are named `bad-harvest`. */
function readHarvest(src: any, base: Harvest | null, ids: string[], where: string, errors: string[]): Harvest {
  const h = new Harvest();
  if (base !== null) { h.time = base.time; h.units = base.units; h.percent = base.percent; h.chance = base.chance; h.depletion = base.depletion; h.seasons = base.seasons.slice(); h.tool = base.tool; h.toolBonus = base.toolBonus; h.label = base.label; }
  if (src.label !== undefined) h.label = String(src.label);
  h.time = num(src, 'time', h.time, where, errors); h.units = num(src, 'yield', h.units, where, errors); h.percent = num(src, 'percent', h.percent, where, errors);
  h.chance = num(src, 'chance', h.chance, where, errors); h.depletion = num(src, 'depletion', h.depletion, where, errors);
  if (h.units <= 0 || h.percent > 500 || h.chance > 100 || h.chance <= 0 || h.depletion > 100) errors.push('bad-harvest: ' + where + ' needs a yield above 0, a percent of at most 500, a chance of 1 to 100 and a depletion of at most 100');
  if (src.seasons !== undefined) {
    if (!Array.isArray(src.seasons) || src.seasons.length !== 4 || src.seasons.some((v: any): boolean => typeof v !== 'number' || v < 0 || v > 500)) errors.push('bad-harvest: ' + where + '.seasons holds four percents (spring, summer, autumn, winter) of 0 to 500');
    else h.seasons = (src.seasons as number[]).map((v: number): number => Number(v));
  }
  if (src.tool !== undefined) {
    h.tool = ids.indexOf(String(src.tool.resource)); h.toolBonus = num(src.tool, 'bonus', 0, where + '.tool', errors);
    if (h.tool < 0) errors.push('unknown-resource: ' + where + '.tool uses "' + String(src.tool.resource) + '"');
  }
  return h;
}

/** Reads and checks the text. `models` is the list of model ids of the view (a building's model must sit at its own index), `roles` the job names. Returns the problems, each starting with its name. */
export function parseEconomy(text: string, models: string[], roles: string[], into: Economy): string[] {
  const errors: string[] = [];
  let data: any = null;
  try { data = JSON.parse(text); } catch (error) { return ['bad-json: economy.json is not valid JSON']; }
  if (data === null || data.version !== 1 || !Array.isArray(data.resources) || !Array.isArray(data.buildings)) return ['bad-json: economy.json needs "version": 1, "resources" and "buildings"'];
  const ids: string[] = [];
  into.resources = []; into.buildings = []; into.services = []; into.hall = -1;
  for (const r of data.resources as any[]) {
    const res = new Resource();
    res.id = String(r.id === undefined ? '' : r.id); res.label = String(r.label === undefined ? res.id : r.label); res.carry = String(r.carry === undefined ? '' : r.carry); res.price = num(r, 'price', 0, 'resource ' + res.id, errors); res.target = num(r, 'target', 0, 'resource ' + res.id, errors);   // target: a workshop making only goods at their target stops (0: no target)
    if (res.id === '' || ids.indexOf(res.id) >= 0) errors.push('bad-id: resource "' + res.id + '" is empty or declared twice');
    ids.push(res.id); into.resources.push(res);
  }
  into.start = amounts(data.start, ids, 'start', errors);
  into.difficulties = [];
  for (const d of (data.difficulties === undefined ? [] : data.difficulties) as any[]) {
    const lv = new Difficulty(), where = 'difficulty ' + String(d.id);
    lv.id = String(d.id === undefined ? '' : d.id); lv.label = String(d.label === undefined ? lv.id : d.label); lv.hint = String(d.hint === undefined ? '' : d.hint);
    lv.start = amounts(d.start, ids, where + '.start', errors); lv.arrival = num(d, 'arrival', 100, where, errors); lv.eat = num(d, 'eat', 100, where, errors); lv.risk = num(d, 'risk', 100, where, errors);
    if (lv.id === '' || into.difficulties.some((o: Difficulty): boolean => o.id === lv.id) || lv.arrival < 10 || lv.arrival > 500 || lv.eat > 500 || lv.risk > 500) errors.push('bad-difficulty: ' + where + ' needs its own id, an arrival of 10 to 500 and an eat and risk of at most 500');
    into.difficulties.push(lv);
  }
  const rd: any = data.roads === undefined ? {} : data.roads;
  into.roads = new RoadCosts();
  into.roads.dirt = amounts(rd.dirt, ids, 'roads.dirt', errors); into.roads.bridge = amounts(rd.bridge, ids, 'roads.bridge', errors); into.roads.clear = amounts(rd.clear, ids, 'roads.clear', errors);
  into.roads.yield = amounts(rd.yield, ids, 'roads.yield', errors); into.roads.refund = num(rd, 'refund', 50, 'roads', errors);
  for (let k = 0; k < data.resources.length; k++) {   // harvest: once every resource id is known (a tool is a resource)
    const hv: any = (data.resources as any[])[k].harvest, r = into.resources[k];
    if (hv === undefined) continue;
    r.harvest = readHarvest(hv, null, ids, 'resource ' + r.id + '.harvest', errors);
    for (const v of (hv.variants === undefined ? [] : hv.variants) as any[]) r.variants.push(readHarvest(v, r.harvest, ids, 'resource ' + r.id + '.harvest.variants', errors));
  }
  into.services = [];
  for (const s of (data.services === undefined ? [] : data.services) as any[]) {
    const sv = new Service(); sv.id = String(s.id === undefined ? '' : s.id); sv.label = String(s.label === undefined ? sv.id : s.label);
    sv.risk = String(s.risk === undefined ? '' : s.risk); sv.weight = num(s, 'weight', 1, 'service ' + sv.id, errors);
    if (RISK_KINDS.indexOf(sv.risk) < 0) errors.push('bad-risk: service "' + sv.id + '" has the risk "' + sv.risk + '", which is not one of ' + RISK_KINDS.join(', '));
    if (sv.id === '' || into.serviceOf(sv.id) >= 0) errors.push('bad-id: service "' + sv.id + '" is empty or declared twice');
    into.services.push(sv);
  }
  into.appeal = []; into.appealMax = 8; into.deposits = []; into.goals = []; into.trade = new Trade(); into.adventures = [];
  if (data.desirability !== undefined) {
    into.appealMax = num(data.desirability, 'limit', 8, 'desirability', errors);
    for (const s of (data.desirability.terrain === undefined ? [] : data.desirability.terrain) as any[]) {
      const src = new AppealSource(); src.kind = String(s.kind); src.rings = Array.isArray(s.rings) ? (s.rings as number[]).map((v: number): number => Number(v)) : [];
      if (APPEAL_KINDS.indexOf(src.kind) < 0) errors.push('bad-appeal: desirability source "' + src.kind + '" is not one of ' + APPEAL_KINDS.join(', '));
      if (src.rings.length === 0) errors.push('bad-appeal: desirability source "' + src.kind + '" has no rings');
      into.appeal.push(src);
    }
  }
  into.deposits = [];
  for (const dp of (data.deposits === undefined ? [] : data.deposits) as any[]) {
    const d = new Deposit(), where = 'deposit ' + String(dp.resource);
    d.resource = ids.indexOf(String(dp.resource)); d.model = DEPOSIT_MODELS.indexOf(String(dp.model));
    d.near = ['any', 'rock', 'water', 'tree'].indexOf(String(dp.placement === undefined ? 'any' : dp.placement));
    d.density = num(dp, 'density', 1, where, errors); d.amount = num(dp, 'amount', 10, where, errors); d.required = dp.required === true; d.active = dp.active !== false;
    if (d.resource < 0) errors.push('unknown-resource: ' + where + ' is not a resource');
    if (d.model < 0) errors.push('no-model: ' + where + ' has the model "' + String(dp.model) + '", which is not one of ' + DEPOSIT_MODELS.join(', '));
    if (d.near < 0) errors.push('bad-deposit: ' + where + ' placement must be any, rock, water or tree');
    into.deposits.push(d);
  }
  const names: string[] = [];
  for (const b of data.buildings as any[]) {
    const d = new BuildingDef(), where = 'building ' + String(b.id);
    d.id = String(b.id === undefined ? '' : b.id); d.label = String(b.label === undefined ? d.id : b.label); d.short = String(b.short === undefined ? d.label : b.short); d.hint = String(b.hint === undefined ? '' : b.hint);
    if (d.id === '' || names.indexOf(d.id) >= 0) errors.push('bad-id: ' + where + ' is empty or declared twice');
    names.push(d.id);
    if (into.buildings.length === 0 && d.id !== 'house') errors.push('bad-id: the first building must be the house');
    d.model = String(b.model === undefined ? '' : b.model);
    const at = models.indexOf(d.model);
    if (d.model === '') errors.push('no-model: ' + where + ' has no model');
    else if (at !== into.buildings.length) errors.push('no-model: ' + where + ' model "' + d.model + '" is not the model of its index (view/models.ts MODEL_IDS)');
    d.order = num(b, 'order', into.buildings.length + 1, where, errors); d.workers = num(b, 'workers', 0, where, errors);
    d.seconds = num(b, 'seconds', 0, where, errors); d.stockCap = num(b, 'stockCap', 8, where, errors);
    d.cost = amounts(b.cost, ids, where + '.cost', errors); d.inputs = amounts(b.inputs, ids, where + '.inputs', errors); d.outputs = amounts(b.outputs, ids, where + '.outputs', errors);
    d.gather = String(b.gather === undefined ? '' : b.gather);
    if (d.gather.slice(0, 8) === 'deposit:') {
      d.lode = -1;
      for (let k = 0; k < into.deposits.length; k++) if (ids[into.deposits[k].resource] === d.gather.slice(8)) d.lode = k;
      if (d.lode < 0) errors.push('bad-gather: ' + where + ' gathers "' + d.gather + '" but no deposit of that resource is declared');
    } else if (GATHER_KINDS.indexOf(d.gather) < 0) errors.push('bad-gather: ' + where + ' gathers "' + d.gather + '"');
    d.role = String(b.role === undefined ? '' : b.role); d.roleId = roles.indexOf(d.role);
    if (d.workers > 0 && d.roleId < 0) errors.push('bad-role: ' + where + ' has workers but the role "' + d.role + '" does not exist');
    d.store = b.store === true; d.needsRoad = b.needsRoad !== false;
    if (b.housing !== undefined) {
      const h = new Housing();
      h.capacity = num(b.housing, 'capacity', 2, where + '.housing', errors); h.free = num(b.housing, 'free', 0, where + '.housing', errors);
      const eats: string[] = b.housing.eats === undefined ? [] : b.housing.eats as string[];
      for (const e of eats) { const k = ids.indexOf(e); if (k < 0) errors.push('unknown-resource: ' + where + '.housing.eats uses "' + e + '"'); else h.eats.push(k); }
      const uses: string[] = b.housing.uses === undefined ? [] : b.housing.uses as string[];
      for (const e of uses) { const k = ids.indexOf(e); if (k < 0) errors.push('unknown-resource: ' + where + '.housing.uses uses "' + e + '"'); else h.uses.push(k); }
      h.lamp = num(b.housing, 'lamp', 1, where + '.housing', errors);
      h.evolveDays = num(b.housing, 'evolveDays', 2, where + '.housing', errors); h.devolveDays = num(b.housing, 'devolveDays', 4, where + '.housing', errors); h.margin = num(b.housing, 'margin', 1, where + '.housing', errors);
      if (b.housing.mealsFrom !== undefined) { h.mealsFrom = into.serviceOf(String(b.housing.mealsFrom)); if (h.mealsFrom < 0) errors.push('bad-service: ' + where + '.housing.mealsFrom names the unknown service "' + String(b.housing.mealsFrom) + '"'); }
      const first = new HouseLevel(); first.label = d.label; first.capacity = h.capacity; h.levels.push(first);
      for (const lv of (b.housing.levels === undefined ? [] : b.housing.levels) as any[]) {
        const l = new HouseLevel(), needs: any = lv.needs === undefined ? {} : lv.needs;
        l.label = String(lv.label === undefined ? d.label : lv.label); l.capacity = num(lv, 'capacity', h.capacity, where + '.housing.levels', errors);
        l.foods = num(needs, 'foods', 0, where + '.housing.levels', errors); l.appeal = needs.appeal === undefined ? 0 : Number(needs.appeal);
        for (const sid of (needs.services === undefined ? [] : needs.services) as string[]) { const k = into.serviceOf(sid); if (k < 0) errors.push('bad-service: ' + where + '.housing.levels needs the unknown service "' + sid + '"'); else l.services.push(k); }
        if (l.capacity < h.levels[h.levels.length - 1].capacity) errors.push('negative-number: ' + where + '.housing.levels: capacity must not shrink from one level to the next');
        h.levels.push(l);
      }
      d.housing = h;
    }
    if (b.appeal !== undefined) { if (Array.isArray(b.appeal)) d.appeal = (b.appeal as number[]).map((v: number): number => Number(v)); else errors.push('bad-appeal: ' + where + '.appeal must be a list of rings'); }
    for (const s of (b.offSeasons === undefined ? [] : b.offSeasons) as number[]) { if (typeof s !== 'number' || s < 0 || s > 3) errors.push('bad-season: ' + where + '.offSeasons holds 0 (spring) to 3 (winter)'); else d.offSeasons.push(s); }
    for (const key of ['smoke', 'glow']) {
      const list = b[key];
      if (list === undefined) continue;
      if (!Array.isArray(list)) { errors.push('bad-effect: ' + where + '.' + key + ' must be a list of [x, y, z]'); continue; }
      for (const spot of list as number[][]) {
        if (!Array.isArray(spot) || spot.length < 3 || spot.length > 4 || spot.some((v: number): boolean => typeof v !== 'number')) { errors.push('bad-effect: ' + where + '.' + key + ' holds [x, y, z] (smoke: a fourth 1 for steam)'); continue; }
        (key === 'smoke' ? d.smoke : d.glow).push(spot.slice());
      }
    }
    if (b.bloom !== undefined) {
      const bl = new Bloom();
      bl.radius = num(b.bloom, 'radius', 4, where + '.bloom', errors); bl.per = num(b.bloom, 'per', .1, where + '.bloom', errors); bl.max = num(b.bloom, 'max', 6, where + '.bloom', errors);
      if (bl.radius < 1 || bl.radius > 8) errors.push('bad-bloom: ' + where + '.bloom.radius is 1 to 8 tiles');
      d.bloom = bl;
    }
    if (b.soil !== undefined) {
      const sl = new Bloom();
      sl.radius = num(b.soil, 'radius', 3, where + '.soil', errors); sl.per = num(b.soil, 'per', .1, where + '.soil', errors); sl.max = num(b.soil, 'max', 6, where + '.soil', errors);
      if (sl.radius < 1 || sl.radius > 8) errors.push('bad-soil: ' + where + '.soil.radius is 1 to 8 tiles');
      d.soil = sl;
    }
    d.startSound = String(b.sound === undefined ? '' : b.sound); d.buildable = b.buildable !== false;
    if (b.risk !== undefined) {
      const rw = new RiskWeights(), f: any = b.risk.fire;
      if (Array.isArray(f)) rw.fire = (f as number[]).map((v: number): number => Number(v));
      else if (f !== undefined) rw.fire = [Number(f)];
      rw.collapse = num(b.risk, 'collapse', 0, where + '.risk', errors); rw.crime = num(b.risk, 'crime', 0, where + '.risk', errors);
      if (rw.fire.length === 0 || rw.fire.some((v: number): boolean => !(v >= 0))) errors.push('bad-risk: ' + where + '.risk.fire is a number or a list of numbers of 0 or more');
      d.risk = rw;
    }
    if (b.service !== undefined) {
      const sd = new ServiceDef(), k = into.serviceOf(String(b.service.id));
      if (k < 0) errors.push('bad-service: ' + where + ' gives the unknown service "' + String(b.service.id) + '"');
      sd.service = k; sd.walker = b.service.walker === true; sd.range = num(b.service, 'range', 16, where + '.service', errors); sd.radius = num(b.service, 'radius', 0, where + '.service', errors);
      if (!sd.walker && sd.radius <= 0) errors.push('bad-service: ' + where + ' has no walker and no radius: whom does it serve?');
      if (sd.service >= 0 && into.services[sd.service].risk !== '' && !sd.walker) errors.push('bad-service: ' + where + ' gives a safety service but has no walker: only a walker resets the counters');
      if (sd.walker && d.workers <= 0) errors.push('bad-service: ' + where + ' sends a walker but has no workers');
      d.service = sd;
    }
    into.buildings.push(d);
  }
  for (const d of into.buildings) {   // what a raw source's output holds in the stores' reckoning is the most a cycle can bring (the harvest is the truth, the number in the file a reminder)
    let first = true;
    for (let k = 0; k < ids.length; k++) if (d.outputs[k] > 0 && into.resources[k].harvest !== null && d.inputs.every((n: number): boolean => n === 0)) {
      const r = into.resources[k];
      let most = 0;
      for (const h of [r.harvest as Harvest].concat(r.variants)) { let best = 0; for (const sp of h.seasons) best = Math.max(best, sp); most = Math.max(most, Math.ceil(h.units * h.percent * best * (1 + h.toolBonus / 100) / 10000)); }
      d.outputs[k] = Math.max(1, most);
      if (first && r.harvest !== null && (r.harvest as Harvest).time <= 0 && d.seconds <= 0) errors.push('bad-harvest: ' + d.id + ' gathers "' + r.id + '" with no harvest time and no seconds');
      first = false;
    }
  }
  into.goals = [];
  for (const g of (data.goals === undefined ? [] : data.goals) as any[]) {
    const goal = new Goal(), where = 'goal ' + String(g.id);
    goal.id = String(g.id === undefined ? '' : g.id); goal.title = String(g.title === undefined ? goal.id : g.title); goal.text = String(g.text === undefined ? '' : g.text); goal.final = g.final === true;
    if (goal.id === '' || into.goals.some((o: Goal): boolean => o.id === goal.id)) errors.push('bad-id: ' + where + ' is empty or declared twice');
    for (const r of (g.requires === undefined ? [] : g.requires) as string[]) {
      const at = into.goals.findIndex((o: Goal): boolean => o.id === r);
      if (at < 0) errors.push('bad-goal: ' + where + ' requires "' + r + '", which must be declared before it'); else goal.requires.push(at);
    }
    for (const w of (g.when === undefined ? [] : g.when) as any[]) {
      const c = new Condition();
      if (w.building !== undefined) { c.kind = 'building'; c.id = names.indexOf(String(w.building)); if (c.id < 0) errors.push('bad-goal: ' + where + ' counts the unknown building "' + String(w.building) + '"'); c.count = num(w, 'count', 1, where, errors); }
      else if (w.stock !== undefined) { c.kind = 'stock'; c.id = ids.indexOf(String(w.stock)); if (c.id < 0) errors.push('unknown-resource: ' + where + ' counts "' + String(w.stock) + '"'); c.count = num(w, 'count', 1, where, errors); }
      else if (w.population !== undefined) { c.kind = 'population'; c.count = num(w, 'population', 1, where, errors); }
      else if (w.houses !== undefined) { c.kind = 'houses'; c.count = num(w, 'houses', 1, where, errors); c.level = num(w, 'level', 1, where, errors); }
      else errors.push('bad-goal: ' + where + ' has a condition that is none of building, stock, population, houses');
      goal.when.push(c);
    }
    for (const u of (g.unlock === undefined ? [] : g.unlock) as string[]) { const k = names.indexOf(u); if (k < 0) errors.push('bad-goal: ' + where + ' unlocks the unknown building "' + u + '"'); else goal.unlock.push(k); }
    goal.give = amounts(g.give, ids, where + '.give', errors);
    into.goals.push(goal);
  }
  into.trade = new Trade();
  if (data.trade !== undefined) {
    const t = into.trade;
    t.everyDays = num(data.trade, 'everyDays', 5, 'trade', errors); t.stayDays = num(data.trade, 'stayDays', 2, 'trade', errors); t.offers = num(data.trade, 'offers', 3, 'trade', errors);
    t.coin = ids.indexOf(String(data.trade.coin === undefined ? 'coin' : data.trade.coin));
    if (t.coin < 0) errors.push('unknown-resource: trade.coin is not a resource');
    for (const row of (data.trade.table === undefined ? [] : data.trade.table) as any[]) {
      const x = new TradeEntry();
      x.side = String(row.side); x.resource = ids.indexOf(String(row.resource)); x.qty = num(row, 'qty', 1, 'trade.table', errors);
      if (x.side !== 'sell' && x.side !== 'buy') errors.push('bad-trade: a table line has the side "' + x.side + '" (sell or buy)');
      if (x.resource < 0) errors.push('unknown-resource: trade.table uses "' + String(row.resource) + '"');
      else if (x.resource === t.coin) errors.push('bad-trade: the coin itself cannot be traded');
      t.table.push(x);
    }
    if (t.everyDays > 0 && t.table.length < t.offers) errors.push('bad-trade: the table has fewer lines than offers per visit');
  }
  into.adventures = [];
  for (const a of (data.adventures === undefined ? [] : data.adventures) as any[]) {
    const adv = new Adventure(), where = 'adventure ' + String(a.id);
    adv.id = String(a.id === undefined ? '' : a.id); adv.title = String(a.title === undefined ? adv.id : a.title); adv.text = String(a.text === undefined ? '' : a.text);
    adv.days = num(a, 'days', 1, where, errors); adv.workers = num(a, 'workers', 1, where, errors); adv.risk = num(a, 'risk', 0, where, errors);
    adv.cost = amounts(a.cost, ids, where + '.cost', errors); adv.rewards = amounts(a.rewards, ids, where + '.rewards', errors);
    if (adv.id === '' || into.adventures.some((o: Adventure): boolean => o.id === adv.id)) errors.push('bad-id: ' + where + ' is empty or declared twice');
    if (adv.days < 1 || adv.workers < 1 || adv.risk > 100) errors.push('bad-adventure: ' + where + ' needs days and workers of at least 1 and a risk of at most 100');
    into.adventures.push(adv);
  }
  into.risk = new RiskRules();
  if (data.risks !== undefined) {
    const r = into.risk, rd: any = data.risks, where = 'risks';
    r.ruin = names.indexOf(String(rd.ruin)); r.minPopulation = num(rd, 'minPopulation', 10, where, errors); r.fireAt = num(rd, 'fireAt', 60, where, errors); r.collapseAt = num(rd, 'collapseAt', 120, where, errors);
    r.crimeAt = num(rd, 'crimeAt', 30, where, errors); r.burnDays = num(rd, 'burnDays', 2, where, errors); r.spread = num(rd, 'spread', 25, where, errors); r.slots = num(rd, 'slots', 8, where, errors); r.theft = num(rd, 'theft', 2, where, errors);
    if (rd.peace !== undefined) {
      const pr = r.peace, pd: any = rd.peace, w2 = 'risks.peace';
      pr.calm = num(pd, 'calm', pr.calm, w2, errors); pr.moodFloor = num(pd, 'moodFloor', pr.moodFloor, w2, errors); pr.joblessFloor = num(pd, 'joblessFloor', pr.joblessFloor, w2, errors); pr.gap = num(pd, 'gap', pr.gap, w2, errors);
      pr.theftHeat = num(pd, 'theftHeat', pr.theftHeat, w2, errors); pr.riotHeat = num(pd, 'riotHeat', pr.riotHeat, w2, errors); pr.fade = num(pd, 'fade', pr.fade, w2, errors); pr.robberEvery = num(pd, 'robberEvery', pr.robberEvery, w2, errors);
      pr.riotMood = num(pd, 'riotMood', pr.riotMood, w2, errors); pr.riotPeace = num(pd, 'riotPeace', pr.riotPeace, w2, errors); pr.riotEvery = num(pd, 'riotEvery', pr.riotEvery, w2, errors); pr.riotDamage = num(pd, 'riotDamage', pr.riotDamage, w2, errors);
      if (pr.fade < 0 || pr.fade > 100 || pr.robberEvery < 1 || pr.riotEvery < 1) errors.push('bad-risk: risks.peace needs a fade of 0 to 100, robberEvery and riotEvery of at least 1');
    }
    if (r.ruin < 0) errors.push('bad-risk: risks.ruin must name a building (the leftover of a fire or a collapse)');
    else if (into.buildings[r.ruin].buildable) errors.push('bad-risk: risks.ruin "' + String(rd.ruin) + '" must have "buildable": false');
    if (r.slots < 1 || r.fireAt < 1 || r.collapseAt < 1 || r.crimeAt < 1) errors.push('bad-risk: risks needs slots, fireAt, collapseAt and crimeAt of at least 1');
  }
  if (data.hall !== undefined) { into.hall = names.indexOf(String(data.hall)); if (into.hall < 0 || !into.buildings[into.hall].store) errors.push('bad-hall: "hall" must name a building with "store": true'); }
  // a resource somebody needs must come, directly or through other buildings, from a building that takes nothing in (a raw source)
  const made = ids.map((_id: string): boolean => false);
  for (let again = true; again;) {
    again = false;
    for (const d of into.buildings) {
      let ready = true;
      for (let k = 0; k < ids.length; k++) if (d.inputs[k] > 0 && !made[k]) ready = false;
      if (!ready) continue;
      for (let k = 0; k < ids.length; k++) if (d.outputs[k] > 0 && !made[k]) { made[k] = true; again = true; }
    }
  }
  for (const d of into.buildings) {
    for (let k = 0; k < ids.length; k++) if ((d.inputs[k] > 0 || d.cost[k] > 0) && !made[k]) errors.push('cycle: "' + ids[k] + '" (needed by ' + d.id + ') has no raw source: nothing that takes nothing in can make it');
    if (d.housing !== null) for (const k of d.housing.eats.concat(d.housing.uses)) if (!made[k]) errors.push('cycle: "' + ids[k] + '" (used in ' + d.id + ') has no raw source');
  }
  return errors;
}

/** Installs the economy. Throws with every problem when the file is wrong: a game with a broken economy must not start. */
export function loadEconomy(text: string, models: string[], roles: string[]): void {
  const next = new Economy(), errors = parseEconomy(text, models, roles, next);
  if (errors.length > 0) throw new Error('economy.json: ' + errors.join('; '));
  economy.resources = next.resources; economy.roads = next.roads; economy.services = next.services; economy.deposits = next.deposits; economy.goals = next.goals; economy.trade = next.trade; economy.adventures = next.adventures; economy.appeal = next.appeal; economy.appealMax = next.appealMax; economy.buildings = next.buildings; economy.start = next.start; economy.difficulties = next.difficulties; economy.hall = next.hall; economy.risk = next.risk;
}

/** One line per resource: who makes it and who uses it. The report of a chain, for the maker of the data. */
export function chainReport(): string[] {
  const lines: string[] = [];
  for (let k = 0; k < economy.resources.length; k++) {
    const makers: string[] = [], users: string[] = [];
    for (const d of economy.buildings) {
      if (d.outputs[k] > 0) makers.push(d.id);
      if (d.inputs[k] > 0) users.push(d.id + ' (input)');
      if (d.cost[k] > 0) users.push(d.id + ' (cost)');
      if (d.housing !== null && d.housing.eats.indexOf(k) >= 0) users.push(d.id + ' (food)');
      if (d.housing !== null && d.housing.uses.indexOf(k) >= 0) users.push(d.id + ' (light)');
    }
    lines.push(economy.resources[k].id + ': made by [' + makers.join(', ') + '] used by [' + users.join(', ') + ']');
  }
  return lines;
}

/** "3 Planches, 2 Bois": what a building costs, or what is still missing (`have` = what the stores hold). */
export function amountText(list: number[], have: number[] | null): string {
  const parts: string[] = [];
  for (let k = 0; k < list.length; k++) {
    const n = have === null ? list[k] : list[k] - have[k];
    if (n > 0) parts.push(n + ' ' + economy.resources[k].label);
  }
  return parts.join(', ');
}
