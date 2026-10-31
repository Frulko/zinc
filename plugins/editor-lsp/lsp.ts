// The language server beside zinc:editor: one child per workspace folder (`zinc lsp`, or any server that speaks LSP over
// stdio), spoken to in JSON-RPC over its stdin and stdout (rpc.ts has the framing and reads the answers). Every open code
// editor is opened in it, changed (the whole text, once typing pauses or a request needs it) and closed; it answers
// completion, signature help, hover and definition, and sends the diagnostics of a file each time that file changes.
// Nothing here waits: a request is written and the editor goes on; an answer that comes after a newer request of its
// kind, or after its popup closed, is dropped. The child is restarted once if it dies; it ends when the folder changes,
// and with the app (its stdin closes). The app says what is open and how to start the server with `useLsp(config)`,
// then calls `stepLsp(dt)` once a frame; the editor's assistant (completion keys, hover) is plugged in by useLsp.
import { createSignal } from 'zinc:ui/solid';
import * as sys from 'zinc:sys';
import * as fs from 'zinc:fs';
import * as proc from 'zinc:process';
import { EditorState as Buffer, Diagnostic, T_COMMENT, T_STRING, Assist, setAssist } from 'zinc:editor';
import { isIdent, wordStart } from 'zinc:editor';
import { Reader, frame, uriOf, Item, itemsOf, filterItems, Sig, sigOf, hoverOf, problemsOf, Problem, placeOf, specStart, callStart } from './rpc';

/** What the client needs from the app. */
export class LspConfig {
  /** The open editors (their `path` names the document) and the active one. */
  buffers: () => Buffer[] = (): Buffer[] => [];
  active: () => Buffer | null = (): Buffer | null => null;
  /** The folder the server serves ('' for none: no server). */
  root: () => string = (): string => '';
  /** Starts the server in a folder. */
  spawn: (dir: string) => proc.Process = (dir: string): proc.Process => proc.spawn('zinc', ['lsp'], { cwd: dir });
  /** A message for the status line: 'stopped' (the server died twice), 'no-definition', 'outside' (`name` is a file outside the folder). */
  say: (what: string, name: string) => void = (what: string, name: string) => {};
  /** The diagnostics of an editor changed. */
  onDiagnostics: (b: Buffer) => void = (b: Buffer) => {};
  /** Opens a file of the folder at a line and column, 1-based (the editor owns the caret): a definition. */
  go: (path: string, line: i32, col: i32) => void = (path: string, line: i32, col: i32) => {};
  /** Which files are sent to the server. */
  isCode: (path: string) => boolean = (path: string): boolean => path.endsWith('.ts') || path.endsWith('.tsx') || path.endsWith('.js');
  /** Tests: every frame waits for the server's answers. */
  sync: boolean = false;
  /** Tests: the answers are printed ([lsp] lines). */
  echo: boolean = false;
}
let cfg: LspConfig = new LspConfig();
let sync: boolean = false, echo: boolean = false;
function buffers(): Buffer[] { return cfg.buffers(); }
function active(): Buffer | null { return cfg.active(); }
function isCode(path: string): boolean { return cfg.isCode(path); }

/** Plugs the client into the app and into the editor (completion keys, hover, definition, what is typed). */
export function useLsp(c: LspConfig): void {
  cfg = c; sync = c.sync; echo = c.echo;
  const a = new Assist();
  a.typed = typed; a.suggest = suggest; a.popupKey = popupKey; a.accepted = accepted; a.popupSpec = popupSpec;
  a.closePopup = closePopup; a.hideHover = hideHover; a.definition = definition; a.pointerOver = pointerOver;
  setAssist(a);
}

const PAUSE: number = 0.15;   // seconds without a keystroke before the text goes to the server
const REST: number = 0.35;    // seconds the pointer rests on a name before its card shows

let child: proc.Process | null = null;
let dir: string = '';             // the sketch the child serves
let restarted = false;
let reader = new Reader();
let sentPaths: string[] = [], sentTexts: string[] = [];   // the documents open in the server, and the text it has of each
let nextId: i32 = 1;
let waiting: i32 = 0;             // answers and diagnostics still to come
let compId: i32 = -1, sigId: i32 = -1, hoverId: i32 = -1, defId: i32 = -1;   // the request of each kind whose answer is wanted

function q(s: string): string { return JSON.stringify(s); }
function write(body: string): void { const c = child; if (c !== null) (c as proc.Process).write(frame(body)); }
function notify(method: string, params: string): void { write(`{"jsonrpc":"2.0","method":"${method}","params":${params}}`); }
function request(method: string, params: string): i32 {
  const id = nextId++;
  waiting++;
  write(`{"jsonrpc":"2.0","id":${id},"method":"${method}","params":${params}}`);
  return id;
}
/** The document and position of an offset, as the parameters of a request. */
function at(b: Buffer, off: i32): string {
  const l = b.doc.lineOf(off);
  return `{"textDocument":{"uri":${q(uriOf(b.path))}},"position":{"line":${l},"character":${off - b.doc.starts[l]}}}`;
}

