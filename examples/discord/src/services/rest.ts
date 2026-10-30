// The HTTP transport: one request to the API with the token and the client identity, nothing more. Only the guard (src/safety) calls
// it: every limit, retry, cache and refusal of the client is there (docs/reports/discord-safety-model.md).
import { API_BASE, USER_AGENT, LOCALE } from '../constants';
import { superProperties } from './identity';

export class ApiError extends Error {
  status: i32;
  /** The answer's JSON (null when there was none): the form errors of a login. */
  body: any;
  constructor(status: i32, message: string, body: any = null) { super(message); this.status = status; this.body = body; }
}

let token = '';
export function setToken(t: string): void { token = t; }

function headers(json: boolean): [string, string][] {
  const h: [string, string][] = token !== '' ? [['Authorization', token]] : [];   // a login has no token yet
  h.push(['User-Agent', USER_AGENT]); h.push(['X-Super-Properties', superProperties]); h.push(['X-Discord-Locale', LOCALE]); h.push(['Accept', '*/*']);
  if (json) h.push(['Content-Type', 'application/json']);
  return h;
}

/** Sends one request as it is (the guard decided it may go). */
export function transport(method: string, path: string, body: any): Promise<Response> {
  return fetch(API_BASE + path, { method: method, headers: headers(body !== undefined), body: body !== undefined ? JSON.stringify(body) : undefined });
}
