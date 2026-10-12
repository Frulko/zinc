// The project of the open sketch (ZN-736): what its zinc.json says, for the header and the project card, and what the card changes.
// A sketch without a zinc.json is a plain sketch; the card offers to write one. zinc.json is read as text (model.ts: the engine has
// no command that prints a parsed project) and an edit replaces one value of that text; `zinc check` then says what the engine
// thinks of it. The plugins are those `zinc plugins` lists among the modules the code imports.
import { createSignal, createEffect } from 'zinc:ui/solid';
import * as fs from 'zinc:fs';
import * as sys from 'zinc:sys';
import * as proc from 'zinc:process';
import { sketchDir, sketchName, mainFile, buffers, edited, save, openFile, say } from './workspace';
import { check, libraries, loadLibraries, Library } from './tools';
import { Project, Target, readProject, jsonGet, jsonSet, jsonList, projectFiles, importsOf, permissionText } from '../model';

export const [projectOpen, setProjectOpen] = createSignal<boolean>(false);
/** What zinc.json says; null: a plain sketch (no zinc.json, or one that is not a JSON object). */
export const [project, setProject] = createSignal<Project | null>(null);
/** Read when the card opens: the modules the code imports, and what the assets folder holds. */
const [imports, setImports] = createSignal<string[]>([]);
export const [assetsText, setAssetsText] = createSignal<string>('');
/** The target of zinc.json that is this machine: its size is the window's. */
export const HERE: string = sys.platform() === 'macos' ? 'macos' : 'linux';
const echo: boolean = sys.env('ZINC_ATELIER_ECHO') !== '';   // tests read the card on Atelier's own output

function file(): string { return sketchDir() + '/zinc.json'; }
function text(): string { try { return fs.readText(file()); } catch (e) { return ''; } }
export function loadProject(): void { setProject(sketchDir() === '' ? null : readProject(text())); }
createEffect(() => { sketchDir(); loadProject(); });

/** The app's name and version as the header writes them: `hero 1.2.0`; the folder's name for a plain sketch. */
export function projectTitle(): string {
  const p = project();
  if (p === null) return sketchName();
  return ((p as Project).name !== '' ? (p as Project).name : sketchName()) + ((p as Project).version !== '' ? ' ' + (p as Project).version : '');
}
/** The path of the app's icon, '' when zinc.json names none (or the file is not there). */
export function iconPath(): string {
  const p = project();
  if (p === null || (p as Project).icon === '') return '';
  const path = sketchDir() + '/' + (p as Project).icon;
  return fs.exists(path) ? path : '';
}
export function sizeHere(): Target | null {
  const p = project();
  if (p !== null) for (const t of (p as Project).targets) if (t.name === HERE) return t;
  return null;
}
/** The plugins the code imports: the imported modules that `zinc plugins` lists. */
export function plugins(): string[] { return imports().filter((m: string) => libraries().some((l: Library) => l.name === m)); }

function bytes(n: number): string { return n >= 1048576 ? (n / 1048576).toFixed(1) + ' MiB' : n >= 1024 ? Math.round(n / 1024) + ' KiB' : n + ' bytes'; }
function measure(dir: string, depth: i32, sum: number[]): void {
  for (const e of fs.readDir(dir)) {
    if (e.name.startsWith('.')) continue;
    if (e.isDirectory) { if (depth < 6) measure(dir + '/' + e.name, depth + 1, sum); }
    else if (e.isFile) { sum[0] += fs.stat(dir + '/' + e.name).size; sum[1] += 1; }
  }
}
/** Opens the card on what the folder holds now (zinc.json may have been edited in its tab). */
export function openProject(): void {
  const dir = sketchDir();
  if (dir === '') return;
  loadProject();
  const mods: string[] = [];
  for (const f of projectFiles(dir)) {
    try { for (const m of importsOf(fs.readText(dir + '/' + f))) if (mods.indexOf(m) < 0) mods.push(m); } catch (e) { /* a file that went away */ }
  }
  mods.sort((a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0));
  setImports(mods);
  const p = project(), folder = p !== null && (p as Project).assets !== '' ? (p as Project).assets : 'assets';
  const sum: number[] = [0, 0];
  try { measure(dir + '/' + folder, 0, sum); setAssetsText(`${folder}/, ${sum[1]} file${sum[1] === 1 ? '' : 's'}, ${bytes(sum[0])}`); } catch (e) { setAssetsText('no assets folder'); }
  loadLibraries();
  setProjectOpen(true);
  if (echo) console.log('[project] ' + projectText());
}
/** What the card says, on one line (scripted sessions wait for it). */
export function projectText(): string {
  const p = project();
  if (!projectOpen()) return '';
  if (p === null) return `sketch ${sketchName()}`;
  const q = p as Project;
  return `project ${projectTitle()} id ${q.id} entry ${q.entry} targets ${q.targets.map((t: Target) => `${t.name} ${t.width}x${t.height}${t.display !== '' ? ' ' + t.display : ''}`).join(', ')}`
    + ` permissions ${q.declared ? q.permissions.join(', ') : 'not declared'} plugins ${plugins().join(', ')} assets ${assetsText()} requires ${q.requires.join(', ')}`;
}

