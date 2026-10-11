// A schema describes a JSON object field by field: its type, its default, its limits and a sentence of documentation.
// One description serves four uses: check() validates a parsed file and reports every fault with the path of the value,
// write() gives the one canonical text of a value (so load, save, load is stable), the reference document is generated
// from it (tools/format-doc.ts), and an editor can build its property forms from it. The table format itself is in
// table-schema.ts; nothing here knows about pinball.

export const enum Kind {
  Num, Int, Bool, Text, Color,
  /** One of `choices`. */
  Choice,
  /** The id of an item of another list (`to`), '' for none. */
  Ref,
  /** A file of the table's folder; `to` says of what kind ('image', 'sound', 'model'). */
  Asset,
  /** A row of `cols` to `maxCols` numbers: a point, a box, a direction. */
  Tuple,
  /** Rows of numbers, each `cols` to `maxCols` long: the points of a path, a height profile. */
  Rows,
  /** A list of strings. */
  Texts,
  /** A list of objects of schema `of`. */
  List,
  /** An object of schema `of`. */
  Obj,
}

export class Field {
  name: string;
  kind: Kind;
  doc: string;
  /** null: the field must be given. */
  def: any = null;
  required: boolean = false;
  min: number = -1e300;
  max: number = 1e300;
  choices: string[] = [];
  /** Ref: the name space the id belongs to (see Names). Asset: the kind of file it names ('image', 'sound', 'model': the format
   *  that uses the schema says which files are of each kind). */
  to: string = '';
  cols: i32 = 0;
  maxCols: i32 = 0;
  minRows: i32 = 0;
  of: Schema | null = null;
  /** What the numbers stand for in space, '' for none: an editor draws, moves and turns things by it, without knowing
   *  the field's name. The format that uses the schema says which roles it has (table-schema.ts: ROLES). */
  role: string = '';
  /** What the number is counted in ('cm', 'degrees', 'seconds'...), '' for a plain number: for forms and the reference. */
  unit: string = '';

  constructor(name: string, kind: Kind, doc: string) { this.name = name; this.kind = kind; this.doc = doc; }
  range(min: number, max: number): Field { this.min = min; this.max = max; return this; }
  must(): Field { this.required = true; return this; }
  withRole(role: string): Field { this.role = role; return this; }
  withUnit(unit: string): Field { this.unit = unit; return this; }
}

/** One of the kinds an object can be, by the word its kind field holds, and what that kind reads of the object's other fields (the
 *  rest is ignored for it). The format that uses the schema checks an object by its kind, and an editor offers what the kind reads,
 *  so that a new object is whole and valid at once. */
export class Variant {
  word: string;
  /** What its target is: the name of an item of this name space ('' when it is no name)... */
  names: string = '';
  /** ...which, when the name space is wider than what the kind acts on, an editor takes among the items of this list of the file
   *  and their groups, or of these lists ("bumpers|targets"); '' for any of the name space... */
  among: string = '';
  /** ...or one of these words... */
  words: string[] = [];
  /** ...or any text. */
  text: boolean = false;
  /** The words its way field may hold; none: the kind does not read that field. */
  ways: string[] = [];
  /** How a fault of its way begins ("lights are"); '' for "<kind> takes". */
  said: string = '';
  /** The numbers it reads, by the names of their fields: "value", or "seconds:flash" for one it reads only with the way "flash". */
  numbers: string[] = [];
  /** Its first number must not be 0. */
  nonZero: boolean = false;
  constructor(word: string) { this.word = word; }
  named(names: string, among: string = ''): Variant { this.names = names; this.among = among; return this; }
  or(words: string[]): Variant { this.words = words; return this; }
  anyText(): Variant { this.text = true; return this; }
  by(ways: string[], said: string = ''): Variant { this.ways = ways; this.said = said; return this; }
  reads(numbers: string[], nonZero: boolean = false): Variant { this.numbers = numbers; this.nonZero = nonZero; return this; }
  /** Whether it reads a target at all. */
  get aimed(): boolean { return this.names !== '' || this.words.length > 0 || this.text; }
  /** Whether it reads the number field `name` when its way is `way`. */
  uses(name: string, way: string): boolean { return this.numbers.indexOf(name) >= 0 || this.numbers.indexOf(`${name}:${way}`) >= 0; }
}
/** The kinds of the objects of a schema: the field that says the kind, the field that holds the target and the field that holds the
 *  way ('' when its kinds have none). A field no kind names is read whatever the kind (the text of a mission's step). */
