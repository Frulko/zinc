// The show: columns of media, one cell per layer, as in Resolume. Firing a column plays each of its cells on its layer. The page owns the file's
// other fields (the surfaces' real sizes, the lens); this service keeps them untouched.
import * as fs from 'zinc:fs';
import { SHOW_FILE } from '../constants';
import { applyLayerCommand, LayerCommand } from './layerCommands';

let show: any = { columns: [], active: -1 };

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

/** Replaces the show with what the page sent; the error to show it, '' when accepted. */
export function replaceShow(json: string): string {
  let next: any = null;
  try {
    next = JSON.parse(json);
  } catch (e) {
    return 'not JSON';
  }
  if (next === null || !Array.isArray(next.columns)) return 'expected {"columns": [...]}';
  show = next;
  saveShow();
  return '';
}

function cellCommands(cell: any, layer: i32): LayerCommand[] {
  const prefix = `/layer/${layer}`;
  const commands: LayerCommand[] = [];
  if (typeof cell.fit === 'string') commands.push({ address: `${prefix}/fit`, numbers: [], strings: [cell.fit as string] });
  if (typeof cell.volume === 'number') commands.push({ address: `${prefix}/volume`, numbers: [cell.volume as number], strings: [] });
  commands.push({ address: `${prefix}/media`, numbers: [], strings: [typeof cell.media === 'string' ? cell.media as string : ''] });
  return commands;
}

/** Plays column `index` on the layers; a cell with no media empties its layer. False when there is no such column. */
export function fireColumn(index: i32): boolean {
  const columns = show.columns as any[];
  if (index < 0 || index >= columns.length) return false;
  const cells = columns[index].cells as any[];
  for (let layer: i32 = 0; layer < cells.length; layer++) {
    if (cells[layer] === null) continue;
    for (const command of cellCommands(cells[layer], layer)) applyLayerCommand(command);
  }
  show.active = index;
  saveShow();
  return true;
}

/** The next or previous column, wrapping: what the remote's arrows do. */
export function stepColumn(delta: i32): void {
  const count: i32 = (show.columns as any[]).length;
  if (count === 0) return;
  const active: i32 = typeof show.active === 'number' ? show.active as i32 : -1;
  fireColumn((active + delta + count) % count);
}

/** The column that played last, again: a show survives a restart. */
export function resumeShow(): void {
  if (typeof show.active === 'number') fireColumn(show.active as i32);
}
