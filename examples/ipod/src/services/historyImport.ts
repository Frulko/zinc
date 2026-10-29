// Importing the listening history into services/history.ts: Last.fm (user.getRecentTracks, getLovedTracks, getTopTracks/Artists),
// ListenBrainz (its API, or the export zip from listenbrainz.org/settings/export). Only public data: Last.fm needs the API key and the
// user's name, ListenBrainz the name (or the file). No UI here; the caller gives an ImportRun to follow and stop it.
//
// Last.fm: recent tracks newest first, 200 a page, always the first page below a moving bound `to` (the oldest listen seen, plus one
// second: whether Last.fm counts `to` in or out, nothing is missed and the overlap is ignored); `to` is fixed at the start, so a
// scrobble made during the import does not shift the pages. The bound and the pages done are kept after each page (in the same
// transaction as the page's listens): an import stopped, cut or failed resumes where it was. Once complete, the next import asks only
// what came since (`from`). At most one request every PACE_MS (Last.fm asks for 5 a second at most); error 29 (rate limit), 8, 11, 16
// and HTTP 429/5xx wait 2^n times longer and try again, 6 times in all.
// ListenBrainz: /1/user/<name>/listens?count=1000&max_ts=..., the same way down; its X-RateLimit-Remaining/Reset-In headers are obeyed.
// A Last.fm import that still fails after those tries (the network, its rate limit, a 5xx) is tried again by itself, from where it
// was, after 2, 5 and 15 minutes (importLastfmRetrying), then given up; a refusal (a bad key, an unknown user) is not tried again.
// IPOD_HISTORY_PACE_MS replaces the pace (the tests use 1), IPOD_HISTORY_RETRY_MS the waits ("50,50").
import * as net from 'zinc:net';
import * as sys from 'zinc:sys';
import * as fs from 'zinc:fs';
import * as proc from 'zinc:process';
import { History, Listen, Ranked } from './history';
import { LASTFM_URL, LISTENBRAINZ_URL } from './scrobble';

const PACE_MS: number = sys.env('IPOD_HISTORY_PACE_MS') !== '' ? Number(sys.env('IPOD_HISTORY_PACE_MS')) : 250;
const TRIES: i32 = 6;
const TIMEOUT_MS: i32 = 30000;
const LASTFM_PAGE: i32 = 200;
const LB_PAGE: i32 = 1000;
const PERIODS: string[] = ['overall', '12month', '6month', '3month', '1month', '7day'];
const RETRY_MS: number[] = sys.env('IPOD_HISTORY_RETRY_MS') !== '' ? sys.env('IPOD_HISTORY_RETRY_MS').split(',').map((x: string): number => Number(x))
  : [2 * 60000, 5 * 60000, 15 * 60000];
const TRIED = ` (tried ${TRIES} times)`;

/** One import: `stopped` asks it to stop after the page it reads (it resumes later); `progress` hears the pages done and expected. */
export class ImportRun {
  stopped: boolean = false;
  progress: (done: i32, total: i32, added: i32) => void = (done: i32, total: i32, added: i32) => {};
  /** A line for the job's steps (a page, a retry, what came in). */
  note: (line: string) => void = (line: string) => {};
}

let say: (line: string) => void = (line: string) => {};   // the steps of the import running (one at a time)
function day(ts: number): string { return new Date(ts * 1000).toISOString().substring(0, 10); }

function sleep(ms: number): Promise<void> { return new Promise<void>((r: () => void) => { setTimeout(r, ms); }); }

let lastCall: number = 0;

class Reply { status: i32 = 0; body: string = ''; error: string = ''; remaining: string = ''; resetIn: string = ''; }

async function get(url: string): Promise<Reply> {
  const wait = lastCall + PACE_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastCall = Date.now();
  const r = new Reply();
  try {
    const res = await net.fetch(url, { timeoutMs: TIMEOUT_MS });
    r.status = res.status;
    r.body = await res.text();
    r.remaining = res.headers.get('X-RateLimit-Remaining');
    r.resetIn = res.headers.get('X-RateLimit-Reset-In');
  } catch (e) { r.error = (e as Error).message; }
  return r;
}

function backoff(attempt: i32): number { return PACE_MS * 8 * Math.pow(2, attempt) * (1 + Math.random() * 0.25); }

