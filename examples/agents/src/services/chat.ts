// A chat: one agent in one folder. Each turn starts the agent's CLI in the folder, reads its stdout line by line and
// writes what it says into the last message as it arrives. Only that message's text signal changes while it streams,
// so the window redraws that one text and nothing else.
import { createSignal } from 'zinc:ui/solid';
import * as proc from 'zinc:process';
import { Agent, TurnSettings, MODE_LABELS, EV_SESSION, EV_DELTA, EV_BLOCK, EV_TOOL, EV_ERROR, EV_DONE } from './agents';

/** Lines of stderr kept to explain a failed turn. */
const STDERR_TAIL = 4;

/** `opus · high · fast · Edit files`: what a turn ran with, shown above its answer. */
function describe(s: TurnSettings): string {
  const parts = [s.model === '' ? 'default model' : s.model];
  if (s.effort !== '') parts.push(s.effort);
  if (s.fast) parts.push('fast');
  parts.push(MODE_LABELS[s.mode]);
  return parts.join(' · ');
}

export class Message {
  readonly fromUser: boolean;
  /** For an answer: the settings of its turn. */
  readonly meta: string;
  /** When it was created (ms): only a new message plays its entrance. */
  readonly born: number = Date.now();
  readonly text: () => string;
  readonly setText: (v: string) => void;
  /** While the agent is still answering. */
  readonly streaming: () => boolean;
  readonly setStreaming: (v: boolean) => void;
  readonly error: () => string;
  readonly setError: (v: string) => void;
  /** The next text starts a new paragraph (after a tool line). */
  breakBefore: boolean = false;

  constructor(fromUser: boolean, text: string, meta: string) {
    this.fromUser = fromUser;
    this.meta = meta;
    const t = createSignal(text), s = createSignal(!fromUser), e = createSignal('');
    this.text = t[0]; this.setText = t[1];
    this.streaming = s[0]; this.setStreaming = s[1];
    this.error = e[0]; this.setError = e[1];
  }

  appendDelta(s: string): void {
    const now = this.text();
    this.setText(this.breakBefore && now !== '' ? now + '\n\n' + s : now + s);
    this.breakBefore = false;
  }

  appendBlock(s: string): void {
    const now = this.text();
    this.setText(now === '' ? s : now + '\n\n' + s);
    this.breakBefore = false;
  }

  appendTool(name: string): void {
    this.appendBlock('› ' + name);
    this.breakBefore = true;
  }
}

export class Chat {
  readonly folder: string;
  readonly agent: Agent;
  /** The agent's session id once the first turn reported it: the next turns resume it. */
  session: string = '';
  readonly messages: () => Message[];
  readonly setMessages: (v: Message[]) => void;
  readonly busy: () => boolean;
  readonly setBusy: (v: boolean) => void;
  /** Bumped on every change of the list or of the streaming text: the chat view scrolls to the end when it moves. */
  readonly revision: () => i32;
  readonly setRevision: (v: i32) => void;
  private process: proc.Process | null = null;
  /** stop() was asked: the exit that follows is not a failure. */
  private stopping: boolean = false;

  constructor(folder: string, agent: Agent) {
    this.folder = folder;
    this.agent = agent;
    const m = createSignal<Message[]>([]), b = createSignal(false), r = createSignal<i32>(0);
    this.messages = m[0]; this.setMessages = m[1];
    this.busy = b[0]; this.setBusy = b[1];
    this.revision = r[0]; this.setRevision = r[1];
  }

  /** Starts a turn with `binary` (the agent's CLI, found by discovery) and `settings`. Ignored while a turn runs. */
  send(binary: string, prompt: string, settings: TurnSettings): void {
    const text = prompt.trim();
    if (text === '' || this.busy()) return;
    const answer = new Message(false, '', describe(settings));
    this.push(new Message(true, text, ''));
    this.push(answer);
    this.setBusy(true);
    this.stopping = false;

    let p: proc.Process;
    try {
      p = proc.spawn(binary, this.agent.args(text, this.session, settings), { cwd: this.folder, env: this.agent.env(settings) });
    } catch (e) {
      this.finish(answer, `${this.agent.name} could not start: ${e.message}`);
      return;
    }
    this.process = p;
    p.closeStdin();   // a CLI that reads its prompt from stdin when it is open (Codex) would wait forever

    const stderr: string[] = [];
    let ended = false;
    const emit = (kind: i32, s: string): void => {
      if (kind === EV_SESSION) this.session = s;
      else if (kind === EV_DELTA) answer.appendDelta(s);
      else if (kind === EV_BLOCK) answer.appendBlock(s);
      else if (kind === EV_TOOL) answer.appendTool(s);
      else if (kind === EV_ERROR) answer.setError(s);
      else if (kind === EV_DONE) { ended = true; this.finish(answer, ''); }
      this.setRevision(this.revision() + 1);
    };
    p.onStdout((line: string) => {
      if (line === '' || ended) return;
      try {
        this.agent.parse(line, emit);
      } catch (e) { }   // a line that is not JSON (a banner, a progress bar): not part of the answer
    });
    p.onStderr((line: string) => {
      if (line.trim() === '') return;
      stderr.push(line);
      if (stderr.length > STDERR_TAIL) stderr.shift();
    });
    p.onExit((code: i32) => {
      this.process = null;
      if (ended) return;
      // no end-of-turn line (opencode never prints one, a crash neither): the exit closes the turn
      if (this.stopping) answer.appendBlock('(stopped)');
      const failed = code !== 0 && !this.stopping && answer.error() === '';
      this.finish(answer, failed ? `${this.agent.name} stopped (exit ${code}): ${stderr.join('\n')}` : '');
    });
  }

  /** Stops the running turn; what was already written stays. */
  stop(): void {
    const p = this.process;
    if (p !== null) { this.stopping = true; p.kill(); }
  }

  private push(m: Message): void {
    this.setMessages([...this.messages(), m]);
    this.setRevision(this.revision() + 1);
  }

  private finish(answer: Message, error: string): void {
    if (error !== '') answer.setError(error);
    if (answer.text() === '' && answer.error() === '') answer.setText('(no answer)');
    answer.setStreaming(false);
    this.setBusy(false);
    this.setRevision(this.revision() + 1);
  }
}
