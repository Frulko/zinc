// Zinc Inspector (ZN-373.01): the Chrome DevTools protocol client of the panels, for plugins/devtools (the zinc:ui tree, styles, console,
// network, storage) and zinc debug --cdp (the debugger), with the readers of its results the panels share. Discovery over HTTP (/json/list),
// then a WebSocket of zinc:socket; the messages are JSON read as dynamic values.
import { WebSocket, MessageEvent } from 'zinc:socket';
import { fetch } from 'zinc:net';

export class Target {
  port: i32 = 0; title: string = ''; type: string = ''; ws: string = '';
  /** The title without its directory (zinc debug --cdp titles a target with the program's whole path). */
  name(): string { return this.title.slice(this.title.lastIndexOf('/') + 1); }
}

/** The programs that answer /json/list on these ports of this machine (an inspector of zinc:devtools: 9229; zinc debug --cdp: 9222). */
export async function discover(ports: i32[]): Promise<Target[]> {
  const out: Target[] = [];
  for (const port of ports) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`);
      const list = JSON.parse(await res.text());
      for (const t of list) {
        const x = new Target();
        x.port = port; x.title = t.title; x.type = t.type; x.ws = t.webSocketDebuggerUrl;
        out.push(x);
      }
    } catch (e) { /* nothing there */ }
  }
  return out;
}

/** One connection: calls answered by id, events to onEvent. */
export class Cdp {
  ws: WebSocket;
  next: i32 = 1;
  pending = new Map<i32, (result: any) => void>();
  onEvent: ((method: string, params: any) => void) | null = null;
  onClose: (() => void) | null = null;
  open: Promise<void>;
  constructor(url: string) {
    this.ws = new WebSocket(url);
    this.ws.onmessage = (e: MessageEvent) => {
      const m = JSON.parse(e.data);
      if (m.id !== undefined) {
        const id: i32 = m.id;
        const f = this.pending.get(id);
        if (f !== undefined) { this.pending.delete(id); f(m.result !== undefined ? m.result : m.error); }
      } else if (this.onEvent !== null) {
        const method: string = m.method;
        (this.onEvent as (method: string, params: any) => void)(method, m.params);
      }
    };
    this.ws.onclose = () => { if (this.onClose !== null) (this.onClose as () => void)(); };
    this.open = new Promise<void>((resolve) => { this.ws.onopen = () => { resolve(); }; });
  }
  /** A method with its parameters as JSON text; the result (or the error) as a dynamic value. */
  call(method: string, params: string): Promise<any> {
    const id = this.next++;
    return new Promise<any>((resolve) => {
      this.pending.set(id, resolve);
      this.ws.send(`{"id":${id},"method":${JSON.stringify(method)},"params":${params}}`);
    });
  }
  close(): void { this.ws.close(); }
}

/** A computed style as name: value lines. */
export function styleLines(computed: any): string[] {
  const out: string[] = [];
  const list = computed.computedStyle;
  if (list !== undefined) for (const p of list) { const n: string = p.name; const v: string = p.value; out.push(n + ': ' + v); }
  return out;
}

/** A Runtime.consoleAPICalled event as a line: its type and its arguments. */
export function consoleLine(params: any): string {
  let text = '';
  for (const a of params.args) { const v: string = a.value !== undefined ? '' + a.value : a.description !== undefined ? a.description : ''; text += (text.length > 0 ? ' ' : '') + v; }
  const type: string = params.type;
  return type + ': ' + text;
}

/** The matched rules of CSS.getMatchedStylesForNode as lines: each rule's selector, then its properties (ZN-373.02). */
export function ruleLines(matched: any): string[] {
  const out: string[] = [];
  const rules = matched.matchedCSSRules;
  if (rules !== undefined) for (const m of rules) {
    const sel: string = m.rule.selectorList.text;
    out.push(sel + ' {');
    for (const p of m.rule.style.cssProperties) { const n: string = p.name; const v: string = p.value; out.push('  ' + n + ': ' + v + ';'); }
    out.push('}');
  }
  return out;
}

/** element.style of a node: its text, and the style sheet id and range CSS.setStyleTexts takes back. */
export class Inline { sheet: string = ''; range: string = ''; text: string = ''; }
export function inlineOf(style: any): Inline {
  const i = new Inline();
  if (style === undefined) return i;
  i.sheet = style.styleSheetId; i.text = style.cssText;
  const r = style.range;
  const sl: number = r.startLine; const sc: number = r.startColumn; const el: number = r.endLine; const ec: number = r.endColumn;
  i.range = `{"startLine":${sl},"startColumn":${sc},"endLine":${el},"endColumn":${ec}}`;
  return i;
}

/** A script of the Sources view (ZN-373.04): its id and URL, from Debugger.scriptParsed. */
export class Script { id: string = ''; url: string = ''; name(): string { return this.url.slice(this.url.lastIndexOf('/') + 1); } }
/** A frame of the paused program: its function, script, line (1-based) and the object ids of its scopes. */
export class Frame { id: string = ''; name: string = ''; script: string = ''; line: i32 = 0; scopes: string[] = []; scopeNames: string[] = []; }
export function framesOf(params: any): Frame[] {
  const out: Frame[] = [];
  for (const f of params.callFrames) {
    const x = new Frame();
    x.id = f.callFrameId; x.name = f.functionName; x.script = f.location.scriptId;
    const l: i32 = f.location.lineNumber; x.line = l + 1;
    for (const s of f.scopeChain) { const id: string = s.object.objectId; const n: string = s.type; x.scopes.push(id); x.scopeNames.push(n); }
    out.push(x);
  }
  return out;
}
/** A property of Runtime.getProperties as `name: value`, and the object id of an object or array to unfold ('' otherwise). */
export class Prop { name: string = ''; value: string = ''; objectId: string = ''; }
export function propsOf(result: any): Prop[] {
  const out: Prop[] = [];
  if (result.result === undefined) return out;
  for (const p of result.result) {
    const x = new Prop();
    x.name = p.name;
    x.value = remoteText(p.value);
    if (p.value.objectId !== undefined) x.objectId = p.value.objectId;
    out.push(x);
  }
  return out;
}
/** A RemoteObject as the console writes it. */
export function remoteText(v: any): string {
  const type: string = v.type;
  if (type === 'string') { const s: string = v.value; return JSON.stringify(s); }
  if (v.value !== undefined && type !== 'object') return '' + v.value;
  if (v.unserializableValue !== undefined) { const u: string = v.unserializableValue; return u; }
  if (v.subtype !== undefined && v.subtype === 'null') return 'null';
  return v.description !== undefined ? v.description : type;
}

/** A frame of a recorded trace (ZN-373.05): its start and length in µs and its phases in order, from the runtime's spans on the main thread. */
export class TraceFrame { ts: number = 0; dur: number = 0; phases: string[] = []; durs: number[] = []; }
/** The frames of Tracing.dataCollected events: the "zinc frame" spans, each with the phase spans it holds. */
export function traceFrames(events: any[]): TraceFrame[] {
  const frames: TraceFrame[] = [];
  const names: string[] = []; const starts: number[] = []; const lengths: number[] = [];
  for (const e of events) {
    const ph: string = e.ph; const tid: i32 = e.tid;
    if (ph !== 'X' || tid !== 1) continue;
    const name: string = e.name; const ts: number = e.ts; const dur: number = e.dur;
    if (name === 'zinc frame') { const f = new TraceFrame(); f.ts = ts; f.dur = dur; frames.push(f); }
    else { names.push(name); starts.push(ts); lengths.push(dur); }
  }
  frames.sort((a: TraceFrame, b: TraceFrame) => a.ts - b.ts);
  const order: i32[] = [];
  for (let i = 0; i < names.length; i++) order.push(i);
  order.sort((a: i32, b: i32) => starts[a] - starts[b]);
  let k = 0;   // both in time order: one pass
  for (const i of order) {
    while (k < frames.length && frames[k].ts + frames[k].dur < starts[i] + lengths[i]) k++;
    if (k === frames.length) break;
    const f = frames[k];
    if (starts[i] >= f.ts) { f.phases.push(names[i]); f.durs.push(lengths[i]); }
  }
  return frames;
}
/** The time of each phase over the frames and the frames it ran in, the longest first. */
export class PhaseTotal { name: string = ''; total: number = 0; count: i32 = 0; last: i32 = -1; }
export function phaseTotals(frames: TraceFrame[]): PhaseTotal[] {
  const out: PhaseTotal[] = [];
  for (let fi = 0; fi < frames.length; fi++) for (let i = 0; i < frames[fi].phases.length; i++) {
    const f = frames[fi];
    let t: PhaseTotal | null = null;
    for (const x of out) if (x.name === f.phases[i]) t = x;
    if (t === null) { t = new PhaseTotal(); t.name = f.phases[i]; out.push(t); }
    const p = t as PhaseTotal;
    p.total += f.durs[i];
    if (p.last !== fi) { p.count++; p.last = fi; }   // a phase can run twice in a frame (input, layout)
  }
  out.sort((a: PhaseTotal, b: PhaseTotal) => b.total - a.total);
  return out;
}
/** µs as "850 µs" or "12.34 ms". */
export function msText(us: number): string { return us < 1000 ? Math.round(us) + ' µs' : (Math.round(us / 10) / 100).toFixed(2) + ' ms'; }

/** A thread of a recorded trace: its name (the trace's thread_name), its slices (start and length in µs, name), its busy time and the message
 *  flows that start (post) and end (handler) on it. */
export class Track { tid: i32 = 0; name: string = ''; ts: number[] = []; durs: number[] = []; names: string[] = []; busy: number = 0; flowsOut: i32 = 0; flowsIn: i32 = 0; }
/** One track per thread of Tracing.dataCollected events, the main thread first; a worker's slices are its onmessage spans and its messages. */
export function traceTracks(events: any[]): Track[] {
  const out: Track[] = [];
  const at = (tid: i32): Track => {
    for (const t of out) if (t.tid === tid) return t;
    const t = new Track(); t.tid = tid; t.name = tid === 1 ? 'main' : 'thread ' + tid; out.push(t);
    return t;
  };
  for (const e of events) {
    const ph: string = e.ph; const tid: i32 = e.tid; const name: string = e.name;
    if (tid >= 10 && tid < 100) continue;   // the raster bands: part of the main thread's frames
    if (ph === 'M') { if (name === 'thread_name' && tid !== 1) { const n: string = e.args.name; at(tid).name = n; } continue; }
    const t = at(tid);
    if (ph === 'X') {
      const ts: number = e.ts; const dur: number = e.dur;
      t.ts.push(ts); t.durs.push(dur); t.names.push(name);
      if (name === 'zinc frame' || name.startsWith('onmessage')) t.busy += dur;
    } else if (ph === 's') t.flowsOut++;
    else if (ph === 'f') t.flowsIn++;
  }
  out.sort((a: Track, b: Track) => a.tid - b.tid);
  return out;
}

/** A worker of Zinc.getThreads, as zn::rt::worker::snapshot() sees it. */
export class ThreadInfo { id: i32 = 0; name: string = ''; state: string = ''; queuedIn: i32 = 0; queuedOut: i32 = 0; messagesIn: number = 0; messagesOut: number = 0; liveBlocks: number = 0; cpuMs: number = 0; error: string = ''; }
export function threadsOf(result: any): ThreadInfo[] {
  const out: ThreadInfo[] = [];
  if (result.threads === undefined) return out;
  for (const t of result.threads) {
    const x = new ThreadInfo();
    x.id = t.id; x.name = t.name; x.state = t.state; x.queuedIn = t.queuedIn; x.queuedOut = t.queuedOut;
    x.messagesIn = t.messagesIn; x.messagesOut = t.messagesOut; x.liveBlocks = t.liveBlocks; x.cpuMs = t.cpuMs; x.error = t.error;
    out.push(x);
  }
  return out;
}
