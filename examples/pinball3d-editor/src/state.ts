// What the editor shows and does: the open table, the selection, the view, and the commands behind the buttons, the gestures and the
// keys. The views (topview.tsx, outline.tsx, form.tsx, main.tsx) read these signals and call these commands; the document itself is
// doc.ts. The advanced mode is a view over the same commands: nothing here knows about it.
import { createSignal, batch } from 'zinc:ui/solid';
import * as fs from 'zinc:fs';
import * as assets from 'zinc:assets';
import * as dialog from 'zinc:system/dialog';
import { Schema, Kind } from '../../pinball3d/src/format/schema';
import { TableDef, TableError, TABLE_FILE, formatSchema, filesOf, loadTable } from '../../pinball3d/src/format/table';
import { FolderSource, PackageSource, packTable, PACKAGE_EXT } from '../../pinball3d/src/format/source';
import { Doc, newTableText, isPlaced, canTurn, schemaAt, fieldAt, listOf, indexOf, pointsOf } from './doc';
import { Outline, outlines, levelsOf } from './shapes';
import { Preset, Start, LANE, palette, itemOf, pointsNeeded, rowsNeeded, laneOf, blankOf, alongWith, startOf } from './presets';
import { kindSaid, extrasOf, shownField, word, worded, ruleSaid } from './sentences';
import { scoreChange } from './scores';
import * as L from './strings';
import { t, f } from './strings';

// ---------------------------------------------------------------- the document

const [rev, setRev] = createSignal<i32>(0);
/** What a new table starts from: the editor's own starter (assets/new-table: a board, a plunger, the usual surfaces and looks, the
 *  light of the scene and the two screen layouts with their panel), so that a new table is at once a table the game shows whole. */
const STARTER = 'new-table/table.json';
function starter(): string { return assets.exists(STARTER) ? assets.readText(STARTER) : newTableText('New table'); }
let current = new Doc(starter(), '');
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
/** With --log on the command line: what is refused is also printed, as the events of the game played are. */
let echo = false;
export function setEcho(on: boolean): void { echo = on; }
/** Tells something in the status bar; `wrong`: as a refusal. */
export function say(message: string, wrong: boolean = false): void {
  if (echo && wrong) console.log(message);
  batch(() => { setStatus(message); setFailed(wrong); });
}
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

/** The point of the selection that was last pressed, as the row that holds it ("walls[2].points[1]", "ramps[0].profile[2]"):
 *  Delete takes that point away rather than the whole element. '' for none. */
export const [activeRow, setActiveRow] = createSignal<string>('');

export function select(path: string): void {
  current.seal();
  selectedId = path === '' ? '' : idAt(path);
  batch(() => { setSelected(path); setActiveRow(''); if (failed()) say(''); });   // a refusal is about what was selected then
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
  if (idAt(path) === selectedId && current.get(path) !== undefined) return;   // the same item, or one without a name at its place
  const again = selectedId === '' ? '' : current.find(list, selectedId);
  selectedId = again === '' ? '' : selectedId;
  setSelected(again);
}
/** The list a new item of a kind goes to ("rule", "step", "sound": the name the format gives the items of a list, with dashes for
 *  spaces): a list of the selection or of what the selection is in, the nearest first, else a list of the table itself. '' for none. */
