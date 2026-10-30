// The safety model's logic without a clock, a network or a window (tests/rate-limits.ts checks it): sliding windows, the budgets and
// cooldowns of layer 3, the spam checks of layer 2, Discord's per-route buckets and the plain sentences of its refusals (layer 5).
// index.ts is the guard that runs it; nothing else in the app imports this file.
import { Rule, RULES, GLOBAL_PER_MINUTE, GLOBAL_PER_HOUR, COOLDOWN_MS, COOLDOWN_MAX_MS, STRIKES_FORGOTTEN_MS,
  MENTIONS_MAX, LINKS_MAX, SAME_TEXT_MS, SHORT_TEXT, SHORT_REPEATS } from './policy';

/** A sliding window: what was counted in the last `ms`. */
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

const secs = (ms: number): i32 => Math.max(1, Math.ceil(ms / 1000));

class Track {
  last: number = -1e15; minute: Window; hour: Window; strikes: i32 = 0; lastStrike: number = -1e15; until: number = 0;
  constructor(perMinute: i32, perHour: i32) { this.minute = new Window(perMinute, 60000); this.hour = new Window(perHour, 3600000); }
}

/** Layer 3: each kind's budget (interval, a minute, an hour), the global one, and the cooldowns that double with each refusal in a row. */
export class Budgets {
  private tracks: Map<string, Track> = new Map<string, Track>();
  private global: Track = new Track(GLOBAL_PER_MINUTE, GLOBAL_PER_HOUR);

  private track(kind: string): Track {
    const t = this.tracks.get(kind);
    if (t !== undefined) return t;
    const r = RULES.get(kind) as Rule;
    const n = new Track(r.perMinute, r.perHour);
    this.tracks.set(kind, n);
    return n;
  }
  /** One refusal more ('' : the whole client's): returns the cooldown it starts. */
  strike(kind: string, now: number): number {
    const t = kind === '' ? this.global : this.track(kind);
    if (now - t.lastStrike > STRIKES_FORGOTTEN_MS) t.strikes = 0;
    t.strikes++; t.lastStrike = now;
    const wait = Math.min(COOLDOWN_MS * Math.pow(2, t.strikes - 1), COOLDOWN_MAX_MS);
    t.until = Math.max(t.until, now + wait);
    return wait;
  }
  /** The kind's interval starts again (typing: the next message's first key sends it at once). */
  again(kind: string): void { this.track(kind).last = -1e15; }
  /** How long the kind waits (its cooldown or the client's), 0 when it may go. */
  waitMs(kind: string, now: number): number { return Math.max(0, this.track(kind).until - now, this.global.until - now); }

  /** '' when one request of the kind may go now (and counts it), else why not. `human`: a person's input just now; `front`: the window in
   *  front; `safe`: safe mode; `scripted`: a test session against the fake Discord (no person, no pace between its steps: the intervals
   *  of the actions are not checked, the caps are). */
  check(kind: string, now: number, human: boolean, front: boolean, safe: boolean, scripted: boolean): string {
    const r = RULES.get(kind);
    if (r === undefined) return `Not sent: "${kind}" is not something this client does.`;
    if (safe && !r.essential) return 'Not sent: safe mode.';
    if (!scripted && r.human && !human) return 'Not sent: only something you do yourself (a key or a click in this window) sends this.';
    if (!scripted && r.focused && !front) return 'Not sent: this window is not in front.';
    const t = this.track(kind), g = this.global;
    const wait = this.waitMs(kind, now);
    if (wait > 0) return `Slow down: wait ${secs(wait)} s.`;
    const soon = (!scripted || r.quiet) && now - t.last < r.gapMs;
    if (soon || t.minute.count(now) >= r.perMinute || t.hour.count(now) >= r.perHour)
      return r.quiet ? 'Not sent: too soon.' : `Slow down: wait ${secs(this.strike(kind, now))} s.`;
    if (g.minute.count(now) >= GLOBAL_PER_MINUTE || g.hour.count(now) >= GLOBAL_PER_HOUR) return `Slow down: wait ${secs(this.strike('', now))} s.`;
    t.last = now; t.minute.add(now); t.hour.add(now); g.minute.add(now); g.hour.add(now);
    return '';
  }
}