export class Variants {
  kind: string; target: string; way: string;
  /** The kinds only say what an editor offers (the things that can send an event): the format accepts an object they would not
   *  make, and the reference does not list them. */
  loose: boolean = false;
  all: Variant[] = [];
  constructor(kind: string, target: string, way: string) { this.kind = kind; this.target = target; this.way = way; }
  add(word: string): Variant { const v = new Variant(word); this.all.push(v); return v; }
  of(word: string): Variant | null { for (const v of this.all) if (v.word === word) return v; return null; }
}

export class Schema {
  name: string;
  doc: string;
  fields: Field[] = [];
  /** The field that names an item ('id'), '' when items have no name. */
  key: string = '';
  /** When its objects are of several kinds: what each kind reads. null: every object reads every field. */
  variants: Variants | null = null;
  /** An example as a file would hold it (JSON), for the reference when the table at hand has none. */
  sample: string = '';
  constructor(name: string, doc: string) { this.name = name; this.doc = doc; }

  add(f: Field): Schema { this.fields.push(f); return this; }
  field(name: string): Field | null { for (const f of this.fields) if (f.name === name) return f; return null; }

  num(name: string, def: number, doc: string): Field { return this.put(name, Kind.Num, def, doc); }
  int(name: string, def: number, doc: string): Field { return this.put(name, Kind.Int, def, doc); }
  bool(name: string, def: boolean, doc: string): Field { return this.put(name, Kind.Bool, def, doc); }
  text(name: string, def: string, doc: string): Field { return this.put(name, Kind.Text, def, doc); }
  color(name: string, def: string, doc: string): Field { return this.put(name, Kind.Color, def, doc); }
  /** A file of the kind `what`; '' (the default) is none. */
  asset(name: string, what: string, doc: string): Field { const f = this.put(name, Kind.Asset, '', doc); f.to = what; return f; }
  choice(name: string, choices: string[], doc: string): Field { const f = this.put(name, Kind.Choice, choices[0], doc); f.choices = choices; return f; }
  /** A reference to an item of the name space `to`; '' (the default) is none. */
  ref(name: string, to: string, doc: string): Field { const f = this.put(name, Kind.Ref, '', doc); f.to = to; return f; }
  /** The id of this item: required, unique in its name space. */
  id(space: string, doc: string): Field { const f = this.put('id', Kind.Text, '', doc); f.required = true; f.to = space; this.key = 'id'; return f; }
  tuple(name: string, def: number[], doc: string): Field { const f = this.put(name, Kind.Tuple, def, doc); f.cols = def.length; f.maxCols = def.length; return f; }
  rows(name: string, cols: i32, maxCols: i32, minRows: i32, doc: string): Field {
    const f = this.put(name, Kind.Rows, [], doc);
    f.cols = cols; f.maxCols = maxCols; f.minRows = minRows; f.required = minRows > 0;
    return f;
  }
  texts(name: string, doc: string): Field { return this.put(name, Kind.Texts, [], doc); }
  list(name: string, of: Schema, doc: string): Field { const f = this.put(name, Kind.List, [], doc); f.of = of; return f; }
  obj(name: string, of: Schema, doc: string): Field { const f = this.put(name, Kind.Obj, null, doc); f.of = of; return f; }

  private put(name: string, kind: Kind, def: any, doc: string): Field {
    const f = new Field(name, kind, doc);
    f.def = def;
    this.fields.push(f);
    return f;
  }
}

