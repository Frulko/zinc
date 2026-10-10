// What the editor shows and does: the open table, the selection, the view, and the commands behind the buttons, the gestures and the
// keys. The views (topview.tsx, outline.tsx, form.tsx, main.tsx) read these signals and call these commands; the document itself is
// doc.ts. The advanced mode is a view over the same commands: nothing here knows about it.
import { createSignal, batch } from 'zinc:ui/solid';
import * as fs from 'zinc:fs';
import * as dialog from 'zinc:system/dialog';
import { Schema, Kind } from '../../pinball3d/src/format/schema';
import { TableDef, TableError, TABLE_FILE, formatSchema } from '../../pinball3d/src/format/table';
import { Doc, newTableText, isPlaced, canTurn, schemaAt, fieldAt, listOf } from './doc';
import { Outline, outlines } from './shapes';
import * as L from './strings';
import { t, f } from './strings';

// ---------------------------------------------------------------- the document

const [rev, setRev] = createSignal<i32>(0);
let current = new Doc(newTableText('New table'), '');
function watch(d: Doc): void { d.onChange = () => { shapes = null; setRev(rev() + 1); }; }
watch(current);

/** The open document. Reading it inside a view subscribes the view to every edit, undo and load. */
export function doc(): Doc { rev(); return current; }
export function table(): TableDef { rev(); return current.def; }
/** Redraws what reads the document although it did not change (a field shows the document's value again). */
export function refresh(): void { setRev(rev() + 1); }

/** The folder of the table being edited ('' until it is saved once): table.json and the files it names. */
export const [folder, setFolder] = createSignal<string>('');
/** What the last command did, in the status bar; `failed`: it was refused. */
export const [status, setStatus] = createSignal<string>('');
export const [failed, setFailed] = createSignal<boolean>(false);
function say(message: string, wrong: boolean = false): void { batch(() => { setStatus(message); setFailed(wrong); }); }
/** The advanced mode: the keys of the file, exact numbers everywhere, the selection as the file has it. */
export const [advanced, setAdvanced] = createSignal<boolean>(false);

// ---------------------------------------------------------------- what the format places on the table

/** The lists of the table whose items have a place in the top view, and its objects that have one: read from the schema once. */
export const PLACED_LISTS: string[] = [], PLACED_OBJECTS: string[] = [], OTHER_LISTS: string[] = [], OTHER_OBJECTS: string[] = [];
for (const fd of formatSchema().fields) {
  if (fd.of === null) continue;
  const of = fd.of as Schema;
  if (fd.kind === Kind.List) { if (isPlaced(of)) PLACED_LISTS.push(fd.name); else OTHER_LISTS.push(fd.name); }
  else if (isPlaced(of)) PLACED_OBJECTS.push(fd.name); else OTHER_OBJECTS.push(fd.name);
}

let shapes: Outline[] | null = null;
/** Everything placed on the table as the top view shows it; made again when the table changes. */
export function placed(): Outline[] {
  rev();
  if (shapes === null) shapes = outlines(current.def, current.data, formatSchema(), PLACED_LISTS, PLACED_OBJECTS);
  return shapes as Outline[];
}
export function outlineOf(path: string): Outline | null {
  for (const o of placed()) if (o.path === path) return o;
  return null;
}

// ---------------------------------------------------------------- the selection

/** The path of what is selected: "bumpers[0]", "plunger", "looks[3]", "physics"; '' for the table itself. */
export const [selected, setSelected] = createSignal<string>('');
/** The element under the pointer in the top view. */
export const [hovered, setHovered] = createSignal<string>('');
// the id of the selected item, to find it again when undo or a deletion moved it in its list
let selectedId = '';

