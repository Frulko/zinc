// A conversation as a list of items (a message, the header of an answer, a paragraph, a tool call, the model's
// reasoning), each numbered by its place (`seq`). Every finished item is appended as one JSON line to the chat's
// transcript on disk, in segment files of SEG items, so any range of items reads back from a file or two and the app
// never needs to hold the conversation: the chat keeps a window of it in memory (chat.ts).
//
// An item holds a bounded text: past TEXT_CAP (a paragraph) or OUTPUT_HEAD (a tool's output) the whole text goes to
// part files on disk (Spill) and the item keeps its start and the length of the rest.
import { createSignal, createNodeRef, NodeRef } from 'zinc:ui/solid';
import * as fs from 'zinc:fs';
import { Spill, head } from './stream';
import { Usage, usageOf } from './usage';

export const K_USER = 0, K_TURN = 1, K_TEXT = 2, K_TOOL = 3, K_THINKING = 4;
export const S_RUNNING = 0, S_DONE = 1, S_ERROR = 2, S_STOPPED = 3;

/** Items per segment file. */
export const SEG = 64;
/** A paragraph's text kept in memory. */
export const TEXT_CAP = 16 * 1024;
/** A tool's output kept in memory: about a screen of it. */
export const OUTPUT_HEAD = 2048;

export class Item {
  readonly seq: i32;
  readonly kind: i32;
  /** The seq of its turn's K_TURN item (its own for a K_TURN, the user's for a K_USER). */
  readonly turn: i32;
  /** A tool call's id, its name (a turn: the agent's name). */
  id: string = '';
  name: string = '';
  /** The agent tool it belongs to ('' the main agent) and how deep that is. */
  parent: string = '';
  depth: i32 = 0;
  /** Epoch ms; `ended` 0 while it runs. */
  started: number = 0;
  ended: number = 0;
  /** A paragraph's text, a tool's input summary, a turn's settings. */
  readonly text: () => string;
  readonly setText: (v: string) => void;
  /** A tool's input in full (bounded: tools.ts DETAIL_CAP), a turn's error. */
  readonly detail: () => string;
  readonly setDetail: (v: string) => void;
  /** The start of a tool's output. */
  readonly output: () => string;
  readonly setOutput: (v: string) => void;
  readonly status: () => i32;
  readonly setStatus: (v: i32) => void;
  /** An agent tool: what its subagent does now; a turn: how many tools ran. */
  readonly note: () => string;
  readonly setNote: (v: string) => void;
  /** The card is open. */
  readonly open: () => boolean;
  readonly setOpen: (v: boolean) => void;
  /** The whole text (a paragraph's, a tool's output) when it outgrew what is kept; its length is `spill.total`. */
  spill: Spill | null = null;
  /** The node the chat drew it in: the scroll keeps its place when the window moves. */
  readonly ref: NodeRef = createNodeRef();
  /** A tool's input JSON as it streams (bounded), while it is not whole. */
  partial: string = '';
  /** An agent call: the calls its subagent made, and what it said it does now. */
  calls: i32 = 0;
  progress: string = '';
  /** A turn: its tokens and cost (live while it runs; null: none reported), its agent calls and its failed tools. */
  readonly usage: () => Usage | null;
  readonly setUsage: (v: Usage | null) => void;
  tools: i32 = 0;
  agents: i32 = 0;
  failed: i32 = 0;

  constructor(seq: i32, kind: i32, turn: i32) {
    this.seq = seq; this.kind = kind; this.turn = turn;
    const t = createSignal(''), d = createSignal(''), o = createSignal(''), s = createSignal<i32>(S_DONE);
    const n = createSignal(''), op = createSignal(false), us = createSignal<Usage | null>(null);
    this.usage = us[0]; this.setUsage = us[1];
    this.text = t[0]; this.setText = t[1];
    this.detail = d[0]; this.setDetail = d[1];
    this.output = o[0]; this.setOutput = o[1];
    this.status = s[0]; this.setStatus = s[1];
    this.note = n[0]; this.setNote = n[1];
    this.open = op[0]; this.setOpen = op[1];
  }

  /** Characters it holds in memory. */
  chars(): number { return this.text().length + this.detail().length + this.output().length + this.partial.length + this.name.length; }

  /** Characters of the whole text that are only on disk. */
  hidden(): number {
    const s = this.spill;
    if (s === null) return 0;
    return (s as Spill).total - (this.kind === K_TOOL ? this.output().length : this.text().length);
  }

  /** Appends streamed text, keeping TEXT_CAP of it; the whole goes to `<prefix>.<k>.txt` once it is longer. */
  appendText(s: string, prefix: string): void {
    const sp = this.spill;
    if (sp !== null) { (sp as Spill).append(s); return; }
    const now = this.text();
    if (now.length + s.length <= TEXT_CAP) { this.setText(now + s); return; }
    const spill = new Spill(prefix, false, 0, 0);
    spill.append(now);
    spill.append(s);
    this.spill = spill;
    this.setText(head(now + s, TEXT_CAP));
  }

