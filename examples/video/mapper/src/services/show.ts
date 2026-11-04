// The show: a grid of clips, a row per layer and a column per moment, as in Resolume. A clip is a media or a source with how it plays; each layer
// plays one at a time, fired alone or with its column. The page owns the file's
// other fields (the surfaces' real sizes, the lens); this service keeps them untouched.
import * as fs from 'zinc:fs';
import * as mapping from 'zinc:mapping';
import { SHOW_FILE } from '../constants';
import { applyLayerCommand } from './layerCommands';

let show: any = { columns: [], active: -1, playing: [] };

export function loadShow(): void {
  if (!fs.exists(SHOW_FILE)) return;
  try {
    show = JSON.parse(fs.readText(SHOW_FILE));
  } catch (e) {
    console.error(`mapper: ${SHOW_FILE} is not readable, starting with no columns (${e})`);
  }
}

export function showJson(): string { return JSON.stringify(show); }

function saveShow(): void {
  const coming = `${SHOW_FILE}.part`;
  fs.writeText(coming, showJson());
  fs.rename(coming, SHOW_FILE);   // a power cut leaves the old file or the new one
}

/** Replaces the show; the error to show it, '' when accepted. The page edits the clips, not what plays: `keepPlaying` leaves that as it is. */
export function replaceShow(json: string, keepPlaying: boolean = false): string {
  let next: any = null;
  try {
    next = JSON.parse(json);
  } catch (e) {
    return 'not JSON';
  }
  if (next === null || !Array.isArray(next.columns)) return 'expected {"columns": [...]}';
  if (keepPlaying) {
    next.active = show.active;
    next.playing = show.playing;
  }
  show = next;
  saveShow();
  return '';
}

export function isClip(cell: any): boolean {
  if (cell === null || cell === undefined) return false;
  return (typeof cell.media === 'string' && cell.media !== '') || (typeof cell.source === 'string' && cell.source !== '');
}

function clipAt(column: i32, layer: i32): any {
  const columns = show.columns as any[];
  if (column < 0 || column >= columns.length) return null;
  const cells = columns[column].cells as any[];
  return layer < cells.length && isClip(cells[layer]) ? cells[layer] : null;
}

function layerSet(layer: i32, key: string, numbers: number[], strings: string[]): void {
  applyLayerCommand({ address: `/layer/${layer}/${key}`, numbers, strings });
}

function play(clip: any, layer: i32): void {
  if (typeof clip.fit === 'string') layerSet(layer, 'fit', [], [clip.fit as string]);
  if (typeof clip.loop === 'boolean') layerSet(layer, 'loop', [clip.loop as boolean ? 1 : 0], []);
  if (typeof clip.media === 'string' && clip.media !== '') {
    layerSet(layer, 'media', [], [clip.media as string]);
    return;
  }
  layerSet(layer, 'media', [], ['']);   // first: where the program plays media, an emptied layer goes back to a source
  if (Array.isArray(clip.color)) layerSet(layer, 'color', clip.color as number[], []);
  layerSet(layer, 'source', [], [clip.source as string]);
}

function playingList(): any[] {
  if (!Array.isArray(show.playing)) show.playing = [];
  const list = show.playing as any[];   // as i32[] would be a copy of its numbers
  while (list.length < mapping.layerCount()) list.push(-1);
  return list;
}

function emptyLayer(layer: i32): void {
  layerSet(layer, 'media', [], ['']);
  layerSet(layer, 'source', [], ['none']);
  playingList()[layer] = -1;
}

/** Plays one clip on its layer, the others go on. False when the cell is empty. */
export function fireCell(column: i32, layer: i32): boolean {
  const clip = clipAt(column, layer);
  if (clip === null || layer >= mapping.layerCount()) return false;
  play(clip, layer);
  playingList()[layer] = column;
  saveShow();
  return true;
}

export function stopLayer(layer: i32): void {
  if (layer < 0 || layer >= mapping.layerCount()) return;
  emptyLayer(layer);
  if (!playingList().includes(show.active)) show.active = -1;   // the last clip of the column on
  saveShow();
}

export function stopAll(): void {
  for (let layer: i32 = 0; layer < mapping.layerCount(); layer++) emptyLayer(layer);
  show.active = -1;
  saveShow();
}

/** Plays a whole column, as in Resolume: a layer with no clip in it is emptied, and a column with none stops everything. False when there is no such column. */
export function fireColumn(index: i32): boolean {
  if (index < 0 || index >= (show.columns as any[]).length) return false;
  if (!columnHasClips(index)) {
    stopAll();
    return true;
  }
  const list = playingList();
  for (let layer: i32 = 0; layer < mapping.layerCount(); layer++) {
    const clip = clipAt(index, layer);
    if (clip === null) {
      emptyLayer(layer);
    } else {
      play(clip, layer);
      list[layer] = index;
    }
  }
  show.active = index;
  saveShow();
  return true;
}

function columnHasClips(index: i32): boolean {
  for (let layer: i32 = 0; layer < mapping.layerCount(); layer++) {
    if (clipAt(index, layer) !== null) return true;
  }
  return false;
}

/** The next or previous column with clips, wrapping: what the remote's arrows do. */
export function stepColumn(delta: i32): void {
  const count: i32 = (show.columns as any[]).length;
  if (count === 0) return;
  let at: i32 = typeof show.active === 'number' ? show.active as i32 : -1;
  if (at < 0 && delta < 0) at = 0;
  for (let tries: i32 = 0; tries < count; tries++) {
    at = (at + delta + count) % count;
    if (columnHasClips(at)) {
      fireColumn(at);
      return;
    }
  }
}

/** What played, again: a show survives a restart. Nothing is emptied: a layer's own setting stays what was saved. */
export function resumeShow(): void {
  if (Array.isArray(show.playing)) {
    const list = show.playing as any[];
    for (let layer: i32 = 0; layer < list.length && layer < mapping.layerCount(); layer++) {
      const clip = clipAt(list[layer] as i32, layer);
      if (clip !== null) play(clip, layer);
    }
    return;
  }
  if (typeof show.active !== 'number') return;
  for (let layer: i32 = 0; layer < mapping.layerCount(); layer++) {
    const clip = clipAt(show.active as i32, layer);
    if (clip !== null) play(clip, layer);
  }
}

function moveEntry<T>(list: T[], from: i32, to: i32, empty: T): void {
  while (list.length <= from || list.length <= to) list.push(empty);
  const entry = list.splice(from, 1)[0];
  list.splice(to, 0, entry);
}

/** The clips belong to a layer by its place: they follow it. */
export function followLayerMove(from: i32, to: i32): void {
  for (const column of show.columns as any[]) moveEntry(column.cells as any[], from, to, null);
  moveEntry(playingList(), from, to, -1 as any);
  saveShow();
}

export function followLayerRemoval(layer: i32): void {
  for (const column of show.columns as any[]) {
    const cells = column.cells as any[];
    if (layer < cells.length) cells.splice(layer, 1);
  }
  const list = playingList();
  if (layer < list.length) list.splice(layer, 1);
  saveShow();
}
