import { HOUSE, TOOL_ROAD, TOOL_HOUSE, BS_WAITING, BS_FULL, BS_ISOLATED, BS_NO_SOURCE, ROLE_SETTLER, ROLE_RESIDENT } from '../constants';
import { world, neighbor } from '../world/world';
import { economy, ServiceDef, Service } from '../world/economy';
import { housingReport } from './housing';
import { worksites, servicesOffered, houseNeeds, HouseNeeds } from './needs';
import { flowersAround } from './meadow';
import { population } from '../engine/villagers';
import { isRuin } from '../engine/risk';
import { isUnlocked } from './goals';

// Attention hints: what the player should look at, as a pure function of the world (no drawing, no state). The view draws an arrow over each tile.
export const HINT_NO_ROAD = 'no_road';              // a building that needs a road has none to a store: nothing leaves it and nothing comes
export const HINT_IDLE_WORKERS = 'idle_workers';    // a site with no workers while people stand idle, or idle people and no site for them
export const HINT_NO_INPUT = 'no_input';            // a producer waits for a resource that no store holds: build what makes it
export const HINT_FULL_OUTPUT = 'full_output';      // a producer has no room left for its output
export const HINT_DELIVER_HERE = 'deliver_here';    // a producer waits for a resource a store holds: the road is what it lacks, or a porter is on the way
export const HINT_NO_WORKERS = 'no_workers';        // a workplace lacks hands and nobody is idle: more houses
export const HINT_BUILD_NEXT = 'build_next';        // first run: the village has nothing but its hall, start at the gate
export const HINT_NO_SERVICE = 'no_service';        // a house is outside the reach of a service the village does offer (`no_service:<service id>`)
export const HINT_HOUSE_NEEDS = 'house_needs';      // a house lacks one thing for its next level, or is about to fall back: `housingReport(house).text` says what
export const HINT_NO_FLOWERS = 'no_flowers';        // a hive with no flower around it: the bees gather little
export const HINT_JOBLESS = 'jobless';              // a quarter of the people or more have no work: more workplaces
export const HINT_UNHAPPY = 'unhappy';              // the village's mood is low: newcomers stay away or people leave (`unhappy:<the gap most houses share>`)
export const HINT_FIRE_RISK = 'fire_risk';          // risks on: a building's fire counter is high and no fire walker keeps it down (`fire_risk:none` no fire post at all, `fire_risk:rare` it passes too seldom)
export const HINT_NO_SOURCE = 'no_source';          // a gatherer finds nothing within reach (trees walled in by its own buildings, a deposit too far)
export const MAX_HINTS = 12;

/** `reason` is a short key the HUD maps to text: the kind, or `kind:resource id` when a resource is concerned. */
export class Hint { kind: string = ''; tile: number = 0; reason: string = ''; severity: number = 0; }

function make(kind: string, tile: number, reason: string, severity: number): Hint {
  const h = new Hint();
  h.kind = kind; h.tile = tile; h.reason = reason; h.severity = severity;
  return h;
}
function nextToRoad(t: number): boolean {
  for (let d = 0; d < 4; d++) { const v = neighbor(t, d); if (v >= 0 && world.road[v]) return true; }
  return false;
}