function listFor(kind: string): string {
  const named = (sc: Schema, at: string): string => {
    for (const fd of sc.fields) if (fd.kind === Kind.List && fd.of !== null && (fd.of as Schema).name.replaceAll(' ', '-') === kind) return at === '' ? fd.name : `${at}.${fd.name}`;
    return '';
  };
  let at = selected();
  while (at !== '') {
    if (current.get(at) !== undefined) { const found = named(schemaAt(at), at); if (found !== '') return found; }
    // one step up: out of the item, then out of its list
    const cut = Math.max(at.lastIndexOf('.'), at.lastIndexOf('['));
    at = cut < 0 ? '' : at.slice(0, cut);
  }
  const root = formatSchema(), top = named(root, '');
  if (top !== '') return top;
  // the lists of the table's own objects: a rule and a mission are in `rules`
  for (const fd of root.fields) if (fd.kind === Kind.Obj && fd.of !== null) { const found = named(fd.of as Schema, fd.name); if (found !== '') return found; }
  return '';
}
/** Adds a new item to a list whose items have no place on the table (a sound, a rule, a step of a mission) and selects it. */
export function addTo(list: string): boolean {
  const fd = fieldAt(list);
  if (fd === null || fd.of === null) return false;
  const kind = (fd.of as Schema).name, item: any = blankOf(kind);
  wordAll(fd.of as Schema, item);
  let done = false;
  batch(() => { const path = current.add(list, item, 'Add', alongWith(kind)); done = report(path !== ''); if (done) select(path); });
  return done;
}
/** Writes the texts a new object shows a player from the sentences of what it holds (the step a new mission starts with). */
function wordAll(s: Schema, item: any): void {
  word(s, item);
  for (const fd of s.fields) {
    const inner: any = item[fd.name];
    if (fd.kind === Kind.List && fd.of !== null && Array.isArray(inner)) for (let i = 0; i < inner.length; i++) wordAll(fd.of as Schema, inner[i]);
  }
}
/** A new object of one kind for a list whose items have kinds (a condition, an action), or for the place of one: whole and valid
 *  in this table. When the table lacks what the kind speaks of, the status bar says what to add first. */
function startFor(of: Schema, kind: string): Start {
  const start = startOf(of, kind, (space: string): string[] => current.namesOf(space), (list: string): string[] => current.namesAmong(list), current.data);
  if (start.item === null) say(f(L.KIND_NEEDS, kindSaid(of.name, kind), start.lacks.split('|').map((sp: string) => L.fieldName(sp).toLowerCase()).join(', ')), true);
  return start;
}
/** Adds an object of one kind to a list whose items have kinds. The selection stays: the new object is edited where it is listed. */
export function addKind(list: string, kind: string): boolean {
  const fd = fieldAt(list);
  if (fd === null || fd.of === null) return false;
  const start = startFor(fd.of as Schema, kind);
  if (start.item === null) return false;
  word(fd.of as Schema, start.item);
  return report(current.add(list, start.item, 'Add', start.also) !== '');
}
/** Makes the object at a path one of another kind, whole and valid at once (its other parts are those of the new kind; what every
 *  kind reads stays: the light of a step, and its text when someone typed it). */
export function setKind(path: string, kind: string): boolean {
  const s = schemaAt(path), vs = s.variants;
  if (vs === null || current.get(`${path}.${vs.kind}`) === kind) return false;
  const start = startFor(s, kind), old: any = current.get(path);
  if (start.item === null) return false;
  for (const name of extrasOf(s)) start.item[name] = old[name];
  if (worded(s, old)) word(s, start.item);
  return report(current.put(path, start.item, start.also));
}
/** Takes one item out of a list, alone: refused when the table cannot do without it (the last action of a rule). */
export function removeItem(path: string): boolean {
  const done = report(current.remove(path, true));
  if (done) reselect();
  return done;
}
/** Moves an item of a list one place up or down. */
export function moveItem(path: string, by: i32): boolean { return report(current.reorder(path, by) !== ''); }
/** Moves the selected item one place up or down in its list. */
export function reorderSelected(by: i32): void {
  const path = selected();
  if (path === '' || listOf(path) === '') return;
  batch(() => { const now = current.reorder(path, by); if (report(now !== '')) { setSelected(now); selectedId = idAt(now); } });
}
/** Selects what a text names: a path as the file has it ("flippers[1]", "physics"), else the first thing of the table called so,
 *  in the order of the file. "+" and the key of an entry of the palette ("+wall", "+left-flipper") takes that entry instead: the
 *  next clicks place it. False, and the status bar says so, when the text names nothing. */
export function goTo(text: string): boolean {
  const want = text.trim();
  if (want === '') return false;
  if (want.startsWith('+')) {
    const key = want.slice(1);
    for (const e of ENTRIES) if (e.key === key) { if (e === LANE) addLane(); else pickTool(e); return true; }
    const list = listFor(key);
    if (list !== '') return addTo(list);
    say(f(L.NOT_FOUND, want), true);
    return false;
  }
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
// the view knows its size once it was drawn: a fit asked for when the layout changes waits for that
let fitIn: i32 = 2;
/** Shows the whole table once the view has been laid out and drawn again. */
export function fitSoon(): void { fitIn = 2; }
/** Once a frame. */
export function frameOfView(): void { if (fitIn > 0 && --fitIn === 0) fit(); }
/** Shows the whole table. */
export function fit(): void {
  const p = current.def.playfield, margin = 34;
  const z = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.floor(Math.min((viewW - 2 * margin) / p.width, (viewH - 2 * margin) / p.length) * 10) / 10));
  batch(() => { setZoom(z); setPanX(Math.round((viewW - p.width * z) / 2)); setPanY(Math.round((viewH - p.length * z) / 2)); });
}

