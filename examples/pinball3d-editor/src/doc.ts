// The document of the table editor: the table being edited, what is on disk, and every edit as one step that undo takes back.
// Pure code (no screen, no file system): the views call these operations and draw `data`; selftest.ts runs them without a window.
//
// The editor knows no element kind here. A table is the tree the format describes (../../pinball3d/src/format), and every operation is
// said with a path as the loader writes it in its messages ("flippers[1].speed", "walls[2]", "plunger"): set a field, move or turn an
// element, delete or add an item of a list. What an operation means for a field comes from the schema, so a field or an element kind
// added to the format is edited without a line here.
//
// Every operation leaves a table the game accepts: the changed tree goes through the format's own check before it replaces the
// document. A change the check refuses is not made, and `refused` holds the loader's message, which names the field. Two operations
// mend what they break before giving up: renaming something renames it wherever it is named, and deleting something clears the
// optional names that pointed to it and deletes the rules and missions that cannot do without it (`went` says which).
import { Schema, Field, Kind, write } from '../../pinball3d/src/format/schema';
import { TableDef, TableError, formatSchema, parseTable } from '../../pinball3d/src/format/table';
import { FORMAT, VERSION } from '../../pinball3d/src/format/table-schema';

// ---------------------------------------------------------------- paths

/** The steps of a path: "walls[2].points" gives walls, 2, points. */
export function steps(path: string): string[] {
  const out: string[] = [];
  let word = '';
  for (let i = 0; i < path.length; i++) {
    const c = path.charAt(i);
    if (c === '.' || c === '[' || c === ']') { if (word.length > 0) out.push(word); word = ''; } else word += c;
  }
  if (word.length > 0) out.push(word);
  return out;
}
function isIndex(step: string): boolean { const c = step.charCodeAt(0); return c >= 48 && c <= 57; }
/** The path of steps: the inverse of steps(). */
export function pathOf(parts: string[]): string {
  let out = '';
  for (const p of parts) out += isIndex(p) ? `[${p}]` : out.length > 0 ? `.${p}` : p;
  return out;
}
/** "walls[2]" gives "walls"; "plunger" gives "". */
export function listOf(path: string): string { const s = steps(path); return s.length > 0 && isIndex(s[s.length - 1]) ? pathOf(s.slice(0, s.length - 1)) : ''; }
/** "walls[2]" gives 2; -1 when the path is not an item of a list. */
export function indexOf(path: string): i32 { const s = steps(path); return s.length > 0 && isIndex(s[s.length - 1]) ? parseInt(s[s.length - 1], 10) : -1; }

/** The value at a path of a table tree; undefined when there is none. */
export function valueAt(data: any, path: string): any {
  let v: any = data;
  for (const s of steps(path)) {
    if (v === undefined || v === null) return undefined;
    if (isIndex(s)) { const i: i32 = parseInt(s, 10); v = v[i]; } else v = v[s];
  }
  return v;
}
function put(data: any, path: string, value: any): void {
  const s = steps(path);
  let v: any = data;
  for (let k = 0; k + 1 < s.length; k++) { if (isIndex(s[k])) { const i: i32 = parseInt(s[k], 10); v = v[i]; } else v = v[s[k]]; }
  const last = s[s.length - 1];
  if (isIndex(last)) { const i: i32 = parseInt(last, 10); v[i] = value; } else v[last] = value;
}
/** Takes item `at` out of the list at a path. (A list read into a typed array is a copy: the tree gets a new list.) */
function removeAt(data: any, list: string, at: i32): void {
  const items: any = valueAt(data, list), kept: any[] = [];
  for (let i = 0; i < items.length; i++) if (i !== at) kept.push(items[i]);
  put(data, list, kept);
}
/** The field of the format a path ends on; null when the format has no such field. */
export function fieldAt(path: string): Field | null {
  let s: Schema = formatSchema();
  let f: Field | null = null;
  for (const step of steps(path)) {
    if (isIndex(step)) continue;   // an item of the list just named: its schema is already the current one
    f = s.field(step);
    if (f === null) return null;
    if (f.of !== null) s = f.of as Schema;
  }
  return f;
}
/** The schema of the object at a path: the table itself for '', an element for "walls[2]", the plunger for "plunger". */
export function schemaAt(path: string): Schema {
  const f = fieldAt(path);
  return f === null || f.of === null ? formatSchema() : f.of as Schema;
}

