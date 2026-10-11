// Zinc Inspector (ZN-373.01): a Chrome DevTools protocol client written in Zinc, for plugins/devtools (the zinc:ui tree, styles, console,
// network) and zinc debug --cdp (the debugger). Discovery over HTTP (/json/list), then a WebSocket of zinc:socket; the messages are JSON read
// as dynamic values.
import { WebSocket, MessageEvent } from 'zinc:socket';
import { fetch } from 'zinc:net';

export class Target { port: i32 = 0; title: string = ''; type: string = ''; ws: string = ''; }

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
