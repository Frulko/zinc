// A remote iPod: the /api of an iPod daemon (examples/ipod-web, docs/reports/ipod-daemon.md) over zinc:net. The library, the
// covers and the track files come from it; add, remove and eject are asked of it (it refuses them, 403 and a sentence, unless
// started with --allow-changes). Only services/ipod.ts calls this file.
import * as net from 'zinc:net';
import * as fs from 'zinc:fs';
import * as ipod from 'zinc:ipod';
import { imageFromBytes } from 'zinc:gfx';
import { backupPlace } from './log';

const TIMEOUT_MS: i32 = 15000;              // a request of the library or a cover
const FILE_TIMEOUT_MS: i32 = 600000;        // a track's file or an upload (a video over Wi-Fi)
const FILE_MAX_BYTES: i32 = 1024 * 1024 * 1024;   // the largest file downloaded: 1 GiB

interface DevicesReply { devices: ipod.Device[]; open: string; }
interface TracksReply { tracks: ipod.Track[]; }
interface PlaylistsReply { playlists: ipod.Playlist[]; }
interface SpecsReply { specs: ipod.SpecItem[]; }
interface AddReply { results: ipod.AddResult[]; }
interface ErrorReply { error: string; }

let address = '';
let token = '';

/** Uses the daemon at `at` ('pi.local:8686' gets http://) with `key` ('' = none) for the calls that follow. */
export function connect(at: string, key: string): void {
  let a = at.trim();
  while (a.endsWith('/')) a = a.slice(0, a.length - 1);
  address = a.indexOf('://') < 0 ? `http://${a}` : a;
  token = key.trim();
}

export function disconnect(): void { address = ''; token = ''; }

/** The address in use, '' when none. */
export function remoteAddress(): string { return address; }

async function call(method: string, path: string, init: net.RequestInit): Promise<net.Response> {
  const h = new net.Headers();
  if (token !== '') h.set('Authorization', `Bearer ${token}`);
  init.method = method;
  init.headers = h;
  if (init.timeoutMs === undefined) init.timeoutMs = TIMEOUT_MS;
  let r: net.Response;
  try { r = await net.fetch(address + path, init); }
  catch (e) { throw new Error(`${address} does not answer (${(e as Error).message})`); }
  if (r.status >= 400) {   // the daemon's sentence, else what answered
    let why = `${address}${path.split('?')[0]} answered ${r.status}${r.status === 404 ? ': is it an iPod daemon?' : ''}`;
    try { const e: ErrorReply = JSON.parse(await r.text()); if (e.error !== '') why = e.error; } catch (e) { /* not the daemon's JSON */ }
    throw new Error(why);
  }
  return r;
}

async function getJson(path: string): Promise<string> { return await (await call('GET', path, {})).text(); }

/** The iPod the daemon has open, its tracks, playlists and specs. */
export async function readRemote(): Promise<ipod.Device> {
  const d: DevicesReply = JSON.parse(await getJson('/api/devices'));
  if (d.open === '') throw new Error(`${address} has no iPod open: plug one into it`);
  for (const x of d.devices) if (x.mountpoint === d.open) return x;
  throw new Error(`${address} has no iPod open: plug one into it`);
}
export async function tracks(): Promise<ipod.Track[]> { const r: TracksReply = JSON.parse(await getJson('/api/tracks')); return r.tracks; }
export async function playlists(): Promise<ipod.Playlist[]> { const r: PlaylistsReply = JSON.parse(await getJson('/api/playlists')); return r.playlists; }
export async function specs(): Promise<ipod.SpecItem[]> { const r: SpecsReply = JSON.parse(await getJson('/api/specs')); return r.specs; }

/** A track's cover as a runtime image (-1 when the bytes are not a picture); throws when it has none (404). */
export async function cover(id: string): Promise<i32> {
  const r = await call('GET', `/api/cover/${encodeURIComponent(id)}`, {});
  return imageFromBytes(await r.bytes());
}

/** Where the files played are kept: one per track, fetched once. */
export function cacheFolder(): string { return `${backupPlace()}/remote-cache`; }

function extensionOf(path: string): string { const d = path.lastIndexOf('.'); return d > path.lastIndexOf('/') && d > path.lastIndexOf(':') ? path.slice(d) : ''; }

/** Writes the track's file to `to` (its folder made); throws with the daemon's sentence. */
export async function fetchFile(t: ipod.Track, to: string): Promise<void> {
  const r = await call('GET', `/api/file/${encodeURIComponent(t.id)}`, { timeoutMs: FILE_TIMEOUT_MS, maxBytes: FILE_MAX_BYTES });
  const bytes = await r.bytes();
  fs.mkdir(to.slice(0, to.lastIndexOf('/')), true);
  const part = `${to}.part`;   // a file cut short is never taken for a whole one
  fs.writeBytes(part, bytes);
  fs.rename(part, to);
}

/** The track's file on this computer, fetched into the cache the first time. */
export async function localFile(t: ipod.Track): Promise<string> {
  const file = `${cacheFolder()}/${t.id}${extensionOf(t.path)}`;
  if (!fs.exists(file)) await fetchFile(t, file);
  return file;
}

/** Uploads each file (POST /api/add, the bytes as the body), into `playlist` ('' = none); one result per file. */
export async function add(files: string[], playlist: string): Promise<ipod.AddResult[]> {
  const out: ipod.AddResult[] = [];
  let refused = '';   // a request refused (read only daemon, gone): the files after it are not sent
  for (const f of files) {
    if (refused !== '') { out.push({ file: f, id: '', error: refused }); continue; }
    const name = f.slice(f.lastIndexOf('/') + 1);
    try {
      const r = await call('POST', `/api/add?name=${encodeURIComponent(name)}&playlist=${encodeURIComponent(playlist)}`,
        { bodyBytes: fs.readBytes(f), contentType: 'application/octet-stream', timeoutMs: FILE_TIMEOUT_MS });
      const a: AddReply = JSON.parse(await r.text());
      for (const x of a.results) out.push({ file: f, id: x.id, error: x.error });
    } catch (e) {
      refused = (e as Error).message;
      out.push({ file: f, id: '', error: refused });
    }
  }
  return out;
}

export async function remove(ids: string[]): Promise<void> {
  const quoted: string[] = [];
  for (const id of ids) quoted.push(JSON.stringify(id));
  await call('POST', '/api/remove', { body: `{"ids": [${quoted.join(', ')}]}`, contentType: 'application/json' });
}

export async function eject(): Promise<void> { await call('POST', '/api/eject', { body: '', contentType: 'application/json' }); }

/** A URL another device fetches the track's file from (a Sonos speaker): the token rides in the query. */
export function fileUrl(id: string): string { return `${address}/api/file/${encodeURIComponent(id)}${token !== '' ? `?token=${encodeURIComponent(token)}` : ''}`; }
export function coverUrl(id: string): string { return `${address}/api/cover/${encodeURIComponent(id)}${token !== '' ? `?token=${encodeURIComponent(token)}` : ''}`; }
