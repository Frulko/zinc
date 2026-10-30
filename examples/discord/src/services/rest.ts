// The HTTP API: every request carries the token and the client identity, and honours Discord's rate limits
// (docs/reports/discord-client-research.md 3, docs/reports/discord-client-requests.md): the X-RateLimit-* headers fill one bucket per
// route and major id, a request waits while its bucket is empty or the client sent 50 in the last second, a 429 waits retry_after (the
// whole client when it is global) and tries again, three times at most and only for short waits. Refused requests are counted: a 401 stops
// every request until the next login, and past INVALID_MAX refusals (401, 403, 429) in 10 minutes nothing is sent until the window clears,
// far under the 10,000 that get an address banned. A captcha is never answered here: the error says to finish it in the official app.
import { API_BASE, USER_AGENT, LOCALE } from '../constants';
import { superProperties } from './identity';
import { Window, plainError, startsSafeMode } from './limits';

export class ApiError extends Error {
  status: i32;
  constructor(status: i32, message: string) { super(message); this.status = status; }
}

let token = '';
let refused = false;   // a 401: the token is dead, nothing more is sent with it
let safeUntil: number = 0;   // safe mode: background requests (typing, acks, picture URLs) are not sent until then
export function setToken(t: string): void { token = t; refused = false; safeUntil = 0; }
let log: (line: string) => void = (line: string): void => {};
export function setRestLog(f: (line: string) => void): void { log = f; }
let safeMode: (message: string, unauthorized: boolean) => void = (message: string, unauthorized: boolean): void => {};
/** Called when a refused request starts safe mode: the message for the user, and whether the token is dead (back to the login). */
export function onSafeMode(f: (message: string, unauthorized: boolean) => void): void { safeMode = f; }

export const GLOBAL_PER_SECOND = 50, INVALID_MAX = 100, LONGEST_WAIT_S = 10, SAFE_MODE_MS = 600000;
const perSecond = new Window(GLOBAL_PER_SECOND, 1000);
const invalid = new Window(INVALID_MAX, 600000);

function headers(json: boolean): [string, string][] {
  const h: [string, string][] = [['Authorization', token], ['User-Agent', USER_AGENT], ['X-Super-Properties', superProperties],
    ['X-Discord-Locale', LOCALE], ['Accept', '*/*']];
  if (json) h.push(['Content-Type', 'application/json']);
  return h;
}

const header = (r: Response, name: string): string => { const v = r.headers.get(name); return v !== null ? v : ''; };
const sleep = (ms: number): Promise<void> => new Promise<void>((done: () => void) => { setTimeout(done, ms); });

class Bucket { remaining: i32 = 1; resetAt: number = 0; }
const bucketOfRoute: Map<string, string> = new Map<string, string>();   // route -> X-RateLimit-Bucket
const buckets: Map<string, Bucket> = new Map<string, Bucket>();          // bucket + major id -> what is left
let globalUntil: number = 0;

/** The route of a request as Discord counts it: the method, the path with every id but the major one (channel, guild, webhook)
 *  replaced, e.g. POST /channels/302/messages/:id/ack. */
export function routeOf(method: string, path: string): string {
  const parts = path.split('?')[0].split('/');
  for (let i = 1; i < parts.length; i++) {
    const major = i === 2 && (parts[1] === 'channels' || parts[1] === 'guilds' || parts[1] === 'webhooks');
    if (!major && parts[i].length > 0 && parts[i].split('').every((c: string) => c >= '0' && c <= '9')) parts[i] = ':id';
  }
  return method + ' ' + parts.join('/');
}
function bucketFor(route: string): Bucket | null {
  const hash = bucketOfRoute.get(route);
  const b = buckets.get(hash !== undefined ? hash + ' ' + route.split('/')[2] : route);
  return b !== undefined ? b : null;
}

