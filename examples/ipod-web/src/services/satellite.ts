// The read-only half of jukebox's device satellite contract (music-lib-manager docs/architecture.md "Satellites", its reference
// apps/satellite/src/serve.ts): jukebox sees the open iPod, what is on it, and imports songs from it by their sourceUrl.
//   GET /satellite                 {id, api: "1.0", families: ["device"], url}
//   GET /devices                   {items: [device]} (none while no iPod is open)
//   GET /devices/:id               the device: id, name, kind, model, serial, firmware, capacity, free, used, battery, charging, acceptedFormats
//   GET /devices/:id/tracks        {items: [{deviceLocalId, name, artist, album, duration, size, format, sourceUrl, ...}], next}, ?limit=&cursor=
// Same token as /api (Bearer or ?token=; none from 127.0.0.1 without --token); errors in jukebox's shape {error: {code, message}}.
// With --jukebox <its address> --jukebox-token <a jukebox token>, the daemon announces the iPod as a satellite does (POST
// /api/v1/devices, then PUT /api/v1/devices/:id/tracks) when it opens one and after each change of its database: jukebox never calls
// a satellite back, so this is how the iPod shows up there. No jobs (POST /devices/:id/jobs) yet: the daemon does not take orders.
import * as ipod from 'zinc:ipod';
import * as net from 'zinc:net';
import * as os from 'zinc:os';
import { Query, queryOf } from '../query';
import { options } from './options';
import { lib } from './library';
import { dbMarker, suffixOf } from './files';
import { authorized } from './api';
import { last } from '../state';

/** What an iPod plays, as jukebox names formats (its sync plan converts the rest). */
const ACCEPTED: string[] = ['mp3', 'aac', 'alac', 'wav', 'aiff'];
const PAGE: i32 = 500;
const PAGE_MAX: i32 = 5000;
const TIMEOUT_MS: i32 = 30000;

function reply(status: i32, body: any): net.Reply {
  return { status: status, body: JSON.stringify(body) + '\n', contentType: 'application/json; charset=utf-8' };
}
function fail(status: i32, code: string, message: string): net.Reply { return reply(status, { error: { code: code, message: message } }); }

/** The address jukebox reaches the daemon at: --url, else the request's Host. */
function self(req: net.Request | null): string {
  if (options.url !== '') return options.url;
  const host = req !== null ? (req as net.Request).headers.get('host') : '';
  return `http://${host !== '' ? host : `${os.hostname()}:${options.port}`}`;
}

export function deviceId(): string { return `ipod-${lib.guid}`; }

function kindOf(model: string): string {
  const m = model.toLowerCase();
  return m.indexOf('nano') >= 0 ? 'ipod-nano' : m.indexOf('shuffle') >= 0 ? 'ipod-shuffle' : 'ipod-classic';
}

export function deviceJson(): any {
  let d: ipod.Device | null = null;
  for (const p of last.pods) if (p.mountpoint === lib.mountpoint) d = p;
  let audio = 0, video = 0;
  for (const t of lib.tracks) { if (t.mediaType.indexOf('video') >= 0 || t.mediaType.indexOf('movie') >= 0 || t.mediaType.indexOf('tv') >= 0) video += t.size; else audio += t.size; }
  const x = d as ipod.Device;
  return {
    id: deviceId(), name: lib.name !== '' ? lib.name : 'iPod', kind: kindOf(d !== null ? x.model : ''),
    model: d !== null ? x.model : '', serial: lib.serial, firmware: d !== null ? x.firmware : '',
    capacity: d !== null ? x.totalBytes : 0, free: d !== null ? x.freeBytes : 0, used: { audio: audio, video: video },
    battery: null, charging: false, acceptedFormats: ACCEPTED,
  };
}

