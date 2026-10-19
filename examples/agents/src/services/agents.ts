// The three agent CLIs this tool drives: where each keeps its configuration, which models, efforts and modes it offers,
// how to start a turn and how to read its streamed answer.
//
// Every CLI runs headless, one process per turn: the prompt goes in argv, the answer comes back as JSON lines on
// stdout, and the session id the first turn reports resumes the conversation on the next one. The settings of a turn
// (mode, model, effort, fast) become that CLI's own flags, so a change applies from the next message on.
//
// Formats as captured on 2026-10-19:
//   Claude Code 2.1  `-p --output-format stream-json --include-partial-messages`  token deltas (stream_event)
//   Codex 0.162      `exec --json`                                                  whole items (item.completed)
//   opencode 2.0     `run --format json`                                            whole text parts
// So Claude streams word by word, Codex and opencode paragraph by paragraph: that is the CLIs, not this tool.
import * as fs from 'zinc:fs';
import * as proc from 'zinc:process';

/** What a line of output means for the chat. */
export const EV_SESSION = 0;   // the session id to resume with
export const EV_DELTA = 1;     // text to append as is (Claude's token deltas)
export const EV_BLOCK = 2;     // a whole paragraph (Codex items, opencode parts)
export const EV_TOOL = 3;      // the agent started a tool: its name or command
export const EV_ERROR = 4;     // the turn failed: the reason
export const EV_DONE = 5;      // the turn is over

export type Emit = (kind: i32, text: string) => void;

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
  abstract parse(line: string, emit: Emit): void;
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

  parse(line: string, emit: Emit): void {
    const j = JSON.parse(line);
    const type = '' + j.type;
    if (type === 'system') {
      if ('' + j.subtype === 'init') emit(EV_SESSION, '' + j.session_id);
    } else if (type === 'stream_event') {
      // the full `assistant` messages repeat what the deltas already gave: only the deltas are read
      const e = j.event;
      const etype = '' + e.type;
      if (etype === 'content_block_delta') {
        if ('' + e.delta.type === 'text_delta') emit(EV_DELTA, '' + e.delta.text);
      } else if (etype === 'content_block_start') {
        if ('' + e.content_block.type === 'tool_use') emit(EV_TOOL, '' + e.content_block.name);
      }
    } else if (type === 'result') {
      if (j.is_error === true) emit(EV_ERROR, '' + j.result);
      emit(EV_DONE, '');
    }
  }
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

  parse(line: string, emit: Emit): void {
    const j = JSON.parse(line);
    const type = '' + j.type;
    if (type === 'thread.started') emit(EV_SESSION, '' + j.thread_id);
    else if (type === 'item.started') {
      if ('' + j.item.type === 'command_execution') emit(EV_TOOL, '' + j.item.command);
    } else if (type === 'item.completed') {
      // items of type `error` are warnings about the user's config.toml, repeated on every turn: not shown
      if ('' + j.item.type === 'agent_message') emit(EV_BLOCK, '' + j.item.text);
    } else if (type === 'turn.failed') {
      emit(EV_ERROR, '' + j.error.message);
      emit(EV_DONE, '');
    } else if (type === 'error') emit(EV_ERROR, '' + j.message);
    else if (type === 'turn.completed') emit(EV_DONE, '');
  }
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

  parse(line: string, emit: Emit): void {
    const j = JSON.parse(line);
    const type = '' + j.type;
    if (j.sessionID !== undefined) emit(EV_SESSION, '' + j.sessionID);
    if (type === 'text') emit(EV_BLOCK, '' + j.part.text);
    else if (type === 'tool_use') emit(EV_TOOL, '' + j.part.tool);
    else if (type === 'error') emit(EV_ERROR, j.error.data !== undefined ? '' + j.error.data.message : '' + j.error.name);
    // opencode prints no end-of-turn line: the turn ends when the process exits
  }
}

export const AGENTS: Agent[] = [new ClaudeCode(), new Codex(), new OpenCode()];