  /** A tool's output: its start in memory, the whole on disk when it is longer. */
  setFullOutput(s: string, prefix: string): void {
    if (s.length <= OUTPUT_HEAD) { this.setOutput(s); return; }
    const spill = new Spill(prefix, false, 0, 0);
    spill.append(s);
    this.spill = spill;
    this.setOutput(s.slice(0, OUTPUT_HEAD));
  }

  record(): string {
    const sp = this.spill;
    return JSON.stringify({
      seq: this.seq, kind: this.kind, turn: this.turn, id: this.id, name: this.name, parent: this.parent, depth: this.depth,
      started: this.started, ended: this.ended, text: this.text(), detail: this.detail(), output: this.output(),
      status: this.status(), note: this.note(), tools: this.tools, agents: this.agents, failed: this.failed,
      usage: (this.usage() === null ? new Usage() : this.usage() as Usage).json(),   // empty: none reported
      spill: sp === null ? '' : (sp as Spill).prefix, raw: sp !== null && (sp as Spill).raw,
      parts: sp === null ? 0 : (sp as Spill).parts, total: sp === null ? 0 : (sp as Spill).total,
    });
  }
}

function itemOf(j: any): Item {
  const it = new Item(j.seq as i32, j.kind as i32, j.turn as i32);
  it.id = '' + j.id; it.name = '' + j.name; it.parent = '' + j.parent; it.depth = j.depth as i32;
  it.started = j.started as number; it.ended = j.ended as number;
  it.setText('' + j.text); it.setDetail('' + j.detail); it.setOutput('' + j.output);
  it.setStatus(j.status as i32); it.setNote('' + j.note);
  if (j.usage !== undefined) { const u = usageOf(j.usage); if (!u.empty()) it.setUsage(u); }
  if (j.agents !== undefined) { it.tools = j.tools as i32; it.agents = j.agents as i32; it.failed = j.failed as i32; }
  else if (it.kind === K_TURN) it.tools = parseInt(it.note()) as i32;   // kept before the counts were: `3 tools`
  if ('' + j.spill !== '') it.spill = new Spill('' + j.spill, j.raw === true, j.parts as i32, j.total as number);
  return it;
}

/** A record() line of a tool call or of a subagent's item. The fields before `kind` and `depth` are a number and short strings,
 *  which JSON escapes: the first `"kind":` and `"depth":` of the line are the fields. */
function foldedLine(line: string): boolean { return line.indexOf('"kind":3,') >= 0 || line.indexOf('"depth":0,') < 0; }

/** A chat's items on disk: `<dir>/seg-<n>.jsonl`, and the spilled texts in `<dir>/out/`. */
export class Transcript {
  readonly dir: string;
  constructor(dir: string) { this.dir = dir; }

  /** Where the spilled text of item `seq` goes (`what`: 'text', 'output', 'stdout'...), in `out/` (made by Chat.send). */
  spillPrefix(seq: i32, what: string): string { return `${this.dir}/out/${seq}-${what}`; }

  /** Appends a finished item. */
  write(it: Item): void {
    fs.mkdir(this.dir, true);
    fs.appendText(`${this.dir}/seg-${Math.floor(it.seq / SEG)}.jsonl`, it.record() + '\n');
  }

  /** The finished items with lo <= seq < hi, in order; `folded`: without the tool calls and the subagents' items, whose lines
   *  are then skipped unparsed. */
  read(lo: i32, hi: i32, folded: boolean = false): Item[] {
    const found = new Map<i32, Item>();
    if (hi <= lo) return [];
    for (let s = Math.floor(lo / SEG); s <= Math.floor((hi - 1) / SEG); s++) {
      const path = `${this.dir}/seg-${s}.jsonl`;
      if (!fs.exists(path)) continue;
      let text = '';
      try { text = fs.readText(path); } catch (e) { continue; }
      for (const line of text.split('\n')) {
        if (line === '' || (folded && foldedLine(line))) continue;
        try {
          const j = JSON.parse(line);
          const seq = j.seq as i32;
          if (seq >= lo && seq < hi) found.set(seq, itemOf(j));   // written twice: the last one is the item's final state
        } catch (e) { }   // a line cut by a crash
      }
    }
    const out: Item[] = [];
    for (let seq = lo; seq < hi; seq++) { const it = found.get(seq); if (it !== undefined) out.push(it as Item); }
    return out;
  }

  /** One past the highest seq written (0 for an empty transcript). */
  count(): i32 {
    if (!fs.exists(this.dir)) return 0;
    let last = -1;
    for (const name of fs.list(this.dir)) {
      if (!name.startsWith('seg-')) continue;
      const n = parseInt(name.slice(4, name.length - 6));
      if (n > last) last = n;
    }
    if (last < 0) return 0;
    const items = this.read(last * SEG, (last + 1) * SEG);
    return items.length === 0 ? last * SEG : items[items.length - 1].seq + 1;
  }
}
