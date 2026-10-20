// Tokens, context, cost and plan limits as the real CLIs reported them on 2026-10-20 (tests/fixtures/usage-*, limits-*: captured
// in a temporary folder, ids redacted), the activity line's texts and the limits' refresh interval; opencode's models and a Go
// turn's usage as its local server lists them.
import * as assert from 'zinc:assert';
import * as fs from 'zinc:fs';
import { AGENTS, Agent, AgentEvent, ParseState, EV_USAGE, EV_LIMITS, EV_DONE, opencodeModels, ModelChoice, TurnSettings, MODE_READ, goKeyOf } from '../src/services/agents';
import {
  Usage, Limit, COST_NONE, COST_REPORTED, COST_ESTIMATE, estimate, usageLabel, tokens, money, claudeUsageText, codexLimits,
  resetsIn, refreshMinutes, REFRESH_DEFAULT, REFRESH_MIN, REFRESH_MAX, activityText, summaryText, knownWindow, usageOf, opencodeMessages, TurnUsage, goLimits, GoUsage,
} from '../src/services/usage';
import { Item, Transcript, K_USER, K_TURN, K_TEXT, K_TOOL } from '../src/services/transcript';

function eventsOf(a: Agent, file: string): AgentEvent[] {
  const out: AgentEvent[] = [];
  const st = new ParseState();
  for (const line of fs.readText('tests/fixtures/' + file).split('\n')) {
    if (line === '') continue;
    a.parse(line, st, (e: AgentEvent) => out.push(e));
  }
  return out;
}
function of(es: AgentEvent[], kind: i32): AgentEvent[] { return es.filter((e: AgentEvent) => e.kind === kind); }
function last(es: AgentEvent[]): Usage { const u = of(es, EV_USAGE); return u[u.length - 1].usage as Usage; }

// Claude Code 2.1.304: each call's usage streams, the result gives the cost, the split by model and the window
const claude = eventsOf(AGENTS[0], 'usage-claude-2026-10-20.jsonl');
const live = of(claude, EV_USAGE)[0].usage as Usage;
assert.equal(live.input, 2);
assert.equal(live.cacheRead, 11227);
assert.equal(live.cacheWrite, 21799);
assert.equal(live.costKind, COST_NONE, 'no cost before the result');
const cu = last(claude);
assert.equal(cu.output, 4);
assert.equal(cu.cost, 0.0883627);
assert.equal(cu.costKind, COST_REPORTED);
assert.equal(cu.window, 1000000, "the window of modelUsage");
assert.equal(cu.context, 2 + 11227 + 21799, 'the context is the last call\'s prompt with its cache');
assert.equal(Math.round(cu.contextPercent() * 10), 33);
const split = of(claude, EV_USAGE)[of(claude, EV_USAGE).length - 1].byModel as Map<string, Usage>;
assert.equal(split.size, 1);
assert.equal((split.get('claude-sonnet-5-5') as Usage).cost, 0.0883627);
assert.equal(usageLabel(cu), '↑33k ↓4 · ctx 3% · $0.088');
const cl = of(claude, EV_LIMITS)[0].limits as Limit[];
assert.equal(cl.length, 2);
assert.equal(cl[0].name, '5-hour session');
assert.equal(cl[0].used, 8);
assert.equal(cl[0].resets, 1792494000000);
assert.equal(cl[1].name, 'Week');
assert.equal(cl[1].used, 22);
assert.ok(of(claude, EV_USAGE).indexOf(of(claude, EV_USAGE)[0]) >= 0 && of(claude, EV_DONE).length === 1);

// `claude -p /usage --output-format json --no-session-persistence`: a local command (no model call: num_turns 0, no cost,
// no API time), the windows as text (the capture keeps them, not the breakdown of the user's sessions that follows)
const OCT20 = new Date(2026, 9, 20, 11, 0, 0, 0).getTime();   // when it was captured
const page = JSON.parse(fs.readText('tests/fixtures/limits-claude-usage-2026-10-20.json'));
assert.equal('' + page.local_command, 'usage');
assert.equal(page.num_turns as i32, 0);
assert.equal(page.total_cost_usd as number, 0);
assert.equal(page.duration_api_ms as number, 0);
const text = claudeUsageText('' + page.result, OCT20);
assert.equal(text.length, 3);
assert.equal(text[0].name, '5-hour session');
assert.equal(text[0].used, 12);
assert.equal(text[0].resets, new Date(2026, 9, 20, 13, 0, 0, 0).getTime(), '1pm');
assert.equal(text[1].name, 'Week');
assert.equal(text[1].used, 23);
assert.equal(text[1].resets, new Date(2026, 9, 25, 12, 0, 0, 0).getTime(), '12pm is noon');
assert.equal(text[2].name, 'Week (Fable)');
assert.equal(text[2].used, 0);
// the form with minutes, as an earlier answer of the same day had it
assert.equal(claudeUsageText('Current session: 8% used · resets Oct 20 at 12:59pm (Europe/Paris)', OCT20)[0].resets, new Date(2026, 9, 20, 12, 59, 0, 0).getTime());
assert.equal(claudeUsageText('Current week (all models): 5% used · resets Oct 25 at 12am', OCT20)[0].resets, new Date(2026, 9, 25, 0, 0, 0, 0).getTime(), '12am is midnight');
assert.equal(claudeUsageText('Current week (all models): 5% used · resets Jan 2 at 9am', new Date(2026, 11, 30, 10, 0, 0, 0).getTime())[0].resets,
  new Date(2027, 0, 2, 9, 0, 0, 0).getTime(), 'a reset after new year is next year');

