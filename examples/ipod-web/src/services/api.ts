// /api: the iPod API in JSON for the Mac app's "remote iPod" (docs/reports/ipod-daemon.md). A bearer token (header or ?token=);
// without --token, 127.0.0.1 needs none. Writes need --allow-changes. Errors are {"error": "<sentence>"}.
import * as ipod from 'zinc:ipod';
import * as fs from 'zinc:fs';
import * as net from 'zinc:net';
import { El, toJson, strings, quote } from '../element';
import { Query, queryOf, jsonReply } from '../query';
import { options } from './options';
import { lib, load, close } from './library';
import { trackFile, coverFile, pngReply, cacheDir } from './files';
import { last } from '../state';

function fail(status: i32, sentence: string): net.Reply { return jsonReply(status, `{"error": ${quote(sentence)}}`); }

export function deviceEl(d: ipod.Device): El {
  return new El('devices').s('mountpoint', d.mountpoint).s('name', d.name).s('model', d.model).s('modelNumber', d.modelNumber)
    .s('generation', d.generation).n('capacityGb', d.capacityGb).n('totalBytes', d.totalBytes).n('freeBytes', d.freeBytes)
    .s('serial', d.serial).s('firewireGuid', d.firewireGuid).b('sysInfoExtended', d.sysInfoExtended).b('hasDatabase', d.hasDatabase)
    .b('readOnly', d.readOnly).b('artwork', d.artwork).s('checksum', d.checksum).s('connection', d.connection).s('firmware', d.firmware)
    .n('usbProduct', d.usbProduct);
}

function trackEl(t: ipod.Track): El {
  return new El('tracks').s('id', t.id).s('title', t.title).s('artist', t.artist).s('album', t.album).s('albumArtist', t.albumArtist)
    .s('genre', t.genre).s('composer', t.composer).s('comment', t.comment).n('trackNr', t.trackNr).n('tracks', t.tracks).n('cdNr', t.cdNr)
    .n('cds', t.cds).n('year', t.year).n('rating', t.rating).n('playCount', t.playCount).n('bitrate', t.bitrate).n('sampleRate', t.sampleRate)
    .n('durationMs', t.durationMs).n('size', t.size).s('mediaType', t.mediaType).s('path', t.path).b('artwork', t.artwork)
    .n('added', t.added).n('lastPlayed', t.lastPlayed);
}

function playlistEl(p: ipod.Playlist): El {
  return new El('playlists').s('id', p.id).s('name', p.name).b('master', p.master).b('podcasts', p.podcasts).b('smart', p.smart)
    .json('trackIds', strings(p.trackIds));
}

/** What the web page's header shows: the open iPod (open '' when none), its storage and counts, and whether changes are allowed. */
function statusEl(): El {
  const e = new El('status').s('open', lib.mountpoint).s('name', lib.name).s('error', lib.error).b('allowChanges', options.allowChanges)
    .n('songs', lib.tracks.length).n('albums', lib.albums.length).n('artists', lib.artists.length).n('playlists', lib.playlists.length);
  for (const d of last.pods) {
    if (d.mountpoint !== lib.mountpoint || lib.mountpoint === '') continue;
    e.s('model', d.model).s('generation', d.generation).n('capacityGb', d.capacityGb).n('totalBytes', d.totalBytes)
      .n('freeBytes', d.freeBytes).b('readOnly', d.readOnly);
  }
  return e;
}

function authorized(req: net.Request, q: Query): boolean {
  if (req.headers.get('authorization') === 'Bearer ' + options.token || q.get('token') === options.token) return true;
  return !options.tokenGiven && req.remoteAddress === '127.0.0.1';
}

/** The ids of a body like {"ids": ["a", "b"]}. */
function idsOf(body: string): string[] {
  const out: string[] = [];
  const at = body.indexOf('[');
  const end = body.indexOf(']', at);
  if (at < 0 || end < 0) return out;
  for (const part of body.slice(at + 1, end).split(',')) {
    const s = part.trim();
    if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) out.push(s.slice(1, s.length - 1));
  }
  return out;
}

