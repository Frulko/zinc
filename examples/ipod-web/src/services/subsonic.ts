// /rest: the Subsonic API 1.16.1 over the open iPod, for any Subsonic client (docs/reports/ipod-daemon.md). Each method builds one
// element tree; f=json serialises it as {"subsonic-response": {...}}, anything else as XML. Auth: u with p (plain or enc:<hex>),
// or t = md5(password + s). Ids: tr-<track id>, al-<n>, ar-<n>, pl-<playlist id>.
import * as ipod from 'zinc:ipod';
import * as net from 'zinc:net';
import { subtle } from 'zinc:subtle';
import { toHex } from 'zinc:web';
import { utf8Encode } from 'zinc:sys';
import { El, toXml, toJson } from '../element';
import { Query, queryOf } from '../query';
import { options } from './options';
import { lib, Album, Artist } from './library';
import { trackFile, coverFile, pngReply, suffixOf, contentTypeOf } from './files';
import { SUBSONIC_VERSION } from '../constants';

class Failure { code: i32; message: string; constructor(code: i32, message: string) { this.code = code; this.message = message; } }

function respond(q: Query, body: El | null, failure: Failure | null): net.Reply {
  const root = new El('subsonic-response').s('status', failure === null ? 'ok' : 'failed').s('version', SUBSONIC_VERSION)
    .s('type', 'zinc').s('serverVersion', '0.1.0').b('openSubsonic', true);
  if (failure !== null) root.add(new El('error').n('code', failure.code).s('message', failure.message), false);
  if (body !== null) root.add(body, false);
  if (q.get('f') === 'json') return { status: 200, body: `{"subsonic-response":${toJson(root)}}\n`, contentType: 'application/json; charset=utf-8' };
  root.keys.unshift('xmlns'); root.values.unshift('http://subsonic.org/restapi'); root.kinds.unshift('s');
  return { status: 200, body: '<?xml version="1.0" encoding="UTF-8"?>\n' + toXml(root) + '\n', contentType: 'text/xml; charset=utf-8' };
}
function failed(q: Query, code: i32, message: string): net.Reply { return respond(q, null, new Failure(code, message)); }

function fromHex(h: string): string {
  let s = '';
  for (let i = 0; i + 1 < h.length; i += 2) s += String.fromCharCode(parseInt(h.slice(i, i + 2), 16));
  return s;
}

async function authorized(q: Query): Promise<boolean> {
  if (options.user === '' || q.get('u') !== options.user) return false;
  const t = q.get('t');
  if (t !== '') return toHex(await subtle.digest('MD5', utf8Encode(options.password + q.get('s')))) === t.toLowerCase();
  const p = q.get('p');
  return (p.startsWith('enc:') ? fromHex(p.slice(4)) : p) === options.password;
}

function iso(unixSeconds: number): string { return new Date(unixSeconds > 0 ? unixSeconds * 1000 : 0).toISOString(); }

function songEl(t: ipod.Track, name: string = 'song'): El {
  const al = lib.albumOfTrack.get(t.id) as Album;
  const e = new El(name).s('id', 'tr-' + t.id).s('parent', al.id).b('isDir', false).s('title', t.title).s('album', al.name)
    .s('artist', t.artist !== '' ? t.artist : al.artist);
  if (t.trackNr > 0) e.n('track', t.trackNr);
  if (t.year > 0) e.n('year', t.year);
  if (t.genre !== '') e.s('genre', t.genre);
  if (t.artwork) e.s('coverArt', 'tr-' + t.id);
  e.n('size', t.size).s('contentType', contentTypeOf(t.path)).s('suffix', suffixOf(t.path)).n('duration', Math.round(t.durationMs / 1000))
    .n('bitRate', t.bitrate).s('path', t.path).n('playCount', t.playCount);
  if (t.cdNr > 0) e.n('discNumber', t.cdNr);
  e.s('created', iso(t.added)).s('albumId', al.id).s('artistId', al.artistId).s('type', t.mediaType === 'audio' ? 'music' : t.mediaType);
  return e;
}

/** An album as AlbumID3 (id3) or as a directory child (getAlbumList, search2). */
function albumEl(a: Album, id3: boolean): El {
  const e = new El('album').s('id', a.id);
  if (id3) e.s('name', a.name); else e.s('parent', a.artistId).b('isDir', true).s('title', a.name);
  e.s('artist', a.artist).s('artistId', a.artistId);
  if (a.coverTrack !== '') e.s('coverArt', a.id);
  e.n('songCount', a.songs.length).n('duration', Math.round(a.durationMs / 1000)).n('playCount', a.playCount).s('created', iso(a.added));
  if (a.year > 0) e.n('year', a.year);
  if (a.genre !== '') e.s('genre', a.genre);
  return e;
}
function artistEl(a: Artist): El {
  const e = new El('artist').s('id', a.id).s('name', a.name).n('albumCount', a.albums.length);
  for (const al of a.albums) if (al.coverTrack !== '') { e.s('coverArt', al.id); break; }
  return e;
}

