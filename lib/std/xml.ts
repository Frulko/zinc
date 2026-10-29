// zinc:xml: one small element tree, read and written. `parse` reads the XML of a UPnP or SOAP answer, an RSS feed or a device
// description into elements; `toXml` and `toJson` write a tree back (the iPod daemon's Subsonic answers, in XML and in JSON).
// An element has attributes (string, number, boolean, or raw JSON that XML leaves out), children and its text. In JSON, the attributes
// are properties, the children are grouped by name (an array when added as `many`, else one object) and the text is "value", as
// Subsonic's JSON does.
// ponytail: not a general XML engine (no DTD, no namespace resolution: a prefixed name keeps its prefix, `child('title')` also finds
// `dc:title`); entities are the five predefined ones and numeric references. A document that needs more wants a vendored parser.

export class El {
  name: string;
  keys: string[] = [];
  values: string[] = [];
  /** 's' string, 'v' a number or boolean as written, 'j' raw JSON (JSON only) */
  kinds: string[] = [];
  children: El[] = [];
  many: boolean = false;
  /** The text inside the element, its children's text left out (unescaped when read by `parse`). */
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

  /** The value of an attribute, '' when absent. */
  attr(key: string): string { const i = this.keys.indexOf(key); return i < 0 ? '' : this.values[i]; }
  has(key: string): boolean { return this.keys.indexOf(key) >= 0; }
  /** The first child named `name` (a name without a prefix also matches `prefix:name`), null when none. */
  child(name: string): El | null { for (const c of this.children) if (named(c, name)) return c; return null; }
  /** The children named `name`. */
  all(name: string): El[] { const out: El[] = []; for (const c of this.children) if (named(c, name)) out.push(c); return out; }
  /** The first element named `name` below this one, depth first, null when none. */
  find(name: string): El | null {
    for (const c of this.children) {
      if (named(c, name)) return c;
      const d = c.find(name);
      if (d !== null) return d;
    }
    return null;
  }
  /** Every element named `name` below this one, in document order. */
  findAll(name: string, out: El[] = []): El[] {
    for (const c of this.children) { if (named(c, name)) out.push(c); c.findAll(name, out); }
    return out;
  }
  /** The text of the first element named `name` below this one, '' when none. */
  textOf(name: string): string { const e = this.find(name); return e === null ? '' : e.text; }
}

function named(e: El, name: string): boolean {
  if (e.name === name) return true;
  const colon = e.name.indexOf(':');
  return colon >= 0 && name.indexOf(':') < 0 && e.name.length - colon - 1 === name.length && e.name.endsWith(name);
}

/** XML text with its entities replaced: &lt; &gt; &amp; &quot; &apos; and &#N; &#xN;. */
export function unescapeXml(s: string): string {
  if (s.indexOf('&') < 0) return s;
  let out = '';
  let i = 0;
  while (i < s.length) {
    const amp = s.indexOf('&', i);
    if (amp < 0) { out += s.slice(i); break; }
    out += s.slice(i, amp);
    const semi = s.indexOf(';', amp);
    const ent = semi > amp && semi - amp <= 10 ? s.slice(amp + 1, semi) : '';
    let ch = '';
    if (ent === 'lt') ch = '<'; else if (ent === 'gt') ch = '>'; else if (ent === 'amp') ch = '&'; else if (ent === 'quot') ch = '"'; else if (ent === 'apos') ch = "'";
    else if (ent.startsWith('#x') || ent.startsWith('#X')) { const v = parseInt(ent.slice(2), 16); if (!isNaN(v)) ch = String.fromCodePoint(v); }
    else if (ent.startsWith('#')) { const v = parseInt(ent.slice(1)); if (!isNaN(v)) ch = String.fromCodePoint(v); }
    if (ch === '') { out += '&'; i = amp + 1; } else { out += ch; i = semi + 1; }
  }
  return out;
}

/** Text made safe inside an element or an attribute's quotes. */
export function escapeXml(s: string): string {
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

function space(c: string): boolean { return c === ' ' || c === '\n' || c === '\r' || c === '\t'; }

/** Reads an XML document into its root element (the declaration, comments, processing instructions and a DOCTYPE are skipped; CDATA
 *  is text). Lenient: an unclosed element ends with the document, a stray end tag closes up to its match. An empty El named '' when
 *  the text holds no element. */
export function parse(xml: string): El {
  const top = new El('');
  const stack: El[] = [top];
  let i = 0;
  const n = xml.length;
  while (i < n) {
    const lt = xml.indexOf('<', i);
    const cur = stack[stack.length - 1];
    if (lt < 0) { if (stack.length > 1) cur.text += unescapeXml(xml.slice(i)); break; }
    if (lt > i && stack.length > 1) cur.text += unescapeXml(xml.slice(i, lt));
    if (xml.startsWith('<!--', lt)) { const e = xml.indexOf('-->', lt + 4); i = e < 0 ? n : e + 3; continue; }
    if (xml.startsWith('<![CDATA[', lt)) { const e = xml.indexOf(']]>', lt + 9); const end = e < 0 ? n : e; cur.text += xml.slice(lt + 9, end); i = e < 0 ? n : e + 3; continue; }
    if (xml.startsWith('<?', lt)) { const e = xml.indexOf('?>', lt + 2); i = e < 0 ? n : e + 2; continue; }
    if (xml.startsWith('<!', lt)) { const e = xml.indexOf('>', lt + 2); i = e < 0 ? n : e + 1; continue; }
    if (xml.charAt(lt + 1) === '/') {   // an end tag: close up to the element it names
      const gt = xml.indexOf('>', lt);
      const name = xml.slice(lt + 2, gt < 0 ? n : gt).trim();
      let k = stack.length - 1;
      while (k > 0 && stack[k].name !== name) k--;
      if (k > 0) while (stack.length > k) stack.pop();
      i = gt < 0 ? n : gt + 1;
      continue;
    }
    // a start tag: its name, its attributes (quoted with " or '), then > or />
    let j = lt + 1;
    while (j < n && !space(xml.charAt(j)) && xml.charAt(j) !== '>' && xml.charAt(j) !== '/') j++;
    const e = new El(xml.slice(lt + 1, j));
    let closed = false;
    while (j < n) {
      while (j < n && space(xml.charAt(j))) j++;
      const c = xml.charAt(j);
      if (c === '>') { j++; break; }
      if (c === '/') { closed = true; j++; continue; }
      const eq = xml.indexOf('=', j);
      if (eq < 0) { j = n; break; }
      const key = xml.slice(j, eq).trim();
      let q = eq + 1;
      while (q < n && space(xml.charAt(q))) q++;
      const quote = xml.charAt(q);
      if (quote !== '"' && quote !== "'") { j = q; continue; }   // malformed: skip on
      const end = xml.indexOf(quote, q + 1);
      e.s(key, unescapeXml(xml.slice(q + 1, end < 0 ? n : end)));
      j = end < 0 ? n : end + 1;
    }
    cur.children.push(e);
    if (!closed) stack.push(e);
    i = j;
  }
  return top.children.length > 0 ? top.children[0] : top;
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

export function toXml(e: El): string {
  let out = '<' + e.name;
  for (let i = 0; i < e.keys.length; i++) if (e.kinds[i] !== 'j') out += ` ${e.keys[i]}="${escapeXml(e.values[i])}"`;
  if (e.children.length === 0 && e.text === '') return out + '/>';
  out += '>' + escapeXml(e.text);
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