/** The hints of the world, most severe first (ties by tile), at most MAX_HINTS. */
export function computeHints(): Hint[] {
  const out: Hint[] = [];
  let idle = 0, firstIdleHome = -1, built = 0, vacancies = 0;
  for (const p of world.people) if ((p.role === ROLE_SETTLER || p.role === ROLE_RESIDENT) && p.job < 0) { idle++; if (firstIdleHome < 0) firstIdleHome = p.home; }
  const offered: number[] = economy.services.map((_s: Service): number => 0);
  for (const b of world.buildings) if (b.alive && economy.buildings[b.type].service !== null) offered[(economy.buildings[b.type].service as ServiceDef).service] = 1;
  for (let id = 0; id < world.buildings.length; id++) {
    const b = world.buildings[id];
    if (!b.alive) continue;
    if (b.type === HOUSE && b.residents > 0) {
      let flagged = false;
      for (let k = 0; k < offered.length && !flagged; k++) if (offered[k] === 1 && b.cover[k] === 0 && (economy.services[k].risk === '' || world.risks)) { out.push(make(HINT_NO_SERVICE, b.j * world.size + b.i, HINT_NO_SERVICE + ':' + economy.services[k].id, 1)); flagged = true; }
      const report = housingReport(b);          // a house one requirement short of the next level, or about to lose its own
      if (!flagged && (report.atRisk || report.missing.length === 1 || (b.level >= 1 && report.missing.some((q: { id: string }): boolean => q.id === 'food' || economy.serviceOf(q.id) >= 0)))) out.push(make(HINT_HOUSE_NEEDS, b.j * world.size + b.i, HINT_HOUSE_NEEDS + ':' + (report.atRisk ? 'decline' : report.missing[0].id), 1));
    }
    const def = economy.buildings[b.type], tile = b.j * world.size + b.i;
    if (!b.fixed) built++;
    if (def.needsRoad && !def.store && (b.state === BS_ISOLATED || !nextToRoad(tile))) { out.push(make(HINT_NO_ROAD, tile, HINT_NO_ROAD, 3)); continue; }
    if (b.state === BS_WAITING && b.waitFor >= 0) {
      const id2 = economy.resources[b.waitFor].id;
      if (world.stock[b.waitFor] > 0) out.push(make(HINT_DELIVER_HERE, tile, HINT_DELIVER_HERE + ':' + id2, 1));
      else out.push(make(HINT_NO_INPUT, tile, HINT_NO_INPUT + ':' + id2, 3));
    } else if (b.state === BS_NO_SOURCE) out.push(make(HINT_NO_SOURCE, tile, HINT_NO_SOURCE, 3));
    else if (b.state === BS_FULL) out.push(make(HINT_FULL_OUTPUT, tile, HINT_FULL_OUTPUT, 2));
    if (def.bloom !== null && flowersAround(b, def) === 0) out.push(make(HINT_NO_FLOWERS, tile, HINT_NO_FLOWERS, 1));
    if (def.workers > 0 && !b.fixed && b.workers < def.workers) {
      vacancies++;
      out.push(idle > 0 ? make(HINT_IDLE_WORKERS, tile, HINT_IDLE_WORKERS + ':site', 1) : make(HINT_NO_WORKERS, tile, HINT_NO_WORKERS, 2));
    }
  }
  if (idle > 0 && vacancies === 0 && firstIdleHome >= 0 && world.buildings[firstIdleHome] !== undefined) {
    const home = world.buildings[firstIdleHome];
    out.push(make(HINT_IDLE_WORKERS, home.j * world.size + home.i, HINT_IDLE_WORKERS + ':home', 1));
  }
  if (world.jobless >= 25 && worksites() > 0 && firstIdleHome >= 0 && world.buildings[firstIdleHome] !== undefined) {
    const home = world.buildings[firstIdleHome];
    out.push(make(HINT_JOBLESS, home.j * world.size + home.i, HINT_JOBLESS, 2));
  }
  if (world.mood < 45 && world.people.length > 0) {
    const offered2 = servicesOffered();
    let low = -1, lowHappy = 101, lack = '';
    for (let id = 0; id < world.buildings.length; id++) {
      const b = world.buildings[id];
      if (b.alive && b.type === HOUSE && b.residents > 0 && b.happy < lowHappy) { lowHappy = b.happy; low = id; lack = (houseNeeds(b, offered2) as HouseNeeds).lack; }
    }
    if (low >= 0) out.push(make(HINT_UNHAPPY, world.buildings[low].j * world.size + world.buildings[low].i, HINT_UNHAPPY + ':' + lack, 3));
  }
  const fireK = economy.serviceOf('fire');
  if (world.risks && fireK >= 0 && economy.risk.ruin >= 0 && population() >= economy.risk.minPopulation) {
    let worst = -1, most = (offered[fireK] === 1 ? .7 : .25) * economy.risk.fireAt;
    for (let id = 0; id < world.buildings.length; id++) { const b = world.buildings[id]; if (b.alive && !b.fixed && !isRuin(b.type) && b.fire > most) { most = b.fire; worst = id; } }
    if (worst >= 0) out.push(make(HINT_FIRE_RISK, world.buildings[worst].j * world.size + world.buildings[worst].i, HINT_FIRE_RISK + ':' + (offered[fireK] === 1 ? 'rare' : 'none'), 2));
  }
  if (built === 0) out.push(make(HINT_BUILD_NEXT, world.gate, HINT_BUILD_NEXT, 2));
  out.sort((a: Hint, b: Hint): number => b.severity - a.severity || a.tile - b.tile);
  return out.length > MAX_HINTS ? out.slice(0, MAX_HINTS) : out;
}

