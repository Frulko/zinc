// A conversation: one agent in one folder. Each turn starts the agent's CLI in the folder; its stdout is read line by
// line through a bounded buffer and every event becomes an item (a paragraph, a tool call, a subagent's call) that is
// written to the transcript on disk once it is finished.
//
// Memory stays flat however long the conversation runs:
// - the agent keeps the context in its own session (`--resume`, `resume`, `--session`): the app never sends the
//   history back, so it does not need to hold it;
// - the chat holds a window of at most WINDOW_MAX items and WINDOW_CHARS characters, only while it is shown; older
//   items are read back from disk when the view scrolls up to them, and dropped again when it scrolls away;
// - the items still open (the paragraph being written, the tools still running) are the only others in memory;
// - a long text keeps its start in memory and the whole on disk (Item.appendText, Item.setFullOutput).
import { createSignal } from 'zinc:ui/solid';
import * as fs from 'zinc:fs';
import * as proc from 'zinc:process';
import {
  Agent, AgentEvent, ParseState, TurnSettings, MODE_LABELS, isAgentTool,
  EV_SESSION, EV_DELTA, EV_BLOCK, EV_TOOL, EV_TOOL_DELTA, EV_TOOL_INPUT, EV_TOOL_END, EV_THINKING, EV_PROGRESS, EV_ERROR, EV_DONE,
} from './agents';
import { LineReader, Spill, unescapeLoose, head } from './stream';
import { Item, Transcript, K_USER, K_TURN, K_TEXT, K_TOOL, K_THINKING, S_RUNNING, S_DONE, S_ERROR, S_STOPPED, TEXT_CAP, OUTPUT_HEAD } from './transcript';
import { summarize, detailOf, DETAIL_CAP } from './tools';
import { TurnMachine, IDLE } from './turn';

/** Items the window holds at most, and the characters they may hold together; never fewer than WINDOW_MIN. */
export const WINDOW_MAX = 120;
export const WINDOW_CHARS = 512 * 1024;
const WINDOW_MIN = 8;
/** Items read from disk at once when the view reaches an end of the window. */
export const PAGE = 40;
/** The turn's tools the detail panel lists (the latest), and its agents. */
export const PANEL_TOOLS = 100;
export const PANEL_AGENTS = 32;
/** Characters of stderr kept to explain a failed turn. */
const STDERR_TAIL = 2048;

/** `opus · high · fast · Edit files`: what a turn ran with, shown above its answer. */
function toolsLabel(n: i32): string { return n === 1 ? '1 tool' : `${n} tools`; }

export function describe(s: TurnSettings): string {
  const parts = [s.model === '' ? 'default model' : s.model];
  if (s.effort !== '') parts.push(s.effort);
  if (s.fast) parts.push('fast');
  parts.push(MODE_LABELS[s.mode]);
  return parts.join(' · ');
}

function firstLine(s: string): string { const nl = s.indexOf('\n'); return nl < 0 ? s : s.slice(0, nl); }

/** The value of the first string field of a JSON text still being written: `{"command": "ls -l` → `ls -l`. */
function liveSummary(partial: string): string {
  const colon = partial.indexOf(':');
  if (colon < 0) return '';
  const q = partial.indexOf('"', colon);
  return q < 0 ? '' : firstLine(unescapeLoose(partial.slice(q + 1), true));
}

/** The running turn: its header item and whether its answer is over (later output is ignored). */
class Run {
  readonly item: Item;
  readonly gen: i32;
  ended: boolean = false;
  constructor(item: Item, gen: i32) { this.item = item; this.gen = gen; }
}

export class Chat {
  readonly id: string;
  readonly folder: string;
  readonly agent: Agent;
  readonly store: Transcript;
  /** The agent's session id once the first turn reported it: the next turns resume it. */
  session: string = '';
  /** On disk once it has a message (an empty conversation is not kept). */
  persisted: boolean = false;
  /** Items in the transcript, open ones included: the next item's seq. */
  count: i32 = 0;
  /** The view shows the end and the window grows with the conversation. */
  following: boolean = true;
  readonly title: () => string;
  readonly setTitle: (v: string) => void;
  /** When it last changed (epoch ms). */
  readonly updated: () => number;
  readonly setUpdated: (v: number) => void;
  /** turn.ts IDLE, RUNNING or STOPPING. */
  readonly phase: () => i32;
  readonly setPhase: (v: i32) => void;
  /** How its last turn ended (S_DONE, S_ERROR, S_STOPPED; S_RUNNING while one runs). */
  readonly outcome: () => i32;
  readonly setOutcome: (v: i32) => void;
  /** The items in memory, in order: a window of the transcript. */
  readonly window: () => Item[];
  readonly setWindow: (v: Item[]) => void;
  /** Bumped on every change: the view follows the end when it moves. */
  readonly revision: () => i32;
  readonly setRevision: (v: i32) => void;
  /** The current (or last) turn's agents and latest tools, for the detail panel. */
  readonly panelAgents: () => Item[];
  readonly setPanelAgents: (v: Item[]) => void;
  readonly panelTools: () => Item[];
  readonly setPanelTools: (v: Item[]) => void;
  /** The turn's tool calls, all of them. */
  readonly turnTools: () => i32;
  readonly setTurnTools: (v: i32) => void;

