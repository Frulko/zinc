// The three agent CLIs this tool drives: where each keeps its configuration, which models, efforts and modes it offers,
// how to start a turn and how to read its streamed answer.
//
// Every CLI runs headless, one process per turn: the prompt goes in argv, the answer comes back as JSON lines on
// stdout, and the session id the first turn reports resumes the conversation on the next one. The settings of a turn
// (mode, model, effort, fast) become that CLI's own flags, so a change applies from the next message on.
//
// Formats as captured on 2026-10-20 (examples/agents/tests/fixtures/*.jsonl, a tool call and a subagent each):
//   Claude Code 2.1.304  `-p --output-format stream-json --include-partial-messages`  token and tool-input deltas
//                        (stream_event); a subagent's messages are whole and carry `parent_tool_use_id`
//   Codex 0.162          `exec --json`         items: command_execution started then completed, file_change,
//                                              mcp_tool_call, reasoning, agent_message
//   opencode 2.0         `run --format json`   whole text parts; a tool part once it is completed
// So Claude streams word by word, Codex and opencode paragraph by paragraph: that is the CLIs, not this tool.
import * as fs from 'zinc:fs';
import * as proc from 'zinc:process';

/** What a line of output means for the chat. */
export const EV_SESSION = 0;     // text: the session id to resume with
export const EV_DELTA = 1;       // text to append to the answer as is (Claude's token deltas)
export const EV_BLOCK = 2;       // a whole paragraph (Codex items, opencode parts, a subagent's text)
export const EV_TOOL = 3;        // a tool call started: id, name, parent
export const EV_TOOL_DELTA = 4;  // id, text: a piece of the tool's input JSON while the model writes it
export const EV_TOOL_INPUT = 5;  // id, text: the tool's whole input, as JSON
export const EV_TOOL_END = 6;    // id, text: its output; failed; ms when the CLI timed it
export const EV_THINKING = 7;    // text: the model's reasoning summary
export const EV_PROGRESS = 8;    // id, text: what a subagent is doing now
export const EV_ERROR = 9;       // text: the turn failed, the reason
export const EV_DONE = 10;       // the turn is over

export class AgentEvent {
  kind: i32;
  /** The tool call's id. */
  id: string = '';
  /** The agent tool (Claude's Agent/Task) whose subagent this belongs to, '' for the main agent. */
  parent: string = '';
  name: string = '';
  text: string = '';
  failed: boolean = false;
  /** Duration the CLI measured, -1: not given. */
  ms: number = -1;
  constructor(kind: i32) { this.kind = kind; }
}

export type Emit = (e: AgentEvent) => void;

function ev(kind: i32, id: string, text: string): AgentEvent {
  const e = new AgentEvent(kind);
  e.id = id; e.text = text;
  return e;
}

/** A field of a parsed JSON object as a string, '' when absent or null. */
function str(v: any): string { return v === undefined || v === null ? '' : '' + v; }

/** Per-turn memory of a parser: Claude names a streamed block by its index, the tool by its id. */
export class ParseState {
  blocks: Map<i32, string> = new Map<i32, string>();
}

/** Tools that start a subagent: their card is an agent, the calls that name them as parent are its own. */
export function isAgentTool(name: string): boolean { return name === 'Agent' || name === 'Task' || name === 'task'; }

/** What the agent may do to the folder. Each CLI has its own words for these three levels. */
export const MODE_READ = 0;    // reads and answers: Claude's plan mode, Codex's read-only sandbox, opencode's plan agent
export const MODE_EDIT = 1;    // edits files in the folder
export const MODE_FULL = 2;    // anything, without asking: commands, network, files outside the folder
export const MODE_LABELS = ['Read only', 'Edit files', 'Full access'];

/** The usual effort levels, from the lightest. */
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];

/** A model the agent can run, and what it supports. `id` '' is the CLI's own default (its configuration). */
export class ModelChoice {
  id: string;
  label: string;
  /** Effort levels it accepts; empty: no effort setting. */
  efforts: string[];
  /** Has a fast mode (a faster tier at a higher cost). */
  fast: boolean;
  constructor(id: string, label: string, efforts: string[], fast: boolean) {
    this.id = id; this.label = label; this.efforts = efforts; this.fast = fast;
  }
}

/** The settings of one turn. `effort` '' is the model's default. */
export class TurnSettings {
  mode: i32;
  model: string;
  effort: string;
  fast: boolean;
  constructor(mode: i32, model: string, effort: string, fast: boolean) {
    this.mode = mode; this.model = model; this.effort = effort; this.fast = fast;
  }
}

