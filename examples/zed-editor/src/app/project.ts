// The project: a folder read with zinc:fs. Directories load their children when first expanded; the panel shows the
// flattened list of visible entries (`rows`). The file finder walks the whole tree once (`allFiles`).
import { createSignal } from 'zinc:ui/solid';
import * as fs from 'zinc:fs';
import * as sys from 'zinc:sys';
import { Spring } from './motion';

/** Folders never shown (build output, dependencies, VCS data). */
const IGNORED: string[] = ['.git', 'node_modules', 'build', 'dist', '.DS_Store', 'zinc.storage'];

export class Entry {
  name: string; path: string; dir: boolean; depth: i32;
  parent: Entry | null;
  children: Entry[] = [];
  loaded: boolean = false;
  open: boolean = false;
  chevron: Spring = new Spring(0, 320, 30);   // 0 pointing right, 1 pointing down
  constructor(name: string, path: string, dir: boolean, depth: i32, parent: Entry | null) {
    this.name = name; this.path = path; this.dir = dir; this.depth = depth; this.parent = parent;
  }
  /** Path relative to the project root ('src/main.ts'). */
  rel(): string { return this.path.length > root.path.length ? this.path.slice(root.path.length + 1) : this.name; }
}

function isDir(path: string): boolean { return fs.exists(path + '/.'); }
function baseName(path: string): string { const i = path.lastIndexOf('/'); return i < 0 ? path : path.slice(i + 1); }

/** The project folder: the first program argument, else the bundled sample (from the repo root or the example). */
function findRoot(): string {
  const a = sys.args();
  if (a.length > 0 && a[0] !== '' && isDir(a[0])) return trimSlash(a[0]);
  for (const p of ['examples/zed-editor/sample', 'sample', '../sample']) if (isDir(p)) return p;
  return '.';
}
function trimSlash(p: string): string { return p.length > 1 && p.endsWith('/') ? p.slice(0, p.length - 1) : p; }

export const root: Entry = new Entry('', findRoot(), true, -1, null);
root.name = baseName(root.path === '.' ? 'project' : root.path);
export const [rows, setRows] = createSignal<Entry[]>([]);
export const [selected, setSelected] = createSignal<Entry | null>(null);

function load(e: Entry): void {
  if (e.loaded) return;
  e.loaded = true;
  let names: string[] = [];
  try { names = fs.list(e.path); } catch (err) { names = []; }
  const dirs: Entry[] = [], files: Entry[] = [];
  for (const name of names) {
    if (IGNORED.indexOf(name) >= 0) continue;
    const p = e.path + '/' + name;
    const d = isDir(p);
    (d ? dirs : files).push(new Entry(name, p, d, e.depth + 1, e));
  }
  // folders first, then files, each by name ignoring case (zinc:fs lists are sorted by bytes)
  const byName = (a: Entry, b: Entry): number => a.name.toLowerCase() < b.name.toLowerCase() ? -1 : a.name.toLowerCase() > b.name.toLowerCase() ? 1 : 0;
  dirs.sort(byName); files.sort(byName);
  e.children = dirs.concat(files);
}

function flatten(e: Entry, out: Entry[]): void {
  for (const c of e.children) {
    out.push(c);
    if (c.dir && c.open) flatten(c, out);
  }
}
export function refresh(): void { const out: Entry[] = []; flatten(root, out); setRows(out); }

export function setOpen(e: Entry, open: boolean): void {
  if (!e.dir || e.open === open) return;
  if (open) load(e);
  e.open = open;
  e.chevron.to(open ? 1 : 0);
  refresh();
}
export function toggle(e: Entry): void { setOpen(e, !e.open); }

/** Expands the folders down to `path` and selects its entry (reveal the active file). */
export function reveal(path: string): Entry | null {
  let e: Entry = root;
  while (true) {
    load(e);
    let next: Entry | null = null;
    for (const c of e.children) if (path === c.path || path.startsWith(c.path + '/')) { next = c; break; }
    if (next === null) return null;
    const n = next as Entry;
    if (n.path === path) { refresh(); setSelected(n); return n; }
    if (!n.open) { n.open = true; n.chevron.snap(1); load(n); }
    e = n;
  }
}

let everything: Entry[] = [];
/** Every file of the project (loaded once, at most 5000), for the file finder. */
export function allFiles(): Entry[] {
  if (everything.length === 0) walk(root);
  return everything;
}
function walk(e: Entry): void {
  load(e);
  for (const c of e.children) {
    if (everything.length >= 5000) return;
    if (c.dir) walk(c); else everything.push(c);
  }
}

/** Initial state: the root's children, with src/ open. */
export function initProject(): void {
  load(root);
  for (const c of root.children) if (c.dir && c.name === 'src') { c.open = true; c.chevron.snap(1); load(c); }
  refresh();
}
