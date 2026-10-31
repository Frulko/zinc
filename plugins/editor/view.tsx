// The views of zinc:editor. `CodeEditor` is one editable text field on an EditorState: highlighted by its Doc, coloured
// by the theme, its keys and pointer routed through cursors.ts (several cursors, undo, the assistant). `stepEditor` runs
// once a frame on the active editor: it rebuilds its decorations (current line, the other selections, the other places
// of the selected word, search matches, matching brackets, diagnostics) when one of their inputs changed. `drawCursors`
// draws the carets beside the field's own, on a canvas the app lays over its editors. `Minimap` is the tiny coloured
// outline of the file beside it, `CodeView` a read-only highlighted snippet (a code block of a chat, of a document).
import { createSignal, createEffect, createNodeRef } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { rrect, font, textWidth, clip, unclip } from 'zinc:gfx';
import { theme, bg, fg, bd, Theme } from './theme';
import { Doc, matchBracket, tokenColor } from './document';
import { langNamed } from './syntax';
import { occurrences, isIdent, wordStart } from './edit';
import { EditorState, Diagnostic } from './state';
import { editorKey, editorPress, nativeInput, getAssist } from './cursors';

/** The look of Atelier's editor: 14 px mono, 21 px lines. */
export const EDITOR_CLASSES: string = 'text-[14px] leading-[21] pl-[14] pr-[8] pt-[10] pb-0';

/** Offset where the name under a point of the editor starts (the point in the field's own units), -1 over anything else. */
export function nameAt(b: EditorState, x: number, y: number): i32 {
  const v = ui.editView(b.node()), doc = b.doc, line: i32 = Math.floor((y - b.padTop + v[1]) / v[4]);
  if (line < 0 || line >= doc.lineCount()) return -1;
  const s = doc.lines[line], col: i32 = Math.floor((x - b.padLeft - v[6] + v[0]) / textWidth(font('mono', b.fontPx()), 'M', 0));
  return col < 0 || col >= s.length || !isIdent(s.charCodeAt(col)) ? -1 : doc.starts[line] + wordStart(s, col + 1);
}

export interface CodeEditorProps {
  state: EditorState;
  /** Shown (an app keeps one editor per open file and shows the active one). */
  visible: () => boolean;
  /** Size, line height and padding classes (default EDITOR_CLASSES); literal classes, so their font size is baked. */
  className?: () => string;
  /** The padding and font size those classes give, in pixels (the other carets and the name under the pointer are placed with them). */
  padLeft?: number;
  padTop?: number;
  fontPx?: () => number;
  wrap?: () => boolean;
  /** The app's keys first (switch tabs...): true when it took the key. */
  onKey?: (e: ui.KeyEvent) => boolean;
  /** Escape with one cursor and no popup (close the find bar). */
  onEscape?: () => void;
}

/** One editor on `state`. */
export function CodeEditor(props: CodeEditorProps): i32 {
  const b = props.state;
  const cls = props.className ?? ((): string => EDITOR_CLASSES);
  const wrap = props.wrap ?? ((): boolean => false);
  b.padLeft = props.padLeft ?? 14; b.padTop = props.padTop ?? 10;
  if (props.fontPx !== undefined) b.fontPx = props.fontPx as () => number;
  const appKey = props.onKey, escape = props.onEscape ?? (() => {});
  const node = <TextArea ref={b.ref}
    className={`border-slate-600 absolute inset-0 font-mono rounded-none border-0 ${cls()} ${bg(theme().bg)} ${fg(theme().text)} focus:${bd(theme().bg)}`}
    style={{ hidden: props.visible() ? 0 : 1 }}
    lineNumbers wrap={wrap()} value={b.text()} onInput={(v: string) => nativeInput(b, v)}
    onKeyDown={(e: ui.KeyEvent) => {
      if (appKey !== undefined && (appKey as (e: ui.KeyEvent) => boolean)(e)) e.preventDefault();
      else if (editorKey(b, e, escape)) e.preventDefault();
    }}
    onPointerDown={(e: ui.PointerEvent) => { if (e.button === 0) editorPress(b, e.alt, e.meta); }}
    onPointerMove={(e: ui.PointerEvent) => getAssist().pointerOver(b, nameAt(b, e.x, e.y))}
    onPointerLeave={(e: ui.PointerEvent) => getAssist().pointerOver(b, -1)} />;
  ui.setHighlightAt(node, (line: string, start: i32) => b.doc.rowColors(line, start, theme()));
  createEffect(() => {
    const t = theme();
    ui.setEditColors(node, [t.lineNumber, t.lineNumberActive, -2, t.selection, t.caret, t.indentGuide]);
  });
  return node;
}

