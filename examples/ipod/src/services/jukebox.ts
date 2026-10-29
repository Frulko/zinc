// jukebox (the music library server, music-lib-manager) as a source of songs for the iPod
// (docs/reports/ipod-jukebox-interconnect.md, item 2). Its own API first, /api/v1 with a bearer token:
//   browse     GET /facets (artists, then the albums of one), /playlists, /tracks?q= (search), /tracks?artist=&album=, /playlists/:id/tracks
//   file       GET /stream/:id?rendition= with Range: the original when an iPod plays it, else a rendition it already holds, else
//              POST /transcode {ids, format: aac} (one job for the songs that need it, kept by jukebox as a second rendition), then
//              GET /jobs/:id until it ends; a song it could not convert is converted while sent (stream?format=aac: no Range)
//   tags       every column of /tracks (composer, grouping, disc, BPM, rating...) and the cover from /artwork/<hash>
// Any other Subsonic server (Navidrome...) through /rest when /api/v1 is not there: the token is then "user:password" (or an
// OpenSubsonic API key); getArtists, getArtist, getAlbum, getPlaylists, getPlaylist, search3, download (Range) or stream?format=aac,
// getCoverArt. Files come in slices of SLICE bytes into <file>.part/: a download cut short goes on from the last slice.
// No UI here: src/jukeboxAdd.ts queues the job, src/pages/add/JukeboxSource.tsx browses.
import * as net from 'zinc:net';
import * as fs from 'zinc:fs';
import * as ipod from 'zinc:ipod';
import { toHex } from 'zinc:web';
import { utf8Encode } from 'zinc:sys';
import { addTracks, createPlaylistOf } from './ipod';
import * as cache from './cache';

/** What an iPod plays, as jukebox names formats (tags.ts shortFormat); Subsonic's suffixes beside them. */
export const PLAYABLE = ['mp3', 'aac', 'alac', 'wav', 'aiff', 'm4a', 'm4b', 'aif'];
/** What a song an iPod cannot play becomes. ponytail: AAC 256k always; ALAC for a roomy Classic is a later choice. */
const TARGET = 'aac';
const TIMEOUT_MS: i32 = 30000;
const FILE_TIMEOUT_MS: i32 = 600000;
const FILE_MAX_BYTES: i32 = 1024 * 1024 * 1024;
const JOB_WAIT_MS: i32 = 30 * 60 * 1000;   // a conversion job of a whole album on a small server
let SLICE: i32 = 8 * 1024 * 1024;
/** The size of the slices a file is fetched in (the tests make it small to cut a download in the middle). */
export function setSlice(bytes: i32): void { SLICE = bytes; }
let pollMs: i32 = 1000;
export function setPollMs(ms: i32): void { pollMs = ms; }

export class Server {
  url: string = '';
  token: string = '';
  /** A Subsonic server (no /api/v1). */
  subsonic: boolean = false;
}

/** One row to browse: an artist, an album or a playlist. `id`: jukebox's name or Subsonic's id. */
export class Entry {
  kind: string = '';
  id: string = '';
  name: string = '';
  /** The album's artist, or what a playlist holds ("12 songs"). */
  sub: string = '';
  constructor(kind: string, id: string, name: string, sub: string) { this.kind = kind; this.id = id; this.name = name; this.sub = sub; }
}

export class Rendition { id: string = ''; format: string = ''; }

export class Song {
  id: string = '';
  title: string = ''; artist: string = ''; albumArtist: string = ''; album: string = ''; genre: string = ''; composer: string = '';
  comment: string = ''; grouping: string = '';
  trackNr: i32 = 0; tracks: i32 = 0; cdNr: i32 = 0; year: i32 = 0; rating: i32 = 0; bpm: i32 = 0;
  compilation: boolean = false;
  durationS: number = 0;
  /** jukebox's format ('flac', 'aac'...) or Subsonic's suffix. */
  format: string = '';
  renditions: Rendition[] = [];
  /** The cover: jukebox's /api/v1/artwork/<hash> path, or Subsonic's coverArt id; '' when none. */
  artwork: string = '';
}

function num(v: any): number { return v === undefined || v === null || typeof v !== 'number' ? 0 : v as number; }
function int(v: any): i32 { return Math.round(num(v)) as i32; }
function str(v: any): string { return v === undefined || v === null ? '' : '' + v; }

