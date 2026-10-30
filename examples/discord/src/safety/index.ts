// The guard: the one door between the app and Discord (ZN-890, docs/reports/discord-safety-model.md). Every HTTP request, reads
// included, every gateway payload the app chooses to send and every picture download pass here; rest.ts and gateway.ts are transports
// that only this module drives. It holds the whole safety model, its state and, with policy.ts, every number:
//   1. human origin: an action needs a person's key or click in the window in front, a moment ago (never a timer, a loop, startup);
//   2. action guards: permissions, slowmode, a blocked person, a closed DM, the text (length, repeats, mentions, links), file sizes;
//   3. budgets: per kind and global, a minimum interval, caps a minute and an hour, cooldowns that double with each refusal in a row;
//   4. dedupe and cache: a GET on its way is not sent twice, its answer is kept a while; pictures are kept on disk (cdn.ts);
//   5. circuit breaker and safe mode: Discord's buckets, 50 a second, the invalid-request cap, 429 retries, then safe mode;
//   6. session hygiene: one instance, IDENTIFY counted across launches, a quick restart resumes, the gateway paced and backed off.
// The app asks begin(kind, details) for a Verdict (ok, or the message and the wait to show), then request(verdict, ...) or
// send(verdict, op, d). The UI reads countdown() and cannotSend() from here.
import { windowFocused } from 'zinc:ui';
import * as power from 'zinc:system/power';
import * as storage from 'zinc:storage';
import { lock } from 'zinc:system/instance';
import { focus } from 'zinc:system/window';
import { readText, writeTextAsync, exists, remove } from 'zinc:fs';
import { API_BASE } from '../constants';
import { transport, setToken as setTransportToken, ApiError } from '../services/rest';
import { Rule, RULES, HUMAN_S, FILES_MAX, GET_CACHE_MS, OFFLINE_FIRST_MS, OFFLINE_MAX_MS, GLOBAL_PER_SECOND, INVALID_MAX, INVALID_WINDOW_MS,
  LONGEST_WAIT_S, RETRIES_429, SAFE_MODE_MS, GATEWAY_SENDS_MAX, IDENTIFY_MAX, IDENTIFY_SPACING_MS, RECONNECT_FIRST_MS, RECONNECT_MAX_MS,
  INVALID_SESSION_MS, INVALID_SESSION_SPREAD_MS, RESUME_FRESH_MS, RESUME_SESSION_MS, ACK_BURST_MS, IDLE_AFTER_S, PRESENCE_CHECK_MS,
  CDN_AT_ONCE, REFRESH_BATCH as BATCH } from './policy';
import { Window, Budgets, Spam, Buckets, routeOf, plainError, startsSafeMode } from './core';
import { Access, ATTACH_FILES, ADD_REACTIONS, CONNECT, SPEAK, MOVE_MEMBERS } from './access';

export { ApiError };
/** Picture URLs renewed in one request at most. */
export const REFRESH_BATCH = BATCH;

const budgets = new Budgets();
const spam = new Spam();
const access = new Access();
const sleep = (ms: number): Promise<void> => new Promise<void>((done: () => void) => { setTimeout(done, ms); });
let log: (line: string) => void = (line: string): void => {};
let listeners: (() => void)[] = [];
/** The guard's log lines (DISCORD_LOG), and a call when its countdowns change (the screen redraws). */
export function setLog(f: (line: string) => void): void { log = f; }
export function onChange(f: () => void): void { listeners.push(f); }
const changed = (): void => { for (const f of listeners) f(); };

// ------------------------------------------------------------------ layer 1: human origin
let scripted = false;
/** The scripted sessions (DISCORD_DEMO, DISCORD_BENCH) have no person: they may run only against the fake Discord on this machine.
 *  True when they may; they still meet every cap, check and cooldown, only the person's input and the intervals of actions are waived. */
export function allowScripts(): boolean {
  scripted = API_BASE.startsWith('http://127.0.0.1:') || API_BASE.startsWith('http://localhost:');
  return scripted;
}
/** A person's input in the last HUMAN_S seconds with the window in front: the system's idle time counts real keys and pointer moves. */
function human(): boolean {
  if (!windowFocused()) return false;
  try { return power.idleSeconds() <= HUMAN_S; } catch (e) { return true; }   // ponytail: a system without idle time: the focus alone
}

