// What the editor keeps outside the projects, in its own directory: the list of the projects opened last, and a backup of each project
// that has unsaved changes, which is offered again when the editor did not close properly.
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

// ---- backups

/** Where the backup of the project `file` is kept ('' for a project that was never saved; '' is returned when nothing is kept).
 *  ponytail: the name is the end of the path; two projects whose paths end in the same 150 characters would share a backup. */
function backupOf(file: string): string {
  if (home().length === 0) return '';
  const name = file.replaceAll('/', '_').replaceAll('\\', '_').replaceAll(':', '_');
  return `${home()}/backup-${name.length > 0 ? name.slice(Math.max(0, name.length - 150)) : 'untitled'}.json`;
}
/** Keeps `text`, the project as Save would write it, until the project is saved; false when it could not be written. */
export function writeBackup(file: string, text: string): boolean {
  const at = backupOf(file);
  if (at.length === 0) return false;
  try { fs.writeText(at, text); return true; } catch (e) { return false; }
}
/** The backup of a project, '' when there is none. */
export function readBackup(file: string): string {
  const at = backupOf(file);
  if (at.length === 0 || !fs.exists(at)) return '';
  try { return fs.readText(at); } catch (e) { return ''; }
}
export function dropBackup(file: string): void { const at = backupOf(file); if (at.length > 0 && fs.exists(at)) fs.remove(at); }