/** The ids declared so far in each name space, to check references and duplicates. */
export class Names {
  spaces: Map<string, string[]> = new Map<string, string[]>();
  /** References met while checking, resolved at the end (an item may refer to one declared later). */
  refs: string[][] = [];
  add(space: string, id: string): boolean {
    let ids = this.spaces.get(space);
    if (ids === undefined) { ids = []; this.spaces.set(space, ids); }
    if (ids.indexOf(id) >= 0) return false;
    ids.push(id);
    return true;
  }
  has(space: string, id: string): boolean {
    for (const s of space.split('|')) { const ids = this.spaces.get(s); if (ids !== undefined && ids.indexOf(id) >= 0) return true; }
    return false;
  }
  list(space: string): string {
    const all: string[] = [];
    for (const s of space.split('|')) { const ids = this.spaces.get(s); if (ids !== undefined) for (const id of ids) all.push(id); }
    return all.length === 0 ? 'none is defined' : all.length > 12 ? `${all.slice(0, 12).join(', ')}...` : all.join(', ');
  }
}

/** The names of an object's own fields, in file order.
 *  ponytail: Zinc has no Object.keys and no for-in yet (proposed engine task), so the keys are read from the engine's own
 *  JSON.stringify of the object: strings at depth 1 that a colon follows. Replace the body by Object.keys(o) when it exists. */
export function keysOf(o: any): string[] {
  const t = JSON.stringify(o);
  const keys: string[] = [];
  let depth = 0, i = 0;
  while (i < t.length) {
    const c = t.charCodeAt(i);
    if (c === 34) {   // a string: to its closing quote, a backslash escapes the next character
      let j = i + 1;
      while (j < t.length && t.charCodeAt(j) !== 34) j += t.charCodeAt(j) === 92 ? 2 : 1;
      if (depth === 1 && t.charCodeAt(j + 1) === 58) { const k: string = JSON.parse(t.slice(i, j + 1)); keys.push(k); }
      i = j + 1;
      continue;
    }
    if (c === 123 || c === 91) depth++;
    else if (c === 125 || c === 93) depth--;
    i++;
  }
  return keys;
}

function typeName(v: any): string { return v === null ? 'null' : v === undefined ? 'nothing' : Array.isArray(v) ? 'a list' : typeof v === 'object' ? 'an object' : typeof v === 'string' ? `"${v}"` : `${v}`; }
function isObject(v: any): boolean { return v !== null && v !== undefined && typeof v === 'object' && !Array.isArray(v); }
function isColor(s: string): boolean {
  if (s.length !== 7 || s.charCodeAt(0) !== 35) return false;
  for (let i = 1; i < 7; i++) { const c = s.charCodeAt(i); if (!((c >= 48 && c <= 57) || (c >= 97 && c <= 102) || (c >= 65 && c <= 70))) return false; }
  return true;
}
/** The closest known name within two edits, for "did you mean". */
function nearest(name: string, known: string[]): string {
  let best = '', bestD = 3;
  for (const k of known) {
    const d = distance(name, k);
    if (d < bestD) { bestD = d; best = k; }
  }
  return best;
}
function distance(a: string, b: string): i32 {
  if (Math.abs(a.length - b.length) > 2) return 9;
  let prev: i32[] = [];
  for (let j = 0; j <= b.length; j++) prev.push(j);
  for (let i = 1; i <= a.length; i++) {
    const cur: i32[] = [i];
    for (let j = 1; j <= b.length; j++) cur.push(Math.min(Math.min(prev[j] + 1, cur[j - 1] + 1), prev[j - 1] + (a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1)));
    prev = cur;
  }
  return prev[b.length];
}

function limits(f: Field): string {
  if (f.min > -1e300 && f.max < 1e300) return ` from ${f.min} to ${f.max}`;
  if (f.min > -1e300) return ` of at least ${f.min}`;
  if (f.max < 1e300) return ` of at most ${f.max}`;
  return '';
}
function numbersIn(v: any, f: Field): boolean {
  if (!Array.isArray(v) || v.length < f.cols || v.length > f.maxCols) return false;
  for (let i = 0; i < v.length; i++) if (typeof v[i] !== 'number') return false;
  return true;
}
function sizeOf(f: Field): string { return f.cols === f.maxCols ? `${f.cols}` : `${f.cols} to ${f.maxCols}`; }

/** Checks `v` against `schema` and returns the same value with every default filled in. Faults go to `errors` as
 *  "path: what is wrong"; the result is then only good for finding more faults. */