// ------------------------------------------------------------------ layer 2: action guards
/** What an action is about, for the checks of layer 2. */
export class Details {
  channel = ''; text = ''; edit = false;
  /** Files: their sizes. A reaction: the message's author, and whether the emoji is new on it. A call: who is in the channel now. */
  sizes: number[] = []; author = ''; newReaction = false; inCall: i32 = 0;
}
const lastSentIn: Map<string, number> = new Map<string, number>();
let online = false;   // the gateway's session is up
/** A dispatch of the gateway: the guard keeps its own picture of my permissions, blocks and channels. */
export function observe(t: string, d: any): void { access.observe(t, d); }
/** ms before the channel's slowmode lets me send again. */
function slowLeft(ch: string, now: number): number {
  const s = access.slowmodeS(ch, now), last = lastSentIn.get(ch);
  return s > 0 && last !== undefined ? Math.max(0, last + s * 1000 - now) : 0;
}
/** Why I cannot write in the channel (no permission, a blocked person, a DM closed to me), '' when I can or cannot tell. */
export function cannotSend(ch: string): string { return access.cannotSend(ch, Date.now()); }
/** In a voice channel without SPEAK: the call starts muted. */
export function mustMute(ch: string): boolean { return access.lacks(ch, SPEAK, Date.now()); }
/** Whether pinning is offered in the channel (the pin button); the 'pin' kind is refused where it is not. */
export function mayPin(ch: string): boolean { return access.mayPin(ch, Date.now()); }
const MB = 1048576;
function actionCheck(kind: string, d: Details | null, now: number): string {
  if (d === null) return '';
  const ch = d.channel;
  const writes = kind === 'send' || kind === 'upload' || kind === 'edit' || kind === 'react' || kind === 'vote' || kind === 'delete';
  if (writes && !online) return 'Not connected to Discord: try again in a moment.';
  if (kind === 'send' || kind === 'upload' || kind === 'typing') {
    const no = access.cannotSend(ch, now);
    if (no !== '') return no;
    const slow = slowLeft(ch, now);
    if (slow > 0) return `Slowmode: you can send again in ${Math.ceil(slow / 1000)} s.`;
  }
  if (kind === 'send' || kind === 'edit') {
    if (d.text.length > access.messageMax()) return `A message holds ${access.messageMax()} characters at most.`;
    return spam.check(d.text, ch, now, kind === 'edit');
  }
  if (kind === 'upload') {
    if (access.lacks(ch, ATTACH_FILES, now)) return 'You do not have permission to send files here.';
    if (d.sizes.length > FILES_MAX) return `A message holds ${FILES_MAX} files at most.`;
    const max = access.uploadMax(ch);
    for (const n of d.sizes) if (n > max) return `A file is larger than the ${Math.round(max / MB)} MB you may send here.`;
    return d.text !== '' ? spam.check(d.text, ch, now, false) : '';
  }
  if (kind === 'react' && d.author !== '' && access.isBlocked(d.author)) return 'You blocked this person: no reactions to their messages.';
  if (kind === 'react' && d.newReaction && access.lacks(ch, ADD_REACTIONS, now)) return 'You do not have permission to add reactions here.';
  if (kind === 'pin' && !access.mayPin(ch, now)) return 'You do not have permission to pin messages here.';
  if (kind === 'call') {
    if (access.lacks(ch, CONNECT, now)) return 'You do not have permission to join this voice channel.';
    const limit = access.userLimit(ch);
    if (limit > 0 && d.inCall >= limit && access.lacks(ch, MOVE_MEMBERS, now)) return 'This voice channel is full.';
  }
  return '';
}

// ------------------------------------------------------------------ layer 3: budgets (and the verdicts they give)
/** The guard's answer to begin(): ok, or the sentence to show and how long to wait (0: not a matter of waiting). */
export class Verdict { ok = false; message = ''; waitMs: number = 0; kind = ''; channel = ''; uses: i32 = 0; at: number = 0; }
const issued: Set<Verdict> = new Set<Verdict>();
const VERDICT_MS = 60000;   // a message's files may take a while between its two requests
let tokenRefused = false;   // a 401: nothing more with this token
let safeUntil: number = 0;
const safe = (now: number): boolean => now < safeUntil;