function trackJson(t: ipod.Track, base: string): any {
  return {
    deviceLocalId: t.id, name: t.title, artist: t.artist, album: t.album, albumArtist: t.albumArtist,
    // the file's extension, as the reference satellite reports it: jukebox's import (acquire.ts) names the file `<name>.<format>`
    duration: Math.round(t.durationMs / 1000), size: t.size, format: suffixOf(t.path),
    sourceUrl: `${base}/api/file/${encodeURIComponent(t.id)}?token=${encodeURIComponent(options.token)}`,
    trackNumber: t.trackNr, discNumber: t.cdNr, year: t.year, genre: t.genre, rating: t.rating, playCount: t.playCount,
    lastPlayed: t.lastPlayed,
  };
}

function tracksPage(q: Query, base: string): any {
  let limit = q.num('limit', PAGE);
  if (limit < 1) limit = PAGE;
  if (limit > PAGE_MAX) limit = PAGE_MAX;
  const at = q.num('cursor', 0);
  const items: any[] = [];
  for (let i = at; i < lib.tracks.length && i < at + limit; i++) items.push(trackJson(lib.tracks[i], base));
  return { items: items, next: at + limit < lib.tracks.length ? `${at + limit}` : null };
}

/** /satellite and /devices...: GET only, the daemon's token. */
export async function satellite(req: net.Request): Promise<net.Reply> {
  const q = queryOf(req);
  if (!authorized(req, q)) return fail(401, 'unauthorized', 'a token is needed: Authorization: Bearer <token>, or ?token=<token>');
  if (req.method !== 'GET') return fail(405, 'read_only', 'this satellite is read only: it takes no jobs yet');
  if (q.path === '/satellite') return reply(200, { id: `sat-ipod-web-${os.hostname()}`, api: '1.0', families: ['device'], url: self(req) });
  const parts = q.path.split('/');   // '', 'devices', id, 'tracks'
  if (parts.length === 2) return reply(200, { items: lib.mountpoint !== '' ? [deviceJson()] : [] });
  if (lib.mountpoint === '' || decodeURIComponent(parts[2]) !== deviceId()) return fail(404, 'not_found', 'unknown device');
  if (parts.length === 3) return reply(200, deviceJson());
  if (parts.length === 4 && parts[3] === 'tracks') return reply(200, tracksPage(q, self(req)));
  return fail(404, 'not_found', 'unknown route');
}

let announced = '';

/** Tells jukebox (--jukebox) about the open iPod and what is on it, once per database change; a failure is said once and tried
 *  again at the next scan. */
export async function announce(): Promise<void> {
  if (options.jukebox === '' || lib.mountpoint === '') return;
  const marker = `${deviceId()}|${dbMarker()}|${lib.tracks.length}`;
  if (marker === announced) return;
  const h = new net.Headers();
  if (options.jukeboxToken !== '') h.set('Authorization', `Bearer ${options.jukeboxToken}`);
  const api = `${options.jukebox}/api/v1`;
  try {
    const dev = deviceJson();
    dev.satelliteId = `sat-ipod-web-${os.hostname()}`;
    let r = await net.fetch(`${api}/devices`, { method: 'POST', headers: h, body: JSON.stringify(dev), contentType: 'application/json', timeoutMs: TIMEOUT_MS });
    if (r.status >= 300) throw new Error(`POST /devices answered ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const items: any[] = [];
    for (const t of lib.tracks) items.push(trackJson(t, self(null)));
    r = await net.fetch(`${api}/devices/${encodeURIComponent(deviceId())}/tracks`, { method: 'PUT', headers: h, body: JSON.stringify({ items: items }),
      contentType: 'application/json', timeoutMs: TIMEOUT_MS });
    if (r.status >= 300) throw new Error(`PUT /devices/${deviceId()}/tracks answered ${r.status}: ${(await r.text()).slice(0, 200)}`);
    console.log(`ipod-web: ${lib.tracks.length} tracks reported to jukebox ${options.jukebox} (${(await r.text()).trim()})`);
    announced = marker;
  } catch (e) {
    if (announced !== `!${marker}`) console.log(`ipod-web: cannot reach jukebox ${options.jukebox}: ${(e as Error).message}`);
    announced = `!${marker}`;
  }
}
