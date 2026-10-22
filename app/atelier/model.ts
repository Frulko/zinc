// Zinc Atelier model: the parts of the app that are plain data in, plain data out (diagnostics, profiles, the project tree).
import * as fs from 'zinc:fs';

export interface Diag { file: string; line: i32; col: i32; severity: string; code: string; message: string }

/** `path:line:col: error Z0103: message` lines of `zinc check`, as printed by the compiler. */
export function parseDiagnostics(text: string): Diag[] {
  const out: Diag[] = [];
  const lines = text.split('\n');
  for (let i: i32 = 0; i < lines.length; i++) {
    const l = lines[i];
    const at = l.indexOf(': error ');
    if (at < 0) continue;
    const head = l.substring(0, at).split(':');
    if (head.length < 3) continue;
    const rest = l.substring(at + 8);
    const sp = rest.indexOf(': ');
    out.push({ file: head.slice(0, head.length - 2).join(':'), line: parseInt(head[head.length - 2]), col: parseInt(head[head.length - 1]),
               severity: 'error', code: sp < 0 ? '' : rest.substring(0, sp), message: sp < 0 ? rest : rest.substring(sp + 2) });
  }
  return out;
}

export interface Hot { name: string; self: i32; share: i32 }

/** The functions with the most self samples of a folded-stacks profile (`a;b;c count` per line), most first. */
export function hottest(folded: string, limit: i32): Hot[] {
  const counts = new Map<string, i32>();
  let total: i32 = 0;
  const lines = folded.split('\n');
  for (let i: i32 = 0; i < lines.length; i++) {
    const l = lines[i];
    const sp = l.lastIndexOf(' ');
    if (sp < 0) continue;
    const n = parseInt(l.substring(sp + 1));
    const frames = l.substring(0, sp).split(';');
    const name = frames[frames.length - 1];
    counts.set(name, (counts.has(name) ? (counts.get(name) as i32) : 0) + n);
    total += n;
  }
  const out: Hot[] = [];
  counts.forEach((v: i32, k: string) => { out.push({ name: k, self: v, share: total > 0 ? Math.round(v * 100 / total) : 0 }); });
  out.sort((a: Hot, b: Hot) => b.self - a.self);
  return out.slice(0, limit);
}

export interface Phase { name: string; total: i32; count: i32 }

/** The phases of a ZINC_TRACE file (Chrome trace events, `{"name":"layout","ph":"X","ts":..,"dur":123}`): microseconds and count per name, longest first.
 *  A text scan, not JSON.parse: a program that uses `any` cannot use zinc:ui (the undefined of Dyn differs from null). */
export function tracePhases(json: string): Phase[] {
  const sum = new Map<string, i32>();
  const cnt = new Map<string, i32>();
  const parts = json.split('{"name":"');
  for (let i: i32 = 1; i < parts.length; i++) {
    const e = parts[i];
    const q = e.indexOf('"');
    const d = e.indexOf('"dur":');
    if (q < 0 || d < 0 || e.indexOf('"ph":"X"') < 0) continue;
    const name = e.substring(0, q);
    const rest = e.substring(d + 6);
    let end = 0;
    while (end < rest.length && rest.charCodeAt(end) >= 48 && rest.charCodeAt(end) <= 57) end++;
    sum.set(name, (sum.has(name) ? (sum.get(name) as i32) : 0) + parseInt(rest.substring(0, end)));
    cnt.set(name, (cnt.has(name) ? (cnt.get(name) as i32) : 0) + 1);
  }
  const out: Phase[] = [];
  sum.forEach((v: i32, k: string) => { out.push({ name: k, total: v, count: cnt.get(k) as i32 }); });
  out.sort((a: Phase, b: Phase) => b.total - a.total);
  return out;
}

function walk(dir: string, rel: string, depth: i32, out: string[]): void {
  const entries = fs.readDir(dir);
  for (let i: i32 = 0; i < entries.length; i++) {
    const e = entries[i];
    if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === 'build') continue;
    const r = rel === '' ? e.name : rel + '/' + e.name;
    if (e.isDirectory) { if (depth < 3) walk(dir + '/' + e.name, r, depth + 1, out); }
    else if (e.name.endsWith('.ts') || e.name.endsWith('.tsx')) out.push(r);
  }
}

/** The source files of a project (.ts, .tsx), relative to `root`, up to three levels deep, sorted. */
export function projectFiles(root: string): string[] {
  const out: string[] = [];
  walk(root, '', 0, out);
  out.sort((a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0));
  return out;
}

