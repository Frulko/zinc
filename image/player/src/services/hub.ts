// ============================================================================
// services/hub.ts — Apps from a Zinc hub (app/hub-server), installed where the agent keeps its apps
// ============================================================================
// The reMarkable's store, on the Pi (ZN-889, docs/reports/zinc-shell/03-design.md §6). Pairing, the signed catalog and
// the checked download are app/hub's own code (services/server.ts, imported, not copied): the catalog signed by the hub
// key pinned at pairing, the manifest by the app's key, the package by its SHA-256. Each app keeps the package made for
// this Pi (its target: a .zapp for its CPU, any .zapp, or the export of its rpi target). The install writes the agent's
// layout, <agent>/apps/<name>/app.zapp or the unpacked export with its run.sh, and app.json, so the launcher's tiles,
// `zinc device apps` and the hub show the same apps.

import * as fs from 'zinc:fs';
import * as os from 'zinc:os';
import * as proc from 'zinc:process';
import * as sys from 'zinc:sys';
import { newer, safe } from '../../shared/app/hub-server/src/protocol';
import { HubConfig, loadConfig, saveConfig } from '../../shared/app/hub/src/services/config';
import { Catalog, CatalogApp, CatalogChannel, catalog, download, fileOf, pair } from '../../shared/app/hub/src/services/server';
import { ENGINE_RT, ENGINE_ZBC, HUB_DIR } from '../../shared/app/hub/src/constants';

/** One app of the catalog as the hub page lists it. */
export class HubEntry {
  id: string = '';
  name: string = '';
  channel: CatalogChannel = new CatalogChannel();
  app: CatalogApp = new CatalogApp();
  /** The version installed from the hub, '' when none. */
  installed: string = '';
}

export class HubState {
  config: HubConfig = loadConfig();
  entries: HubEntry[] = [];
  busy: string = '';
  message: string = '';
  isError: boolean = false;
}
export const hubState = new HubState();

/** The targets this Pi runs, best first (ZINC_PLAYER_TARGETS=a,b,c sets them): a .zapp for its CPU, any .zapp, its export. */
export async function piTargets(): Promise<string[]> {
  const forced = sys.env('ZINC_PLAYER_TARGETS');
  if (forced !== '') return forced.split(',');
  if (os.arch() === 'arm64') return ['linux-aarch64', 'any', 'rpi'];
  let machine = '';
  try { machine = (await proc.run('uname', ['-m'], {})).stdout.trim(); } catch (e) { machine = ''; }
  if (machine.startsWith('armv6')) return ['linux-armv6', 'any', 'rpi1'];
  return ['linux-armv7', 'linux-armv6', 'any', 'rpi2', 'rpi1'];
}

/** The tile's name of a package: its file without the version and the target (hello-1.2.0-linux-aarch64.zapp -> hello). */
export function nameOf(ch: CatalogChannel): string {
  const file = fileOf(ch), at = file.lastIndexOf('-' + ch.version);
  return at > 0 ? file.slice(0, at) : file.slice(0, file.lastIndexOf('.'));
}

function readMeta(dir: string): any {
  try { return JSON.parse(fs.readText(dir + '/app.json')); } catch (e) { return null; }
}

/** The version the hub installed as `name`, '' when the folder is not the hub's install of `id`. */
function installedVersion(agentDirectory: string, name: string, id: string): string {
  const meta = readMeta(agentDirectory + '/apps/' + name);
  if (meta === null || meta.hub !== id || typeof meta.version !== 'string') return '';
  return meta.version as string;
}

/** Pairs with the hub at `server` by the code it prints. */
export async function pairHub(server: string, code: string, deviceName: string): Promise<void> {
  const cfg = hubState.config;
  cfg.server = server.startsWith('http') ? server : 'http://' + server;
  await pair(cfg, code, deviceName);
  saveConfig(cfg);
}

export function forgetHub(): void {
  hubState.config.serverKey = '';
  hubState.config.token = '';
  saveConfig(hubState.config);
  hubState.entries = [];
}

/** The signed catalog, the apps this Pi runs. */
export async function readCatalog(agentDirectory: string): Promise<void> {
  fs.mkdir(HUB_DIR, true);
  const c: Catalog = await catalog(hubState.config, HUB_DIR + '/catalog.json', await piTargets());
  const entries: HubEntry[] = [];
  for (const app of c.apps) {
    const ch = app.channel(hubState.config.channelOf(app.id));
    if (ch === null) continue;
    const e = new HubEntry();
    e.id = app.id;
    e.app = app;
    e.channel = ch as CatalogChannel;
    e.name = nameOf(e.channel);
    e.installed = safe(e.name) ? installedVersion(agentDirectory, e.name, app.id) : '';
    entries.push(e);
  }
  hubState.entries = entries;
}

