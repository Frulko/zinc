// Genius tier 2 (docs/reports/ipod-genius.md 0b, batch G): the client of AudioMuse-AI, the optional deep analysis that runs beside the
// app (its own process, AGPL: never linked) and reads the iPod through our Subsonic endpoint (services/share.ts, or the daemon's), so
// its track ids are ours: 'tr-' + the iPod's track id. No UI here: the app (src/deep.ts) and the iPod daemon call it the same way.
//   reach      GET /api/last_task (reachable, token accepted) and /api/sync?fields=index&limit=1 (how many songs it analysed)
//   analyse    POST /api/analysis/start, GET /api/status/<task> every few seconds ("Albums 120/1900"), POST /api/cancel/<task>
//   sync       GET /api/sync?include_embeddings=false, page by page (500 songs): tempo, key, energy, mood_vector (its genre scores),
//              other_features (danceable, aggressive, happy, party, relaxed, sad), kept per iPod in <dir>/deep.v1.json
//   near       GET /api/similar_tracks?item_id=&n= (the songs closest in sound, distance), kept in the same file per seed
//   path       GET /api/find_path?start_song_id=&end_song_id=&max_steps= (a smooth path from one song to another)
// Bearer token: AudioMuse's API_TOKEN. Ids it gives that are not on the iPod (another server's, or songs since deleted) are matched
// by artist, title and album; the rest are counted as unknown and dropped.
import * as net from 'zinc:net';
import * as fs from 'zinc:fs';
import * as ipod from 'zinc:ipod';
import { normArtist, normTitle } from './history';

export const DEFAULT_URL = 'http://127.0.0.1:8000';
const FORMAT: i32 = 1;
const FILE = 'deep.v1.json';
const PAGE: i32 = 500;
const TIMEOUT_MS: i32 = 30000;
/** The start of the message of an error that means AudioMuse did not answer at all (deepOffline() tells it apart). */
const OFFLINE = 'Deep analysis offline';

/** Where AudioMuse is and its API token. */
export class Muse {
  url: string = DEFAULT_URL;
  token: string = '';
  constructor(url: string, token: string) { this.url = url.trim() !== '' ? url.trim().replace(/\/+$/, '') : DEFAULT_URL; this.token = token.trim(); }
}

const NOT_FOUND = 'AudioMuse does not know this song';
/** True when `e` says AudioMuse does not know the song asked about (not analysed yet, or not in its index until the analysis ends). */
export function isNotFound(e: Error): boolean { return e.message.startsWith(NOT_FOUND); }

/** True when `e` says AudioMuse did not answer (not running, wrong address): its cached results are used meanwhile. */
export function isOffline(e: Error): boolean { return e.message.startsWith(OFFLINE); }

async function call(c: Muse, method: string, path: string, body: string = ''): Promise<any> {
  const h = new net.Headers();
  if (c.token !== '') h.set('Authorization', `Bearer ${c.token}`);
  const init: net.RequestInit = { method: method, headers: h, timeoutMs: TIMEOUT_MS };
  if (method === 'POST') { init.body = body !== '' ? body : '{}'; init.contentType = 'application/json'; }
  let r: net.Response;
  try { r = await net.fetch(c.url + path, init); }
  catch (e) { throw new Error(`${OFFLINE}: ${c.url} does not answer (${(e as Error).message})`); }
  const text = await r.text();
  if (r.status === 401 || r.status === 403) throw new Error(`AudioMuse refused the API token (${r.status}): copy API_TOKEN from its .env`);
  let j: any = null;
  try { j = JSON.parse(text); } catch (e) {
    // a route it lacks is Flask's HTML page; its own 404 (a song it has not analysed: "Track not found.") is JSON, below
    if (r.status === 404) throw new Error(`AudioMuse has no ${path.split('?')[0]} (404): it needs version 3.6 or later`);
    throw new Error(`${c.url}${path.split('?')[0]} answered ${r.status}, not JSON: is it AudioMuse-AI?`);
  }
  if (r.status === 404 && path.indexOf('/api/status/') < 0) throw new Error(`${NOT_FOUND}: ${j.error !== undefined ? '' + j.error : path.split('?')[0]}`);
  if (r.status >= 400) throw new Error(`AudioMuse: ${j.error !== undefined ? '' + j.error : `${path.split('?')[0]} answered ${r.status}`}`);
  return j;
}