/** Whether one action or request of the kind may go now, after every layer; `uses`: the requests it covers. */
export function begin(kind: string, d: Details | null = null, uses: i32 = 1): Verdict {
  const v = new Verdict(), now = Date.now();
  v.kind = kind; v.channel = d !== null ? d.channel : '';
  const logsIn = kind === 'login' || kind === 'mfa' || kind === 'qr' || kind === 'ticket';   // a refused token still lets a person log in
  let why = tokenRefused && !logsIn ? plainError(401, null, 0) : actionCheck(kind, d, now);
  if (why === '') why = budgets.check(kind, now, human(), windowFocused(), safe(now), scripted);
  if (why !== '') {
    v.message = why; v.waitMs = budgets.waitMs(kind, now);
    const r = RULES.get(kind);
    if (r === undefined || !r.quiet) { log(`guard: ${kind} refused: ${why}`); changed(); }
    return v;
  }
  if (kind === 'send' && d !== null) { spam.remember(d.text, d.channel, now); lastSentIn.set(d.channel, now); budgets.again('typing'); }
  v.ok = true; v.uses = uses; v.at = now;
  if (uses > 0) issued.add(v);   // 0: an action counted and checked that sends nothing itself (a call: its op 4 has its own verdict)
  return v;
}
/** The composer's countdown (the slowmode, or the cooldown of messages), '' when none; the screen is called again each second. */
export function countdown(ch: string): string {
  const now = Date.now(), slow = slowLeft(ch, now), wait = budgets.waitMs('send', now);
  if (slow <= 0 && wait <= 0) return '';
  if (ticking < 0) ticking = setTimeout(() => { ticking = -1; changed(); }, 1000);
  return slow >= wait ? `Slowmode: you can send again in ${Math.ceil(slow / 1000)} s` : `Slow down: you can send again in ${Math.ceil(wait / 1000)} s`;
}
let ticking = -1;
/** Runs f once ACK_BURST_MS after the first call of a burst (the read marker of messages arriving in the open channel). */
export function afterBurst(f: () => void): void {
  if (burst >= 0) return;
  burst = setTimeout(() => { burst = -1; f(); }, ACK_BURST_MS);
}
let burst = -1;
function spend(v: Verdict): boolean {
  if (!issued.has(v) || !v.ok || v.uses <= 0) return false;
  if (Date.now() - v.at > VERDICT_MS) { issued.delete(v); return false; }
  v.uses--;
  if (v.uses <= 0) issued.delete(v);
  return true;
}

// ------------------------------------------------------------------ layers 4 and 5: the HTTP requests
class Cached { at: number = 0; value: any = null; }
const cache: Map<string, Cached> = new Map<string, Cached>();
const inFlight: Map<string, Promise<any>> = new Map<string, Promise<any>>();
const perSecond = new Window(GLOBAL_PER_SECOND, 1000);
const invalid = new Window(INVALID_MAX, INVALID_WINDOW_MS);
const buckets = new Buckets();
let offlineUntil: number = 0, offlineWait: number = OFFLINE_FIRST_MS;
let safeMode: (message: string, unauthorized: boolean) => void = (message: string, unauthorized: boolean): void => {};
/** Called when a refused request starts safe mode: the message for the person, and whether the token is dead (back to the login). */
export function onSafeMode(f: (message: string, unauthorized: boolean) => void): void { safeMode = f; }
/** A new token: what the old one met is forgotten. */
export function setToken(t: string): void { setTransportToken(t); tokenRefused = false; safeUntil = 0; cache.clear(); }

/** One HTTP request under a verdict of begin(); a refused verdict (or none) sends nothing and throws its message. */
export async function request(v: Verdict, method: string, path: string, body: any): Promise<any> {
  if (!spend(v)) throw new ApiError(0, v.message !== '' ? v.message : 'Not sent: the guard did not let it through.');
  const background = !(RULES.get(v.kind) as Rule).essential;
  if (method !== 'GET') return http(v, method, path, body, background);
  const known = cache.get(path);
  if (known !== undefined && Date.now() - known.at < GET_CACHE_MS) return known.value;
  const going = inFlight.get(path);
  if (going !== undefined) return going;
  const p = http(v, method, path, body, background);
  inFlight.set(path, p);
  try {
    const value = await p;
    const c = new Cached(); c.at = Date.now(); c.value = value; cache.set(path, c);
    return value;
  } finally { inFlight.delete(path); }
}
/** begin() then request(): for the requests whose refusal needs nothing but its message. */
export async function api(kind: string, method: string, path: string, body: any, d: Details | null = null): Promise<any> {
  return request(begin(kind, d), method, path, body);
}

