// The three agent CLIs this tool drives, and how each one streams its answer.
//
// Every CLI runs headless, one process per turn: the prompt goes in argv, the answer comes back as JSON lines on
// stdout, and the session id the first turn reports resumes the conversation on the next one. All three run
// read-only (plan mode, read-only sandbox, the plan agent): a feasibility demo never edits the folder it talks about.
//
// Formats as captured on 2026-10-19:
//   Claude Code 2.1  `-p --output-format stream-json --include-partial-messages`  token deltas (stream_event)
//   Codex 0.162      `exec --json`                                                  whole items (item.completed)
//   opencode 2.0     `run --format json`                                            whole text parts
// So Claude streams word by word, Codex and opencode paragraph by paragraph: that is the CLIs, not this tool.

/** What a line of output means for the chat. */
export const EV_SESSION = 0;   // the session id to resume with
export const EV_DELTA = 1;     // text to append as is (Claude's token deltas)
export const EV_BLOCK = 2;     // a whole paragraph (Codex items, opencode parts)
export const EV_TOOL = 3;      // the agent started a tool: its name or command
export const EV_ERROR = 4;     // the turn failed: the reason
export const EV_DONE = 5;      // the turn is over

export type Emit = (kind: i32, text: string) => void;

/** A configuration file or folder an agent reads, relative to the home directory or to a project folder. */
export class ConfigSpec {
  path: string;
  /** Holds credentials: listed, never opened. */
  secret: boolean;
  constructor(path: string, secret: boolean) { this.path = path; this.secret = secret; }
}

function spec(path: string): ConfigSpec { return new ConfigSpec(path, false); }
function secret(path: string): ConfigSpec { return new ConfigSpec(path, true); }

/** One agent CLI: where it keeps its configuration, how to start a turn, how to read its output. */
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

  /** The arguments of one turn; `session` is '' on the first one. */
  abstract args(prompt: string, session: string): string[];
  /** Reads one line of stdout and emits what it means (nothing for the lines it does not use). */
  abstract parse(line: string, emit: Emit): void;
}

/** A prompt is a positional argument: one starting with '-' would be read as an option. */
function positional(prompt: string): string {
  return prompt.startsWith('-') ? ' ' + prompt : prompt;   // ponytail: a leading space, the models ignore it
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

  args(prompt: string, session: string): string[] {
    const a = ['-p', positional(prompt), '--output-format', 'stream-json', '--verbose', '--include-partial-messages',
      '--permission-mode', 'plan'];
    if (session !== '') { a.push('--resume'); a.push(session); }
    return a;
  }

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

class Codex extends Agent {
  constructor() {
    super('codex', 'Codex', 'codex', 0x10a37f,
      [spec('.codex/config.toml'), spec('.codex/AGENTS.md'), spec('.codex/prompts'), secret('.codex/auth.json')],
      [spec('AGENTS.md'), spec('.codex/config.toml')]);
  }

  args(prompt: string, session: string): string[] {
    // Codex refuses a folder outside a git repository unless told; read-only: it reads, it does not write
    const a = ['exec', '--json', '--skip-git-repo-check', '-s', 'read-only'];
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

  args(prompt: string, session: string): string[] {
    const a = ['run', '--format', 'json', '--agent', 'plan'];
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