// Codex 0.162: the turn's usage once, input counting the cached part; no cost: estimated from a list price when one is known
const codex = eventsOf(AGENTS[1], 'usage-codex-2026-10-20.jsonl');
const xu = last(codex);
assert.equal(xu.input, 21320 - 12288);
assert.equal(xu.cacheRead, 12288);
assert.equal(xu.output, 5);
assert.equal(xu.context, 21320);
assert.equal(xu.costKind, COST_NONE);
estimate(xu, 'gpt-unknown');
assert.equal(xu.costKind, COST_NONE, 'no price made up for a model not in the table');
estimate(xu, 'gpt-5');
assert.equal(xu.costKind, COST_ESTIMATE);
assert.equal(Math.round(xu.cost * 1e6), Math.round(9032 * 1.25 + 12288 * 0.125 + 5 * 10));
assert.ok(money(xu).startsWith('≈ $'), 'an estimate says so');
xu.window = 272000;
assert.equal(usageLabel(xu), '↑21k ↓5 · ctx 8% · ≈ $0.013');
// its app server's account/rateLimits/read: a weekly primary window, no secondary
const cx = codexLimits(JSON.parse(fs.readText('tests/fixtures/limits-codex-appserver-2026-10-20.json')).result);
assert.equal(cx.length, 1);
assert.equal(cx[0].name, 'Week');
assert.equal(cx[0].used, 0);
assert.equal(cx[0].resets, 1793082770000);
assert.equal(codexLimits(JSON.parse('{"rateLimits":{"primary":{"usedPercent":41.5,"windowDurationMins":300,"resetsAt":10},"secondary":null}}'))[0].name, '5-hour session');

// opencode 2.0: each step's tokens; cost 0 (a plan) is no cost; no window in its stream
const oc = last(eventsOf(AGENTS[2], 'usage-opencode-2026-10-20.jsonl'));
assert.equal(oc.input, 12249);
assert.equal(oc.cacheRead, 571);
assert.equal(oc.output, 3);
assert.equal(oc.costKind, COST_NONE);
assert.equal(oc.window, 0);
assert.equal(usageLabel(oc), '↑13k ↓3 · ctx 13k');

// sums, persistence, numbers
const a = new Usage(); a.input = 10; a.output = 2; a.cost = 0.5; a.costKind = COST_REPORTED; a.context = 100; a.window = 1000;
const b = new Usage(); b.input = 5; b.context = 300;
const t = a.copy(); t.add(b);
assert.equal(t.input, 15);
assert.equal(t.context, 300, 'the context is the latest');
assert.equal(t.window, 1000);
assert.equal(t.contextPercent(), 30);
const back = usageOf(JSON.parse(JSON.stringify(t.json())));
assert.equal(back.input, 15); assert.equal(back.cost, 0.5); assert.equal(back.costKind, COST_REPORTED); assert.equal(back.window, 1000);
assert.equal(tokens(950), '950');
assert.equal(tokens(12400), '12k');
assert.equal(tokens(1240), '1.2k');
assert.equal(tokens(1000000), '1M');
assert.equal(knownWindow('claude-opus-5'), 200000);
assert.equal(knownWindow('prov/model-a'), 0);

// limits: reset times
assert.equal(resetsIn(0, 5), 'reset time unknown');
assert.equal(resetsIn(60000 * 30, 0), 'resets in 30 min');
assert.equal(resetsIn(60000 * 134, 0), 'resets in 2 h 14 min');
assert.equal(resetsIn(86400000 * 3, 0), 'resets in 3 d');