async function add(req: net.Request, q: Query): Promise<net.Reply> {
  const name = q.get('name').split('/').pop() as string;
  if (name === '' || name.indexOf('.') < 0) return fail(400, 'Give the file name with its extension: /api/add?name=song.mp3.');
  if (req.rawBody === undefined || (req.rawBody as string).length === 0) return fail(400, 'The request body must be the file.');
  const dir = `${cacheDir()}/upload-${Date.now()}`;   // the file keeps its own name: a song without tags is titled after it
  const file = `${dir}/${name}`;
  fs.mkdir(dir, true);
  fs.writeText(file, req.rawBody as string);
  try {
    const results = await ipod.add([file], q.get('playlist'));
    await load();
    const root = new El('root').list('results');
    for (const r of results) root.add(new El('results').s('file', name).s('id', r.id).s('error', r.error));
    return jsonReply(200, toJson(root));
  } finally {
    fs.remove(dir, true);
  }
}

async function write(req: net.Request, q: Query, what: string): Promise<net.Reply> {
  if (!options.allowChanges) return fail(403, 'This daemon is read only: start it with --allow-changes to add, remove or eject.');
  if (req.method !== 'POST') return fail(405, `Use POST for /api/${what}.`);
  if (lib.mountpoint === '') return fail(404, 'No iPod is open.');
  if (what === 'add') return add(req, q);
  if (what === 'remove') {
    const ids = idsOf(req.body);
    if (ids.length === 0) return fail(400, 'The body must be {"ids": ["<track id>", ...]}.');
    for (const id of ids) if (!lib.trackById.has(id)) return fail(404, `No track has the id ${id}.`);
    await ipod.remove(ids);
    await load();
    return jsonReply(200, `{"removed": ${ids.length}}`);
  }
  const mp = lib.mountpoint;   // eject
  await close();
  await ipod.eject(mp);
  return jsonReply(200, `{"ejected": ${quote(mp)}}`);
}

async function route(req: net.Request, q: Query): Promise<net.Reply> {
  const parts = q.path.split('/');   // '', 'api', route, id
  const what = parts.length > 2 ? parts[2] : '';
  const id = parts.length > 3 ? decodeURIComponent(parts[3]) : '';
  if (what === 'add' || what === 'remove' || what === 'eject') return write(req, q, what);
  if (req.method !== 'GET') return fail(405, 'Use GET for this route.');
  if (what === 'devices') {
    const root = new El('root').list('devices').s('open', lib.mountpoint);
    for (const d of last.pods) root.add(deviceEl(d));
    return jsonReply(200, toJson(root));
  }
  if (what === 'status') return jsonReply(200, toJson(statusEl()));
  if (what !== 'tracks' && what !== 'playlists' && what !== 'specs' && what !== 'file' && what !== 'cover') return fail(404, `There is no route /api/${what}.`);
  if (lib.mountpoint === '') return fail(404, 'No iPod is open.');
  if (what === 'tracks') {
    const root = new El('root').list('tracks');
    for (const t of lib.tracks) root.add(trackEl(t));
    return jsonReply(200, toJson(root));
  }
  if (what === 'playlists') {
    const root = new El('root').list('playlists');
    for (const p of lib.playlists) root.add(playlistEl(p));
    return jsonReply(200, toJson(root));
  }
  if (what === 'specs') {
    const root = new El('root').list('specs');
    for (const s of await ipod.specs()) root.add(new El('specs').s('group', s.group).s('name', s.name).s('value', s.value));
    return jsonReply(200, toJson(root));
  }
  const t = lib.trackById.get(id);
  if (t === undefined) return fail(404, `No track has the id ${id}.`);
  if (what === 'file') return trackFile(t as ipod.Track);
  const png = await coverFile(id);   // ponytail: ?size is ignored, the cover is the largest the iPod stores
  return png === '' ? fail(404, 'This track has no cover.') : pngReply(png);
}

export async function api(req: net.Request): Promise<net.Reply> {
  const q = queryOf(req);
  if (!authorized(req, q)) return fail(401, 'A token is needed: Authorization: Bearer <token>, or ?token=<token>.');
  try {
    return await route(req, q);
  } catch (e) {
    return fail(500, (e as Error).message);
  }
}