class Sent { text = ''; channel = ''; at: number = 0; }
/** The near-same form of a text: lower case, without spaces and ASCII punctuation ("Hello, World!" and "hello world" are the same). */
export const sameText = (t: string): string => t.toLowerCase().replace(/[\s!-\/:-@\[-`{-~]+/g, '');

/** Layer 2, the text of a message: repeated (in one channel or pasted in several), too many mentions or links. */
export class Spam {
  private sent: Sent[] = [];
  /** '' when the text may go to the channel, else why not; an edit is not compared with what was sent. */
  check(text: string, channel: string, now: number, edit: boolean): string {
    const mentions = text.match(/<@[!&]?\d+>|@everyone|@here/g);
    if (mentions !== null && mentions.length > MENTIONS_MAX) return `Not sent: a message mentions ${MENTIONS_MAX} people or roles at most here.`;
    const links = text.match(/https?:\/\//g);
    if (links !== null && links.length > LINKS_MAX) return `Not sent: a message holds ${LINKS_MAX} links at most here.`;
    if (edit) return '';
    this.sent = this.sent.filter((s: Sent) => now - s.at < SAME_TEXT_MS);
    const same = sameText(text);
    if (same.length >= SHORT_TEXT) {
      for (const s of this.sent) if (s.text === same)
        return s.channel === channel ? 'Not sent: you sent this message already.' : 'Not sent: the same message in several conversations looks like spam.';
    } else if (same !== '') {
      let n = 0;
      for (const s of this.sent) if (s.text === same && s.channel === channel && now - s.at < 60000) n++;
      if (n >= SHORT_REPEATS - 1) return 'Not sent: you sent this message already.';
    }
    return '';
  }
  /** A message's text sent: the next ones are compared with it. */
  remember(text: string, channel: string, now: number): void {
    if (text === '') return;
    const s = new Sent();
    s.text = sameText(text); s.channel = channel; s.at = now;
    this.sent.push(s);
  }
}

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

class Bucket { remaining: i32 = 1; resetAt: number = 0; }
/** Discord's per-route buckets, learnt from X-RateLimit-Bucket, -Remaining, -Reset-After (one per bucket and major id). */
export class Buckets {
  private ofRoute: Map<string, string> = new Map<string, string>();   // route -> bucket hash
  private all: Map<string, Bucket> = new Map<string, Bucket>();       // hash + major id -> what is left
  globalUntil: number = 0;
  private find(route: string): Bucket | null {
    const hash = this.ofRoute.get(route);
    const b = this.all.get(hash !== undefined ? hash + ' ' + route.split('/')[2] : route);
    return b !== undefined ? b : null;
  }
  /** 0 when the route may go now, else the time to wait for its bucket (or Discord's global limit). */
  wait(route: string, now: number): number {
    const b = this.find(route);
    if (b !== null && b.remaining <= 0 && now >= b.resetAt) b.remaining = 1;   // reset: let one through, its answer says how many
    const until = Math.max(this.globalUntil, b !== null && b.remaining <= 0 ? b.resetAt : 0);
    return until > now ? until - now : 0;
  }
  /** The route goes: one less in its bucket. */
  take(route: string): void { const b = this.find(route); if (b !== null) b.remaining--; }
  learn(route: string, hash: string, remaining: i32, resetAfterS: number, now: number): void {
    if (hash === '') return;
    this.ofRoute.set(route, hash);
    const key = hash + ' ' + route.split('/')[2];
    const known = this.all.get(key);
    const b = known !== undefined ? known : new Bucket();
    b.remaining = remaining; b.resetAt = now + resetAfterS * 1000;
    this.all.set(key, b);
  }
  /** A 429 on the route: false when its bucket is unknown (the caller waits itself). */
  empty(route: string, until: number): boolean {
    const b = this.find(route);
    if (b === null) return false;
    b.remaining = 0; b.resetAt = until;
    return true;
  }
}

const captcha = (body: any): boolean => body !== null && body !== undefined && (body.captcha_key !== undefined || body.captcha_sitekey !== undefined);
/** 403 with JSON code 40002 or 50178: the account must be verified first. */
function verification(status: i32, body: any): boolean {
  return status === 403 && body !== null && body !== undefined && (body.code === 40002 || body.code === 50178);
}
/** The plain sentence for a refused request, from its status and body ('' when the API's own message says it best). */
export function plainError(status: i32, body: any, retryAfter: number): string {
  if (captcha(body)) return 'Discord asks for a captcha, which this client does not show: log in with the QR code, or once in the official Discord app.';
  if (status === 401) return 'Discord refused the token: log in again.';
  if (verification(status, body)) return 'Discord wants this account verified (email or phone): do it in the official Discord app, then try again here.';
  if (status === 429) return `Discord is limiting how fast this client can go: try again in ${Math.max(1, Math.ceil(retryAfter))} s.`;
  return '';
}
/** Whether a refused request puts the client in safe mode: a 401, a verification or a captcha asked for, or a 429 the client did not
 *  retry (a long wait, or the third in a row). */
export function startsSafeMode(status: i32, body: any, retried: boolean): boolean {
  if (status === 401 || verification(status, body) || captcha(body)) return true;
  return status === 429 && !retried;
}
