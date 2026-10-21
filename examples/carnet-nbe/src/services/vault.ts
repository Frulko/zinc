// The vault, as Obsidian has one: a folder of Markdown files and subfolders (CARNET_VAULT, else `vault/` beside the app, seeded
// from `welcome/` the first time), the app's own files in `.carnet/` as Obsidian keeps its own in `.obsidian/`. A note is its file
// (Carnet's Obsidian plugin): read and written by @nbe/markdown, its front matter kept as read (the keys this app does not know
// survive), its title the file name. Only the window that serves the vault touches it: it writes a note a moment after its last
// change (whoever made it), renames and moves the file with its note, moves a deleted note to `.trash/`, and looks at the folder
// every second for files another program changed, added or removed.
import * as fs from 'zinc:fs';
import * as sys from 'zinc:sys';
import { markdownToDocument, documentToMarkdown, Frontmatter } from '@nbe/markdown';
import { uuidv7 } from '@nbe/core';
import { Page, addPage, pageJSON, pageAt, pageWithId, deletePage, replaceBlocks, addFolder, removeFolder, folders, collapsed,
  setCollapsed, currentPage, setVaultName, stemOf, folderOf, joinPath, onPageChanged, onPageOpened, onPageRemoved, onPageMoved,
  onFolderAdded } from '../state';
import { SAVE_DELAY_S, WATCH_S, CONFIG_DIR, TRASH_DIR } from '../constants';

/** A note's file as the disk last had it (read or written here). */
class File {
  path: string; fm: Frontmatter; text: string; mtime: number = 0; size: number = 0;
  constructor(path: string, fm: Frontmatter, text: string) { this.path = path; this.fm = fm; this.text = text; }
}
const files = new Map<string, File>();      // note id -> its file
const pending = new Map<string, number>();  // note id -> seconds since its last change
let dir = '';
let sinceWatch = 0;
let workspace = '';                          // .carnet/workspace.json as last written

const full = (path: string): string => `${dir}/${path}`;
/** The vault's folder, '' in a window that joined (it has no vault of its own). */
export function vaultDir(): string { return dir; }

function copyTree(from: string, to: string): void {
  fs.mkdir(to, true);
  for (const e of fs.readDir(from)) {
    if (e.isDirectory) copyTree(`${from}/${e.name}`, `${to}/${e.name}`);
    else fs.copyFile(`${from}/${e.name}`, `${to}/${e.name}`);
  }
}
/** The notes and folders under `rel`, hidden ones (`.carnet`, `.trash`, `.git`...) left out as Obsidian does. */
function scan(rel: string, notes: string[], dirs: string[]): void {
  for (const e of fs.readDir(rel === '' ? dir : full(rel))) {
    if (e.name.startsWith('.')) continue;
    const path = joinPath(rel, e.name);
    if (e.isDirectory) { dirs.push(path); scan(path, notes, dirs); }
    else if (e.name.endsWith('.md')) notes.push(path);
  }
}
function remember(f: File): void { const st = fs.stat(full(f.path)); f.mtime = st.mtimeMs; f.size = st.size; }

/** A file as a note: its document (fresh block ids: they last for this session) and what the disk has. */
function load(path: string): [any, File] | null {
  let text = '', doc: any;
  try { text = fs.readText(full(path)); doc = markdownToDocument(text); } catch (e) { console.log(`carnet: cannot read ${path}: ${e}`); return null; }
  const fm = doc.frontmatter, props: Record<string, unknown> = {};
  if (fm.get('title') !== undefined && String(fm.get('title')) !== stemOf(path)) props['title'] = String(fm.get('title'));
  if (fm.get('icon') !== undefined) props['icon'] = String(fm.get('icon'));
  const blocks = doc.blocks.length > 0 ? doc.blocks : [{ id: uuidv7(), type: 'paragraph', version: 1, props: {}, text: [] }];
  const f = new File(path, fm, text);
  remember(f);
  return [{ id: uuidv7(), type: 'page', version: 1, props, children: blocks }, f];
}
function open(path: string): void {
  const r = load(path);
  if (r === null) return;
  files.set(r[0].id, r[1]);   // before addPage: a note opened with no file is a new one, to write
  addPage(r[0], path);
}

/** Opens the vault (the window that serves, or one alone): reads every note and folder, then keeps the files in step. */
export function openVault(): void {
  dir = sys.env('CARNET_VAULT') !== '' ? sys.env('CARNET_VAULT') : 'vault';
  if (!fs.exists(dir)) copyTree('welcome', dir);
  if (!fs.exists(full(CONFIG_DIR))) fs.mkdir(full(CONFIG_DIR), true);
  setVaultName(stemOf(fs.realpath(dir)));
  onPageChanged((p: Page) => pending.set(p.id, 0));
  onPageOpened((p: Page) => { if (!files.has(p.id)) pending.set(p.id, 0); });   // new here or in another window: its file appears
  onPageMoved(move);
  onPageRemoved(trash);
  onFolderAdded((path: string) => { if (!fs.exists(full(path))) fs.mkdir(full(path), true); });
  const notes: string[] = [], dirs: string[] = [];
  scan('', notes, dirs);
  for (const d of dirs) addFolder(d);
  for (const path of notes.sort()) open(path);
  try {
    const w = JSON.parse(fs.readText(full(`${CONFIG_DIR}/workspace.json`)));
    setCollapsed(w.collapsed ?? []);
    workspace = JSON.stringify({ open: String(w.open ?? ''), collapsed: collapsed() });
    lastOpen = String(w.open ?? '');
  } catch (e) {}
}
let lastOpen = '';
/** The note open when the vault was last closed ('' when none is known). */
export function lastOpenNote(): string { return lastOpen; }

