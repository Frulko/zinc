// The hub's state and its actions: what the pages and the test script call. One action runs at a time; its outcome is the status line.
import { createSignal } from 'zinc:ui/solid';
import { newer } from '../../hub-server/src/protocol';
import { HubConfig, loadConfig, saveConfig } from './services/config';
import { CatalogApp, CatalogChannel, CatalogEngine, catalog, download, pair, fileOf, fetchIcon } from './services/server';
import { engineOffered, engineVersion, installEngine } from './services/engine';
import * as fs from 'zinc:fs';
import * as sys from 'zinc:sys';
import { quit } from 'zinc:gfx';
import { Installed, installed, previous, install, rollback, uninstall, cleanTiles, nameOf, livePath, pinnedIds, setPinned, resetData } from './services/installs';
import { STABLE, HUB_ID, DEVICE_NAME, HUB_DIR, ENGINE_ZBC, ENGINE_RT } from './constants';
import { RunningApp, running, stopApp } from './services/running';
import { InfoSection, loadInfo, hubVersion } from './services/system';
import { setTask, setStep, failure, setFailure, progress } from './services/progress';
import { describe, consentLines, grant, toAsk } from './services/permissions';

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
  description: string = '';         // from the package's zinc.json (the channel shown)
  author: string = '';
  size: i32 = 0;
  uses: string = '';                // its permissions in a few words, '' when it declares none of them
  declared: boolean = false;
  pinned: boolean = false;          // in xochitl's sidebar (AppLoad 0004's pinned.json)
  inCatalog: boolean = true;        // false: installed earlier, the server no longer offers it
  /** Rollback goes back to an older version only: after a rollback the newer one comes back with Update. */
  get canRollback(): boolean { return this.previous !== '' && newer(this.installed, this.previous); }
  get updatable(): boolean { return this.installed !== '' && this.available !== '' && newer(this.available, this.installed); }
}

export const PAGE_APPS: i32 = 0;
export const PAGE_SETTINGS: i32 = 1;
export const PAGE_RUNNING: i32 = 2;
export const PAGE_INFO: i32 = 3;
export const PAGE_STORE: i32 = 4;
/** The Store's two tabs: every app of the server, or the installed ones with their maintenance (update, rollback, pin, reset, uninstall). */
export const STORE_ALL = 'all', STORE_INSTALLED = 'installed';
export const [storeTab, setStoreTab] = createSignal<string>(STORE_ALL);
/** The tests draw the widget alone (ZINC_HUB_SCRIPT `widget`), as Accueil shows it. */
export const [widgetPreview, setWidgetPreview] = createSignal<boolean>(false);

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

// the hub's own version: its record once it updated itself, else the zinc.json of the package deploy.sh copied ('' in a development run)
let selfVersion = '';
async function readSelfVersion(): Promise<string> {
  const i = installed(HUB_ID);
  if (selfVersion === '') selfVersion = await hubVersion(i !== null ? (i as Installed).version : '', livePath('hub'));
  return selfVersion;
}

/** The Info page: read again each time it opens. */
export const [info, setInfo] = createSignal<InfoSection[]>([]);
export async function refreshInfo(): Promise<void> {
  const i = installed(HUB_ID);
  if (i !== null) selfVersion = (i as Installed).version;
  setInfo(await loadInfo(await readSelfVersion(), engineVersion(), ENGINE_ZBC, ENGINE_RT, paired() ? config.server + ' (key ' + serverFingerprint() + '…)' : 'not paired'));
}
export function openPage(p: i32): void {
  setPage(p);
  setArmed('');
  if (p === PAGE_INFO) refreshInfo();
}

