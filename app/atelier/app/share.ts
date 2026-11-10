// Share snapshots go through zinc's pack/unpack commands; imported sketches always get a fresh folder.
import * as fs from 'zinc:fs';
import * as sys from 'zinc:sys';
import * as proc from 'zinc:process';
import * as dialog from 'zinc:system/dialog';
import { createSignal } from 'zinc:ui/solid';
import { setClipboardText } from 'zinc:gfx';
import { projectLink, projectLinkFiles, PROJECT_SOURCE_LIMIT } from '../../../lib/std/project-link';
import { sketchDir, mainFile, sketchName, sketchbook, openSketch, save, buffers, say } from './workspace';
import { zinc, phase, IDLE, setMade } from './tools';
import { t } from './text';
import { readProject, Project } from '../model';

enum ShareState { Idle, Capturing, Packing, Importing, Stopping }
const [state, setState] = createSignal<ShareState>(ShareState.Idle);
export const [shareMessage, setShareMessage] = createSignal<string>('');
let child: proc.Process | null = null;
let timer: i32 = -1;
let stopReason = '';
function transition(next: ShareState): void {
  const from = state();
  if (!(next === ShareState.Idle || (from === ShareState.Idle && (next === ShareState.Capturing || next === ShareState.Importing)) || (from === ShareState.Capturing && next === ShareState.Packing) || (from !== ShareState.Idle && next === ShareState.Stopping))) throw new Error('Invalid share transition.');
  setState(next);
}
function message(text: string): void { setShareMessage(text); say(text); }
function finish(text: string): void {
  if (timer >= 0) clearTimeout(timer);
  timer = -1; child = null; transition(ShareState.Idle); message(text);
}
export function stopShare(reason: string = ''): void {
  const p = child;
  if (p === null) return;
  transition(ShareState.Stopping);
  stopReason = reason !== '' ? reason : t('atelier.share.stopped');
  p.kill();
  let until = sys.clock() + 0.5;
  while (p.running && sys.clock() < until) sys.poll(10);
  if (p.running) p.kill(9);
  until = sys.clock() + 0.5;
  while (p.running && sys.clock() < until) sys.poll(10);
}
function saved(): boolean {
  for (const b of buffers()) if (b.modified() && !save(b)) return false;
  return true;
}
function ready(): boolean {
  if (state() !== ShareState.Idle || phase() !== IDLE) { message(t('atelier.build.busy')); return false; }
  if (sketchDir() === '' || mainFile(sketchDir()) === '') { message(t('atelier.build.nothing')); return false; }
  return saved();
}
function command(args: string[], cwd: string, done: (code: i32, error: string) => void, env: string[] = []): void {
  let error = '';
  const p = zinc(args, cwd, env);
  child = p; stopReason = '';
  timer = setTimeout(() => stopShare(t('atelier.share.timeout')), 30000);
  p.onStderr((line: string) => { if (error.length < 4096) error += line + '\n'; });
  p.onExit((code: i32) => {
    clearTimeout(timer); timer = -1; child = null;
    done(state() === ShareState.Stopping && code === 0 ? 143 : code, state() === ShareState.Stopping ? stopReason : error.trim());
  });
}
function validateLinkProject(files: any): void {
  if (files['zinc.json'] === undefined) return;
  const project = readProject(files['zinc.json']);
  if (project === null) throw new Error('The link has an invalid zinc.json.');
  const entry = (project as Project).entry;
  if (entry !== '' && (Object.keys(files).indexOf(entry) < 0 || !(entry.endsWith('.ts') || entry.endsWith('.tsx') || entry.endsWith('.js')))) throw new Error('The link entry must be a source file inside the project.');
}
/** The same map the playground edits. Assets need the file, rather than a source-only link. */
export function copyPlayLink(): void {
  if (!ready()) return;
  try {
    const files: any = {};
    let count: i32 = 0, visited: i32 = 0, bytes: number = 0;
    const collect = (dir: string, relative: string, depth: i32): void => {
      if (depth > 32) throw new Error(t('atelier.share.link_large'));
      for (const entry of fs.readDir(dir)) {
        if (entry.name.startsWith('.') || entry.name === 'build' || entry.name === 'dist' || entry.name === 'node_modules') continue;
        if (++visited > 4096) throw new Error(t('atelier.share.link_large'));
        if (entry.isSymlink) throw new Error('Shared sources cannot be symbolic links: ' + entry.name);
        const path = relative + entry.name, full = dir + '/' + entry.name;
        if (entry.isDirectory) { collect(full, path + '/', depth + 1); continue; }
        if (!(path.endsWith('.ts') || path.endsWith('.tsx') || path.endsWith('.js') || path.endsWith('.json'))) continue;
        bytes += fs.stat(full).size;
        if (++count > 128 || bytes > PROJECT_SOURCE_LIMIT) throw new Error(t('atelier.share.link_large'));
        files[path] = fs.readText(full);
      }
    };
    collect(sketchDir(), '', 0);
    if (files['zinc.json'] === undefined) files['zinc.json'] = JSON.stringify({ name: sketchName(), entry: mainFile(sketchDir()) });
    validateLinkProject(files);
    const link = projectLink(files);
    setClipboardText(link);
    message(t('atelier.share.link_copied'));
  } catch (e) { message(e.message); }
}
/** A chosen destination; the original project is never rewritten to add the cover or source payload. */
export function shareFile(path: string): void {
  if (!ready()) return;
  if (!path.toLowerCase().endsWith('.zapp')) { message(t('atelier.share.extension')); return; }
  if (!path.startsWith('/')) path = sys.launchDir() + '/' + path;
  const dir = sketchDir();
  let temp = '';
  try {
    const parent = path.indexOf('/') >= 0 ? path.slice(0, path.lastIndexOf('/')) : '.';
    temp = fs.mkdtemp(parent + '/.zinc-share-');
    transition(ShareState.Capturing); message(t('atelier.share.capturing'));
    const picture = temp + '/cover.png';
    command(['run', dir, '--interp'], dir, (code: i32, error: string) => {
      if (code !== 0 || !fs.exists(picture)) { fs.remove(temp, true); finish(error !== '' ? error : t('atelier.share.no_picture')); return; }
      transition(ShareState.Packing); message(t('atelier.share.packing'));
      try {
        command(['pack', dir, '--sources', '--cover', picture, '-o', temp + '/sketch.zapp'], dir, (result: i32, why: string) => {
          try {
            if (result !== 0) { finish(why !== '' ? why : t('atelier.share.failed')); return; }
            if (fs.stat(temp + '/sketch.zapp').size > 67108864) { finish(t('atelier.share.archive_large')); return; }
            fs.rename(temp + '/sketch.zapp', path);
            setMade(['pack', path]); finish(t('atelier.share.saved', ['path', path]));
          } catch (e) { finish(e.message); }
          finally { fs.remove(temp, true); }
        });
      } catch (e) { fs.remove(temp, true); finish(e.message); }
    }, ['ZINC_HEADLESS=1', 'ZINC_DETERMINISTIC=1', 'ZINC_FRAMES=1', 'ZINC_SHOT=' + picture]);
  } catch (e) { if (temp !== '') fs.remove(temp, true); finish(e.message); }
}
export function chooseShareFile(): void {
  if (!ready()) return;
  const o = new dialog.SaveOptions();
  o.title = t('atelier.share.pack'); o.defaultPath = sketchDir() + '/' + sketchName() + '.zapp';
  o.filters = [new dialog.Filter('Zinc sketch', ['zapp'])];
  dialog.save(o).then((path: string | null) => { if (path !== null) shareFile(path); });
}
/** Source links and archives open as copies; the CLI checks hashes and archive paths before extraction. */
export function openShared(path: string, done: (ok: boolean) => void): void {
  if (state() !== ShareState.Idle || phase() !== IDLE) { message(t('atelier.build.busy')); done(false); return; }
  let dir = '', owned = '';
  try {
    if (!saved()) { done(false); return; }
    fs.mkdir(sketchbook(), true);
    if (path.indexOf('#files-json/') >= 0) {
      const files = projectLinkFiles(path);
      validateLinkProject(files);
      dir = fs.mkdtemp(sketchbook() + '/shared-'); owned = dir;
      for (const name of Object.keys(files)) {
        const out = dir + '/' + name;
        fs.mkdir(out.slice(0, out.lastIndexOf('/')), true); fs.writeText(out, files[name]);
      }
      done(openSketch(dir)); return;
    }
    if (!path.toLowerCase().endsWith('.zapp')) throw new Error(t('atelier.share.extension'));
    if (fs.stat(path).size > 67108864) throw new Error(t('atelier.share.archive_large'));
    // mkdtemp reserves a unique parent; unpack refuses any existing destination.
    const parent = fs.mkdtemp(sketchbook() + '/shared-'); owned = parent;
    dir = parent + '/sketch';
    transition(ShareState.Importing); message(t('atelier.share.importing'));
    command(['unpack', path, '--out', dir], '', (code: i32, error: string) => {
      if (code !== 0) { fs.remove(parent, true); finish(error !== '' ? error : t('atelier.share.failed')); done(false); return; }
      if (mainFile(dir) === '') { fs.remove(parent, true); finish(t('atelier.share.no_sources')); done(false); return; }
      const ok = openSketch(dir); finish(t('atelier.share.opened')); done(ok);
    });
  } catch (e) { if (owned !== '' && fs.exists(owned)) fs.remove(owned, true); finish(e.message); done(false); }
}
export function chooseSharedFile(done: (ok: boolean) => void): void {
  const o = new dialog.OpenOptions();
  o.title = t('atelier.share.open_file'); o.defaultPath = sketchbook(); o.filters = [new dialog.Filter('Zinc sketch', ['zapp'])];
  dialog.open(o).then((paths: string[] | null) => { if (paths !== null && paths.length > 0) openShared(paths[0], done); });
}
