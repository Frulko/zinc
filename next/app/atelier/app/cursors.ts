// Between the text field and edit.ts. The field (<TextArea>) keeps one caret, types, scrolls and draws; the buffer keeps
// the selections (several) and the undo history, and every command is a function of edit.ts applied to (text, selections),
// then shown: the text set in the field, the main selection given to it, the others drawn by the editor.
// What the field does by itself (typed characters, its paste and cut, the pointer) is read back: `nativeInput` repeats
// typed text at the other cursors and closes brackets, `sync` follows a selection made with the pointer or the arrows.
import * as ui from 'zinc:ui';
import * as sys from 'zinc:sys';
import { clipboardText, setClipboardText } from 'zinc:gfx';
import { Buffer, active, edited } from './workspace';
import { Ed, one, typeText, paste, copyText, erase, newline, indent, outdent, toggleComment, deleteLines, duplicateLines, moveLines,
  single, addSel, setMain, selectNext, addCursorV, move, M_LEFT, M_RIGHT, M_WORD_LEFT, M_WORD_RIGHT, M_HOME, M_END, M_UP, M_DOWN, M_TOP, M_BOTTOM } from './edit';

/** True when the desktop menu takes the shortcuts of its items (macOS): the editor then leaves them to it, else each would run twice. */
let menuKeys = false;
export function setMenuKeys(on: boolean): void { menuKeys = on; }

function state(b: Buffer): Ed { return new Ed(b.text(), b.sels, b.main); }

/** Follows the field: when its caret or selection is not the buffer's main one, the pointer or a key of the field moved it.
 *  It becomes one more cursor after an Alt+click, the main one while that drag lasts, and the only one otherwise. */
export function sync(b: Buffer): void {
  const h = b.node();
  if (h < 0) return;
  const c = ui.caretOf(h), sel = ui.selectedText(h), n = sel.length;
  const a0 = b.sels[2 * b.main], h0 = b.sels[2 * b.main + 1];
  if (c === h0 && n === Math.abs(a0 - h0) && !b.collapse) { b.addNext = false; return; }
  // ponytail: zinc:ui gives the caret and the selected text, not the anchor: the side the text is on, and the anchor
  // the buffer had when both sides read the same; an anchorOf() in zinc:ui would end the guess
  let a = c;
  if (n > 0) {
    const t = b.text(), back = c >= n && t.slice(c - n, c) === sel, fwd = t.slice(c, c + n) === sel;
    a = back && fwd ? (a0 === c + n ? c + n : c - n) : fwd ? c + n : c - n;
  }
  const st = state(b);
  const r = b.collapse ? one(st.text, a, c) : b.addNext ? addSel(st, a, c) : b.dragAdd && st.count() > 1 ? setMain(st, a, c) : one(st.text, a, c);
  b.sels = r.sels; b.main = r.main;
  b.addNext = false; b.collapse = false; b.hist.typing = false;
  ui.repaint();
}

/** Shows a state in the field and keeps it in the buffer; `before` (when the text changed) goes to the undo history. */
function show(b: Buffer, r: Ed, before: Ed | null, typing: boolean): void {
  const h = b.node();
  if (before !== null && r.text !== (before as Ed).text) b.hist.record(before as Ed, typing); else if (!typing) b.hist.typing = false;
  b.sels = r.sels; b.main = r.main;
  if (h >= 0) {
    if (ui.getValue(h) !== r.text) ui.setValue(h, r.text);
    ui.select(h, r.anchor(r.main), r.head(r.main));
  }
  if (r.text !== b.text()) edited(b, r.text);
  ui.repaint();
}

/** The field changed its text by itself. Text typed (or pasted) over the main selection is typed at every cursor, with the
 *  closing bracket or quote of a typed opening one; anything else (its word delete, its cut) is taken as it is. */
export function nativeInput(b: Buffer, v: string): void {
  const h = b.node(), old = b.text();
  if (v === old || h < 0) return;
  const before = state(b), caret = ui.caretOf(h), m0 = before.lo(before.main), m1 = before.hi(before.main);
  let r: Ed, typing = false;
  if (!b.collapse && old.length - v.length + caret === m1 && caret > m0) {
    const s = v.slice(m0, caret);
    typing = s.length === 1;
    r = typeText(before, s, typing);
  } else r = one(v, caret, caret);
  b.collapse = false; b.addNext = false;
  show(b, r, before, typing);
}

/** Replaces the whole text of a buffer as one edit that undo takes back (a library's import line). */
export function setText(b: Buffer, text: string): void { sync(b); const st = state(b); show(b, one(text, st.head(st.main), st.head(st.main)), st, false); }

export function undo(b: Buffer, redo: boolean): void {
  sync(b);
  const now = state(b), to = redo ? b.hist.forward(now) : b.hist.back(now);
  if (to !== null) show(b, to as Ed, null, false);
}

/** The editing commands of the menu and the palette, by id; false when `id` is not one. */
export function editCommand(id: string): boolean {
  const b = active();
  if (b === null || (b as Buffer).node() < 0) return false;
  const buf = b as Buffer;
  sync(buf);
  const st = state(buf);
  let r: Ed;
  if (id === 'comment') r = toggleComment(st);
  else if (id === 'indent') r = indent(st);
  else if (id === 'outdent') r = outdent(st);
  else if (id === 'select-next') r = selectNext(st);
  else if (id === 'cursor-above') r = addCursorV(st, -1);
  else if (id === 'cursor-below') r = addCursorV(st, 1);
  else if (id === 'line-delete') r = deleteLines(st);
  else if (id === 'line-duplicate') r = duplicateLines(st);
  else if (id === 'line-up') r = moveLines(st, -1);
  else if (id === 'line-down') r = moveLines(st, 1);
  else if (id === 'undo') { undo(buf, false); return true; }
  else if (id === 'redo') { undo(buf, true); return true; }
  else return false;
  show(buf, r, st, false);
  return true;
}

