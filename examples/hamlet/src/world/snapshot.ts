import { SAVE_VERSION, SAVE_OLDEST, HOUSE, ROCK_DEPOSIT, TERRAIN_VOID } from '../constants';
import { TerrainParams } from '../gen/terrain';
import { world, Offer, Expedition, generate, recount, tileIndex, tileCount, tileI, tileJ, growSpot, resizeBuilding, footprint } from './world';
import { addBuilding } from '../rules/build';
import { createResident, dropPerson } from '../engine/villagers';
import { spawnPeddler } from '../engine/trade';
import { computeAppeal } from '../rules/appeal';
import { defaultLevel } from '../rules/difficulty';
import { applyMission, missionOf } from './missions';
import { stockWithCarried, forgetCarried } from '../engine/transport';
import { economy, Housing } from './economy';

// One line of text, fields split by ';' and lists by ',': version;seed;size;roads;buildings(type.tile.residents.stock, cover, level, streak, meals and the risk counters fire|damage|crime|burn, storage orders, roamer turn; lists with | between);trees(tile.variant);unlimited;tick;rng;priority;params;deposits(tile.value.left);goals done;buildings unlocked;peddler offers(resource.qty.side.coins.taken);days he stays;expeditions(adventure.days left.homes);progression;risks;difficulty
function numbers(text: string): number[] {
  const out: number[] = [];
  if (text === '') return out;
  for (const part of text.split(',')) out.push(Number(part));
  return out;
}

/** The generator's request, as water,river,forest,rock,biome,coast,outcrop,flowers (numbers). */
function paramsText(): string { const p = world.params; return [p.waterAmount, p.river ? 1 : 0, p.forestDensity, p.rockDensity, p.biome, p.coast, p.outcrop, p.flowers, p.biomes, p.wolves, p.relief, p.genStyle].join(','); }
function paramsOf(text: string): TerrainParams {
  const p = new TerrainParams(), v = numbers(text);
  p.waterAmount = v[0]; p.river = v[1] === 1; p.forestDensity = v[2]; p.rockDensity = v[3]; p.biome = v[4];
  if (v.length >= 8) { p.coast = v[5]; p.outcrop = v[6]; p.flowers = v[7]; }
  p.wolves = v.length >= 10 ? v[9] : 0;          // the wolves flag came later: older saves have none
  p.biomes = v.length >= 9 ? v[8] : 0;          // saves from before the presets have five numbers
  p.relief = v.length >= 11 ? v[10] : 0;         // saves before the relief are flat
  p.genStyle = v.length >= 12 ? v[11] : 0;       // saves before the clustered generator were made by the scatter one and load as they were
  return p;
}

/** The height levels, one hex digit per tile; empty when the land is flat. */
function heightText(): string { return world.height.some((v: number): boolean => v > 0) ? world.height.map((v: number): string => v.toString(16)).join('') : ''; }

/** The whole village as one line of text. Pure: no storage, so a server can keep and compare towns with it (save.ts writes it to zinc:storage). */
export function snapshot(): string {
  const roads: number[] = [], buildings: string[] = [], trees: string[] = [], lodes: string[] = [];
  for (let t = 0; t < tileCount(); t++) if (world.road[t]) roads.push(t);
  for (const b of world.buildings) if (b.alive) buildings.push(b.type + '.' + tileIndex(b.i, b.j) + '.' + b.residents + '.' + stockWithCarried(world.buildings.indexOf(b)).join('|') + '.' + b.cover.join('|') + '.' + b.level + '.' + b.streak + '.' + b.fed.join('|') + '.' + [b.fire, b.damage, b.crime, b.burn].join('|') + '.' + b.orders.join('|') + '.' + b.turn);
  for (let t = 0; t < tileCount(); t++) { if (world.tree[t] > 0) trees.push(t + '.' + world.tree[t]); if (world.rock[t] >= ROCK_DEPOSIT) lodes.push(t + '.' + world.rock[t] + '.' + world.lode[t]); }
  return [SAVE_VERSION, String(world.seed), String(world.size), roads.join(','), buildings.join(','), trees.join(','), world.unlimited ? '1' : '0', String(world.tick), String(world.rng), world.priority.join(','), paramsText(), lodes.join(','), world.goals.join(''), world.unlocked.join(''), world.offers.map((o: Offer): string => [String(o.resource), String(o.qty), o.side, String(o.coins), o.taken ? '1' : '0'].join('.')).join(','), String(world.peddlerLeft), world.expeditions.map((e: Expedition): string => e.adventure + '.' + e.left + '.' + e.homes.join('|')).join(','), world.progression ? '1' : '0', world.risks ? '1' : '0', String(world.difficulty), heightText(), world.mission].join(';');
}