// ---- devices (ZN-729.06): what `zinc device` prints with --json

export interface Device { name: string; address: string; state: string; kind: string; id: string }

/** The rows of `zinc device list --json`: the agents the network shows and the paired devices. Anything else: no row. */
export function parseDevices(json: string): Device[] {
  const out: Device[] = [];
  try {
    for (const d of JSON.parse(json)) {
      const name: string = d.name, address: string = d.address, state: string = d.state, kind: string = d.kind, id: string = d.id;
      out.push({ name, address, state, kind, id });
    }
  } catch (e) { /* not a list: the command failed and said why on stderr */ }
  return out;
}

export interface DeviceApp { name: string; running: boolean; rss: number }
/** What a device is and how it is doing: one sample of `zinc device top --json`. `temp` is in °C, -1 when the system gives none. */
export interface Figures { name: string; kind: string; system: string; cpu: string; load: number; memFree: number; memTotal: number; temp: number; apps: DeviceApp[] }

/** One line of `zinc device top --json` (the device's info, a sample a second), or null when the line is not one. */
export function parseFigures(line: string): Figures | null {
  try {
    const d = JSON.parse(line);
    const name: string = d.name, kind: string = d.kind, os: string = d.os, version: string = d.osVersion, arch: string = d.arch, chip: string = d.cpu;
    const cores: i32 = d.cores, load: number = d.load1, memFree: number = d.memFree, memTotal: number = d.memTotal;
    let temp: number = -1;
    if (d.tempC !== undefined) temp = d.tempC;
    const apps: DeviceApp[] = [];
    for (const a of d.apps) {
      const app: string = a.name, running: boolean = a.running;
      let rss: number = 0;
      if (a.rss !== undefined) rss = a.rss;   // a stopped app has none
      apps.push({ name: app, running, rss });
    }
    return { name, kind, system: `${os} ${version} ${arch}`, cpu: `${chip === '' ? '' : chip + ', '}${cores} core${cores > 1 ? 's' : ''}`, load, memFree, memTotal, temp, apps };
  } catch (e) { return null; }
}

/** '3.1 GiB', '160 MiB': a size as `zinc device info` writes it. */
export function sizeText(bytes: number): string {
  return bytes >= 1073741824 ? (bytes / 1073741824).toFixed(1) + ' GiB' : Math.round(bytes / 1048576) + ' MiB';
}

// ---------------------------------------------------------------- the step lines of a command
/** A step line of the CLI: two spaces, a name, its text in columns ("  compile    6 files      35 ms"). The notes of a command are steps too
 *  ("  device     spark is linux aarch64: exporting for rpi"), and so is the progress of a transfer ("  send       45%  16 MiB of 35 MiB
 *  2.1 MiB/s"). Returns [the name, the text with its columns joined by commas]; [] for any other line: what a program prints, an error. */
export function stepOf(text: string): string[] {
  const gap = text.indexOf('  ', 3);
  if (!text.startsWith('  ') || text.length <= 4 || text.charCodeAt(2) === 32 || gap <= 0 || gap >= 14) return [];
  const cols: string[] = [];
  for (const c of text.slice(gap).split('  ')) if (c.trim() !== '') cols.push(c.trim());
  return [text.slice(2, gap), cols.join(', ')];
}

