import { HOUSE, BS_WAITING, BS_FULL, BS_ISOLATED, ROLE_SETTLER, ROLE_RESIDENT } from '../constants';
import { world, neighbor } from '../world/world';
import { economy, ServiceDef, Service } from '../world/economy';

// Attention hints: what the player should look at, as a pure function of the world (no drawing, no state). The view draws an arrow over each tile.
export const HINT_NO_ROAD = 'no_road';              // a building that needs a road has none to a store: nothing leaves it and nothing comes
export const HINT_IDLE_WORKERS = 'idle_workers';    // a site with no workers while people stand idle, or idle people and no site for them
export const HINT_NO_INPUT = 'no_input';            // a producer waits for a resource that no store holds: build what makes it
export const HINT_FULL_OUTPUT = 'full_output';      // a producer has no room left for its output
export const HINT_DELIVER_HERE = 'deliver_here';    // a producer waits for a resource a store holds: the road is what it lacks, or a porter is on the way
export const HINT_NO_WORKERS = 'no_workers';        // a workplace lacks hands and nobody is idle: more houses
export const HINT_BUILD_NEXT = 'build_next';        // first run: the village has nothing but its hall, start at the gate
export const HINT_NO_SERVICE = 'no_service';        // a house is outside the reach of a service the village does offer (`no_service:<service id>`)
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
    if (b.type === HOUSE && b.residents > 0) for (let k = 0; k < offered.length; k++) if (offered[k] === 1 && b.cover[k] === 0) { out.push(make(HINT_NO_SERVICE, b.j * world.size + b.i, HINT_NO_SERVICE + ':' + economy.services[k].id, 1)); break; }
    const def = economy.buildings[b.type], tile = b.j * world.size + b.i;
    if (!b.fixed) built++;
    if (def.needsRoad && !def.store && (b.state === BS_ISOLATED || !nextToRoad(tile))) { out.push(make(HINT_NO_ROAD, tile, HINT_NO_ROAD, 3)); continue; }
    if (b.state === BS_WAITING && b.waitFor >= 0) {
      const id2 = economy.resources[b.waitFor].id;
      if (world.stock[b.waitFor] > 0) out.push(make(HINT_DELIVER_HERE, tile, HINT_DELIVER_HERE + ':' + id2, 1));
      else out.push(make(HINT_NO_INPUT, tile, HINT_NO_INPUT + ':' + id2, 3));
    } else if (b.state === BS_FULL) out.push(make(HINT_FULL_OUTPUT, tile, HINT_FULL_OUTPUT, 2));
    if (def.workers > 0 && !b.fixed && b.workers < def.workers) {
      vacancies++;
      out.push(idle > 0 ? make(HINT_IDLE_WORKERS, tile, HINT_IDLE_WORKERS + ':site', 1) : make(HINT_NO_WORKERS, tile, HINT_NO_WORKERS, 2));
    }
  }
  if (idle > 0 && vacancies === 0 && firstIdleHome >= 0 && world.buildings[firstIdleHome] !== undefined) {
    const home = world.buildings[firstIdleHome];
    out.push(make(HINT_IDLE_WORKERS, home.j * world.size + home.i, HINT_IDLE_WORKERS + ':home', 1));
  }
  if (built === 0) out.push(make(HINT_BUILD_NEXT, world.gate, HINT_BUILD_NEXT, 2));
  out.sort((a: Hint, b: Hint): number => b.severity - a.severity || a.tile - b.tile);
  return out.length > MAX_HINTS ? out.slice(0, MAX_HINTS) : out;
}

/** The sentence of a hint for the HUD (the advice line can show the first hint of computeHints). */
export function hintText(h: Hint): string {
  const colon = h.reason.indexOf(':'), key = colon < 0 ? h.reason : h.reason.slice(0, colon), res = colon < 0 ? '' : h.reason.slice(colon + 1);
  const label = res === '' || res === 'site' || res === 'home' ? '' : key === HINT_NO_SERVICE ? economy.services[economy.serviceOf(res)].label : economy.resources[economy.resourceOf(res)].label;
  if (key === HINT_NO_ROAD) return 'Aucune route ne relie ce bâtiment à un entrepôt.';
  if (key === HINT_NO_INPUT) return 'Il manque : ' + label + '. Posez de quoi en produire.';
  if (key === HINT_DELIVER_HERE) return label + ' est en route : la route doit relier ce bâtiment à l’entrepôt.';
  if (key === HINT_FULL_OUTPUT) return 'Plein : posez un entrepôt au bord de la route.';
  if (key === HINT_NO_SERVICE) return 'Cette maison n’est pas desservie : ' + label.toLowerCase() + '.';
  if (key === HINT_NO_WORKERS) return 'Personne pour travailler ici : posez une maison, ou donnez la priorité à ce bâtiment.';
  if (key === HINT_IDLE_WORKERS) return res === 'home' ? 'Des habitants n’ont pas de travail : posez un atelier.' : 'Ce chantier attend des bras.';
  return 'Tracez une route depuis la porte, puis posez une maison.';
}