/** One value of zinc.json replaced (or added); the tab of zinc.json, when it is open, shows it. Then the card and the check again. */
function write(path: string[], value: string): boolean {
  const before = text(), after = jsonSet(before, path, value);
  if (after === before) return false;
  if (readProject(after) === null) { say('zinc.json is left as it is: it is not a JSON object'); return false; }
  let tab = false;
  for (const b of buffers()) {
    if (b.path !== file()) continue;
    if (b.modified()) { say('Save zinc.json first: its tab has changes'); return false; }
    edited(b, after); tab = save(b);
  }
  if (!tab) { try { fs.writeText(file(), after); } catch (e) { say('Cannot write zinc.json'); return false; } }
  loadProject();
  if (echo) console.log('[project] ' + projectText());
  check();
  return true;
}
export function setName(v: string): void {
  const name = v.trim();
  if (name === '' || project() === null) return;
  // written where it is read: `app.name` when the project has one, else the `name` beside it
  if (write(jsonGet(text(), ['app', 'name']) !== '' ? ['app', 'name'] : ['name'], JSON.stringify(name))) say(`Named ${name}`);
}
/** The engine refuses an `app` object without an id: a project that has none gets `com.example.<its name>` with its first `app` key. */
function appId(): string {
  let slug = '';
  for (const ch of sketchName().toLowerCase()) { const c = ch.charCodeAt(0); slug += (c >= 97 && c <= 122) || (c >= 48 && c <= 57) ? ch : '-'; }
  return 'com.example.' + (slug === '' ? 'app' : slug);
}
export function setVersion(v: string): void {
  const version = v.trim();
  if (version === '' || project() === null) return;
  for (let i = 0; i < version.length; i++) { const c = version.charCodeAt(i); if (!((c >= 48 && c <= 57) || c === 46 || c === 45 || (c >= 97 && c <= 122))) { say('A version is digits and dots: 1.2.0'); return; } }
  const fresh = jsonGet(text(), ['app', 'id']) === '';
  if (fresh) write(['app', 'id'], JSON.stringify(appId()));
  if (write(['app', 'version'], JSON.stringify(version))) say(fresh ? `Version ${version}; the app's id is ${appId()} until zinc.json says another` : `Version ${version}`);
}
/** The size of the window on this machine: `targets.<macos|linux>`. */
export function setSize(width: string, height: string): void {
  const w: i32 = parseInt(width), h: i32 = parseInt(height);
  if (project() === null || isNaN(w) || isNaN(h) || w < 64 || h < 64 || w > 16384 || h > 16384) { say('A window is at least 64 x 64'); return; }
  const a = write(['targets', HERE, 'width'], `${w}`), b = write(['targets', HERE, 'height'], `${h}`);
  if (a || b) say(`Window ${w} x ${h} on ${HERE}`);
}
/** Adds the permission, or removes it when the project has it. */
export function togglePermission(id: string): void {
  const p = project(), want = id.trim();
  if (p === null || want === '') return;
  if (permissionText(want) === '') { say(`${want} is not a permission (fs, net, process, camera, menu, tray, dialog, notification…)`); return; }
  const list = (p as Project).permissions.filter((x: string) => x !== want), had = list.length < (p as Project).permissions.length;
  if (!had) list.push(want);
  if (write(['permissions'], jsonList(list))) say(had ? `Removed the permission ${want}` : `Allowed ${want}: ${permissionText(want)}`);
}
/** A plain sketch becomes a project: a zinc.json with its name and its entry. */
export function makeProject(): void {
  const dir = sketchDir(), main = mainFile(dir);
  if (dir === '' || main === '' || fs.exists(file())) return;
  try { fs.writeText(file(), `{\n  "name": ${JSON.stringify(sketchName())},\n  "app": { "id": ${JSON.stringify(appId())}, "version": "0.1.0" },\n  "entry": ${JSON.stringify(main)}\n}\n`); } catch (e) { say('Cannot write zinc.json'); return; }
  say('This sketch is now a project: zinc.json holds its name, its id, its version and its entry');
  openProject();
}
export function openJson(): void { if (fs.exists(file())) { openFile(file()); setProjectOpen(false); } }
/** The folder in the Finder (the file manager on Linux). A session without a desktop says where it is instead. */
export function showFolder(): void {
  const dir = sketchDir();
  if (dir === '') return;
  if (sys.env('ZINC_HEADLESS') !== '' || sys.env('ZINC_DETERMINISTIC') !== '') { say(`The folder: ${dir}`); return; }
  try { proc.spawn('/usr/bin/env', [HERE === 'macos' ? 'open' : 'xdg-open', dir], {}); } catch (e) { say(`The folder: ${dir}`); }
}