function start(): void {
  reader = new Reader(); sentPaths = []; sentTexts = []; waiting = 0;
  compId = -1; sigId = -1; hoverId = -1; defId = -1;
  try {
    const p = cfg.spawn(dir);
    child = p;
    if (echo) console.log(`[lsp] started ${p.pid}`);
    p.onData((chunk: string, stderr: boolean) => { if (!stderr && child === p) for (const body of reader.push(chunk)) receive(body); });
    p.onExit((code: i32) => {
      if (child !== p) return;   // ended by stop()
      child = null; waiting = 0;
      closePopup(); setSig(null); setHover([]);
      if (!restarted) { restarted = true; start(); } else cfg.say('stopped', '');
    });
    request('initialize', `{"processId":null,"rootUri":${q(uriOf(dir))},"capabilities":{}}`);
    notify('initialized', '{}');
  } catch (e) { child = null; }
}
/** Ends the child: another sketch opens, or Atelier leaves. */
export function stopLsp(): void { stop(); }
function stop(): void {
  const c = child;
  child = null; waiting = 0;
  if (c !== null) (c as proc.Process).kill();
  closePopup(); setSig(null); setHover([]);
}

/** Sends the text of a tab when the server has an older one. */
function flush(b: Buffer): void {
  const i = sentPaths.indexOf(b.path), t = b.text();
  if (i < 0 || sentTexts[i] === t) return;
  sentTexts[i] = t;
  waiting++;   // its diagnostics
  notify('textDocument/didChange', `{"textDocument":{"uri":${q(uriOf(b.path))},"version":${nextId++}},"contentChanges":[{"text":${q(t)}}]}`);
}

function receive(body: string): void {
  let m: any = null;
  try { m = JSON.parse(body); } catch (e) { return; }
  if (typeof m.method === 'string') {
    if ((m.method as string) === 'textDocument/publishDiagnostics') { if (waiting > 0) waiting--; diagnostics(m.params); }
    return;
  }
  if (typeof m.id !== 'number') return;
  const id: i32 = m.id as i32;
  if (waiting > 0) waiting--;
  if (id === compId) { compId = -1; gotItems(itemsOf(m.result)); }
  else if (id === sigId) { sigId = -1; const s = sigOf(m.result); setSig(s); if (echo && s !== null) console.log(`[lsp] signature ${(s as Sig).label} [${(s as Sig).label.slice((s as Sig).from, (s as Sig).to)}]`); }
  else if (id === hoverId) { hoverId = -1; const h = hoverOf(m.result); setHover(h); if (echo && h.length > 0) console.log(`[lsp] hover ${h[0]}`); }
  else if (id === defId) { defId = -1; goPlace(placeOf(m.result)); }
}

function diagnostics(params: any): void {
  if (params === undefined || params === null || typeof params.uri !== 'string') return;
  const uri: string = params.uri as string;
  for (const b of buffers()) {
    if (uriOf(b.path) !== uri) continue;
    const list: Diagnostic[] = problemsOf(params).map((p: Problem) => new Diagnostic(p.line, p.col, p.severity, p.message));
    if (list.length === 0 && b.diagnostics().length === 0) return;
    b.setDiagnostics(list);
    cfg.onDiagnostics(b);
    return;
  }
}

let seenText: string = '', seenCaret: i32 = -1, quiet: number = 0;
/** Once per frame: the child follows the sketch, the documents follow the tabs, the popup follows the typing. */
export function stepLsp(dt: number): void {
  const d = cfg.root();
  if (d !== dir) { stop(); dir = d; restarted = false; if (d !== '') start(); }
  if (child === null) return;
  const list = buffers(), a = active();
  for (let i = sentPaths.length - 1; i >= 0; i--) {
    let open = false;
    for (const b of list) if (b.path === sentPaths[i]) open = true;
    if (open) continue;
    waiting++;   // the server clears the diagnostics of a closed document
    notify('textDocument/didClose', `{"textDocument":{"uri":${q(uriOf(sentPaths[i]))}}}`);
    sentPaths.splice(i, 1); sentTexts.splice(i, 1);
  }
  const text = a !== null ? (a as Buffer).text() : '', caret: i32 = a !== null ? (a as Buffer).sels[2 * (a as Buffer).main + 1] : -1;
  const changed = text !== seenText || caret !== seenCaret;
  if (changed) { seenText = text; seenCaret = caret; quiet = 0; } else quiet += dt;
  const calm = sync || quiet >= PAUSE;
  for (const b of list) {
    if (!isCode(b.path)) continue;
    if (sentPaths.indexOf(b.path) < 0) {
      sentPaths.push(b.path); sentTexts.push(b.text());
      waiting++;
      notify('textDocument/didOpen', `{"textDocument":{"uri":${q(uriOf(b.path))},"languageId":"typescript","version":0,"text":${q(b.text())}}}`);
    } else if (calm) flush(b);
  }
  trackPopup();
  if (a !== null && isCode((a as Buffer).path)) { trackCall(a as Buffer, changed, calm); trackHover(dt); }
  if (sync) { let n = 0; while (waiting > 0 && child !== null && n++ < 2000) sys.poll(5); }
}

