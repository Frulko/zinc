// The sketch and its open files. A sketch is a folder; its source files are the tabs (no file tree): the main file first,
// then the others. A buffer is modified while its text differs from the last saved text; nothing is ever lost on the way
// out of a tab or a sketch: a modified buffer is saved when its tab closes, when the sketch runs and when another opens.
import { createSignal, NodeRef } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import * as fs from 'zinc:fs';
import * as sys from 'zinc:sys';
import { Doc } from './document';
import { langOf } from './syntax';
import { History } from './edit';
import { t } from './text';

export class Diagnostic {
  line: i32; col: i32; severity: i32; message: string;   // 0-based line / column; severity 1 error, 2 warning
  constructor(line: i32, col: i32, severity: i32, message: string) { this.line = line; this.col = col; this.severity = severity; this.message = message; }
}

export class Buffer {
  path: string; name: string;
  doc: Doc;
  text: () => string; setText: (v: string) => void;
  saved: () => string; setSaved: (v: string) => void;
  diagnostics: () => Diagnostic[]; setDiagnostics: (v: Diagnostic[]) => void;
  crlf: boolean;
  ref: NodeRef = new NodeRef();   // the buffer's textarea (each buffer keeps its own: caret, scroll)
  caret: i32 = -1;
  // the selections (flat [anchor, head...], see edit.ts) and the undo history; the text field shows the main one
  sels: i32[] = [0, 0]; main: i32 = 0;
  hist: History = new History();
  goal: i32[] = [];   // the columns the cursors aim at while they move up and down (edit.ts move)
  addNext: boolean = false; dragAdd: boolean = false; collapse: boolean = false;   // what the next pointer-made selection does (Editor.tsx)
  constructor(path: string, name: string, text: string) {
    this.path = path; this.name = name;
    this.crlf = text.indexOf('\r\n') >= 0;
    const t = this.crlf ? text.replaceAll('\r\n', '\n') : text;
    this.doc = new Doc(langOf(path));
    this.doc.setText(t);
    const [a, sa] = createSignal<string>(t); this.text = a; this.setText = sa;
    const [b, sb] = createSignal<string>(t); this.saved = b; this.setSaved = sb;
    const [d, sd] = createSignal<Diagnostic[]>([]); this.diagnostics = d; this.setDiagnostics = sd;
  }
  modified(): boolean { return this.text() !== this.saved(); }
  node(): i32 { return this.ref.node; }
}

export const [buffers, setBuffers] = createSignal<Buffer[]>([]);
export const [active, setActiveSignal] = createSignal<Buffer | null>(null);
/** Short message on the status line (a file saved), cleared after a few seconds by the frame loop. */
export const [notice, setNotice] = createSignal<string>('');
let noticeAge: number = 0;
export function say(s: string): void { setNotice(s); noticeAge = 0; }
export function stepNotice(dt: number): void { if (notice() !== '') { noticeAge += dt; if (noticeAge > 3) setNotice(''); } }

/** Hooks set by the app (diagnostics), so this module does not depend on them. */
let onOpened: (b: Buffer) => void = (b: Buffer) => {};
let onSaved: (b: Buffer) => void = (b: Buffer) => {};
export function setHooks(opened: (b: Buffer) => void, saved: (b: Buffer) => void): void { onOpened = opened; onSaved = saved; }

let focusWanted: Buffer | null = null;
/** Shows a buffer; its editor takes the keyboard focus at the next frame (after the press that opened it). */
export function activate(b: Buffer, focus: boolean = true): void {
  setActiveSignal(b);
  if (focus) { focusWanted = b; nodeWanted = -1; }
}
let nodeWanted: i32 = -1;
/** Focuses a node at the next frame: after the pointer press being handled (which moves the focus itself). */
export function focusLater(h: i32): void { nodeWanted = h; focusWanted = null; }
/** Called once per frame: gives the focus asked by activate() / focusLater(). */
export function applyFocus(): void {
  if (nodeWanted >= 0) { ui.focusNode(nodeWanted); nodeWanted = -1; return; }
  const b = focusWanted;
  if (b === null || (b as Buffer).node() < 0) return;
  ui.focusNode((b as Buffer).node());
  focusWanted = null;
}

