// The history of the setup: the layers and the clips after each action, on the mapper so that every editor shares it. It lasts until the app stops.
// An action is what changed once the commands fall quiet: a whole drag is one. What plays is left out both ways: firing a clip is not an edit, and going back does not change the picture's content.
import * as mapping from 'zinc:mapping';
import { SETUP_FILE } from '../constants';
import { restoreSetup } from './scenes';
import { isClip, replaceShow, showJson } from './show';

interface Entry { label: string; mapping: string; show: string }

const MAX_ENTRIES: i32 = 50;
const QUIET_MS = 800;   // long enough for the page to save what a scene it just loaded changes in the show
const PLAYING_KEYS: string[] = ['source', 'image', 'media', 'fit', 'frame', 'loop', 'color'];
const WORDS: string[][] = [['edgedir', 'edge direction'], ['inputRect', 'input'], ['maskimage', 'mask image']];
const SAME = 1e-4;   // the file's precision

const entries: Entry[] = [];
let at: i32 = 0;
let timer: i32 = -1;
let comingLabel = '';

function layersOf(json: string): any[] { return JSON.parse(json).layers as any[]; }

/** The keys that differ between two states of a layer, without what plays. */
function editedKeys(before: any, after: any): string[] {
  const keys: string[] = [];
  for (const key of Object.keys(before).concat(Object.keys(after))) {
    if (!keys.includes(key) && !PLAYING_KEYS.includes(key) && JSON.stringify(before[key]) !== JSON.stringify(after[key])) keys.push(key);
  }
  return keys;
}

/** All four corners went the same way. */
function movedWhole(before: any, after: any): boolean {
  const a = before.corners as number[], b = after.corners as number[];
  for (let i: i32 = 2; i < 8; i++) {
    if (Math.abs(b[i] - a[i] - (b[i % 2] - a[i % 2])) > SAME) return false;
  }
  return true;
}

function wordsOf(keys: string[]): string {
  return keys.slice(0, 2).map((key: string): string => {
    const known = WORDS.find((pair: string[]) => pair[0] === key);
    return known === undefined ? key.replace('mask/', 'mask ') : (known as string[])[1];
  }).join(', ');
}

/** Layers that are the same ones in the same order: one renamed at most. */
function sameLayers(before: any[], after: any[]): boolean {
  if (before.length !== after.length) return false;
  let renamed = 0;
  for (let n: i32 = 0; n < before.length; n++) {
    if (JSON.stringify(before[n].name) !== JSON.stringify(after[n].name)) renamed++;
  }
  return renamed <= 1;   // ponytail: two layers of one name swapped pass for an edit of both, and keep what each plays
}

function layersLabel(before: any[], after: any[]): string {
  if (after.length > before.length) return 'Layer added';
  if (after.length < before.length) return 'Layer removed';
  if (!sameLayers(before, after)) return 'Layer order';
  let label = '', changed = 0;
  for (let n: i32 = 0; n < after.length; n++) {
    const keys = editedKeys(before[n], after[n]);
    if (keys.length === 0) continue;
    changed++;
    const moved = keys.length === 1 && keys[0] === 'corners' && movedWhole(before[n], after[n]);
    if (label === '' || moved) label = `${(after[n].name as string[])[0]}: ${moved ? 'moved' : wordsOf(keys)}`;
  }
  return changed > 1 ? `${label} (+${changed - 1})` : label;
}

/** The clips, without the empty cells and columns the page adds as it shows them. */
function clipsOf(show: any): string {
  const columns: any[] = [];
  for (const column of show.columns as any[]) {
    const cells = (column.cells as any[]).map((cell: any): any => isClip(cell) ? cell : null);
    while (cells.length > 0 && cells[cells.length - 1] === null) cells.pop();
    columns.push(cells);
  }
  while (columns.length > 0 && (columns[columns.length - 1] as any[]).length === 0) columns.pop();
  return JSON.stringify(columns);
}

function showLabel(before: any, after: any): string {
  if (clipsOf(before) !== clipsOf(after)) return 'Clips';
  if (JSON.stringify(before.links ?? []) !== JSON.stringify(after.links ?? [])) return 'Linked points';
  if (JSON.stringify(before.surfaces ?? {}) !== JSON.stringify(after.surfaces ?? {})) return 'Room';
  if (after.lens !== undefined && JSON.stringify(before.lens) !== JSON.stringify(after.lens)) return 'Room';
  return '';
}

function changeLabel(from: Entry, mappingNow: string, showNow: string): string {
  const layers = layersLabel(layersOf(from.mapping), layersOf(mappingNow));
  return layers !== '' ? layers : showLabel(JSON.parse(from.show), JSON.parse(showNow));
}

function record(): void {
  if (timer >= 0) clearTimeout(timer);
  timer = -1;
  const mappingNow = mapping.toJson(), showNow = showJson();
  const label = comingLabel !== '' ? comingLabel : changeLabel(entries[at], mappingNow, showNow);
  comingLabel = '';
  if (label === '') return;
  entries.splice(at + 1, entries.length - at - 1);   // what was undone goes
  entries.push({ label, mapping: mappingNow, show: showNow });
  if (entries.length > MAX_ENTRIES) entries.shift();
  at = (entries.length - 1) as i32;
}

export function startHistory(): void {
  entries.push({ label: 'Start', mapping: mapping.toJson(), show: showJson() });
}

/** Something changed: an entry once things fall quiet, under this label if there is one (else it says what differs). */
export function noteChange(label: string = ''): void {
  if (label !== '') comingLabel = label;
  if (timer >= 0) clearTimeout(timer);
  timer = setTimeout(record, QUIET_MS);
}

function applyLayerKey(layer: i32, key: string, values: any): void {
  const numbers: number[] = [], strings: string[] = [];
  for (const value of (values ?? []) as any[]) {
    if (typeof value === 'string') strings.push(value as string);
    else numbers.push(value as number);
  }
  mapping.command(`/layer/${layer}/${key}`, numbers, strings);
}

/** Back to an entry: in place when the layers are the same ones, so that nothing that plays starts again. */
function goTo(index: i32): void {
  const target = entries[index];
  const now = layersOf(mapping.toJson()), wanted = layersOf(target.mapping);
  at = index;
  if (!sameLayers(now, wanted)) {
    restoreSetup(target.mapping, target.show);
    return;
  }
  for (let n: i32 = 0; n < now.length; n++) {
    for (const key of editedKeys(now[n], wanted[n])) applyLayerKey(n, key, wanted[n][key]);
  }
  mapping.save(SETUP_FILE);
  replaceShow(target.show, true);
}

export function historyJson(): string {
  return JSON.stringify({ entries: entries.map((entry: Entry): string => entry.label), at });
}

/** step: "undo", "redo" or the place of an entry. False when there is no such entry. */
export function stepHistory(step: string): boolean {
  if (timer >= 0) record();   // what has just been done is an action too
  const index = step === 'undo' ? at - 1 : step === 'redo' ? at + 1 : parseInt(step);
  if (isNaN(index) || index < 0 || index >= entries.length) return false;
  goTo(index as i32);
  return true;
}
