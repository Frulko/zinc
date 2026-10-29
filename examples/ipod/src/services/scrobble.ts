// Scrobbling: the listens of the app (and of the iPod daemon, examples/ipod-web, which imports this file) sent to Last.fm and
// ListenBrainz. No UI here, no app state: the caller gives the accounts and a folder for the queues.
//
// A listen counts as Last.fm counts it: the track lasts more than 30 s and was heard for half its length or 4 minutes, whichever
// comes first. A listen has an id the caller keeps for one playing of a track: a track paused, left and taken up again (the app
// restarted on it) adds to the same listen, and it counts once. Counted listens go to an offline queue per service on disk
// (<dir>/lastfm.json, <dir>/listenbrainz.json), sent by batches of 50 and kept when the service cannot be reached, or refuses
// the account, until a later flush() sends them. A service is off until its credentials are given.
//
// Last.fm: API 2.0, every call signed (md5 of the parameters sorted by name, then the secret: zinc:subtle's MD5). The session key
// comes once from the browser: lastfmToken(), the user approves lastfmAuthUrl() in the browser, lastfmSession() gives it.
// ListenBrainz: POST /1/submit-listens with the user token, "single" or "import" for the listens, "playing_now" for now playing.
// IPOD_LASTFM_URL and IPOD_LISTENBRAINZ_URL replace the services' addresses (the tests point them at a local stub).
import * as net from 'zinc:net';
import * as fs from 'zinc:fs';
import * as sys from 'zinc:sys';
import { subtle } from 'zinc:subtle';
import { toHex } from 'zinc:web';

export const LASTFM_URL = sys.env('IPOD_LASTFM_URL') !== '' ? sys.env('IPOD_LASTFM_URL') : 'https://ws.audioscrobbler.com/2.0/';
const LASTFM_AUTH_URL = 'https://www.last.fm/api/auth/';
export const LISTENBRAINZ_URL = sys.env('IPOD_LISTENBRAINZ_URL') !== '' ? sys.env('IPOD_LISTENBRAINZ_URL') : 'https://api.listenbrainz.org';
const CLIENT = 'Zinc iPod';
const BATCH: i32 = 50;                  // Last.fm takes at most 50 scrobbles a request
const MIN_TRACK_MS: number = 30000;     // shorter tracks never count
const ENOUGH_MS: number = 240000;       // 4 minutes heard is enough, whatever the length
const OPEN_KEEP_MS: number = 86400000;  // a listen not taken up again within a day is forgotten
const TIMEOUT_MS: i32 = 15000;

/** A track as the services want it. `at`: when it started (Unix seconds). */
export interface Scrobble { artist: string; track: string; album: string; albumArtist: string; durationS: i32; at: number; }

/** The credentials; a service with an empty one is off. */
export class Accounts {
  lastfmKey: string = '';
  lastfmSecret: string = '';
  lastfmSession: string = '';
  listenbrainzToken: string = '';
}

/** True when a track of `durationMs` heard for `heardMs` counts as a listen. */
export function counts(durationMs: number, heardMs: number): boolean {
  return durationMs > MIN_TRACK_MS && (heardMs >= durationMs / 2 || heardMs >= ENOUGH_MS);
}

interface OpenListen { id: string; heardMs: number; counted: boolean; touched: number; }
interface OpenFile { listens: OpenListen[]; }
interface QueueFile { items: Scrobble[]; }
interface LastfmError { error?: i32; message?: string; }
interface LastfmSessionReply { session?: LastfmSessionInfo; error?: i32; message?: string; }
interface LastfmSessionInfo { name: string; key: string; }
interface LastfmTokenReply { token?: string; error?: i32; message?: string; }

function lastfmOn(a: Accounts): boolean { return a.lastfmKey !== '' && a.lastfmSecret !== '' && a.lastfmSession !== ''; }
function listenbrainzOn(a: Accounts): boolean { return a.listenbrainzToken !== ''; }

// ---- Last.fm calls

async function md5(s: string): Promise<string> { return toHex(await subtle.digest('MD5', sys.utf8Encode(s))); }

/** The body of a signed Last.fm call: the parameters, api_sig (md5 of the names and values sorted by name, then the secret) and
 *  format=json (which the signature leaves out). */