function num(v: any): number { return v === undefined || v === null || typeof v !== 'number' ? 0 : v as number; }
function str(v: any): string { return v === undefined || v === null ? '' : '' + v; }

// ---- reach

export class Reach {
  /** How many songs it has analysed (all its servers' songs it can give to this one). */
  analysed: i32 = 0;
  /** Its last task: "main_analysis SUCCESS", '' when none. */
  lastTask: string = '';
}

/** Its last task (an analysis, a clustering...); id '' when it never ran one. */
export class LastTask { id: string = ''; type: string = ''; state: string = ''; }

export async function lastTask(c: Muse): Promise<LastTask> {
  const last = await call(c, 'GET', '/api/last_task');
  const t = new LastTask();
  if (last !== null && last.task_id !== undefined && last.task_id !== null) {
    t.id = str(last.task_id); t.type = str(last.task_type); t.state = str(last.status !== undefined ? last.status : last.state);
  }
  return t;
}

/** True when `t` is an analysis that ended well: its results can be synced. */
export function analysisDone(t: LastTask): boolean { return t.id !== '' && t.state === 'SUCCESS' && (t.type === '' || t.type.indexOf('analysis') >= 0); }

/** Test connection: throws when it does not answer or refuses the token. */
export async function reach(c: Muse): Promise<Reach> {
  const out = new Reach();
  const last = await lastTask(c);
  if (last.id !== '') out.lastTask = `${last.type} ${last.state}`.trim();
  const idx = await call(c, 'GET', '/api/sync?fields=index&limit=1');
  out.analysed = num(idx.total_tracks) as i32;
  return out;
}

// ---- analyse

export class TaskState {
  /** NEW, RUNNING, SUCCESS, FAIL (or FAILURE), REVOKED */
  state: string = '';
  progress: number = 0;
  /** "Albums 120/1900" */
  message: string = '';
}

export function finished(s: TaskState): boolean { return s.state !== 'NEW' && s.state !== 'RUNNING' && s.state !== 'PENDING' && s.state !== 'STARTED' && s.state !== 'PROGRESS'; }

/** Starts an analysis of the songs AudioMuse does not know yet; its task id. */
export async function startAnalysis(c: Muse): Promise<string> {
  const j = await call(c, 'POST', '/api/analysis/start', '{"num_recent_albums":0,"top_n_moods":5}');
  const id = str(j.task_id);
  if (id === '') throw new Error('AudioMuse started no analysis');
  return id;
}

export async function taskState(c: Muse, id: string): Promise<TaskState> {
  const j = await call(c, 'GET', `/api/status/${encodeURIComponent(id)}`);
  const s = new TaskState();
  s.state = str(j.state); s.progress = num(j.progress); s.message = str(j.status_message);
  return s;
}

export async function cancelTask(c: Muse, id: string): Promise<void> { await call(c, 'POST', `/api/cancel/${encodeURIComponent(id)}`); }

function sleep(ms: number): Promise<void> { return new Promise<void>((r: () => void) => { setTimeout(r, ms); }); }

/** Runs an analysis: started, then polled every `pollMs` (`progress` gets each state) until it ends; when `stopped()` turns true it
 *  is cancelled. The line its end shows. Throws when it failed. */