/** A configuration file or folder an agent reads, relative to the home directory or to a project folder. */
export class ConfigSpec {
  path: string;
  /** Holds credentials: listed, never opened. */
  secret: boolean;
  constructor(path: string, secret: boolean) { this.path = path; this.secret = secret; }
}

function spec(path: string): ConfigSpec { return new ConfigSpec(path, false); }
function secret(path: string): ConfigSpec { return new ConfigSpec(path, true); }

/** One agent CLI. */
export abstract class Agent {
  readonly id: string;
  readonly name: string;
  /** The executable looked up in PATH. */
  readonly binary: string;
  /** Accent colour, 0xRRGGBB. */
  readonly color: i32;
  /** Files under the home directory. */
  readonly globalConfig: ConfigSpec[];
  /** Files in a project folder. */
  readonly projectConfig: ConfigSpec[];

  constructor(id: string, name: string, binary: string, color: i32, globalConfig: ConfigSpec[], projectConfig: ConfigSpec[]) {
    this.id = id; this.name = name; this.binary = binary; this.color = color;
    this.globalConfig = globalConfig; this.projectConfig = projectConfig;
  }

  /** The models to offer, the default first. Some CLIs are asked (`binary` is the installed CLI). */
  abstract loadModels(binary: string): Promise<ModelChoice[]>;
  /** Whether fast mode is on in the user's configuration (`home` is the home directory). */
  abstract fastByDefault(home: string): boolean;
  /** The arguments of one turn; `session` is '' on the first one. */
  abstract args(prompt: string, session: string, s: TurnSettings): string[];
  /** Environment entries of one turn (KEY=VALUE). */
  env(s: TurnSettings): string[] { return []; }
  /** Reads one line of stdout and emits what it means (nothing for the lines it does not use). */
  abstract parse(line: string, st: ParseState, emit: Emit): void;
  /**
   * A line too long to parse (LineReader spilled it): where its tool's id and output start, read from its head as
   * [id, index of the output's first character], or [] when the head does not say.
   */
  abstract bigLine(head: string): string[];
}

/** The string value after `"key":"` in a JSON text, and where its body starts: [value, start] or []. */
function rawField(text: string, key: string): string[] {
  const at = text.indexOf('"' + key + '":"');
  if (at < 0) return [];
  const start = at + key.length + 4;
  const end = text.indexOf('"', start);
  return [end < 0 ? text.slice(start) : text.slice(start, end), '' + start];
}

/** [id, output start] of an oversized line, from the key of its id and the key of its output. */
function bigOf(head: string, idKey: string, outputKey: string): string[] {
  const id = rawField(head, idKey);
  if (id.length === 0) return [];
  const out = head.indexOf('"' + outputKey + '":"');
  return [id[0], '' + (out < 0 ? head.length : out + outputKey.length + 4)];
}

/** The text of a tool result: a string, or text blocks ([{type: "text", text}]). */
function resultText(c: any): string {
  if (c === undefined || c === null) return '';
  if (typeof c === 'string') return c as string;
  if (Array.isArray(c)) {
    const parts: string[] = [];
    const n = c.length as i32;
    for (let i = 0; i < n; i++) { const b = c[i]; parts.push(b.text !== undefined ? '' + b.text : JSON.stringify(b)); }
    return parts.join('\n');
  }
  return JSON.stringify(c);
}

/** A prompt is a positional argument: one starting with '-' would be read as an option. */
function positional(prompt: string): string {
  return prompt.startsWith('-') ? ' ' + prompt : prompt;   // ponytail: a leading space, the models ignore it
}

/** The lines of `binary args` on stdout, [] when it fails. Run in the temporary folder: some CLIs and their plugins
 *  write files where they start. */
async function outputOf(binary: string, args: string[]): Promise<string[]> {
  try {
    const r = await proc.run(binary, args, { cwd: fs.tmpdir() });
    return r.code === 0 ? r.stdout.split('\n') : [];
  } catch (e) {
    return [];
  }
}

class ClaudeCode extends Agent {
  constructor() {
    super('claude', 'Claude Code', 'claude', 0xd97757, [
      spec('.claude/settings.json'), spec('.claude/settings.local.json'), spec('.claude/CLAUDE.md'),
      spec('.claude/agents'), spec('.claude/commands'), spec('.claude/skills'), spec('.claude/plugins'),
      // ~/.claude.json holds the account and the MCP servers' environments, which can carry tokens
      secret('.claude.json'), secret('.claude/.credentials.json'),
    ], [
      spec('CLAUDE.md'), spec('CLAUDE.local.md'), spec('.claude/settings.json'), spec('.claude/settings.local.json'),
      spec('.claude/agents'), spec('.claude/commands'), spec('.claude/skills'), spec('.mcp.json'),
    ]);
  }