const header = (r: Response, name: string): string => { const h = r.headers.get(name); return h !== null ? h : ''; };
async function http(v: Verdict, method: string, path: string, body: any, background: boolean): Promise<any> {
  const route = routeOf(method, path);
  for (let attempt = 0; ; attempt++) {
    if (tokenRefused) throw new ApiError(401, plainError(401, null, 0));
    if (background && safe(Date.now())) throw new ApiError(0, 'safe mode: not sent');
    if (background && Date.now() < offlineUntil) throw new ApiError(0, 'offline: not sent');
    if (invalid.count(Date.now()) >= INVALID_MAX) throw new ApiError(0, 'Discord refused too many requests from this client: it waits a few minutes before asking again.');
    let told = false;
    for (;;) {   // Discord's bucket of the route, and 50 a second
      const now = Date.now();
      let wait = buckets.wait(route, now);
      if (wait === 0) wait = perSecond.take(now);
      if (wait === 0) { buckets.take(route); break; }
      if (!told) log(`rate limit: ${route} waits for its bucket`);
      told = true;
      await sleep(wait);
    }
    let got: Response | null = null;
    try { got = await transport(method, path, body); }
    catch (e) {
      log(`offline: ${route} failed (${e.message}), background requests wait ${offlineWait / 1000} s`);
      offlineUntil = Date.now() + offlineWait; offlineWait = Math.min(offlineWait * 2, OFFLINE_MAX_MS);
      throw new ApiError(0, 'No connection to Discord: try again in a moment.');
    }
    const r = got as Response;
    offlineWait = OFFLINE_FIRST_MS;
    buckets.learn(route, header(r, 'x-ratelimit-bucket'), parseInt(header(r, 'x-ratelimit-remaining')), parseFloat(header(r, 'x-ratelimit-reset-after')), Date.now());
    const text = r.status === 204 ? '' : await r.text();
    let j: any = null;
    if (!r.ok) { try { j = JSON.parse(text); } catch (e) {} }
    // a shared resource's limit (X-RateLimit-Scope: shared) is not this client's fault and does not count
    if (r.status === 401 || r.status === 403 || (r.status === 429 && header(r, 'x-ratelimit-scope') !== 'shared')) invalid.add(Date.now());
    let wait = parseFloat(header(r, 'retry-after'));
    if (j !== null && typeof j.retry_after === 'number') wait = j.retry_after;
    if (!(wait > 0)) wait = 1;
    const retry = r.status === 429 && attempt < RETRIES_429 && wait <= LONGEST_WAIT_S && !safe(Date.now());
    if (!r.ok && startsSafeMode(r.status, j, retry)) {
      // the circuit breaker: the kind's cooldown grows, the whole client's after a 429; safe mode stops what is not essential
      budgets.strike(v.kind, Date.now());
      if (r.status === 429) budgets.strike('', Date.now());
      if (r.status === 401) tokenRefused = true; else safeUntil = Date.now() + SAFE_MODE_MS;
      const why = plainError(r.status, j, wait);
      log(`safe mode: ${r.status} on ${route}`);
      safeMode(why !== '' ? why : `Discord refused a request (HTTP ${r.status}): this client slows down for a while.`, r.status === 401);
      changed();
    }
    if (retry) {
      const global = header(r, 'x-ratelimit-global') === 'true' || (j !== null && j.global === true);
      const until = Date.now() + Math.ceil(wait * 1000);
      if (global) buckets.globalUntil = until;
      else if (!buckets.empty(route, until)) await sleep(until - Date.now());
      log(`rate limit: 429 on ${route}, retry after ${global ? 'the global limit' : 'its bucket'}`);
      continue;
    }
    if (!r.ok) {
      let message = plainError(r.status, j, wait);
      if (message === '') message = j !== null && typeof j.message === 'string' ? j.message : `HTTP ${r.status}`;
      // a message refused here is not tried again in this channel (a DM closed to me, a permission READY did not show)
      if (r.status === 403 && (v.kind === 'send' || v.kind === 'upload') && v.channel !== '')
        access.refusedIn.set(v.channel, j !== null && j.code === 50007 ? 'This person does not take messages from you.' : `Discord refused messages here: ${message}`);
      throw new ApiError(r.status, message, j);
    }
    return text.length > 0 ? JSON.parse(text) : null;
  }
}

