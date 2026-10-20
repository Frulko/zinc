// Tokens, context and cost of the turns, and the plans' usage limits, as each CLI reports them (checked on the real CLIs on
// 2026-10-20, read-only, in a temporary folder):
//
// - Claude Code 2.1.304 streams each model call's usage (`message_start`, then `message_delta` with the final output count) and
//   ends with `result`: `total_cost_usd` and `modelUsage[model]` (tokens with the subagents', `costUSD`, `contextWindow`). A
//   `rate_limit_event` carries the plan's windows (`unifiedWindows.five_hour` / `seven_day`: utilization 0..1, resetsAt in
//   seconds). `claude -p /usage --output-format json` prints the same windows as text without a model call (num_turns 0, cost 0).
// - Codex 0.162 prints the turn's usage once, at `turn.completed` (input_tokens counts the cached ones too); no cost, no model,
//   no window: the window comes from its model catalog (`codex debug models`: context_window). Its app server answers
//   `account/rateLimits/read` (primary / secondary windows: usedPercent, windowDurationMins, resetsAt) without a model call.
// - opencode 2.0 prints each step's tokens and cost at `step_finish`; no model, no window, and no plan limits anywhere.

export const COST_NONE = 0, COST_REPORTED = 1, COST_ESTIMATE = 2;

export class Usage {
  input: number = 0;        // uncached input tokens
  output: number = 0;
  cacheRead: number = 0;
  cacheWrite: number = 0;
  cost: number = 0;         // USD
  costKind: i32 = COST_NONE;
  /** The prompt of the latest model call (input with its cache): what fills the context window. */
  context: number = 0;
  /** The model's context window, 0 unknown. */
  window: number = 0;

  add(u: Usage): void {
    this.input += u.input; this.output += u.output; this.cacheRead += u.cacheRead; this.cacheWrite += u.cacheWrite;
    this.cost += u.cost;
    if (u.costKind > this.costKind) this.costKind = u.costKind;
    if (u.context > 0) this.context = u.context;
    if (u.window > 0) this.window = u.window;
  }
  copy(): Usage { const u = new Usage(); u.add(this); u.context = this.context; u.window = this.window; return u; }
  empty(): boolean { return this.input + this.output + this.cacheRead + this.cacheWrite === 0 && this.cost === 0; }
  /** The share of the window the latest call filled, 0..100; -1 unknown. */
  contextPercent(): number { return this.window > 0 && this.context > 0 ? Math.min(100, this.context * 100 / this.window) : -1; }

  json(): any {
    return { i: this.input, o: this.output, cr: this.cacheRead, cw: this.cacheWrite, c: this.cost, k: this.costKind, x: this.context, w: this.window };
  }
}

export function usageOf(j: any): Usage {
  const u = new Usage();
  if (j === undefined || j === null) return u;
  u.input = num(j.i); u.output = num(j.o); u.cacheRead = num(j.cr); u.cacheWrite = num(j.cw); u.cost = num(j.c);
  u.costKind = num(j.k) as i32; u.context = num(j.x); u.window = num(j.w);
  return u;
}

export function num(v: any): number { return v === undefined || v === null ? 0 : (v as number); }

/** The usage of one model call (a step), or of a turn, by the names each CLI gives its fields. */
export function claudeCall(u: any): Usage {
  const r = new Usage();
  r.input = num(u.input_tokens); r.output = num(u.output_tokens);
  r.cacheRead = num(u.cache_read_input_tokens); r.cacheWrite = num(u.cache_creation_input_tokens);
  r.context = r.input + r.cacheRead + r.cacheWrite;
  return r;
}
/** Codex's `turn.completed` usage: input_tokens counts the cached input. */
export function codexTurn(u: any): Usage {
  const r = new Usage();
  r.cacheRead = num(u.cached_input_tokens); r.cacheWrite = num(u.cache_write_input_tokens);
  r.input = Math.max(0, num(u.input_tokens) - r.cacheRead);
  r.output = num(u.output_tokens);
  // ponytail: a turn of several model calls sums their prompts, so this overstates the context then; Codex's exec stream has no per-call usage
  r.context = num(u.input_tokens) + r.cacheWrite;
  return r;
}
/** opencode's `step_finish` part: tokens {input, output, reasoning, cache {read, write}} and cost. */
export function opencodeStep(p: any): Usage {
  const r = new Usage();
  const t = p.tokens;
  if (t !== undefined && t !== null) {
    r.input = num(t.input); r.output = num(t.output) + num(t.reasoning);
    if (t.cache !== undefined && t.cache !== null) { r.cacheRead = num(t.cache.read); r.cacheWrite = num(t.cache.write); }
  }
  r.context = r.input + r.cacheRead + r.cacheWrite;
  if (num(p.cost) > 0) { r.cost = num(p.cost); r.costKind = COST_REPORTED; }   // 0: a plan or a model it has no price for
  return r;
}