// ---------------------------------------------------------------- zinc.json: what a project says, and the smallest edit of its text
// The engine has no command that prints a parsed project, so the card reads the text here; `zinc check` is what validates it.
// One scanner serves reading and writing: it finds where a value is in the text, so an edit replaces that value and nothing else
// (the other keys, their order and the layout stay byte for byte).
function ws(s: string, i: i32): i32 { while (i < s.length && (s.charCodeAt(i) === 32 || s.charCodeAt(i) === 9 || s.charCodeAt(i) === 10 || s.charCodeAt(i) === 13)) i++; return i; }
/** The end of the JSON value that starts at i: a string, an object, an array, a number or a word. */
function valueEnd(s: string, i: i32): i32 {
  const c = s.charCodeAt(i);
  if (c === 34) { i++; while (i < s.length && s.charCodeAt(i) !== 34) i += s.charCodeAt(i) === 92 ? 2 : 1; return i + 1; }
  if (c === 123 || c === 91) {
    let depth: i32 = 0;
    while (i < s.length) {
      const d = s.charCodeAt(i);
      if (d === 34) { i = valueEnd(s, i); continue; }
      if (d === 123 || d === 91) depth++;
      else if (d === 125 || d === 93) { depth--; if (depth === 0) return i + 1; }
      i++;
    }
    return i;
  }
  while (i < s.length && ',}] \t\r\n'.indexOf(s.charAt(i)) < 0) i++;
  return i;
}
/** The members of the object that starts at `at`: [key start, value start, value end] for each, then where its `}` is. */
function members(s: string, at: i32): i32[] {
  const out: i32[] = [];
  let i = ws(s, at + 1);
  while (i < s.length && s.charCodeAt(i) === 34) {
    const k = i;
    i = ws(s, valueEnd(s, i));
    if (s.charCodeAt(i) !== 58) break;
    const v = ws(s, i + 1), ve = valueEnd(s, v);
    out.push(k); out.push(v); out.push(ve);
    i = ws(s, ve);
    if (s.charCodeAt(i) === 44) i = ws(s, i + 1);
  }
  out.push(i);
  return out;
}
function keyAt(s: string, k: i32): string { return s.slice(k + 1, valueEnd(s, k) - 1); }
/** Where the value at `path` is: [start, end], or [] when a key of the path is missing (or the text is no object). */
function span(s: string, path: string[]): i32[] {
  let at = ws(s, 0);
  if (s.charCodeAt(at) !== 123) return [];
  let end = valueEnd(s, at);
  for (const key of path) {
    if (s.charCodeAt(at) !== 123) return [];
    const m = members(s, at);
    let hit = false;
    for (let j = 0; j + 2 < m.length; j += 3) if (keyAt(s, m[j]) === key) { at = m[j + 1]; end = m[j + 2]; hit = true; break; }
    if (!hit) return [];
  }
  return [at, end];
}
/** The text of the value at `path` as it is written ('' when it is not there): `"hero"`, `1100`, `["menu", "tray"]`. */
export function jsonGet(text: string, path: string[]): string { const p = span(text, path); return p.length === 0 ? '' : text.slice(p[0], p[1]); }
/** The keys of the object at `path`, in the order of the text. */
export function jsonKeys(text: string, path: string[]): string[] {
  const p = span(text, path), out: string[] = [];
  if (p.length === 0 || text.charCodeAt(p[0]) !== 123) return out;
  const m = members(text, p[0]);
  for (let j = 0; j + 2 < m.length; j += 3) out.push(keyAt(text, m[j]));
  return out;
}
/** The text with the value at `path` replaced by `value` (JSON text); a key that is missing is added after the last one of its object,
 *  on its own line when the object is written on several. Nothing else changes. */
export function jsonSet(text: string, path: string[], value: string): string {
  let at = ws(text, 0);
  if (text.charCodeAt(at) !== 123) return text;
  for (let d = 0; d < path.length; d++) {
    const m = members(text, at);
    let v: i32 = -1, ve: i32 = -1;
    for (let j = 0; j + 2 < m.length; j += 3) if (keyAt(text, m[j]) === path[d]) { v = m[j + 1]; ve = m[j + 2]; break; }
    if (v >= 0 && d < path.length - 1 && text.charCodeAt(v) === 123) { at = v; continue; }
    let put = value;
    for (let j = path.length - 1; j > d; j--) put = `{ ${JSON.stringify(path[j])}: ${put} }`;   // what is missing below this key
    if (v >= 0) return text.slice(0, v) + put + text.slice(ve);
    const member = `${JSON.stringify(path[d])}: ${put}`;
    if (m.length === 1) return text.slice(0, at + 1) + ' ' + member + ' ' + text.slice(m[0]);   // an empty object
    const first = m[0], last = m[m.length - 2];
    let line = first;
    while (line > at + 1 && text.charCodeAt(line - 1) !== 10) line--;
    const rows = text.slice(at, first).indexOf('\n') >= 0;
    return text.slice(0, last) + (rows ? ',\n' + text.slice(line, first) : ', ') + member + text.slice(last);
  }
  return text;
}

