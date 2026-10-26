// The hub's state and its actions: what the pages and the test script call. One action runs at a time; its outcome is the status line.
import { createSignal } from 'zinc:ui/solid';
import { newer } from '../../hub-server/src/protocol';
import { HubConfig, loadConfig, saveConfig } from './services/config';
import { CatalogApp, CatalogChannel, CatalogEngine, catalog, download, pair, fileOf, fetchIcon } from './services/server';
import { engineOffered, engineVersion, installEngine } from './services/engine';
import * as fs from 'zinc:fs';
import * as sys from 'zinc:sys';
import { quit } from 'zinc:gfx';
import { installed, previous, install, rollback, nameOf, livePath } from './services/installs';
import { STABLE, DEVICE_NAME, HUB_DIR, ENGINE_ZBC, ENGINE_RT } from './constants';
import { RunningApp, running, stopApp } from './services/running';

/** One line of the list: an app of the catalog or one installed earlier. */
export class AppRow {
  id: string = '';
  name: string = '';
  channel: string = STABLE;         // the channel this tablet follows
  channels: string[] = [];          // the channels the server offers
  available: string = '';           // the version on that channel, '' when none
  installed: string = '';           // '' when not installed
  previous: string = '';            // what Rollback brings back, '' when nothing
  icon: string = '';                // the cached icon (a PNG checked against the catalog), '' for the placeholder
  iconSha256: string = '';
  /** Rollback goes back to an older version only: after a rollback the newer one comes back with Update. */
  get canRollback(): boolean { return this.previous !== '' && newer(this.installed, this.previous); }
  get updatable(): boolean { return this.installed !== '' && this.available !== '' && newer(this.available, this.installed); }
}

export const PAGE_APPS: i32 = 0;
export const PAGE_SETTINGS: i32 = 1;
export const PAGE_RUNNING: i32 = 2;

let config: HubConfig = loadConfig();
let apps: CatalogApp[] = [];
let engine: CatalogEngine | null = null;
export const [page, setPage] = createSignal<i32>(config.paired ? PAGE_APPS : PAGE_SETTINGS);
export const [server, setServer] = createSignal<string>(config.server);
export const [paired, setPaired] = createSignal<boolean>(config.paired);
export const [rows, setRows] = createSignal<AppRow[]>([]);
export const [status, setStatus] = createSignal<string>(config.paired ? '' : 'Set the server address, then type the pairing code the server shows.');
export const [busy, setBusy] = createSignal<boolean>(false);
/** The engine version the server offers to this tablet ('' when none): the apps page shows "Update the engine". */
export const [engineOffer, setEngineOffer] = createSignal<string>('');
/** The running engine's version, for the engine row. */
export function engineNow(): string { return engineVersion(); }

async function fetchCatalog(): Promise<void> {
  const c = await catalog(config);
  apps = c.apps;
  engine = c.engine;
  setEngineOffer(engineOffered(engine) ? (engine as CatalogEngine).version : '');
}

/** The first 16 hex digits of the pinned server key, to compare with what the server prints. */
export function serverFingerprint(): string { return paired() ? config.serverKey.slice(0, 16) : ''; }

function say(message: string): void { setStatus(message); console.log('hub: ' + message); }

/** The channel whose version the row shows: the one this tablet follows, else the first the server offers. */
function shownChannel(a: CatalogApp): CatalogChannel | null {
  const ch = a.channel(config.channelOf(a.id));
  return ch !== null || a.channels.length === 0 ? ch : a.channels[0];
}
function iconPath(id: string): string { return HUB_DIR + '/apps/' + id + '/icon.png'; }

/** The icons of the catalog's apps, cached next to the installs (HUB_DIR/apps/<id>/icon.png). */
async function syncIcons(): Promise<void> {
  for (const a of apps) {
    const ch = shownChannel(a);
    const path = iconPath(a.id);
    if (ch !== null && (ch as CatalogChannel).icon !== '') {
      fs.mkdir(HUB_DIR + '/apps/' + a.id, true);
      if (await fetchIcon(config, ch as CatalogChannel, path)) continue;
    }
    if (fs.exists(path)) fs.remove(path);   // no icon, or one that does not check: the placeholder
  }
}

