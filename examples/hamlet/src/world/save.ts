import * as storage from 'zinc:storage';
import { SAVE_KEY, SAVE_VERSION, HOUSE, ROCK_DEPOSIT } from '../constants';
import { TerrainParams } from '../gen/terrain';
import { world, Offer, Expedition, generate, recount, tileIndex, tileCount } from './world';
import { addBuilding } from '../rules/build';
import { createResident, dropPerson } from '../engine/villagers';
import { spawnPeddler } from '../engine/trade';
import { computeAppeal } from '../rules/appeal';
import { stockWithCarried } from '../engine/transport';

// One line of text, fields split by ';' and lists by ',': version;seed;size;roads;buildings(type.tile.residents.stock, cover, level, streak and meals; lists with | between);trees(tile.variant);unlimited;tick;rng;priority;params;deposits(tile.value.left);goals done;buildings unlocked;peddler offers(resource.qty.side.coins.taken);days he stays;expeditions(adventure.days left.homes);progression
function numbers(text: string): number[] {
  const out: number[] = [];
  if (text === '') return out;
  for (const part of text.split(',')) out.push(Number(part));
  return out;
}

/** The generator's request, as water,river,forest,rock,biome (numbers). */
function paramsText(): string { const p = world.params; return [p.waterAmount, p.river ? 1 : 0, p.forestDensity, p.rockDensity, p.biome].join(','); }
function paramsOf(text: string): TerrainParams {
  const p = new TerrainParams(), v = numbers(text);
  p.waterAmount = v[0]; p.river = v[1] === 1; p.forestDensity = v[2]; p.rockDensity = v[3]; p.biome = v[4];
  return p;
}

export function snapshot(): string {
  const roads: number[] = [], buildings: string[] = [], trees: string[] = [], lodes: string[] = [];
  for (let t = 0; t < tileCount(); t++) if (world.road[t]) roads.push(t);
  for (const b of world.buildings) if (b.alive) buildings.push(b.type + '.' + tileIndex(b.i, b.j) + '.' + b.residents + '.' + stockWithCarried(world.buildings.indexOf(b)).join('|') + '.' + b.cover.join('|') + '.' + b.level + '.' + b.streak + '.' + b.fed.join('|'));
  for (let t = 0; t < tileCount(); t++) { if (world.tree[t] > 0) trees.push(t + '.' + world.tree[t]); if (world.rock[t] >= ROCK_DEPOSIT) lodes.push(t + '.' + world.rock[t] + '.' + world.lode[t]); }
  return [SAVE_VERSION, String(world.seed), String(world.size), roads.join(','), buildings.join(','), trees.join(','), world.unlimited ? '1' : '0', String(world.tick), String(world.rng), world.priority.join(','), paramsText(), lodes.join(','), world.goals.join(''), world.unlocked.join(''), world.offers.map((o: Offer): string => [String(o.resource), String(o.qty), o.side, String(o.coins), o.taken ? '1' : '0'].join('.')).join(','), String(world.peddlerLeft), world.expeditions.map((e: Expedition): string => e.adventure + '.' + e.left + '.' + e.homes.join('|')).join(','), world.progression ? '1' : '0'].join(';');
}

export function saveGame(): void {
  world.saveDirty = false; world.lastSave = world.time;
  try { storage.set(SAVE_KEY, snapshot()); }
  catch (error) { console.warn('The village could not be saved: ' + error.message); }
}

/** Rebuilds the village from a snapshot. False when there is none (or it is from another version). */
export function restore(text: string): boolean {
  const fields = text.split(';');
  if (fields.length !== 18 || fields[0] !== SAVE_VERSION) return false;
  generate(Number(fields[1]), Number(fields[2]), paramsOf(fields[10]));
  for (const t of numbers(fields[3])) { world.road[t] = 1; world.deco[t] = 0; }
  if (fields[4] !== '') {
    for (const entry of fields[4].split(',')) {
      const parts = entry.split('.'), type = Number(parts[0]), tile = Number(parts[1]);
      const id = world.build[tile] >= 0 ? world.build[tile] : addBuilding(type, tile);       // the hall already stands, empty of its start stock
      world.buildings[id].stock = parts[3].split('|').map((v: string): number => Number(v));
      world.buildings[id].level = Number(parts[5]); world.buildings[id].streak = Number(parts[6]); world.buildings[id].fed = parts[7].split('|').map((v: string): number => Number(v));
      world.buildings[id].cover = parts[4].split('|').map((v: string): number => Number(v));
      if (type === HOUSE) {
        for (let n = 0; n < Number(parts[2]); n++) createResident(id);
        world.buildings[id].residents = Number(parts[2]);
      }
    }
  }
  world.tree.fill(0);                                    // the saved list is the whole forest: felled and regrown trees included
  if (fields[5] !== '') for (const entry of fields[5].split(',')) { const parts = entry.split('.'); world.tree[Number(parts[0])] = Number(parts[1]); }
  world.unlimited = fields[6] === '1';
  for (let t = 0; t < tileCount(); t++) if (world.rock[t] >= ROCK_DEPOSIT) { world.rock[t] = 0; world.lode[t] = 0; }   // the saved list is every deposit left, worked ones included
  if (fields[11] !== '') for (const entry of fields[11].split(',')) { const parts = entry.split('.'); world.rock[Number(parts[0])] = Number(parts[1]); world.lode[Number(parts[0])] = Number(parts[2]); }
  for (let k = 0; k < world.goals.length; k++) world.goals[k] = fields[12].charAt(k) === '1' ? 1 : 0;
  for (let k = 0; k < world.unlocked.length; k++) world.unlocked[k] = fields[13].charAt(k) === '0' ? 0 : 1;
  world.offers = []; world.peddlerLeft = Number(fields[15]);
  if (fields[14] !== '') for (const entry of fields[14].split(',')) {
    const parts = entry.split('.'), o = new Offer();
    o.resource = Number(parts[0]); o.qty = Number(parts[1]); o.side = parts[2]; o.coins = Number(parts[3]); o.taken = parts[4] === '1';
    world.offers.push(o);
  }
  world.expeditions = []; world.progression = fields[17] === '1';
  if (fields[16] !== '') for (const entry of fields[16].split(',')) {
    const parts = entry.split('.'), e = new Expedition();
    e.adventure = Number(parts[0]); e.left = Number(parts[1]); e.homes = parts[2] === '' ? [] : parts[2].split('|').map((v: string): number => Number(v));
    for (const home of e.homes) dropPerson(home);                 // the members are away: the houses were rebuilt with all their people
    world.expeditions.push(e);
  }
  if (world.peddlerLeft > 0) spawnPeddler();
  world.priority = numbers(fields[9]);
  world.tick = Number(fields[7]); world.rng = Number(fields[8]);    // last: rebuilding the residents drew random numbers
  computeAppeal(); recount(); world.revision++;
  return true;
}

export function loadGame(): boolean {
  let text = '';
  try { text = storage.get(SAVE_KEY); } catch (error) { return false; }
  return text !== '' && restore(text);
}
export function eraseSave(): void {
  try { storage.remove(SAVE_KEY); } catch (error) { console.warn('The save could not be erased: ' + error.message); }
}