function base(at: string): string {
  let a = at.trim();
  while (a.endsWith('/')) a = a.slice(0, a.length - 1);
  return a.indexOf('://') < 0 ? `http://${a}` : a;
}

function headers(s: Server): net.Headers {
  const h = new net.Headers();
  if (!s.subsonic && s.token !== '') h.set('Authorization', `Bearer ${s.token}`);
  return h;
}

/** Subsonic's credentials as query parameters: u + p=enc:<hex> for "user:password", else an OpenSubsonic apiKey. */
function auth(s: Server): string {
  const at = s.token.indexOf(':');
  const creds = at > 0
    ? `u=${encodeURIComponent(s.token.slice(0, at))}&p=enc:${toHex(utf8Encode(s.token.slice(at + 1)))}`
    : `apiKey=${encodeURIComponent(s.token)}`;
  return `${creds}&v=1.16.1&c=zinc-ipod&f=json`;
}

function urlOf(s: Server, path: string): string {
  if (!s.subsonic) return `${s.url}/api/v1${path}`;
  return `${s.url}/rest/${path}${path.indexOf('?') < 0 ? '?' : '&'}${auth(s)}`;
}

async function call(s: Server, method: string, path: string, body: string = ''): Promise<any> {
  const init: net.RequestInit = { method: method, headers: headers(s), timeoutMs: TIMEOUT_MS };
  if (method === 'POST') { init.body = body; init.contentType = 'application/json'; }
  let r: net.Response;
  try { r = await net.fetch(urlOf(s, path), init); }
  catch (e) { throw new Error(`${s.url} does not answer (${(e as Error).message})`); }
  const text = await r.text();
  let j: any = null;
  try { j = JSON.parse(text); } catch (e) { throw new Error(`${s.url}: ${path.split('?')[0]} answered ${r.status}, not JSON: is it jukebox?`); }
  if (s.subsonic) {
    const sr = j['subsonic-response'];
    if (sr === undefined || sr === null) throw new Error(`${s.url}/rest answered without a subsonic-response: is it a Subsonic server?`);
    if (str(sr.status) !== 'ok') throw new Error(`Subsonic: ${sr.error !== undefined ? str(sr.error.message) : 'failed'}`);
    return sr;
  }
  if (r.status === 401) throw new Error('jukebox refused the token: make one in jukebox (Settings, tokens) and paste it here');
  if (r.status >= 400) throw new Error(`jukebox: ${j.error !== undefined && j.error !== null ? str(j.error.message) : `${path.split('?')[0]} answered ${r.status}`}`);
  return j;
}

/** The server at `at`: jukebox when it has /api/v1/health, else a Subsonic server (its /rest/ping answered). Throws why not. */
export async function connect(at: string, token: string): Promise<Server> {
  const s = new Server();
  s.url = base(at); s.token = token.trim();
  if (s.url === 'http://') throw new Error('Give the address of jukebox (http://nas.local:8787)');
  let api = false;
  try { const r = await net.fetch(`${s.url}/api/v1/health`, { timeoutMs: TIMEOUT_MS }); api = r.status === 200 && (await r.text()).indexOf('"ok"') >= 0; }
  catch (e) { throw new Error(`${s.url} does not answer (${(e as Error).message})`); }
  if (!api) {
    s.subsonic = true;
    await call(s, 'GET', 'ping.view');
  }
  return s;
}

/** One line for the Test connection button: what answered and how much it holds. */
export async function describe(s: Server): Promise<string> {
  if (s.subsonic) {
    const n = (await artists(s)).length;
    return `Connected to a Subsonic server: ${n} artist${n === 1 ? '' : 's'}`;
  }
  const n = int((await call(s, 'GET', '/tracks/count')).count);
  return `Connected to jukebox: ${n} song${n === 1 ? '' : 's'}`;
}

// ---- browse

export async function artists(s: Server): Promise<Entry[]> {
  const out: Entry[] = [];
  if (s.subsonic) {
    const idx: any[] = (await call(s, 'GET', 'getArtists.view')).artists.index;
    if (idx !== undefined && idx !== null) for (const i of idx) for (const a of i.artist as any[]) out.push(new Entry('artist', str(a.id), str(a.name), `${int(a.albumCount)} albums`));
    return out;
  }
  for (const a of (await call(s, 'GET', '/facets')).artists as any[]) out.push(new Entry('artist', str(a.value), str(a.value), `${int(a.count)} songs`));
  return out;
}