  // Claude Code lists no models: these are the aliases `--model` takes, each the latest of its family.
  // Fast mode runs on Opus (the CLI switches to Opus when it is turned on from another model).
  loadModels(binary: string): Promise<ModelChoice[]> {
    return Promise.resolve([
      new ModelChoice('', 'Default', EFFORTS, true),
      new ModelChoice('fable', 'Fable', EFFORTS, false),
      new ModelChoice('opus', 'Opus', EFFORTS, true),
      new ModelChoice('sonnet', 'Sonnet', EFFORTS, false),
      new ModelChoice('haiku', 'Haiku', [], false),
    ]);
  }

  fastByDefault(home: string): boolean {
    try {
      return JSON.parse(fs.readText(home + '/.claude/settings.json')).fastMode === true;
    } catch (e) {
      return false;
    }
  }

  args(prompt: string, session: string, s: TurnSettings): string[] {
    const permission = s.mode === MODE_READ ? 'plan' : s.mode === MODE_EDIT ? 'acceptEdits' : 'bypassPermissions';
    const a = ['-p', positional(prompt), '--output-format', 'stream-json', '--verbose', '--include-partial-messages',
      '--permission-mode', permission];
    if (s.model !== '') { a.push('--model'); a.push(s.model); }
    if (s.effort !== '') { a.push('--effort'); a.push(s.effort); }
    if (s.fast) { a.push('--settings'); a.push('{"fastMode":true}'); }
    if (session !== '') { a.push('--resume'); a.push(session); }
    return a;
  }

  // fast mode off has to be said when the user's settings turn it on
  env(s: TurnSettings): string[] { return s.fast ? [] : ['CLAUDE_CODE_DISABLE_FAST_MODE=1']; }

  parse(line: string, st: ParseState, emit: Emit): void {
    const j = JSON.parse(line);
    const type = str(j.type);
    const parent = str(j.parent_tool_use_id);
    if (type === 'system') {
      const sub = str(j.subtype);
      if (sub === 'init') emit(ev(EV_SESSION, '', str(j.session_id)));
      else if (sub === 'task_progress') emit(ev(EV_PROGRESS, str(j.tool_use_id), str(j.description)));
    } else if (type === 'stream_event') {
      // the main agent's message streams; a subagent's arrives whole (below)
      if (parent !== '') return;
      const e = j.event;
      const etype = str(e.type);
      if (etype === 'message_start') st.blocks = new Map<i32, string>();
      else if (etype === 'content_block_start') {
        const b = e.content_block;
        if (str(b.type) === 'tool_use') {
          st.blocks.set(e.index as i32, str(b.id));
          const t = ev(EV_TOOL, str(b.id), '');
          t.name = str(b.name);
          emit(t);
        }
      } else if (etype === 'content_block_delta') {
        const dtype = str(e.delta.type);
        if (dtype === 'text_delta') emit(ev(EV_DELTA, '', str(e.delta.text)));
        else if (dtype === 'input_json_delta') {
          const id = st.blocks.get(e.index as i32);
          if (id !== undefined) emit(ev(EV_TOOL_DELTA, id as string, str(e.delta.partial_json)));
        }
      }
    } else if (type === 'assistant') {
      // the main agent's whole message repeats its deltas: only its tool inputs (whole, parsed) are read from it
      const content = j.message.content;
      const n = content.length as i32;
      for (let i = 0; i < n; i++) {
        const b = content[i];
        const btype = str(b.type);
        if (btype === 'tool_use') {
          const t = ev(EV_TOOL, str(b.id), '');
          t.name = str(b.name); t.parent = parent;
          emit(t);   // already started from the stream for the main agent: the chat keeps the first
          emit(ev(EV_TOOL_INPUT, str(b.id), JSON.stringify(b.input)));
        } else if (btype === 'text' && parent !== '') {
          const t = ev(EV_BLOCK, '', str(b.text));
          t.parent = parent;
          emit(t);
        }
      }
    } else if (type === 'user') {
      const content = j.message.content;
      if (!Array.isArray(content)) return;
      const n = content.length as i32;
      for (let i = 0; i < n; i++) {
        const b = content[i];
        if (str(b.type) !== 'tool_result') continue;
        const t = ev(EV_TOOL_END, str(b.tool_use_id), resultText(b.content));
        t.failed = b.is_error === true;
        emit(t);
      }
    } else if (type === 'result') {
      if (j.is_error === true) emit(ev(EV_ERROR, '', str(j.result)));
      emit(new AgentEvent(EV_DONE));
    }
  }

