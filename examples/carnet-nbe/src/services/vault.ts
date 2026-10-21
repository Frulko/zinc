// The vault, as Obsidian has one: a folder of Markdown files and subfolders, the app's own files in `.carnet/` as Obsidian keeps
// its own in `.obsidian/`. Which folder: CARNET_VAULT, else the one last opened with the vault switcher (remembered in the app's
// data folder, with the recent ones, as Obsidian's obsidian.json), else `vault/` beside the app, seeded from `welcome/`. A note is its file
// (Carnet's Obsidian plugin): read and written by @nbe/markdown, its front matter kept as read (the keys this app does not know
// survive), its title the file name. Only the window that serves the vault touches it: it writes a note a moment after its last
// change (whoever made it), renames and moves the file with its note, moves a deleted note to `.trash/`, and looks at the folder
// every second for files another program changed, added or removed.
import * as fs from 'zinc:fs';
import * as sys from 'zinc:sys';
import { dataDir } from 'zinc:system/window';
import { markdownToDocument, documentToMarkdown, Frontmatter } from '@nbe/markdown';
import { uuidv7 } from '@nbe/core';
import { Page, pages, addPage, pageJSON, pageAt, pageWithId, deletePage, replaceBlocks, addFolder, removeFolder, folders, collapsed,
  setCollapsed, currentPage, setCurrentPage, setVaultName, stemOf, folderOf, joinPath, onPageChanged, onPageOpened, onPageRemoved, onPageMoved,
  onFolderAdded } from '../state';
import { openIndex } from './search';
import { SAVE_DELAY_S, WATCH_S, CONFIG_DIR, TRASH_DIR, RECENT_VAULTS } from '../constants';

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
let lastOpen = '';                           // the note open when the vault was last closed
let closing = false;                         // the notes go because the vault closes: their files stay

const full = (path: string): string => `${dir}/${path}`;
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

// the files follow the notes, while a vault is open (only in the window that serves it)
onPageChanged((p: Page) => { if (dir !== '') pending.set(p.id, 0); });
onPageOpened((p: Page) => { if (dir !== '' && !files.has(p.id)) pending.set(p.id, 0); });   // new here or in another window: its file appears
onPageMoved((p: Page, from: string) => { if (dir !== '') move(p, from); });
onPageRemoved((p: Page) => { if (dir !== '' && !closing) trash(p); });
onFolderAdded((path: string) => { if (dir !== '' && !fs.exists(full(path))) fs.mkdir(full(path), true); });

function openVault(path: string): void {
  dir = path;
  if (!fs.exists(dir)) copyTree('welcome', dir);
  if (!fs.exists(full(CONFIG_DIR))) fs.mkdir(full(CONFIG_DIR), true);
  setVaultName(stemOf(fs.realpath(dir)));
  const notes: string[] = [], dirs: string[] = [];
  scan('', notes, dirs);
  for (const d of dirs) addFolder(d);
  for (const p of notes.sort()) open(p);
  lastOpen = '';
  try {
    const w = JSON.parse(fs.readText(full(`${CONFIG_DIR}/workspace.json`)));
    setCollapsed(w.collapsed ?? []);
    workspace = JSON.stringify({ open: String(w.open ?? ''), collapsed: collapsed() });
    lastOpen = String(w.open ?? '');
  } catch (e) { setCollapsed([]); }
  openIndex(full(`${CONFIG_DIR}/index.sqlite`));
}
/** Writes what is pending, then lets the notes and folders go (their files stay). */
function closeVault(): void {
  pending.forEach((age: number, id: string) => { const p = pageWithId(id); if (p !== null && p.ready()) write(p); });
  saveWorkspace();
  closing = true;
  for (const p of [...pages()]) deletePage(p);
  for (const f of [...folders()]) removeFolder(f);
  closing = false;
  files.clear(); pending.clear();
  dir = ''; workspace = '';
}

// ---- which vault: the switcher's recent folders, in the app's data folder
let data = '';
function vaultsFile(): string { if (data === '') data = dataDir(); return `${data}/vaults.json`; }
/** The folders opened as vaults, the last one first. */
export function recentVaults(): string[] {
  try { return (JSON.parse(fs.readText(vaultsFile())).recent as string[]).filter((v: string) => fs.exists(v)); } catch (e) { return []; }
}
function rememberVault(path: string): void {
  const recent = [path, ...recentVaults().filter((v: string) => v !== path)].slice(0, RECENT_VAULTS);
  try { fs.mkdir(folderOf(vaultsFile()), true); fs.writeText(vaultsFile(), JSON.stringify({ recent }) + '\n'); } catch (e) { console.log(`carnet: cannot remember the vault: ${e}`); }
}
/** The vault this window opens at start: CARNET_VAULT, else the last one opened with the switcher, else `vault/` beside the app. */
export function startVault(): string {
  if (sys.env('CARNET_VAULT') !== '') return sys.env('CARNET_VAULT');
  const recent = recentVaults();
  return recent.length > 0 ? recent[0] : 'vault';
}
/** Opens `path` as the vault (the one open closes first) and its last open note; `chosen`: picked by the person, remembered. */
export function useVault(path: string, chosen: boolean): void {
  if (dir !== '') closeVault();
  openVault(path);
  if (chosen) rememberVault(fs.realpath(path));
  const last = pageAt(lastOpen);
  setCurrentPage(last !== null ? last : pages().length > 0 ? pages()[0] : null);
}
/** The vault's folder, '' in a window that joined (it has no vault of its own). */
export function vaultDir(): string { return dir; }

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