function rebuildRows(): void {
  const list: AppRow[] = [];
  for (const a of apps) {
    const r = new AppRow();
    r.id = a.id;
    r.channel = config.channelOf(a.id);
    for (const c of a.channels) r.channels.push(c.channel);
    const ch = a.channel(r.channel);
    if (ch !== null) { r.available = ch.version; r.name = nameOf(fileOf(ch), ch.version); }
    else if (a.channels.length > 0) r.name = nameOf(fileOf(a.channels[0]), a.channels[0].version);
    const i = installed(a.id), p = previous(a.id);
    if (i !== null) { r.installed = i.version; r.name = i.name; }
    if (p !== null) r.previous = p.version;
    const shown = shownChannel(a);
    if (shown !== null && (shown as CatalogChannel).iconSha256 !== '' && fs.exists(iconPath(a.id))) { r.icon = iconPath(a.id); r.iconSha256 = (shown as CatalogChannel).iconSha256; }
    if (r.name === '') r.name = a.id;
    list.push(r);
  }
  setRows(list);
}

/** Runs one action with the busy flag; its result or its error becomes the status line. */
async function run(action: () => Promise<string>): Promise<void> {
  if (busy()) return;
  setBusy(true);
  try { say(await action()); }
  catch (e) { say(e.message); }
  setBusy(false);
}

export function saveServer(url: string): void {
  const u = url.trim();
  if (!u.startsWith('http://') && !u.startsWith('https://')) { say('The server address starts with http:// or https://.'); return; }
  if (u !== config.server) { config.server = u; config.serverKey = ''; config.token = ''; setPaired(false); apps = []; rebuildRows(); }
  setServer(u);
  saveConfig(config);
  say('Server set to ' + u + '.' + (paired() ? '' : ' Type its pairing code.'));
}

export async function pairWith(code: string): Promise<void> {
  await run(async (): Promise<string> => {
    const c = code.trim();
    if (c.length === 0) throw new Error('Type the pairing code the server shows.');
    await pair(config, c, DEVICE_NAME);
    saveConfig(config);
    setPaired(true);
    await fetchCatalog();
    await syncIcons();
    rebuildRows();
    setPage(PAGE_APPS);
    return 'Paired with ' + config.server + ' (key ' + serverFingerprint() + '). ' + apps.length.toString() + ' apps.';
  });
}

/** Fetches the signed catalog: the list, and the updates on the channels this tablet follows. */
export async function refresh(): Promise<void> {
  if (!paired()) { say('Pair this tablet with a server first (Settings).'); return; }
  await run(async (): Promise<string> => {
    await fetchCatalog();
    await syncIcons();
    rebuildRows();
    const updates = rows().filter((r: AppRow) => r.updatable).map((r: AppRow) => r.name + ' ' + r.available);
    if (engineOffer() !== '') updates.push('the engine ' + engineOffer());
    return updates.length > 0 ? 'Updates: ' + updates.join(', ') + '.' : apps.length.toString() + ' apps, everything up to date.';
  });
}

/** A package this engine cannot run (its needs, from the signed catalog) is refused before anything is downloaded. 0: not known, no check. */
function refuseUnrunnable(ch: CatalogChannel): void {
  if (ch.zbc === 0 || ENGINE_ZBC === 0) return;
  if (ch.zbc > ENGINE_ZBC || (ch.zbc === ENGINE_ZBC && ch.rt > ENGINE_RT)) {
    const e = engine;
    if (engineOffer() !== '' && (e as CatalogEngine).zbc === ch.zbc && (e as CatalogEngine).rt >= ch.rt) throw new Error('Needs a newer engine: tap Update the engine (' + engineOffer() + '), then install it again.');
    throw new Error('Needs a newer engine: update the engine on the tablet.');
  }
  if (ch.zbc < ENGINE_ZBC) throw new Error('Made for an older engine: its publisher must pack it again with this one.');
}

/** Install or update: downloads, verifies and installs the version of the channel this tablet follows. */
export async function installApp(id: string): Promise<void> {
  await run(async (): Promise<string> => {
    let app: CatalogApp | null = null;
    for (const a of apps) if (a.id === id) app = a;
    if (app === null) throw new Error('The server does not offer ' + id + '.');
    const ch = (app as CatalogApp).channel(config.channelOf(id));
    if (ch === null) throw new Error(id + ' has no version on the ' + config.channelOf(id) + ' channel.');
    refuseUnrunnable(ch as CatalogChannel);
    const message = await install(id, await download(config, app as CatalogApp, ch));
    rebuildRows();
    return message;
  });
}