  // {"type":"user","message":{"role":"user","content":[{"tool_use_id":"toolu_…","type":"tool_result","content":"…
  bigLine(head: string): string[] { return bigOf(head, 'tool_use_id', 'content'); }
}

const CODEX_SANDBOX = ['read-only', 'workspace-write', 'danger-full-access'];

class Codex extends Agent {
  constructor() {
    super('codex', 'Codex', 'codex', 0x10a37f,
      [spec('.codex/config.toml'), spec('.codex/AGENTS.md'), spec('.codex/prompts'), secret('.codex/auth.json')],
      [spec('AGENTS.md'), spec('.codex/config.toml')]);
  }

  /** `codex debug models`: the catalog the CLI itself offers (the listed models, their efforts and speed tiers). */
  async loadModels(binary: string): Promise<ModelChoice[]> {
    const models = [new ModelChoice('', 'Default', EFFORTS, true)];
    const lines = await outputOf(binary, ['debug', 'models']);
    try {
      const list = JSON.parse(lines.join('\n')).models;
      const count = list.length as i32;
      for (let i = 0; i < count; i++) {
        const m = list[i];
        if ('' + m.visibility !== 'list') continue;
        const efforts: string[] = [];
        const levels = m.supported_reasoning_levels;
        const n = levels.length as i32;
        for (let k = 0; k < n; k++) efforts.push('' + levels[k].effort);
        models.push(new ModelChoice('' + m.slug, '' + m.display_name, efforts, (m.service_tiers.length as i32) > 0));
      }
    } catch (e) { }   // an older CLI without the catalog: the default only
    return models;
  }

  fastByDefault(home: string): boolean {
    try {
      for (const line of fs.readText(home + '/.codex/config.toml').split('\n')) {
        const t = line.trim();
        if (t.startsWith('service_tier')) return t.indexOf('"priority"') > 0 || t.indexOf('"fast"') > 0;
      }
    } catch (e) { }
    return false;
  }

  args(prompt: string, session: string, s: TurnSettings): string[] {
    // `-c` overrides apply to `exec resume` too, unlike exec's own flags; Codex refuses a folder outside a git
    // repository unless told
    const a = ['exec', '--json', '--skip-git-repo-check', '-c', `sandbox_mode="${CODEX_SANDBOX[s.mode]}"`,
      '-c', `service_tier="${s.fast ? 'priority' : 'default'}"`];
    if (s.model !== '') { a.push('-c'); a.push(`model="${s.model}"`); }
    if (s.effort !== '') { a.push('-c'); a.push(`model_reasoning_effort="${s.effort}"`); }
    if (session !== '') { a.push('resume'); a.push(session); }
    a.push(positional(prompt));
    return a;
  }

  parse(line: string, st: ParseState, emit: Emit): void {
    const j = JSON.parse(line);
    const type = str(j.type);
    if (type === 'thread.started') emit(ev(EV_SESSION, '', str(j.thread_id)));
    else if (type === 'item.started' || type === 'item.completed') {
      const it = j.item;
      const itype = str(it.type);
      const done = type === 'item.completed';
      if (itype === 'agent_message') { if (done) emit(ev(EV_BLOCK, '', str(it.text))); return; }
      if (itype === 'reasoning') { if (done) emit(ev(EV_THINKING, '', str(it.text))); return; }
      // items of type `error` are warnings about the user's config.toml, repeated on every turn: not shown
      let name = '', input = '', output = '';
      if (itype === 'command_execution') {
        name = 'shell'; input = JSON.stringify({ command: str(it.command) }); output = str(it.aggregated_output);
      } else if (itype === 'file_change') {
        name = 'edit'; input = JSON.stringify({ changes: it.changes });
        const lines: string[] = [];
        const n = it.changes !== undefined && it.changes !== null ? it.changes.length as i32 : 0;
        for (let i = 0; i < n; i++) lines.push(`${str(it.changes[i].kind)} ${str(it.changes[i].path)}`);
        output = lines.join('\n');
      } else if (itype === 'mcp_tool_call') {
        name = `${str(it.server)}.${str(it.tool)}`; input = JSON.stringify(it.arguments);
        output = it.error !== undefined && it.error !== null ? JSON.stringify(it.error)
          : it.result !== undefined && it.result !== null ? resultText(it.result.content) : '';
      } else if (itype === 'web_search') {
        name = 'web_search'; input = JSON.stringify({ query: str(it.query) });
      } else return;   // todo_list and the kinds this tool does not know
      const t = ev(EV_TOOL, str(it.id), '');
      t.name = name;
      emit(t);
      emit(ev(EV_TOOL_INPUT, str(it.id), input));
      if (done) {
        const e = ev(EV_TOOL_END, str(it.id), output);
        e.failed = str(it.status) === 'failed' || (it.exit_code !== undefined && it.exit_code !== null && (it.exit_code as i32) !== 0);
        emit(e);
      }
    } else if (type === 'turn.failed') {
      emit(ev(EV_ERROR, '', str(j.error.message)));
      emit(new AgentEvent(EV_DONE));
    } else if (type === 'error') emit(ev(EV_ERROR, '', str(j.message)));
    else if (type === 'turn.completed') emit(new AgentEvent(EV_DONE));
  }