/** Waits until neither the global limit nor the route's bucket stops the request, then takes one request from the bucket. */
async function take(route: string): Promise<void> {
  let told = false;
  for (;;) {
    const now = Date.now();
    const b = bucketFor(route);
    if (b !== null && b.remaining <= 0 && now >= b.resetAt) b.remaining = 1;   // reset: let one through, its answer says how many
    let until = Math.max(globalUntil, b !== null && b.remaining <= 0 ? b.resetAt : 0);
    if (until <= now) {
      const w = perSecond.take(now);
      if (w === 0) { if (b !== null) b.remaining--; return; }
      until = now + w;
    }
    if (!told) log(`rate limit: ${route} waits for its bucket`);
    told = true;
    await sleep(until - now);
  }
}
/** Learns the route's bucket from the answer's headers. */
function learn(route: string, r: Response): void {
  const hash = header(r, 'x-ratelimit-bucket');
  if (hash === '') return;
  bucketOfRoute.set(route, hash);
  const key = hash + ' ' + route.split('/')[2];
  const known = buckets.get(key);
  const b = known !== undefined ? known : new Bucket();
  b.remaining = parseInt(header(r, 'x-ratelimit-remaining'));
  b.resetAt = Date.now() + parseFloat(header(r, 'x-ratelimit-reset-after')) * 1000;
  buckets.set(key, b);
}

/** One request. `background`: one the person did not ask for (typing, an ack, a picture's URL), skipped in safe mode. */
export async function api(method: string, path: string, body: any = undefined, background: boolean = false): Promise<any> {
  const route = routeOf(method, path);
  for (let attempt = 0; ; attempt++) {
    if (refused) throw new ApiError(401, plainError(401, null, 0));
    if (background && Date.now() < safeUntil) throw new ApiError(0, 'safe mode: not sent');
    if (invalid.count(Date.now()) >= INVALID_MAX)
      throw new ApiError(0, 'Discord refused too many requests from this client: it waits a few minutes before asking again.');
    await take(route);
    const r = await fetch(API_BASE + path, { method: method, headers: headers(body !== undefined), body: body !== undefined ? JSON.stringify(body) : undefined });
    learn(route, r);
    const text = r.status === 204 ? '' : await r.text();
    let j: any = null;
    if (!r.ok) { try { j = JSON.parse(text); } catch (e) {} }
    // a shared resource's limit (X-RateLimit-Scope: shared) is not this client's fault and does not count
    if (r.status === 401 || r.status === 403 || (r.status === 429 && header(r, 'x-ratelimit-scope') !== 'shared')) invalid.add(Date.now());
    let wait = parseFloat(header(r, 'retry-after'));
    if (j !== null && typeof j.retry_after === 'number') wait = j.retry_after;
    if (!(wait > 0)) wait = 1;
    const retry = r.status === 429 && attempt < 3 && wait <= LONGEST_WAIT_S && Date.now() >= safeUntil;
    if (!r.ok && startsSafeMode(r.status, j, retry)) {
      if (r.status === 401) refused = true; else safeUntil = Date.now() + SAFE_MODE_MS;
      const why = plainError(r.status, j, wait);
      log(`safe mode: ${r.status} on ${route}`);
      safeMode(why !== '' ? why : `Discord refused a request (HTTP ${r.status}): this client slows down for a while.`, r.status === 401);
    }
    if (retry) {
      const global = header(r, 'x-ratelimit-global') === 'true' || (j !== null && j.global === true);
      const until = Date.now() + Math.ceil(wait * 1000);
      if (global) globalUntil = until;
      else { const b = bucketFor(route); if (b !== null) { b.remaining = 0; b.resetAt = until; } else await sleep(until - Date.now()); }
      log(`rate limit: 429 on ${route}, retry after ${global ? 'the global limit' : 'its bucket'}`);
      continue;
    }
    if (!r.ok) {
      let message = plainError(r.status, j, wait);
      if (message === '') message = j !== null && typeof j.message === 'string' ? j.message : `HTTP ${r.status}`;
      throw new ApiError(r.status, message);
    }
    return text.length > 0 ? JSON.parse(text) : null;
  }
}