// ---------------------------------------------------------------- completion
/** The rows of the popup, best first; empty: no popup. */
export const [popup, setPopup] = createSignal<Item[]>([]);
export const [popupRow, setPopupRow] = createSignal<i32>(0);
let popOpen = false;              // following the typing (rows may still be on their way)
let popBuf: Buffer | null = null, popAll: Item[] = [], popDot = false, popSpec = false, popMoved = false;
const NONE: string = '\u0000';
let popTyped: string = NONE;      // what the rows were filtered with

export function closePopup(): void {
  popOpen = false; compId = -1; popAll = []; popTyped = NONE;
  if (popup().length > 0) setPopup([]);
}
/** Opens the popup for the name (or the import's module) at the caret of `b` and asks the server what fits there. */
export function suggest(b: Buffer): void {
  if (child === null || !isCode(b.path)) return;
  const text = b.text(), caret = b.sels[2 * b.main + 1], from = wordStart(text, caret);
  popBuf = b; popOpen = true; popAll = []; popTyped = NONE; popMoved = false;
  popSpec = specStart(text, caret) >= 0;
  popDot = !popSpec && from > 0 && text.charCodeAt(from - 1) === 46;
  if (popup().length > 0) setPopup([]);
  flush(b);
  compId = request('textDocument/completion', at(b, caret));
}
function tokenAt(b: Buffer, off: i32): i32 {
  const l = b.doc.lineOf(off), runs = b.doc.tokens(l);
  let x: i32 = b.doc.starts[l];
  for (let i = 0; i + 1 < runs.length; i += 2) { x += runs[i]; if (off < x) return runs[i + 1]; }
  return -1;
}
let sigNow = false;
/** A character was typed in `b`: the start of a name, a dot, or the quote of an import open the popup; `(` and `,` ask for the signature at once. */
export function typed(b: Buffer, s: string): void {
  if (child === null || s.length !== 1 || !isCode(b.path)) return;
  const c = s.charCodeAt(0), text = b.text(), caret = b.sels[2 * b.main + 1];
  if (c === 40 || c === 44) sigNow = true;
  if (specStart(text, caret) >= 0) { if (!popOpen) suggest(b); return; }
  const tok = tokenAt(b, caret - 1);
  if (tok === T_COMMENT || tok === T_STRING) return;
  if (c === 46) {   // after a name, a call or an index; not the dot of 1.5
    const p = caret >= 2 ? text.charCodeAt(caret - 2) : 0, w = text.charCodeAt(wordStart(text, caret - 1));
    if ((isIdent(p) && !(w >= 48 && w <= 57)) || p === 41 || p === 93) suggest(b);
    return;
  }
  if (popOpen && popBuf === b) return;   // it follows the typing
  const from = wordStart(text, caret), first = text.charCodeAt(from);
  if (!isIdent(c) || (first >= 48 && first <= 57)) return;
  suggest(b);
}
function gotItems(items: Item[]): void {
  if (!popOpen) return;
  popAll = items; popTyped = NONE;
  trackPopup();
  if (echo) console.log(`[lsp] completion ${items.length} item(s), ${popup().length} shown${popup().length > 0 ? ': ' + popup()[0].label : ''}`);
}
/** Keeps the rows on what is typed; closes the popup when the caret leaves the name it was opened for. */
function trackPopup(): void {
  if (!popOpen) return;
  const b = popBuf as Buffer;
  if (active() !== b || b.sels[2 * b.main] !== b.sels[2 * b.main + 1]) { closePopup(); return; }
  const text = b.text(), caret = b.sels[2 * b.main + 1];
  let from: i32 = specStart(text, caret);
  if (!popSpec) {
    from = wordStart(text, caret);
    const dot = from > 0 && text.charCodeAt(from - 1) === 46;
    if (dot !== popDot || (!dot && from === caret)) { closePopup(); return; }
  } else if (from < 0) { closePopup(); return; }
  const typed = text.slice(from, caret);
  if (typed === popTyped) return;
  popTyped = typed; popMoved = false;
  const rows = filterItems(popAll, typed, 40);
  setPopup(rows.length === 1 && rows[0].label === typed ? [] : rows);   // typed in full, nothing else to offer
  setPopupRow(0);
}
/** A key while the popup shows: 0 not for it, 1 done, 2 accept the selected row (`accepted()`). */
export function popupKey(key: string, plain: boolean): i32 {
  const rows = popup();
  if (rows.length === 0) { if (key === 'Escape' && popOpen) closePopup(); return 0; }
  if (!plain) return 0;
  if (key === 'ArrowDown' || key === 'ArrowUp') { setPopupRow((popupRow() + (key === 'ArrowDown' ? 1 : rows.length - 1)) % rows.length); popMoved = true; return 1; }
  if (key === 'Escape') { closePopup(); return 1; }
  if (key === 'Tab') return 2;
  // Enter on a name typed in full, the selection not moved, is a line break, not a choice
  if (key === 'Enter') { if (!popMoved && rows[popupRow()].label === popTyped) { closePopup(); return 0; } return 2; }
  return 0;
}
export function accepted(): string { const rows = popup(); return rows.length > 0 ? rows[Math.min(popupRow(), rows.length - 1)].label : ''; }
export function popupSpec(): boolean { return popSpec; }
/** The editor the popup completes in. */
export function popupEditor(): Buffer | null { return popOpen ? popBuf : null; }
/** Offset where the name the popup completes starts (the popup hangs under it). */
export function popupFrom(): i32 {
  if (!popOpen || popBuf === null) return -1;
  const b = popBuf as Buffer, text = b.text(), caret = b.sels[2 * b.main + 1];
  return popSpec ? Math.max(0, specStart(text, caret)) : wordStart(text, caret);
}