/** True when a footprint of w x h from the anchor tile is on the map, on grass, with no road, rock, building or other saved anchor on any of its other tiles. */
function fitsFootprint(tile: number, w: number, h: number, anchors: number[]): boolean {
  const i = tileI(tile), j = tileJ(tile);
  if (i + w > world.size || j + h > world.size) return false;
  for (let dj = 0; dj < h; dj++) for (let di = 0; di < w; di++) {
    const u = tileIndex(i + di, j + dj);
    if (world.terrain[u] !== 0 || world.road[u] !== 0 || world.rock[u] !== 0 || (u !== tile && (anchors[u] === 1 || world.build[u] >= 0))) return false;
  }
  return true;
}
/** A saved list made to the length the data has now (a resource or service added since the save reads as 0, one removed is dropped). */
function sized(text: string, length: number): number[] {
  const out: number[] = [], parts = text.split('|');
  for (let n = 0; n < length; n++) out.push(n < parts.length ? Number(parts[n]) : 0);
  return out;
}
/** What the version field of a save says: this version, an older one this build still reads, one too old, one from a newer Hamlet, or no save at all. */
export enum SaveCheck { Current, Older, TooOld, Future, NotASave }
/** The outcome of reading a save: its check, the version it named and, when it was refused, a sentence for the player. */
export class Restored {
  check: SaveCheck = SaveCheck.NotASave; version: string = ''; message: string = '';
  ok(): boolean { return this.check === SaveCheck.Current || this.check === SaveCheck.Older; }
}
function versionNumber(v: string): number { return v.length > 1 && v.charAt(0) === 'H' && /^[0-9]+$/.test(v.slice(1)) ? Number(v.slice(1)) : -1; }
/** Reads the version of a save without touching the village. A newer version is refused before its fields are read: its layout is unknown. */
export function checkSave(text: string): Restored {
  const r = new Restored(), fields = text.split(';'), n = versionNumber(fields[0]), current = versionNumber(SAVE_VERSION);
  r.version = fields[0];
  if (n < 0) { r.check = SaveCheck.NotASave; r.message = 'Ce texte n’est pas une sauvegarde de Hameau.'; }
  else if (n > current) { r.check = SaveCheck.Future; r.message = 'Cette sauvegarde vient d’une version plus récente de Hameau (' + fields[0] + ') : mettez le jeu à jour pour la charger.'; }
  else if (n < versionNumber(SAVE_OLDEST)) { r.check = SaveCheck.TooOld; r.message = 'Cette sauvegarde est trop ancienne (' + fields[0] + ') pour cette version de Hameau.'; }
  else if (fields.length < 19) { r.check = SaveCheck.NotASave; r.message = 'Cette sauvegarde est incomplète.'; }
  else r.check = n === current ? SaveCheck.Current : SaveCheck.Older;
  return r;
}
/** Rebuilds the village from a snapshot, or leaves it untouched and says why it refused. Older versions migrate on the way: H19 has no heights (loads flat),
 *  H20 no storage orders, H21 no footprints (a building may then have a neighbour where its footprint would go). */
