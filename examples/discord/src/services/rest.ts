// The HTTP API: every request carries the token and the client identity. A 429 waits retry_after and tries once more.
// ponytail: one retry, no per-bucket accounting yet (ZN-867 adds the buckets from the X-RateLimit-* headers).
import { API_BASE, USER_AGENT, LOCALE } from '../constants';
import { superProperties } from './identity';

export class ApiError extends Error {
  status: i32;
  constructor(status: i32, message: string) { super(message); this.status = status; }
}

let token = '';
export function setToken(t: string): void { token = t; }

function headers(json: boolean): [string, string][] {
  const h: [string, string][] = [['Authorization', token], ['User-Agent', USER_AGENT], ['X-Super-Properties', superProperties],
    ['X-Discord-Locale', LOCALE], ['Accept', '*/*']];
  if (json) h.push(['Content-Type', 'application/json']);
  return h;
}

const sleep = (ms: number): Promise<void> => new Promise<void>((done: () => void) => { setTimeout(done, ms); });

export async function api(method: string, path: string, body: any = undefined): Promise<any> {
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(API_BASE + path, { method: method, headers: headers(body !== undefined), body: body !== undefined ? JSON.stringify(body) : undefined });
    if (r.status === 429 && attempt === 0) {
      const j: any = await r.json();
      await sleep(Math.ceil((j.retry_after ?? 1) * 1000));
      continue;
    }
    if (r.status === 204) return null;
    const text = await r.text();
    if (!r.ok) {
      let message = `HTTP ${r.status}`;
      try { const j: any = JSON.parse(text); if (typeof j.message === 'string') message = j.message; } catch (e) {}
      throw new ApiError(r.status, message);
    }
    return text.length > 0 ? JSON.parse(text) : null;
  }
}
