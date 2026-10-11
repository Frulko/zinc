// What the editor keeps outside the projects, in its own directory: the list of the projects opened last.
import { createSignal } from 'zinc:ui/solid';
import * as fs from 'zinc:fs';
import { env } from 'zinc:sys';
import { dataDir } from 'zinc:system/window';

/** The editor's directory, made when missing; '' when nothing is kept. MUSEUM_EDITOR_DATA=dir chooses it (tests); a deterministic run that
 *  names none keeps nothing, so that it never reads what another run left. */
export function home(): string {
  const said = env('MUSEUM_EDITOR_DATA');
  if (said.length === 0 && env('ZINC_DETERMINISTIC') === '1') return '';
  const dir = said.length > 0 ? said : `${dataDir()}/museum-table-editor`;
  return fs.mkdir(dir, true) ? dir : '';
}

const RECENT = 10;
function readRecents(): string[] {
  if (home().length === 0) return [];
  try { return fs.readText(`${home()}/recent`).split('\n').filter((p: string) => p.length > 0); } catch (e) { return []; }
}
/** The projects opened or saved last, the latest first: File > Open recent. */
export const [recents, setRecents] = createSignal<string[]>(readRecents());
function keep(list: string[]): void {
  setRecents(list);
  if (home().length === 0) return;
  try { fs.writeText(`${home()}/recent`, list.length > 0 ? `${list.join('\n')}\n` : ''); } catch (e) {}   // a list that cannot be written is only not remembered
}
export function noteRecent(file: string): void { keep([file].concat(recents().filter((p: string) => p !== file)).slice(0, RECENT)); }
/** A project that is no longer where it was leaves the list. */
export function forgetRecent(file: string): void { if (recents().indexOf(file) >= 0) keep(recents().filter((p: string) => p !== file)); }
