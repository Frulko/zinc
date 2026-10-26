// What is installed on this tablet. An app <id> is one file, APPS_DIR/<name>.zapp (its AppLoad tile zinc-<name> runs it), and
// HUB_DIR/apps/<id>/installed (version, channel, name, sha256). An update keeps the replaced package as HUB_DIR/apps/<id>/previous.zapp with
// its record `previous`, which Rollback puts back (and the rolled-back version becomes the previous one, so Update brings it again).
import * as fs from 'zinc:fs';
import * as proc from 'zinc:process';
import { sha256, newer, safe } from '../../../hub-server/src/protocol';
import { KeyValues, readKeyValues, writeKeyValues } from './config';
import { Download } from './server';
import { progress } from './progress';
import { HUB_DIR, APPS_DIR, TILE_COMMAND, APPLOAD_DIR } from '../constants';

export class Installed {
  version: string = '';
  channel: string = '';
  name: string = '';
  sha256: string = '';
}
function recordOf(kv: KeyValues): Installed | null {
  if (kv.get('version') === '') return null;
  const r = new Installed();
  r.version = kv.get('version'); r.channel = kv.get('channel'); r.name = kv.get('name'); r.sha256 = kv.get('sha256');
  return r;
}
function save(path: string, r: Installed): void {
  const kv = new KeyValues();
  kv.set('version', r.version); kv.set('channel', r.channel); kv.set('name', r.name); kv.set('sha256', r.sha256);
  writeKeyValues(path, kv, false);
}
function dirOf(id: string): string { return HUB_DIR + '/apps/' + id; }
export function installed(id: string): Installed | null { return recordOf(readKeyValues(dirOf(id) + '/installed')); }
export function previous(id: string): Installed | null { return fs.exists(dirOf(id) + '/previous.zapp') ? recordOf(readKeyValues(dirOf(id) + '/previous')) : null; }
export function livePath(name: string): string { return APPS_DIR + '/' + name + '.zapp'; }

/** The tile name of a package: its file name without the version (notes-1.2.0.zapp -> notes), stable across updates. */
export function nameOf(file: string, version: string): string {
  const suffix = '-' + version + '.zapp';
  return file.endsWith(suffix) ? file.slice(0, file.length - suffix.length) : file.slice(0, file.length - 5);
}

/** zinc-tile on the package: the app's own AppLoad tile. Without zinc-tile (a desktop) this is a dry run that says so. */
async function makeTile(name: string): Promise<string> {
  if (!fs.exists(TILE_COMMAND)) return 'No zinc-tile at ' + TILE_COMMAND + ' (not a reMarkable): no tile made.';
  progress('Making its AppLoad tile');
  const r = await proc.run(TILE_COMMAND, [livePath(name)], {});
  if (r.code !== 0) throw new Error('Installed, but zinc-tile failed: ' + (r.stderr.trim() !== '' ? r.stderr.trim() : 'exit ' + r.code.toString()));
  return 'Tile zinc-' + name + ' ready: reload AppLoad.';
}

/** Installs or updates `id` with a verified download; refuses the same or an older version than the one installed. */
export async function install(id: string, d: Download): Promise<string> {
  const m = d.manifest, version = m.get('version');
  const name = nameOf(m.get('url'), version);
  if (!safe(name)) throw new Error('Refused: ' + m.get('url') + ' is not a usable file name.');
  const now = installed(id);
  if (now !== null && !newer(version, now.version))
    throw new Error(version === now.version ? name + ' ' + version + ' is already installed.'
      : 'Refused: ' + name + ' ' + version + ' is older than the installed ' + now.version + '. The hub never downgrades an app; use Rollback to go back.');
  if (now === null) {   // a new app: its tile name must not be another app's
    if (fs.exists(HUB_DIR + '/apps')) for (const other of fs.list(HUB_DIR + '/apps')) {
      const o = installed(other);
      if (other !== id && o !== null && o.name === name) throw new Error('Refused: the app ' + other + ' already uses the tile name ' + name + '.');
    }
  }
  progress('Installing ' + name + ' ' + version);
  fs.mkdir(APPS_DIR, true);
  fs.mkdir(dirOf(id), true);
  const live = livePath(name);
  fs.writeBytes(live + '.part', d.zapp);
  if (now !== null && fs.exists(livePath(now.name))) {
    fs.copyFile(livePath(now.name), dirOf(id) + '/previous.zapp');
    save(dirOf(id) + '/previous', now);
  }
  fs.rename(live + '.part', live);
  const r = new Installed();
  r.version = version; r.channel = m.get('channel'); r.name = name; r.sha256 = m.get('sha256');
  save(dirOf(id) + '/installed', r);
  const tile = await makeTile(name);
  return (now === null ? 'Installed ' : 'Updated ') + name + ' ' + version + (now === null ? '' : ' (was ' + now.version + ')') + '. ' + tile;
}