export async function signedBody(params: Map<string, string>, secret: string): Promise<string> {
  const names: string[] = [];
  params.forEach((v: string, k: string) => { names.push(k); });
  names.sort();
  let base = '';
  const parts: string[] = [];
  for (const k of names) {
    const v = params.get(k) as string;
    base += k + v;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
  }
  parts.push(`api_sig=${await md5(base + secret)}`);
  parts.push('format=json');
  return parts.join('&');
}

class CallResult { status: i32 = 0; body: string = ''; error: string = ''; }

async function post(url: string, body: string, contentType: string, auth: string): Promise<CallResult> {
  const r = new CallResult();
  const h = new net.Headers();
  if (auth !== '') h.set('Authorization', auth);
  try {
    const res = await net.fetch(url, { method: 'POST', headers: h, body: body, contentType: contentType, timeoutMs: TIMEOUT_MS });
    r.status = res.status;
    r.body = await res.text();
  } catch (e) { r.error = (e as Error).message; }
  return r;
}

async function lastfmCall(params: Map<string, string>, secret: string): Promise<CallResult> {
  return await post(LASTFM_URL, await signedBody(params, secret), 'application/x-www-form-urlencoded', '');
}

/** Last.fm's error code in a reply, 0 when none. */
function lastfmCode(r: CallResult): i32 {
  try { const e: LastfmError = JSON.parse(r.body); return e.error !== undefined ? e.error as i32 : 0; } catch (e) { return r.status >= 400 ? -1 : 0; }
}
function lastfmMessage(r: CallResult): string {
  try { const e: LastfmError = JSON.parse(r.body); if (e.message !== undefined) return e.message as string; } catch (e) { /* not JSON */ }
  return `HTTP ${r.status}`;
}

/** Step 1 of the Last.fm sign-in: a token for the user to approve in the browser (lastfmAuthUrl). */
export async function lastfmToken(key: string, secret: string): Promise<string> {
  const p = new Map<string, string>();
  p.set('method', 'auth.getToken'); p.set('api_key', key);
  const r = await lastfmCall(p, secret);
  if (r.error !== '') throw new Error(`Last.fm cannot be reached (${r.error})`);
  const t: LastfmTokenReply = JSON.parse(r.body);
  if (t.token === undefined) throw new Error(`Last.fm: ${lastfmMessage(r)}`);
  return t.token as string;
}

/** The web flow's approval page: once approved, Last.fm sends the browser to `cb` with `?token=` (approved: lastfmSession takes it). */
export function lastfmWebAuthUrl(key: string, cb: string): string { return `${LASTFM_AUTH_URL}?api_key=${encodeURIComponent(key)}&cb=${encodeURIComponent(cb)}`; }

/** Step 2: the page where the user approves the token. */
export function lastfmAuthUrl(key: string, token: string): string { return `${LASTFM_AUTH_URL}?api_key=${encodeURIComponent(key)}&token=${encodeURIComponent(token)}`; }

/** Step 3, once approved: the session key and the user's name. Throws until the token is approved. */
export async function lastfmSession(key: string, secret: string, token: string): Promise<LastfmSessionInfo> {
  const s = await lastfmSessionIfApproved(key, secret, token);
  if (s === null) throw new Error('Last.fm: the browser approval is not done yet (press "Yes, allow access" on last.fm)');
  return s;
}

/** Step 3 asked again and again while the user approves: null while the token waits for the approval (Last.fm error 14). */
export async function lastfmSessionIfApproved(key: string, secret: string, token: string): Promise<LastfmSessionInfo | null> {
  const p = new Map<string, string>();
  p.set('method', 'auth.getSession'); p.set('api_key', key); p.set('token', token);
  const r = await lastfmCall(p, secret);
  if (r.error !== '') throw new Error(`Last.fm cannot be reached (${r.error})`);
  if (lastfmCode(r) === 14) return null;
  const s: LastfmSessionReply = JSON.parse(r.body);
  if (s.session === undefined) throw new Error(`Last.fm: ${lastfmMessage(r)}`);
  return s.session as LastfmSessionInfo;
}

interface LastfmUserReply { user?: LastfmUserInfo; error?: i32; message?: string; }
interface LastfmUserInfo { name: string; playcount: string; }

/** The account a session key opens (user.getInfo signed with it): "ann · 1234 scrobbles". Throws what Last.fm refuses. */
export async function lastfmCheck(a: Accounts): Promise<string> {
  const p = new Map<string, string>();
  p.set('method', 'user.getInfo'); p.set('api_key', a.lastfmKey); p.set('sk', a.lastfmSession);
  const r = await lastfmCall(p, a.lastfmSecret);
  if (r.error !== '') throw new Error(`Last.fm cannot be reached (${r.error})`);
  const u: LastfmUserReply = JSON.parse(r.body);
  if (u.user === undefined) throw new Error(`Last.fm: ${lastfmMessage(r)}`);
  const info = u.user as LastfmUserInfo;
  return `${info.name} · ${info.playcount} scrobbles`;
}