export async function analyse(c: Muse, progress: (s: TaskState) => void, stopped: () => boolean, pollMs: number = 3000): Promise<string> {
  const id = await startAnalysis(c);
  for (;;) {
    if (stopped()) { await cancelTask(c, id); return 'cancelled: AudioMuse stops after the album it analyses'; }
    const s = await taskState(c, id);
    progress(s);
    if (finished(s)) {
      if (s.state === 'SUCCESS') return s.message !== '' ? s.message : 'analysed';
      if (s.state === 'REVOKED') return 'cancelled';
      throw new Error(`AudioMuse: ${s.message !== '' ? s.message : s.state}`);
    }
    await sleep(pollMs);
  }
}

// ---- the cache

/** One song as AudioMuse analysed it (the iPod's track id). */
export interface DeepTrack {
  id: string; tempo: number; key: string; scale: string; energy: number;
  /** "rock:0.61,indie:0.32" (its genre scores) and "danceable:0.57,relaxed:0.20" (the moods). */
  moods: string; other: string;
}
/** The songs closest in sound to `id`, nearest first, and their distance (smaller: closer). */
export interface Near { id: string; at: number; ids: string[]; dist: number[]; }
/** A smooth path between two songs (find_path). */
export interface DeepPath { from: string; to: string; at: number; ids: string[]; }
export interface Deep {
  format: i32; guid: string; url: string;
  /** When it was synced (Unix seconds); 0 never. */
  syncedAt: number;
  /** Songs AudioMuse gave that are not on this iPod. */
  unknown: i32;
  /** The id of the analysis whose results these are ('' unknown): a later one is synced by itself (deep.ts). */
  task: string;
  tracks: DeepTrack[]; near: Near[]; paths: DeepPath[];
}

export function emptyDeep(guid: string, url: string): Deep { return { format: FORMAT, guid: guid, url: url, syncedAt: 0, unknown: 0, task: '', tracks: [], near: [], paths: [] }; }

/** The deep results kept in `<dir>/deep.v1.json` for the iPod `guid`, null when none (or another iPod's, or another format). */
export function readDeep(dir: string, guid: string): Deep | null {
  try {
    const f = `${dir}/${FILE}`;
    if (!fs.exists(f)) return null;
    const raw: any = JSON.parse(fs.readText(f));
    if (raw.task === undefined) raw.task = '';   // kept before the field
    const d: Deep = raw;
    return d.format === FORMAT && d.guid === guid ? d : null;
  } catch (e) { return null; }   // damaged: synced again
}

export function writeDeep(dir: string, d: Deep): void {
  fs.mkdir(dir, true);
  const f = `${dir}/${FILE}`;
  fs.writeText(`${f}.part`, JSON.stringify(d));
  fs.rename(`${f}.part`, f);
}

/** AudioMuse's ids -> the iPod's track ids: 'tr-<id>' when the iPod has it, else the same artist, title and album. */
export class IdMap {
  ids: Set<string> = new Set<string>();
  byName: Map<string, string> = new Map<string, string>();
  constructor(tracks: ipod.Track[]) {
    for (const t of tracks) { this.ids.add(t.id); this.byName.set(nameKey(t.artist, t.title, t.album), t.id); }
  }
  /** The iPod's id of a song AudioMuse gave, '' when none. */
  of(item: any): string {
    const raw = str(item.id !== undefined ? item.id : item.item_id);
    const id = raw.startsWith('tr-') ? raw.slice(3) : raw;
    if (this.ids.has(id)) return id;
    const k = this.byName.get(nameKey(str(item.artist !== undefined ? item.artist : item.author), str(item.title), str(item.album)));
    return k !== undefined ? k as string : '';
  }
}

function nameKey(artist: string, title: string, album: string): string { return `${normArtist(artist)}|${normTitle(title)}|${normTitle(album)}`; }

/** Reads every song AudioMuse analysed (page by page, `progress(done, total)`) into a new cache of `guid`, kept in `dir`, as the results
 *  of the analysis `task` ('' unknown). The near lists and paths of the old cache are kept for the songs whose analysis did not change. */