export async function albums(s: Server, artist: Entry): Promise<Entry[]> {
  const out: Entry[] = [];
  if (s.subsonic) {
    const list: any[] = (await call(s, 'GET', `getArtist.view?id=${encodeURIComponent(artist.id)}`)).artist.album;
    if (list !== undefined && list !== null) for (const a of list) out.push(new Entry('album', str(a.id), str(a.name), str(a.artist)));
    return out;
  }
  for (const a of (await call(s, 'GET', `/facets?artist=${encodeURIComponent(artist.id)}`)).albums as any[]) out.push(new Entry('album', str(a.value), str(a.value), artist.name));
  return out;
}

export async function playlists(s: Server): Promise<Entry[]> {
  const out: Entry[] = [];
  if (s.subsonic) {
    const list: any[] = (await call(s, 'GET', 'getPlaylists.view')).playlists.playlist;
    if (list !== undefined && list !== null) for (const p of list) out.push(new Entry('playlist', str(p.id), str(p.name), `${int(p.songCount)} songs`));
    return out;
  }
  for (const p of (await call(s, 'GET', '/playlists')).items as any[]) out.push(new Entry('playlist', str(p.id), str(p.name), `${int(p.trackCount)} songs`));
  return out;
}

function fromJukebox(t: any): Song {
  const x = new Song();
  x.id = str(t.id); x.title = str(t.name); x.artist = str(t.artist); x.albumArtist = str(t.albumArtist); x.album = str(t.album);
  x.genre = str(t.genre); x.composer = str(t.composer); x.comment = str(t.comments); x.grouping = str(t.grouping);
  x.trackNr = int(t.trackNumber); x.tracks = int(t.trackCount); x.cdNr = int(t.discNumber); x.year = int(t.year);
  x.rating = int(t.rating); x.bpm = int(t.bpm); x.compilation = t.compilation === true; x.durationS = num(t.duration);
  x.format = str(t.format).toLowerCase(); x.artwork = str(t.artwork);
  if (t.renditions !== undefined && t.renditions !== null) for (const r of t.renditions as any[]) {
    const y = new Rendition(); y.id = str(r.id); y.format = str(r.format).toLowerCase(); x.renditions.push(y);
  }
  return x;
}

function fromSubsonic(t: any): Song {
  const x = new Song();
  x.id = str(t.id); x.title = str(t.title); x.artist = str(t.artist); x.album = str(t.album); x.genre = str(t.genre);
  x.trackNr = int(t.track); x.cdNr = int(t.discNumber); x.year = int(t.year); x.rating = int(t.userRating);
  x.bpm = int(t.bpm); x.durationS = num(t.duration); x.format = str(t.suffix).toLowerCase(); x.artwork = str(t.coverArt);
  return x;
}