/** Puts the previous package back; the replaced one becomes the previous. Its SHA-256 is checked first. */
export async function rollback(id: string): Promise<string> {
  const n = installed(id), p = previous(id);
  if (n === null || p === null) throw new Error('There is no previous version of ' + id + ' to go back to.');
  const now = n as Installed, prev = p as Installed;
  const dir = dirOf(id);
  if ((await sha256(fs.readBytes(dir + '/previous.zapp'))) !== prev.sha256)
    throw new Error('Refused: the kept package of ' + prev.name + ' ' + prev.version + ' was altered on this tablet. Install the app again.');
  const live = livePath(now.name);
  fs.rename(dir + '/previous.zapp', dir + '/back.zapp');
  if (fs.exists(live)) fs.rename(live, dir + '/previous.zapp');
  fs.rename(dir + '/back.zapp', livePath(prev.name));
  save(dir + '/previous', now);
  save(dir + '/installed', prev);
  let tile = '';
  if (prev.name !== now.name) tile = ' ' + (await makeTile(prev.name));
  return 'Rolled ' + prev.name + ' back to ' + prev.version + ' (from ' + now.version + ').' + tile;
}

async function removeTile(tile: string): Promise<void> {
  if (!fs.exists(TILE_COMMAND)) return;
  const r = await proc.run(TILE_COMMAND, ['--remove', tile], {});
  if (r.code !== 0) throw new Error('zinc-tile could not remove ' + tile + ': ' + r.stderr.trim());
}

/** Removes an app: its tiles (and its ink session's), its package and the hub's record with the kept previous version. The cached icon stays
 *  for the catalog's row; what the app saved (its notes, its tabs) stays too. */
export async function uninstall(id: string): Promise<string> {
  const i = installed(id);
  if (i === null) throw new Error(id + ' is not installed.');
  const name = (i as Installed).name, dir = dirOf(id);
  progress('Removing its AppLoad tiles');
  await removeTile('zinc-' + name);
  await removeTile('zinc-' + name + '-session');
  progress('Removing its package');
  if (fs.exists(livePath(name))) fs.remove(livePath(name));
  for (const f of ['installed', 'previous', 'previous.zapp']) if (fs.exists(dir + '/' + f)) fs.remove(dir + '/' + f);
  return 'Uninstalled ' + name + '. Reload AppLoad.';
}

/** AppLoad's zinc-* tiles whose .zapp is gone (deleted by hand, a renamed app): removed. Tiles not made by zinc-tile are left alone. */
export async function cleanTiles(): Promise<string> {
  if (!fs.exists(APPLOAD_DIR)) return 'No AppLoad directory on this machine: nothing to clean.';
  const gone: string[] = [];
  for (const t of fs.list(APPLOAD_DIR)) {
    const launch = APPLOAD_DIR + '/' + t + '/launch.sh';
    if (!t.startsWith('zinc-') || !fs.exists(launch)) continue;
    const s = fs.readText(launch), end = s.lastIndexOf('.zapp"');   // zinc-tile writes the package as "<path>.zapp"
    if (end < 0) continue;
    const zapp = s.slice(s.lastIndexOf('"', end) + 1, end + 5);
    if (!fs.exists(zapp)) { await removeTile(t); gone.push(t); }
  }
  return gone.length === 0 ? 'AppLoad is clean: every Zinc tile has its app.' : 'Removed ' + gone.join(', ') + '. Reload AppLoad.';
}