export function baseName(path: string): string { const i = path.lastIndexOf('/'); return i < 0 ? path : path.slice(i + 1); }
function isDir(path: string): boolean { return fs.exists(path + '/.'); }

/** Opens a file as a tab (or switches to it). */
export function openFile(path: string, focus: boolean = true): Buffer | null {
  for (const b of buffers()) if (b.path === path) { activate(b, focus); return b; }
  let text = '';
  try { text = fs.readText(path); } catch (e) { say(t('atelier.file.cannot_open', ['name', baseName(path)])); return null; }
  const b = new Buffer(path, tabName(path), text);
  setBuffers(buffers().concat([b]));
  activate(b, focus);
  onOpened(b);
  return b;
}

/** Closes a tab. The file stays in the sketch (the tab menu lists it); its changes are saved first. */
export function closeBuffer(b: Buffer): void {
  if (b.modified()) save(b);
  const list = buffers().slice();
  const i = list.indexOf(b);
  if (i < 0) return;
  list.splice(i, 1);
  setBuffers(list);
  if (active() === b) {
    if (list.length === 0) setActiveSignal(null);
    else activate(list[Math.min(i, list.length - 1)]);
  }
}

export function save(b: Buffer): boolean {
  const text = b.text();
  try { fs.writeText(b.path, b.crlf ? text.replaceAll('\n', '\r\n') : text); } catch (e) { say(t('atelier.file.cannot_save', ['name', b.name])); return false; }
  b.setSaved(text);
  say(t('atelier.file.saved', ['name', b.name]));
  onSaved(b);
  return true;
}
export function saveAll(): void { for (const b of buffers()) if (b.modified()) save(b); }

/** A buffer edited by the user. */
export function edited(b: Buffer, v: string): void { b.doc.setText(v); b.setText(v); }

/** Next / previous tab (⌃Tab, ⌘⇧[ ]). */
export function cycle(step: i32): void {
  const list = buffers(), cur = active();
  if (list.length === 0 || cur === null) return;
  const i = list.indexOf(cur as Buffer);
  activate(list[(i + step + list.length) % list.length]);
}

/** Where this app's own files are (its examples, the inspector beside it): the working directory when zinc runs the project, else
 *  found from the launch directory or the binary. '' when not found. */
function appHome(): string {
  const bin = sys.env('ZINC_BIN'), up = bin.lastIndexOf('/build/');
  const cands: string[] = ['.', sys.launchDir() + '/app/atelier', sys.launchDir() + '/app/atelier', sys.launchDir()];
  if (up > 0) cands.push(bin.slice(0, up) + '/app/atelier');
  if (bin !== '') cands.push(bin.slice(0, bin.lastIndexOf('/')) + '/../Resources/zinc/app/atelier');
  for (const c of cands) if (fs.exists(c + '/examples/index.txt')) { try { return fs.realpath(c); } catch (e) { return c; } }
  return '';
}
export const APP_HOME: string = appHome();

// ---------------------------------------------------------------- the sketch
export const [sketchDir, setSketchDir] = createSignal<string>('');
export function sketchName(): string { return sketchDir() === '' ? t('atelier.sketch.none') : baseName(sketchDir()); }