  private shown: boolean = false;
  /** Items made since the last frame, joining the window at the next one (Chat.flush): a flood of events costs one update per frame. */
  private pending: Item[] = [];
  /** More than a window came since the last frame: the window is replaced, not extended (no gap in it). */
  private pendingCut: boolean = false;
  /** The panel's lists, published at the next frame too. */
  private toolList: Item[] = [];
  private agentList: Item[] = [];
  private toolCount: i32 = 0;
  private panelDirty: boolean = false;
  private header: Item | null = null;
  /** Items not finished yet, by seq: the only ones outside the window that stay in memory. */
  private live: Map<i32, Item> = new Map<i32, Item>();
  /** The turn's open tool calls and its agent calls, by tool id. */
  private tools: Map<string, Item> = new Map<string, Item>();
  private agentCalls: Map<string, Item> = new Map<string, Item>();
  private textItem: Item | null = null;
  private run: Run | null = null;
  private readonly machine: TurnMachine;

  constructor(id: string, dir: string, folder: string, agent: Agent) {
    this.id = id;
    this.folder = folder;
    this.agent = agent;
    this.store = new Transcript(dir);
    const t = createSignal(''), u = createSignal<number>(Date.now()), ph = createSignal<i32>(IDLE), oc = createSignal<i32>(S_DONE);
    const w = createSignal<Item[]>([]), r = createSignal<i32>(0), pa = createSignal<Item[]>([]), pt = createSignal<Item[]>([]);
    const tt = createSignal<i32>(0);
    this.title = t[0]; this.setTitle = t[1];
    this.updated = u[0]; this.setUpdated = u[1];
    this.phase = ph[0]; this.setPhase = ph[1];
    this.outcome = oc[0]; this.setOutcome = oc[1];
    this.window = w[0]; this.setWindow = w[1];
    this.revision = r[0]; this.setRevision = r[1];
    this.panelAgents = pa[0]; this.setPanelAgents = pa[1];
    this.panelTools = pt[0]; this.setPanelTools = pt[1];
    this.turnTools = tt[0]; this.setTurnTools = tt[1];
    this.machine = new TurnMachine((ms: number, f: () => void) => { setTimeout(f, ms); }, (s: i32) => this.setPhase(s));
  }

  busy(): boolean { return this.phase() !== IDLE; }

  // ---- the window ----

  /** The chat is on screen: its window holds the end of the transcript. */
  show(): void {
    if (this.shown) return;
    this.shown = true;
    this.following = true;
    this.setWindow(this.trimmed(this.items(Math.max(0, this.count - PAGE), this.count), true));
    this.bump();
  }

  /** Off screen: the window is dropped (the open items stay, they are still written to). */
  hide(): void { this.shown = false; this.pending = []; this.pendingCut = false; this.setWindow([]); }

  /** Called every frame for the shown chat: what arrived since the last frame joins the window and the panel. */
  flush(): void {
    if (this.pending.length > 0) {
      const next = this.pendingCut ? this.pending : [...this.window(), ...this.pending];
      this.pending = [];
      this.pendingCut = false;
      this.setWindow(this.trimmed(next, true));
    }
    if (this.panelDirty) {
      this.panelDirty = false;
      this.setPanelTools(this.toolList.slice());
      this.setPanelAgents(this.agentList.slice());
      this.setTurnTools(this.toolCount);
      const h = this.header;
      if (h !== null) (h as Item).setNote(toolsLabel(this.toolCount));
    }
  }

  hasOlder(): boolean { const w = this.window(); return w.length > 0 && w[0].seq > 0; }
  hasNewer(): boolean {
    const w = this.pending.length > 0 ? this.pending : this.window();
    return w.length > 0 && w[w.length - 1].seq < this.count - 1;
  }