/** Artists grouped by their first letter ('#' for the others): getIndexes and getArtists. */
function indexed(into: El): El {
  let current: El | null = null;
  let letter = '';
  into.list('index');
  for (const a of lib.artists) {
    const c = a.name.slice(0, 1).toUpperCase();
    const l = c >= 'A' && c <= 'Z' ? c : '#';
    if (current === null || l !== letter) { letter = l; current = into.add(new El('index').s('name', l)); }
    (current as El).add(artistEl(a));
  }
  return into;
}

function matches(text: string, words: string): boolean { return words === '' || text.toLowerCase().indexOf(words) >= 0; }

function search(q: Query, name: string, id3: boolean): El {
  const words = q.get('query').replaceAll('"', '').trim().toLowerCase();
  const e = new El(name).list('artist').list('album').list('song');
  const artists = lib.artists.filter((a: Artist) => matches(a.name, words));
  const albums = lib.albums.filter((a: Album) => matches(a.name, words));
  const songs = lib.tracks.filter((t: ipod.Track) => matches(t.title, words) || matches(t.artist, words) || matches(t.album, words));
  const ao = q.num('artistOffset', 0); const ac = q.num('artistCount', 20);
  for (const a of artists.slice(ao, ao + ac)) e.add(artistEl(a));
  const bo = q.num('albumOffset', 0); const bc = q.num('albumCount', 20);
  for (const a of albums.slice(bo, bo + bc)) e.add(albumEl(a, id3));
  const so = q.num('songOffset', 0); const sc = q.num('songCount', 20);
  for (const t of songs.slice(so, so + sc)) e.add(songEl(t));
  return e;
}

function shuffle<T>(list: T[]): T[] {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const x = out[i]; out[i] = out[j]; out[j] = x; }
  return out;
}

function albumList(q: Query, name: string, id3: boolean): El | Failure {
  const type = q.get('type');
  let list = lib.albums.slice();
  if (type === 'alphabeticalByArtist') list.sort((a: Album, b: Album): i32 => a.artist.toLowerCase() < b.artist.toLowerCase() ? -1 : a.artist.toLowerCase() > b.artist.toLowerCase() ? 1 : 0);
  else if (type === 'newest') list.sort((a: Album, b: Album): i32 => b.added - a.added);
  else if (type === 'random') list = shuffle(list);
  else if (type === 'frequent') list = list.filter((a: Album) => a.playCount > 0).sort((a: Album, b: Album): i32 => b.playCount - a.playCount);
  else if (type === 'recent') list = list.filter((a: Album) => a.lastPlayed > 0).sort((a: Album, b: Album): i32 => b.lastPlayed - a.lastPlayed);
  else if (type === 'byYear') {
    const from = q.num('fromYear', 0); const to = q.num('toYear', 9999);
    list = list.filter((a: Album) => a.year >= Math.min(from, to) && a.year <= Math.max(from, to));
    list.sort((a: Album, b: Album): i32 => from <= to ? a.year - b.year : b.year - a.year);
  } else if (type === 'byGenre') list = list.filter((a: Album) => a.genre === q.get('genre'));
  else if (type === 'starred') list = [];
  else if (type !== 'alphabeticalByName') return new Failure(10, `Unknown album list type '${type}'.`);
  const offset = q.num('offset', 0);
  const e = new El(name).list('album');
  for (const a of list.slice(offset, offset + Math.min(q.num('size', 10), 500))) e.add(albumEl(a, id3));
  return e;
}

function randomSongs(q: Query): El {
  const genre = q.get('genre');
  const from = q.num('fromYear', 0); const to = q.num('toYear', 9999);
  const pool = lib.tracks.filter((t: ipod.Track) => (genre === '' || t.genre === genre) && (q.get('fromYear') === '' && q.get('toYear') === '' || t.year >= from && t.year <= to));
  const e = new El('randomSongs').list('song');
  for (const t of shuffle(pool).slice(0, Math.min(q.num('size', 10), 500))) e.add(songEl(t));
  return e;
}

function genres(): El {
  const names: string[] = [];
  const songs: i32[] = [];
  const albums: i32[] = [];
  for (const t of lib.tracks) {
    if (t.genre === '') continue;
    let i = names.indexOf(t.genre);
    if (i < 0) { names.push(t.genre); songs.push(0); albums.push(0); i = names.length - 1; }
    songs[i]++;
  }
  for (const a of lib.albums) { const i = names.indexOf(a.genre); if (i >= 0) albums[i]++; }
  const e = new El('genres').list('genre');
  for (let i = 0; i < names.length; i++) { const g = e.add(new El('genre').n('songCount', songs[i]).n('albumCount', albums[i])); g.text = names[i]; }
  return e;
}

