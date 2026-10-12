// What Atelier and `zinc lsp` say to each other, as plain functions (no process, no window: selftest.ts checks them):
// the framing of JSON-RPC over a pipe (`Content-Length: <bytes of UTF-8>`, a blank line, the body), file URIs, and the
// answers read into small classes: completion items and their filtering, a signature, a hover, diagnostics, a place.
import { fuzzy, Fuzzy } from './fuzzy';

/** Bytes of `s` in UTF-8 (strings are UTF-16 here; the protocol counts bytes). */
export function utf8Length(s: string): i32 {
  let n: i32 = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    n += c < 0x80 ? 1 : c < 0x800 ? 2 : c >= 0xd800 && c < 0xdc00 ? 4 : c >= 0xdc00 && c < 0xe000 ? 0 : 3;   // a surrogate pair is 4 bytes, counted on its first half
  }
  return n;
}
/** A message ready to write to the server. */
export function frame(body: string): string { return `Content-Length: ${utf8Length(body)}\r\n\r\n${body}`; }

/** Cuts what the server writes into message bodies; a message can come in several chunks, a chunk can hold several messages. */
export class Reader {
  buf: string = '';
  need: i32 = -1;                   // bytes of the body being read, -1 between messages
  at: i32 = 0; bytes: i32 = 0;      // how far the body was counted (a long answer is not counted again at every chunk)
  push(chunk: string): string[] {
    this.buf += chunk;
    const out: string[] = [];
    while (true) {
      if (this.need < 0) {
        const k = this.buf.indexOf('\r\n\r\n'), h = this.buf.indexOf('Content-Length:');
        if (k < 0) break;
        this.need = h >= 0 && h < k ? parseInt(this.buf.slice(h + 15, k).trim()) : 0;
        this.buf = this.buf.slice(k + 4); this.at = 0; this.bytes = 0;
      }
      const b = this.buf;
      let i = this.at, n = this.bytes;
      while (n < this.need && i < b.length) {
        const c = b.charCodeAt(i++);
        n += c < 0x80 ? 1 : c < 0x800 ? 2 : c >= 0xd800 && c < 0xdc00 ? 4 : c >= 0xdc00 && c < 0xe000 ? 0 : 3;
      }
      if (i < b.length && b.charCodeAt(i) >= 0xdc00 && b.charCodeAt(i) < 0xe000) i++;   // the second half of a pair that ends the body
      this.at = i; this.bytes = n;
      if (n < this.need) break;
      out.push(b.slice(0, i));
      this.buf = b.slice(i); this.need = -1;
    }
    return out;
  }
}

