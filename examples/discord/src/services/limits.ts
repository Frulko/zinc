// Discord's limits that are not per route (docs/reports/discord-client-requests.md): a sliding window counts what was done in the last
// `ms`, for the global 50 requests a second, the 10,000 refused requests (401, 403, 429) in 10 minutes, and the gateway's 120 sends a minute.
// Kept apart from rest.ts and gateway.ts so tests/rate-limits.ts checks the logic without a network.

export class Window {
  private at: number[] = [];
  limit: i32;
  ms: number;
  constructor(limit: i32, ms: number) { this.limit = limit; this.ms = ms; }
  private drop(now: number): void { while (this.at.length > 0 && this.at[0] <= now - this.ms) this.at.shift(); }
  /** How many were counted in the window ending now. */
  count(now: number): i32 { this.drop(now); return this.at.length; }
  /** 0 when one more fits now (and counts it), else how many ms to wait before asking again. */
  take(now: number): number {
    this.drop(now);
    if (this.at.length < this.limit) { this.at.push(now); return 0; }
    return this.at[0] + this.ms - now;
  }
  /** Counts one that happened whatever the limit (a refused request, a heartbeat that must go). */
  add(now: number): void { this.drop(now); this.at.push(now); }
  clear(): void { this.at = []; }
}

/** The plain sentence for a refused request, from its status and body ('' when the API's own message says it best). */
export function plainError(status: i32, body: any, retryAfter: number): string {
  const captcha = body !== null && body !== undefined && (body.captcha_key !== undefined || body.captcha_sitekey !== undefined);
  if (captcha) return 'Discord asks for a captcha: do this once in the official Discord app, then try again here.';
  if (status === 401) return 'Discord refused the token: log in again.';
  if (verification(status, body)) return 'Discord wants this account verified (email or phone): do it in the official Discord app, then try again here.';
  if (status === 429) return `Discord is limiting how fast this client can go: try again in ${Math.max(1, Math.ceil(retryAfter))} s.`;
  return '';
}

/** 403 with JSON code 40002 or 50178: the account must be verified first. */
function verification(status: i32, body: any): boolean {
  return status === 403 && body !== null && body !== undefined && (body.code === 40002 || body.code === 50178);
}
/** Whether a refused request puts the client in safe mode (background requests stop, the user is told): a 401, a verification or a
 *  captcha asked for, or a 429 the client did not retry (a long wait, or the third in a row). */
export function startsSafeMode(status: i32, body: any, retried: boolean): boolean {
  if (status === 401 || verification(status, body)) return true;
  if (body !== null && body !== undefined && (body.captcha_key !== undefined || body.captcha_sitekey !== undefined)) return true;
  return status === 429 && !retried;
}
