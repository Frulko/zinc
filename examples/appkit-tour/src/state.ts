// The browser's state: the files, the place picked in the sidebar, the search, the sort and the selection, and the actions that change them.
// The table shows `visible()`; the selection is kept as file ids, so a sort or a search keeps the same files selected.
import { createSignal, createMemo } from 'zinc:ui/solid';
import { FileEntry, makeFiles } from './services/files';
import { RECENTS, TRASH } from './places';

export const FILE_COUNT: i32 = 10000;

const [files, setFiles] = createSignal<FileEntry[]>(makeFiles(FILE_COUNT));
const [place, setPlace] = createSignal<string>(RECENTS);
const [query, setQuery] = createSignal<string>('');
const [sortKey, setSortKey] = createSignal<string>('name');
const [ascending, setAscending] = createSignal<boolean>(true);
const [selectedIds, setSelectedIds] = createSignal<i32[]>([]);
export { place, query, selectedIds };

/** Whether file f shows in place `at` under the search `q` (lower case). */
function shows(f: FileEntry, at: string, q: string): boolean {
  const inPlace = at === TRASH ? f.folder === TRASH : f.folder !== TRASH && (at === RECENTS || f.folder === at);
  return inPlace && (q === '' || f.name.toLowerCase().includes(q));
}
function compare(a: FileEntry, b: FileEntry, key: string): number {
  if (key === 'size') return a.sizeKb - b.sizeKb;
  const x = key === 'modified' ? a.modified : key === 'kind' ? a.kind : a.name.toLowerCase();
  const y = key === 'modified' ? b.modified : key === 'kind' ? b.kind : b.name.toLowerCase();
  if (x !== y) return x < y ? -1 : 1;
  return a.id - b.id;   // a stable order for equal keys
}

/** The rows of the table: the files of the place that match the search, sorted. */
export const visible = createMemo<FileEntry[]>(() => {
  const at = place(), q = query().toLowerCase(), key = sortKey(), up = ascending();
  const out = files().filter((f: FileEntry) => shows(f, at, q));
  out.sort((a: FileEntry, b: FileEntry) => up ? compare(a, b, key) : compare(b, a, key));
  return out;
}, []);

/** The rows of the selected files in `visible()`. */
export const selectedRows = createMemo<i32[]>(() => {
  const ids = new Set<i32>(selectedIds()), rows: i32[] = [];
  if (ids.size === 0) return rows;
  const shown = visible();
  for (let r: i32 = 0; r < shown.length; r++) if (ids.has(shown[r].id)) rows.push(r);
  return rows;
}, []);

/** The file the inspector edits: the first one selected, null when nothing is. */
export const inspected = createMemo<FileEntry | null>(() => {
  const ids = selectedIds();
  if (ids.length === 0) return null;
  for (const f of files()) if (f.id === ids[0]) return f;
  return null;
}, null);

export function openPlace(id: string): void { setPlace(id); setSelectedIds([]); }
/** Filters by name; the selected files the search hides are unselected, so the inspector and Move to Trash never act on a file out of sight. */
export function search(text: string): void {
  setQuery(text);
  const ids = new Set<i32>(selectedIds()), at = place(), q = text.toLowerCase(), kept: i32[] = [];   // not visible(): an event batch updates it later
  for (const f of files()) if (ids.has(f.id) && shows(f, at, q)) kept.push(f.id);
  setSelectedIds(kept);
}
export function sortBy(key: string, up: boolean): void { setSortKey(key); setAscending(up); }
export function selectRows(rows: i32[]): void {
  const shown = visible(), ids: i32[] = [];
  for (const r of rows) if (r >= 0 && r < shown.length) ids.push(shown[r].id);
  setSelectedIds(ids);
}

/** Saves the inspector's fields into the file. */
export function saveFile(id: i32, name: string, locked: boolean, tag: string, rating: number, modified: string): void {
  for (const f of files()) if (f.id === id) { f.name = name; f.locked = locked; f.tag = tag; f.rating = rating; f.modified = modified; }
  setFiles(files().slice());
}
/** Moves the selected files to the Trash, the locked ones excepted; returns how many moved. */
export function trashSelected(): i32 {
  const ids = new Set<i32>(selectedIds());
  let moved: i32 = 0;
  for (const f of files()) if (ids.has(f.id) && !f.locked && f.folder !== TRASH) { f.folder = TRASH; moved++; }
  setSelectedIds([]);
  setFiles(files().slice());
  return moved;
}
/** Adds a folder named `name` to the current place (Documents from Recents or the Trash) and selects it when it shows. */
export function addFolder(name: string): void {
  const all = files(), at = place();
  const folder = new FileEntry(all.length, name, at === RECENTS || at === TRASH ? 'documents' : at, 'Folder', 0, '2026-11-09');
  setFiles(all.concat([folder]));
  setSelectedIds(shows(folder, at, query().toLowerCase()) ? [folder.id] : []);   // a search that hides it leaves nothing selected
}