export async function sync(c: Muse, dir: string, guid: string, tracks: ipod.Track[], progress: (done: i32, total: i32) => void, task: string = ''): Promise<Deep> {
  const map = new IdMap(tracks);
  const d = emptyDeep(guid, c.url);
  d.task = task;
  const seen = new Set<string>();
  let page: i32 = 1, done: i32 = 0;
  for (;;) {
    const j = await call(c, 'GET', `/api/sync?include_embeddings=false&limit=${PAGE}&page=${page}`);
    const list = j.tracks !== undefined && j.tracks !== null ? j.tracks : [];
    const total = num(j.total_tracks) as i32;
    for (let i = 0; i < list.length; i++) {
      const x = list[i];
      done++;
      const id = map.of(x);
      if (id === '' || seen.has(id)) { if (id === '') d.unknown++; continue; }
      seen.add(id);
      d.tracks.push({ id: id, tempo: num(x.tempo), key: str(x.key), scale: str(x.scale), energy: num(x.energy), moods: str(x.mood_vector), other: str(x.other_features) });
    }
    progress(done, total);
    if (j.has_more !== true || list.length === 0) break;
    page++;
  }
  const old = readDeep(dir, guid);
  if (old !== null) {   // near lists stay while AudioMuse's view of the seed is the same
    for (const n of (old as Deep).near) if (seen.has(n.id)) d.near.push(n);
    for (const p of (old as Deep).paths) if (seen.has(p.from) && seen.has(p.to)) d.paths.push(p);
  }
  d.syncedAt = Math.floor(Date.now() / 1000);
  writeDeep(dir, d);
  return d;
}

// ---- near and paths

/** The cached near list of `id`, null when none. */
export function nearOf(d: Deep, id: string): Near | null { for (const n of d.near) if (n.id === id) return n; return null; }
export function pathOf(d: Deep, from: string, to: string): DeepPath | null { for (const p of d.paths) if (p.from === from && p.to === to) return p; return null; }

/** Asks AudioMuse the `n` songs closest in sound to each of `ids` not asked since the last sync, into `d` (kept in `dir`); the number
 *  asked. Throws when it does not answer (what was asked is kept). */
export async function fetchNear(c: Muse, dir: string, d: Deep, tracks: ipod.Track[], ids: string[], n: i32 = 50): Promise<i32> {
  const map = new IdMap(tracks);
  let asked: i32 = 0;
  try {
    for (const id of ids) {
      const old = nearOf(d, id);
      if (old !== null && (old as Near).at >= d.syncedAt) continue;
      let j: any = [];
      // a song it has not analysed (or not indexed yet, while an analysis runs): no near list until the next sync, the others go on
      try { j = await call(c, 'GET', `/api/similar_tracks?item_id=${encodeURIComponent('tr-' + id)}&n=${n}&eliminate_duplicates=true`); }
      catch (e) { if (!isNotFound(e as Error)) throw e; }
      const near: Near = { id: id, at: Math.floor(Date.now() / 1000), ids: [], dist: [] };
      const list = Array.isArray(j) ? j : [];
      for (let i = 0; i < list.length; i++) {
        const t = map.of(list[i]);
        if (t === '' || t === id || near.ids.indexOf(t) >= 0) continue;
        near.ids.push(t); near.dist.push(num(list[i].distance));
      }
      if (old !== null) d.near.splice(d.near.indexOf(old as Near), 1);
      d.near.push(near);
      asked++;
    }
  } finally { if (asked > 0) writeDeep(dir, d); }
  return asked;
}