// ---------------------------------------------------------------- what the schema says of a field

// ponytail: the format does not say which fields place an element in the top view; three shapes of its fields do, and hold for every
// element of version 1: a required row of 2 or 3 numbers is a point (at, pivot, a, b), rows of up to 3 numbers are a path (x, y, bulge),
// a number from -360 to 360 is a direction. An explicit role on Field (asked of the format's owner) replaces these three tests.
export function isPoint(f: Field): boolean { return f.kind === Kind.Tuple && f.required && f.cols >= 2 && f.cols <= 3; }
export function isPath(f: Field): boolean { return f.kind === Kind.Rows && f.maxCols === 3; }
export function isDirection(f: Field): boolean { return f.kind === Kind.Num && f.min === -360 && f.max === 360; }
/** Whether objects of this schema have a place in the top view. */
export function isPlaced(s: Schema): boolean {
  for (const f of s.fields) if (isPoint(f) || isPath(f)) return true;
  return false;
}
/** Whether turning an object of this schema changes it: it has a direction, a path, or two points. */
export function canTurn(s: Schema): boolean {
  let points = 0;
  for (const f of s.fields) {
    if (isDirection(f) || isPath(f) || f.name === 'rotation') return true;
    if (isPoint(f)) points++;
  }
  return points > 1;
}