async function fetchCatalog(): Promise<void> {
  await readSelfVersion();
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

/** The rows from the last catalog and what is installed; at start, before the server answers, the installed apps alone. */
export function rebuildRows(): void {
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
    else if (a.id === HUB_ID) r.installed = selfVersion;   // the hub runs, so it is installed, even when deploy.sh put it there
    if (p !== null) r.previous = p.version;
    const shown = shownChannel(a);
    if (shown !== null && (shown as CatalogChannel).iconSha256 !== '' && fs.exists(iconPath(a.id))) { r.icon = iconPath(a.id); r.iconSha256 = (shown as CatalogChannel).iconSha256; }
    if (shown !== null) {
      const c = shown as CatalogChannel;
      r.description = c.description; r.author = c.author; r.size = c.size; r.declared = c.declared;
      r.uses = c.permissions.map((p: string) => describe(p)).join(' · ');
    }
    if (r.name === '') r.name = a.id;
    list.push(r);
  }
  // installed earlier but no longer in the catalog (or the server not reached yet): still on the home grid and in Installed
  if (fs.exists(HUB_DIR + '/apps')) for (const id of fs.list(HUB_DIR + '/apps')) {
    const i = installed(id);
    if (i === null || list.some((r: AppRow) => r.id === id)) continue;
    const r = new AppRow();
    r.id = id; r.name = (i as Installed).name; r.installed = (i as Installed).version; r.inCatalog = false;
    const p = previous(id);
    if (p !== null) r.previous = p.version;
    list.push(r);
  }
  const pins = pinnedIds();
  for (const r of list) r.pinned = pins.indexOf('external::zinc-' + r.name) >= 0;
  setRows(list);
}

/** Runs one action with the busy flag and the modal (main.tsx) titled `title`: nothing else can be tapped until it ends. Its result becomes
 *  the status line and the modal closes; an error stays in the modal until OK. */
async function run(title: string, action: () => Promise<string>): Promise<void> {
  if (busy()) return;
  setBusy(true); setTask(title); setStep(''); setFailure('');
  try { say(await action()); }
  catch (e) { say(e.message); setFailure(e.message); }
  if (restarting) return;   // the modal stays until the hub quits
  setBusy(false);
  if (failure() === '') setTask('');
}
/** OK on a failure: the modal closes. */
export function dismiss(): void { setFailure(''); setTask(''); }
/** The name a row shows for an app id, for the modal's title. */
function nameFor(id: string): string { for (const r of rows()) if (r.id === id) return r.name; return id; }

export function saveServer(url: string): void {
  const u = url.trim();
  if (!u.startsWith('http://') && !u.startsWith('https://')) { say('The server address starts with http:// or https://.'); return; }
  if (u !== config.server) { config.server = u; config.serverKey = ''; config.token = ''; setPaired(false); apps = []; rebuildRows(); }
  setServer(u);
  saveConfig(config);
  say('Server set to ' + u + '.' + (paired() ? '' : ' Type its pairing code.'));
}

