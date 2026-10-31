// Open files (buffers) and tabs. Zed's tab semantics: a file opened with a single click in the project panel is a
// *preview* (italic title) that the next preview replaces; editing it, double-clicking it, or opening it from the
// file finder keeps it. A buffer is modified while its text differs from the last saved text; ⌘S writes it.
import { createSignal, NodeRef } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import * as fs from 'zinc:fs';
import { EditorState, Diagnostic, edited, setOnEdited, langOf } from 'zinc:editor';
export { Diagnostic, edited };

/** An open file: the editor's state (zinc:editor), its path, its tab name, the text last saved and whether it is a preview. */
export class Buffer extends EditorState {
  name: string;
  saved: () => string; setSaved: (v: string) => void;
  preview: () => boolean; setPreview: (v: boolean) => void;
  crlf: boolean;
  constructor(path: string, name: string, text: string, preview: boolean) {
    const crlf = text.indexOf('\r\n') >= 0;
    const t = crlf ? text.replaceAll('\r\n', '\n') : text;
    super(path, t, langOf(path));
    this.name = name;
    this.crlf = crlf;
    const [b, sb] = createSignal<string>(t); this.saved = b; this.setSaved = sb;
    const [c, sc] = createSignal<boolean>(preview); this.preview = c; this.setPreview = sc;
  }
  modified(): boolean { return this.text() !== this.saved(); }
}
// a buffer edited by the user is no longer a preview
setOnEdited((s: EditorState) => { const b = s as Buffer; if (b.preview() && b.modified()) b.setPreview(false); });

export const [buffers, setBuffers] = createSignal<Buffer[]>([]);
export const [active, setActiveSignal] = createSignal<Buffer | null>(null);
/** Short message on the status bar ('Saved src/main.ts'), cleared after a few seconds by the frame loop. */
export const [notice, setNotice] = createSignal<string>('');
let noticeAge: number = 0;
export function say(s: string): void { setNotice(s); noticeAge = 0; }
export function stepNotice(dt: number): void { if (notice() !== '') { noticeAge += dt; if (noticeAge > 3) setNotice(''); } }

/** Hooks set by the app (diagnostics), so this module does not depend on them. */
let onOpened: (b: Buffer) => void = (b: Buffer) => {};
let onSaved: (b: Buffer) => void = (b: Buffer) => {};
export function setHooks(opened: (b: Buffer) => void, saved: (b: Buffer) => void): void { onOpened = opened; onSaved = saved; }

let focusWanted: Buffer | null = null;
/** Shows a buffer; its editor takes the keyboard focus at the next frame (after the press that opened it). */
export function activate(b: Buffer, focus: boolean = true): void {
  setActiveSignal(b);
  if (focus) { focusWanted = b; nodeWanted = -1; }
}
let nodeWanted: i32 = -1;
/** Focuses a node at the next frame: after the pointer press being handled (which moves the focus itself). */
export function focusLater(h: i32): void { nodeWanted = h; focusWanted = null; }
/** Called once per frame: gives the focus asked by activate() / focusLater(). */
export function applyFocus(): void {
  if (nodeWanted >= 0) { ui.focusNode(nodeWanted); nodeWanted = -1; return; }
  const b = focusWanted;
  if (b === null || (b as Buffer).node() < 0) return;
  ui.focusNode((b as Buffer).node());
  focusWanted = null;
}

/** Opens a file (or switches to it). `preview`: replace the current preview tab instead of adding one. */
export function openFile(path: string, name: string, preview: boolean, focus: boolean = true): Buffer | null {
  for (const b of buffers()) if (b.path === path) {
    if (!preview) b.setPreview(false);
    activate(b, focus);
    return b;
  }
  let text = '';
  try { text = fs.readText(path); } catch (e) { say(`Cannot open ${name}`); return null; }
  const b = new Buffer(path, name, text, preview);
  const list = buffers().slice();
  // the new tab goes after the active one; a preview takes the place of the previous preview
  let at = list.length;
  const cur = active();
  if (cur !== null) at = list.indexOf(cur as Buffer) + 1;
  if (preview) {
    let old: i32 = -1;
    for (let i = 0; i < list.length; i++) if (list[i].preview() && !list[i].modified()) old = i;
    if (old >= 0) { list.splice(old, 1); if (old < at) at--; }
  }
  const k = Math.min(at, list.length);
  setBuffers(list.slice(0, k).concat([b]).concat(list.slice(k)));
  activate(b, focus);
  onOpened(b);
  return b;
}

let confirmClose: Buffer | null = null;
/** Closes a tab; a modified buffer asks first (the second close discards its changes). */
export function closeBuffer(b: Buffer): void {
  if (b.modified() && confirmClose !== b) {
    confirmClose = b;
    say(`${b.name} has unsaved changes: ⌘S saves, close again to discard`);
    return;
  }
  confirmClose = null;
  const list = buffers().slice();
  const i = list.indexOf(b);
  if (i < 0) return;
  list.splice(i, 1);
  setBuffers(list);
  if (active() === b) {
    if (list.length === 0) setActiveSignal(null);
    else activate(list[Math.min(i, list.length - 1)]);
  }
}

export function save(b: Buffer): void {
  const t = b.text();
  try { fs.writeText(b.path, b.crlf ? t.replaceAll('\n', '\r\n') : t); } catch (e) { say(`Cannot save ${b.name}`); return; }
  b.setSaved(t);
  b.setPreview(false);
  say(`Saved ${b.name}`);
  onSaved(b);
}


/** Next / previous tab (⌃Tab, ⌘⇧[ ]). */
export function cycle(step: i32): void {
  const list = buffers(), cur = active();
  if (list.length === 0 || cur === null) return;
  const i = list.indexOf(cur as Buffer);
  activate(list[(i + step + list.length) % list.length]);
}