function round2(v: number): number { return Math.round(v * 100) / 100; }
/** A direction kept between -180 and 180, in hundredths. */
function wrap(degrees: number): number {
  let a = degrees % 360;
  if (a > 180) a -= 360;
  if (a <= -180) a += 360;
  return round2(a);
}
/** The points of an object of schema `s`, as the rows that hold them (a point's own row, each row of a path). */
function pointsOf(s: Schema, item: any): any[] {
  const out: any[] = [];
  for (const f of s.fields) {
    const x: any = item[f.name];
    if (isPoint(f)) out.push(x);
    else if (isPath(f)) for (let i = 0; i < x.length; i++) out.push(x[i]);
  }
  return out;
}
/** The middle of an object in the top view: the centre of the box around its points. */
export function centreOf(s: Schema, item: any): number[] {
  const pts = pointsOf(s, item);
  if (pts.length === 0) return [0, 0];
  let x0: number = pts[0][0], x1 = x0, y0: number = pts[0][1], y1 = y0;
  for (const p of pts) { const x: number = p[0], y: number = p[1]; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  return [(x0 + x1) / 2, (y0 + y1) / 2];
}
/** Moves an object of schema `s` by (dx, dy) in the top view: every point and every path of it. Changes `item`. */
export function moveItem(s: Schema, item: any, dx: number, dy: number): void {
  for (const p of pointsOf(s, item)) { const x: number = p[0], y: number = p[1]; p[0] = round2(x + dx); p[1] = round2(y + dy); }
}
/** Turns an object of schema `s` by `degrees` around `about` (clockwise in the top view, as the format counts angles): its points go
 *  round, its directions turn. Changes `item`. */
export function turnItem(s: Schema, item: any, degrees: number, about: number[]): void {
  const a = degrees * Math.PI / 180, c = Math.cos(a), sn = Math.sin(a);
  for (const p of pointsOf(s, item)) {
    const x: number = p[0] - about[0], y: number = p[1] - about[1];
    p[0] = round2(about[0] + x * c - y * sn); p[1] = round2(about[1] + x * sn + y * c);
  }
  for (const f of s.fields) {
    if (isDirection(f)) { const d: number = item[f.name]; item[f.name] = wrap(d + degrees); }
    // ponytail: a model's turn in the top view is the third number of its `rotation`, known here by its name
    else if (f.name === 'rotation' && f.kind === Kind.Tuple && f.cols === 3) { const r: any = item[f.name]; const d: number = r[2]; r[2] = wrap(d + degrees); }
  }
}

/** The path a fault of the loader is about: the text before its first ": ". */
function faultPath(fault: string): string { const cut = fault.indexOf(': '); return cut < 0 ? '' : fault.slice(0, cut); }

/** The text of a new, empty table: a board, a ball and a plunger, nothing else. */
export function newTableText(name: string): string {
  return `{ "format": "${FORMAT}", "version": ${VERSION}, "name": ${JSON.stringify(name)}, "plunger": { "at": [48.35, 100] } }`;
}

// ---------------------------------------------------------------- the document

class Step {
  label: string;
  data: any;
  text: string;
  constructor(label: string, data: any, text: string) { this.label = label; this.data = data; this.text = text; }
}

export class Doc {
  /** The table as the format describes it, every field with a value. Never changed in place: an operation replaces it. */
  data: any;
  /** The same typed, for what reads it as the game does. */
  def: TableDef;
  /** The text on disk ('' when never saved): the table is unsaved while its text differs. */
  saved = '';
  /** Why the last operation was not made ('' when it was): the loader's message, which names the field. */
  refused = '';
  /** What the last deletion took with it: the paths of the names it cleared and of the rules and missions it deleted. */
  went: string[] = [];
  /** Called after every change of `data` (an edit, undo, redo). */
  onChange: (() => void) | null = null;
  // ponytail: an undo step keeps the whole table before it (17 KB of text for Tidal Lock); inverse operations if tables grow past a few MB
  private undone: Step[] = [];
  private redone: Step[] = [];
  private lastKey = '';
  private now = '';

  /** `text`: a table file. Throws TableError (every fault, each with its path) when the game would refuse it. */
  constructor(text: string, saved: string) {
    this.data = parseTable(text, 'the table');
    this.def = this.data as TableDef;
    this.now = `${write(formatSchema(), this.data, '')}\n`;
    this.saved = saved;
  }

  /** The canonical text of the table: what Save writes. */
  text(): string { return this.now; }
  get dirty(): boolean { return this.now !== this.saved; }
  get canUndo(): boolean { return this.undone.length > 0; }
  get canRedo(): boolean { return this.redone.length > 0; }
  get undoLabel(): string { return this.undone.length > 0 ? this.undone[this.undone.length - 1].label : ''; }
  get redoLabel(): string { return this.redone.length > 0 ? this.redone[this.redone.length - 1].label : ''; }
  markSaved(): void { this.saved = this.now; this.lastKey = ''; }
  /** Ends a run of merged steps: the next nudge of the same element is a step of its own. */
  seal(): void { this.lastKey = ''; }

  private show(data: any, text: string): void {
    this.data = data; this.def = data as TableDef; this.now = text;
    const f = this.onChange;
    if (f !== null) f();
  }

  /** One undoable step: `change` is made on a copy, the copy is checked as the game checks a file, and replaces the table when it
   *  passes. `mend`, when given, gets the faults of a copy that does not pass and may repair it (true: check again). Consecutive steps
   *  with the same non-empty `key` are one; a step that changes no byte leaves no trace. Returns whether the table changed. */
  private apply(label: string, key: string, change: (d: any) => void, mend: ((d: any, faults: string[]) => boolean) | null): boolean {
    this.refused = '';
    const next: any = JSON.parse(JSON.stringify(this.data));
    let checked: any = null;
    try {
      change(next);
      for (let round = 0; round < 12 && checked === null; round++) {
        // through its text, as a file would come: the loader takes any tree, with or without its defaults
        try { checked = parseTable(JSON.stringify(next), 'the table'); } catch (e) {
          const found: string[] = e instanceof TableError ? (e as TableError).errors : [`${(e as Error).message}`];
          if (mend === null || !mend(next, found)) { this.refused = found[0]; return false; }
        }
      }
    } catch (e) { this.refused = `${(e as Error).message}`; return false; }
    if (checked === null) { this.refused = 'the table could not be mended'; return false; }
    const text = `${write(formatSchema(), checked, '')}\n`;
    if (text === this.now) return false;
    const merge = key.length > 0 && key === this.lastKey && this.undone.length > 0;
    if (!merge) this.undone.push(new Step(label, this.data, this.now));
    this.redone = [];
    this.lastKey = key;
    this.show(checked, text);
    return true;
  }
  /** Takes the last step back and returns its label ('' when there is none). */
  undo(): string {
    if (this.undone.length === 0) return '';
    const s = this.undone[this.undone.length - 1];
    this.undone.pop();
    this.redone.push(new Step(s.label, this.data, this.now));
    this.lastKey = '';
    this.show(s.data, s.text);
    return s.label;
  }
  redo(): string {
    if (this.redone.length === 0) return '';
    const s = this.redone[this.redone.length - 1];
    this.redone.pop();
    this.undone.push(new Step(s.label, this.data, this.now));
    this.lastKey = '';
    this.show(s.data, s.text);
    return s.label;
  }

  // ---------------------------------------------------------------- reading

  get(path: string): any { return valueAt(this.data, path); }
  /** What an object is called: its id when it has one, else the last word of its path ("plunger", "playfield"), "table" for the root. */
  nameOf(path: string): string {
    const v: any = this.get(path);
    if (v !== undefined && v !== null && typeof v === 'object' && typeof v.id === 'string') { const id: string = v.id; return id; }
    const s = steps(path);
    return s.length === 0 ? 'table' : s[s.length - 1];
  }
  /** The path of the item of `list` whose id is `id`; '' when there is none. */
  find(list: string, id: string): string {
    const items: any = this.get(list);
    if (!Array.isArray(items)) return '';
    for (let i = 0; i < items.length; i++) if (items[i].id === id) return `${list}[${i}]`;
    return '';
  }
  /** The object at a path as the file has it. */
  jsonOf(path: string): string {
    const v: any = this.get(path);
    return v === undefined || v === null || typeof v !== 'object' || Array.isArray(v) ? '' : write(schemaAt(path), v, '');
  }
  /** Whether the field at a path holds its default (the file then leaves it out). */
  isDefault(path: string): boolean {
    const f = fieldAt(path);
    return f !== null && !f.required && JSON.stringify(this.get(path)) === JSON.stringify(f.def);
  }
  /** The names a reference field may hold, in file order: the ids of its name spaces, the groups in use for "groups" and "light groups". */
  namesOf(space: string): string[] {
    const out: string[] = [];
    const add = (n: any): void => { if (typeof n === 'string' && n !== '' && out.indexOf(n) < 0) out.push(n); };
    const root = formatSchema();
    for (const want of space.split('|')) {
      if (want === 'game') { add('game'); continue; }
      for (const f of root.fields) {
        if (f.kind !== Kind.List || f.of === null) continue;
        const of = f.of as Schema, id = of.field('id'), items: any = this.data[f.name];
        if (id === null) continue;
        // an element's `group` declares a group, a light's a light group (table.ts, declareGroups)
        const grouped = of.field('group') !== null && ((want === 'groups' && id.to === 'elements') || (want === 'light groups' && id.to === 'lights'));
        for (let i = 0; i < items.length; i++) { if (id.to === want) add(items[i].id); if (grouped) add(items[i].group); }
      }
      if (want === 'counters') { const c: any = this.data.rules.counters; for (let i = 0; i < c.length; i++) add(c[i]); }
      if (want === 'missions') { const m: any = this.data.rules.missions; for (let i = 0; i < m.length; i++) add(m[i].id); }
    }
    return out;
  }

  // ---------------------------------------------------------------- operations

  /** Sets one field. A new name (an id, a group) is given to everything that named the old one. */
  set(path: string, value: any): boolean {
    const f = fieldAt(path);
    if (f === null) { this.refused = `${path}: unknown field`; return false; }
    const old: any = this.get(path);
    const s = steps(path), owner = pathOf(s.slice(0, s.length - 1));
    const rename = typeof old === 'string' && typeof value === 'string' && old !== '' && value !== '' && (f.name === 'id' || f.name === 'group');
    return this.apply(`Change ${this.nameOf(owner)}.${f.name}`, '', (d: any) => { put(d, path, value); }, !rename ? null : (d: any, found: string[]): boolean => {
      // what named the old name and now names nothing: it takes the new one
      for (const fault of found) {
        const p = faultPath(fault);
        if (p === '' || valueAt(d, p) !== old) return false;
        put(d, p, value);
      }
      return true;
    });
  }
  /** Moves an element by (dx, dy) centimetres in the top view. */
  move(path: string, dx: number, dy: number): boolean {
    const s = schemaAt(path);
    return this.apply(`Move ${this.nameOf(path)}`, `move ${path}`, (d: any) => { moveItem(s, valueAt(d, path), dx, dy); }, null);
  }
  /** Turns an element by `degrees` around its middle (positive: clockwise in the top view). */
  turn(path: string, degrees: number): boolean {
    const s = schemaAt(path);
    return this.apply(`Turn ${this.nameOf(path)}`, `turn ${path}`, (d: any) => { const item: any = valueAt(d, path); turnItem(s, item, degrees, centreOf(s, item)); }, null);
  }
  /** Deletes an item of a list. The optional names that pointed to it are cleared, and a rule or a mission that cannot do without it
   *  is deleted with it: `went` lists both. */
  remove(path: string): boolean {
    const list = listOf(path), at = indexOf(path);
    if (at < 0) { this.refused = `${path}: only an item of a list is deleted`; return false; }
    const took: string[] = [];
    const done = this.apply(`Delete ${this.nameOf(path)}`, '', (d: any) => { removeAt(d, list, at); }, (d: any, found: string[]): boolean => {
      const drop: string[] = [];
      for (const fault of found) {
        const p = faultPath(fault), f = p === '' ? null : fieldAt(p);
        if (f === null) return false;
        if (f.kind === Kind.Ref && !f.required) { put(d, p, ''); took.push(p); continue; }
        // the outermost list item the fault is in: the rule, the mission
        const s = steps(p);
        let k = 0;
        while (k < s.length && !isIndex(s[k])) k++;
        if (k >= s.length) return false;
        const item = pathOf(s.slice(0, k + 1));
        if (drop.indexOf(item) < 0) drop.push(item);
      }
      // from the end of each list, so that the indices of the others still hold
      drop.sort((a: string, b: string): number => listOf(a) === listOf(b) ? indexOf(b) - indexOf(a) : a < b ? -1 : 1);
      for (const item of drop) { removeAt(d, listOf(item), indexOf(item)); took.push(item); }
      return true;
    });
    this.went = done ? took : [];
    return done;
  }
  /** Replaces the object at a path by the one a JSON text holds: the selection edited as the file has it. */
  replace(path: string, json: string): boolean {
    let v: any = null;
    try { v = JSON.parse(json); } catch (e) { this.refused = `not JSON: ${(e as Error).message}`; return false; }
    if (path === '') { this.refused = 'the whole table is not replaced this way'; return false; }
    return this.apply(`Edit ${this.nameOf(path)}`, '', (d: any) => { put(d, path, v); }, null);
  }
}