  /** Reads PAGE items before the window; the window gives up its end if it is over its budget. */
  loadOlder(): void {
    const w = this.window();
    if (!this.hasOlder()) return;
    const lo = w[0].seq;
    const older = this.items(Math.max(0, lo - PAGE), lo);
    if (older.length === 0) return;
    this.setWindow(this.trimmed([...older, ...w], false));
  }

  /** Reads PAGE items after the window; the view follows the conversation again once the window reaches its end. */
  loadNewer(): void {
    const w = this.window();
    if (!this.hasNewer()) return;
    const hi = w[w.length - 1].seq + 1;
    const to = Math.min(this.count, hi + PAGE);
    this.setWindow(this.trimmed([...w, ...this.items(hi, to)], true));
    if (to >= this.count) this.following = true;
  }

  /** Items lo <= seq < hi: the finished ones from disk, the open ones from memory. */
  private items(lo: i32, hi: i32): Item[] {
    const out: Item[] = [];
    const disk = this.store.read(lo, hi);
    let k = 0;
    for (let seq = lo; seq < hi; seq++) {
      const open = this.live.get(seq);
      while (k < disk.length && disk[k].seq < seq) k++;
      if (open !== undefined) out.push(open as Item);
      else if (k < disk.length && disk[k].seq === seq) out.push(disk[k]);
    }
    return out;
  }

  /** `w` without the items at its top (or its end) that pass WINDOW_MAX and WINDOW_CHARS. */
  private trimmed(w: Item[], fromTop: boolean): Item[] {
    let chars = 0;
    for (const it of w) chars += it.chars();
    let drop = 0;
    while (w.length - drop > WINDOW_MIN && (w.length - drop > WINDOW_MAX || chars > WINDOW_CHARS)) {
      chars -= (fromTop ? w[drop] : w[w.length - 1 - drop]).chars();
      drop++;
    }
    if (drop === 0) return w;
    if (!fromTop) this.following = false;
    return fromTop ? w.slice(drop) : w.slice(0, w.length - drop);
  }

  /** What it holds in memory: [items in the window, open items, characters of both]. */
  held(): number[] {
    let chars = 0;
    for (const it of this.window()) chars += it.chars();
    for (const it of this.pending) chars += it.chars();
    this.live.forEach((it: Item, seq: i32) => { chars += it.chars(); });
    return [this.window().length + this.pending.length, this.live.size, chars];
  }

  // ---- a turn ----

  /** Starts a turn with `binary` (the agent's CLI, found by discovery). False while a turn runs or stops. */
  send(binary: string, prompt: string, settings: TurnSettings): boolean {
    const text = prompt.trim();
    if (text === '' || this.busy()) return false;
    this.persisted = true;
    fs.mkdir(this.store.dir + '/out', true);
    if (this.title() === '') this.setTitle(head(firstLine(text), 60));
    const user = this.add(K_USER, '', this.count + 1);
    user.setText(head(text, TEXT_CAP));
    this.finish(user);
    const turn = this.add(K_TURN, '', this.count, '', this.agent.name);
    turn.setText(describe(settings));
    turn.setStatus(S_RUNNING);
    this.textItem = null;
    this.tools = new Map<string, Item>();
    this.agentCalls = new Map<string, Item>();
    this.toolList = []; this.agentList = []; this.toolCount = 0; this.panelDirty = true;
    this.header = turn;
    this.setOutcome(S_RUNNING);
    this.setUpdated(Date.now());

    let p: proc.Process;
    try {
      p = proc.spawn(binary, this.agent.args(text, this.session, settings), { cwd: this.folder, env: this.agent.env(settings) });
    } catch (e) {
      const failed = new Run(turn, -1);
      this.run = failed;
      this.endTurn(failed, S_ERROR, `${this.agent.name} could not start: ${e.message}`);
      return true;
    }
    this.machine.start((signal: i32) => p.kill(signal));
    const run = new Run(turn, this.machine.gen);
    this.run = run;
    this.saveMeta();
    p.closeStdin();   // a CLI that reads its prompt from stdin when it is open (Codex) would wait forever

    const st = new ParseState();
    const emit = (e: AgentEvent): void => this.apply(run, e);
    const reader = new LineReader(this.store.spillPrefix(turn.seq, 'stdout'),
      (line: string) => {
        if (run.ended) return;
        try { this.agent.parse(line, st, emit); } catch (e) { }   // not JSON (a banner, a progress bar): not part of the answer
      },
      (start: string, spill: Spill) => { if (!run.ended) this.bigLine(run, start, spill); });
    let stderr = '';
    // raw chunks, not onStdout: the plugin's own line buffer has no limit
    p.onData((s: string, isErr: boolean) => {
      if (!isErr) reader.feed(s);
      else if (!run.ended) stderr = (stderr + s).slice(-STDERR_TAIL);
    });
    p.onExit((code: i32) => {
      reader.end();
      this.machine.exited(run.gen);
      if (run.ended) return;
      // no end-of-turn line (opencode never prints one, a crash neither): the exit closes the turn
      const failed = code !== 0 && turn.detail() === '';
      const lines = stderr.trim().split('\n');
      this.endTurn(run, code !== 0 || turn.detail() !== '' ? S_ERROR : S_DONE,
        failed ? `${this.agent.name} stopped (exit ${code}): ${lines.slice(Math.max(0, lines.length - 4)).join('\n')}` : '');
    });
    return true;
  }

