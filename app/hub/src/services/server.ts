// The hub server of ZN-842 (app/hub-server), seen from the tablet: pairing, the signed catalog, an app's signed manifest and its .zapp.
// Nothing the server sends is trusted as is: the catalog must be signed by the key pinned at pairing, the manifest by the app's key that the
// catalog lists, and the .zapp must have the SHA-256 of that manifest. Every refusal is an Error whose message is shown to the user.
import { progress } from './progress';
import * as net from 'zinc:net';
import * as sys from 'zinc:sys';
import * as fs from 'zinc:fs';
import { subtle } from 'zinc:subtle';
import { unhex, sha256, safe, Manifest, parseManifest, verifyManifest } from '../../../hub-server/src/protocol';
import { HubConfig } from './config';
import { REQUEST_TIMEOUT_MS, ENGINE_TIMEOUT_MS, MAX_ZAPP_BYTES } from '../constants';

export class CatalogChannel {
  channel: string = '';
  version: string = '';
  manifest: string = '';   // path on the server: apps/<id>/<channel>.manifest
  url: string = '';        // path on the server: apps/<id>/<file>.zapp
  sha256: string = '';
  icon: string = '';       // path on the server: apps/<id>/<file>.png, '' when the package has no icon
  iconSha256: string = '';
  zbc: i32 = 0;            // the engine the package needs (its manifest.json needs, docs/zapp.md): ZBC version and runtime calls, 0 when unknown
  rt: i32 = 0;
  description: string = '';   // from the package's zinc.json (description, app.author, app.homepage); '' when it names none
  author: string = '';
  homepage: string = '';
  declared: boolean = false;  // zinc.json has "permissions" (an older server sends none: not declared)
  permissions: string[] = [];
  size: i32 = 0;           // the .zapp in bytes, 0 when the server does not say
}
export class CatalogApp {
  id: string = '';
  key: string = '';        // the app's Ed25519 public key (hex)
  channels: CatalogChannel[] = [];
  channel(name: string): CatalogChannel | null { for (const c of this.channels) if (c.channel === name) return c; return null; }
}

/** The reMarkable engine bundle the server offers (tools/rmpp-engine): what it runs, and where it is with its SHA-256 and size. */
export class CatalogEngine {
  version: string = '';
  zbc: i32 = 0;
  rt: i32 = 0;
  url: string = '';        // path on the server: engine/zinc-rmpp-<version>.tar.gz
  sha256: string = '';
  size: i32 = 0;
}
export class Catalog {
  apps: CatalogApp[] = [];
  engine: CatalogEngine | null = null;
}

function base(server: string): string { return server.endsWith('/') ? server.slice(0, server.length - 1) : server; }

async function request(cfg: HubConfig, path: string, init: net.RequestInit): Promise<net.Response> {
  if (init.timeoutMs === undefined) init.timeoutMs = REQUEST_TIMEOUT_MS;
  let r: net.Response;
  try { r = await net.fetch(base(cfg.server) + '/' + path, init); }
  catch (e) { throw new Error('Cannot reach the server ' + cfg.server + ' (' + e.message + '). Check its address and the network.'); }
  if (r.status === 401) throw new Error('The server does not know this tablet any more: pair it again in Settings.');
  if (r.status === 403 && path === 'pair') throw new Error('Wrong pairing code: type the code the server shows now.');
  if (!r.ok) throw new Error('The server answered ' + r.status.toString() + ' for ' + path + '.');
  return r;
}
async function get(cfg: HubConfig, path: string, timeoutMs: i32 = REQUEST_TIMEOUT_MS): Promise<net.Response> {
  const h = new net.Headers();
  h.set('Authorization', 'Bearer ' + cfg.token);
  return await request(cfg, path, { headers: h, maxBytes: MAX_ZAPP_BYTES, timeoutMs: timeoutMs });
}

/** POST /pair: the server key and this device's token, or an Error. */
export async function pair(cfg: HubConfig, code: string, device: string): Promise<void> {
  const r = await request(cfg, 'pair', { method: 'POST', body: 'code=' + encodeURIComponent(code) + '&name=' + encodeURIComponent(device), contentType: 'application/x-www-form-urlencoded' });
  const j = await r.json();
  const key = '' + j.serverKey, token = '' + j.token;
  if (key.length !== 64 || token.length === 0) throw new Error('The server did not answer like a Zinc hub.');
  cfg.serverKey = key;
  cfg.token = token;
}