export function restore(text: string): Restored {
  const r = checkSave(text);
  if (!r.ok()) return r;
  const fields = text.split(';');
  applyMission(fields.length > 21 ? fields[21] : '');         // the mission's goals and knobs first: generate sizes the goal list from them
  generate(Number(fields[1]), Number(fields[2]), paramsOf(fields[10]));
  const heights = fields.length > 20 ? fields[20] : '';
  if (fields[0] !== 'H19' && heights.length === world.size * world.size) for (let t = 0; t < heights.length; t++) world.height[t] = parseInt(heights.charAt(t), 16);
  else if (fields[0] === 'H19') world.height.fill(0);
  for (const t of numbers(fields[3])) if (world.terrain[t] !== TERRAIN_VOID) { world.road[t] = 1; world.deco[t] = 0; }   // what an older save holds on the border (the rim of a map) is dropped, never moved
  if (fields[4] !== '') {
    const anchors: number[] = Array.from({ length: tileCount() }, (): number => 0);          // a building is saved by its anchor tile: a footprint from the data of today must not cover another one
    for (const entry of fields[4].split(',')) anchors[Number(entry.split('.')[1])] = 1;
    for (const entry of fields[4].split(',')) {
      const parts = entry.split('.'), type = Number(parts[0]), tile = Number(parts[1]);
      if (world.terrain[tile] === TERRAIN_VOID) continue;
      const def = economy.buildings[type], fit = fields[0] === SAVE_VERSION || def.w * def.h === 1 || fitsFootprint(tile, def.w, def.h, anchors);       // an old save may have a neighbour where the footprint would go: the building then stays 1 x 1
      const id = world.build[tile] >= 0 ? world.build[tile] : addBuilding(type, tile, fit ? def.w : 1, fit ? def.h : 1);       // the hall already stands, empty of its start stock
      const b = world.buildings[id];
      b.stock = sized(parts[3], b.stock.length); b.fed = sized(parts[7], b.fed.length); b.cover = sized(parts[4], b.cover.length);
      b.level = Number(parts[5]); b.streak = Number(parts[6]);
      const risk = sized(parts[8], 4); b.fire = risk[0]; b.damage = risk[1]; b.crime = risk[2]; b.burn = risk[3];
      if (parts.length > 10) { b.orders = parts[9] === '' ? [] : sized(parts[9], economy.resources.length); b.turn = Number(parts[10]); }      // H21: storage orders and the roamer's turn counter
      if (type === HOUSE) {
        for (let n = 0; n < Number(parts[2]); n++) createResident(id);
        world.buildings[id].residents = Number(parts[2]);
      }
    }
  }
  world.tree.fill(0);                                    // the saved list is the whole forest: felled and regrown trees included
  if (fields[5] !== '') for (const entry of fields[5].split(',')) { const parts = entry.split('.'); if (world.terrain[Number(parts[0])] !== TERRAIN_VOID) world.tree[Number(parts[0])] = Number(parts[1]); }
  for (let id = 0; id < world.buildings.length; id++) {                         // what the saved trees hold under a footprint is gone; a house gets the room of its level when it is there
    const b = world.buildings[id];
    for (const u of footprint(b)) world.tree[u] = 0;
    if (b.type === HOUSE && b.alive) { const hs = economy.buildings[HOUSE].housing as Housing, lv = hs.levels[Math.min(b.level, hs.levels.length - 1)]; if (lv.w > b.w || lv.h > b.h) { const spot = growSpot(b, lv.w, lv.h); if (spot >= 0) resizeBuilding(id, lv.w, lv.h, spot); } }
  }
  world.unlimited = fields[6] === '1';
  for (let t = 0; t < tileCount(); t++) if (world.rock[t] >= ROCK_DEPOSIT) { world.rock[t] = 0; world.lode[t] = 0; }   // the saved list is every deposit left, worked ones included
  if (fields[11] !== '') for (const entry of fields[11].split(',')) { const parts = entry.split('.'); if (world.terrain[Number(parts[0])] === TERRAIN_VOID) continue; world.rock[Number(parts[0])] = Number(parts[1]); world.lode[Number(parts[0])] = Number(parts[2]); }
  for (let k = 0; k < world.goals.length; k++) world.goals[k] = fields[12].charAt(k) === '1' ? 1 : 0;
  for (let k = 0; k < world.unlocked.length; k++) world.unlocked[k] = fields[13].charAt(k) === '0' ? 0 : 1;
  world.offers = []; world.peddlerLeft = Number(fields[15]);
  if (fields[14] !== '') for (const entry of fields[14].split(',')) {
    const parts = entry.split('.'), o = new Offer();
    o.resource = Number(parts[0]); o.qty = Number(parts[1]); o.side = parts[2]; o.coins = Number(parts[3]); o.taken = parts[4] === '1';
    world.offers.push(o);
  }
  world.expeditions = []; world.progression = fields[17] === '1'; world.risks = fields[18] === '1'; world.difficulty = fields.length > 19 ? Number(fields[19]) : world.progression ? defaultLevel() : -1;
  if (fields[16] !== '') for (const entry of fields[16].split(',')) {
    const parts = entry.split('.'), e = new Expedition();
    e.adventure = Number(parts[0]); e.left = Number(parts[1]); e.homes = parts[2] === '' ? [] : parts[2].split('|').map((v: string): number => Number(v));
    for (const home of e.homes) dropPerson(home);                 // the members are away: the houses were rebuilt with all their people
    world.expeditions.push(e);
  }
  if (world.peddlerLeft > 0) spawnPeddler();
  world.priority = numbers(fields[9]);
  world.tick = Number(fields[7]); world.rng = Number(fields[8]);    // last: rebuilding the residents drew random numbers
  forgetCarried();
  computeAppeal(); recount(); world.revision++; world.netRev++;
  world.origin = text;                                            // a command log of this village replays from this save
  return r;
}

/** A new village as one line, what a command log starts from (engine/replay.ts): start;seed;size;params;mission;difficulty;progression;risks;unlimited. */
export function startText(): string {
  return ['start', String(world.seed), String(world.size), paramsText(), world.mission, String(world.difficulty), world.progression ? '1' : '0', world.risks ? '1' : '0', world.unlimited ? '1' : '0'].join(';');
}
/** Makes the village a start line describes, as the new-village form does (the mission and difficulty before generating). '' when done, else why the line was refused (the village untouched). */
export function startVillage(text: string): string {
  const f = text.split(';'), whole = (v: string): boolean => /^-?[0-9]+$/.test(v), flag = (v: string): boolean => v === '0' || v === '1';
  if (f.length !== 9 || f[0] !== 'start' || !whole(f[1]) || !whole(f[2]) || !whole(f[5]) || !flag(f[6]) || !flag(f[7]) || !flag(f[8])) return 'la ligne de départ est mal formée';
  if (f[3].split(',').some((v: string): boolean => !isFinite(Number(v)) || v === '')) return 'les réglages de la carte sont mal formés';
  if (f[4] !== '' && missionOf(f[4]) === null) return 'mission inconnue : ' + f[4];
  applyMission(f[4]);
  world.difficulty = Number(f[5]);
  generate(Number(f[1]), Number(f[2]), paramsOf(f[3]));
  world.progression = f[6] === '1'; world.risks = f[7] === '1'; world.unlimited = f[8] === '1';
  return '';
}
