// Zinc Inspector (ZN-373.01): a Chrome DevTools protocol client written in Zinc, for plugins/devtools (the zinc:ui tree, styles, console,
// network) and zinc debug --cdp (the debugger). Discovery over HTTP (/json/list), then a WebSocket of zinc:socket; the messages are JSON read
// as dynamic values.
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

/** A row of the Elements tree: a node at its depth, as the Elements panel writes it. */
export class Row { nodeId: i32 = 0; depth: i32 = 0; label: string = ''; }

/** The rows of a DOM.getDocument tree: elements as <tag class="...">, text as "text", the document itself left out. */
export function rows(node: any, depth: i32, out: Row[]): Row[] {
  const type: i32 = node.nodeType;
  if (type === 1) {
    const r = new Row();
    r.nodeId = node.nodeId; r.depth = depth;
    let label = '<' + node.localName;
    const at = node.attributes;
    if (at !== undefined) for (let i = 0; i + 1 < at.length; i += 2) { const k: string = at[i]; const v: string = at[i + 1]; if (k === 'class' && v.length > 0) label += ' class="' + v + '"'; }
    r.label = label + '>';
    out.push(r);
  } else if (type === 3) {
    const r = new Row();
    r.nodeId = node.nodeId; r.depth = depth; r.label = '"' + node.nodeValue + '"';
    out.push(r);
  }
  const kids = node.children;
  if (kids !== undefined) for (const k of kids) rows(k, type === 9 ? depth : depth + 1, out);
  return out;
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

/** A request of the Network view (ZN-373.03), built from the Network events of zinc:devtools. */
export class Req {
  id: string = ''; method: string = ''; url: string = ''; type: string = ''; status: i32 = 0; error: string = '';
  start: number = 0; end: number = -1; size: i32 = 0; frames: i32 = 0;
  /** One line: method, status (or the error), the path, the time and the size. */
  line(): string {
    const u = this.url.indexOf('://') >= 0 ? this.url.slice(this.url.indexOf('/', this.url.indexOf('://') + 3)) : this.url;
    const ms = this.end >= 0 ? Math.round((this.end - this.start) * 1000) + ' ms' : 'pending';
    return this.method + ' ' + (this.error.length > 0 ? this.error : this.status > 0 ? '' + this.status : '…') + ' ' + (u.length > 0 ? u : this.url) + ' ' + ms +
      (this.frames > 0 ? ' ' + this.frames + ' frames' : ' ' + this.size + ' B');
  }
}

/** Applies a Network event to the requests (in the order they started); false when it is not one. */
export function applyNetwork(reqs: Req[], method: string, params: any): boolean {
  if (!method.startsWith('Network.')) return false;
  const id: string = params.requestId;
  let r: Req | null = null;
  for (const x of reqs) if (x.id === id) r = x;
  if (method === 'Network.requestWillBeSent' || method === 'Network.webSocketCreated') {
    if (r === null) { r = new Req(); r.id = id; reqs.push(r); }
    const q = r as Req;
    if (method === 'Network.webSocketCreated') { q.method = 'WS'; q.url = params.url; q.type = 'WebSocket'; q.start = 0; return true; }
    q.method = params.request.method; q.url = params.request.url; q.type = params.type; q.start = params.timestamp;
    return true;
  }
  if (r === null) return true;
  const q = r as Req;
  if (method === 'Network.responseReceived') { q.status = params.response.status; }
  else if (method === 'Network.loadingFinished') { q.end = params.timestamp; q.size = params.encodedDataLength; }
  else if (method === 'Network.loadingFailed') { q.end = params.timestamp; q.error = params.errorText; }
  else if (method === 'Network.webSocketFrameSent' || method === 'Network.webSocketFrameReceived') q.frames++;
  return true;
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