/** Downloads `e` (every check of app/hub), then writes it into the agent's layout; returns what it did. */
export async function installEntry(agentDirectory: string, e: HubEntry): Promise<string> {
  const ch = e.channel, name = e.name;
  if (!safe(name)) throw new Error('Refused: ' + fileOf(ch) + ' is not a usable app name.');
  if (e.installed !== '' && !newer(ch.version, e.installed))
    throw new Error(ch.version === e.installed ? name + ' ' + ch.version + ' is already installed.' : 'Refused: ' + ch.version + ' is older than the installed ' + e.installed + '.');
  const dest = agentDirectory + '/apps/' + name;
  if (e.installed === '' && fs.exists(dest)) throw new Error('Refused: an app named ' + name + ' that the hub did not install is already on this Pi.');
  // a .zapp runs on the installed engine: the ZBC it was compiled for and the runtime calls it needs (docs/zapp.md); an export carries its engine
  if (ch.kind === 'zapp' && ch.zbc !== 0 && ENGINE_ZBC !== 0) {
    if (ch.zbc > ENGINE_ZBC || (ch.zbc === ENGINE_ZBC && ch.rt > ENGINE_RT)) throw new Error('Needs a newer engine: update Zinc in Settings, then install it again.');
    if (ch.zbc < ENGINE_ZBC) throw new Error('Made for an older engine: its publisher must publish it again.');
  }
  const d = await download(hubState.config, e.app, ch);
  const stage = agentDirectory + '/apps/.incoming-hub-' + name;
  if (fs.exists(stage)) fs.remove(stage, true);
  fs.mkdir(stage, true);
  let title = name, icon = '';
  if (ch.kind === 'export') {
    fs.writeBytes(stage + '/.package.tar', d.zapp);
    const r = await proc.run('tar', ['-xf', stage + '/.package.tar', '-C', stage], {});
    fs.remove(stage + '/.package.tar', false);
    if (r.code !== 0 || !fs.exists(stage + '/run.sh')) { fs.remove(stage, true); throw new Error('Refused: the export of ' + name + ' does not unpack to a run.sh. ' + r.stderr.trim()); }
  } else {
    fs.writeBytes(stage + '/app.zapp', d.zapp);
    // the title and icon, from the package's zinc.json and icon.png (covered by its signed SHA-256)
    const z = await proc.run('tar', ['-xOf', stage + '/app.zapp', 'zinc.json'], {});
    try {
      const project = JSON.parse(z.stdout);
      if (project.app !== undefined && project.app.name !== undefined) title = '' + project.app.name;
    } catch (err) { /* no zinc.json: the name */ }
    const png = await proc.run('tar', ['-xf', stage + '/app.zapp', '-C', stage, 'icon.png'], {});
    if (png.code === 0 && fs.exists(stage + '/icon.png')) icon = 'icon.png';
  }
  const meta = '{"name":' + JSON.stringify(name) + ',"title":' + JSON.stringify(title) + ',"icon":' + JSON.stringify(icon) +
    ',"sent":' + Math.floor(Date.now() / 1000).toString() + ',"dev":false,"hub":' + JSON.stringify(e.id) + ',"version":' + JSON.stringify(ch.version) +
    ',"target":' + JSON.stringify(ch.target) + '}\n';
  fs.writeText(stage + '/app.json', meta);
  if (fs.exists(dest)) fs.remove(dest, true);
  fs.rename(stage, dest);
  const was = e.installed;
  e.installed = ch.version;
  return (was === '' ? 'Installed ' : 'Updated ') + title + ' ' + ch.version + (was === '' ? '' : ' (was ' + was + ')') + '.';
}

/** For tests and scripts: ZINC_PLAYER_HUB_INSTALL=<server> pairs with ZINC_PLAYER_HUB_CODE (when not paired yet), installs the app
 *  ZINC_PLAYER_HUB_APP from the catalog into the agent's apps, prints one line and ends the player (exit 1 on a refusal). */
export async function installFromEnvironment(agentDirectory: string): Promise<void> {
  try {
    if (!hubState.config.paired) await pairHub(sys.env('ZINC_PLAYER_HUB_INSTALL'), sys.env('ZINC_PLAYER_HUB_CODE'), 'player-test');
    await readCatalog(agentDirectory);
    const id = sys.env('ZINC_PLAYER_HUB_APP');
    let done = false;
    for (const e of hubState.entries) if (e.id === id) {
      console.log('hub: ' + (await installEntry(agentDirectory, e)) + ' (' + e.channel.target + ', ' + e.channel.kind + ')');
      done = true;
    }
    if (!done) throw new Error('No ' + id + ' for this Pi in the catalog.');
    sys.exit(0);
  } catch (err) {
    console.log('hub: ' + err.message);
    sys.exit(1);
  }
}
