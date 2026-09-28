// The editor pane: tabs, breadcrumbs, the find bar, one code editor per open buffer (only the active one is shown:
// each keeps its caret, scroll and undo history) and the minimap. `stepEditor` runs every frame: it follows the
// caret and the scroll of the active editor and rebuilds its decorations (current line, matching brackets, search
// matches, diagnostics) when one of them changed.
import { createSignal, createEffect, createNodeRef, For } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { rrect } from 'zinc:gfx';
import { theme, bg, fg, bd, Theme } from '../app/theme';
import { active, buffers, Buffer, edited, cycle } from '../app/workspace';
import { root, reveal } from '../app/project';
import { fontIndex, FONT_CLASSES, softWrap, setSoftWrap, minimapOn } from '../app/settings';
import { findOpen, findT, query, setQuery, matches, current, next, closeFind, findFromCaret } from '../app/search';
import { matchBracket, tokenColor } from '../app/document';
import { Tabs, revealActiveTab } from './Tabs';
import { Glyph, Kbd } from './Controls';
import { drawFileIcon, I_SEARCH, I_CLOSE } from './icons';

// ---- one editor per buffer
/** Keys the text field would take for itself: ⌃Tab switches tabs, ⌥Z toggles soft wrap (it would type 'Ω'). */
function editorKey(e: ui.KeyEvent): void {
  if (e.key === 'Tab' && e.ctrl) { cycle(e.shift ? -1 : 1); e.preventDefault(); }
  else if (e.key === 'z' && e.alt && !e.primary) { setSoftWrap(!softWrap()); e.preventDefault(); }
}
function BufferEditor(props: { b: Buffer }): i32 {
  const b = props.b;
  const node = <TextArea ref={b.ref}
    class={`absolute inset-0 font-mono ${FONT_CLASSES[fontIndex()]} rounded-none border-0 pl-[16] pr-[8] pt-[6] pb-0 ${bg(theme().bg)} ${fg(theme().text)} focus:${bd(theme().bg)}`}
    style={{ hidden: active() === b ? 0 : 1 }}
    lineNumbers wrap={softWrap()} value={b.text()} onInput={(v: string) => edited(b, v)} onKeyDown={editorKey} />;
  ui.setHighlightAt(node, (line: string, start: i32) => b.doc.rowColors(line, start, theme()));
  createEffect(() => {
    const t = theme();
    ui.setEditColors(node, [t.lineNumber, t.lineNumberActive, -2, t.selection, t.caret, t.indentGuide]);
  });
  return node;
}

// ---- decorations of the active editor, rebuilt when something they depend on changed
let lastBuf: Buffer | null = null, lastCaret: i32 = -1, lastText: string = '', lastMatches: i32[] = [], lastCur: i32 = -1;
let lastTheme: Theme | null = null, lastTop: i32 = -1, lastDiag: i32 = -1;
/** [line, column, selected characters] of the active editor's caret, for the status bar. */
export const [caretInfo, setCaretInfo] = createSignal<i32[]>([1, 1, 0]);