export function check(schema: Schema, v: any, path: string, names: Names, errors: string[]): any {
  const out: any = {};
  if (!isObject(v)) { errors.push(`${path === '' ? 'the file' : path}: must be an object (${schema.name}), not ${typeName(v)}`); return out; }
  const known: string[] = [];
  for (const f of schema.fields) known.push(f.name);
  for (const k of keysOf(v)) {
    if (known.indexOf(k) >= 0) continue;
    const near = nearest(k, known);
    errors.push(`${join(path, k)}: unknown field${near === '' ? '' : ` (did you mean "${near}"?)`}`);
  }
  for (const f of schema.fields) {
    const p = join(path, f.name);
    const x: any = v[f.name];
    if (x === undefined) {
      if (f.required) errors.push(`${p}: is missing (${f.doc})`);
      if (f.kind === Kind.Obj) out[f.name] = check(f.of as Schema, {}, p, names, f.required ? [] : errors);
      else if (f.kind === Kind.List || f.kind === Kind.Rows || f.kind === Kind.Texts) { const none: any[] = []; out[f.name] = none; }
      else out[f.name] = f.def;
      continue;
    }
    out[f.name] = value(f, x, p, names, errors);
  }
  return out;
}

function join(path: string, name: string): string { return path === '' ? name : `${path}.${name}`; }

function value(f: Field, x: any, p: string, names: Names, errors: string[]): any {
  if (f.kind === Kind.Num || f.kind === Kind.Int) {
    const whole = f.kind === Kind.Int;
    if (typeof x !== 'number' || (whole && !Number.isInteger(x)) || x < f.min || x > f.max) {
      errors.push(`${p}: must be a ${whole ? 'whole ' : ''}number${limits(f)}, not ${typeName(x)}`);
      return f.def;
    }
    return x;
  }
  if (f.kind === Kind.Bool) {
    if (typeof x !== 'boolean') { errors.push(`${p}: must be true or false, not ${typeName(x)}`); return f.def; }
    return x;
  }
  if (f.kind === Kind.Text || f.kind === Kind.Asset) {
    if (typeof x !== 'string') { errors.push(`${p}: must be a text, not ${typeName(x)}`); return f.def; }
    const s: string = x;
    if (f.required && s === '') errors.push(`${p}: must not be empty`);
    if (f.name === 'id' && f.to !== '' && s !== '' && !names.add(f.to, s)) errors.push(`${p}: "${s}" is used twice`);
    return x;
  }
  if (f.kind === Kind.Color) {
    if (typeof x !== 'string' || !isColor(x)) { errors.push(`${p}: must be a colour like "#40c8ff", not ${typeName(x)}`); return f.def; }
    return x;
  }
  if (f.kind === Kind.Choice) {
    if (typeof x !== 'string' || f.choices.indexOf(x) < 0) { errors.push(`${p}: must be one of ${f.choices.join(', ')}, not ${typeName(x)}`); return f.def; }
    return x;
  }
  if (f.kind === Kind.Ref) {
    if (typeof x !== 'string') { errors.push(`${p}: must be the name of one of the ${f.to.split('|').join(' or ')}, not ${typeName(x)}`); return ''; }
    const s: string = x;
    if (s !== '') names.refs.push([p, f.to, s]);
    return x;
  }
  if (f.kind === Kind.Tuple) {
    if (!numbersIn(x, f)) { errors.push(`${p}: must be ${sizeOf(f)} numbers, not ${typeName(x)}`); return f.def; }
    return x;
  }
  if (f.kind === Kind.Rows) {
    const rows: any[] = [];
    if (!Array.isArray(x)) { errors.push(`${p}: must be a list of rows of ${sizeOf(f)} numbers, not ${typeName(x)}`); return rows; }
    for (let i = 0; i < x.length; i++) {
      if (numbersIn(x[i], f)) rows.push(x[i]);
      else errors.push(`${p}[${i}]: must be ${sizeOf(f)} numbers, not ${typeName(x[i])}`);
    }
    if (x.length < f.minRows) errors.push(`${p}: needs at least ${f.minRows} rows, it has ${x.length}`);
    return rows;
  }
  if (f.kind === Kind.Texts) {
    const texts: any[] = [];
    if (!Array.isArray(x)) { errors.push(`${p}: must be a list of texts, not ${typeName(x)}`); return texts; }
    for (let i = 0; i < x.length; i++) {
      if (typeof x[i] === 'string') texts.push(x[i]);
      else errors.push(`${p}[${i}]: must be a text, not ${typeName(x[i])}`);
    }
    return texts;
  }
  if (f.kind === Kind.List) {
    const items: any[] = [];
    if (!Array.isArray(x)) { errors.push(`${p}: must be a list, not ${typeName(x)}`); return items; }
    for (let i = 0; i < x.length; i++) items.push(check(f.of as Schema, x[i], `${p}[${i}]`, names, errors));
    return items;
  }
  return check(f.of as Schema, x, p, names, errors);
}

