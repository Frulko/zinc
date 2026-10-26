// Zinc hub (ZN-842): the server side of an app store for the reMarkable and any Zinc device, a headless Zinc program.
//   zinc run app/hub-server -- [--port 8787] [--data <dir>]
// It stores what `zinc publish --hub <url> --token <t>` sends (the .zapp and its channel manifest, signed with the app's own Ed25519 key) and serves
// a catalog signed with the hub's Ed25519 key. The hub is not trusted for the payload: a device checks the app's signature, the catalog's, the
// SHA-256 and refuses an older version; the hub checks the same on publish so that a bad upload never reaches a device.
//
// The data directory (made on first start):
//   hub.key                    the hub's Ed25519 seed (hex, mode 600); its public key is printed at start and given to every paired device
//   publisher.token            the token of POST /publish and of the admin page (hex, mode 600)
//   devices.txt                one paired device per line: SHA-256 of its token, name, pairing time (ms)
//   apps/<id>/key              the app's Ed25519 public key, recorded by its first publish
//   apps/<id>/<file>.zapp      the packages; apps/<id>/<channel>/<version>.manifest the signed manifests; <version>.retracted a retracted version
//   apps/<id>/<file>.png       the package's icon.png (zinc pack, from zinc.json app.icon), when it has one
//
// HTTP (a device token or the publisher token as `Authorization: Bearer <token>`):
//   POST /pair                 form `code=<the code the hub prints>&name=<device>` -> {"serverKey": hex, "token": hex}; the code changes after each use
//   GET  /catalog.json         device: {"server", "issued", "apps": [{"id", "key", "channels": [{"channel", "version", "manifest", "url", "sha256",
//                              "icon", "iconSha256", "zbc", "rt"}]}]} (icon and iconSha256 '' for a package without an icon; zbc and rt: the
//                              engine the package needs, its manifest.json `needs` (docs/zapp.md), 0 when it names none)
//   GET  /catalog.json.sig     device: the Ed25519 signature of catalog.json by the hub key, hex (`zinc verify catalog.json --key <server key>`)
//   GET  /apps/<id>/<channel>.manifest, /apps/<id>/<file>.zapp, /apps/<id>/<file>.png   device: the channel's current manifest (its url is
//                              relative), the package and its icon
//   POST /publish              publisher: body = the signed manifest then the .zapp, headers X-Manifest-Length (bytes of manifest) and X-App-Key
//   GET  /admin?token=<t>      publisher: apps, versions, paired devices, the pairing code; POST /admin/retract (form token, app, channel, version)
import { serveAsync, Request, Reply, Headers } from 'zinc:net';
import * as sys from 'zinc:sys';
import * as fs from 'zinc:fs';
import { subtle, CryptoKey } from 'zinc:subtle';
import { hex, unhex, sha256, safe, newer, parseManifest, verifyManifest } from './protocol';