  /** Stops the running turn (Escape, the Stop button): marked interrupted at once, the process is signalled until it
   *  exits. The session stays: the next message resumes it. */
  stop(): void {
    const run = this.run;
    if (this.machine.stop() && run !== null) this.endTurn(run as Run, S_STOPPED, '');
  }

  private apply(run: Run, e: AgentEvent): void {
    if (run.ended) return;
    const k = e.kind;
    if (k === EV_SESSION) {
      if (e.text !== '' && e.text !== this.session) { this.session = e.text; this.saveMeta(); }
      return;
    }
    if (k === EV_DELTA) {
      let t = this.textItem;
      if (t === null) { t = this.add(K_TEXT, '', run.item.seq); this.textItem = t; }
      (t as Item).appendText(e.text, this.store.spillPrefix((t as Item).seq, 'text'));
    } else if (k === EV_BLOCK || k === EV_THINKING) {
      if (e.parent === '') this.closeText();
      const t = this.add(k === EV_BLOCK ? K_TEXT : K_THINKING, e.parent, run.item.seq);
      t.appendText(e.text, this.store.spillPrefix(t.seq, 'text'));
      this.finish(t);
    } else if (k === EV_TOOL) {
      if (this.tools.has(e.id)) return;   // Claude names a call in its stream and again in its whole message
      if (e.parent === '') this.closeText();
      const t = this.add(K_TOOL, e.parent, run.item.seq, e.id, e.name);
      t.setStatus(S_RUNNING);
      this.tools.set(e.id, t);
      if (isAgentTool(e.name) && this.agentCalls.size < PANEL_AGENTS) {
        this.agentCalls.set(e.id, t);
        this.agentList.push(t);
      }
      this.toolList.push(t);
      if (this.toolList.length > PANEL_TOOLS) this.toolList.shift();
      this.toolCount++;
      this.panelDirty = true;
      this.countCalls(e.parent);
    } else if (k === EV_TOOL_DELTA) {
      const t = this.tools.get(e.id);
      if (t === undefined || (t as Item).partial.length > DETAIL_CAP) return;
      const it = t as Item;
      it.partial += e.text;
      it.setText(liveSummary(it.partial));
    } else if (k === EV_TOOL_INPUT) {
      const t = this.tools.get(e.id);
      if (t === undefined) return;
      const it = t as Item;
      it.partial = '';
      it.setText(summarize(it.name, e.text));
      it.setDetail(detailOf(it.name, e.text));
    } else if (k === EV_TOOL_END) {
      const t = this.tools.get(e.id);
      if (t === undefined) return;
      const it = t as Item;
      it.setFullOutput(e.text, this.store.spillPrefix(it.seq, 'output'));
      this.closeTool(it, e.failed ? S_ERROR : S_DONE, e.ms);
    } else if (k === EV_PROGRESS) {
      const a = this.agentCalls.get(e.id);
      if (a !== undefined) { (a as Item).progress = e.text; this.countCalls(e.id); }
    } else if (k === EV_ERROR) {
      run.item.setDetail(head(e.text, DETAIL_CAP));
    } else if (k === EV_DONE) {
      this.endTurn(run, run.item.detail() !== '' ? S_ERROR : S_DONE, '');
      this.machine.finish();
      return;
    }
    this.bump();
  }