/** After check(): every reference must name an item that exists. */
export function checkRefs(names: Names, errors: string[]): void {
  for (const r of names.refs) {
    if (!names.has(r[1], r[2])) errors.push(`${r[0]}: "${r[2]}" is not one of the ${r[1].split('|').join(' or ')} (${names.list(r[1])})`);
  }
}

// ---------------------------------------------------------------- the canonical text

function numText(n: number): string { return n === 0 ? '0' : `${n}`; }
function rowText(r: any): string {
  const parts: string[] = [];
  for (let i = 0; i < r.length; i++) { const n: number = r[i]; parts.push(numText(n)); }
  return `[${parts.join(', ')}]`;
}
function same(a: any, b: any): boolean { return JSON.stringify(a) === JSON.stringify(b); }

/** An object or a list of numbers that fits in this many columns is written on one line. */
const WIDTH = 150;

function fieldText(f: Field, x: any, indent: string): string {
  if (f.kind === Kind.Num || f.kind === Kind.Int) { const n: number = x; return numText(n); }
  if (f.kind === Kind.Bool) return x === true ? 'true' : 'false';
  if (f.kind === Kind.Tuple) return rowText(x);
  if (f.kind === Kind.Rows || f.kind === Kind.Texts) {
    const parts: string[] = [];
    for (let i = 0; i < x.length; i++) parts.push(f.kind === Kind.Rows ? rowText(x[i]) : JSON.stringify(x[i]));
    const line = `[${parts.join(', ')}]`;
    if (indent.length + f.name.length + line.length + 5 <= WIDTH) return line;
    return `[\n${indent}    ${parts.join(`,\n${indent}    `)}\n${indent}  ]`;
  }
  if (f.kind === Kind.List) {
    if (x.length === 0) return '[]';
    const of = f.of as Schema;
    const parts: string[] = [];
    let fits = of.key === '';   // named items (elements) take a line each, so that a change of one is a change of one line
    for (let i = 0; i < x.length; i++) {
      const t = write(of, x[i], `${indent}    `);
      if (t.indexOf('\n') >= 0) fits = false;
      parts.push(t);
    }
    const line = `[${parts.join(', ')}]`;
    if (fits && indent.length + f.name.length + line.length + 6 <= WIDTH) return line;
    return `[\n${indent}    ${parts.join(`,\n${indent}    `)}\n${indent}  ]`;
  }
  if (f.kind === Kind.Obj) return write(f.of as Schema, x, `${indent}  `);
  return JSON.stringify(x);
}

/** The canonical JSON text of a checked value: the fields in schema order, those that hold their default left out,
 *  rows of numbers on one line, short objects on one line. `indent` is the indentation of the line the text starts on. */
export function write(schema: Schema, v: any, indent: string): string {
  const parts: string[] = [];
  let long = false;
  for (const f of schema.fields) {
    const x: any = v[f.name];
    if (x === undefined) continue;
    if (!f.required && f.kind !== Kind.Obj && same(x, f.def)) continue;
    const t = fieldText(f, x, indent);
    if (f.kind === Kind.Obj && t === '{}' && !f.required) continue;
    if (t.indexOf('\n') >= 0) long = true;
    parts.push(`"${f.name}": ${t}`);
  }
  if (parts.length === 0) return '{}';
  const line = `{ ${parts.join(', ')} }`;
  if (!long && indent.length + line.length <= WIDTH) return line;
  return `{\n${indent}  ${parts.join(`,\n${indent}  `)}\n${indent}}`;
}