export function select(path: string): void {
  current.seal();
  selectedId = path === '' ? '' : idAt(path);
  batch(() => { setSelected(path); if (failed()) say(''); });   // a refusal is about what was selected then
}
function idAt(path: string): string {
  const v: any = current.get(path);
  return v !== undefined && v !== null && typeof v.id === 'string' ? `${v.id}` : '';
}
/** After the table changed under the selection: the same item, wherever it is now, or nothing. */
function reselect(): void {
  const path = selected();
  if (path === '') return;
  const list = listOf(path);
  if (list === '') { if (current.get(path) === undefined) setSelected(''); return; }
  if (selectedId !== '' && idAt(path) === selectedId) return;
  const again = selectedId === '' ? '' : current.find(list, selectedId);
  selectedId = again === '' ? '' : selectedId;
  setSelected(again);
}
/** Selects what a text names: a path as the file has it ("flippers[1]", "physics"), else the first thing of the table called so,
 *  in the order of the file. False, and the status bar says so, when nothing is. */
export function goTo(text: string): boolean {
  const want = text.trim();
  if (want === '') return false;
  const v: any = fieldAt(want) === null ? undefined : current.get(want);
  let path = v !== undefined && v !== null && typeof v === 'object' && !Array.isArray(v) ? want : '';
  if (path === '') for (const fd of formatSchema().fields) if (path === '' && fd.kind === Kind.List) path = current.find(fd.name, want);
  if (path === '') { say(f(L.NOT_FOUND, want), true); return false; }
  batch(() => { select(path); say(f(L.SELECTED, current.nameOf(path))); });
  return true;
}
/** Whether the selection has a place in the top view, and whether turning it changes it. */
export function selectionPlaced(): boolean { const p = selected(); return p !== '' && current.get(p) !== undefined && isPlaced(schemaAt(p)); }
export function selectionTurns(): boolean { return selectionPlaced() && canTurn(schemaAt(selected())); }

// ---------------------------------------------------------------- the view

/** Pixels per centimetre, and where the table's corner (0, 0) is in the view. */
export const [zoom, setZoom] = createSignal<number>(7);
export const [panX, setPanX] = createSignal<number>(40);
export const [panY, setPanY] = createSignal<number>(40);
/** The size of the top view on screen, set by the view when it is drawn. */
export let viewW: number = 800, viewH: number = 760;
export function setViewSize(w: number, h: number): void { viewW = w; viewH = h; }
const ZOOM_MIN = 2, ZOOM_MAX = 60;

/** Zooms by a factor, keeping the table point under (x, y) of the view where it is. */
export function zoomBy(factor: number, x: number, y: number): void {
  const z = zoom(), z2 = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.round(z * factor * 100) / 100));
  if (z2 === z) return;
  const wx = (x - panX()) / z, wy = (y - panY()) / z;
  batch(() => { setZoom(z2); setPanX(Math.round(x - wx * z2)); setPanY(Math.round(y - wy * z2)); });
}
/** Shows the whole table. */
export function fit(): void {
  const p = current.def.playfield, margin = 34;
  const z = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.floor(Math.min((viewW - 2 * margin) / p.width, (viewH - 2 * margin) / p.length) * 10) / 10));
  batch(() => { setZoom(z); setPanX(Math.round((viewW - p.width * z) / 2)); setPanY(Math.round((viewH - p.length * z) / 2)); });
}

// ---------------------------------------------------------------- commands

/** Tells what the last operation of the document did, or why it was refused. */
function report(done: boolean): boolean {
  if (done) say(f(L.DONE, L.step(current.undoLabel)));
  else if (current.refused !== '') { say(f(L.REFUSED, current.refused), true); refresh(); }   // the field shows the table's value again
  return done;
}
/** Sets a field of the table (the generated forms, the advanced numbers). */
export function setField(path: string, value: any): boolean { return report(current.set(path, value)); }
/** Replaces the selection by its text as the file has it, edited. */
export function replaceSelected(json: string): boolean {
  const path = selected();
  if (path === '' || json === current.jsonOf(path)) return false;
  const done = report(current.replace(path, json));
  if (done) selectedId = idAt(path);
  return done;
}
export function moveSelected(dx: number, dy: number): void { if (selectionPlaced()) report(current.move(selected(), dx, dy)); }
export function turnSelected(degrees: number): void { if (selectionTurns()) report(current.turn(selected(), degrees)); }
/** Deletes the selected item of a list, with what cannot do without it (the status bar says how much went). */
export function deleteSelected(): void {
  const path = selected();
  if (path === '' || listOf(path) === '') return;
  batch(() => {
    const done = current.remove(path);
    if (!done) { report(false); return; }
    const n: i32 = current.went.length;
    say(n === 0 ? f(L.DONE, L.step(current.undoLabel)) : f(L.DONE_DELETED_WITH, L.step(current.undoLabel), n === 1 ? t(L.ONE_OTHER) : f(L.N_OTHERS, `${n}`)));
    selectedId = '';
    setSelected('');
    setHovered('');
  });
}
export function undo(): void {
  batch(() => { const label = current.undo(); if (label !== '') { say(f(L.DONE_UNDONE, L.step(label))); reselect(); } });
}
export function redo(): void {
  batch(() => { const label = current.redo(); if (label !== '') { say(f(L.DONE_REDONE, L.step(label))); reselect(); } });
}