async function pages(s: Server, path: string): Promise<Song[]> {
  const out: Song[] = [];
  let cursor = '';
  for (;;) {
    const j = await call(s, 'GET', `${path}${path.indexOf('?') < 0 ? '?' : '&'}limit=500${cursor !== '' ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
    for (const t of j.items as any[]) out.push(fromJukebox(t));
    if (j.next === undefined || j.next === null || str(j.next) === '') return out;
    cursor = str(j.next);
  }
  return out;
}

function list(v: any): any[] { return v === undefined || v === null ? [] : v as any[]; }

/** The songs of an album, of a playlist (in its order) or of an artist. */
export async function songsOf(s: Server, e: Entry): Promise<Song[]> {
  const out: Song[] = [];
  if (s.subsonic) {
    if (e.kind === 'album') { for (const t of list((await call(s, 'GET', `getAlbum.view?id=${encodeURIComponent(e.id)}`)).album.song)) out.push(fromSubsonic(t)); }
    else if (e.kind === 'playlist') { for (const t of list((await call(s, 'GET', `getPlaylist.view?id=${encodeURIComponent(e.id)}`)).playlist.entry)) out.push(fromSubsonic(t)); }
    else for (const a of await albums(s, e)) for (const t of await songsOf(s, a)) out.push(t);
    return out;
  }
  if (e.kind === 'album') return await pages(s, `/tracks?sort=album&artist=${encodeURIComponent(e.sub)}&album=${encodeURIComponent(e.id)}`);
  if (e.kind === 'playlist') return await pages(s, `/playlists/${encodeURIComponent(e.id)}/tracks`);
  return await pages(s, `/tracks?artist=${encodeURIComponent(e.id)}`);
}

/** The songs that match `q` (title, artist, album), the first 200. */
export async function search(s: Server, q: string): Promise<Song[]> {
  const out: Song[] = [];
  if (q.trim() === '') return out;
  if (s.subsonic) {
    for (const t of list((await call(s, 'GET', `search3.view?query=${encodeURIComponent(q)}&songCount=200&albumCount=0&artistCount=0`)).searchResult3.song)) out.push(fromSubsonic(t));
    return out;
  }
  for (const t of (await call(s, 'GET', `/tracks?limit=200&q=${encodeURIComponent(q)}`)).items as any[]) out.push(fromJukebox(t));
  return out;
}

// ---- files

/** Where a song's file comes from: a URL, whether it answers Range, and the file's extension. */
export class Source { url: string = ''; resumable: boolean = true; ext: string = ''; }

function playable(format: string): boolean { return PLAYABLE.indexOf(format) >= 0; }
function extOf(format: string): string { return format === 'aac' || format === 'alac' ? '.m4a' : `.${format}`; }

function sourceOf(s: Server, x: Song): Source | null {
  const src = new Source();
  if (s.subsonic) {
    if (playable(x.format)) { src.url = urlOf(s, `download.view?id=${encodeURIComponent(x.id)}`); src.ext = `.${x.format}`; }
    else { src.url = urlOf(s, `stream.view?id=${encodeURIComponent(x.id)}&format=${TARGET}`); src.resumable = false; src.ext = extOf(TARGET); }
    return src;
  }
  const stream = `${s.url}/api/v1/stream/${encodeURIComponent(x.id)}`;
  if (playable(x.format)) { src.url = stream; src.ext = extOf(x.format); return src; }
  for (const r of x.renditions) if (playable(r.format)) { src.url = `${stream}?rendition=${encodeURIComponent(r.id)}`; src.ext = extOf(r.format); return src; }
  return null;
}

/** Waits for jukebox's job `id` to end; its state ('done', 'failed', 'cancelled'). */
async function waitJob(s: Server, id: string, note: (t: string) => void): Promise<string> {
  const until = Date.now() + JOB_WAIT_MS;
  let said = '';
  while (Date.now() < until) {
    const j = await call(s, 'GET', `/jobs/${encodeURIComponent(id)}`);
    const state = str(j.state);
    const line = `converting on jukebox: ${state} ${int(j.progress.done)}/${int(j.progress.total)}`;
    if (line !== said) { note(line); said = line; }
    if (state === 'done' || state === 'failed' || state === 'cancelled') { if (str(j.error) !== '') note(`jukebox: ${str(j.error)}`); return state; }
    await new Promise<void>((resolve: () => void) => { setTimeout(resolve, pollMs); });
  }
  return 'timeout';
}

/** The source of each song (by id): jukebox converts in one job the songs it holds in no iPod format, and keeps the result; a
 *  song still without one after it is converted while sent. */
export async function sources(s: Server, songs: Song[], note: (t: string) => void): Promise<Map<string, Source>> {
  const out = new Map<string, Source>();
  const convert: string[] = [];
  for (const x of songs) { const src = sourceOf(s, x); if (src !== null) out.set(x.id, src as Source); else convert.push(x.id); }
  if (convert.length > 0) {
    note(`${convert.length} song${convert.length === 1 ? '' : 's'} in no iPod format: asking jukebox for ${TARGET.toUpperCase()}`);
    try {
      const job = await call(s, 'POST', '/transcode', JSON.stringify({ ids: convert, format: TARGET, replace: false }));
      await waitJob(s, str(job.id), note);
      for (const id of convert) {
        const x = fromJukebox(await call(s, 'GET', `/tracks/${encodeURIComponent(id)}`));
        const src = sourceOf(s, x);
        if (src !== null) out.set(id, src as Source);
      }
    } catch (e) { note(`no stored conversion (${(e as Error).message}): converted while sent instead`); }
    for (const id of convert) if (!out.has(id)) {
      const src = new Source();
      src.url = `${s.url}/api/v1/stream/${encodeURIComponent(id)}?format=${TARGET}`; src.resumable = false; src.ext = extOf(TARGET);
      out.set(id, src);
    }
  }
  return out;
}

function sliceName(n: i32): string { let s = `${n}`; while (s.length < 5) s = `0${s}`; return s; }

/** The slices already in `dir`, in order. */
function slicesIn(dir: string): string[] {
  const out: string[] = [];
  if (!fs.exists(dir)) return out;
  for (const n of fs.list(dir)) if (n.length === 5) out.push(`${dir}/${n}`);
  return out;
}

/** Writes the slices of `dir` as `file`, then removes them. */
function assemble(dir: string, file: string): void {
  const parts = slicesIn(dir);
  if (parts.length === 1) fs.rename(parts[0], file);
  else {
    // ponytail: zinc:fs has no appendBytes (or a write at an offset): the slices are joined in memory, one song at a time
    const all: u8[] = [];
    for (const p of parts) { const b = fs.readBytes(p); for (let i = 0; i < b.length; i++) all.push(b[i]); }
    fs.writeBytes(`${dir}/whole`, all);
    fs.rename(`${dir}/whole`, file);
  }
  fs.remove(dir, true);
}

/** Fetches `src` to `file` (its folder made): in slices into <file>.part/ when the server answers Range, going on from the last
 *  slice of a download cut short; whole otherwise. `bytes(done, total)` after each slice. */
export async function fetchTo(s: Server, src: Source, file: string, bytes: (done: number, total: number) => void): Promise<void> {
  fs.mkdir(file.slice(0, file.lastIndexOf('/')), true);
  const dir = `${file}.part`;
  if (!src.resumable) {
    const r = await net.fetch(src.url, { headers: headers(s), timeoutMs: FILE_TIMEOUT_MS, maxBytes: FILE_MAX_BYTES });
    if (r.status !== 200) throw new Error(`${src.url.split('?')[0]} answered ${r.status}`);
    cache.writeWhole(file, await r.bytes());
    return;
  }
  fs.mkdir(dir, true);
  let have: number = 0;
  for (const p of slicesIn(dir)) have += fs.stat(p).size;
  let n = slicesIn(dir).length as i32;
  for (;;) {
    const h = headers(s);
    h.set('Range', `bytes=${have}-${have + SLICE - 1}`);
    const r = await net.fetch(src.url, { headers: h, timeoutMs: FILE_TIMEOUT_MS, maxBytes: FILE_MAX_BYTES });
    if (r.status === 416 && have > 0) break;   // every slice is there: only the joining was left
    if (r.status === 200) {   // the server sends the whole file whatever the Range: no resume
      const all = await r.bytes();
      fs.remove(dir, true);
      cache.writeWhole(file, all);
      bytes(all.length, all.length);
      return;
    }
    if (r.status !== 206) throw new Error(`${src.url.split('?')[0]} answered ${r.status}`);
    const b = await r.bytes();
    const range = r.headers.get('content-range');   // bytes a-b/total
    const total = parseFloat(range.slice(range.indexOf('/') + 1));
    cache.writeWhole(`${dir}/${sliceName(n)}`, b);
    n++;
    have += b.length;
    bytes(have, total);
    if (b.length === 0 || Number.isNaN(total) || have >= total) break;
  }
  assemble(dir, file);
}

// ---- add

/** What an add from jukebox did. */
export class Report {
  added: i32 = 0;
  /** Already on the iPod (same artist and title, length within 3 s): not copied again. */
  kept: i32 = 0;
  /** One line per song that could not be added. */
  failed: string[] = [];
  /** One line per song added or kept, for the job's detail. */
  lines: string[] = [];
  /** The playlist made on the iPod, '' when none. */
  playlist: string = '';
}

function sameSong(t: ipod.Track, x: Song): boolean {
  return t.title.toLowerCase() === x.title.toLowerCase() && t.artist.toLowerCase() === x.artist.toLowerCase() &&
    Math.abs(t.durationMs / 1000 - x.durationS) <= 3;
}

/** The tags jukebox has, for the iPod (those it has: an empty one leaves the file's). */
export function inputOf(x: Song, file: string, cover: string): ipod.TrackInput {
  const it: ipod.TrackInput = { file: file, title: x.title };
  if (x.artist !== '') it.artist = x.artist;
  if (x.albumArtist !== '') it.albumArtist = x.albumArtist;
  if (x.album !== '') it.album = x.album;
  if (x.genre !== '') it.genre = x.genre;
  if (x.composer !== '') it.composer = x.composer;
  if (x.comment !== '') it.comment = x.comment;
  if (x.grouping !== '') it.grouping = x.grouping;
  if (x.trackNr > 0) it.trackNr = x.trackNr;
  if (x.tracks > 0) it.tracks = x.tracks;
  if (x.cdNr > 0) it.cdNr = x.cdNr;
  if (x.year > 0) it.year = x.year;
  if (x.rating > 0) it.rating = Math.min(5, x.rating) as i32;
  if (x.bpm > 0) it.bpm = x.bpm;
  if (x.compilation) it.compilation = true;
  if (cover !== '') it.artworkFile = cover;
  return it;
}

/** The cover of `x` in the cache ('' when it has none or it could not be read). */
async function coverOf(s: Server, x: Song, dir: string): Promise<string> {
  if (x.artwork === '') return '';
  const name = s.subsonic ? `sub-${x.artwork.replace(/[^A-Za-z0-9._-]/g, '_')}` : x.artwork.slice(x.artwork.lastIndexOf('/') + 1);
  const file = `${dir}/${name}`;
  if (fs.exists(file)) return file;
  try {
    const url = s.subsonic ? urlOf(s, `getCoverArt.view?id=${encodeURIComponent(x.artwork)}`) : `${s.url}${x.artwork}`;
    const r = await net.fetch(url, { headers: headers(s), timeoutMs: TIMEOUT_MS });
    if (r.status !== 200 || r.headers.get('content-type').indexOf('image/') !== 0) return '';
    cache.writeWhole(file, await r.bytes());
    return file;
  } catch (e) { return ''; }
}

/** Adds `songs` to the open iPod (a remote one through its daemon) with jukebox's tags and covers: the songs already there are
 *  kept, the others fetched into the cache one by one, then copied in one add (one save). With `playlist`, a playlist of every song
 *  in this order, made once they are all on the iPod. `existing`: the iPod's tracks now. */
export async function addSongs(s: Server, songs: Song[], playlist: string, existing: ipod.Track[], note: (t: string) => void,
  progress: (done: i32, total: i32, detail: string) => void): Promise<Report> {
  const rep = new Report();
  const idOf = new Map<string, string>();   // jukebox id -> iPod id
  const todo: Song[] = [];
  for (const x of songs) {
    let found = '';
    for (const t of existing) if (sameSong(t, x)) { found = t.id; break; }
    if (found !== '') { idOf.set(x.id, found); rep.kept++; rep.lines.push(`${x.title} — ${x.artist}: already on the iPod`); }
    else todo.push(x);
  }
  const dir = cache.cacheDir('jukebox');
  const src = await sources(s, todo, note);
  const items: ipod.TrackInput[] = [];
  const itemSong: Song[] = [];
  for (let i = 0; i < todo.length; i++) {
    const x = todo[i];
    progress(i as i32, todo.length as i32, `${x.title} — ${x.artist}`);
    const from = src.get(x.id) as Source;
    const file = `${dir}/${x.id.replace(/[^A-Za-z0-9._-]/g, '_')}${from.ext}`;
    try {
      if (!fs.exists(file)) await fetchTo(s, from, file, (done: number, total: number) => { note(`fetch ${x.title}: ${Math.round(done / 1024)} of ${Math.round(total / 1024)} KB`); });
      items.push(inputOf(x, file, await coverOf(s, x, dir)));
      itemSong.push(x);
    } catch (e) { rep.failed.push(`${x.title} — ${x.artist}: ${(e as Error).message}`); }
  }
  progress(todo.length as i32, todo.length as i32, 'copying to the iPod');
  if (items.length > 0) {
    const res = await addTracks(items, '');
    for (let i = 0; i < res.length && i < itemSong.length; i++) {
      const x = itemSong[i];
      if (res[i].error !== '') { rep.failed.push(`${x.title} — ${x.artist}: ${res[i].error}`); continue; }
      idOf.set(x.id, res[i].id);
      rep.added++;
      rep.lines.push(`${x.title} — ${x.artist}${x.album !== '' ? ` · ${x.album}` : ''}`);
      fs.remove(items[i].file);   // on the iPod now; a song refused stays for the next try
    }
  }
  if (playlist.trim() !== '') {
    if (rep.failed.length > 0) note(`the playlist “${playlist}” is made once every song is on the iPod: add it again`);
    else {
      const ids: string[] = [];
      for (const x of songs) ids.push(idOf.get(x.id) as string);
      if (ids.length > 0) { await createPlaylistOf(playlist.trim(), ids); rep.playlist = playlist.trim(); }
    }
  }
  return rep;
}