// ---------------------------------------------------------------- the levels of the table

/** The level being worked on: the height of an upper playfield, 0 for the playfield, -1 for all of them at once. With one level
 *  chosen, what stands on the others is shown faintly and is not picked, a ball is dropped on that level and a new thing stands
 *  on it: two playfields one over the other are then two plans. */
export const [level, setLevel] = createSignal<number>(-1);
export function levels(): number[] { return levelsOf(table()); }
/** All the levels, then each one from the playfield up, then all again. */
export function nextLevel(): void {
  const all = levels(), at = all.indexOf(level());
  setLevel(at + 1 < all.length ? all[at + 1] : -1);
}
/** Whether a thing of the top view is on the level being worked on (what goes from a level to another is on all of them). */
export function onLevel(o: Outline): boolean { return level() < 0 || o.level < 0 || o.level === level(); }

// ---------------------------------------------------------------- drawing: the grid, the axis, what is being placed

/** The step points snap to, in centimetres; 0: they go where the pointer is (to a hundredth). */
export const GRIDS: number[] = [0.5, 1, 0.1, 0];
export const [grid, setGrid] = createSignal<number>(0.5);
/** The x of the table's axis of symmetry: what Mirror mirrors about, and a line points snap to. It is the middle between a left
 *  and a right flipper when the table has them (a plunger lane puts it off the middle of the board), else the middle of the board.
 *  ponytail: found again when a table is opened, not kept in its folder; the marker above the board moves it for the session. */
export const [axis, setAxis] = createSignal<number>(25.5);
function findAxis(): number {
  const tb = current.def;
  let left = -1, right = -1;
  for (const fl of tb.flippers) { if (fl.button === 'left' && left < 0) left = fl.pivot[0]; if (fl.button === 'right' && right < 0) right = fl.pivot[0]; }
  return left >= 0 && right >= 0 ? Math.round((left + right) * 50) / 100 : tb.playfield.width / 2;
}
/** A place of the top view brought to what is near it: a point of another thing, the axis, else the grid. `skip`: the path of
 *  the thing being drawn or changed, whose own points do not attract it; `free`: no snapping at all (Alt). */
export function snapped(x: number, y: number, skip: string, free: boolean): number[] {
  const round = (v: number): number => Math.round(v * 100) / 100;
  if (free) return [round(x), round(y)];
  const reach = 6 / zoom(), root = formatSchema();
  for (const o of placed()) {
    if (o.path === skip || x < o.x0 - reach || x > o.x1 + reach || y < o.y0 - reach || y > o.y1 + reach) continue;
    const fd = root.field(listOf(o.path) === '' ? o.path : listOf(o.path));
    if (fd === null || fd.of === null) continue;
    for (const p of pointsOf(fd.of as Schema, current.get(o.path))) { const px: number = p[0], py: number = p[1]; if (Math.abs(px - x) < reach && Math.abs(py - y) < reach) return [px, py]; }
  }
  const g = grid();
  let sx = g > 0 ? Math.round(x / g) * g : x;
  if (Math.abs(x - axis()) < reach) sx = axis();
  return [round(sx), round(g > 0 ? Math.round(y / g) * g : y)];
}