function s(v: any): string { return v === undefined || v === null ? '' : '' + v; }
function asList(v: any): any { return v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]; }   // one item comes as an object

// ---- Last.fm

/** A Last.fm GET (api_key and format added): the reply's JSON. Throws with Last.fm's message on an error that will not pass. */
export async function lastfm(params: string, key: string): Promise<any> {
  let why = '';
  for (let attempt: i32 = 0; attempt < TRIES; attempt++) {
    const r = await get(`${LASTFM_URL}?${params}&api_key=${encodeURIComponent(key)}&format=json`);
    let code: i32 = 0, message = '';
    let j: any = null;
    if (r.error === '') {
      try {
        j = JSON.parse(r.body);
        if (j.error !== undefined) { code = Number(j.error) as i32; message = s(j.message); }
      } catch (e) { code = -1; message = `HTTP ${r.status}`; }
    }
    if (r.error === '' && code === 0 && r.status < 400) return j;
    why = r.error !== '' ? `cannot be reached (${r.error})` : message !== '' ? message : `HTTP ${r.status}`;
    const passes = r.error !== '' || code === 29 || code === 8 || code === 11 || code === 16 || r.status === 429 || r.status >= 500;
    if (!passes) throw new Error(`Last.fm: ${why}`);
    const ms = backoff(attempt);
    say(`Last.fm: ${why}: trying again in ${Math.round(ms / 100) / 10} s (${attempt + 1}/${TRIES})`);
    await sleep(ms);
  }
  throw new Error(`Last.fm: ${why}${TRIED}`);
}

/** True when `e` is a Last.fm failure that passes (the network, its rate limit, a 5xx) still there after lastfm()'s own tries. */
export function passes(e: Error): boolean { return e.message.startsWith('Last.fm: ') && e.message.endsWith(TRIED); }

function wait(ms: number): string { return ms >= 60000 ? `${Math.round(ms / 60000)} min` : `${Math.round(ms / 100) / 10} s`; }

/** importLastfm, tried again by itself when it fails for a reason that passes: after each of `waits` (ms; 2, 5 and 15 minutes), from
 *  where it was, then given up with the reason. A refusal is thrown at once; `run.stopped` ends a wait. */
export async function importLastfmRetrying(h: History, key: string, user: string, run: ImportRun, waits: number[] = RETRY_MS): Promise<string> {
  for (let i = 0; ; i++) {
    try { return await importLastfm(h, key, user, run); } catch (e) {
      const err = e as Error;
      if (!passes(err)) throw err;
      if (i >= waits.length) throw new Error(`${err.message}; given up after ${waits.length} more tries: Resume goes on from there`);
      run.note(`${err.message}: trying again in ${wait(waits[i])}, from where it was (${i + 1}/${waits.length})`);
      const until = Date.now() + waits[i];
      while (!run.stopped && Date.now() < until) await sleep(Math.min(1000, until - Date.now()));
      if (run.stopped) return 'Stopped before trying again: Resume goes on from there';
    }
  }
}

function q(name: string, v: string): string { return `${name}=${encodeURIComponent(v)}`; }

/** The loved tracks and the top lists of every period (a first look before the history is in). */
async function lastfmExtras(h: History, key: string, user: string): Promise<void> {
  for (let page = 1; ; page++) {
    const j = await lastfm(`method=user.getlovedtracks&${q('user', user)}&limit=1000&page=${page}`, key);
    const lt = j.lovedtracks;
    if (lt === undefined) break;
    const list = asList(lt.track);
    h.db.transaction(() => {
      for (let i = 0; i < list.length; i++) {
        const t = list[i];
        h.love(s(t.artist.name), s(t.name), s(t.mbid), t.date !== undefined ? Number(t.date.uts) : 0, 'lastfm');
      }
    });
    say(`loved tracks: page ${page}, ${list.length} songs`);
    if (lt['@attr'] === undefined || page >= Number(lt['@attr'].totalPages)) break;
  }
  for (const kind of ['tracks', 'artists']) {
    for (const period of PERIODS) {
      const j = await lastfm(`method=user.gettop${kind}&${q('user', user)}&period=${period}&limit=200`, key);
      const box = kind === 'tracks' ? j.toptracks : j.topartists;
      if (box === undefined) continue;
      const list = asList(kind === 'tracks' ? box.track : box.artist);
      const rows: Ranked[] = [];
      for (let i = 0; i < list.length; i++) {
        const t = list[i];
        const r = new Ranked();
        if (kind === 'tracks') { r.artist = s(t.artist.name); r.title = s(t.name); } else r.artist = s(t.name);
        r.plays = Number(t.playcount) as i32;
        rows.push(r);
      }
      h.setTop('lastfm', kind, period, rows);
    }
    say(`top ${kind} of every period: ${PERIODS.join(', ')}`);
  }
}