/** A smooth path from `from` to `to` (both ends included) by AudioMuse's find_path, cached in `d`; [] when it found none. */
export async function fetchPath(c: Muse, dir: string, d: Deep, tracks: ipod.Track[], from: string, to: string, steps: i32 = 25): Promise<string[]> {
  const old = pathOf(d, from, to);
  if (old !== null && (old as DeepPath).at >= d.syncedAt) return (old as DeepPath).ids;
  const map = new IdMap(tracks);
  const j = await call(c, 'GET', `/api/find_path?start_song_id=${encodeURIComponent('tr-' + from)}&end_song_id=${encodeURIComponent('tr-' + to)}&max_steps=${steps}`);
  const p: DeepPath = { from: from, to: to, at: Math.floor(Date.now() / 1000), ids: [] };
  const list = j.path !== undefined && j.path !== null ? j.path : [];
  for (let i = 0; i < list.length; i++) { const t = map.of(list[i]); if (t !== '' && p.ids.indexOf(t) < 0) p.ids.push(t); }
  if (old !== null) d.paths.splice(d.paths.indexOf(old as DeepPath), 1);
  d.paths.push(p);
  writeDeep(dir, d);
  return p.ids;
}

// ---- the sound of a song, as numbers

/** "rock:0.61,indie:0.32" -> labels and values. */
export function scores(text: string, names: string[], values: number[]): void {
  for (const part of text.split(',')) {
    const at = part.lastIndexOf(':');
    if (at <= 0) continue;
    const v = Number(part.slice(at + 1));
    if (isNaN(v)) continue;
    names.push(part.slice(0, at).trim().toLowerCase()); values.push(v);
  }
}

/** The moods of a song (other_features), by name. */
export function moodsOf(t: DeepTrack): Map<string, number> {
  const names: string[] = [], values: number[] = [];
  scores(t.other, names, values);
  const out = new Map<string, number>();
  for (let i = 0; i < names.length; i++) out.set(names[i], values[i]);
  return out;
}

/** Each song's sound as one vector (its genre scores, its moods, energy, tempo), standardised over the library (each dimension minus
 *  its mean, over its spread) so that the cosine of two vectors tells songs apart; by track id. */
export function soundVectors(d: Deep): Map<string, number[]> {
  const dims = new Map<string, i32>();
  const rows: Map<i32, number>[] = [];
  const dim = (name: string): i32 => { const k = dims.get(name); if (k !== undefined) return k as i32; const n = dims.size as i32; dims.set(name, n); return n; };
  for (const t of d.tracks) {
    const row = new Map<i32, number>();
    const names: string[] = [], values: number[] = [];
    scores(t.moods, names, values);
    for (let i = 0; i < names.length; i++) row.set(dim(`g:${names[i]}`), values[i]);
    const mn: string[] = [], mv: number[] = [];
    scores(t.other, mn, mv);
    for (let i = 0; i < mn.length; i++) row.set(dim(`m:${mn[i]}`), mv[i]);
    if (t.energy > 0) row.set(dim('energy'), t.energy);
    if (t.tempo > 0) row.set(dim('tempo'), Math.log2(t.tempo));
    rows.push(row);
  }
  const n = dims.size as i32, count = d.tracks.length;
  const mean: number[] = [], sd: number[] = [];
  for (let k = 0; k < n; k++) { mean.push(0); sd.push(0); }
  for (const row of rows) row.forEach((v: number, k: i32) => { mean[k] += v; });
  for (let k = 0; k < n; k++) mean[k] /= Math.max(1, count);   // a song without a label scores 0 on it
  for (const row of rows) for (let k: i32 = 0; k < n; k++) { const v = row.has(k) ? row.get(k) as number : 0; sd[k] += (v - mean[k]) * (v - mean[k]); }
  for (let k = 0; k < n; k++) sd[k] = Math.sqrt(sd[k] / Math.max(1, count));
  const out = new Map<string, number[]>();
  for (let i = 0; i < count; i++) {
    const v: number[] = [];
    let len = 0;
    for (let k: i32 = 0; k < n; k++) {
      const x = sd[k] > 1e-9 ? ((rows[i].has(k) ? rows[i].get(k) as number : 0) - mean[k]) / sd[k] : 0;
      v.push(x); len += x * x;
    }
    len = Math.sqrt(len);
    if (len > 0) for (let k = 0; k < n; k++) v[k] /= len;
    out.set(d.tracks[i].id, v);
  }
  return out;
}
