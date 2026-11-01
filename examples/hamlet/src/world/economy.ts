// The economy of the village: resources, buildings and what they make, read from assets/economy.json (schema in ECONOMY.md).
// A building or a chain is added in that file and nowhere else (plus one model in view/models.ts). Classes, not interfaces: they are read and shared by reference.

export class Resource { id: string = ''; label: string = ''; carry: string = ''; }
export class Housing { capacity: number = 0; free: number = 0; eats: number[] = []; }
export class BuildingDef {
  id: string = ''; label: string = ''; short: string = ''; hint: string = ''; order: number = 0; model: string = '';
  cost: number[] = []; workers: number = 0; role: string = ''; roleId: number = -1;
  inputs: number[] = []; outputs: number[] = []; seconds: number = 0; gather: string = '';
  stockCap: number = 8; store: boolean = false; needsRoad: boolean = true;
  housing: Housing | null = null;
}
export class Economy {
  resources: Resource[] = []; buildings: BuildingDef[] = []; start: number[] = []; hall: number = -1;
  typeOf(id: string): number { for (let k = 0; k < this.buildings.length; k++) if (this.buildings[k].id === id) return k; return -1; }
  resourceOf(id: string): number { for (let k = 0; k < this.resources.length; k++) if (this.resources[k].id === id) return k; return -1; }
}
/** The loaded economy. Empty until loadEconomy runs (the scene at start-up, the tests); a building type is its index here. */
export const economy = new Economy();

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
  into.resources = []; into.buildings = []; into.hall = -1;
  for (const r of data.resources as any[]) {
    const res = new Resource();
    res.id = String(r.id === undefined ? '' : r.id); res.label = String(r.label === undefined ? res.id : r.label); res.carry = String(r.carry === undefined ? '' : r.carry);
    if (res.id === '' || ids.indexOf(res.id) >= 0) errors.push('bad-id: resource "' + res.id + '" is empty or declared twice');
    ids.push(res.id); into.resources.push(res);
  }
  into.start = amounts(data.start, ids, 'start', errors);
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
    if (GATHER_KINDS.indexOf(d.gather) < 0) errors.push('bad-gather: ' + where + ' gathers "' + d.gather + '"');
    d.role = String(b.role === undefined ? '' : b.role); d.roleId = roles.indexOf(d.role);
    if (d.workers > 0 && d.roleId < 0) errors.push('bad-role: ' + where + ' has workers but the role "' + d.role + '" does not exist');
    d.store = b.store === true; d.needsRoad = b.needsRoad !== false;
    if (b.housing !== undefined) {
      const h = new Housing();
      h.capacity = num(b.housing, 'capacity', 2, where + '.housing', errors); h.free = num(b.housing, 'free', 0, where + '.housing', errors);
      const eats: string[] = b.housing.eats === undefined ? [] : b.housing.eats as string[];
      for (const e of eats) { const k = ids.indexOf(e); if (k < 0) errors.push('unknown-resource: ' + where + '.housing.eats uses "' + e + '"'); else h.eats.push(k); }
      d.housing = h;
    }
    into.buildings.push(d);
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
  economy.resources = next.resources; economy.buildings = next.buildings; economy.start = next.start; economy.hall = next.hall;
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