/** A file's bytes PUT to the storage URL Discord gave for it (no token goes there), under the upload's verdict. */
export async function storagePut(v: Verdict, url: string, body: Blob): Promise<Response> {
  if (!spend(v)) throw new ApiError(0, 'Not sent: the guard did not let it through.');
  return await fetch(url, { method: 'PUT', body: body });
}

/** A picture of the CDN (no token): CDN_AT_ONCE downloads at a time, the last asked first (the last shown). */
export async function download(url: string): Promise<Response> {
  if (downloading >= CDN_AT_ONCE) await new Promise<void>((go: () => void) => { waiting.push(go); });
  downloading++;
  try { return await fetch(url); }
  finally { downloading--; if (waiting.length > 0) (waiting.pop() as () => void)(); }
}
let downloading: i32 = 0;
const waiting: (() => void)[] = [];

// ------------------------------------------------------------------ layer 6: the gateway and the session
let wire: ((text: string) => void) | null = null;
const sentOnGateway = new Window(GATEWAY_SENDS_MAX, 60000);
let queue: string[] = [];
let flushing = -1;
/** A gateway connection opened (f sends a payload on it) or closed (null): the 120 a minute are per connection. */
export function gatewayWire(f: ((text: string) => void) | null): void {
  wire = f; online = false; sentOnGateway.clear(); queue = [];
  if (flushing >= 0) { clearTimeout(flushing); flushing = -1; }
}
/** The session is up (READY or RESUMED) or not. */
export function gatewayUp(up: boolean): void {
  online = up;
  if (up) { reconnectWait = RECONNECT_FIRST_MS; invalidInARow = 0; startPresence(); }
}
/** A heartbeat always goes, and counts. */
export function heartbeat(text: string): void { const w = wire; if (w !== null) { sentOnGateway.add(Date.now()); w(text); } }
/** IDENTIFY, RESUME, the answer to a heartbeat request: protocol, paced with the rest. */
export function protocol(op: i32, d: any): void { out(JSON.stringify({ op: op, d: d })); }
/** A payload the app chose to send (op 37, op 4, op 3) under a verdict of begin(): false when it was not let through. */
export function send(v: Verdict, op: i32, d: any): boolean {
  if (!spend(v)) { log(`guard: op ${op} not sent: ${v.message}`); return false; }
  out(JSON.stringify({ op: op, d: d }));
  return true;
}
/** Leaving a call always goes (op 4 with no channel). */
export function leave(op: i32, d: any): void { out(JSON.stringify({ op: op, d: d })); }
function out(text: string): void { queue.push(text); flush(); }
/** Sends what waits while the minute's window has room; the rest when the oldest send leaves it. */
function flush(): void {
  while (wire !== null && queue.length > 0) {
    const wait = sentOnGateway.take(Date.now());
    if (wait > 0) {
      if (flushing < 0) {
        log(`gateway: ${queue.length} sends wait ${Math.ceil(wait)} ms for the 120 a minute`);
        flushing = setTimeout(() => { flushing = -1; flush(); }, wait);
      }
      return;
    }
    (wire as (text: string) => void)(queue.shift() as string);
  }
}

// IDENTIFY: 50 a day across launches (zinc:storage), one per 5 s
const IDENTIFIES_KEY = 'identifies';
const identifies = new Window(IDENTIFY_MAX, 86400000);
const identifySpacing = new Window(1, IDENTIFY_SPACING_MS);
try {
  const kept: any = JSON.parse(storage.get(IDENTIFIES_KEY));
  if (Array.isArray(kept)) for (const at of kept) { const t: number = at; identifies.add(t); identifySpacing.add(t); }
} catch (e) {}
/** 0 when an IDENTIFY may go now (and counts it), ms to wait for the spacing, -1 when today's are spent (the client stops). */
export function identify(): number {
  const now = Date.now();
  const soon = identifySpacing.count(now) > 0 ? identifySpacing.take(now) : 0;
  if (soon > 0) return soon;
  if (identifies.take(now) > 0) { log(`gateway: ${IDENTIFY_MAX} logins today, stopping`); return -1; }
  identifySpacing.add(now);
  const kept: number[] = [];
  try { const v: any = JSON.parse(storage.get(IDENTIFIES_KEY)); if (Array.isArray(v)) for (const at of v) if (now - at < 86400000) kept.push(at); } catch (e) {}
  kept.push(now);
  storage.set(IDENTIFIES_KEY, JSON.stringify(kept));
  return 0;
}
/** IDENTIFYs in the last day, every launch counted. */
export function identifiesToday(): i32 { return identifies.count(Date.now()); }
let reconnectWait: number = RECONNECT_FIRST_MS, invalidInARow = 0;
/** The wait before the next connection after a drop: doubling to 60 s, with jitter (50 to 100%) so clients cut off together do not come
 *  back together. Returns [the wait, the step logged]. */