/** Where new sketches and copies of examples go: $ZINC_ATELIER_HOME, else ~/Documents/Zinc. */
export function sketchbook(): string {
  const e = sys.env('ZINC_ATELIER_HOME');
  return e !== '' ? e : sys.env('HOME') + '/Documents/Zinc';
}
function isSource(name: string): boolean {
  return !name.startsWith('.') && (name.endsWith('.ts') || name.endsWith('.tsx') || name.endsWith('.js') || name.endsWith('.json') || name.endsWith('.md') || name.endsWith('.css'))
    && name !== 'zinc.lock' && name !== 'tsconfig.json';
}
/** "entry" of the sketch's zinc.json, or ''. */
function entryOf(dir: string): string {
  try {
    const cfg = fs.readText(dir + '/zinc.json'), k = cfg.indexOf('"entry"');
    if (k >= 0) { const a = cfg.indexOf('"', cfg.indexOf(':', k) + 1), z = cfg.indexOf('"', a + 1); if (a > 0 && z > a) return cfg.slice(a + 1, z); }
  } catch (e) { }
  return '';
}
/** The file `zinc run` starts: zinc.json "entry", else main.tsx / main.ts, else the first source file. '' when the sketch has none. */
export function mainFile(dir: string): string {
  const e = entryOf(dir);
  if (e !== '' && fs.exists(dir + '/' + e)) return e;
  for (const n of ['main.tsx', 'main.ts', 'src/main.tsx', 'src/main.ts', 'main.js']) if (fs.exists(dir + '/' + n)) return n;
  for (const n of sketchFiles(dir)) if (n.endsWith('.ts') || n.endsWith('.tsx') || n.endsWith('.js')) return n;
  return '';
}
/** The files of a sketch that can be tabs: its sources, in its folders too (not the hidden ones, nor what tools write), the top
 *  level first, zinc.json last. Paths from the sketch's folder. */