// the refresh interval: 5 minutes by default, whole minutes from 1 to 60
assert.equal(REFRESH_DEFAULT, 5);
assert.equal(refreshMinutes(JSON.parse('{}').limitsRefresh), 5);
assert.equal(refreshMinutes(JSON.parse('{"v":null}').v), 5);
assert.equal(refreshMinutes(0), REFRESH_MIN);
assert.equal(refreshMinutes(-4), 1);
assert.equal(refreshMinutes(500), REFRESH_MAX);
assert.equal(refreshMinutes(12.4), 12);

// the activity line: a rotating verb while the model thinks, what the running tool does, the summary once over
assert.equal(activityText('', '', 0), 'Thinking…');
assert.ok(activityText('', '', 3000) !== activityText('', '', 0), 'the verb turns every few seconds');
assert.equal(activityText('Read', 'src/app.ts', 0), 'Reading src/app.ts…');
assert.equal(activityText('Bash', 'npm test', 0), 'Running npm test…');
assert.equal(activityText('shell', '', 0), 'Running…');
assert.equal(activityText('Agent', 'Look around', 0), 'Delegating Look around…');
assert.equal(activityText('mcp_x', 'q', 0), 'Using mcp_x q…');
assert.equal(summaryText(12, 3, '41 s'), 'Used 12 tools · 3 agents · 41 s');
assert.equal(summaryText(1, 0, ''), 'Used 1 tool');

// a transcript read with the cards folded: the messages, headers and main paragraphs, not the calls nor a subagent's items
const tdir = fs.mkdtemp(fs.tmpdir() + '/agents-usage-');
const tr = new Transcript(tdir);
const kinds = [K_USER, K_TURN, K_TOOL, K_TEXT, K_TEXT];
for (let i = 0; i < kinds.length; i++) {
  const it = new Item(i, kinds[i], 1);
  it.name = i === 2 ? '"kind":3,' : 'x';   // a name that looks like the field is escaped in the line
  if (i === 4) it.depth = 1;
  it.setText(i === 0 ? 'say "depth":0, and "kind":3,' : `t${i}`);
  tr.write(it);
}
const turn = new Item(1, K_TURN, 1);
turn.tools = 1;
const tu = new Usage(); tu.input = 7; turn.setUsage(tu);
tr.write(turn);   // written again at its end: the last line wins
assert.equal(tr.read(0, 5).length, 5);
const shown = tr.read(0, 5, true);
assert.equal(shown.map((it: Item) => it.seq).join(','), '0,1,3');
assert.equal(shown[1].tools, 1);
assert.equal((shown[1].usage() as Usage).input, 7, "a turn's usage comes back from disk");
fs.remove(tdir, true);

// opencode 2.0.32 with an OpenCode Go model: the models and providers its local server lists (GET /api/model, /api/provider)
const ocm = opencodeModels(fs.readText('tests/fixtures/models-opencode-2026-10-20.json'), fs.readText('tests/fixtures/providers-opencode-2026-10-20.json'));
const ocBy = (id: string): ModelChoice => ocm.filter((m: ModelChoice) => m.id === id)[0];
assert.ok(ocm.length > 0);
const groups: string[] = [];
for (const m of ocm) if (groups.indexOf(m.group) < 0) groups.push(m.group);
assert.ok(groups.indexOf('OpenCode Go') >= 0 && groups.indexOf('Default / OpenCode') >= 0 && groups.indexOf('LM Studio (local)') >= 0, groups.join('|'));
for (let i = 1; i < ocm.length; i++) if (ocm[i].group !== ocm[i - 1].group) assert.ok(groups.indexOf(ocm[i].group) > groups.indexOf(ocm[i - 1].group), 'each provider together');
const glm = ocBy('opencode-go/glm-5.3-flash');
assert.equal(glm.group, 'OpenCode Go');
assert.ok(glm.window > 0 && glm.hint.indexOf('context') > 0 && glm.hint.indexOf('per M') > 0, glm.hint);
assert.ok(ocBy('opencode/minimax-m3.1-flash-free').hint.endsWith('free'), 'a free model says so');
assert.ok(ocBy('lmstudio/qwen/qwen3.6-35b-a3b').hint.indexOf('$') < 0, 'a local model has no price');
const withVariants = ocm.filter((m: ModelChoice) => m.efforts.length > 0);
assert.ok(withVariants.length > 0, 'variants are the efforts');
// the variant reaches the CLI after a #
const ts = new TurnSettings(MODE_READ, 'opencode-go/glm-5.3-flash', 'high', false);
const oa = AGENTS[2].args('hi', '', ts, [], '/tmp');
assert.equal(oa[oa.indexOf('--model') + 1], 'opencode-go/glm-5.3-flash#high');
assert.equal(AGENTS[2].limitsUrl(), 'https://opencode.ai/console', "Go's usage is on the website only");