/** The sentence of a hint for the HUD (the advice line can show the first hint of computeHints). */
export function hintText(h: Hint): string {
  const colon = h.reason.indexOf(':'), key = colon < 0 ? h.reason : h.reason.slice(0, colon), res = colon < 0 ? '' : h.reason.slice(colon + 1);
  if (key === HINT_HOUSE_NEEDS) { const id = world.build[h.tile]; return id >= 0 ? housingReport(world.buildings[id]).text : ''; }
  if (key === HINT_FIRE_RISK) return res === 'none' ? 'Ce bâtiment risque de prendre feu, et personne ne veille : posez un poste d’incendie au bord de la route.' : 'Ce bâtiment risque de prendre feu : les pompiers passent trop rarement par ici.';
  if (key === HINT_JOBLESS) return world.jobless + ' % des habitants n’ont pas de travail : posez de nouveaux ateliers, ou ils partiront.';
  if (key === HINT_UNHAPPY) {
    const k = res === '' || res === 'food' || res === 'jobs' || res === 'appeal' ? -1 : economy.serviceOf(res);
    const why = res === 'food' ? 'la nourriture manque' : res === 'jobs' ? 'trop de chômage' : res === 'appeal' ? 'le quartier est triste' : k >= 0 ? economy.services[k].label.toLowerCase() + ' manque' : 'rien ne va';
    return 'Le hameau est mécontent (' + why + ') : personne ne vient, certains partent.';
  }
  const label = res === '' || res === 'site' || res === 'home' ? '' : key === HINT_NO_SERVICE ? economy.services[economy.serviceOf(res)].label : economy.resources[economy.resourceOf(res)].label;
  if (key === HINT_NO_SOURCE) return 'Rien à récolter à portée : abattez les arbres qui ferment la route (gomme), prolongez la route ou déplacez ce bâtiment.';
  if (key === HINT_NO_ROAD) return 'Aucune route ne relie ce bâtiment à un entrepôt.';
  if (key === HINT_NO_INPUT) return 'Il manque : ' + label + '. Posez de quoi en produire.';
  if (key === HINT_DELIVER_HERE) return label + ' est en route : la route doit relier ce bâtiment à l’entrepôt.';
  if (key === HINT_FULL_OUTPUT) return 'Plein : posez un entrepôt au bord de la route.';
  if (key === HINT_NO_SERVICE) return 'Cette maison n’est pas desservie : ' + label.toLowerCase() + '.';
  if (key === HINT_NO_FLOWERS) return 'Aucune fleur autour des ruches : les abeilles butinent peu. Posez-les près d’une prairie fleurie.';
  const site = world.build[h.tile] >= 0 ? economy.buildings[world.buildings[world.build[h.tile]].type] : null;
  if (key === HINT_NO_WORKERS && site !== null && site.bloom !== null) return 'Pas d’apiculteur : posez une maison, ou donnez la priorité au rucher.';
  if (key === HINT_NO_WORKERS) return 'Personne pour travailler ici : posez une maison, ou donnez la priorité à ce bâtiment.';
  if (key === HINT_IDLE_WORKERS) return res === 'home' ? 'Des habitants n’ont pas de travail : posez un atelier.' : 'Ce chantier attend des bras.';
  return 'Tracez une route depuis la porte, puis posez une maison.';
}

/** The guided start: four steps for a new player (a road from the gate, a house, a lumber hut, a well), each done when the village holds it. A step whose building is locked is skipped. */
export class GuideStep { id: string = ''; tool: number = -1; title: string = ''; text: string = ''; done: boolean = false; }
export function guideSteps(): GuideStep[] {
  const out: GuideStep[] = [];
  const step = (id: string, tool: number, title: string, text: string, done: boolean): void => { const s = new GuideStep(); s.id = id; s.tool = tool; s.title = title; s.text = text; s.done = done; out.push(s); };
  let roads = 0;
  for (let t = 0; t < world.road.length; t++) if (world.road[t] !== 0) roads++;
  const has = (type: number): boolean => { for (const b of world.buildings) if (b.alive && b.type === type) return true; return false; };
  let hut = -1, well = -1;
  const water = economy.serviceOf('water');
  for (let type = 0; type < economy.buildings.length; type++) {
    const d = economy.buildings[type];
    if (!d.buildable) continue;
    if (hut < 0 && d.gather === 'tree' && d.workers > 0) hut = type;
    if (well < 0 && water >= 0 && d.service !== null && d.service.service === water && !d.service.walker) well = type;
  }
  step('road', TOOL_ROAD, 'Une route', 'Choisissez Route puis glissez depuis la porte du hameau : tout part de là.', roads >= 3);
  step('house', TOOL_HOUSE + HOUSE, 'Une maison', 'Posez une maison au bord de la route : les habitants arrivent par la porte.', has(HOUSE));
  if (hut >= 0 && isUnlocked(hut)) step('hut', TOOL_HOUSE + hut, 'Du bois', 'Posez une cabane de bûcheron au bord de la route, près des arbres : elle donne le bois pour bâtir.', has(hut));
  if (well >= 0 && isUnlocked(well)) step('well', TOOL_HOUSE + well, 'De l’eau', 'Posez un puits près des maisons : les maisons desservies s’agrandissent.', has(well));
  return out;
}
/** The first step not done yet, or null when the guide is over. */
export function guideNow(): GuideStep | null {
  for (const s of guideSteps()) if (!s.done) return s;
  return null;
}
