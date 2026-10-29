// One small element tree for every answer: Subsonic's XML and JSON come from the same tree, and /api's JSON too.
// An element has attributes (string, number, boolean, or raw JSON that XML leaves out), children and an optional text.
// In JSON, the attributes are properties, the children are grouped by name (an array when added as `many`, else one
// object) and the text is "value", as Subsonic's JSON does.

export class El {
  name: string;
  keys: string[] = [];
  values: string[] = [];
  /** 's' string, 'v' a number or boolean as written, 'j' raw JSON (JSON only) */
  kinds: string[] = [];
  children: El[] = [];
  many: boolean = false;
  text: string = '';
  /** Names that are arrays in JSON even with no child of that name. */
  lists: string[] = [];
  constructor(name: string) { this.name = name; }

  s(key: string, value: string): El { this.keys.push(key); this.values.push(value); this.kinds.push('s'); return this; }
  n(key: string, value: number): El { this.keys.push(key); this.values.push(Number.isFinite(value) ? String(value) : '0'); this.kinds.push('v'); return this; }
  b(key: string, value: boolean): El { this.keys.push(key); this.values.push(value ? 'true' : 'false'); this.kinds.push('v'); return this; }
  json(key: string, raw: string): El { this.keys.push(key); this.values.push(raw); this.kinds.push('j'); return this; }
  /** Adds a child and returns it; `many`: one of a list (an array in JSON). */
  add(child: El, many: boolean = true): El { child.many = many; this.children.push(child); if (many) this.list(child.name); return child; }
  list(name: string): El { if (this.lists.indexOf(name) < 0) this.lists.push(name); return this; }
}

export function quote(s: string): string {
  let out = '"';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 34) out += '\\"';
    else if (c === 92) out += '\\\\';
    else if (c === 10) out += '\\n';
    else if (c === 13) out += '\\r';
    else if (c === 9) out += '\\t';
    else if (c < 32) { let h = c.toString(16); while (h.length < 4) h = '0' + h; out += '\\u' + h; }
    else out += s[i];
  }
  return out + '"';
}

/** A JSON array of strings. */
export function strings(list: string[]): string {
  const parts: string[] = [];
  for (const s of list) parts.push(quote(s));
  return '[' + parts.join(',') + ']';
}

function escXml(s: string): string {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    const c = s.charCodeAt(i);
    if (ch === '&') out += '&amp;';
    else if (ch === '<') out += '&lt;';
    else if (ch === '>') out += '&gt;';
    else if (ch === '"') out += '&quot;';
    else if (c < 32 && c !== 9 && c !== 10 && c !== 13) out += ' ';   // not allowed in XML 1.0
    else out += ch;
  }
  return out;
}

export function toXml(e: El): string {
  let out = '<' + e.name;
  for (let i = 0; i < e.keys.length; i++) if (e.kinds[i] !== 'j') out += ` ${e.keys[i]}="${escXml(e.values[i])}"`;
  if (e.children.length === 0 && e.text === '') return out + '/>';
  out += '>' + escXml(e.text);
  for (const c of e.children) out += toXml(c);
  return out + '</' + e.name + '>';
}

/** The JSON object of an element (its name is the key its parent gives it). */
export function toJson(e: El): string {
  const parts: string[] = [];
  for (let i = 0; i < e.keys.length; i++) parts.push(quote(e.keys[i]) + ':' + (e.kinds[i] === 's' ? quote(e.values[i]) : e.values[i]));
  if (e.text !== '') parts.push('"value":' + quote(e.text));
  const names = e.lists.slice();   // the lists in the order they were declared, then the single children
  for (const c of e.children) if (names.indexOf(c.name) < 0) names.push(c.name);
  for (const name of names) {
    const same: string[] = [];
    let many = e.lists.indexOf(name) >= 0;
    for (const c of e.children) if (c.name === name) { same.push(toJson(c)); many = many || c.many; }
    parts.push(quote(name) + ':' + (many ? '[' + same.join(',') + ']' : same[0]));
  }
  return '{' + parts.join(',') + '}';
}
