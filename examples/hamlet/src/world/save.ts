import * as storage from 'zinc:storage';
import { SAVE_KEY, SAVE_VERSION, HOUSE } from '../constants';
import { world, generate, tileIndex, tileCount } from './world';
import { addBuilding } from '../rules/build';
import { createResident } from '../engine/villagers';

// One line of text, fields split by ';' and lists by ',': version;seed;size;wood;meat;fish;roads;buildings(type.tile.residents);trees(tile.variant);unlimited
function numbers(text: string): number[] {
  const out: number[] = [];
  if (text === '') return out;
  for (const part of text.split(',')) out.push(Number(part));
  return out;
}

export function snapshot(): string {
  const roads: number[] = [], buildings: string[] = [], trees: string[] = [];
  for (let t = 0; t < tileCount(); t++) if (world.road[t]) roads.push(t);
  for (const b of world.buildings) if (b.alive) buildings.push(b.type + '.' + tileIndex(b.i, b.j) + '.' + b.residents);
  for (let t = 0; t < tileCount(); t++) if (world.tree[t] > 0) trees.push(t + '.' + world.tree[t]);
  return [SAVE_VERSION, String(world.seed), String(world.size), String(world.wood), String(world.meat), String(world.fish), roads.join(','), buildings.join(','), trees.join(','), world.unlimited ? '1' : '0'].join(';');
}

export function saveGame(): void {
  world.saveDirty = false; world.lastSave = world.time;
  try { storage.set(SAVE_KEY, snapshot()); }
  catch (error) { console.warn('The village could not be saved: ' + error.message); }
}

/** Rebuilds the village from a snapshot. False when there is none (or it is from another version). */
export function restore(text: string): boolean {
  const fields = text.split(';');
  if (fields.length !== 10 || fields[0] !== SAVE_VERSION) return false;
  generate(Number(fields[1]), Number(fields[2]));
  world.wood = Number(fields[3]); world.meat = Number(fields[4]); world.fish = Number(fields[5]);
  world.tree.fill(0);                                    // the saved list is the whole forest: felled and regrown trees included
  if (fields[8] !== '') for (const entry of fields[8].split(',')) { const parts = entry.split('.'); world.tree[Number(parts[0])] = Number(parts[1]); }
  world.unlimited = fields[9] === '1';
  for (const t of numbers(fields[6])) { world.road[t] = 1; world.deco[t] = 0; }
  if (fields[7] !== '') {
    for (const entry of fields[7].split(',')) {
      const parts = entry.split('.');
      const id = addBuilding(Number(parts[0]), Number(parts[1]));
      if (Number(parts[0]) === HOUSE) {
        for (let n = 0; n < Number(parts[2]); n++) createResident(id);
        world.buildings[id].residents = Number(parts[2]);
      }
    }
  }
  world.revision++;
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