  // {"type":"item.completed","item":{"id":"item_4","type":"command_execution","command":"…","aggregated_output":"…
  bigLine(head: string): string[] { return bigOf(head, 'id', 'aggregated_output'); }
}

class OpenCode extends Agent {
  constructor() {
    super('opencode', 'opencode', 'opencode', 0x6e8efb, [
      spec('.config/opencode/opencode.json'), spec('.config/opencode/opencode.jsonc'), spec('.config/opencode/AGENTS.md'),
      spec('.config/opencode/agent'), spec('.config/opencode/command'), secret('.local/share/opencode/auth.json'),
    ], [spec('opencode.json'), spec('opencode.jsonc'), spec('AGENTS.md'), spec('.opencode')]);
  }

  /** `opencode models`: `provider/model`, one per line. An effort is a variant of a model there, not a setting. */
  async loadModels(binary: string): Promise<ModelChoice[]> {
    const models = [new ModelChoice('', 'Default', [], false)];
    for (const line of await outputOf(binary, ['models'])) {
      const id = line.trim();
      if (id.indexOf('/') > 0 && id.indexOf(' ') < 0) models.push(new ModelChoice(id, id, [], false));
    }
    return models;
  }

  fastByDefault(home: string): boolean { return false; }

  args(prompt: string, session: string, s: TurnSettings): string[] {
    // the plan agent cannot edit; the build agent can, and --auto approves what is not explicitly denied
    const a = ['run', '--format', 'json', '--agent', s.mode === MODE_READ ? 'plan' : 'build'];
    if (s.mode === MODE_FULL) a.push('--auto');
    if (s.model !== '') { a.push('--model'); a.push(s.model); }
    if (session !== '') { a.push('--session'); a.push(session); }
    a.push(positional(prompt));
    return a;
  }

  parse(line: string, st: ParseState, emit: Emit): void {
    const j = JSON.parse(line);
    const type = str(j.type);
    if (j.sessionID !== undefined) emit(ev(EV_SESSION, '', str(j.sessionID)));
    if (type === 'text') emit(ev(EV_BLOCK, '', str(j.part.text)));
    else if (type === 'reasoning') emit(ev(EV_THINKING, '', str(j.part.text)));
    else if (type === 'tool_use') {
      // a tool part is printed once it is completed (or failed), with its input, output and times
      const p = j.part, s = p.state;
      const id = p.callID !== undefined ? str(p.callID) : str(p.id);
      const t = ev(EV_TOOL, id, '');
      t.name = str(p.tool);
      emit(t);
      emit(ev(EV_TOOL_INPUT, id, JSON.stringify(s.input)));
      const status = str(s.status);
      if (status === 'completed' || status === 'error') {
        const e = ev(EV_TOOL_END, id, status === 'error' ? str(s.error) : str(s.output));
        e.failed = status === 'error';
        if (s.time !== undefined && s.time.end !== undefined) e.ms = (s.time.end as number) - (s.time.start as number);
        emit(e);
      }
    } else if (type === 'error') emit(ev(EV_ERROR, '', j.error.data !== undefined ? str(j.error.data.message) : str(j.error.name)));
    // opencode prints no end-of-turn line: the turn ends when the process exits
  }

  // {"type":"tool_use",…,"part":{…,"type":"tool","id":"call_…","tool":"shell","state":{"status":"completed",…,"output":"…
  bigLine(head: string): string[] { return bigOf(head, 'id', 'output'); }
}

export const AGENTS: Agent[] = [new ClaudeCode(), new Codex(), new OpenCode()];