  /** A stdout line too long to parse: it was spilled whole; its head tells which tool's output it is. */
  private bigLine(run: Run, start: string, spill: Spill): void {
    const at = this.agent.bigLine(start);
    const t = at.length === 2 ? this.tools.get(at[0]) : undefined;
    if (t !== undefined) {
      const it = t as Item;
      it.setOutput(head(unescapeLoose(start.slice(parseInt(at[1])), true), OUTPUT_HEAD));
      it.spill = spill;
      this.closeTool(it, S_DONE, -1);
    } else {
      const n = this.add(K_TEXT, '', run.item.seq);
      n.setText(`(a line of ${spill.total} characters was not read; it is kept on disk)`);
      n.spill = spill;
      this.finish(n);
    }
    this.bump();
  }

  private closeTool(it: Item, status: i32, ms: number): void {
    it.ended = ms >= 0 ? it.started + ms : Date.now();
    it.setStatus(status);
    this.tools.delete(it.id);
    this.countCalls(it.parent);
    this.finish(it);
  }

  /** A subagent's card counts its calls and says what it does: `3 tools · 1 running · Reading notes.txt`. */
  private countCalls(agentId: string): void {
    if (agentId === '') return;
    const a = this.agentCalls.get(agentId);
    if (a === undefined) return;
    const it = a as Item;
    it.calls = 0;
    let running = 0;
    this.tools.forEach((t: Item, id: string) => { if (t.parent === agentId) running++; });
    for (const t of this.toolList) if (t.parent === agentId) it.calls++;
    const parts = [toolsLabel(it.calls)];
    if (running > 0) parts.push(`${running} running`);
    if (it.progress !== '' && it.status() === S_RUNNING) parts.push(it.progress);
    it.setNote(parts.join(' · '));
  }

  private closeText(): void {
    const t = this.textItem;
    if (t !== null) { this.finish(t as Item); this.textItem = null; }
  }

  private endTurn(run: Run, status: i32, error: string): void {
    if (run.ended) return;
    run.ended = true;
    const now = Date.now();
    this.closeText();
    // calls with no result yet: interrupted with the turn, or closed with it
    this.tools.forEach((t: Item, id: string) => { t.ended = now; t.setStatus(status === S_STOPPED ? S_STOPPED : S_DONE); this.finish(t); });
    this.tools = new Map<string, Item>();
    this.agentCalls.forEach((a: Item, id: string) => this.countCalls(id));
    const turn = run.item;
    if (error !== '') turn.setDetail(head(error, DETAIL_CAP));
    turn.ended = now;
    turn.setNote(toolsLabel(this.toolCount));   // what the disk keeps: the frame's flush may not have come yet
    turn.setStatus(status);
    this.finish(turn);
    this.live = new Map<i32, Item>();
    if (this.run === run) this.run = null;
    this.setOutcome(status);
    this.setUpdated(now);
    this.saveMeta();
    this.bump();
  }

  // ---- items ----

  /** A new item at the end of the conversation (in the window when the view follows the end). */
  private add(kind: i32, parent: string, turn: i32, id: string = '', name: string = ''): Item {
    const atEnd = this.shown && this.following && !this.hasNewer();
    const it = new Item(this.count, kind, turn);
    this.count++;
    it.id = id; it.name = name;   // before the window shows it: a row reads them once
    it.started = Date.now();
    if (parent !== '') {
      it.parent = parent;
      const a = this.agentCalls.get(parent);
      it.depth = a === undefined ? 1 : (a as Item).depth + 1;
    }
    this.live.set(it.seq, it);
    if (atEnd) {
      this.pending.push(it);
      if (this.pending.length > WINDOW_MAX) { this.pending.shift(); this.pendingCut = true; }   // never shown: on disk once finished
    }
    return it;
  }

  /** The item is finished: written to the transcript, no longer held unless the window shows it. */
  private finish(it: Item): void {
    if (!this.live.has(it.seq)) return;
    if (it.ended === 0) it.ended = Date.now();
    this.store.write(it);
    this.live.delete(it.seq);
  }

  private bump(): void { this.setRevision(this.revision() + 1); }

  saveMeta(): void {
    if (!this.persisted) return;
    try {
      fs.mkdir(this.store.dir, true);
      fs.writeText(this.store.dir + '/meta.json', JSON.stringify({
        id: this.id, agent: this.agent.id, folder: this.folder, title: this.title(), session: this.session,
        updated: this.updated(), outcome: this.outcome(),
      }) + '\n');
    } catch (e) { }   // a full disk: the conversation goes on, it is not kept
  }
}