/** USD per million tokens [input, cached input, output] for the models whose list price is known here.
 *  ponytail: a few OpenAI list prices for a cost estimate where the CLI reports none (Codex); a model not in it shows no cost.
 *  The upgrade is a price list the user can edit. */
const PRICES: Map<string, number[]> = new Map<string, number[]>();
PRICES.set('gpt-5', [1.25, 0.125, 10]); PRICES.set('gpt-5-codex', [1.25, 0.125, 10]);
PRICES.set('gpt-5-mini', [0.25, 0.025, 2]); PRICES.set('gpt-5-nano', [0.05, 0.005, 0.4]);

/** Fills in an estimated cost for `model` when the CLI reported none and its price is known. */
export function estimate(u: Usage, model: string): void {
  if (u.costKind === COST_REPORTED) return;
  const p = PRICES.get(model);
  if (p === undefined) return;
  const k = p as number[];
  u.cost = ((u.input + u.cacheWrite) * k[0] + u.cacheRead * k[1] + u.output * k[2]) / 1e6;
  u.costKind = COST_ESTIMATE;
}

/** The context window of a model the CLI does not give one for, 0 unknown.
 *  ponytail: two families' current windows; the CLI's own figure (Claude's result, Codex's catalog) wins, and the previous turn's after it. */
export function knownWindow(model: string): number {
  const m = model.toLowerCase();
  if (m.indexOf('claude') >= 0 || m === 'opus' || m === 'sonnet' || m === 'haiku') return 200000;
  if (m.indexOf('gpt-5') >= 0) return 272000;
  return 0;
}

/** 950 → `950`, 12 400 → `12.4k`, 1 200 000 → `1.2M`. */
export function tokens(n: number): string {
  if (n < 1000) return `${Math.round(n)}`;
  if (n < 1e6) return `${(n / 1000).toFixed(n < 10000 ? 1 : 0)}k`.replace('.0k', 'k');
  return `${(n / 1e6).toFixed(1)}M`.replace('.0M', 'M');
}
/** `$0.042`, `≈ $0.04`, '' when no cost is known. */
export function money(u: Usage): string {
  if (u.costKind === COST_NONE) return '';
  const v = u.cost < 0.1 ? u.cost.toFixed(3) : u.cost.toFixed(2);
  return (u.costKind === COST_ESTIMATE ? '≈ $' : '$') + v;
}
/** `↑12.4k ↓1.8k · ctx 23% · $0.042`: input (with its cache) and output tokens, the context filled, the cost. */
export function usageLabel(u: Usage): string {
  const parts = [`↑${tokens(u.input + u.cacheRead + u.cacheWrite)} ↓${tokens(u.output)}`];
  const p = u.contextPercent();
  if (p >= 0) parts.push(`ctx ${Math.round(p)}%`); else if (u.context > 0) parts.push(`ctx ${tokens(u.context)}`);
  const m = money(u);
  if (m !== '') parts.push(m);
  return parts.join(' · ');
}

// ---- plan limits ----

/** One window of a plan's usage limits: `5-hour session` 8% used, resetting at `resets` (epoch ms, 0 unknown). */
export class Limit {
  name: string;
  used: number;
  resets: number;
  constructor(name: string, used: number, resets: number) { this.name = name; this.used = used; this.resets = resets; }
}