/** The catalog, its signature checked against the pinned server key; kept in `cache` (and `cache`.sig) once it checks. */
export async function catalog(cfg: HubConfig, cache: string): Promise<Catalog> {
  const text = await (await get(cfg, 'catalog.json')).text();
  const sig = (await (await get(cfg, 'catalog.json.sig')).text()).trim();
  const r = await verified(cfg, text, sig);
  fs.writeText(cache, text);
  fs.writeText(cache + '.sig', sig);
  return r;
}
/** The last catalog that checked, so the Hub shows its apps, names and icons at once and offline; null when none (or it no longer checks). */
export async function cachedCatalog(cfg: HubConfig, cache: string): Promise<Catalog | null> {
  if (!fs.exists(cache) || !fs.exists(cache + '.sig')) return null;
  try { return await verified(cfg, fs.readText(cache), fs.readText(cache + '.sig')); } catch (e) { return null; }
}
async function verified(cfg: HubConfig, text: string, sig: string): Promise<Catalog> {
  const key = await subtle.importKey('raw', unhex(cfg.serverKey), { name: 'Ed25519' }, false, ['verify']);
  if (sig.length !== 128 || !(await subtle.verify({ name: 'Ed25519' }, key, unhex(sig), sys.utf8Encode(text))))
    throw new Error('Refused: the catalog is not signed by the server this tablet paired with. Someone may be in between; pair again only if you trust this server.');
  const j = JSON.parse(text);
  const r = new Catalog();
  const apps = r.apps;
  const e = j.engine;
  if (e !== undefined && e !== null) {
    const en = new CatalogEngine();
    en.version = '' + e.version; en.zbc = parseInt('' + e.zbc); en.rt = parseInt('' + e.rt); en.url = '' + e.url; en.sha256 = '' + e.sha256; en.size = parseInt('' + e.size);
    if (safe(en.version) && en.url.startsWith('engine/') && safe(en.url.slice(7))) r.engine = en;
  }
  for (let i: i32 = 0; i < j.apps.length; i++) {
    const a = j.apps[i];
    const app = new CatalogApp();
    app.id = '' + a.id; app.key = '' + a.key;
    if (!safe(app.id)) continue;
    for (let k: i32 = 0; k < a.channels.length; k++) {
      const c = a.channels[k];
      const ch = new CatalogChannel();
      ch.channel = '' + c.channel; ch.version = '' + c.version; ch.manifest = '' + c.manifest; ch.url = '' + c.url; ch.sha256 = '' + c.sha256;
      ch.icon = c.icon === undefined ? '' : '' + c.icon; ch.iconSha256 = c.iconSha256 === undefined ? '' : '' + c.iconSha256;
      ch.zbc = c.zbc === undefined ? 0 : parseInt('' + c.zbc); ch.rt = c.rt === undefined ? 0 : parseInt('' + c.rt);
      ch.description = c.description === undefined ? '' : '' + c.description; ch.author = c.author === undefined ? '' : '' + c.author;
      ch.homepage = c.homepage === undefined ? '' : '' + c.homepage; ch.size = c.size === undefined ? 0 : parseInt('' + c.size);
      if (c.permissions !== undefined && c.permissions !== null) { ch.declared = true; for (let n: i32 = 0; n < c.permissions.length; n++) ch.permissions.push('' + c.permissions[n]); }
      if (safe(ch.channel)) app.channels.push(ch);
    }
    apps.push(app);
  }
  return r;
}

/** The engine bundle into `path`, checked against the SHA-256 and the size of the signed catalog (the hub key vouches for the engine). */
export async function downloadEngine(cfg: HubConfig, e: CatalogEngine, path: string): Promise<void> {
  progress('Downloading the engine ' + e.version + ' (' + Math.round(e.size / 1048576).toString() + ' MB)');
  const bundle = await (await get(cfg, e.url, ENGINE_TIMEOUT_MS)).bytes();
  progress('Checking it against the SHA-256 the server signed');
  if (bundle.length !== e.size || (await sha256(bundle)) !== e.sha256)
    throw new Error('Refused: the engine ' + e.version + ' does not match the SHA-256 the server signed. It was altered; the engine was not changed.');
  fs.writeBytes(path, bundle);
}

/** The file name of a channel's package (apps/<id>/notes-1.2.0.zapp -> notes-1.2.0.zapp). */
export function fileOf(ch: CatalogChannel): string { return ch.url.slice(ch.url.lastIndexOf('/') + 1); }

/** A downloaded package: its manifest (signature, app, channel and version checked) and its bytes (SHA-256 checked). */
export class Download {
  manifest: Manifest = new Manifest();
  zapp: u8[] = [];
}
export async function download(cfg: HubConfig, app: CatalogApp, ch: CatalogChannel): Promise<Download> {
  const d = new Download();
  progress('Downloading the manifest of ' + app.id + ' ' + ch.version);
  const text = await (await get(cfg, ch.manifest)).text();
  const m = parseManifest(text);
  d.manifest = m;
  progress('Checking the publisher\'s signature');
  if (!(await verifyManifest(m, app.key)))
    throw new Error('Refused: the manifest of ' + app.id + ' is not signed by its publisher. It was altered; nothing was installed.');
  if (m.get('app') !== app.id || m.get('channel') !== ch.channel || m.get('version') !== ch.version || m.get('sha256') !== ch.sha256 || m.get('url') !== fileOf(ch))
    throw new Error('Refused: the server offers ' + app.id + ' ' + ch.version + ' but sends the manifest of ' + m.get('app') + ' ' + m.get('version') + '. Nothing was installed.');
  if (!safe(m.get('url')) || !m.get('url').endsWith('.zapp')) throw new Error('Refused: the manifest of ' + app.id + ' names no .zapp file.');
  progress('Downloading ' + m.get('url'));
  const zapp = await (await get(cfg, ch.url)).bytes();
  progress('Checking its SHA-256');
  d.zapp = zapp;
  const sum = await sha256(zapp);
  if (sum !== m.get('sha256'))
    throw new Error('Refused: ' + m.get('url') + ' does not match the SHA-256 its publisher signed. It was altered; nothing was installed.');
  return d;
}

/** The icon of a channel's package, cached as `path` (next to the installs) and checked against the SHA-256 the signed catalog lists:
 *  true when `path` holds it. A missing or altered icon is only a placeholder in the list, never an error. */
export async function fetchIcon(cfg: HubConfig, ch: CatalogChannel, path: string): Promise<boolean> {
  if (ch.icon === '' || ch.iconSha256.length !== 64) return false;
  if (fs.exists(path) && (await sha256(fs.readBytes(path))) === ch.iconSha256) return true;
  try {
    const png = await (await get(cfg, ch.icon)).bytes();
    if ((await sha256(png)) !== ch.iconSha256) return false;
    fs.writeBytes(path, png);
    return true;
  } catch (e) { return false; }
}
