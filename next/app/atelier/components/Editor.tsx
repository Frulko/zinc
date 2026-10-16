// The editor card: the find bar and one code editor per open buffer (only the active one is shown: each keeps its caret
// and scroll). `stepEditor` runs every frame: it follows the caret and the scroll of the active editor and rebuilds its
// decorations (current line, matching brackets, search matches, diagnostics, the other selections) when one changed.
// The cursors beside the field's own caret are drawn on a canvas over it.
import { createSignal, createEffect, For } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { rrect, font, textWidth, clip, unclip } from 'zinc:gfx';
import { theme, bg, fg, bd, Theme } from '../app/theme';
import { active, buffers, Buffer, Diagnostic, cycle } from '../app/workspace';
import { findOpen, findT, findRef, query, setQuery, matches, current, next, closeFind, findFromCaret } from '../app/search';
import { matchBracket } from '../app/document';
import { editorKey, editorPress, nativeInput, noteKey } from '../app/cursors';
import { occurrences } from '../app/edit';
import { pointerOver } from '../app/lsp';
import { isIdent, wordStart } from '../app/rpc';
import { Popup, Signature, Hover, stepAssist } from './Assist';
import { revealActiveTab } from './Header';
import { Glyph, Kbd } from './Controls';
import { I_SEARCH, I_CLOSE } from './icons';

const FONT_PX: i32 = 14, PAD_LEFT: i32 = 14, PAD_TOP: i32 = 10;

/** Offset where the name under a point of the editor starts (the point in the field's own units), -1 over anything else. */
function nameAt(b: Buffer, x: number, y: number): i32 {
  const v = ui.editView(b.node()), doc = b.doc, line: i32 = Math.floor((y - PAD_TOP + v[1]) / v[4]);
  if (line < 0 || line >= doc.lineCount()) return -1;
  const s = doc.lines[line], col: i32 = Math.floor((x - PAD_LEFT - v[6] + v[0]) / textWidth(font('mono', FONT_PX), 'M', 0));
  return col < 0 || col >= s.length || !isIdent(s.charCodeAt(col)) ? -1 : doc.starts[line] + wordStart(s, col + 1);
}

// ---- one editor per buffer
function BufferEditor(props: { b: Buffer }): i32 {
  const b = props.b;
  const node = <TextArea ref={b.ref}
    className={`absolute inset-0 font-mono text-[14px] leading-[21] rounded-none border-0 pl-[14] pr-[8] pt-[10] pb-0 ${bg(theme().bg)} ${fg(theme().text)} focus:${bd(theme().bg)}`}
    style={{ hidden: active() === b ? 0 : 1 }}
    lineNumbers wrap={false} value={b.text()} onInput={(v: string) => nativeInput(b, v)}
    onKeyDown={(e: ui.KeyEvent) => {
      if (e.key === 'Tab' && e.ctrl) { cycle(e.shift ? -1 : 1); e.preventDefault(); }
      else if (editorKey(b, e, () => closeFind())) e.preventDefault();
    }}
    onPointerDown={(e: ui.PointerEvent) => { if (e.button === 0) editorPress(b, e.alt, e.meta); }}
    onPointerMove={(e: ui.PointerEvent) => pointerOver(b, nameAt(b, e.x, e.y))} onPointerLeave={(e: ui.PointerEvent) => pointerOver(b, -1)} />;
  ui.setHighlightAt(node, (line: string, start: i32) => b.doc.rowColors(line, start, theme()));
  createEffect(() => {
    const t = theme();
    ui.setEditColors(node, [t.lineNumber, t.lineNumberActive, -2, t.selection, t.caret, t.indentGuide]);
  });
  return node;
}

// ---- decorations of the active editor, rebuilt when something they depend on changed
let lastBuf: Buffer | null = null, lastCaret: i32 = -1, lastText: string = '', lastMatches: i32[] = [], lastCur: i32 = -1;
let lastTheme: Theme | null = null, lastTop: i32 = -1, lastDiag: Diagnostic[] = [], lastSels: i32[] = [];
/** [line, column, selected characters, cursors] of the active editor, for the status line. */
export const [caretInfo, setCaretInfo] = createSignal<i32[]>([1, 1, 0, 1]);