function opt(name: string, def: string): string {
  const a = sys.args();
  for (let i: i32 = 0; i + 1 < a.length; i++) if (a[i] === '--' + name) return a[i + 1];
  return def;
}
function same(a: string, b: string): boolean {   // in time independent of where they differ
  if (a.length !== b.length || a.length === 0) return false;
  let d: i32 = 0;
  for (let i: i32 = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
function json(s: string): string {
  let r = '"';
  for (let i: i32 = 0; i < s.length; i++) {
    const c = s.charAt(i);
    if (c === '"' || c === '\\') r += '\\' + c;
    else if (c === '\n') r += '\\n';
    else if (c.charCodeAt(0) < 32) r += ' ';
    else r += c;
  }
  return r + '"';
}
function html(s: string): string { return s.split('&').join('&amp;').split('<').join('&lt;').split('>').join('&gt;').split('"').join('&quot;'); }
function form(body: string, key: string): string {   // application/x-www-form-urlencoded
  for (const pair of body.split('&')) {
    const eq = pair.indexOf('=');
    if (eq > 0 && pair.slice(0, eq) === key) return decodeURIComponent(pair.slice(eq + 1).split('+').join(' '));
  }
  return '';
}
function query(path: string, key: string): string { const q = path.indexOf('?'); return q < 0 ? '' : form(path.slice(q + 1), key); }
function reply(status: i32, body: string, contentType: string = 'text/plain; charset=utf-8'): Reply { return { status: status, body: body, contentType: contentType }; }


// ---------------------------------------------------------------- state
const port: i32 = parseInt(opt('port', '8787'));
const data = opt('data', 'hub-data');
const apps = data + '/apps';
let hubKey: CryptoKey | null = null;
let hubPublic = '';
let publisherToken = '';
let pairCode = '';
let pairFailures: i32 = 0;

function secret(file: string): string {   // a random hex secret kept in the data directory, readable by its owner only
  const path = data + '/' + file;
  if (!fs.exists(path)) { fs.writeText(path, hex(sys.randomBytes(32)) + '\n'); fs.chmod(path, 0o600); }
  return fs.readText(path).trim();
}
function newPairCode(): void {
  const b = sys.randomBytes(4);
  const n = (((b[0] as i32) << 16) | ((b[1] as i32) << 8) | (b[2] as i32)) % 1000000;
  pairCode = ('00000' + n.toString()).slice(-6);
  pairFailures = 0;
  console.log('hub: pairing code ' + pairCode);
}
function deviceLines(): string[] {
  const path = data + '/devices.txt';
  if (!fs.exists(path)) return [];
  return fs.readText(path).split('\n').filter((l: string) => l.length > 0);
}
function bearer(req: Request): string {
  const a = req.headers.get('authorization');
  return a.startsWith('Bearer ') ? a.slice(7).trim() : '';
}
async function isDevice(req: Request): Promise<boolean> {
  const t = bearer(req);
  if (t.length === 0) return false;
  const h = await sha256(sys.utf8Encode(t));
  for (const l of deviceLines()) if (same(l.split('\t')[0], h)) return true;
  return false;
}
function list(dir: string): string[] { return fs.exists(dir) ? fs.list(dir) : []; }
// the versions published on a channel, retracted or not
function versions(id: string, channel: string): string[] {
  const r: string[] = [];
  for (const f of list(apps + '/' + id + '/' + channel)) if (f.endsWith('.manifest')) r.push(f.slice(0, f.length - 9));
  r.sort((a: string, b: string) => (newer(a, b) ? -1 : newer(b, a) ? 1 : 0));
  return r;
}
function retracted(id: string, channel: string, v: string): boolean { return fs.exists(apps + '/' + id + '/' + channel + '/' + v + '.retracted'); }
function current(id: string, channel: string): string {   // the newest version not retracted, '' when none
  for (const v of versions(id, channel)) if (!retracted(id, channel, v)) return v;
  return '';
}
function channels(id: string): string[] { return list(apps + '/' + id).filter((c: string) => safe(c) && fs.stat(apps + '/' + id + '/' + c).isDirectory); }

// A member of a ustar archive (a .zapp), [] when absent: 512-byte headers, the name in bytes 0..100, the size in octal at 124..136.
function member(tar: u8[], name: string): u8[] {
  let off: i32 = 0;
  while (off + 512 <= tar.length && tar[off] !== 0) {
    let n = '';
    for (let i: i32 = 0; i < 100 && tar[off + i] !== 0; i++) n += String.fromCharCode(tar[off + i] as i32);
    let size: i32 = 0;
    for (let i: i32 = 124; i < 136; i++) { const c = tar[off + i] as i32; if (c >= 48 && c <= 55) size = size * 8 + c - 48; }
    if (n === name) return off + 512 + size <= tar.length ? tar.slice(off + 512, off + 512 + size) : [];
    off += 512 + Math.floor((size + 511) / 512) * 512;
  }
  return [];
}
const MAX_ICON_BYTES: i32 = 512 * 1024;
// The .zapp's icon.png, checked against the SHA-256 its manifest.json lists; [] when it has none; an Error when it is not what it claims.
async function iconOf(zapp: u8[]): Promise<u8[]> {
  const icon = member(zapp, 'icon.png');
  if (icon.length === 0) return icon;
  const listed = '' + JSON.parse(sys.utf8Decode(member(zapp, 'manifest.json'))).files['icon.png'];
  if (icon.length > MAX_ICON_BYTES || icon[1] !== 0x50 || icon[2] !== 0x4e || icon[3] !== 0x47 || (await sha256(icon)) !== listed)
    throw new Error('refused: the icon.png of the .zapp is not a PNG of at most 512 KB that matches its manifest.json\n');
  return icon;
}
/** The `needs` of a stored .zapp's manifest.json as `,"zbc":N,"rt":M` for the catalog (0 and 0 when it names none). */
function needsOf(zapp: u8[]): string {
  const n = JSON.parse(sys.utf8Decode(member(zapp, 'manifest.json'))).needs;
  if (n === undefined) return ',"zbc":0,"rt":0';
  return ',"zbc":' + parseInt('' + n.zbc).toString() + ',"rt":' + parseInt('' + n.rt).toString();
}
/** The icon of the package `file` (<name>.zapp), relative to the data directory and to the server: apps/<id>/<name>.png. */
function iconPath(id: string, file: string): string { return 'apps/' + id + '/' + file.slice(0, file.length - 5) + '.png'; }

async function catalog(): Promise<string> {
  let s = '{"server":' + json(hubPublic) + ',"issued":' + Date.now().toString() + ',"apps":[';
  let firstApp = true;
  for (const id of list(apps)) {
    if (!safe(id) || !fs.exists(apps + '/' + id + '/key')) continue;
    let chs = '';
    for (const c of channels(id)) {
      const v = current(id, c);
      if (v.length === 0) continue;
      const m = parseManifest(fs.readText(apps + '/' + id + '/' + c + '/' + v + '.manifest'));
      let icon = iconPath(id, m.get('url')), iconSum = '';
      if (fs.exists(data + '/' + icon)) iconSum = await sha256(fs.readBytes(data + '/' + icon));
      else icon = '';
      chs += (chs.length > 0 ? ',' : '') + '{"channel":' + json(c) + ',"version":' + json(v) + ',"manifest":' + json('apps/' + id + '/' + c + '.manifest') +
        ',"url":' + json('apps/' + id + '/' + m.get('url')) + ',"sha256":' + json(m.get('sha256')) + ',"icon":' + json(icon) + ',"iconSha256":' + json(iconSum) + needsOf(fs.readBytes(apps + '/' + id + '/' + m.get('url'))) + '}';
    }
    s += (firstApp ? '' : ',') + '{"id":' + json(id) + ',"key":' + json(fs.readText(apps + '/' + id + '/key').trim()) + ',"channels":[' + chs + ']}';
    firstApp = false;
  }
  return s + ']}';
}
// The catalog and its signature are made together and kept until a publish or a retract changes them: catalog.json and catalog.json.sig always match.
let catalogText = '';
let catalogSig = '';
async function signedCatalog(): Promise<void> {
  if (catalogText.length > 0) return;
  const text = await catalog();
  catalogSig = hex(await subtle.sign({ name: 'Ed25519' }, hubKey as CryptoKey, sys.utf8Encode(text)));
  catalogText = text;
}

// ---------------------------------------------------------------- handlers
async function pair(req: Request): Promise<Reply> {
  const code = form(req.body, 'code');
  if (!same(code, pairCode)) {
    pairFailures++;
    if (pairFailures >= 5) newPairCode();   // no guessing: five wrong codes and the code changes
    return reply(403, 'wrong pairing code\n');
  }
  let name = form(req.body, 'name').split('\t').join(' ').split('\n').join(' ');
  if (name.length === 0) name = 'device';
  const token = hex(sys.randomBytes(32));
  fs.appendText(data + '/devices.txt', (await sha256(sys.utf8Encode(token))) + '\t' + name + '\t' + Date.now().toString() + '\n');
  console.log('hub: paired ' + name);
  newPairCode();
  return reply(200, '{"serverKey":' + json(hubPublic) + ',"token":' + json(token) + '}\n', 'application/json');
}

async function publish(req: Request): Promise<Reply> {
  const all = sys.utf8Encode(req.rawBody ?? req.body);   // byte for byte (a server always sets rawBody): the body is the manifest then the .zapp
  const n: i32 = parseInt(req.headers.get('x-manifest-length'));
  if (!(n > 0) || n > all.length || n > 65536) return reply(400, 'X-Manifest-Length is the size of the manifest at the start of the body\n');
  const m = parseManifest(sys.utf8Decode(all.slice(0, n)));
  const zapp = all.slice(n);
  const id = m.get('app'), channel = m.get('channel'), version = m.get('version'), file = m.get('url');
  if (!safe(id) || !safe(channel) || !safe(version) || !safe(file) || !file.endsWith('.zapp')) return reply(400, 'the manifest needs app, channel, version and a url that is a .zapp file name\n');
  const dir = apps + '/' + id;
  let key = req.headers.get('x-app-key').trim().toLowerCase();
  if (fs.exists(dir + '/key')) key = fs.readText(dir + '/key').trim();   // the key of the first publish stays the app's key
  if (!(await verifyManifest(m, key))) return reply(403, 'refused: the manifest signature does not verify with the key of ' + id + '\n');
  const sum = await sha256(zapp);
  if (sum !== m.get('sha256')) return reply(400, 'refused: the .zapp does not match the SHA-256 of its manifest (' + sum + ')\n');
  for (const v of versions(id, channel)) if (!newer(version, v)) return reply(409, 'refused: ' + version + ' is not newer than ' + v + ' on ' + channel + '\n');
  const path = dir + '/' + file;
  if (fs.exists(path) && (await sha256(fs.readBytes(path))) !== sum) return reply(409, 'refused: ' + file + ' already exists with another content\n');
  let icon: u8[] = [];
  try { icon = await iconOf(zapp); } catch (e) { return reply(400, e.message); }
  fs.mkdir(dir + '/' + channel, true);
  if (!fs.exists(dir + '/key')) fs.writeText(dir + '/key', key + '\n');
  fs.writeBytes(path, zapp);
  if (icon.length > 0) fs.writeBytes(data + '/' + iconPath(id, file), icon);
  fs.writeText(dir + '/' + channel + '/' + version + '.manifest', m.body + 'sig=' + m.sig + '\n');
  catalogText = '';
  console.log('hub: stored ' + id + ' ' + version + ' on ' + channel);
  return reply(200, 'stored ' + id + ' ' + version + ' on ' + channel);
}

function adminPage(token: string, note: string): Reply {
  let s = '<!doctype html><meta charset="utf-8"><title>Zinc hub</title><style>body{font:15px system-ui;margin:2em;max-width:60em}td,th{padding:.2em .8em;text-align:left}</style>';
  s += '<h1>Zinc hub</h1>' + (note.length > 0 ? '<p><b>' + html(note) + '</b></p>' : '');
  s += '<p>Server key <code>' + hubPublic + '</code><br>Pairing code <b>' + pairCode + '</b></p><h2>Apps</h2><table><tr><th>App</th><th>Channel</th><th>Version</th><th></th></tr>';
  for (const id of list(apps)) {
    if (!safe(id)) continue;
    for (const c of channels(id)) {
      const live = current(id, c);
      for (const v of versions(id, c)) {
        const gone = retracted(id, c, v);
        s += '<tr><td>' + html(id) + '</td><td>' + html(c) + '</td><td>' + html(v) + (v === live ? ' (current)' : '') + (gone ? ' (retracted)' : '') + '</td><td>';
        if (!gone) s += '<form method="post" action="/admin/retract"><input type="hidden" name="token" value="' + html(token) + '"><input type="hidden" name="app" value="' + html(id) +
          '"><input type="hidden" name="channel" value="' + html(c) + '"><input type="hidden" name="version" value="' + html(v) + '"><button>Retract</button></form>';
        s += '</td></tr>';
      }
    }
  }
  s += '</table><h2>Devices</h2><table><tr><th>Name</th><th>Paired</th></tr>';
  for (const l of deviceLines()) { const f = l.split('\t'); s += '<tr><td>' + html(f.length > 1 ? f[1] : '') + '</td><td>' + (f.length > 2 ? new Date(parseFloat(f[2])).toISOString() : '') + '</td></tr>'; }
  return reply(200, s + '</table>', 'text/html; charset=utf-8');
}
function retract(req: Request): Reply {
  const token = form(req.body, 'token');
  if (!same(token, publisherToken)) return reply(403, 'wrong token\n');
  const id = form(req.body, 'app'), c = form(req.body, 'channel'), v = form(req.body, 'version');
  if (!safe(id) || !safe(c) || !safe(v) || !fs.exists(apps + '/' + id + '/' + c + '/' + v + '.manifest')) return reply(404, 'no such version\n');
  fs.writeText(apps + '/' + id + '/' + c + '/' + v + '.retracted', Date.now().toString() + '\n');
  catalogText = '';
  console.log('hub: retracted ' + id + ' ' + v + ' on ' + c);
  return adminPage(token, 'Retracted ' + id + ' ' + v + ' on ' + c + '.');
}

async function handle(req: Request): Promise<Reply> {
  const q = req.path.indexOf('?');
  const path = q < 0 ? req.path : req.path.slice(0, q);
  if (req.method === 'POST' && path === '/pair') return await pair(req);
  if (req.method === 'POST' && path === '/publish') {
    if (!same(bearer(req), publisherToken)) return reply(403, 'wrong publisher token\n');
    return await publish(req);
  }
  if (req.method === 'GET' && path === '/admin') { const t = query(req.path, 'token'); return same(t, publisherToken) ? adminPage(t, '') : reply(403, 'wrong token\n'); }
  if (req.method === 'POST' && path === '/admin/retract') return retract(req);
  if (req.method !== 'GET') return reply(405, 'method not allowed\n');
  if (!(await isDevice(req))) return reply(401, 'pair this device first (POST /pair)\n');
  if (path === '/catalog.json' || path === '/catalog.json.sig') {
    await signedCatalog();
    return path === '/catalog.json' ? reply(200, catalogText, 'application/json') : reply(200, catalogSig + '\n');
  }
  const p = path.split('/');   // '', 'apps', id, name
  if (p.length === 4 && p[1] === 'apps' && safe(p[2]) && safe(p[3])) {
    const id = p[2], name = p[3];
    if (name.endsWith('.manifest')) {
      const c = name.slice(0, name.length - 9), v = current(id, c);
      if (v.length > 0) return reply(200, fs.readText(apps + '/' + id + '/' + c + '/' + v + '.manifest'));
    } else if ((name.endsWith('.zapp') || name.endsWith('.png')) && fs.exists(apps + '/' + id + '/' + name)) {
      const zapp = name.endsWith('.png') ? name.slice(0, name.length - 4) + '.zapp' : name;
      for (const c of channels(id)) {   // only a package (or its icon) that a current, unretracted manifest points at
        const v = current(id, c);
        if (v.length > 0 && parseManifest(fs.readText(apps + '/' + id + '/' + c + '/' + v + '.manifest')).get('url') === zapp)
          return reply(200, fs.readText(apps + '/' + id + '/' + name), name.endsWith('.png') ? 'image/png' : 'application/octet-stream');   // readText is byte for byte
      }
    }
  }
  return reply(404, 'not found\n');
}

async function main(): Promise<void> {
  fs.mkdir(apps, true);
  const seedHex = secret('hub.key');
  hubKey = await subtle.importKey('raw-private', unhex(seedHex), { name: 'Ed25519' }, false, ['sign']);
  hubPublic = hex((hubKey as CryptoKey).data);
  publisherToken = secret('publisher.token');
  serveAsync(port, handle);
  console.log('hub: listening on port ' + port.toString() + ', data in ' + data);
  console.log('hub: server key ' + hubPublic);
  console.log('hub: publisher token in ' + data + '/publisher.token');
  newPairCode();
}
main();