/** The shortcut of an editing command that the menu also lists ('' for another key). */
function menuCommand(e: ui.KeyEvent): string {
  const k = e.key, cmd = e.primary;
  if (cmd && e.alt && k === 'ArrowUp') return 'cursor-above';
  if (cmd && e.alt && k === 'ArrowDown') return 'cursor-below';
  if (e.alt && !cmd && k === 'ArrowUp') return 'line-up';
  if (e.alt && !cmd && k === 'ArrowDown') return 'line-down';
  if (!cmd || e.alt) return '';
  if (k === '/' || (k === ':' && e.shift)) return 'comment';   // AZERTY: / is Shift+:
  if (k === 'd') return e.shift ? 'line-duplicate' : 'select-next';
  if (k === 'k' && e.shift) return 'line-delete';
  if (k === 'z') return e.shift ? 'redo' : 'undo';
  if (k === 'y') return 'redo';
  return '';
}

/** Keys of the editor, before the field's own handling. Returns true when the key is done (the field must not see it). */
export function editorKey(b: Buffer, e: ui.KeyEvent, escape: () => void): boolean {
  sawKey(e);
  sync(b);
  const st = state(b), multi = st.count() > 1, k = e.key, cmd = e.primary, plain = !cmd && !e.alt && !e.ctrl;
  const c = menuCommand(e);
  if (c !== '') {
    // undo and redo are the buffer's, never the field's; the others are the menu's on macOS
    if (c === 'undo' || c === 'redo' || !menuKeys) editCommand(c);
    return true;
  }
  let r: Ed | null = null;
  if (k === 'Tab' && plain) r = e.shift ? outdent(st) : indent(st);
  else if (k === 'Enter' && plain) r = newline(st);
  else if ((k === 'Backspace' || k === 'Delete') && (multi || plain)) r = erase(st, k === 'Delete');   // ponytail: with several cursors, Alt and Cmd delete one character too
  else if (k === 'Escape') { if (multi) r = single(st); else { escape(); return true; } }
  else if (multi) {
    const byWord = e.alt, byLine = e.meta;
    if (k === 'ArrowLeft') r = move(st, byLine ? M_HOME : byWord ? M_WORD_LEFT : M_LEFT, e.shift);
    else if (k === 'ArrowRight') r = move(st, byLine ? M_END : byWord ? M_WORD_RIGHT : M_RIGHT, e.shift);
    else if (k === 'ArrowUp') r = move(st, byLine ? M_TOP : M_UP, e.shift);
    else if (k === 'ArrowDown') r = move(st, byLine ? M_BOTTOM : M_DOWN, e.shift);
    else if (k === 'Home') r = move(st, M_HOME, e.shift);
    else if (k === 'End') r = move(st, M_END, e.shift);
    else if (cmd && (k === 'c' || k === 'x')) { const t = copyText(st); if (t !== '') setClipboardText(t); r = k === 'x' ? typeText(st, '', false) : st; }
    else if (cmd && k === 'v') { const t = clipboardText(); r = t === '' ? st : paste(st, t); }
  }
  if (r === null) return false;
  show(b, r as Ed, st, false);
  return true;
}

/** The pointer goes down in the editor: with Alt the selection it makes is one more cursor, else it is the only one. */
export function editorPress(b: Buffer, alt: boolean): void {
  if (alt) { b.addNext = true; b.dragAdd = true; } else { b.collapse = b.sels.length > 2; b.dragAdd = false; }
}

/** Puts the caret at a line and column (1-based) of a buffer, once its field exists: a click on an error, a diagnostic. */
let jumpBuf: Buffer | null = null, jumpLine: i32 = 0, jumpCol: i32 = 0;
export function jumpTo(b: Buffer, line: i32, col: i32): void { jumpBuf = b; jumpLine = line; jumpCol = col; }

/** Once per frame: follows the field of the active buffer and makes the jump asked. */
export function stepCursors(): void {
  const a = active();
  if (a === null || (a as Buffer).node() < 0) return;
  const b = a as Buffer;
  if (jumpBuf === b) {
    const l: i32 = Math.max(0, Math.min(b.doc.lineCount() - 1, jumpLine - 1));
    const p: i32 = Math.min(b.doc.lineEnd(l), b.doc.starts[l] + Math.max(0, jumpCol - 1));
    jumpBuf = null;
    show(b, one(b.text(), p, p), null, false);
    ui.focusNode(b.node());
    return;
  }
  sync(b);
}

// ---------------------------------------------------------------- the Edit menu's standard items and their keys
// On macOS a shortcut of the menu reaches the program twice: as the key (the field handles ⌘C itself) and as the click of
// the menu item. The item's click is replayed as a key only when no such key came with it: a click made with the mouse.
let keyAt: number = -1000, keyName: string = '';
let roleKey: string = '', roleMods: i32 = 0, roleAt: number = 0;
function sawKey(e: ui.KeyEvent): void { if (e.primary) { keyAt = sys.clock(); keyName = e.key; if (roleKey === e.key) roleKey = ''; } }
export function noteKey(e: ui.KeyEvent): void { sawKey(e); }
/** A standard item of the Edit menu was chosen: its key goes to the focused field two frames later, unless the key itself came. */
export function menuKey(key: string, mods: i32): void {
  if (keyName === key && sys.clock() - keyAt < 300) return;
  roleKey = key; roleMods = mods; roleAt = sys.clock();
}
export function stepMenuKeys(): void {
  if (roleKey === '' || sys.clock() - roleAt < 60) return;
  const k = roleKey;
  roleKey = '';
  ui.sendKey(k, roleMods);
}