export function reconnectDelay(): number[] {
  const step = reconnectWait;
  reconnectWait = Math.min(reconnectWait * 2, RECONNECT_MAX_MS);
  return [Math.round(step * (0.5 + Math.random() / 2)), step];
}
/** Op 9 d:false: Discord asks for a random 1 to 5 s before a new IDENTIFY; doubled each time in a row until a READY. */
export function invalidSessionDelay(): number {
  const wait = Math.min((INVALID_SESSION_MS + Math.random() * INVALID_SESSION_SPREAD_MS) * Math.pow(2, invalidInARow), RECONNECT_MAX_MS);
  invalidInARow++;
  return wait;
}

/** A session to resume: its id, READY's sequence number, where to resume, when READY came and when it was left. */
export class Saved { id = ''; seq: i32 = 0; url = ''; readyAt: number = 0; leftAt: number = 0; }
const SESSION_KEY = 'session';
let readyFile = '';
/** Where READY is kept for the next launch (the client's disk cache). */
export function keepReadyIn(path: string): void { readyFile = path; }
/** READY as it came: kept for the next launch's resume. */
export function saveReady(text: string): void {
  if (readyFile !== '') writeTextAsync(readyFile, text).catch((e) => { log(`session: READY not kept (${e.message})`); });
}
/** At quit: the session is kept for a quick restart. */
export function keepSession(s: Saved | null): void { if (s !== null && online) storage.set(SESSION_KEY, JSON.stringify(s)); }
/** A session the last launch left a moment ago, with its READY read back ([saved, READY's data]); null when there is none fresh enough
 *  (it is used once). Discord replays every event since READY: a long session's are too many, then it answers op 9 and the client
 *  identifies. */
export function lastSession(): any[] | null {
  const text = storage.get(SESSION_KEY);
  if (text === '') return null;
  storage.remove(SESSION_KEY);
  try {
    const v: any = JSON.parse(text), s = new Saved(), now = Date.now();
    s.id = `${v.id}`; s.seq = v.seq; s.url = `${v.url}`; s.readyAt = v.readyAt; s.leftAt = v.leftAt;
    if (now - s.leftAt > RESUME_FRESH_MS || s.leftAt - s.readyAt > RESUME_SESSION_MS || readyFile === '' || !exists(readyFile)) return null;
    const ready: any = JSON.parse(readText(readyFile));
    return [s, ready.d];
  } catch (e) { return null; }
}
/** Logging out, or another token: nothing of the session is kept. */
export function forgetSession(): void { storage.remove(SESSION_KEY); try { if (readyFile !== '' && exists(readyFile)) remove(readyFile); } catch (e) {} }
/** One instance of the app (so one session of the account): false when another runs, which was asked to come to the front. */
export async function single(): Promise<boolean> {
  try { return await lock((cwd: string, argv: string[]): void => { focus(); }); } catch (e) { return true; }   // the second launch's arguments are ignored
}

// presence: idle after a long absence, online at the first input; only when my status is online (never over do-not-disturb or invisible)
let away = false, presenceTimer = -1;
function startPresence(): void {
  if (presenceTimer >= 0 || !power.isSupported()) return;
  presenceTimer = setInterval(() => { presenceCheck(); }, PRESENCE_CHECK_MS);
}
function presenceCheck(): void {
  if (!online || (access.status !== 'online' && !away)) return;
  let idle: number = 0;
  try { idle = power.idleSeconds(); } catch (e) { return; }
  const goAway = !away && idle >= IDLE_AFTER_S, back = away && idle < PRESENCE_CHECK_MS / 1000;
  if (!goAway && !back) return;
  const v = begin('presence');
  if (!v.ok) return;
  away = goAway;
  send(v, 3, { status: goAway ? 'idle' : 'online', since: goAway ? Date.now() : 0, activities: [], afk: goAway });
  log(`presence ${goAway ? 'idle' : 'online'}`);
}