/** The palette: what can be added, for the lists of the format whose items have a place. */
export const ENTRIES: Preset[] = palette(PLACED_LISTS);
/** What the next clicks on the top view place (an entry of the palette); null: clicks select. */
export const [tool, setTool] = createSignal<Preset | null>(null);
/** The places clicked so far for it. */
export const [clicks, setClicks] = createSignal<number[][]>([]);
export function pickTool(p: Preset | null): void {
  current.seal();
  batch(() => { setTool(p); setClicks([]); if (p !== null) { setSelected(''); setActiveRow(''); selectedId = ''; } });
}
/** One more place for what is being placed. An element without a path is added at its last point. */
export function placeAt(x: number, y: number): void {
  const p = tool();
  if (p === null) return;
  const got = clicks(), n: i32 = got.length;
  if (n > 0 && got[n - 1][0] === x && got[n - 1][1] === y) return;   // the second press of a double click
  const next = got.slice();
  next.push([x, y]);
  setClicks(next);
  if (rowsNeeded(p.list) === 0 && next.length >= pointsNeeded(p.list)) finishPlacing();
}
/** Takes back the last place clicked. */
export function unplace(): void { const got = clicks(); if (got.length > 0) setClicks(got.slice(0, got.length - 1)); }
/** Ends a path: the element is added when it has the points its kind needs; with fewer, it waits for more. */
export function finishPlacing(): void {
  const p = tool(), got = clicks();
  if (p === null || got.length < pointsNeeded(p.list) + rowsNeeded(p.list)) return;
  const entry: Preset = p, item: any = itemOf(entry, got), fd = formatSchema().field(entry.list);
  // a new thing stands on the level being worked on: the field of its kind that the format gives the role of a level
  if (level() > 0 && fd !== null && fd.of !== null) for (const own of (fd.of as Schema).fields) if (own.role === 'level') item[own.name] = level();
  batch(() => {
    const path = current.add(entry.list, item);
    setTool(null); setClicks([]);
    if (report(path !== '')) select(path);
  });
}
/** The plunger lane along the right side of the board, in one step: its wall, the gate at its top, the plunger at its bottom. */
export function addLane(): void {
  const tb = current.def, parts = laneOf(tb.playfield.width, tb.playfield.length, tb.physics.ball.radius);
  const wall: any = parts[0], gate: any = parts[1];
  wall.id = current.freeId('walls', 'shooterLane'); gate.id = current.freeId('gates', 'laneGate');
  if (current.find('walls', 'shooterLane') === '') wall.id = 'shooterLane';
  if (current.find('gates', 'laneGate') === '') gate.id = 'laneGate';
  batch(() => {
    const done = current.edit(`Add ${wall.id}`, (d: any) => {
      const walls: any[] = [], gates: any[] = [];
      for (let i = 0; i < d.walls.length; i++) walls.push(d.walls[i]);
      for (let i = 0; i < d.gates.length; i++) gates.push(d.gates[i]);
      walls.push(wall); gates.push(gate);
      d.walls = walls; d.gates = gates; d.plunger.at = parts[2];
    });
    setTool(null); setClicks([]);
    if (report(done)) select(current.find('walls', `${wall.id}`));
  });
}

// ---------------------------------------------------------------- commands

/** Tells what the last operation of the document did, or why it was refused. */
function report(done: boolean): boolean {
  if (done) say(f(L.DONE, L.step(current.undoLabel)));
  else if (current.refused !== '') { say(f(L.REFUSED, current.refused), true); refresh(); }   // the field shows the table's value again
  return done;
}
/** Gives a screen layout ('landscape', 'portrait') the eye that looks at the table from `position` towards `target`: one step. */
export function setCamera(layout: string, position: number[], target: number[]): boolean {
  return report(current.edit(`Change layouts.${layout}.camera`, (d: any) => { d.layouts[layout].camera.position = position; d.layouts[layout].camera.target = target; }));
}
/** Gives a cell of the scores grid its points (scores.ts): what `on` scores at `event` whatever else holds; 0 for nothing. */
export function setScore(on: string, event: string, points: number): boolean { return report(current.edit(`Change ${on}.${event}`, scoreChange(on, event, points))); }
/** Sets a field of the table (the generated forms, the advanced numbers). The text an object shows a player, while it is the
 *  editor's (sentences.ts worded), follows the part that changes, in the same step: "Hit pops" becomes "Hit pops 3 times". */
