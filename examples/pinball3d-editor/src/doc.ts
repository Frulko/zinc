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
import { TableDef, TableError, formatSchema, parseTable, checkTable } from '../../pinball3d/src/format/table';
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
export function fieldAt(path: string): Field | null { return fieldIn(formatSchema(), path); }
/** The same in any schema. */
export function fieldIn(root: Schema, path: string): Field | null {
  let s: Schema = root;
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

/** The paths of the fields of an object (schema `s`, at `path`) that answer to a text someone types to find one, the fields of the
 *  objects inside it included ("sounds.hit"): the field whose key, or whose path from the object, is exactly the text when there is
 *  one, else every field whose path or whose label holds it. `labelOf`: the label of a key; `left`: the fields that are not offered.
 *  With `data` (the table's tree), a text that names an item of a list of the object ("do[1].target") finds the fields of that item. */
export function found(s: Schema, path: string, text: string, labelOf: (key: string) => string, left: (f: Field, at: string) => boolean, data: any = null): string[] {
  const want = text.trim().toLowerCase(), exact: string[] = [], near: string[] = [];
  const walk = (sc: Schema, at: string, from: string): void => {
    for (const f of sc.fields) {
      if (left(f, at)) continue;
      const here = at === '' ? f.name : `${at}.${f.name}`, rel = from === '' ? f.name : `${from}.${f.name}`;
      if (f.kind === Kind.Obj) { walk(f.of as Schema, here, rel); continue; }
      if (f.kind === Kind.List && f.of !== null && data !== null && want.startsWith(`${rel.toLowerCase()}[`)) {
        const items: any = valueAt(data, here);
        if (Array.isArray(items)) for (let i = 0; i < items.length; i++) walk(f.of as Schema, `${here}[${i}]`, `${rel}[${i}]`);
        continue;
      }
      if (rel.toLowerCase() === want) exact.push(here);
      else if (rel.toLowerCase().indexOf(want) >= 0 || labelOf(f.name).toLowerCase().indexOf(want) >= 0) near.push(here);
    }
  };
  walk(s, path, '');
  return exact.length > 0 ? exact : near;
}

// The format gives a role to every field that stands for something in space (table-schema.ts ROLES): the editor places, moves and
// turns a thing by the roles of its fields, and knows no field by its name.
/** A place of the top view: [x, y], or [x, y, z]. */
export function isPoint(f: Field): boolean { return f.role === 'point'; }
/** A line of the top view, or the outline of an area: rows [x, y] or [x, y, bulge]. */
export function isPath(f: Field): boolean { return f.role === 'path' || f.role === 'area'; }
/** A step counted from the thing's own place, [dx, dy] or [dx, dy, dz]: it turns and mirrors with the thing, and does not move with it. */
export function isOffset(f: Field): boolean { return f.role === 'offset'; }
/** A distance around the thing's point: a circle of the top view. */
export function isRadius(f: Field): boolean { return f.role === 'radius'; }
/** An angle of the top view. */
export function isDirection(f: Field): boolean { return f.role === 'direction'; }
/** A turn in space, [around x, y, z]: the third number turns the thing in the top view. */
export function isRotation(f: Field): boolean { return f.role === 'rotation'; }
/** Whether objects of this schema have a place in the top view. */
export function isPlaced(s: Schema): boolean {
  for (const f of s.fields) if (isPoint(f) || isPath(f)) return true;
  return false;
}
/** Whether turning an object of this schema changes it: it has a direction, a path, or two points. */
export function canTurn(s: Schema): boolean {
  let points = 0;
  for (const f of s.fields) {
    if (isDirection(f) || isPath(f) || isRotation(f) || isOffset(f)) return true;
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
/** Whether a path goes back to its first point: it is the outline of an area, or the object says so (`closed`). */
export function isClosed(f: Field, item: any): boolean { return f.role === 'area' || item.closed === true; }
/** A height along a path: rows [fraction of the length, height]. */
export function isProfile(f: Field): boolean { return f.role === 'profile'; }
/** The points of an object of schema `s`, as the rows that hold them (a point's own row, each row of a path). */
export function pointsOf(s: Schema, item: any): any[] {
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
    else if (isRotation(f)) { const r: any = item[f.name]; const d: number = r[2]; r[2] = wrap(d + degrees); }
    else if (isOffset(f)) { const o: any = item[f.name]; const x: number = o[0], y: number = o[1]; o[0] = round2(x * c - y * sn); o[1] = round2(x * sn + y * c); }
  }
}
/** The mirror image of an object of schema `s` about the line x = `axis` of the top view. Changes `item`. */
export function mirrorItem(s: Schema, item: any, axis: number): void {
  const ends: string[] = [];
  for (const f of s.fields) {
    const v: any = item[f.name];
    if (isPoint(f)) { const x: number = v[0]; v[0] = round2(2 * axis - x); ends.push(f.name); }
    else if (isPath(f)) {
      // an arc that curved to the left of the way now curves to its right
      for (let i = 0; i < v.length; i++) {
        const x: number = v[i][0];
        v[i][0] = round2(2 * axis - x);
        if (v[i].length > 2) { const b: number = v[i][2]; v[i][2] = b === 0 ? 0 : -b; }
      }
    } else if (isDirection(f)) { const d: number = v; item[f.name] = wrap(180 - d); }
    else if (isRotation(f)) { const d: number = v[2]; v[2] = d === 0 ? 0 : -d; }
    else if (isOffset(f)) { const x: number = v[0]; v[0] = x === 0 ? 0 : -x; }
    // ponytail: two things a mirror changes have no role in the format and are known by what they look like: a swing counted
    // both ways in degrees (a flipper's stroke) and a choice between left and right (its button)
    else if (f.kind === Kind.Num && f.unit === 'degrees' && f.min === -f.max) { const d: number = v; item[f.name] = d === 0 ? 0 : -d; }
    else if (f.kind === Kind.Choice && f.choices.length === 2 && f.choices[0] === 'left' && f.choices[1] === 'right') item[f.name] = v === 'left' ? 'right' : 'left';
  }
  // what lies between two points has a side (a gate lets through from its left, a slingshot kicks to its left): the ends change
  // places, so that the side is mirrored with the rest
  if (ends.length === 2) { const a: any = item[ends[0]]; item[ends[0]] = item[ends[1]]; item[ends[1]] = a; }
}
/** "guideLeft" gives "guideRight", "right" gives "left"; a name that says neither is returned as it is. */
export function mirrorName(id: string): string {
  const pairs = ['Left', 'Right', 'left', 'right'];
  for (let k = 0; k < pairs.length; k++) {
    const at = id.indexOf(pairs[k]);
    if (at >= 0) return id.slice(0, at) + pairs[k % 2 === 0 ? k + 1 : k - 1] + id.slice(at + pairs[k].length);
  }
  return id;
}

/** The colours a table tree uses, each once, in the order of the file: its palette. */
export function colorsIn(data: any): string[] {
  const out: string[] = [];
  const within = (s: Schema, v: any): void => {
    for (const f of s.fields) {
      const x: any = v[f.name];
      if (x === undefined || x === null) continue;
      if (f.kind === Kind.Color) { if (typeof x === 'string' && out.indexOf(`${x}`) < 0) out.push(`${x}`); }
      else if (f.kind === Kind.Obj) within(f.of as Schema, x);
      else if (f.kind === Kind.List) for (let i = 0; i < x.length; i++) within(f.of as Schema, x[i]);
    }
  };
  within(formatSchema(), data);
  return out;
}

function summary(s: Schema, v: any): string {
  const id: any = v.id, name: any = v.name;
  if (typeof id === 'string' && id !== '') return typeof name === 'string' && name !== '' ? `${id}: ${name}` : `${id}`;
  const parts: string[] = [];
  for (const f of s.fields) {
    const x: any = v[f.name];
    if (x === undefined || f.kind === Kind.Obj || f.kind === Kind.Rows) continue;
    if (f.kind === Kind.List) {
      if (x.length === 0) continue;
      const inner: string[] = [];
      for (let i = 0; i < x.length; i++) inner.push(summary(f.of as Schema, x[i]));
      parts.push(`[${inner.join(', ')}]`);
    } else if (f.kind === Kind.Tuple || f.kind === Kind.Texts) { if (f.required) parts.push(JSON.stringify(x)); }
    else if (f.required || JSON.stringify(x) !== JSON.stringify(f.def)) parts.push(`${x}`);
  }
  return parts.join(' ');
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
  /** What each of them was: the name cleared, the rule or the mission as it was. */
  lost: any[] = [];
  // an operation is only tried: the table stays as it is (wouldRemove)
  private dry = false;
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
        // the format's own check: it takes any tree, with or without its defaults, and gives it back with them
        try { checked = checkTable(next, 'the table'); } catch (e) {
          const found: string[] = e instanceof TableError ? (e as TableError).errors : [`${(e as Error).message}`];
          if (mend === null || !mend(next, found)) { this.refused = found[0]; return false; }
        }
      }
    } catch (e) { this.refused = `${(e as Error).message}`; return false; }
    if (checked === null) { this.refused = 'the table could not be mended'; return false; }
    const text = `${write(formatSchema(), checked, '')}\n`;
    if (text === this.now) return false;
    if (this.dry) return true;
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
    if (s.length === 0) return 'table';
    // an item without a name is called by its kind and its place in its list: "rule 4"
    const last = s[s.length - 1];
    return isIndex(last) ? `${schemaAt(path).name} ${parseInt(last, 10) + 1}` : last;
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
  /** The names of the items of one list of the table, or of several ("bumpers|targets"), their groups first: what a rule that
   *  speaks of that kind of thing may name. */
  namesAmong(lists: string): string[] {
    const out: string[] = [];
    for (let pass = 0; pass < 2; pass++) for (const list of lists.split('|')) {
      const items: any = this.data[list];
      if (!Array.isArray(items)) continue;
      for (let i = 0; i < items.length; i++) {
        const n: any = pass === 0 ? items[i].group : items[i].id;
        if (typeof n === 'string' && n !== '' && out.indexOf(`${n}`) < 0) out.push(`${n}`);
      }
    }
    return out;
  }

  // ---------------------------------------------------------------- operations

  /** Sets one field, or one row of a path ("walls[2].points[1]"). A new name (an id, a group) is given to everything that named the
   *  old one. `merge`: consecutive sets of the same path are one step for undo (a handle being dragged). */
  set(path: string, value: any, merge: boolean = false): boolean {
    const f = fieldAt(path);
    if (f === null) { this.refused = `${path}: unknown field`; return false; }
    const old: any = this.get(path);
    // what the step is called: the thing the field belongs to (the nearest item of a list above it, by its name), then the
    // way from it to the field: "pop1.sounds.hit", "left.speed", "physics.ball.radius"
    const s = steps(path);
    let last = s.length - 1;
    while (last > 0 && isIndex(s[last])) last--;
    let item = last;
    while (item > 0 && !isIndex(s[item - 1])) item--;
    const called = item === 0 ? pathOf(s.slice(0, last + 1)) : `${this.nameOf(pathOf(s.slice(0, item)))}.${pathOf(s.slice(item, last + 1))}`;
    const rename = typeof old === 'string' && typeof value === 'string' && old !== '' && value !== '' && (f.name === 'id' || f.name === 'group');
    return this.apply(`Change ${called}`, merge ? `set ${path}` : '', (d: any) => { put(d, path, value); }, !rename ? null : (d: any, found: string[]): boolean => {
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
   *  is deleted with it: `went` lists both. `alone`: nothing else goes, and what the table cannot do without is not deleted (the
   *  last action of a rule, the last step of a mission). */
  remove(path: string, alone: boolean = false): boolean {
    const list = listOf(path), at = indexOf(path);
    if (at < 0) { this.refused = `${path}: only an item of a list is deleted`; return false; }
    const took: string[] = [], was: any[] = [];
    const done = this.apply(`Delete ${this.nameOf(path)}`, '', (d: any) => { removeAt(d, list, at); }, alone ? null : (d: any, found: string[]): boolean => {
      const drop: string[] = [];
      for (const fault of found) {
        const p = faultPath(fault), f = p === '' ? null : fieldAt(p);
        if (f === null) return false;
        if (f.kind === Kind.Ref && !f.required) { was.push(valueAt(d, p)); put(d, p, ''); took.push(p); continue; }
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
      for (const item of drop) { was.push(valueAt(d, item)); removeAt(d, listOf(item), indexOf(item)); took.push(item); }
      return true;
    });
    this.went = done ? took : [];
    this.lost = done ? was : [];
    return done;
  }
  /** What deleting an item would take with it: `went` and `lost` are what remove() would leave, and nothing is deleted. False
   *  when the item cannot be deleted. */
  wouldRemove(path: string): boolean {
    this.dry = true;
    const done = this.remove(path);
    this.dry = false;
    return done;
  }
  /** A name no item of the name space of `list` has: "pop3" gives "pop4", "wall" gives "wall1". */
  freeId(list: string, base: string): string {
    const f = fieldAt(list), id = f === null || f.of === null ? null : (f.of as Schema).field('id');
    const taken: string[] = id === null ? ([] as string[]) : this.namesOf(id.to);
    let stem = base;
    while (stem.length > 1 && stem.charCodeAt(stem.length - 1) >= 48 && stem.charCodeAt(stem.length - 1) <= 57) stem = stem.slice(0, stem.length - 1);
    for (let n = 1; ; n++) if (taken.indexOf(`${stem}${n}`) < 0) return `${stem}${n}`;
  }
  /** Adds an item at the end of a list and returns its path ('' when it is refused). `item`: its fields as a file would hold them;
   *  it is given a name when it has none or one that is taken, and an optional reference to something the table does not have (the
   *  look or the surface of the table it was made for) is cleared. */
  add(list: string, item: any, verb: string = 'Add', also: ((d: any) => void) | null = null): string {
    const f = fieldAt(list);
    if (f === null || f.kind !== Kind.List || f.of === null) { this.refused = `${list}: not a list of the table`; return ''; }
    const of = f.of as Schema, copy: any = JSON.parse(JSON.stringify(item)), at: i32 = this.get(list).length;
    if (of.key !== '') {
      const id: string = typeof copy.id === 'string' ? copy.id : '', space = (of.field('id') as Field).to;
      if (id === '' || this.namesOf(space).indexOf(id) >= 0) copy.id = this.freeId(list, id === '' ? of.name : id);
    }
    const name: string = typeof copy.id === 'string' ? copy.id : of.name;
    const done = this.apply(`${verb} ${name}`, '', (d: any) => {
      const items: any = valueAt(d, list), all: any[] = [];
      for (let i = 0; i < items.length; i++) all.push(items[i]);
      all.push(copy);
      put(d, list, all);
      if (also !== null) also(d);   // what the new item cannot do without elsewhere in the table, in the same step
    }, (d: any, found: string[]): boolean => {
      for (const fault of found) {
        const p = faultPath(fault), fd = p === '' ? null : fieldAt(p);
        if (fd === null || fd.kind !== Kind.Ref || fd.required || !p.startsWith(`${list}[${at}]`)) return false;
        put(d, p, '');
      }
      return true;
    });
    return done ? `${list}[${at}]` : '';
  }
  /** A copy of an item of a list, moved by (dx, dy) when it has a place. Returns the path of the copy. */
  duplicate(path: string, dx: number, dy: number): string {
    const list = listOf(path), s = schemaAt(path);
    if (list === '') { this.refused = `${path}: only an item of a list is duplicated`; return ''; }
    const copy: any = JSON.parse(JSON.stringify(this.get(path)));
    moveItem(s, copy, dx, dy);
    return this.add(list, copy, 'Duplicate');
  }
  /** The mirror image of an item about the line x = `axis`, added to its list: a guide drawn on the left gives the one on the right.
   *  Its name is the original's with left and right exchanged when it says one. Returns the path of the copy. */
  mirror(path: string, axis: number): string {
    const list = listOf(path), s = schemaAt(path);
    if (list === '') { this.refused = `${path}: only an item of a list is mirrored`; return ''; }
    const copy: any = JSON.parse(JSON.stringify(this.get(path)));
    mirrorItem(s, copy, axis);
    if (typeof copy.id === 'string') { const id: string = copy.id; copy.id = mirrorName(id); }
    return this.add(list, copy, 'Mirror');
  }
  /** Moves an item of a list one place up (`by` -1) or down (1): rules are read in order, a mission follows the one before it.
   *  Returns the path the item has afterwards ('' when it did not move). */
  reorder(path: string, by: i32): string {
    const list = listOf(path), at = indexOf(path), items: any = list === '' ? undefined : this.get(list);
    if (items === undefined || at + by < 0 || at + by >= items.length) return '';
    const done = this.apply(`Move ${this.nameOf(path)}`, '', (d: any) => {
      const old: any = valueAt(d, list), all: any[] = [];
      for (let i = 0; i < old.length; i++) all.push(old[i === at ? at + by : i === at + by ? at : i]);
      put(d, list, all);
    }, null);
    return done ? `${list}[${at + by}]` : '';
  }
  /** One line that tells an object of the table from its neighbours in a list: its name when it has one, else what it holds that is
   *  not a default, the items of its own lists in brackets ("pops hit [score 500, bonus 100]"). */
  summaryOf(path: string): string { const v: any = this.get(path); return v === undefined ? '' : summary(schemaAt(path), v); }
  /** Several changes of the tree as one step (the plunger lane is a wall, a gate and the plunger at once). */
  edit(label: string, change: (d: any) => void): boolean { return this.apply(label, '', change, null); }
  /** Replaces the object at a path by the one a JSON text holds: the selection edited as the file has it. */
  replace(path: string, json: string): boolean {
    let v: any = null;
    try { v = JSON.parse(json); } catch (e) { this.refused = `not JSON: ${(e as Error).message}`; return false; }
    if (path === '') { this.refused = 'the whole table is not replaced this way'; return false; }
    return this.put(path, v, null);
  }
  /** Replaces the object at a path by another one, whole (an action that becomes one of another kind); `also`: what the table
   *  must gain with it, in the same step. */
  put(path: string, v: any, also: ((d: any) => void) | null): boolean {
    return this.apply(`Edit ${this.nameOf(path)}`, '', (d: any) => { put(d, path, v); if (also !== null) also(d); }, null);
  }
}
