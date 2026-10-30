// The project of the open sketch (ZN-736): what its zinc.json says, for the sidebar and the Settings page, and what that page changes.
// A sketch without a zinc.json is a plain sketch; the page offers to write one. zinc.json is read as text (model.ts: the engine has
// no command that prints a parsed project) and an edit replaces one value of that text; `zinc check` then says what the engine
// thinks of it. The plugins are those `zinc plugins` lists among the modules the code imports.
import { createSignal, createEffect } from 'zinc:ui/solid';
import * as fs from 'zinc:fs';
import * as sys from 'zinc:sys';
import * as proc from 'zinc:process';
import { sketchDir, sketchName, mainFile, buffers, edited, save, openFile, say } from './workspace';
import { check, libraries, loadLibraries, Library, zinc, publish } from './tools';
import * as dialog from 'zinc:system/dialog';
import { Project, Target, readProject, jsonGet, jsonSet, jsonList, projectFiles, importsOf, permissionWords } from '../model';
import { t, tn } from './text';

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
/** One line on what a permission of zinc.json allows, in the language of the interface; '' for an id the engine does not know. */
export function permissionText(id: string): string {
  const w = permissionWords(id);
  if (w.length === 0) return '';
  return w[0] === 'atelier.permission.only' ? t(w[0], ['what', t(w[2]), 'detail', w[4]]) : t(w[0], w.slice(1));
}

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
  try { measure(dir + '/' + folder, 0, sum); setAssetsText(tn('atelier.project.assets', sum[1], ['folder', folder + '/', 'size', bytes(sum[0])])); } catch (e) { setAssetsText(t('atelier.project.no_assets')); }
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
  if (readProject(after) === null) { say(t('atelier.project.not_object')); return false; }
  let tab = false;
  for (const b of buffers()) {
    if (b.path !== file()) continue;
    if (b.modified()) { say(t('atelier.project.save_first')); return false; }
    edited(b, after); tab = save(b);
  }
  if (!tab) { try { fs.writeText(file(), after); } catch (e) { say(t('atelier.project.cannot_write')); return false; } }
  loadProject();
  if (echo) console.log('[project] ' + projectText());
  check();
  return true;
}
export function setName(v: string): void {
  const name = v.trim();
  if (name === '' || project() === null) return;
  // written where it is read: `app.name` when the project has one, else the `name` beside it
  if (write(jsonGet(text(), ['app', 'name']) !== '' ? ['app', 'name'] : ['name'], JSON.stringify(name))) say(t('atelier.project.named', ['name', name]));
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
  for (let i = 0; i < version.length; i++) { const c = version.charCodeAt(i); if (!((c >= 48 && c <= 57) || c === 46 || c === 45 || (c >= 97 && c <= 122))) { say(t('atelier.project.bad_version')); return; } }
  const fresh = jsonGet(text(), ['app', 'id']) === '';
  if (fresh) write(['app', 'id'], JSON.stringify(appId()));
  if (write(['app', 'version'], JSON.stringify(version))) say(fresh ? t('atelier.project.version_id', ['version', version, 'id', appId()]) : t('atelier.project.version', ['version', version]));
}
/** The size of the window on this machine: `targets.<macos|linux>`. */
export function setSize(width: string, height: string): void {
  const w: i32 = parseInt(width), h: i32 = parseInt(height);
  if (project() === null || isNaN(w) || isNaN(h) || w < 64 || h < 64 || w > 16384 || h > 16384) { say(t('atelier.project.small_window')); return; }
  const a = write(['targets', HERE, 'width'], `${w}`), b = write(['targets', HERE, 'height'], `${h}`);
  if (a || b) say(t('atelier.project.window', ['width', `${w}`, 'height', `${h}`, 'target', HERE]));
}
/** The app's identifier, app.id: reverse DNS (com.example.notes), what macOS and the devices know it by. */
export function setId(v: string): void {
  const id = v.trim();
  if (id === '' || project() === null) return;
  const labels = id.split('.');
  let ok = labels.length >= 2;
  for (const l of labels) {
    if (l === '' || !(l.charCodeAt(0) >= 97 && l.charCodeAt(0) <= 122) && !(l.charCodeAt(0) >= 65 && l.charCodeAt(0) <= 90)) ok = false;
    for (let i = 0; i < l.length; i++) { const c = l.charCodeAt(i); if (!((c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 45)) ok = false; }
  }
  if (!ok) { say(t('atelier.project.bad_id')); return; }
  if (write(['app', 'id'], JSON.stringify(id))) say(t('atelier.project.id', ['id', id]));
}
/** How the window on this machine follows its size: 'fill' (the interface is laid out again) or 'letterbox' (the picture is scaled). */
export function setResize(mode: string): void { if (project() !== null && write(['targets', HERE, 'resize'], JSON.stringify(mode))) say(t('atelier.project.resize_' + mode)); }
export function setFullscreen(on: boolean): void { if (project() !== null && write(['targets', HERE, 'fullscreen'], on ? 'true' : 'false')) say(t(on ? 'atelier.project.fullscreen_on' : 'atelier.project.fullscreen_off')); }
/** How a Raspberry Pi's shell shows the app: 'window' (under its bar), 'fullscreen' (no bar; Home still leaves it) or 'kiosk' (the app alone). */
export function setShell(mode: string): void { if (project() !== null && write(['shell'], JSON.stringify(mode))) say(t('atelier.project.shell_' + mode)); }
/** The app's icon: a PNG, copied into the project when it is elsewhere, named by app.icon. */
export function setIcon(path: string): void {
  const dir = sketchDir();
  if (project() === null || path === '') return;
  if (!path.toLowerCase().endsWith('.png')) { say(t('atelier.project.icon_png')); return; }
  let rel = path.startsWith(dir + '/') ? path.slice(dir.length + 1) : '';
  if (rel === '') { try { fs.copyFile(path, dir + '/icon.png'); rel = 'icon.png'; } catch (e) { say(t('atelier.project.cannot_write')); return; } }
  write(['app', 'icon'], JSON.stringify(rel));
  say(t('atelier.project.icon', ['path', rel]));
}
export function chooseIcon(): void {
  if (!dialog.isSupported() || sys.env('ZINC_HEADLESS') !== '' || sys.env('ZINC_DETERMINISTIC') !== '') { say(t('atelier.project.icon_by_hand')); return; }
  const o = new dialog.OpenOptions();
  o.title = t('atelier.project.icon_title'); o.defaultPath = sketchDir(); o.filters = [new dialog.Filter('PNG', ['png'])];
  dialog.open(o).then((paths: string[] | null) => { if (paths !== null && paths.length > 0) setIcon(paths[0]); });
}

// ---- publishing: the hub the app goes to and the key its releases are signed with. They are the user's, not the project's: kept with
// zinc's own files (~/.zinc/atelier/hub.json, the seed in ~/.zinc/keys/<app id>.seed, both readable by the user only). zinc.json gets the
// public key only (update.publicKey), which the devices check every release against.
function zincHome(): string { return sys.env('ZINC_HOME') !== '' ? sys.env('ZINC_HOME') : sys.env('HOME') + '/.zinc'; }
function hubFile(): string { return zincHome() + '/atelier/hub.json'; }
function seedFile(): string { const p = project(); return zincHome() + '/keys/' + (p === null || (p as Project).id === '' ? sketchName() : (p as Project).id) + '.seed'; }
function readHub(): string[] {
  try { const j = fs.readText(hubFile()); return [jsonText(jsonGet(j, ['url'])), jsonText(jsonGet(j, ['token']))]; } catch (e) { return ['', '']; }
}
function jsonText(raw: string): string { if (!raw.startsWith('"')) return ''; try { const v: string = JSON.parse(raw); return v; } catch (e) { return ''; } }
export const [hub, setHubSignal] = createSignal<string[]>(readHub());
function writePrivate(path: string, text: string): void {
  fs.mkdir(path.slice(0, path.lastIndexOf('/')), true);
  fs.writeText(path, '');
  fs.chmod(path, 384);   // 0600, before the secret is written
  fs.writeText(path, text);
}
/** The hub's address and its publisher token (`zinc run app/hub-server` prints both). */
export function setHub(url: string, token: string): void {
  const u = url.trim(), k = token.trim();
  try { writePrivate(hubFile(), `{ "url": ${JSON.stringify(u)}, "token": ${JSON.stringify(k)} }\n`); } catch (e) { say(t('atelier.publish.cannot_save')); return; }
  setHubSignal([u, k]);
  say(t('atelier.publish.hub_saved'));
}
/** The seed of the app's key, '' when this machine has none (or not the one zinc.json names). */
export function seed(): string {
  const p = project();
  if (p === null || (p as Project).publicKey === '') return '';
  try { return fs.readText(seedFile()).trim(); } catch (e) { return ''; }
}
/** Makes the app's key pair (`zinc update-keygen`): the seed stays on this machine, the public key goes to zinc.json. */
export function makeKey(): void {
  if (project() === null) return;
  if (jsonGet(text(), ['app', 'id']) === '') write(['app', 'id'], JSON.stringify(appId()));
  let out = '';
  try {
    const p = zinc(['update-keygen'], sketchDir());
    p.onData((chunk: string, stderr: boolean) => { if (!stderr) out += chunk; });
    p.onExit((code: i32) => {
      let s = '', pub = '';
      for (const l of out.split('\n')) { if (l.startsWith('seed=')) s = l.slice(5).trim(); else if (l.startsWith('public=')) pub = l.slice(7).trim(); }
      if (code !== 0 || s === '' || pub === '') { say(t('atelier.publish.no_key')); return; }
      try { writePrivate(seedFile(), s + '\n'); } catch (e) { say(t('atelier.publish.cannot_save')); return; }
      write(['update', 'publicKey'], JSON.stringify(pub));
      say(t('atelier.publish.key_made', ['path', seedFile()]));
    });
  } catch (e) { say(t('atelier.publish.no_key')); }
}

/** Share > Publish: the machine the package is for ('' any, rpi, rpi2, rpi1) and the channel; then `zinc publish` to the hub. */
export const PUBLISH_TARGETS: string[] = ['', 'rpi', 'rpi2', 'rpi1'];
export const [publishTarget, setPublishTarget] = createSignal<i32>(1);
export const [publishChannel, setPublishChannel] = createSignal<string>('stable');
/** What is missing before a publish: '' when nothing is. */
export function publishMissing(): string {
  const p = project();
  if (p === null) return t('atelier.share.needs_project');
  if (hub()[0] === '' || hub()[1] === '') return t('atelier.share.needs_hub');
  if ((p as Project).publicKey === '' || seed() === '') return t('atelier.share.needs_key');
  return '';
}
export function publishApp(): void {
  const why = publishMissing();
  if (why !== '') { say(why); return; }
  publish(PUBLISH_TARGETS[publishTarget()], publishChannel(), hub()[0], hub()[1], seed());
}

/** Adds the permission, or removes it when the project has it. */
export function togglePermission(id: string): void {
  const p = project(), want = id.trim();
  if (p === null || want === '') return;
  if (permissionText(want) === '') { say(t('atelier.project.bad_permission', ['name', want])); return; }
  const list = (p as Project).permissions.filter((x: string) => x !== want), had = list.length < (p as Project).permissions.length;
  if (!had) list.push(want);
  if (write(['permissions'], jsonList(list))) say(had ? t('atelier.project.removed', ['name', want]) : t('atelier.project.allowed', ['name', want, 'what', permissionText(want)]));
}
/** A plain sketch becomes a project: a zinc.json with its name and its entry. */
export function makeProject(): void {
  const dir = sketchDir(), main = mainFile(dir);
  if (dir === '' || main === '' || fs.exists(file())) return;
  try { fs.writeText(file(), `{\n  "name": ${JSON.stringify(sketchName())},\n  "app": { "id": ${JSON.stringify(appId())}, "version": "0.1.0" },\n  "entry": ${JSON.stringify(main)}\n}\n`); } catch (e) { say(t('atelier.project.cannot_write')); return; }
  say(t('atelier.project.made'));
  openProject();
}
export function openJson(): void { if (fs.exists(file())) { openFile(file()); setProjectOpen(false); } }
/** The folder in the Finder (the file manager on Linux). A session without a desktop says where it is instead. */
export function showFolder(): void {
  const dir = sketchDir();
  if (dir === '') return;
  if (sys.env('ZINC_HEADLESS') !== '' || sys.env('ZINC_DETERMINISTIC') !== '') { say(t('atelier.project.folder', ['path', dir])); return; }
  try { proc.spawn('/usr/bin/env', [HERE === 'macos' ? 'open' : 'xdg-open', dir], {}); } catch (e) { say(t('atelier.project.folder', ['path', dir])); }
}