export interface Target { name: string; width: i32; height: i32; display: string }
/** What zinc.json says of a project; '' and [] for what it does not say. */
export class Project {
  name: string = ''; id: string = ''; version: string = ''; icon: string = ''; entry: string = ''; assets: string = '';
  targets: Target[] = []; permissions: string[] = []; declared: boolean = false; requires: string[] = [];
}
function jsonText(raw: string): string {
  if (!raw.startsWith('"')) return '';
  try { const v: string = JSON.parse(raw); return v; } catch (e) { return ''; }
}
function jsonTexts(raw: string): string[] {
  const out: string[] = [];
  if (!raw.startsWith('[')) return out;
  try { for (const x of JSON.parse(raw)) { const v: string = x; out.push(v); } } catch (e) { /* not a list of texts */ }
  return out;
}
function jsonInt(raw: string): i32 { const n = parseInt(raw); return raw === '' || isNaN(n) ? 0 : n; }
/** Reads the text of a zinc.json; null when it is not one JSON object. The `app` object wins over the keys of the same name beside it. */
export function readProject(text: string): Project | null {
  const at = ws(text, 0);
  if (text.charCodeAt(at) !== 123 || ws(text, valueEnd(text, at)) < text.length) return null;
  const p = new Project();
  const pick = (key: string): string => { const a = jsonText(jsonGet(text, ['app', key])); return a !== '' ? a : jsonText(jsonGet(text, [key])); };
  p.name = pick('name'); p.id = pick('id'); p.version = pick('version'); p.icon = pick('icon');
  p.entry = jsonText(jsonGet(text, ['entry']));
  if (p.entry === '') p.entry = jsonText(jsonGet(text, ['main']));
  p.assets = jsonText(jsonGet(text, ['assets']));
  for (const name of jsonKeys(text, ['targets'])) {
    const d = jsonGet(text, ['targets', name, 'display']);
    p.targets.push({ name, width: jsonInt(jsonGet(text, ['targets', name, 'width'])), height: jsonInt(jsonGet(text, ['targets', name, 'height'])),
      display: d.startsWith('{') ? jsonText(jsonGet(text, ['targets', name, 'display', 'driver'])) : jsonText(d) });
  }
  p.declared = jsonGet(text, ['permissions']) !== '';
  p.permissions = jsonTexts(jsonGet(text, ['permissions']));
  p.requires = jsonTexts(jsonGet(text, ['requires']));
  return p;
}
/** A list of texts as zinc.json writes one on a line: `["menu", "tray"]`. */
export function jsonList(items: string[]): string { return '[' + items.map((s: string) => JSON.stringify(s)).join(', ') + ']'; }

/** The permissions of zinc.json that allow one thing each (docs/guide/08-security.md); what each allows is atelier.permission.<id>. */
const ALLOWS: string[] = ['notification', 'notifications', 'menu', 'tray', 'dialog', 'window', 'shortcut', 'instance', 'deep-link', 'autostart', 'dock', 'power',
  'clipboard', 'opener', 'update', 'process', 'camera', 'microphone', 'location', 'serial'];
/** What a permission of zinc.json allows, as the key of its sentence in atelier.json and that sentence's params: ['atelier.permission.fs_read_under',
 *  'path', 'data']. A permission narrowed by what follows its colon (`window:state`) is atelier.permission.only around its own. [] for an id the engine
 *  does not know. */
export function permissionWords(id: string): string[] {
  const c = id.indexOf(':'), f = c < 0 ? id : id.slice(0, c), rest = c < 0 ? '' : id.slice(c + 1), k = 'atelier.permission.';
  if (f === 'fs') return rest === '' ? [k + 'fs'] : rest === 'read' ? [k + 'fs_read'] : rest === 'write' ? [k + 'fs_write']
    : rest.startsWith('read:') ? [k + 'fs_read_under', 'path', rest.slice(5)] : rest.startsWith('write:') ? [k + 'fs_write_under', 'path', rest.slice(6)] : [];
  if (f === 'net') return rest === '' || rest === '*' ? [k + 'net'] : rest.startsWith('unix:') ? [k + 'net_unix', 'path', rest.slice(5)] : [k + 'net_host', 'host', rest];
  if (ALLOWS.indexOf(f) < 0) return [];
  const own = k + (f === 'notifications' ? 'notification' : f);
  return rest === '' ? [own] : [k + 'only', 'id', own, 'detail', rest];
}
/** The modules a source text imports that are not its own files: `zinc:ui`, `three`. */
export function importsOf(source: string): string[] {
  const out: string[] = [];
  for (const q of ["from '", 'from "', "import '", 'import "']) {
    let k = source.indexOf(q);
    while (k >= 0) {
      const a = k + q.length, b = source.indexOf(q.charAt(q.length - 1), a);
      if (b < 0) break;
      const spec = source.slice(a, b);
      if (spec !== '' && !spec.startsWith('.') && !spec.startsWith('/') && spec.indexOf('\n') < 0 && out.indexOf(spec) < 0) out.push(spec);
      k = source.indexOf(q, b);
    }
  }
  return out;
}