export function setField(path: string, value: any): boolean {
  const cut = path.lastIndexOf('.'), owner = cut < 0 ? '' : path.slice(0, cut), name = path.slice(cut + 1), old: any = owner === '' ? undefined : current.get(owner);
  if (old !== undefined && old !== null && typeof old === 'object' && !Array.isArray(old) && name.indexOf('[') < 0) {
    const s = schemaAt(owner);
    if (shownField(s) !== '' && name !== shownField(s) && worded(s, old)) {
      const next: any = JSON.parse(JSON.stringify(old));
      next[name] = value;
      word(s, next);
      return report(current.put(owner, next, null));
    }
  }
  return report(current.set(path, value));
}
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
/** A handle being dragged: the row follows the pointer, and the whole drag is one step for undo. Nothing is said of a place the
 *  format refuses on the way (two points at the same place): the handle just does not go there. */
export function dragRow(path: string, value: any): void { if (current.set(path, value, true)) say(f(L.DONE, L.step(current.undoLabel))); }
/** The rows of a path or of a profile with one more at place `at`, or with row `at` taken away (`row` null). */
export function changeRows(path: string, at: i32, row: number[] | null): boolean {
  const old: any = current.get(path), rows: number[][] = [];
  for (let i = 0; i <= old.length; i++) {
    if (i === at && row !== null) rows.push(row);
    if (i < old.length && !(i === at && row === null)) { const copy: number[] = []; for (let k = 0; k < old[i].length; k++) copy.push(old[i][k]); rows.push(copy); }
  }
  return report(current.set(path, rows));
}
/** Takes the active point away from its path or its profile. */
export function removeActiveRow(): void {
  const row = activeRow();
  if (row === '') return;
  batch(() => { changeRows(listOf(row), indexOf(row), null); setActiveRow(''); });
}
/** A copy of the selection beside it, selected. */
export function duplicateSelected(): void {
  const path = selected();
  if (path === '' || listOf(path) === '') return;
  batch(() => { const copy = current.duplicate(path, 2, 2); if (report(copy !== '')) select(copy); });
}
/** The mirror image of the selection about the table's axis, added and selected. */
export function mirrorSelected(): void {
  const path = selected();
  if (path === '' || listOf(path) === '' || !selectionPlaced()) return;
  batch(() => { const copy = current.mirror(path, axis()); if (report(copy !== '')) select(copy); });
}
/** What the deletion that waits for an answer would take with it, a line each (main.tsx asks while there is one). */
export const [doomed, setDoomed] = createSignal<string[]>([]);
/** Deletes the selected item of a list. When rules or missions cannot do without it and would go with it, they are said first and
 *  the deletion waits for an answer (answerDelete); a name that only pointed to it is cleared without a question. */