const HEX = '0123456789ABCDEF';
function pct(byte: i32): string { return '%' + HEX.slice(byte >> 4, (byte >> 4) + 1) + HEX.slice(byte & 15, (byte & 15) + 1); }
/** file:// URI of a path, escaped as the server escapes it (it finds an open document by this text). */
export function uriOf(path: string): string {
  let out = 'file://';
  for (let i = 0; i < path.length; i++) {
    let c = path.charCodeAt(i);
    if ((c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 47 || c === 45 || c === 95 || c === 46 || c === 126) { out += path.slice(i, i + 1); continue; }
    if (c >= 0xd800 && c < 0xdc00 && i + 1 < path.length) c = 0x10000 + ((c - 0xd800) << 10) + (path.charCodeAt(++i) - 0xdc00);
    if (c < 0x80) out += pct(c);
    else if (c < 0x800) out += pct(0xc0 | (c >> 6)) + pct(0x80 | (c & 63));
    else if (c < 0x10000) out += pct(0xe0 | (c >> 12)) + pct(0x80 | ((c >> 6) & 63)) + pct(0x80 | (c & 63));
    else out += pct(0xf0 | (c >> 18)) + pct(0x80 | ((c >> 12) & 63)) + pct(0x80 | ((c >> 6) & 63)) + pct(0x80 | (c & 63));
  }
  return out;
}
/** The path of a file:// URI. */
export function pathOf(uri: string): string {
  const s = uri.startsWith('file://') ? uri.slice(7) : uri;
  let out = '', i: i32 = 0;
  while (i < s.length) {
    if (s.charCodeAt(i) !== 37 || i + 2 >= s.length) { out += s.slice(i, i + 1); i++; continue; }
    let c: i32 = parseInt(s.slice(i + 1, i + 3), 16);
    i += 3;
    let more: i32 = c >= 0xf0 ? 3 : c >= 0xe0 ? 2 : c >= 0xc0 ? 1 : 0;   // the bytes of one UTF-8 character
    if (more > 0) c &= 0x3f >> more;
    while (more-- > 0 && i + 2 < s.length && s.charCodeAt(i) === 37) { c = (c << 6) | (parseInt(s.slice(i + 1, i + 3), 16) & 63); i += 3; }
    out += c >= 0x10000 ? String.fromCharCode(0xd800 + ((c - 0x10000) >> 10)) + String.fromCharCode(0xdc00 + ((c - 0x10000) & 1023)) : String.fromCharCode(c);
  }
  return out;
}

// ---------------------------------------------------------------- words
export function isIdent(c: i32): boolean { return (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95 || c === 36; }
/** Where the identifier that ends at `caret` starts (`caret` itself when no identifier ends there). */
export function wordStart(text: string, caret: i32): i32 { let i = caret; while (i > 0 && isIdent(text.charCodeAt(i - 1))) i--; return i; }
/** Where the identifier around `p` ends. */
export function wordEnd(text: string, p: i32): i32 { let i = p; while (i < text.length && isIdent(text.charCodeAt(i))) i++; return i; }
/** Inside the quotes of an import (`from 'zinc:`): where the module name starts, else -1. */
export function specStart(text: string, caret: i32): i32 {
  let i = caret;
  while (i > 0) {
    const c = text.charCodeAt(i - 1);
    if (c === 39 || c === 34) break;
    if (c === 10 || c === 32) return -1;
    i--;
  }
  if (i === 0) return -1;
  let ls = i; while (ls > 0 && text.charCodeAt(ls - 1) !== 10) ls--;
  const head = text.slice(ls, i - 1).trim();
  return head.startsWith('import') && (head === 'import' || head.endsWith('from')) ? i : -1;
}

/** The `(` of the call whose arguments the caret is in (looking back a few lines), else -1. */
export function callStart(text: string, caret: i32): i32 {
  let depth: i32 = 0;
  for (let i = caret - 1; i >= 0 && i > caret - 600; i--) {
    const c = text.charCodeAt(i);
    if (c === 41) depth++;
    else if (c === 40) { if (depth === 0) return i; depth--; }
    else if ((c === 59 || c === 123 || c === 125) && depth === 0) return -1;   // a statement ended or a block began: not among arguments
  }
  return -1;
}

// ---------------------------------------------------------------- answers
/** Kinds of completion items (the protocol's numbers) as the one-letter mark of the popup. */
export function kindMark(kind: i32): string {
  return kind === 2 || kind === 3 ? 'ƒ' : kind === 7 || kind === 8 || kind === 22 ? 'C' : kind === 5 || kind === 10 ? 'p' : kind === 9 ? 'm' : kind === 14 ? 'k' : kind === 13 || kind === 20 ? 'e' : 'v';
}
export class Item {
  label: string; kind: i32; detail: string; doc: string;
  score: number = 0; hits: i32[] = [];   // of the last filter: the matched characters of the label
  constructor(label: string, kind: i32, detail: string, doc: string) { this.label = label; this.kind = kind; this.detail = detail; this.doc = doc; }
}
function str(v: any): string { return typeof v === 'string' ? (v as string) : ''; }
function int(v: any): i32 { return typeof v === 'number' ? (v as i32) : 0; }
/** Documentation is a string or { kind, value }. */
function docOf(v: any): string { return typeof v === 'string' ? (v as string) : v !== undefined && v !== null ? str(v.value) : ''; }
/** The items of a completion answer: a list, or { items }. */
export function itemsOf(result: any): Item[] {
  const out: Item[] = [];
  if (result === undefined || result === null) return out;
  const list = Array.isArray(result) ? result : result.items;
  if (!Array.isArray(list)) return out;
  const n: i32 = list.length;
  for (let i = 0; i < n; i++) { const it = list[i]; out.push(new Item(str(it.label), int(it.kind), str(it.detail), docOf(it.documentation))); }
  return out;
}
/** The items that match what is typed, best first: a label that starts with it, then the fuzzy score, then the name. Nothing typed: all, in the server's order. */
export function filterItems(all: Item[], typed: string, max: i32): Item[] {
  if (typed === '') return all.length > max ? all.slice(0, max) : all;
  const out: Item[] = [];
  for (const it of all) {
    const m = fuzzy(typed, it.label, 0);
    if (m === null) continue;
    const row = new Item(it.label, it.kind, it.detail, it.doc);   // a row of its own: the list is drawn again when its rows are new
    row.hits = (m as Fuzzy).hits;
    row.score = (m as Fuzzy).score + (it.label.startsWith(typed) ? 100 : it.label.toLowerCase().startsWith(typed.toLowerCase()) ? 60 : 0);
    out.push(row);
  }
  out.sort((a: Item, b: Item): number => b.score !== a.score ? b.score - a.score : a.label < b.label ? -1 : 1);
  return out.length > max ? out.slice(0, max) : out;
}

/** The signature of the call the caret is in; [from, to) is its active parameter in `label`. */
export class Sig {
  label: string = ''; doc: string = ''; paramDoc: string = '';
  from: i32 = 0; to: i32 = 0;
}
export function sigOf(result: any): Sig | null {
  if (result === undefined || result === null || !Array.isArray(result.signatures)) return null;
  const n: i32 = result.signatures.length, k = int(result.activeSignature);
  if (n === 0) return null;
  const s = result.signatures[k < n ? k : 0], out = new Sig();
  out.label = str(s.label); out.doc = docOf(s.documentation);
  const act = typeof s.activeParameter === 'number' ? int(s.activeParameter) : int(result.activeParameter);
  if (Array.isArray(s.parameters) && act < (s.parameters.length as i32)) {
    const p = s.parameters[act];
    if (Array.isArray(p.label)) { out.from = int(p.label[0]); out.to = int(p.label[1]); }
    else { const name = str(p.label), at = out.label.indexOf(name); if (name !== '' && at >= 0) { out.from = at; out.to = at + name.length; } }
    out.paramDoc = docOf(p.documentation);
  }
  return out;
}

/** A hover answer as [code, text]: the fenced block of its markdown (the name and its type) and what follows it (the doc). */
export function hoverOf(result: any): string[] {
  if (result === undefined || result === null) return [];
  const c = result.contents;
  let md = typeof c === 'string' ? (c as string) : c !== undefined && c !== null ? str(c.value) : '';
  if (md === '') return [];
  let code = '';
  if (md.startsWith('```')) {
    const a = md.indexOf('\n'), z = md.indexOf('\n```', a);
    if (a > 0 && z > a) { code = md.slice(a + 1, z); md = md.slice(z + 4).trim(); }
  }
  return [code, md];
}

export class Problem {
  line: i32; col: i32; severity: i32; message: string;   // 0-based
  constructor(line: i32, col: i32, severity: i32, message: string) { this.line = line; this.col = col; this.severity = severity; this.message = message; }
}
/** The diagnostics of a publishDiagnostics notification (`params`). */
export function problemsOf(params: any): Problem[] {
  const out: Problem[] = [];
  if (params === undefined || params === null || !Array.isArray(params.diagnostics)) return out;
  const n: i32 = params.diagnostics.length;
  for (let i = 0; i < n; i++) {
    const d = params.diagnostics[i];
    out.push(new Problem(int(d.range.start.line), int(d.range.start.character), typeof d.severity === 'number' ? int(d.severity) : 1, str(d.message)));
  }
  return out;
}
/** A definition answer (a location, or a list of them) as [path, line, column] (1-based, as text), [] when there is none. */
export function placeOf(result: any): string[] {
  if (result === undefined || result === null) return [];
  const loc = Array.isArray(result) ? ((result.length as i32) > 0 ? result[0] : null) : result;
  if (loc === null || typeof loc.uri !== 'string') return [];
  return [pathOf(str(loc.uri)), `${int(loc.range.start.line) + 1}`, `${int(loc.range.start.character) + 1}`];
}