interface TokenCheckReply { valid?: boolean; user_name?: string; message?: string; }

/** The account a ListenBrainz token belongs to (GET /1/validate-token): its user name. Throws when the token is refused. */
export async function listenbrainzCheck(token: string): Promise<string> {
  const h = new net.Headers();
  h.set('Authorization', `Token ${token}`);
  let body = '';
  try {
    const res = await net.fetch(`${LISTENBRAINZ_URL}/1/validate-token`, { headers: h, timeoutMs: TIMEOUT_MS });
    body = await res.text();
  } catch (e) { throw new Error(`ListenBrainz cannot be reached (${(e as Error).message})`); }
  const v: TokenCheckReply = JSON.parse(body);
  if (v.valid !== true) throw new Error(`ListenBrainz: ${v.message !== undefined ? v.message as string : 'the token is refused'}`);
  return v.user_name as string;
}

/** What a failed send means for the listens it carried. */
const KEEP = 0, DROP = 1;

/** Last.fm codes: 8, 11, 16 and 29 pass (operation failed, offline, unavailable, rate limit); 4, 9, 10, 13, 26 are the account's
 *  (the listens wait for it to be fixed); the others are the request's own and will never pass. */
function lastfmFate(code: i32): i32 {
  return code === 6 || code === 7 || code === 27 ? DROP : KEEP;
}

// ---- ListenBrainz

function lbListen(s: Scrobble, withTime: boolean): string {
  const meta = `{"artist_name": ${JSON.stringify(s.artist)}, "track_name": ${JSON.stringify(s.track)}${s.album !== '' ? `, "release_name": ${JSON.stringify(s.album)}` : ''}, ` +
    `"additional_info": {"duration_ms": ${s.durationS * 1000}, "media_player": "${CLIENT}", "submission_client": "${CLIENT}"}}`;
  return withTime ? `{"listened_at": ${Math.floor(s.at)}, "track_metadata": ${meta}}` : `{"track_metadata": ${meta}}`;
}

async function lbSubmit(token: string, kind: string, listens: string[]): Promise<CallResult> {
  return await post(`${LISTENBRAINZ_URL}/1/submit-listens`, `{"listen_type": "${kind}", "payload": [${listens.join(', ')}]}`, 'application/json', `Token ${token}`);
}

// ---- the history

/** One line of a listen history (history.jsonl, one per iPod): a listen as it was when its track was left. A listen taken up again
 *  later writes another line with the same `listen`: the last one holds. `skipped`: it did not count (the rule above). */
export interface HistoryLine {
  listen: string; trackId: string; artist: string; title: string; album: string; durationMs: number; heardMs: number;
  /** ISO 8601 with the local offset ("2026-10-29T14:03:00+01:00"). */
  startedAt: string;
  /** mac | sonos | remote | subsonic */
  source: string;
  counted: boolean; skipped: boolean;
}

function pad(n: number, w: i32): string { let s = `${Math.floor(Math.abs(n))}`; while (s.length < w) s = '0' + s; return s; }