/** Claude's `rate_limit_event`: its unified windows (utilization 0..1). */
export function claudeLimits(info: any): Limit[] {
  const out: Limit[] = [];
  const w = info.unifiedWindows;
  if (w === undefined || w === null) return out;
  if (w.five_hour !== undefined && w.five_hour !== null) out.push(new Limit('5-hour session', num(w.five_hour.utilization) * 100, num(w.five_hour.resetsAt) * 1000));
  if (w.seven_day !== undefined && w.seven_day !== null) out.push(new Limit('Week', num(w.seven_day.utilization) * 100, num(w.seven_day.resetsAt) * 1000));
  return out;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The text of `claude -p /usage`: `Current session: 8% used · resets Oct 20 at 12:59pm (Europe/Paris)` per window, seen at
 *  `now` (epoch ms). The reset is read as local time; the text gives no year: the next such date (a reset is never past). */
export function claudeUsageText(text: string, now: number): Limit[] {
  const year = new Date(now).getFullYear();
  const out: Limit[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line.startsWith('Current ')) continue;
    const colon = line.indexOf(':'), pct = line.indexOf('% used');
    if (colon < 0 || pct < 0) continue;
    let name = line.slice(8, colon);
    name = name === 'session' ? '5-hour session' : name === 'week (all models)' ? 'Week' : 'Week' + name.slice(4);
    const used = parseFloat(line.slice(colon + 1, pct).trim());
    if (isNaN(used)) continue;
    const r = line.indexOf('resets ');
    let at = r < 0 ? 0 : resetTime(line.slice(r + 7), year);
    if (at > 0 && at < now - 86400000) at = resetTime(line.slice(r + 7), year + 1);   // December, a reset in January
    out.push(new Limit(name, used, at));
  }
  return out;
}
/** `Oct 20 at 12:59pm (Europe/Paris)` or `Oct 25 at 12pm` → epoch ms, local time; 0 when it does not read. */
function resetTime(s: string, year: number): number {
  const w = s.split(' ');
  if (w.length < 4) return 0;
  const mo = MONTHS.indexOf(w[0]), day = parseInt(w[1]);
  let t = w[3].toLowerCase();
  const pm = t.endsWith('pm'), am = t.endsWith('am');
  if (!pm && !am) return 0;
  t = t.slice(0, t.length - 2);
  const hm = t.split(':');
  let h = parseInt(hm[0]);
  const m = hm.length > 1 ? parseInt(hm[1]) : 0;
  if (mo < 0 || isNaN(day) || isNaN(h) || isNaN(m)) return 0;
  if (pm && h < 12) h += 12;
  if (am && h === 12) h = 0;
  return new Date(year, mo, day, h, m, 0, 0).getTime();
}

/** Codex's `account/rateLimits/read` answer: the primary and secondary windows of its rate limits. */
export function codexLimits(result: any): Limit[] {
  const out: Limit[] = [];
  const r = result.rateLimits;
  if (r === undefined || r === null) return out;
  for (const w of [r.primary, r.secondary]) {
    if (w === undefined || w === null) continue;
    const mins = num(w.windowDurationMins);
    const name = mins === 300 ? '5-hour session' : mins === 10080 ? 'Week' : mins >= 1440 ? `${Math.round(mins / 1440)}-day window` : `${Math.round(mins / 60)}-hour window`;
    out.push(new Limit(name, num(w.usedPercent), num(w.resetsAt) * 1000));
  }
  return out;
}

/** `in 2 h 14 min`, `in 3 d`, `now` for a reset at `at` (epoch ms) seen at `now`. */
export function resetsIn(at: number, now: number): string {
  if (at <= 0) return 'reset time unknown';
  const m = Math.round((at - now) / 60000);
  if (m <= 0) return 'resets now';
  if (m < 60) return `resets in ${m} min`;
  if (m < 48 * 60) return `resets in ${Math.floor(m / 60)} h ${m % 60} min`;
  return `resets in ${Math.round(m / 1440)} d`;
}

/** The refresh interval of the limits, in minutes, as Settings takes it: whole minutes from 1 to 60, 5 by default. */
export const REFRESH_DEFAULT = 5, REFRESH_MIN = 1, REFRESH_MAX = 60;
export function refreshMinutes(v: any): i32 {
  if (v === undefined || v === null) return REFRESH_DEFAULT;
  const n = Math.round(v as number);
  return isNaN(n) ? REFRESH_DEFAULT : Math.max(REFRESH_MIN, Math.min(REFRESH_MAX, n)) as i32;
}