/** Column where the word starting at column i of `s` ends; from another character (a quote, an operator), where the run up to the next space, comma or semicolon ends. */
function wordEnd(s: string, i: i32): i32 {
  let j = i;
  while (j < s.length) { const c = s.charCodeAt(j); if (!((c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95)) break; j++; }
  if (j > i) return j;
  while (j < s.length) { const c = s.charCodeAt(j); if (c === 32 || c === 44 || c === 59) break; j++; }
  return j > i ? j : Math.min(s.length, i + 1);
}

function decorate(b: Buffer, caret: i32, top: i32, rows: i32): void {
  const t = theme(), h = b.node(), doc = b.doc;
  const marks: i32[] = [];
  const line = doc.lineOf(caret);
  const sel = ui.selectedText(h).length;
  if (sel === 0 && b.sels.length <= 2) { marks.push(doc.starts[line]); marks.push(doc.lineEnd(line)); marks.push(t.lineHighlight); marks.push(ui.MARK_LINE); }
  // the selections beside the field's own
  for (let i = 0; i + 1 < b.sels.length; i += 2) {
    if (i === 2 * b.main || b.sels[i] === b.sels[i + 1]) continue;
    marks.push(Math.min(b.sels[i], b.sels[i + 1])); marks.push(Math.max(b.sels[i], b.sels[i + 1])); marks.push(t.selection); marks.push(ui.MARK_STRONG);
  }
  // search matches near the visible lines only (a file can have thousands)
  const q = query().length, m = matches();
  if (findOpen() && q > 0) {
    const from = doc.starts[Math.max(0, top - 20)], to = doc.lineEnd(Math.min(doc.lineCount() - 1, top + rows + 20));
    for (let i = 0; i < m.length; i++) {
      if (m[i] < from || m[i] > to) continue;
      marks.push(m[i]); marks.push(m[i] + q); marks.push(i === current() ? t.matchCurrent : t.match); marks.push(i === current() ? ui.MARK_STRONG : ui.MARK_FILL);
    }
  }
  // the other places of the selected word, near the visible lines
  if (sel > 0 && b.sels.length === 2) {
    const a = Math.min(b.sels[0], b.sels[1]), from = doc.starts[Math.max(0, top - 20)], to = doc.lineEnd(Math.min(doc.lineCount() - 1, top + rows + 20));
    for (const o of occurrences(doc.text, a, a + sel, from, to)) { marks.push(o); marks.push(o + sel); marks.push(t.selection); marks.push(ui.MARK_FILL); }
  }
  if (sel === 0) {
    const br = matchBracket(doc, caret);
    for (const o of br) { marks.push(o); marks.push(o + 1); marks.push(t.bracket); marks.push(ui.MARK_BOX); }
  }
  for (const d of b.diagnostics()) {
    if (d.line >= doc.lineCount()) continue;
    const ls = doc.starts[d.line], a = Math.min(doc.lineEnd(d.line), ls + d.col), c = d.severity === 1 ? t.error : t.warning;
    marks.push(a); marks.push(ls + wordEnd(doc.lines[d.line], a - ls)); marks.push(c); marks.push(ui.MARK_SQUIGGLE);
    marks.push(a); marks.push(a); marks.push(c); marks.push(ui.MARK_GUTTER);
  }
  ui.setMarks(h, marks);
  setCaretInfo([line + 1, caret - doc.starts[line] + 1, sel, b.sels.length >> 1]);
}

let lastActive: Buffer | null = null;
/** Once per frame: decorations of the active editor, and the active tab kept in view. */
export function stepEditor(): void {
  const b = active();
  if (b !== lastActive) { lastActive = b; revealActiveTab(); }
  if (b === null || (b as Buffer).node() < 0) return;
  const buf = b as Buffer, h = buf.node();
  const caret = ui.caretOf(h), v = ui.editView(h);
  const top: i32 = Math.floor(v[1] / v[4]), rows: i32 = Math.ceil(v[3] / v[4]);
  const text = buf.text(), m = matches();
  const diag = buf.diagnostics();
  stepAssist(buf);
  // the scroll matters to the marks that are limited to the visible lines (search matches, occurrences)
  const scrolled = Math.abs(top - lastTop) > 10;
  if (buf === lastBuf && caret === lastCaret && text === lastText && m === lastMatches && current() === lastCur && theme() === lastTheme && !scrolled && diag === lastDiag && buf.sels === lastSels) return;
  lastBuf = buf; lastCaret = caret; lastText = text; lastMatches = m; lastCur = current(); lastTheme = theme(); lastTop = top; lastDiag = diag; lastSels = buf.sels;
  decorate(buf, caret, top, rows);
}

// ---- the carets of the other cursors, over the field
// ponytail: placed with the mono font's advance, as the field places its own caret; a caretBox(offset) in zinc:ui would
// follow the field through wrapping and fallback glyphs
function drawCursors(x: i32, y: i32, w: i32, h: i32): void {
  const a = active();
  if (a === null || (a as Buffer).node() < 0 || (a as Buffer).sels.length <= 2) return;
  const b = a as Buffer, v = ui.editView(b.node()), doc = b.doc, f = font('mono', FONT_PX), t = theme();
  const k = h / (v[3] + PAD_TOP), left = PAD_LEFT + v[6];
  clip(x + left * k, y, w - left * k, h);
  for (let i = 0; i + 1 < b.sels.length; i += 2) {
    if (i === 2 * b.main) continue;
    const p = b.sels[i + 1], line = doc.lineOf(p);
    const cx = x + (left + textWidth(f, doc.lines[line].slice(0, p - doc.starts[line]), 0) - v[0]) * k, cy = y + (PAD_TOP + line * v[4] - v[1]) * k;
    rrect(cx - 0.5, cy, 1.5, v[4] * k, 0, t.caret, 255);
  }
  unclip();
}

// ---- find bar
function findKey(e: ui.KeyEvent): void {
  noteKey(e);
  if (e.key === 'Enter') { next(e.shift ? -1 : 1); e.preventDefault(); }
  else if (e.key === 'Escape') { closeFind(); e.preventDefault(); }
}
function Step(p: { label: string; by: i32 }): i32 {
  return <View className={`w-[26] h-[26] rounded-full items-center justify-center cursor-pointer hover:${bg(theme().hover)}`} onPointerDown={() => next(p.by)}>
    <Text className={`text-[13px] ${fg(theme().muted)}`}>{p.label}</Text>
  </View>;
}
function FindBar(): i32 {
  const count = (): string => {
    const n = matches().length;
    return query() === '' ? '' : n === 0 ? 'No results' : `${current() + 1} of ${n}`;
  };
  return <View className={`flex-row items-center overflow-hidden px-3 gap-2 border-b ${bd(theme().borderSoft)}`}
    style={{ height: findT.get() * 46, hidden: findOpen() ? 0 : 1 }}>
    <View className={`flex-row items-center h-[30] w-[320] pl-2.5 pr-1 gap-1.5 rounded-full ${bg(theme().chrome)}`}>
      <Glyph kind={I_SEARCH} size={14} color={() => theme().faint} />
      <Input ref={findRef} className={`grow h-[26] text-[13px] p-0 pl-1 rounded-none border-0 bg-transparent ${fg(theme().text)} focus:${bd(theme().chrome)}`}
        placeholder="Find in this file" value={query()} onInput={(v: string) => { setQuery(v); findFromCaret(); }} onKeyDown={findKey} />
    </View>
    <Text className={`text-[12px] w-[80] ${fg(matches().length === 0 && query() !== '' ? theme().error : theme().muted)}`}>{count()}</Text>
    <Step label="↑" by={-1} />
    <Step label="↓" by={1} />
    <View className="grow" />
    <View className={`w-[26] h-[26] rounded-full items-center justify-center cursor-pointer hover:${bg(theme().hover)}`} onPointerDown={() => closeFind()}>
      <Glyph kind={I_CLOSE} size={13} color={() => theme().muted} back={() => theme().bg} />
    </View>
  </View>;
}

// ---- empty pane
function Hint(props: { label: string; keys: string }): i32 {
  return <View className="flex-row items-center justify-between w-[240] h-[30]">
    <Text className={`text-[13px] ${fg(theme().muted)}`}>{props.label}</Text>
    <Kbd keys={props.keys} />
  </View>;
}
function EmptyPane(): i32 {
  return <View className={`absolute inset-0 items-center justify-center ${bg(theme().bg)}`} style={{ hidden: buffers().length === 0 ? 0 : 1 }}>
    <View className="flex-col items-center gap-0.5">
      <Text className={`text-[15px] font-semibold pb-3 ${fg(theme().text)}`}>No file open</Text>
      <Hint label="Add a file" keys="⌘T" />
      <Hint label="Examples" keys="⌘⇧O" />
      <Hint label="Everything else" keys="⌘⇧P" />
    </View>
  </View>;
}

export function EditorCard(): i32 {
  return <View className={`grow flex-col overflow-hidden rounded-[14] border ${bg(theme().bg)} ${bd(theme().borderSoft)}`}>
    <FindBar />
    <View className="grow my-[6]">
      <For each={buffers()}>{(b: Buffer, i: i32) => <BufferEditor b={b} />}</For>
      <Canvas className="absolute inset-0 pointer-events-none" style={{ lazy: 1 }} onDraw={drawCursors} />
      <Signature />
      <Hover />
      <Popup />
      <EmptyPane />
    </View>
  </View>;
}