/** `ms` (since 1970) as ISO 8601 in local time with its offset. */
export function isoLocal(ms: number): string {
  const d = new Date(ms);
  const off = -d.getTimezoneOffset();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1, 2)}-${pad(d.getDate(), 2)}T${pad(d.getHours(), 2)}:${pad(d.getMinutes(), 2)}:${pad(d.getSeconds(), 2)}` +
    `${off >= 0 ? '+' : '-'}${pad(off / 60, 2)}:${pad(off % 60, 2)}`;
}

/** Appends one line to the history `file` (never rewritten: cheap at every listen). */
export function appendHistory(file: string, line: HistoryLine): void {
  try { fs.appendText(file, JSON.stringify(line) + '\n'); } catch (e) { console.error(`scrobble: ${file}: ${(e as Error).message}`); }
}

// ---- the scrobbler

export class Scrobbler {
  accounts: Accounts = new Accounts();
  /** Why the last send to each service failed ('' when it worked); shown in the settings. */
  lastfmError: string = '';
  listenbrainzError: string = '';
  /** Called for what is worth a line in a log. */
  log: (what: string, result: string, ok: boolean) => void = (what: string, result: string, ok: boolean) => {};
  /** The listen heard() last added to: its time heard in all and whether it counted (for the history). */
  heardMs: number = 0;
  wasCounted: boolean = false;
  private dir: string;
  private running: Promise<void> | null = null;

  /** The queues and the open listens live in `dir`. */
  constructor(dir: string) { this.dir = dir; }

  private file(name: string): string { return `${this.dir}/${name}.json`; }
  private readQueue(name: string): Scrobble[] {
    try { if (fs.exists(this.file(name))) { const q: QueueFile = JSON.parse(fs.readText(this.file(name))); return q.items; } } catch (e) { /* lost: empty */ }
    return [];
  }
  private writeQueue(name: string, items: Scrobble[]): void {
    const q: QueueFile = { items: items };
    try { fs.mkdir(this.dir, true); fs.writeText(`${this.file(name)}.part`, JSON.stringify(q)); fs.rename(`${this.file(name)}.part`, this.file(name)); }
    catch (e) { console.error(`scrobble: ${this.file(name)}: ${(e as Error).message}`); }
  }

  /** Listens waiting to be sent to Last.fm and to ListenBrainz. */
  waitingLastfm(): i32 { return this.readQueue('lastfm').length; }
  waitingListenbrainz(): i32 { return this.readQueue('listenbrainz').length; }

  /** Adds `ms` heard to the listen `id` of `s` (made at its first call). True the one time the listen comes to count: it is then
   *  queued for the services that are on (the caller counts it on the iPod). */
  heard(id: string, s: Scrobble, ms: number): boolean {
    let open: OpenFile = { listens: [] };
    try { if (fs.exists(this.file('open'))) open = JSON.parse(fs.readText(this.file('open'))); } catch (e) { /* lost: new listens */ }
    const now = Date.now();
    const kept: OpenListen[] = [];
    let l: OpenListen | null = null;
    for (const o of open.listens) {
      if (o.id === id) l = o;
      else if (now - o.touched < OPEN_KEEP_MS) kept.push(o);
    }
    const listen: OpenListen = l !== null ? l as OpenListen : { id: id, heardMs: 0, counted: false, touched: now };
    listen.heardMs += ms;
    listen.touched = now;
    kept.push(listen);
    const counted = !listen.counted && counts(s.durationS * 1000, listen.heardMs);
    if (counted) listen.counted = true;
    this.heardMs = listen.heardMs;
    this.wasCounted = listen.counted;
    const out: OpenFile = { listens: kept };
    try { fs.mkdir(this.dir, true); fs.writeText(this.file('open'), JSON.stringify(out)); } catch (e) { /* counted again at worst */ }
    if (counted) this.submit(s);
    return counted;
  }

  /** The id of the latest listen started with `prefix` that has not counted yet ('' when none): a track taken up again continues it. */
  openListen(prefix: string): string {
    let found = '', at: number = -1;   // -1: a clock at 0 (ZINC_DETERMINISTIC) still finds its listens
    try {
      if (!fs.exists(this.file('open'))) return '';
      const open: OpenFile = JSON.parse(fs.readText(this.file('open')));
      for (const o of open.listens) if (!o.counted && o.id.startsWith(prefix) && o.touched > at) { found = o.id; at = o.touched; }
    } catch (e) { return ''; }
    return Date.now() - at < OPEN_KEEP_MS ? found : '';
  }

  /** Queues a listen that counts for the services that are on, then tries to send. */
  submit(s: Scrobble): void {
    if (lastfmOn(this.accounts)) { const q = this.readQueue('lastfm'); q.push(s); this.writeQueue('lastfm', q); }
    if (listenbrainzOn(this.accounts)) { const q = this.readQueue('listenbrainz'); q.push(s); this.writeQueue('listenbrainz', q); }
    this.flush();
  }

  /** Tells the services what plays now (nothing is queued: it is stale by the time it could be sent again). */
  async nowPlaying(s: Scrobble): Promise<void> {
    const a = this.accounts;
    if (lastfmOn(a)) {
      const p = new Map<string, string>();
      p.set('method', 'track.updateNowPlaying'); p.set('api_key', a.lastfmKey); p.set('sk', a.lastfmSession);
      p.set('artist', s.artist); p.set('track', s.track);
      if (s.album !== '') p.set('album', s.album);
      if (s.albumArtist !== '' && s.albumArtist !== s.artist) p.set('albumArtist', s.albumArtist);
      if (s.durationS > 0) p.set('duration', `${s.durationS}`);
      const r = await lastfmCall(p, a.lastfmSecret);
      this.lastfmError = r.error !== '' ? `cannot be reached (${r.error})` : lastfmCode(r) !== 0 ? lastfmMessage(r) : '';
    }
    if (listenbrainzOn(a)) {
      const r = await lbSubmit(a.listenbrainzToken, 'playing_now', [lbListen(s, false)]);
      this.listenbrainzError = r.error !== '' ? `cannot be reached (${r.error})` : r.status >= 400 ? `HTTP ${r.status}: ${r.body.trim()}` : '';
    }
  }

  /** Sends what the queues hold, 50 at a time; what cannot be sent now stays for the next flush. A flush asked while one runs waits
   *  for it (that one also sends what was queued meanwhile). */
  async flush(): Promise<void> {
    if (this.running !== null) { await (this.running as Promise<void>); return; }
    const run = this.send();
    this.running = run;
    try { await run; } finally { this.running = null; }
  }

  private async send(): Promise<void> {
    if (lastfmOn(this.accounts)) await this.flushLastfm();
    if (listenbrainzOn(this.accounts)) await this.flushListenbrainz();
  }

  private async flushLastfm(): Promise<void> {
    const a = this.accounts;
    let q = this.readQueue('lastfm');
    while (q.length > 0) {
      const batch = q.slice(0, BATCH);
      const p = new Map<string, string>();
      p.set('method', 'track.scrobble'); p.set('api_key', a.lastfmKey); p.set('sk', a.lastfmSession);
      for (let i = 0; i < batch.length; i++) {
        const s = batch[i];
        p.set(`artist[${i}]`, s.artist); p.set(`track[${i}]`, s.track); p.set(`timestamp[${i}]`, `${Math.floor(s.at)}`);
        if (s.album !== '') p.set(`album[${i}]`, s.album);
        if (s.albumArtist !== '' && s.albumArtist !== s.artist) p.set(`albumArtist[${i}]`, s.albumArtist);
        if (s.durationS > 0) p.set(`duration[${i}]`, `${s.durationS}`);
      }
      const r = await lastfmCall(p, a.lastfmSecret);
      const code = r.error !== '' ? -2 : lastfmCode(r);
      if (code !== 0) {
        this.lastfmError = code === -2 ? `cannot be reached (${r.error}); ${q.length} waiting` : `${lastfmMessage(r)}; ${q.length} waiting`;
        if (code === -2 || lastfmFate(code) === KEEP) { this.log('Scrobble to Last.fm', this.lastfmError, false); return; }
        this.log('Scrobble to Last.fm', `${batch.length} refused: ${lastfmMessage(r)}`, false);   // never accepted: dropped
      } else {
        this.lastfmError = '';
        this.log('Scrobbled to Last.fm', `${batch.length} listen${batch.length === 1 ? '' : 's'}`, true);
      }
      q = this.readQueue('lastfm').slice(batch.length);   // listens queued meanwhile stay
      this.writeQueue('lastfm', q);
    }
  }

  private async flushListenbrainz(): Promise<void> {
    let q = this.readQueue('listenbrainz');
    while (q.length > 0) {
      const batch = q.slice(0, BATCH);
      const listens: string[] = [];
      for (const s of batch) listens.push(lbListen(s, true));
      const r = await lbSubmit(this.accounts.listenbrainzToken, batch.length === 1 ? 'single' : 'import', listens);
      if (r.error !== '' || r.status === 401 || r.status === 429 || r.status >= 500) {
        this.listenbrainzError = `${r.error !== '' ? `cannot be reached (${r.error})` : `HTTP ${r.status}: ${r.body.trim()}`}; ${q.length} waiting`;
        this.log('Scrobble to ListenBrainz', this.listenbrainzError, false);
        return;
      }
      if (r.status >= 400) this.log('Scrobble to ListenBrainz', `${batch.length} refused: HTTP ${r.status}: ${r.body.trim()}`, false);   // never accepted: dropped
      else { this.listenbrainzError = ''; this.log('Scrobbled to ListenBrainz', `${batch.length} listen${batch.length === 1 ? '' : 's'}`, true); }
      q = this.readQueue('listenbrainz').slice(batch.length);
      this.writeQueue('listenbrainz', q);
    }
  }
}