function write(p: Page): void {
  let f = files.get(p.id);
  if (f === undefined) { f = new File(p.path(), Frontmatter.parse(''), ''); files.set(p.id, f); }
  f.fm.set('title', p.title() !== '' ? p.title() : undefined).set('icon', p.icon() !== '' ? p.icon() : undefined);
  const text = documentToMarkdown({ frontmatter: f.fm, blocks: pageJSON(p).children ?? [] });
  if (text === f.text && f.path === p.path()) return;
  const to = full(p.path());
  try {
    if (!fs.exists(folderOf(to))) fs.mkdir(folderOf(to), true);
    fs.writeText(to + '.tmp', text);   // then renamed: another program never reads half a note
    fs.rename(to + '.tmp', to);
    f.path = p.path(); f.text = text;
    remember(f);
  } catch (e) { console.log(`carnet: cannot write ${p.path()}: ${e}`); }
}
function move(p: Page, from: string): void {
  const f = files.get(p.id);
  if (f === undefined || !fs.exists(full(f.path))) return;   // not written yet: it will be, at its new path
  try {
    if (!fs.exists(folderOf(full(p.path())))) fs.mkdir(folderOf(full(p.path())), true);
    fs.rename(full(f.path), full(p.path()));
    f.path = p.path();
  } catch (e) { console.log(`carnet: cannot move ${from} to ${p.path()}: ${e}`); }
}
function trash(p: Page): void {
  const f = files.get(p.id);
  files.delete(p.id); pending.delete(p.id);
  if (f === undefined || !fs.exists(full(f.path))) return;
  const name = stemOf(f.path);
  let to = full(`${TRASH_DIR}/${name}.md`);
  for (let i = 1; fs.exists(to); i++) to = full(`${TRASH_DIR}/${name} ${i}.md`);
  try { fs.mkdir(full(TRASH_DIR), true); fs.rename(full(f.path), to); } catch (e) { console.log(`carnet: cannot trash ${f.path}: ${e}`); }
}

/** What other programs did to the vault: a changed file replaces its note's blocks (one transaction, so the windows and undo
 *  follow), a new file is a new note, a file gone takes its note with it. */
function watch(): void {
  const notes: string[] = [], dirs: string[] = [];
  try { scan('', notes, dirs); } catch (e) { return; }   // the folder is not there (a disk unplugged): look again later
  for (const d of dirs) addFolder(d);
  for (const d of folders()) if (!dirs.includes(d)) removeFolder(d);
  const byPath = new Map<string, string>();
  files.forEach((f: File, id: string) => byPath.set(f.path, id));
  for (const path of notes) {
    const id = byPath.get(path);
    if (id === undefined) { if (pageAt(path) === null) { console.log(`carnet: ${path} appeared`); open(path); } continue; }
    const f = files.get(id) as File, st = fs.stat(full(path));
    if (st.mtimeMs === f.mtime && st.size === f.size) continue;
    f.mtime = st.mtimeMs; f.size = st.size;
    if (fs.readText(full(path)) === f.text) continue;
    const r = load(path), p = pageWithId(id);
    if (r === null || p === null) continue;
    f.fm = r[1].fm; f.text = r[1].text;
    // ponytail: the file wins over an edit made here less than SAVE_DELAY_S ago; a three-way merge if that ever bites
    console.log(`carnet: ${path} changed on disk`);
    replaceBlocks(p, r[0]);
    pending.delete(id);
  }
  const seen = new Set<string>(notes), gone: string[] = [];
  files.forEach((f: File, id: string) => { if (!seen.has(f.path) && !pending.has(id)) gone.push(id); });
  for (const id of gone) { console.log(`carnet: ${(files.get(id) as File).path} went`); files.delete(id); const p = pageWithId(id); if (p !== null) deletePage(p); }
}

function saveWorkspace(): void {
  const p = currentPage();
  const w = JSON.stringify({ open: p === null ? '' : p.path(), collapsed: collapsed() });
  if (w === workspace) return;
  workspace = w;
  try { fs.writeText(full(`${CONFIG_DIR}/workspace.json`), w + '\n'); } catch (e) {}
}

/** Once per frame: writes the notes whose last change is old enough, and looks at the folder every WATCH_S. */
export function stepVault(dt: number): void {
  if (dir === '') return;
  const due: string[] = [];
  pending.forEach((age: number, id: string) => { if (age + dt >= SAVE_DELAY_S) due.push(id); else pending.set(id, age + dt); });
  for (const id of due) {
    const p = pageWithId(id);
    if (p !== null && !p.ready()) { pending.set(id, 0); continue; }   // its document has not arrived from the others yet
    pending.delete(id);
    if (p !== null) write(p);
  }
  sinceWatch += dt;
  if (sinceWatch < WATCH_S) return;
  sinceWatch = 0;
  watch();
  saveWorkspace();
}