export function sketchFiles(dir: string): string[] {
  const out: string[] = [];
  collect(dir, '', 0, out);
  if (fs.exists(dir + '/zinc.json')) out.push('zinc.json');
  return out;
}
function collect(dir: string, rel: string, depth: i32, out: string[]): void {
  let names: string[] = [];
  try { names = fs.list(rel === '' ? dir : dir + '/' + rel); } catch (e) { return; }
  names.sort((a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0);
  const folders: string[] = [];
  for (const n of names) {
    const r = rel === '' ? n : rel + '/' + n;
    if (n.startsWith('.') || n === 'node_modules' || n === 'build' || n === 'dist') continue;
    if (isDir(dir + '/' + r)) folders.push(r);
    else if (isSource(n) && r !== 'zinc.json' && out.length < 500) out.push(r);
  }
  if (depth < 5) for (const f of folders) collect(dir, f, depth + 1, out);
}
/** The name of a file on its tab: its path in the sketch, without the src/ every file would carry (`game/game.ts`). */
export function tabName(path: string): string {
  const d = sketchDir();
  if (d === '' || !path.startsWith(d + '/')) return baseName(path);
  const rel = path.slice(d.length + 1);
  return rel.startsWith('src/') ? rel.slice(4) : rel;
}
const OPEN_ALL: i32 = 8;   // a sketch with more code files opens its main file only: the others come from the + of the tab strip

/** Opens a sketch folder: its code files become the tabs, the main file first and active. */
export function openSketch(dir: string): boolean {
  const d = dir.length > 1 && dir.endsWith('/') ? dir.slice(0, dir.length - 1) : dir;
  if (!isDir(d)) { say(t('atelier.sketch.not_found', ['path', d])); return false; }
  saveAll();
  setBuffers([]); setActiveSignal(null);
  setSketchDir(d);
  const main = mainFile(d);
  if (main !== '') openFile(d + '/' + main, false);
  const code = sketchFiles(d).filter((n: string) => n !== main && (n.endsWith('.ts') || n.endsWith('.tsx') || n.endsWith('.js')));
  if (code.length < OPEN_ALL) for (const n of code) openFile(d + '/' + n, false);
  const first = buffers();
  if (first.length > 0) activate(first[0]);
  try { fs.writeText(lastFile(), d); } catch (e) { }
  return true;
}
/** Where the path of the last sketch is kept: with zinc's own files (~/.zinc), or in the sketchbook a test names. */
function lastFile(): string {
  const book = sys.env('ZINC_ATELIER_HOME'), home = sys.env('ZINC_HOME') !== '' ? sys.env('ZINC_HOME') : sys.env('HOME') + '/.zinc';
  const dir = book !== '' ? book : home;
  fs.mkdir(dir, true);
  return dir + (book !== '' ? '/.last' : '/atelier.last');
}
/** The sketch opened last time ('' when none, or gone). */
export function lastSketch(): string {
  try { const d = fs.readText(lastFile()).trim(); return isDir(d) ? d : ''; } catch (e) { return ''; }
}

/** A folder name that is free in the sketchbook: `base`, else base_2, base_3... */
export function freeName(base: string): string {
  const root = sketchbook();
  if (!fs.exists(root + '/' + base)) return base;
  let n: i32 = 2;
  while (fs.exists(`${root}/${base}_${n}`)) n++;
  return `${base}_${n}`;
}
/** A new sketch's main.ts: a circle that breathes, under a comment in the language of the interface. */
const STARTER = (): string => t('atelier.sketch.starter').split('\n').map((l: string) => '// ' + l).join('\n') + `
import { onFrame, clear, rrect, width, height } from 'zinc:gfx';

let t = 0;
onFrame((dt: number) => {
  t += dt;
  clear(0x1c1b20);
  const r = 40 + 10 * Math.sin(t * 2);
  rrect(width() / 2 - r, height() / 2 - r, r * 2, r * 2, r, 0x9388ff, 255);
});
`;
/** Creates an empty sketch in the sketchbook and opens it. */
export function newSketch(): void {
  const dir = sketchbook() + '/' + freeName('sketch');
  try { fs.mkdir(dir, true); fs.writeText(dir + '/main.ts', STARTER()); } catch (e) { say(t('atelier.sketch.cannot_create', ['path', sketchbook()])); return; }
  openSketch(dir);
}
function copyDir(from: string, to: string): void {
  fs.mkdir(to, true);
  for (const e of fs.readDir(from)) {
    if (e.name.startsWith('.')) continue;
    if (e.isDirectory) copyDir(from + '/' + e.name, to + '/' + e.name); else fs.copyFile(from + '/' + e.name, to + '/' + e.name);
  }
}
/** Opens a copy of an example (a folder) in the sketchbook: the example itself is never edited. */
export function openCopy(from: string): boolean {
  const dir = sketchbook() + '/' + freeName(baseName(from));
  try { copyDir(from, dir); } catch (e) { say(t('atelier.sketch.cannot_copy', ['path', sketchbook()])); return false; }
  return openSketch(dir);
}

/** A file name typed by the user, made valid: no folder, an extension (.ts when none). '' when nothing is left. */
export function fileName(typed: string): string {
  let n = typed.trim().split('/').join('').split(' ').join('_');
  if (n === '' || n.startsWith('.')) return '';
  if (n.lastIndexOf('.') <= 0) n += '.ts';
  return n;
}
/** Adds a file to the sketch and opens its tab. */
export function newFile(typed: string): void {
  const n = fileName(typed), path = sketchDir() + '/' + n;
  if (n === '') { say(t('atelier.file.needs_name')); return; }
  if (fs.exists(path)) { say(t('atelier.file.exists', ['name', n])); openFile(path); return; }
  try { fs.writeText(path, ''); } catch (e) { say(t('atelier.file.cannot_create', ['name', n])); return; }
  openFile(path);
}
/** Renames the file of a tab (saved first). */
export function renameFile(b: Buffer, typed: string): void {
  const n = fileName(typed), dir = b.path.slice(0, b.path.lastIndexOf('/')), path = dir + '/' + n;
  if (n === '' || n === baseName(b.path)) return;
  if (fs.exists(path)) { say(t('atelier.file.exists', ['name', n])); return; }
  if (b.modified() && !save(b)) return;
  try { fs.rename(b.path, path); } catch (e) { say(t('atelier.file.cannot_rename', ['name', b.name])); return; }
  const text = b.text(), list = buffers().slice(), i = list.indexOf(b);
  const nb = new Buffer(path, tabName(path), text);   // a new buffer: the language follows the extension
  list[i] = nb;
  setBuffers(list);
  activate(nb);
  say(t('atelier.file.renamed', ['name', n]));
}
/** Removes the file of a tab from the sketch. */
export function deleteFile(b: Buffer): void {
  if (!fs.remove(b.path)) { say(t('atelier.file.cannot_delete', ['name', b.name])); return; }
  b.setSaved(b.text());
  closeBuffer(b);
  say(t('atelier.file.deleted', ['name', b.name]));
}
