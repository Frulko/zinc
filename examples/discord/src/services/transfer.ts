// Files too large for Discord (the guard's uploadMax: the person's Nitro, the server's boosts) go to a transfer service the person chose,
// and the message carries its link. docs/reports/discord-file-transfer.md says which services have an API whose terms allow it:
//   Litterbox  anonymous, kept 1 to 72 hours, about 1 GB (no published terms: chosen by the person, never by default);
//   pixeldrain the person's own API key;
//   Gokapi     a server of your own (or your team's), by its URL and an API key.
// SwissTransfer, WeTransfer, TransferNow and file.io have no public upload API (or only a reverse-engineered one): not offered.
// The file is read by the engine as it is sent (zinc:net bodyFile), the upload reports its progress; only the files the person chose go.
// The keys stay in the system keychain (zinc:secure-store), the choice and the server's URL in zinc:storage.
import * as storage from 'zinc:storage';
import * as SecureStore from 'zinc:secure-store';
import { RequestInit, Headers } from 'zinc:net';
import { btoa } from 'zinc:web';
import * as guard from '../safety/index';
import { API_BASE } from '../constants';

export class Provider {
  id = ''; name = ''; note = ''; key = false; url = false;
  constructor(id: string, name: string, note: string, key: boolean, url: boolean) { this.id = id; this.name = name; this.note = note; this.key = key; this.url = url; }
}
export const PROVIDERS: Provider[] = [
  new Provider('litterbox', 'Litterbox', 'Anonymous, deleted after 72 hours, up to about 1 GB. No published terms.', false, false),
  new Provider('pixeldrain', 'pixeldrain', 'Your pixeldrain account: its API key (pixeldrain.com, Account, API keys).', true, false),
  new Provider('gokapi', 'Gokapi (your own server)', 'A Gokapi server: its address and an API key with the Upload permission.', true, true),
];
const LITTERBOX = 'https://litterbox.catbox.moe/resources/internals/api.php', PIXELDRAIN = 'https://pixeldrain.com';

/** The person's choice: the provider, a server's URL (Gokapi), and whether its key is saved. */
export class TransferSettings { provider = 'litterbox'; url = ''; }
export function transferSettings(): TransferSettings {
  const t = new TransferSettings();
  try { const v: any = JSON.parse(storage.get('transfer')); if (typeof v.provider === 'string') t.provider = v.provider; if (typeof v.url === 'string') t.url = v.url; } catch (e) {}
  return t;
}
export function saveTransferSettings(t: TransferSettings): void { storage.set('transfer', JSON.stringify({ provider: t.provider, url: t.url })); }
const keyName = (id: string): string => `transfer-key-${id}`;
// against the fake Discord of the tests the keys stay in memory: a scripted session never writes the person's keychain
const testing = API_BASE.startsWith('http://127.0.0.1:') || API_BASE.startsWith('http://localhost:');
const testKeys: Map<string, string> = new Map<string, string>();
export async function transferKey(id: string): Promise<string> {
  if (testing) { const k = testKeys.get(id); return k !== undefined ? k : ''; }
  try { const k = await SecureStore.getItemAsync(keyName(id)); return k !== null ? k : ''; } catch (e) { return ''; }
}
export async function saveTransferKey(id: string, key: string): Promise<void> {
  if (testing) { testKeys.set(id, key); return; }
  if (key === '') await SecureStore.deleteItemAsync(keyName(id)); else await SecureStore.setItemAsync(keyName(id), key);
}

/** A multipart form around one file: the fields, then the file last (as the services ask). */
class Form { prefix = ''; suffix = ''; type = ''; }
function form(fields: string[][], fileField: string, filename: string): Form {
  const b = `----zinc${Date.now()}`, f = new Form();
  for (const kv of fields) f.prefix += `--${b}\r\nContent-Disposition: form-data; name="${kv[0]}"\r\n\r\n${kv[1]}\r\n`;
  f.prefix += `--${b}\r\nContent-Disposition: form-data; name="${fileField}"; filename="${filename.replace(/["\r\n]/g, '_')}"\r\nContent-Type: application/octet-stream\r\n\r\n`;
  f.suffix = `\r\n--${b}--\r\n`;
  f.type = `multipart/form-data; boundary=${b}`;
  return f;
}
const nameOf = (path: string): string => { const p = path.split('/'); return p[p.length - 1]; };

/** Sends one file to the provider; `progress(sent, total)` as it goes. Returns the link to post. */
export async function transferFile(v: guard.Verdict, t: TransferSettings, key: string, path: string, progress: (sent: number, total: number) => void): Promise<string> {
  const name = nameOf(path), init: RequestInit = { method: 'POST', bodyFile: path, onProgress: progress, timeoutMs: 3600000, maxBytes: 1 << 20 };
  let url = '';
  if (t.provider === 'litterbox') {
    const f = form([['reqtype', 'fileupload'], ['time', '72h']], 'fileToUpload', name);
    url = LITTERBOX; init.bodyPrefix = f.prefix; init.bodySuffix = f.suffix; init.contentType = f.type;
  } else if (t.provider === 'pixeldrain') {
    if (key === '') throw new Error('pixeldrain needs your API key.');
    url = `${PIXELDRAIN}/api/file/${encodeURIComponent(name)}`; init.method = 'PUT'; init.contentType = 'application/octet-stream';
    const h = new Headers(); h.set('Authorization', `Basic ${btoa(`:${key}`)}`); init.headers = h;
  } else if (t.provider === 'gokapi') {
    if (t.url === '' || key === '') throw new Error('Gokapi needs your server\'s address and an API key.');
    const f = form([['allowedDownloads', '0'], ['expiryDays', '14']], 'file', name);
    url = `${t.url.replace(/\/+$/, '')}/api/files/add`; init.bodyPrefix = f.prefix; init.bodySuffix = f.suffix; init.contentType = f.type;
    const h = new Headers(); h.set('apikey', key); init.headers = h;
  } else throw new Error(`Unknown transfer service ${t.provider}.`);
  const r = await guard.transferSend(v, url, init);
  const text = r.body;
  if (r.status < 200 || r.status > 299) throw new Error(`${name}: the service answered ${r.status} ${text.slice(0, 120)}`);
  if (t.provider === 'litterbox') { const link = text.trim(); if (!link.startsWith('https://')) throw new Error(`${name}: ${link.slice(0, 120)}`); return link; }
  const j: any = JSON.parse(text);
  if (t.provider === 'pixeldrain') return `${PIXELDRAIN}/u/${j.id}`;
  const link = j.FileInfo !== undefined && j.FileInfo !== null ? `${j.FileInfo.UrlDownload}` : '';
  if (link === '' || link === 'undefined') throw new Error(`${name}: no link in the answer`);
  return link;
}