/** Column where the word starting at column i of `s` ends (at least one character). */
function wordEnd(s: string, i: i32): i32 {
  let j = i;
  while (j < s.length) { const c = s.charCodeAt(j); if (!((c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95)) break; j++; }
  return j > i ? j : Math.min(s.length, i + 1);
}

function decorate(b: Buffer, caret: i32, top: i32, rows: i32): void {
  const t = theme(), h = b.node(), doc = b.doc;
  const marks: i32[] = [];
  const line = doc.lineOf(caret);
  const sel = ui.selectedText(h).length;
  if (sel === 0) { marks.push(doc.starts[line]); marks.push(doc.lineEnd(line)); marks.push(t.lineHighlight); marks.push(ui.MARK_LINE); }
  // search matches near the visible lines only (a file can have thousands)
  const q = query().length, m = matches();
  if (findOpen() && q > 0) {
    const from = doc.starts[Math.max(0, top - 20)], to = doc.lineEnd(Math.min(doc.lineCount() - 1, top + rows + 20));
    for (let i = 0; i < m.length; i++) {
      if (m[i] < from || m[i] > to) continue;
      marks.push(m[i]); marks.push(m[i] + q); marks.push(i === current() ? t.matchCurrent : t.match); marks.push(i === current() ? ui.MARK_STRONG : ui.MARK_FILL);
    }
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
  setCaretInfo([line + 1, caret - doc.starts[line] + 1, sel]);
}

let lastActive: Buffer | null = null;
/** Once per frame: decorations of the active editor, and the active tab kept in view. */
export function stepEditor(): void {
  const b = active();
  if (b !== lastActive) { lastActive = b; revealActiveTab(); if (b !== null) reveal((b as Buffer).path); }
  if (b === null || (b as Buffer).node() < 0) return;
  const buf = b as Buffer, h = buf.node();
  const caret = ui.caretOf(h), v = ui.editView(h);
  const top: i32 = Math.floor(v[1] / v[4]), rows: i32 = Math.ceil(v[3] / v[4]);
  const text = buf.text(), m = matches();
  const diag = buf.diagnostics().length;
  // the scroll only matters to the search marks (they are limited to the visible lines)
  const scrolled = findOpen() && Math.abs(top - lastTop) > 10;
  if (buf === lastBuf && caret === lastCaret && text === lastText && m === lastMatches && current() === lastCur && theme() === lastTheme && !scrolled && diag === lastDiag) return;
  lastBuf = buf; lastCaret = caret; lastText = text; lastMatches = m; lastCur = current(); lastTheme = theme(); lastTop = top; lastDiag = diag;
  decorate(buf, caret, top, rows);
}

// ---- minimap: tiny token-coloured blocks, the visible region, drag to scroll
const MINI_LINE: number = 3, MINI_CHAR: number = 1.25, MINI_COLS: i32 = 90;
let grab: number = -1;
class MiniGeom { first: number = 0; top: number = 0; sliderY: number = 0; sliderH: number = 0; range: number = 0; }
/** Where the minimap starts (in lines) and where its slider is, for the active editor. */
function geometry(b: Buffer, h: number): MiniGeom {
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
function drawMinimap(x: i32, y: i32, w: i32, h: i32): void {
  const b = active(), t = theme();
  rrect(x, y, w, h, 0, t.bg, 255);
  rrect(x, y, 1, h, 0, t.borderSoft, 255);
  if (b === null || (b as Buffer).node() < 0) return;
  const buf = b as Buffer, doc = buf.doc, g = geometry(buf, h);
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
  const hot = grab >= 0;
  rrect(x + 1, y + g.sliderY, w - 1, g.sliderH, 0, t.minimapThumb, hot ? 90 : 55);
}
function miniScroll(b: Buffer, py: number, h: number): void {
  const g = geometry(b, h), v = ui.editView(b.node());
  const lines = b.doc.lineCount(), perRow = lines / Math.max(1, v[5]);
  const maxSy = Math.max(0, v[2] - v[3]);
  let sy: number = 0;
  if (lines * MINI_LINE > h) sy = Math.max(0, Math.min(1, (py - grab) / Math.max(1, g.range))) * maxSy;
  else sy = (py - grab) / MINI_LINE / perRow * v[4];
  ui.scrollEditTo(b.node(), v[0], sy);
}
const miniRef = createNodeRef();
function Minimap(): i32 {
  return <Canvas ref={miniRef} class="h-full cursor-default" style={{ width: minimapOn() ? 130 : 0, hidden: minimapOn() ? 0 : 1, lazy: 1 }}
    onDraw={drawMinimap}
    onPointerDown={(e: ui.PointerEvent) => {
      const b = active();
      if (b === null || e.button !== 0) return;
      const box = ui.screenBox(miniRef.node), g = geometry(b as Buffer, box[3]);
      // grab the slider where it was pressed, or centre it under the pointer
      grab = e.y >= g.sliderY && e.y < g.sliderY + g.sliderH ? e.y - g.sliderY : g.sliderH / 2;
      miniScroll(b as Buffer, e.y, box[3]);
    }}
    onPointerMove={(e: ui.PointerEvent) => { const b = active(); if (grab >= 0 && b !== null) miniScroll(b as Buffer, e.y, ui.screenBox(miniRef.node)[3]); }}
    onPointerUp={(e: ui.PointerEvent) => { grab = -1; ui.repaint(); }} />;
}

// ---- breadcrumbs: the active file's path under the tabs
function Breadcrumbs(): i32 {
  const parts = (): string[] => {
    const b = active();
    if (b === null) return [];
    const p = (b as Buffer).path;
    return (p.startsWith(root.path + '/') ? p.slice(root.path.length + 1) : p).split('/');
  };
  return <View class={`flex-row items-center h-[28] px-4 gap-1.5 border-b ${bg(theme().bg)} ${bd(theme().borderSoft)}`}>
    <Canvas style={{ width: 14, height: 14, lazy: 1 }} onDraw={(x: i32, y: i32, w: i32, h: i32) => {
      const b = active();
      if (b !== null) drawFileIcon((b as Buffer).name, false, false, x, y, w, theme());
    }} />
    <Text class={`text-[12px] ${fg(theme().muted)}`}>{parts().join('  ›  ')}</Text>
  </View>;
}

// ---- find bar
export const findRef = createNodeRef();
function findKey(e: ui.KeyEvent): void {
  if (e.key === 'Enter') { next(e.shift ? -1 : 1); e.preventDefault(); }
  else if (e.key === 'Escape') { closeFind(); e.preventDefault(); }
}
function FindBar(): i32 {
  const count = (): string => {
    const n = matches().length;
    return query() === '' ? '' : n === 0 ? 'No results' : `${current() + 1} of ${n}`;
  };
  return <View class={`flex-row items-center overflow-hidden px-3 gap-2 border-b ${bg(theme().surface)} ${bd(theme().borderSoft)}`}
    style={{ height: findT.get() * 38, hidden: findOpen() ? 0 : 1 }}>
    <View class={`flex-row items-center h-[26] w-[320] pl-2 pr-1 gap-1.5 rounded-md border ${bg(theme().bg)} ${bd(theme().border)}`}>
      <Glyph kind={I_SEARCH} size={14} color={() => theme().faint} />
      <Input ref={findRef} class={`grow h-[24] text-[13px] p-0 pl-1 rounded-none border-0 bg-transparent ${fg(theme().text)} focus:${bd(theme().bg)}`}
        placeholder="Search…" value={query()} onInput={(v: string) => { setQuery(v); findFromCaret(); }} onKeyDown={findKey} />
    </View>
    <Text class={`text-[12px] w-[80] ${fg(matches().length === 0 && query() !== '' ? theme().error : theme().muted)}`}>{count()}</Text>
    <View class={`h-[24] px-2 rounded-md items-center justify-center cursor-pointer hover:${bg(theme().hover)}`} onPointerDown={() => next(-1)}>
      <Text class={`text-[13px] ${fg(theme().muted)}`}>↑</Text>
    </View>
    <View class={`h-[24] px-2 rounded-md items-center justify-center cursor-pointer hover:${bg(theme().hover)}`} onPointerDown={() => next(1)}>
      <Text class={`text-[13px] ${fg(theme().muted)}`}>↓</Text>
    </View>
    <View class="grow" />
    <View class={`w-[24] h-[24] rounded-md items-center justify-center cursor-pointer hover:${bg(theme().hover)}`} onPointerDown={() => closeFind()}>
      <Glyph kind={I_CLOSE} size={14} color={() => theme().muted} />
    </View>
  </View>;
}

// ---- empty pane
function Hint(props: { label: string; keys: string }): i32 {
  return <View class="flex-row items-center justify-between w-[260] h-[28]">
    <Text class={`text-[13px] ${fg(theme().muted)}`}>{props.label}</Text>
    <Kbd keys={props.keys} />
  </View>;
}
function EmptyPane(): i32 {
  return <View class={`absolute inset-0 items-center justify-center ${bg(theme().bg)}`} style={{ hidden: buffers().length === 0 ? 0 : 1 }}>
    <View class="flex-col items-center gap-1">
      <Text class={`text-[15px] font-semibold pb-3 ${fg(theme().faint)}`}>No file open</Text>
      <Hint label="Go to file" keys="⌘P" />
      <Hint label="Command palette" keys="⌘⇧P" />
      <Hint label="Toggle project panel" keys="⌘B" />
      <Hint label="Toggle terminal" keys="⌘J" />
    </View>
  </View>;
}

export function EditorPane(): i32 {
  return <View class={`grow flex-col ${bg(theme().bg)}`}>
    <Tabs />
    <Breadcrumbs />
    <FindBar />
    <View class="grow flex-row">
      <View class="grow">
        <For each={buffers()}>{(b: Buffer, i: i32) => <BufferEditor b={b} />}</For>
        <EmptyPane />
      </View>
      <Minimap />
    </View>
  </View>;
}
