// The hub's files: `key=value` lines, as the manifests are. hub.conf holds the server, the server key pinned at pairing and the device token
// (mode 600); apps/<id>/installed and apps/<id>/previous describe what is installed and what Rollback brings back. Saving keeps unknown keys.
import * as fs from 'zinc:fs';
import { HUB_DIR, DEFAULT_SERVER, STABLE } from '../constants';

export class KeyValues {
  keys: string[] = [];
  values: string[] = [];
  get(k: string): string { const i = this.keys.indexOf(k); return i < 0 ? '' : this.values[i]; }
  set(k: string, v: string): void {
    const i = this.keys.indexOf(k);
    if (i < 0) { this.keys.push(k); this.values.push(v); } else this.values[i] = v;
  }
}
export function readKeyValues(path: string): KeyValues {
  const kv = new KeyValues();
  if (!fs.exists(path)) return kv;
  for (const line of fs.readText(path).split('\n')) {
    const eq = line.indexOf('=');
    if (eq > 0) kv.set(line.slice(0, eq), line.slice(eq + 1));
  }
  return kv;
}
export function writeKeyValues(path: string, kv: KeyValues, secret: boolean): void {
  let s = '';
  for (let i: i32 = 0; i < kv.keys.length; i++) s += kv.keys[i] + '=' + kv.values[i].split('\n').join(' ') + '\n';
  const slash = path.lastIndexOf('/');
  if (slash > 0) fs.mkdir(path.slice(0, slash), true);
  fs.writeText(path + '.tmp', s);
  if (secret) fs.chmod(path + '.tmp', 0o600);
  fs.rename(path + '.tmp', path);
}

const CONFIG_PATH = HUB_DIR + '/hub.conf';

export class HubConfig {
  server: string = DEFAULT_SERVER;
  /** The server's Ed25519 public key (hex), given at pairing: every catalog must be signed by it. */
  serverKey: string = '';
  token: string = '';
  kv: KeyValues = new KeyValues();
  get paired(): boolean { return this.serverKey.length === 64 && this.token.length > 0; }
  /** The channel this tablet follows for an app: stable unless set to beta. */
  channelOf(id: string): string { const c = this.kv.get('channel.' + id); return c !== '' ? c : STABLE; }
}

export function loadConfig(): HubConfig {
  const c = new HubConfig();
  c.kv = readKeyValues(CONFIG_PATH);
  if (c.kv.get('server') !== '') c.server = c.kv.get('server');
  c.serverKey = c.kv.get('serverKey');
  c.token = c.kv.get('token');
  return c;
}
export function saveConfig(c: HubConfig): void {
  c.kv.set('server', c.server);
  c.kv.set('serverKey', c.serverKey);
  c.kv.set('token', c.token);
  writeKeyValues(CONFIG_PATH, c.kv, true);
}