// ---- the activity line ----

/** What the agent does while no tool runs, rotated every few seconds as Claude Code does. */
export const THINKING_VERBS = ['Thinking', 'Cogitating', 'Pondering', 'Mulling', 'Reasoning', 'Working'];
const VERB_MS = 3000;

/** The activity line of a running turn: `Reading src/app.ts…` for the latest running tool (its name and summary), else a
 *  thinking verb that changes every few seconds of `elapsed` (ms). */
export function activityText(tool: string, summary: string, elapsed: number): string {
  if (tool === '') return THINKING_VERBS[Math.floor(elapsed / VERB_MS) % THINKING_VERBS.length] + '…';
  const t = tool.toLowerCase();
  const verb = t === 'read' || t === 'view' ? 'Reading' : t === 'bash' || t === 'shell' ? 'Running'
    : t === 'edit' || t === 'write' || t === 'multiedit' || t === 'patch' ? 'Editing'
    : t === 'grep' || t === 'glob' || t === 'search' || t === 'list' || t === 'ls' ? 'Searching'
    : t === 'agent' || t === 'task' ? 'Delegating' : t === 'webfetch' || t === 'fetch' ? 'Fetching'
    : t === 'websearch' || t === 'web_search' ? 'Searching the web' : `Using ${tool}`;
  return summary === '' ? `${verb}…` : `${verb} ${summary}…`;
}

/** `Used 12 tools · 3 agents · 41 s`: a finished turn's activity, folded. */
export function summaryText(tools: i32, agents: i32, took: string): string {
  const parts = [tools === 1 ? 'Used 1 tool' : `Used ${tools} tools`];
  if (agents > 0) parts.push(agents === 1 ? '1 agent' : `${agents} agents`);
  if (took !== '') parts.push(took);
  return parts.join(' · ');
}

/** The names of a JSON object's own fields, in order. ponytail: Zinc has no Object.keys yet, so they are read from
 *  JSON.stringify of the object (as examples/notify-relay does); fine for modelUsage's few entries. */
export function keysOf(o: any): string[] {
  const t = JSON.stringify(o);
  const keys: string[] = [];
  let depth = 0, i = 0;
  while (i < t.length) {
    const c = t.charCodeAt(i);
    if (c === 34) {
      let j = i + 1;
      while (j < t.length && t.charCodeAt(j) !== 34) j += t.charCodeAt(j) === 92 ? 2 : 1;
      if (depth === 1 && j + 1 < t.length && t.charCodeAt(j + 1) === 58) keys.push(JSON.parse(t.slice(i, j + 1)) as string);
      i = j + 1;
      continue;
    }
    if (c === 123 || c === 91) depth++;
    else if (c === 125 || c === 93) depth--;
    i++;
  }
  return keys;
}

// ---- opencode's own record of a turn ----

/** A turn's usage, in all and by model. */
export class TurnUsage {
  total: Usage = new Usage();
  byModel: Map<string, Usage> = new Map<string, Usage>();
}

/** opencode's assistant messages created at `since` (epoch ms) or later, from its server's `GET /api/session/<id>/message`
 *  (a read of the local session, no model call): the turn's tokens and cost, in all and by `provider/model`. `run --format json`
 *  prints no step_finish for a turn's last step, so the stream alone misses it. null when no such message holds tokens. */
export function opencodeMessages(j: any, since: number): TurnUsage | null {
  const r = new TurnUsage();
  const list = j.data;
  if (list === undefined || list === null) return null;
  let found = false;
  for (const m of list) {
    if ('' + m.type !== 'assistant' || m.tokens === undefined || m.tokens === null) continue;
    if (m.time === undefined || num(m.time.created) < since) continue;
    const u = opencodeStep(m);   // the same fields as a step_finish part: tokens {…}, cost
    const name = m.model !== undefined && m.model !== null ? `${m.model.providerID}/${m.model.id}` : '';
    const was = r.byModel.get(name);
    const sum = was === undefined ? new Usage() : (was as Usage).copy();
    sum.add(u);
    r.byModel.set(name, sum);
    r.total.add(u);
    found = true;
  }
  return found ? r : null;
}
