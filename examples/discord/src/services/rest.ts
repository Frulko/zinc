// The HTTP API: every request carries the token and the client identity, and honours Discord's rate limits
// (docs/reports/discord-client-research.md 3): the X-RateLimit-* headers fill one bucket per route and major id, a request waits
// while its bucket is empty, a 429 waits retry_after (the whole client when it is global) and tries again, three times at most.
import { API_BASE, USER_AGENT, LOCALE } from '../constants';
import { superProperties } from './identity';

export class ApiError extends Error {
  status: i32;
  constructor(status: i32, message: string) { super(message); this.status = status; }
}

let token = '';
export function setToken(t: string): void { token = t; }
let log: (line: string) => void = (line: string): void => {};
export function setRestLog(f: (line: string) => void): void { log = f; }

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
    const until = Math.max(globalUntil, b !== null && b.remaining <= 0 ? b.resetAt : 0);
    if (until <= now) { if (b !== null) b.remaining--; return; }
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

export async function api(method: string, path: string, body: any = undefined): Promise<any> {
  const route = routeOf(method, path);
  for (let attempt = 0; ; attempt++) {
    await take(route);
    const r = await fetch(API_BASE + path, { method: method, headers: headers(body !== undefined), body: body !== undefined ? JSON.stringify(body) : undefined });
    learn(route, r);
    const text = r.status === 204 ? '' : await r.text();
    if (r.status === 429 && attempt < 3) {
      let wait = parseFloat(header(r, 'retry-after'));
      let global = header(r, 'x-ratelimit-global') === 'true';
      try { const j: any = JSON.parse(text); if (typeof j.retry_after === 'number') wait = j.retry_after; if (j.global === true) global = true; } catch (e) {}
      const until = Date.now() + Math.ceil((wait > 0 ? wait : 1) * 1000);
      if (global) globalUntil = until;
      else { const b = bucketFor(route); if (b !== null) { b.remaining = 0; b.resetAt = until; } else await sleep(until - Date.now()); }
      log(`rate limit: 429 on ${route}, retry after ${global ? 'the global limit' : 'its bucket'}`);
      continue;
    }
    if (!r.ok) {
      let message = `HTTP ${r.status}`;
      try { const j: any = JSON.parse(text); if (typeof j.message === 'string') message = j.message; } catch (e) {}
      throw new ApiError(r.status, message);
    }
    return text.length > 0 ? JSON.parse(text) : null;
  }
}