export function deleteSelected(): void {
  const path = selected();
  if (path === '' || listOf(path) === '') return;
  const lines: string[] = [];
  if (current.wouldRemove(path)) {
    // in the order of the file
    const order: i32[] = [];
    for (let i = 0; i < current.went.length; i++) if (indexOf(current.went[i]) >= 0) order.push(i);
    order.sort((a: i32, b: i32): number => { const p = current.went[a], q = current.went[b]; return listOf(p) === listOf(q) ? indexOf(p) - indexOf(q) : p < q ? -1 : 1; });
    for (const i of order) { const s = schemaAt(current.went[i]), told = ruleSaid(s, current.lost[i]); lines.push(`${L.kindName(s.name)} ${indexOf(current.went[i]) + 1}: ${told}`); }
  }
  if (lines.length > 0) setDoomed(lines); else deleteNow();
}
/** The answer to that question: delete it with what goes with it, or leave everything. */
export function answerDelete(yes: boolean): void { setDoomed([]); if (yes) deleteNow(); }
/** Deletes the selected item of a list, with what cannot do without it (the status bar says how much went). */
function deleteNow(): void {
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
  batch(() => { selectedId = ''; setSelected(''); setActiveRow(''); setHovered(''); setTool(null); setClicks([]); setLevel(-1); setAxis(findAxis()); setFolder(dir); say(message); refresh(); });
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
function parentOf(path: string): string { return path.slice(0, path.lastIndexOf('/')); }
/** Opens a package. It is read whole first: one that was altered after it was made, or that lacks a file its table names, is
 *  refused by the name of the file and nothing is written. A table is worked on in a folder: the package is unpacked into a new
 *  one beside it (its name, then "name 2", "name 3": never over a folder that is there), and that folder is opened. */
export function openPackage(file: string): boolean {
  const name = nameOfFolder(file);
  let src: PackageSource;
  try {
    src = new PackageSource(file, name);
    loadTable(src);
  } catch (e) {
    const why = e instanceof TableError ? (e as TableError).errors.join('; ') : `${(e as Error).message}`;
    say(f(L.CANNOT_OPEN, name, why.startsWith(`${name}: `) ? why.slice(name.length + 2) : why), true);
    return false;
  }
  const base = file.slice(0, file.length - PACKAGE_EXT.length);
  let dir = base;
  for (let n = 2; fs.exists(dir); n++) dir = `${base} ${n}`;
  try {
    for (const entry of src.names) {
      fs.mkdir(parentOf(`${dir}/${entry}`), true);
      fs.writeBytes(`${dir}/${entry}`, src.bytes(entry));
    }
  } catch (e) {
    say(f(L.CANNOT_OPEN, name, `${(e as Error).message}`), true);
    return false;
  }
  if (!openFolder(dir)) return false;
  say(f(L.DONE_UNPACKED, name, nameOfFolder(dir)));
  return true;
}
/** A new table that Save will write in `dir` ('' to ask where). */
export function newTable(dir: string): void { show(new Doc(starter(), ''), dir, t(L.DONE_NEW)); }

function write(dir: string): boolean {
  try {
    if (!fs.exists(dir)) fs.mkdir(dir, true);
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
/** The table and the files it names written in another folder, which becomes the table's folder. A folder that holds another
 *  table is refused: nothing is ever written over a table. */
export async function saveAs(): Promise<boolean> {
  current.seal();
  const o = new dialog.OpenOptions();
  o.title = t(L.SAVE_AS_TITLE);
  o.directory = true;
  const dirs = await dialog.open(o);
  if (dirs === null || dirs.length === 0) { say(t(L.NOT_SAVED)); return false; }
  const from = folder(), to = dirs[0];
  if (to === from) return write(to);
  if (fs.exists(`${to}/${TABLE_FILE}`)) { say(f(L.FOLDER_TAKEN, nameOfFolder(to)), true); return false; }
  try {
    if (from.length > 0) for (const name of filesOf(current.def)) {
      if (!fs.exists(`${from}/${name}`)) continue;
      fs.mkdir(parentOf(`${to}/${name}`), true);
      fs.copyFile(`${from}/${name}`, `${to}/${name}`);
    }
  } catch (e) {
    say(f(L.CANNOT_SAVE, nameOfFolder(to), `${(e as Error).message}`), true);
    return false;
  }
  return write(to);
}
/** The table as one file to share: its table.json and every file it names (sounds, images, models), in the game's package format.
 *  The table is saved first (the package holds what is on disk); a file the table names and its folder lacks is said by its name. */
export async function exportPackage(): Promise<boolean> {
  if (!(await save())) return false;
  const o = new dialog.SaveOptions();
  o.title = t(L.EXPORT_TITLE);
  o.defaultPath = `${folder()}${PACKAGE_EXT}`;
  o.filters = [new dialog.Filter(t(L.PACKAGE_KIND), [PACKAGE_EXT.slice(1)])];
  const picked = await dialog.save(o);
  if (picked === null) { say(t(L.NOT_SAVED)); return false; }
  const file = picked.endsWith(PACKAGE_EXT) ? picked : `${picked}${PACKAGE_EXT}`;
  try {
    const files: string[] = [TABLE_FILE];
    for (const name of filesOf(current.def)) files.push(name);
    packTable(new FolderSource(folder()), files, file);
  } catch (e) {
    say(f(L.CANNOT_SAVE, nameOfFolder(file), `${(e as Error).message}`), true);
    return false;
  }
  say(f(L.DONE_EXPORTED, nameOfFolder(file), `${filesOf(current.def).length}`));
  return true;
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
export function openPackageCommand(): void {
  guard(() => {
    const o = new dialog.OpenOptions();
    o.title = t(L.OPEN_PACKAGE_TITLE);
    o.filters = [new dialog.Filter(t(L.PACKAGE_KIND), [PACKAGE_EXT.slice(1)])];
    dialog.open(o).then((files: string[] | null) => { if (files !== null && files.length > 0) openPackage(files[0]); else say(t(L.NOTHING_OPENED)); });
  });
}