/** Replaces the engine on the tablet with the one the signed catalog offers (services/engine.ts); the old one stays on any failure. */
export async function updateEngine(): Promise<void> {
  await run(async (): Promise<string> => {
    if (engineOffer() === '') throw new Error('The server offers no newer engine for this tablet.');
    const message = await installEngine(config, engine as CatalogEngine);
    setEngineOffer('');
    return message;
  });
}

export async function rollbackApp(id: string): Promise<void> {
  await run(async (): Promise<string> => { const message = await rollback(id); rebuildRows(); return message; });
}

/** Open: the hub quits and its tile's launcher runs the app in this window (ZINC_NEXT, zinc-tile), then brings the hub back. */
export function openApp(id: string): void {
  const i = installed(id);
  if (i === null) { say(id + ' is not installed.'); return; }
  const next = sys.env('ZINC_NEXT');
  if (next === '') { say('Open ' + i.name + ' from AppLoad: reload it, then tap ' + i.name + '.'); return; }
  fs.writeText(next, livePath(i.name));
  say('Opening ' + i.name + '.');
  quit();
}

/** Follows the stable or the beta channel for an app; Update then offers that channel's version. */
export function setChannel(id: string, channel: string): void {
  config.kv.set('channel.' + id, channel);
  saveConfig(config);
  rebuildRows();
  say(id + ' follows the ' + channel + ' channel.');
}

// The Running page (ZN-844): the Zinc apps running now, from zinc-app's pidfiles and their watchers' lines, read again every 3 s while the
// hub shows. The signals change only when what is drawn changes, so an unchanged list costs no e-paper refresh.
export const [runningApps, setRunningApps] = createSignal<RunningApp[]>([]);
/** The apps not responding the user has not answered (Wait): the banner at the top of every page. */
export const [stuck, setStuck] = createSignal<RunningApp[]>([]);
const waited: i32[] = [];
let shownKey = '', stuckKey = '';

/** One line per app, what the Running page shows for it. */
export function runningLine(a: RunningApp): string {
  const state = a.state === 'hung' ? 'Not responding' : a.state === 'busy' ? 'Busy' : a.state === 'waste' ? 'Hidden but using the CPU'
    : a.state === 'memory' ? 'Using a lot of memory' : a.state === 'ok' ? 'OK' : 'Starting';
  const parts = [state];
  if (a.cpu >= 0) parts.push('CPU ' + a.cpu.toString() + '%');
  if (a.rssKb >= 0) parts.push(Math.round(a.rssKb / 1024).toString() + ' MB');
  const min = Math.floor((Date.now() - a.startedMs) / 60000);
  parts.push(min < 60 ? 'up ' + min.toString() + ' min' : 'up ' + Math.floor(min / 60).toString() + ' h ' + (min % 60).toString() + ' min');
  if (a.window === 'hidden' || a.window === 'widget') parts.push(a.window);
  return parts.join(' · ');
}

export function refreshRunning(): void {
  const list = running();
  const key = list.map((a: RunningApp) => a.pid.toString() + ' ' + a.name + ' ' + runningLine(a)).join('\n');
  if (key !== shownKey) { shownKey = key; setRunningApps(list); }
  const hung = list.filter((a: RunningApp) => a.hung && waited.indexOf(a.pid) < 0);
  const k = hung.map((a: RunningApp) => a.pid.toString()).join(' ');
  if (k !== stuckKey) { stuckKey = k; setStuck(hung); for (const a of hung) console.log('hub: ' + a.name + ' is not responding'); }
}

export async function stopRunning(pid: i32): Promise<void> {
  await run(async (): Promise<string> => {
    let app: RunningApp | null = null;
    for (const a of running()) if (a.pid === pid) app = a;
    if (app === null) return 'It has already stopped.';
    const message = await stopApp(app as RunningApp);
    refreshRunning();
    return message;
  });
}

/** Wait: the app may come back; the banner leaves it alone, the Running page still shows it. */
export function waitFor(pid: i32): void { waited.push(pid); refreshRunning(); }

/** Every 3 s while the window shows (not minimized, not a folded widget): a few small files read, nothing drawn when nothing changed. */
export function watchRunning(): void {
  refreshRunning();
  setInterval(() => { if (sys.device('window.state', '') !== 'hidden') refreshRunning(); }, 3000);
}