/** Imports `user`'s Last.fm history (resuming an import left unfinished). Resolves with the result line. */
export async function importLastfm(h: History, key: string, user: string, run: ImportRun): Promise<string> {
  say = run.note;
  try { return await importLastfmRun(h, key, user, run); } finally { say = (line: string) => {}; }   // other Last.fm reads (Genius) note nothing
}

async function importLastfmRun(h: History, key: string, user: string, run: ImportRun): Promise<string> {
  if (key === '') throw new Error('Last.fm: paste the API key first (last.fm/api/account/create)');
  if (user === '') throw new Error('Last.fm: the user name is missing');
  if (h.get('lastfm.user') !== user) {   // another account: its own history from the start
    h.db.transaction(() => { for (const k of ['running', 'to', 'runTo', 'pages', 'newest']) h.set(`lastfm.${k}`, ''); h.set('lastfm.user', user); });
  }
  const newestBefore = h.getNumber('lastfm.newest');
  if (h.get('lastfm.running') === '1') say(`resuming from page ${h.get('lastfm.pages')}, listens before ${day(h.getNumber('lastfm.to'))}`);
  else say(newestBefore > 0 ? `${user}: the listens since ${day(newestBefore)}` : `${user}: the whole history`);
  if (h.get('lastfm.running') !== '1') {
    const now = `${Math.floor(Date.now() / 1000)}`;
    h.db.transaction(() => { h.set('lastfm.running', '1'); h.set('lastfm.to', now); h.set('lastfm.runTo', now); h.set('lastfm.pages', '0'); });
  }
  await lastfmExtras(h, key, user);
  const newest = h.getNumber('lastfm.newest');
  let added: i32 = 0;
  let pages = h.getNumber('lastfm.pages') as i32;
  let total: i32 = pages + 1;
  for (;;) {
    if (run.stopped) return `Stopped at page ${pages} of ${total}: Resume goes on from there (${added} new listens)`;
    const to = h.getNumber('lastfm.to');
    const j = await lastfm(`method=user.getrecenttracks&${q('user', user)}&limit=${LASTFM_PAGE}&page=1&extended=1` +
      `${newest > 0 ? `&from=${newest - 1}` : ''}&to=${to}`, key);
    const rt = j.recenttracks;
    if (rt === undefined) throw new Error('Last.fm: an unexpected reply (no recenttracks)');
    const list = asList(rt.track);
    const left = rt['@attr'] !== undefined ? Number(rt['@attr'].totalPages) as i32 : 1;
    let oldest = to;
    let dated: i32 = 0;
    h.db.transaction(() => {
      for (let i = 0; i < list.length; i++) {
        const t = list[i];
        if (t.date === undefined) continue;   // now playing
        const l = new Listen();
        l.ts = Number(t.date.uts);
        const a = t.artist;
        l.artist = a.name !== undefined ? s(a.name) : s(a['#text']);
        l.artistMbid = s(a.mbid);
        l.title = s(t.name); l.trackMbid = s(t.mbid);
        if (t.album !== undefined) { l.album = s(t.album['#text']); l.albumMbid = s(t.album.mbid); }
        l.source = 'lastfm';
        if (h.add(l)) added++;
        if (t.loved === '1') h.love(l.artist, l.title, l.trackMbid, l.ts, 'lastfm');
        if (l.ts < oldest) oldest = l.ts;
        dated++;
      }
      pages++;
      total = pages + Math.max(0, left - 1);
      let next = oldest + 1;   // `to` in or out: the oldest second is asked again, never missed
      if (next >= to) next = oldest < to ? oldest : to - 1;
      h.set('lastfm.to', `${next}`);
      h.set('lastfm.pages', `${pages}`);
      if (dated === 0 || left <= 1) { h.set('lastfm.running', ''); h.set('lastfm.newest', h.get('lastfm.runTo')); }
    });
    run.progress(pages, total, added);
    say(`page ${pages}/${total}: ${dated} listens${dated > 0 ? ` back to ${day(oldest)}` : ''}`);
    if (dated === 0 || left <= 1) return `${added} new listen${added === 1 ? '' : 's'} (${pages} page${pages === 1 ? '' : 's'})`;
  }
}