// a Go turn's stream has no step_finish for its last step: the session's messages (GET /api/session/<id>/message) have it
const msgs = JSON.parse(fs.readText('tests/fixtures/messages-opencode-go-2026-10-20.json'));
const goUse = opencodeMessages(msgs, 0) as TurnUsage;
assert.ok(Math.abs(goUse.total.cost - 0.00197774) < 1e-9, '' + goUse.total.cost);
assert.equal(goUse.total.input, 12948);
assert.equal(goUse.total.output, 25, 'output and reasoning');
assert.equal(goUse.total.cacheRead, 768);
assert.equal(goUse.byModel.size, 1);
assert.equal((goUse.byModel.get('opencode-go/glm-5.3-flash') as Usage).input, 12948);
assert.equal(opencodeMessages(msgs, 1792488728073 + 1), null, 'messages before the turn are left out');
assert.equal(opencodeMessages(JSON.parse('{}'), 0), null);
const goTurn = eventsOf(AGENTS[2], 'go-opencode-2026-10-20.jsonl');
assert.ok(goTurn.length > 0);

// a Go model the workspace's privacy settings refuse: the error line's message is shown
const refused = eventsOf(AGENTS[2], 'error-opencode-go-2026-10-20.jsonl').filter((e: AgentEvent) => e.text.indexOf('Global regions') >= 0);
assert.ok(refused.length > 0, 'the provider refusal is shown');

// OpenCode Go's usage route (made-up numbers in its shape): three windows, one rate-limited; each refusal a short reason
const go = goLimits(200, '{"usage":{"rolling":{"status":"ok","percent":12,"resetsAt":"2030-01-01T05:00:00.000Z"},'
  + '"weekly":{"status":"rate-limited","percent":100,"resetsAt":"2030-01-06T00:00:00.000Z"},'
  + '"monthly":{"status":"ok","percent":33.4,"resetsAt":"2030-01-20T00:00:00.000Z"}}}');
assert.equal(go.error, '');
const gl = go.limits as Limit[];
assert.deepEqual(gl.map((x: Limit) => x.name), ['5-hour session', 'Week', 'Month']);
assert.deepEqual(gl.map((x: Limit) => x.used), [12, 100, 33.4]);
assert.deepEqual(gl.map((x: Limit) => x.limited), [false, true, false]);
assert.equal(gl[0].resets, Date.parse('2030-01-01T05:00:00.000Z'));
const reason = (status: i32, body: string): string => { const g = goLimits(status, body); assert.equal(g.limits, null); return g.error; };
assert.equal(reason(401, '{"type":"error","error":{"type":"AuthError","message":"Unauthorized"}}'), 'the Go key was refused or revoked');
assert.equal(reason(401, '{"error":{"type":"authentication_error","code":"api_key_expired","message":"expired"}}'), 'the Go key has expired');
assert.equal(reason(403, '{"type":"error","error":{"type":"EntitlementError","message":"OpenCode Go subscription required."}}'), 'no OpenCode Go subscription on this key (403)');
assert.equal(reason(404, 'Not Found'), 'the usage route has changed (404)');
assert.equal(reason(500, ''), 'the usage route answered 500');
assert.equal(reason(200, '{"rolling":{"percent":1}}'), 'the usage route has changed (an answer the app does not know)');
assert.equal(reason(200, 'not json'), 'the usage route has changed (an answer the app does not know)');

// `opencode auth export`: only the active OpenCode Go API key counts; OAuth entries and other providers are left alone
const exported = '[{"id":"a","integrationID":"opencode-go","label":"old","active":false,"value":{"type":"key","key":"sk-old"}},'
  + '{"id":"b","integrationID":"anthropic","label":"claude","active":true,"value":{"type":"oauth","access":"x","refresh":"y"}},'
  + '{"id":"c","integrationID":"opencode","label":"zen","active":true,"value":{"type":"key","key":"sk-zen"}},'
  + '{"id":"d","integrationID":"opencode-go","label":"go","active":true,"value":{"type":"key","key":"sk-go-test"}}]';
assert.equal(goKeyOf(exported), 'sk-go-test');
assert.equal(goKeyOf('[{"integrationID":"opencode-go","active":true,"value":{"type":"oauth","access":"x"}}]'), '');
assert.equal(goKeyOf('[]'), '');
assert.equal(goKeyOf(''), '');
assert.equal(goKeyOf('{"not":"an array"}'), '');