export async function pairWith(code: string): Promise<void> {
  await run('Pairing with ' + config.server, async (): Promise<string> => {
    const c = code.trim();
    if (c.length === 0) throw new Error('Type the pairing code the server shows.');
    progress('Asking the server to pair');
    await pair(config, c, DEVICE_NAME);
    progress('Reading its catalog');
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
/** Runs in the background, without the modal: the Hub stays usable, and its steps and result (or "Server unreachable") go to the status
 *  band only. One check at a time. */
let checking = false;
export async function refresh(): Promise<void> {
  if (!paired()) { say('Pair this tablet with a server first (Settings).'); return; }
  if (checking) return;
  checking = true;
  try {
    setStatus('Checking for updates on ' + config.server + '…');
    await fetchCatalog();
    await syncIcons();
    rebuildRows();
    const updates = rows().filter((r: AppRow) => r.updatable).map((r: AppRow) => r.name + ' ' + r.available);
    if (engineOffer() !== '') updates.push('the engine ' + engineOffer());
    say(updates.length > 0 ? 'Updates: ' + updates.join(', ') + '.' : apps.length.toString() + ' apps, everything up to date.');
  } catch (e) {
    say(e.message.startsWith('Cannot reach the server') ? 'Server unreachable: ' + e.message : e.message);
  }
  checking = false;
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
/** The consent screen (main.tsx): what an app about to be installed or updated says it uses; Allow installs it, Cancel installs nothing. */
export class Consent {
  id: string = '';
  title: string = '';
  lines: string[] = [];
}
export const [consent, setConsent] = createSignal<Consent | null>(null);
export async function allowConsent(): Promise<void> {
  const c = consent();
  if (c === null) return;
  setConsent(null);
  await installApp((c as Consent).id, true);
}
export function cancelConsent(): void {
  const c = consent();
  setConsent(null);
  if (c !== null) say('Nothing was installed: ' + nameFor((c as Consent).id) + ' was not allowed.');
}

export async function installApp(id: string, allowed: boolean = false): Promise<void> {
  const i = installed(id);
  if (!allowed && !busy()) {   // first what it uses: the owner says yes before anything is downloaded
    let ch: CatalogChannel | null = null;
    for (const a of apps) if (a.id === id) ch = a.channel(config.channelOf(id));
    if (ch !== null) {
      const c = ch as CatalogChannel;
      const ask = toAsk(id, c.declared, c.permissions, i !== null || id === HUB_ID);
      if (ask.length > 0) {
        const k = new Consent();
        k.id = id;
        k.title = (i !== null ? nameFor(id) + ' ' + c.version + ' asks for more' : 'Install ' + nameFor(id) + ' ' + c.version + '?');
        k.lines = c.declared ? consentLines(true, ask) : consentLines(false, []);
        setConsent(k);
        return;
      }
    }
  }
  await run((i !== null || id === HUB_ID ? 'Updating ' : 'Installing ') + nameFor(id), async (): Promise<string> => {
    let app: CatalogApp | null = null;
    for (const a of apps) if (a.id === id) app = a;
    if (app === null) throw new Error('The server does not offer ' + id + '.');
    const ch = (app as CatalogApp).channel(config.channelOf(id));
    if (ch === null) throw new Error(id + ' has no version on the ' + config.channelOf(id) + ' channel.');
    refuseUnrunnable(ch as CatalogChannel);
    const message = await install(id, await download(config, app as CatalogApp, ch));
    grant(id, (ch as CatalogChannel).declared, (ch as CatalogChannel).permissions);
    rebuildRows();
    if (id === HUB_ID && restartSelf()) return message + ' Restarting the Hub.';
    return message;
  });
}

/** Replaces the engine on the tablet with the one the signed catalog offers (services/engine.ts); the old one stays on any failure. */
export async function updateEngine(): Promise<void> {
  await run('Updating the Zinc engine to ' + engineOffer(), async (): Promise<string> => {
    if (engineOffer() === '') throw new Error('The server offers no newer engine for this tablet.');
    const message = await installEngine(config, engine as CatalogEngine);
    setEngineOffer('');
    return message;
  });
}

export async function rollbackApp(id: string): Promise<void> {
  await run('Rolling back ' + nameFor(id), async (): Promise<string> => { const message = await rollback(id); rebuildRows(); return message; });
}

/** Uninstall asks twice: the first tap arms it (the button and the status line say so), the second removes the app. */
export const [armed, setArmed] = createSignal<string>('');
export async function uninstallApp(id: string): Promise<void> {
  if (armed() !== id) { setArmed(id); say('Tap Confirm uninstall to remove ' + id + ' from this tablet.'); return; }
  setArmed('');
  await run('Uninstalling ' + nameFor(id), async (): Promise<string> => {
    if (id === HUB_ID) throw new Error('The Hub does not uninstall itself.');
    const i = installed(id);
    if (i !== null) for (const a of running()) if (a.name === (i as Installed).name) throw new Error(a.name + ' is running: stop it first (Running).');
    const message = await uninstall(id);
    rebuildRows();
    return message;
  });
}

export async function cleanAppLoad(): Promise<void> { await run('Cleaning up AppLoad', cleanTiles); }

/** Reset data asks twice too (armed with "reset:<id>"): the app's own folder and saved settings go, the app is not uninstalled. */
export async function resetApp(id: string): Promise<void> {
  if (armed() !== 'reset:' + id) { setArmed('reset:' + id); say('Tap Confirm reset to erase what ' + nameFor(id) + ' saved; your documents stay.'); return; }
  setArmed('');
  await run('Resetting ' + nameFor(id), async (): Promise<string> => {
    if (id === HUB_ID) throw new Error('The Hub keeps its pairing: unpair in Settings instead.');
    const i = installed(id);
    const name = i !== null ? (i as Installed).name : nameFor(id);
    // a running app keeps its state in memory and would write it back: it is stopped first (Confirm reset was the consent)
    for (const a of running()) if (a.name === name) { progress('Stopping ' + name); await stopApp(a); }
    refreshRunning();
    progress('Removing what ' + name + ' saved');
    return resetData(name);
  });
}

/** Pin to sidebar: the app gets its own entry in xochitl's sidebar (AppLoad 0004), or loses it. */
export function togglePin(id: string): void {
  for (const r of rows()) if (r.id === id) {
    try { say(setPinned(r.name, !r.pinned)); rebuildRows(); } catch (e) { say(e.message); }
  }
}

/** Open: the hub quits and its tile's launcher runs the app in this window (ZINC_NEXT, zinc-tile), then brings the hub back. */
export function openApp(id: string): void {
  const i = installed(id);
  if (i === null) { say(id + ' is not installed.'); return; }
  const next = sys.env('ZINC_NEXT');
  if (next === '') { say('Open ' + i.name + ' from AppLoad: reload it, then tap ' + i.name + '.'); return; }
  fs.writeText(next, livePath(i.name));
  say('Opening ' + i.name + '.');
  setBusy(true); setFailure(''); setTask('Opening ' + i.name);
  progress('The Hub closes and ' + i.name + ' opens in this window; closing ' + i.name + ' brings the Hub back.');
  setTimeout(() => { quit(); }, 300);   // the modal is drawn first
}

let restarting = false;
/** After its own update the hub opens itself again through its tile's launcher (ZINC_NEXT), as Open does for an app; false off the tablet. */
function restartSelf(): boolean {
  const i = installed(HUB_ID), next = sys.env('ZINC_NEXT');
  if (i === null || next === '') return false;
  fs.writeText(next, livePath(i.name));
  setTask('Restarting the Hub');
  progress('The Hub ' + i.version + ' is installed; it closes and opens again on it.');
  setTimeout(() => { quit(); }, 1500);   // the status line shows first; busy stays on, so nothing else starts
  restarting = true;
  return true;
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
  let name = 'the app';
  for (const a of running()) if (a.pid === pid) name = a.name;
  await run('Stopping ' + name, async (): Promise<string> => {
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

// Experimental: every Zinc app docks under xochitl's header (display-rmpp reads the file <zinc home>/rmpp-header when an app starts)
const HEADER_FLAG = (sys.env('ZINC_HOME') !== '' ? sys.env('ZINC_HOME') : sys.env('HOME') + '/.zinc') + '/rmpp-header';
export const [header, setHeader] = createSignal<boolean>(fs.exists(HEADER_FLAG));
export function toggleHeader(): void {
  if (fs.exists(HEADER_FLAG)) fs.remove(HEADER_FLAG); else fs.writeText(HEADER_FLAG, 'on\n');
  setHeader(fs.exists(HEADER_FLAG));
  say(header() ? 'reMarkable header on: apps open below the tablet\'s top bar from their next start (needs AppLoad patch 0005).' : 'reMarkable header off: apps open full screen.');
}