// ---------------------------------------------------------------- signature of the call the caret is in
export const [sig, setSig] = createSignal<Sig | null>(null);
let sigDue = false;
function trackCall(b: Buffer, changed: boolean, calm: boolean): void {
  const caret = b.sels[2 * b.main + 1];
  if (changed) {
    sigDue = callStart(b.text(), caret) >= 0;
    if (!sigDue) { sigId = -1; if (sig() !== null) setSig(null); }
  }
  if (sigDue && (calm || sigNow)) { sigDue = false; flush(b); sigId = request('textDocument/signatureHelp', at(b, caret)); }
  sigNow = false;
}

// ---------------------------------------------------------------- hover: the type and doc of the name under the resting pointer
/** [code, text] of the card; empty: no card. */
export const [hover, setHover] = createSignal<string[]>([]);
let hovBuf: Buffer | null = null, hovOff: i32 = -1, hovRest: number = 0, hovAsked = true;
export function hoverFrom(): i32 { return hovOff; }
/** The pointer is over the name that starts at `off` in `b` (-1: over no name, or gone). */
export function pointerOver(b: Buffer, off: i32): void {
  if (b === hovBuf && off === hovOff) return;
  hovBuf = b; hovOff = off; hovRest = 0; hovAsked = off < 0; hoverId = -1;
  if (hover().length > 0) setHover([]);
}
/** A key or a click: the card goes, until the pointer rests on another name. */
export function hideHover(): void { hovAsked = true; hoverId = -1; if (hover().length > 0) setHover([]); }
function trackHover(dt: number): void {
  if (hovAsked || hovBuf !== active()) return;
  hovRest += dt;
  if (hovRest < REST) return;
  hovAsked = true;
  flush(hovBuf as Buffer);
  hoverId = request('textDocument/hover', at(hovBuf as Buffer, hovOff));
}

// ---------------------------------------------------------------- definition
/** Goes to where the name at `off` is declared (F12, Cmd+click). */
export function definition(b: Buffer, off: i32): void {
  if (child === null || !isCode(b.path)) return;
  flush(b);
  defId = request('textDocument/definition', at(b, off));
}
function goPlace(p: string[]): void {
  if (p.length === 0) { cfg.say('no-definition', ''); if (echo) console.log('[lsp] no definition'); return; }
  let path = p[0];
  for (const b of buffers()) if (b.path === path || sameFile(b.path, path)) path = b.path;
  if (echo) console.log(`[lsp] definition ${path.slice(path.lastIndexOf('/') + 1)}:${p[1]}:${p[2]}`);
  let real = dir;
  try { real = fs.realpath(dir); } catch (e) { }
  if (path.startsWith(dir + '/') || path.startsWith(real + '/')) cfg.go(path, parseInt(p[1]), parseInt(p[2]));
  else cfg.say('outside', path.slice(path.lastIndexOf('/') + 1));   // the standard library is not opened for editing
}
function sameFile(a: string, b: string): boolean { try { return fs.realpath(a) === fs.realpath(b); } catch (e) { return false; } }