// ---------------------------------------------------------------- files

/** What to do once unsaved work is saved or given up (see `guard`); null when nothing waits. */
export const [waiting, setWaiting] = createSignal<(() => void) | null>(null);

function show(d: Doc, dir: string, message: string): void {
  current = d;
  shapes = null;
  watch(d);
  batch(() => { selectedId = ''; setSelected(''); setHovered(''); setFolder(dir); say(message); refresh(); });
  fit();
}
function nameOfFolder(dir: string): string { return dir.slice(dir.lastIndexOf('/') + 1); }
/** Opens a table: its folder, or the table.json in it. A file the game would refuse is reported with every fault and the open table stays. */
export function openFolder(path: string): boolean {
  const dir = path.endsWith(`/${TABLE_FILE}`) ? path.slice(0, path.length - TABLE_FILE.length - 1) : path.endsWith('/') ? path.slice(0, path.length - 1) : path;
  try {
    const text = fs.readText(`${dir}/${TABLE_FILE}`);
    const d = new Doc(text, text);
    show(d, dir, f(d.dirty ? L.DONE_NOT_CANONICAL : L.DONE_OPENED, nameOfFolder(dir)));
    return true;
  } catch (e) {
    say(f(L.CANNOT_OPEN, nameOfFolder(dir), e instanceof TableError ? (e as TableError).errors.join('; ') : `${(e as Error).message}`), true);
    return false;
  }
}
/** A new table that Save will write in `dir` ('' to ask where). */
export function newTable(dir: string): void { show(new Doc(newTableText('New table'), ''), dir, t(L.DONE_NEW)); }

function write(dir: string): boolean {
  try {
    if (!fs.exists(dir)) fs.mkdir(dir);
    fs.writeText(`${dir}/${TABLE_FILE}`, current.text());
  } catch (e) {
    say(f(L.CANNOT_SAVE, nameOfFolder(dir), `${(e as Error).message}`), true);
    return false;
  }
  current.markSaved();
  batch(() => { setFolder(dir); say(f(L.DONE_SAVED, `${nameOfFolder(dir)}/${TABLE_FILE}`)); refresh(); });
  return true;
}
export async function save(): Promise<boolean> {
  current.seal();
  if (folder().length > 0) return write(folder());
  const o = new dialog.OpenOptions();
  o.title = t(L.SAVE_TITLE);
  o.directory = true;
  const dirs = await dialog.open(o);
  if (dirs === null || dirs.length === 0) { say(t(L.NOT_SAVED)); return false; }
  return write(dirs[0]);
}
/** Runs `then` now when nothing is unsaved; otherwise asks first (main.tsx shows the question while `waiting` is set). */
export function guard(then: () => void): void {
  if (current.dirty) setWaiting(then); else then();
}
/** The answers to that question: save and go on, go on without saving, or stay. */
export async function answer(choice: string): Promise<void> {
  const then = waiting();
  setWaiting(null);
  if (then === null || choice === 'stay') return;
  const go: () => void = then;
  if (choice === 'save' && !(await save())) return;
  go();
}
export function newCommand(): void { guard(() => newTable('')); }
export function openCommand(): void {
  guard(() => {
    const o = new dialog.OpenOptions();
    o.title = t(L.OPEN_TITLE);
    o.directory = true;
    dialog.open(o).then((dirs: string[] | null) => { if (dirs !== null && dirs.length > 0) openFolder(dirs[0]); else say(t(L.NOTHING_OPENED)); });
  });
}