/** True while a Last.fm import was left unfinished (the button says Resume). */
export function lastfmUnfinished(h: History): boolean { return h.get('lastfm.running') === '1'; }

// ---- ListenBrainz

/** A ListenBrainz listen (API or export) as a Listen, null when it lacks a time or names. */
export function lbListen(x: any): Listen | null {
  const m = x.track_metadata;
  if (m === undefined || m === null || x.listened_at === undefined) return null;
  const l = new Listen();
  l.ts = typeof x.listened_at === 'number' ? Number(x.listened_at) : Math.floor(Date.parse(s(x.listened_at)) / 1000);
  l.artist = s(m.artist_name); l.title = s(m.track_name); l.album = s(m.release_name);
  const ai = m.additional_info;
  if (ai !== undefined && ai !== null) {
    l.trackMbid = s(ai.recording_mbid); l.albumMbid = s(ai.release_mbid);
    if (Array.isArray(ai.artist_mbids) && ai.artist_mbids.length > 0) l.artistMbid = s(ai.artist_mbids[0]);
    if (ai.duration_ms !== undefined) l.durationMs = Number(ai.duration_ms);
    else if (ai.duration !== undefined) l.durationMs = Number(ai.duration) * 1000;
  }
  const mm = m.mbid_mapping;
  if (l.trackMbid === '' && mm !== undefined && mm !== null) l.trackMbid = s(mm.recording_mbid);
  l.source = 'listenbrainz';
  return l.artist !== '' && l.title !== '' && l.ts > 0 ? l : null;
}

async function listenbrainz(path: string): Promise<any> {
  let why = '';
  for (let attempt: i32 = 0; attempt < TRIES; attempt++) {
    const r = await get(`${LISTENBRAINZ_URL}${path}`);
    if (r.error === '' && r.status === 200) {
      if (r.remaining === '0' && r.resetIn !== '') await sleep(Number(r.resetIn) * 1000);
      return JSON.parse(r.body);
    }
    why = r.error !== '' ? `cannot be reached (${r.error})` : `HTTP ${r.status}: ${r.body.trim().slice(0, 200)}`;
    if (r.error === '' && r.status !== 429 && r.status < 500) throw new Error(`ListenBrainz: ${why}`);
    await sleep(r.status === 429 && r.resetIn !== '' ? Number(r.resetIn) * 1000 : backoff(attempt));
  }
  throw new Error(`ListenBrainz: ${why} (tried ${TRIES} times)`);
}