function playlistEl(p: ipod.Playlist, withEntries: boolean): El {
  let seconds = 0;
  for (const id of p.trackIds) { const t = lib.trackById.get(id); if (t !== undefined) seconds += (t as ipod.Track).durationMs / 1000; }
  const e = new El('playlist').s('id', 'pl-' + p.id).s('name', p.name).n('songCount', p.trackIds.length).n('duration', Math.round(seconds))
    .b('public', true).s('owner', options.user).s('created', iso(0)).s('changed', iso(0));
  if (withEntries) {
    e.list('entry');
    for (const id of p.trackIds) { const t = lib.trackById.get(id); if (t !== undefined) e.add(songEl(t as ipod.Track, 'entry')); }
  }
  return e;
}

function trackOf(id: string): ipod.Track | null {
  const t = id.startsWith('tr-') ? lib.trackById.get(id.slice(3)) : undefined;
  return t === undefined ? null : t as ipod.Track;
}

/** The answer of a method that is not a file; a Failure for an unknown id or method. */
function answer(method: string, q: Query): El | Failure | null {
  const id = q.get('id');
  if (method === 'ping' || method === 'scrobble') return null;
  if (method === 'getLicense') return new El('license').b('valid', true);
  if (method === 'getMusicFolders') {
    const e = new El('musicFolders').list('musicFolder');
    e.add(new El('musicFolder').n('id', 1).s('name', lib.name !== '' ? lib.name : 'iPod'));
    return e;
  }
  if (method === 'getIndexes') return indexed(new El('indexes').n('lastModified', 0).s('ignoredArticles', ''));
  if (method === 'getArtists') return indexed(new El('artists').s('ignoredArticles', ''));
  if (method === 'getArtist') {
    const a = lib.artistById.get(id);
    if (a === undefined) return new Failure(70, 'Artist not found.');
    const e = artistEl(a as Artist).list('album');
    for (const al of (a as Artist).albums) e.add(albumEl(al, true));
    return e;
  }
  if (method === 'getAlbum') {
    const a = lib.albumById.get(id);
    if (a === undefined) return new Failure(70, 'Album not found.');
    const e = albumEl(a as Album, true).list('song');
    for (const t of (a as Album).songs) e.add(songEl(t));
    return e;
  }
  if (method === 'getAlbumList') return albumList(q, 'albumList', false);
  if (method === 'getAlbumList2') return albumList(q, 'albumList2', true);
  if (method === 'getSong') { const t = trackOf(id); return t === null ? new Failure(70, 'Song not found.') : songEl(t as ipod.Track); }
  if (method === 'getRandomSongs') return randomSongs(q);
  if (method === 'getGenres') return genres();
  if (method === 'search2') return search(q, 'searchResult2', false);
  if (method === 'search3') return search(q, 'searchResult3', true);
  if (method === 'getPlaylists') {
    const e = new El('playlists').list('playlist');
    for (const p of lib.playlists) if (!p.master) e.add(playlistEl(p, false));
    return e;
  }
  if (method === 'getPlaylist') {
    for (const p of lib.playlists) if ('pl-' + p.id === id) return playlistEl(p, true);
    return new Failure(70, 'Playlist not found.');
  }
  if (method === 'getStarred') return new El('starred');
  if (method === 'getStarred2') return new El('starred2');
  if (method === 'getUser') {
    return new El('user').s('username', options.user).b('scrobblingEnabled', false).b('adminRole', false).b('settingsRole', false)
      .b('downloadRole', true).b('uploadRole', false).b('playlistRole', false).b('coverArtRole', false).b('commentRole', false)
      .b('podcastRole', false).b('streamRole', true).b('jukeboxRole', false).b('shareRole', false);
  }
  return new Failure(0, `${method} is not implemented by this server.`);
}

export async function rest(req: net.Request): Promise<net.Reply> {
  const q = queryOf(req);
  let method = q.path.slice('/rest/'.length);
  if (method.endsWith('.view')) method = method.slice(0, method.length - 5);
  if (q.get('u') === '') return failed(q, 10, 'Required parameter is missing: u.');
  if (!(await authorized(q))) return failed(q, 40, 'Wrong username or password.');
  try {
    if (method === 'stream' || method === 'download') {
      const t = trackOf(q.get('id'));
      return t === null ? failed(q, 70, 'Song not found.') : trackFile(t as ipod.Track);
    }
    if (method === 'getCoverArt') {
      const id = q.get('id');
      const album = lib.albumById.get(id);
      const trackId = album !== undefined ? (album as Album).coverTrack : id.startsWith('tr-') ? id.slice(3) : '';
      const png = trackId === '' ? '' : await coverFile(trackId);
      return png === '' ? { status: 404, body: 'no cover\n', contentType: 'text/plain' } : pngReply(png);
    }
    const r = answer(method, q);
    if (r instanceof Failure) return failed(q, r.code, r.message);
    return respond(q, r as El | null, null);
  } catch (e) {
    return failed(q, 0, (e as Error).message);
  }
}
