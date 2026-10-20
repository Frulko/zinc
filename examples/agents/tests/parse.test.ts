// The three parsers against the streams the real CLIs printed on 2026-10-20 (tests/fixtures, captured in a temporary
// folder in read-only mode: a shell command, a file read, and for Claude a subagent that reads a file).
import * as assert from 'zinc:assert';
import * as fs from 'zinc:fs';
import {
  AGENTS, Agent, AgentEvent, ParseState, EV_SESSION, EV_DELTA, EV_BLOCK, EV_TOOL, EV_TOOL_DELTA, EV_TOOL_INPUT, EV_TOOL_END,
  EV_PROGRESS, EV_DONE,
} from '../src/services/agents';
import { summarize } from '../src/services/tools';

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
function byName(es: AgentEvent[], name: string): AgentEvent {
  for (const e of es) if (e.kind === EV_TOOL && e.name === name) return e;
  throw new Error('no tool ' + name);
}
function endOf(es: AgentEvent[], id: string): AgentEvent {
  for (const e of es) if (e.kind === EV_TOOL_END && e.id === id) return e;
  throw new Error('no end for ' + id);
}

// Claude Code 2.1.304: streamed main agent, whole subagent messages tied by parent_tool_use_id
const claude = eventsOf(AGENTS[0], 'claude-2026-10-20.jsonl');
assert.equal(of(claude, EV_SESSION)[0].text, '615ada25-99bf-4291-8040-5bc38a36e6c7');
const bash = byName(claude, 'Bash');
assert.equal(bash.parent, '');
assert.ok(of(claude, EV_TOOL_DELTA).filter((e: AgentEvent) => e.id === bash.id).length >= 3, 'its input streams');
const bashIn = of(claude, EV_TOOL_INPUT).filter((e: AgentEvent) => e.id === bash.id)[0];
assert.equal(summarize('Bash', bashIn.text), 'ls');
assert.equal(endOf(claude, bash.id).text, 'notes.txt\nREADME.md');
const task = byName(claude, 'Agent');
assert.equal(summarize('Agent', of(claude, EV_TOOL_INPUT).filter((e: AgentEvent) => e.id === task.id)[0].text), 'Read first line of notes');
const read = byName(claude, 'Read');
assert.equal(read.parent, task.id, "the subagent's call names its agent");
assert.equal(endOf(claude, read.id).text, '1\talpha');
assert.ok(endOf(claude, task.id).text.indexOf('alpha') > 0, "the agent's result is its report");
assert.equal(of(claude, EV_PROGRESS)[0].id, task.id);
assert.equal(of(claude, EV_DELTA).map((e: AgentEvent) => e.text).join(''),
  '`ls` showed `notes.txt` and `README.md`, and the subagent reported that the first line of `notes.txt` is `alpha`.');
assert.equal(of(claude, EV_DONE).length, 1);

// Codex 0.162: two commands started then completed, two messages
const codex = eventsOf(AGENTS[1], 'codex-2026-10-20.jsonl');
assert.equal(of(codex, EV_SESSION)[0].text, '01a15657-21f6-7fd3-ab6f-c0d41cffb959');
const ends = of(codex, EV_TOOL_END);
assert.equal(ends.length, 2);
assert.equal(endOf(codex, 'item_4').text, 'README.md\nnotes.txt\n');
assert.equal(endOf(codex, 'item_3').text, 'alpha\nbeta\n');
assert.equal(summarize('shell', of(codex, EV_TOOL_INPUT)[0].text), "/bin/zsh -lc 'cat notes.txt'");
assert.equal(of(codex, EV_BLOCK).length, 2);
assert.equal(of(codex, EV_DONE).length, 1);

// opencode 2.0.32: tool parts printed completed, with their own times
const open = eventsOf(AGENTS[2], 'opencode-2026-10-20.jsonl');
assert.equal(of(open, EV_SESSION)[0].text, 'ses_ea9a8de61ffezRCytYtd8D5cba');
assert.equal(byName(open, 'read').id, 'call_01a156572d6c70a8b210d399');
const shellEnd = endOf(open, byName(open, 'shell').id);
assert.ok(shellEnd.text.indexOf('notes.txt') > 0);
assert.ok(shellEnd.ms > 0, 'opencode times its tools');
assert.equal(of(open, EV_BLOCK).length, 2);

// an oversized line: its head tells which tool it is
assert.deepEqual(AGENTS[0].bigLine('{"type":"user","message":{"role":"user","content":[{"tool_use_id":"toolu_9","type":"tool_result","content":"xx'),
  ['toolu_9', '108']);
assert.equal(AGENTS[1].bigLine('{"type":"item.completed","item":{"id":"item_7","type":"command_execution","command":"cat big","aggregated_output":"yy')[0], 'item_7');
assert.deepEqual(AGENTS[0].bigLine('{"type":"assistant"'), []);

// summaries of the usual inputs
assert.equal(summarize('Edit', '{"file_path":"a.ts","old_string":"x\\ny","new_string":"z"}'), 'a.ts  −2 +1');
assert.equal(summarize('Read', '{"file_path":"/p/a.ts"}'), '/p/a.ts');
assert.equal(summarize('Grep', '{"pattern":"TODO","path":"src"}'), 'TODO  in src');
console.log('parse: ok');