// ---- decorations of the active editor, rebuilt when something they depend on changed
let lastBuf: EditorState | null = null, lastCaret: i32 = -1, lastText: string = '', lastMatches: i32[] = [], lastCur: i32 = -1;
let lastTheme: Theme | null = null, lastTop: i32 = -1, lastDiag: Diagnostic[] = [], lastSels: i32[] = [];
/** [line, column, selected characters, cursors] of the active editor, for a status line. */
export const [caretInfo, setCaretInfo] = createSignal<i32[]>([1, 1, 0, 1]);

/** Column where the word starting at column i of `s` ends; from another character (a quote, an operator), where the run up to the next space, comma or semicolon ends. */
function diagEnd(s: string, i: i32): i32 {
  let j = i;
  while (j < s.length) { const c = s.charCodeAt(j); if (!((c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95)) break; j++; }
  if (j > i) return j;
  while (j < s.length) { const c = s.charCodeAt(j); if (c === 32 || c === 44 || c === 59) break; j++; }
  return j > i ? j : Math.min(s.length, i + 1);
}

function decorate(b: EditorState, caret: i32, top: i32, rows: i32, m: i32[], q: i32, cur: i32): void {
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
  if (q > 0) {
    const from = doc.starts[Math.max(0, top - 20)], to = doc.lineEnd(Math.min(doc.lineCount() - 1, top + rows + 20));
    for (let i = 0; i < m.length; i++) {
      if (m[i] < from || m[i] > to) continue;
      marks.push(m[i]); marks.push(m[i] + q); marks.push(i === cur ? t.matchCurrent : t.match); marks.push(i === cur ? ui.MARK_STRONG : ui.MARK_FILL);
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
    marks.push(a); marks.push(ls + diagEnd(doc.lines[d.line], a - ls)); marks.push(c); marks.push(ui.MARK_SQUIGGLE);
    marks.push(a); marks.push(a); marks.push(c); marks.push(ui.MARK_GUTTER);
  }
  ui.setMarks(h, marks);
  setCaretInfo([line + 1, caret - doc.starts[line] + 1, sel, b.sels.length >> 1]);
}

/** Once per frame, with the active editor and the search matches to show (their offsets, the query's length, the current
 *  one; [] when the find bar is closed): its decorations and caretInfo. */
export function stepEditor(b: EditorState | null, matches: i32[], queryLength: i32, current: i32): void {
  if (b === null || (b as EditorState).node() < 0) return;
  const buf = b as EditorState, h = buf.node();
  const caret = ui.caretOf(h), v = ui.editView(h);
  const top: i32 = Math.floor(v[1] / v[4]), rows: i32 = Math.ceil(v[3] / v[4]);
  const text = buf.text(), diag = buf.diagnostics();
  // the scroll matters to the marks that are limited to the visible lines (search matches, occurrences)
  const scrolled = Math.abs(top - lastTop) > 10;
  if (buf === lastBuf && caret === lastCaret && text === lastText && matches === lastMatches && current === lastCur && theme() === lastTheme && !scrolled && diag === lastDiag && buf.sels === lastSels) return;
  lastBuf = buf; lastCaret = caret; lastText = text; lastMatches = matches; lastCur = current; lastTheme = theme(); lastTop = top; lastDiag = diag; lastSels = buf.sels;
  decorate(buf, caret, top, rows, matches, queryLength, current);
}

// ---- the carets of the other cursors, over the field
// ponytail: placed with the mono font's advance, as the field places its own caret; a caretBox(offset) in zinc:ui would
// follow the field through wrapping and fallback glyphs
/** Draws the carets of `b` beside its main one, on a canvas laid over the editor (x, y, w, h: the canvas's onDraw box). */
export function drawCursors(a: EditorState | null, x: i32, y: i32, w: i32, h: i32): void {
  if (a === null || (a as EditorState).node() < 0 || (a as EditorState).sels.length <= 2) return;
  const b = a as EditorState, v = ui.editView(b.node()), doc = b.doc, f = font('mono', b.fontPx()), t = theme();
  const k = h / (v[3] + b.padTop), left = b.padLeft + v[6];
  clip(x + left * k, y, w - left * k, h);
  for (let i = 0; i + 1 < b.sels.length; i += 2) {
    if (i === 2 * b.main) continue;
    const p = b.sels[i + 1], line = doc.lineOf(p);
    const cx = x + (left + textWidth(f, doc.lines[line].slice(0, p - doc.starts[line]), 0) - v[0]) * k, cy = y + (b.padTop + line * v[4] - v[1]) * k;
    rrect(cx - 0.5, cy, 1.5, v[4] * k, 0, t.caret, 255);
  }
  unclip();
}

// ---- minimap: tiny token-coloured blocks, the visible region, drag to scroll
const MINI_LINE: number = 3, MINI_CHAR: number = 1.25, MINI_COLS: i32 = 90;
let grab: number = -1;
class MiniGeom { first: number = 0; top: number = 0; sliderY: number = 0; sliderH: number = 0; range: number = 0; }
/** Where the minimap starts (in lines) and where its slider is, for an editor. */
function geometry(b: EditorState, h: number): MiniGeom {
  const v = ui.editView(b.node()), g = new MiniGeom();
  const lines = b.doc.lineCount(), total = lines * MINI_LINE;
  const maxSy = Math.max(1, v[2] - v[3]), ratio = Math.max(0, Math.min(1, v[1] / maxSy));
  const perRow = lines / Math.max(1, v[5]);   // logical lines per visual row (1 unless wrapping)
  g.sliderH = Math.max(8, v[3] / v[4] * perRow * MINI_LINE);
  g.range = Math.min(h, total) - g.sliderH;
  g.top = total > h ? ratio * (total - h) : 0;
  g.sliderY = v[2] <= v[3] ? 0 : ratio * Math.max(0, g.range);
  if (total <= h) g.sliderY = v[1] / v[4] * perRow * MINI_LINE;
  g.first = g.top / MINI_LINE;
  return g;
}
function drawMinimap(a: EditorState | null, x: i32, y: i32, w: i32, h: i32): void {
  const t = theme();
  rrect(x, y, w, h, 0, t.bg, 255);
  rrect(x, y, 1, h, 0, t.borderSoft, 255);
  if (a === null || (a as EditorState).node() < 0) return;
  const buf = a as EditorState, doc = buf.doc, g = geometry(buf, h);
  const first: i32 = Math.floor(g.first), last: i32 = Math.min(doc.lineCount() - 1, first + Math.ceil(h / MINI_LINE) + 1);
  const ox = x + 8;
  for (let i = first; i <= last; i++) {
    const ly = y + i * MINI_LINE - g.top;
    const toks = doc.tokens(i), line = doc.lines[i];
    let col: i32 = 0;
    for (let k = 0; k + 1 < toks.length && col < MINI_COLS; k += 2) {
      const c = tokenColor(t, toks[k + 1]), color = c < 0 ? t.text : c;
      // one block per run of non-space characters
      let run: i32 = -1;
      for (let j = 0; j <= toks[k]; j++) {
        const space = j === toks[k] || line.charCodeAt(col + j) === 32;
        if (!space && run < 0) run = j;
        if (space && run >= 0) { rrect(ox + (col + run) * MINI_CHAR, ly, (j - run) * MINI_CHAR, MINI_LINE - 1, 0, color, 170); run = -1; }
      }
      col += toks[k];
    }
  }
  rrect(x + 1, y + g.sliderY, w - 1, g.sliderH, 0, t.minimapThumb, grab >= 0 ? 90 : 55);
}
function miniScroll(b: EditorState, py: number, h: number): void {
  const g = geometry(b, h), v = ui.editView(b.node());
  const lines = b.doc.lineCount(), perRow = lines / Math.max(1, v[5]);
  const maxSy = Math.max(0, v[2] - v[3]);
  let sy: number = 0;
  if (lines * MINI_LINE > h) sy = Math.max(0, Math.min(1, (py - grab) / Math.max(1, g.range))) * maxSy;
  else sy = (py - grab) / MINI_LINE / perRow * v[4];
  ui.scrollEditTo(b.node(), v[0], sy);
}
/** The minimap of the editor `editor()` returns (130 px wide while `visible()`). */
export function Minimap(props: { editor: () => EditorState | null; visible: () => boolean }): i32 {
  const ref = createNodeRef();
  return <Canvas ref={ref} className="h-full cursor-default" style={{ width: props.visible() ? 130 : 0, hidden: props.visible() ? 0 : 1, lazy: 1 }}
    onDraw={(x: i32, y: i32, w: i32, h: i32) => drawMinimap(props.editor(), x, y, w, h)}
    onPointerDown={(e: ui.PointerEvent) => {
      const b = props.editor();
      if (b === null || e.button !== 0) return;
      const box = ui.screenBox(ref.node), g = geometry(b as EditorState, box[3]);
      // grab the slider where it was pressed, or centre it under the pointer
      grab = e.y >= g.sliderY && e.y < g.sliderY + g.sliderH ? e.y - g.sliderY : g.sliderH / 2;
      miniScroll(b as EditorState, e.y, box[3]);
    }}
    onPointerMove={(e: ui.PointerEvent) => { const b = props.editor(); if (grab >= 0 && b !== null) miniScroll(b as EditorState, e.y, ui.screenBox(ref.node)[3]); }}
    onPointerUp={(e: ui.PointerEvent) => { grab = -1; ui.repaint(); }} />;
}

// ---- a read-only snippet
export interface CodeViewProps {
  code: string;
  /** A language name or file extension ('ts', 'tsx', 'json', 'css', 'md'...); plain text when no language has it. */
  lang?: string;
  /** Size, line height, padding and corner classes (default 13 px mono on 20 px lines); a background or border class here wins over the theme's. */
  className?: string;
  lineNumbers?: boolean;
}
/** Highlighted code that can be selected and copied, as tall as its lines (a long line scrolls sideways). */
export function CodeView(props: CodeViewProps): i32 {
  const doc = new Doc(langNamed(props.lang ?? ''));
  const code = props.code.endsWith('\n') ? props.code.slice(0, props.code.length - 1) : props.code;
  doc.setText(code);
  const node = <TextArea readOnly rows={0} wrap={false} lineNumbers={props.lineNumbers ?? false} value={code}
    className={`border-slate-600 font-mono border-0 ${bg(theme().bg)} ${fg(theme().text)} focus:${bd(theme().bg)} ${props.className ?? 'text-[13px] leading-[20] px-3 py-2 rounded-md'}`} />;
  ui.setHighlightAt(node, (line: string, start: i32) => doc.rowColors(line, start, theme()));
  createEffect(() => {
    const t = theme();
    ui.setEditColors(node, [t.lineNumber, t.lineNumber, -2, t.selection, t.caret, -1]);
  });
  return node;
}
