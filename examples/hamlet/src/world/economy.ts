import { DEPOSIT_MODELS } from '../constants';

// The economy of the village: resources, buildings and what they make, read from assets/economy.json (schema in ECONOMY.md).
// A building or a chain is added in that file and nowhere else (plus one model in view/models.ts). Classes, not interfaces: they are read and shared by reference.

export class Resource { id: string = ''; label: string = ''; carry: string = ''; price: number = 0; }
/** A service the houses may lack (water, market...): `Building.cover[k]` counts the days a house stays covered. */
export class Service { id: string = ''; label: string = ''; }
/** What a service building gives: a walker on a round of `range` steps over the roads, or (no walker) every house within `radius` tiles. */
export class ServiceDef { service: number = -1; walker: boolean = false; range: number = 16; radius: number = 0; }
/** What a house of a level holds and what it needs to reach (and to keep) that level. */
export class HouseLevel { label: string = ''; capacity: number = 0; services: number[] = []; foods: number = 0; appeal: number = 0; }
/** `capacity` is the first level's. A house gains a level after `evolveDays` days meeting the next one's needs and loses one after `devolveDays` days failing its own (needs slackened by `margin` appeal). */
export class Housing {
  capacity: number = 0; free: number = 0; eats: number[] = []; levels: HouseLevel[] = []; mealsFrom: number = -1;
  evolveDays: number = 2; devolveDays: number = 4; margin: number = 1;
}
export class BuildingDef {
  id: string = ''; label: string = ''; short: string = ''; hint: string = ''; order: number = 0; model: string = '';
  cost: number[] = []; workers: number = 0; role: string = ''; roleId: number = -1;
  inputs: number[] = []; outputs: number[] = []; seconds: number = 0; gather: string = '';
  stockCap: number = 8; store: boolean = false; needsRoad: boolean = true;
  housing: Housing | null = null; service: ServiceDef | null = null; lode: number = -1; appeal: number[] = [];   // appeal: the rings it adds around itself
}
export class Economy {
  deposits: Deposit[] = []; goals: Goal[] = []; trade: Trade = new Trade();
  appeal: AppealSource[] = []; appealMax: number = 8;
  resources: Resource[] = []; services: Service[] = []; buildings: BuildingDef[] = []; start: number[] = []; hall: number = -1;
  typeOf(id: string): number { for (let k = 0; k < this.buildings.length; k++) if (this.buildings[k].id === id) return k; return -1; }
  serviceOf(id: string): number { for (let k = 0; k < this.services.length; k++) if (this.services[k].id === id) return k; return -1; }
  resourceOf(id: string): number { for (let k = 0; k < this.resources.length; k++) if (this.resources[k].id === id) return k; return -1; }
}
/** The loaded economy. Empty until loadEconomy runs (the scene at start-up, the tests); a building type is its index here. */
export const economy = new Economy();

/** A terrain source of desirability: every tile of this kind adds `rings[d - 1]` to the tiles at distance d (1 to rings.length). */
export class AppealSource { kind: string = ''; rings: number[] = []; }
export const APPEAL_KINDS: string[] = ['tree', 'water', 'rock'];
/** A kind of deposit the generator scatters (economy.json "deposits"). `near` and the numbers are the generator's (gen/deposits.ts). */
export class Deposit { resource: number = -1; model: number = 0; near: number = 0; density: number = 1; amount: number = 10; required: boolean = false; active: boolean = true; }
/** One requirement of a goal: `kind` building (count of that type standing), stock (that resource in the stores), population, houses (count at level or above). */
export class Condition { kind: string = ''; id: number = -1; count: number = 0; level: number = 0; }
/** A goal: what must hold, and the reward (buildings unlocked, resources given). `requires` names earlier goals; `final` ends the scenario when done. */
export class Goal {
  id: string = ''; title: string = ''; text: string = ''; requires: number[] = []; when: Condition[] = []; unlock: number[] = []; give: number[] = []; final: boolean = false;
}
/** One line of the peddler's table: he sells (`sell`: the village buys) or buys (`buy`: the village sells) `qty` of a resource. */
export class TradeEntry { side: string = ''; resource: number = -1; qty: number = 0; }
/** The peddler: every `everyDays` days he stays `stayDays` at the gate with `offers` lines drawn from the table. */
export class Trade { everyDays: number = 0; stayDays: number = 2; offers: number = 3; table: TradeEntry[] = []; coin: number = -1; }
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
    res.id = String(r.id === undefined ? '' : r.id); res.label = String(r.label === undefined ? res.id : r.label); res.carry = String(r.carry === undefined ? '' : r.carry); res.price = num(r, 'price', 0, 'resource ' + res.id, errors);
    if (res.id === '' || ids.indexOf(res.id) >= 0) errors.push('bad-id: resource "' + res.id + '" is empty or declared twice');
    ids.push(res.id); into.resources.push(res);
  }
  into.start = amounts(data.start, ids, 'start', errors);
  into.services = [];
  for (const s of (data.services === undefined ? [] : data.services) as any[]) {
    const sv = new Service(); sv.id = String(s.id === undefined ? '' : s.id); sv.label = String(s.label === undefined ? sv.id : s.label);
    if (sv.id === '' || into.serviceOf(sv.id) >= 0) errors.push('bad-id: service "' + sv.id + '" is empty or declared twice');
    into.services.push(sv);
  }
  into.appeal = []; into.appealMax = 8; into.deposits = []; into.goals = []; into.trade = new Trade();
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
    if (b.service !== undefined) {
      const sd = new ServiceDef(), k = into.serviceOf(String(b.service.id));
      if (k < 0) errors.push('bad-service: ' + where + ' gives the unknown service "' + String(b.service.id) + '"');
      sd.service = k; sd.walker = b.service.walker === true; sd.range = num(b.service, 'range', 16, where + '.service', errors); sd.radius = num(b.service, 'radius', 0, where + '.service', errors);
      if (!sd.walker && sd.radius <= 0) errors.push('bad-service: ' + where + ' has no walker and no radius: whom does it serve?');
      if (sd.walker && d.workers <= 0) errors.push('bad-service: ' + where + ' sends a walker but has no workers');
      d.service = sd;
    }
    into.buildings.push(d);
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
    if (d.housing !== null) for (const k of d.housing.eats) if (!made[k]) errors.push('cycle: "' + ids[k] + '" (eaten in ' + d.id + ') has no raw source');
  }
  return errors;
}

/** Installs the economy. Throws with every problem when the file is wrong: a game with a broken economy must not start. */
export function loadEconomy(text: string, models: string[], roles: string[]): void {
  const next = new Economy(), errors = parseEconomy(text, models, roles, next);
  if (errors.length > 0) throw new Error('economy.json: ' + errors.join('; '));
  economy.resources = next.resources; economy.services = next.services; economy.deposits = next.deposits; economy.goals = next.goals; economy.trade = next.trade; economy.appeal = next.appeal; economy.appealMax = next.appealMax; economy.buildings = next.buildings; economy.start = next.start; economy.hall = next.hall;
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
