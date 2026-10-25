// The hub's state and its actions: what the pages and the test script call. One action runs at a time; its outcome is the status line.
import { createSignal } from 'zinc:ui/solid';
import { newer } from '../../hub-server/src/protocol';
import { HubConfig, loadConfig, saveConfig } from './services/config';
import { CatalogApp, catalog, download, pair, fileOf } from './services/server';
import { installed, previous, install, rollback, nameOf } from './services/installs';
import { STABLE, DEVICE_NAME } from './constants';

/** One line of the list: an app of the catalog or one installed earlier. */
export class AppRow {
  id: string = '';
  name: string = '';
  channel: string = STABLE;         // the channel this tablet follows
  channels: string[] = [];          // the channels the server offers
  available: string = '';           // the version on that channel, '' when none
  installed: string = '';           // '' when not installed
  previous: string = '';            // what Rollback brings back, '' when nothing
  /** Rollback goes back to an older version only: after a rollback the newer one comes back with Update. */
  get canRollback(): boolean { return this.previous !== '' && newer(this.installed, this.previous); }
  get updatable(): boolean { return this.installed !== '' && this.available !== '' && newer(this.available, this.installed); }
}

export const PAGE_APPS: i32 = 0;
export const PAGE_SETTINGS: i32 = 1;

let config: HubConfig = loadConfig();
let apps: CatalogApp[] = [];
export const [page, setPage] = createSignal<i32>(config.paired ? PAGE_APPS : PAGE_SETTINGS);
export const [server, setServer] = createSignal<string>(config.server);
export const [paired, setPaired] = createSignal<boolean>(config.paired);
export const [rows, setRows] = createSignal<AppRow[]>([]);
export const [status, setStatus] = createSignal<string>(config.paired ? '' : 'Set the server address, then type the pairing code the server shows.');
export const [busy, setBusy] = createSignal<boolean>(false);

/** The first 16 hex digits of the pinned server key, to compare with what the server prints. */
export function serverFingerprint(): string { return paired() ? config.serverKey.slice(0, 16) : ''; }

function say(message: string): void { setStatus(message); console.log('hub: ' + message); }

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
    apps = await catalog(config);
    rebuildRows();
    setPage(PAGE_APPS);
    return 'Paired with ' + config.server + ' (key ' + serverFingerprint() + '). ' + apps.length.toString() + ' apps.';
  });
}

/** Fetches the signed catalog: the list, and the updates on the channels this tablet follows. */
export async function refresh(): Promise<void> {
  if (!paired()) { say('Pair this tablet with a server first (Settings).'); return; }
  await run(async (): Promise<string> => {
    apps = await catalog(config);
    rebuildRows();
    const updates = rows().filter((r: AppRow) => r.updatable).map((r: AppRow) => r.name + ' ' + r.available);
    return updates.length > 0 ? 'Updates: ' + updates.join(', ') + '.' : apps.length.toString() + ' apps, everything up to date.';
  });
}

/** Install or update: downloads, verifies and installs the version of the channel this tablet follows. */
export async function installApp(id: string): Promise<void> {
  await run(async (): Promise<string> => {
    let app: CatalogApp | null = null;
    for (const a of apps) if (a.id === id) app = a;
    if (app === null) throw new Error('The server does not offer ' + id + '.');
    const ch = (app as CatalogApp).channel(config.channelOf(id));
    if (ch === null) throw new Error(id + ' has no version on the ' + config.channelOf(id) + ' channel.');
    const message = await install(id, await download(config, app as CatalogApp, ch));
    rebuildRows();
    return message;
  });
}

export async function rollbackApp(id: string): Promise<void> {
  await run(async (): Promise<string> => { const message = await rollback(id); rebuildRows(); return message; });
}

/** Follows the stable or the beta channel for an app; Update then offers that channel's version. */
export function setChannel(id: string, channel: string): void {
  config.kv.set('channel.' + id, channel);
  saveConfig(config);
  rebuildRows();
  say(id + ' follows the ' + channel + ' channel.');
}