/** Imports `user`'s ListenBrainz listens (resuming an import left unfinished). */
export async function importListenbrainz(h: History, user: string, run: ImportRun): Promise<string> {
  if (user === '') throw new Error('ListenBrainz: the user name is missing');
  const u = encodeURIComponent(user);
  if (h.get('lb.user') !== user) {
    h.db.transaction(() => { for (const k of ['running', 'maxTs', 'runTo', 'pages', 'newest']) h.set(`lb.${k}`, ''); h.set('lb.user', user); });
  }
  if (h.get('lb.running') !== '1') {
    const now = `${Math.floor(Date.now() / 1000) + 1}`;
    h.db.transaction(() => { h.set('lb.running', '1'); h.set('lb.maxTs', now); h.set('lb.runTo', now); h.set('lb.pages', '0'); });
  }
  const newest = h.getNumber('lb.newest');
  let pages = h.getNumber('lb.pages') as i32;
  let total: i32 = pages + 1;
  if (newest === 0) {
    const c = await listenbrainz(`/1/user/${u}/listen-count`);
    if (c.payload !== undefined) total = Math.max(total, Math.ceil(Number(c.payload.count) / LB_PAGE) as i32);
  }
  let added: i32 = 0;
  for (;;) {
    if (run.stopped) return `Stopped at page ${pages} of ${total}: Resume goes on from there (${added} new listens)`;
    const maxTs = h.getNumber('lb.maxTs');
    const j = await listenbrainz(`/1/user/${u}/listens?count=${LB_PAGE}&max_ts=${maxTs}`);
    const list: any = j.payload !== undefined ? asList(j.payload.listens) : [];
    let oldest = maxTs, seen: i32 = 0, older = false;
    h.db.transaction(() => {
      for (let i = 0; i < list.length; i++) {
        const l = lbListen(list[i]);
        if (l === null) continue;
        const listen = l as Listen;
        if (listen.ts <= newest) { older = true; continue; }   // imported by a run before
        if (h.add(listen)) added++;
        if (listen.ts < oldest) oldest = listen.ts;
        seen++;
      }
      pages++;
      if (pages >= total) total = pages + 1;
      const done = seen === 0 || older || list.length < LB_PAGE;
      h.set('lb.maxTs', `${oldest}`);   // max_ts is exclusive
      h.set('lb.pages', `${pages}`);
      if (done) { h.set('lb.running', ''); h.set('lb.newest', h.get('lb.runTo')); }
    });
    if (h.get('lb.running') !== '1') { run.progress(pages, pages, added); return `${added} new listen${added === 1 ? '' : 's'} (${pages} page${pages === 1 ? '' : 's'})`; }
    run.progress(pages, total, added);
  }
}

export function listenbrainzUnfinished(h: History): boolean { return h.get('lb.running') === '1'; }

/** Imports a ListenBrainz export: the zip of listenbrainz.org/settings/export (listens/<year>/<month>.jsonl, feedback.jsonl for the
 *  loved songs), or a JSON file of listens (the older export). Read with the system's unzip. */
export async function importListenbrainzFile(h: History, file: string, run: ImportRun): Promise<string> {
  const texts: string[] = [];
  const names: string[] = [];
  if (file.toLowerCase().endsWith('.zip')) {
    // ponytail: the system's unzip (as `zinc` itself uses for APKs): macOS and Linux have it; a Windows build needs another reader
    const ls = await proc.run('unzip', ['-Z1', file], {});
    if (ls.code !== 0) throw new Error(`Not a zip that can be read: ${ls.stderr.trim() !== '' ? ls.stderr.trim() : `unzip ended with ${ls.code}`}`);
    let fb = '';   // the loved songs name only their MBID: read once the listens are in
    for (const line of ls.stdout.split('\n')) {
      const n = line.trim();
      if (n.endsWith('feedback.jsonl')) fb = n;
      else if (n.endsWith('.jsonl') || (n.endsWith('.json') && !n.endsWith('user.json'))) names.push(n);
    }
    if (fb !== '') names.push(fb);
  } else names.push('');
  let added: i32 = 0, done: i32 = 0;
  for (const n of names) {
    if (run.stopped) return `Stopped after ${done} of ${names.length} files (${added} new listens); importing the file again goes on`;
    let text = '';
    if (n === '') text = fs.readText(file);
    else {
      const r = await proc.run('unzip', ['-p', file, n], {});
      if (r.code !== 0) throw new Error(`${n}: unzip ended with ${r.code}`);
      text = r.stdout;
    }
    const feedback = n.endsWith('feedback.jsonl');
    const items: any[] = [];
    const t = text.trim();
    if (t.startsWith('[')) { const arr = JSON.parse(t); for (let i = 0; i < arr.length; i++) items.push(arr[i]); }
    else for (const line of t.split('\n')) if (line.trim() !== '') { try { items.push(JSON.parse(line)); } catch (e) { /* a damaged line */ } }
    h.db.transaction(() => {
      for (const x of items) {
        if (feedback) {
          if (Number(x.score) === 1) h.love('', '', s(x.recording_mbid), x.created !== undefined ? Number(x.created) : 0, 'listenbrainz');
          continue;
        }
        const l = lbListen(x);
        if (l !== null && h.add(l as Listen)) added++;
      }
    });
    done++;
    run.progress(done, names.length, added);
  }
  return `${added} new listen${added === 1 ? '' : 's'} from ${file.slice(file.lastIndexOf('/') + 1)}`;
}
