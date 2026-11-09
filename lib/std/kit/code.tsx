/** @jsxHelpers zinc:ui/kit/host */
// Quiet Code controls compose the editor, md4c and shared JSON tree providers.
import * as ui from 'zinc:ui';
import { utf8Encode } from 'zinc:sys';
import { toHex } from 'zinc:hash';
import { createNodeRef } from 'zinc:ui/solid';
import { CodeView, CodeEditor as EditorView, EditorState, Doc, Assist, drawCursors, Theme as EditorTheme, langNamed, stepCursors, stepEditor, jumpTo } from 'zinc:editor';
import { parse as parseMarkdown, setTask, FLAG_NO_HTML, GITHUB, viewBlocks } from 'zinc:markdown';
import { Markdown as SelectableMarkdown } from '../markdown-view';
import { Block } from '../markdown';
import { JsonLine, jsonValueLines, JsonDocument, JsonStatus, parseJsonDocument } from '../json-tree';
import { theme, themeAccent, Theme as KitTheme } from './theme';
import { componentRef, componentSignal, componentMemo, componentEffect, _virtual as virtualRows } from './host';
import { CopyButton } from './actions';
import { Button as KitButton } from './button';
import { Input as KitInput } from './input';
import { diffLines, diffVisible, diffPairs, diffRange, DiffLine, DiffPair } from './code-diff';

function ring(): string { return `focus-visible:ring-2 focus-visible:ring-${theme().accent} focus-visible:ring-offset-2`; }
function surface(): string { return `flex-col min-w-0 overflow-hidden rounded-[14px] border border-${theme().border} bg-${theme().card}`; }
/** Monochrome syntax hierarchy; the accent is reserved for selection and focus. */
let previousKitTheme: KitTheme | null = null;
let previousScheme: string = '', previousAccent: string = '';
let previousCodeTheme: EditorTheme | null = null;
function codeTheme(): EditorTheme {
  const q = theme(), scheme = ui.currentScheme(), accent = themeAccent();
  if (q === previousKitTheme && scheme === previousScheme && accent === previousAccent && previousCodeTheme !== null) return previousCodeTheme;
  const t = new EditorTheme();
  t.bg = ui.tailwindColor(q.card); t.text = ui.tailwindColor(q.foreground); t.muted = ui.tailwindColor(q.mutedForeground);
  t.lineNumber = t.muted; t.lineNumberActive = t.text; t.caret = ui.tailwindColor(q.accent); t.selection = ui.tailwindColor(q.accentSoft);
  t.lineHighlight = ui.tailwindColor(q.muted); t.indentGuide = ui.tailwindColor(q.border); t.match = t.selection; t.matchCurrent = t.selection;
  t.bracket = t.caret; t.error = ui.tailwindColor(q.destructive); t.warning = ui.tailwindColor(q.warningSoftForeground);
  t.keyword = t.text; t.string = t.muted; t.number = t.text; t.comment = t.muted; t.fn = t.text; t.type = t.text;
  t.property = t.text; t.constant = t.text; t.punctuation = t.muted; t.tag = t.text; t.attribute = t.muted; t.heading = t.text; t.link = t.text;
  previousKitTheme = q; previousScheme = scheme; previousAccent = accent; previousCodeTheme = t;
  return t;
}
export interface CodeBlockProps {
  code: string; language?: string; title?: string; lineNumbers?: boolean; emphasizedLines?: i32[];
  height?: number; copy?: boolean; className?: string;
}
export function CodeBlock(p: CodeBlockProps): i32 {
  return <View className={`${surface()} ${p.className ?? ''}`}>
    <View className={`flex-row flex-wrap items-center gap-2 px-3 py-2 border-b border-${theme().border}`}>
      <Text className={`grow min-w-0 text-[12px] text-${theme().mutedForeground}`}>{p.title ?? p.language ?? 'Code'}</Text>
      <Show when={p.copy !== false}><CopyButton text={() => p.code} label="Copy code" /></Show>
    </View>
    <ScrollView style={{ height: p.height ?? -1 }} className="min-w-0">
      <CodeView code={p.code} lang={p.language} lineNumbers={p.lineNumbers ?? false} emphasizedLines={p.emphasizedLines} appearance={codeTheme}
        className={`text-[13px] leading-[20] px-3 py-2 bg-${theme().card} text-${theme().foreground} ${ring()}`} />
    </ScrollView>
  </View>;
}
export interface CodeEditorProps {
  label: string; value: () => string; onChange: (value: string) => void; language?: string; title?: string;
  height?: number; readOnly?: boolean; placeholder?: string; lineNumbers?: boolean; indent?: string; wrap?: boolean; className?: string;
}
enum EditorLife { New, Mounted, Disposed }
class EditorOwner {
  state: EditorState; life: EditorLife = EditorLife.New; generation: i32 = 0;
  constructor(text: string, language: string) { this.state = new EditorState('', text, langNamed(language)); this.state.assistant = new Assist(); this.state.menuKeys = false; }
  transition(next: EditorLife): boolean {
    if (next === EditorLife.Mounted && (this.life !== EditorLife.New && this.life !== EditorLife.Disposed) || next === EditorLife.Disposed && this.life !== EditorLife.Mounted) return false;
    this.life = next; this.generation++; return true;
  }
}
export function CodeEditor(p: CodeEditorProps): i32 {
  const root = createNodeRef();
  const lastTool = componentRef('');
  const owner = componentRef<EditorOwner | null>(null);
  if (owner.current === null) owner.current = new EditorOwner(p.value(), p.language ?? '');
  const own = owner.current as EditorOwner, b = own.state;
  const [tool, setTool] = componentSignal(''), [query, setQuery] = componentSignal(''), [line, setLine] = componentSignal('1');
  const matches = componentMemo<i32[]>(() => {
    const text = p.value(), q = query(), result: i32[] = [];
    if (q === '') return result;
    for (let at = text.indexOf(q); at >= 0; at = text.indexOf(q, at + q.length)) result.push(at);
    return result;
  }, []);
  b.appearance = codeTheme; b.indent = p.indent === '\t' ? '\t' : ' '.repeat(Math.max(1, Math.min(8, (p.indent ?? '  ').length)));
  b.onEdited = (s: EditorState) => p.onChange(s.text());
  componentEffect(() => {
    const value = p.value();
    const language = langNamed(p.language ?? '');
    if (b.doc.lang !== language) { b.doc.setLanguage(language); ui.repaint(); }
    if (b.doc.text !== value) { b.doc.setText(value); b.setText(value); }
    return undefined;
  });
  const find = (back: boolean): void => {
    const m = matches(); if (m.length === 0) return;
    const caret = ui.caretOf(b.node());
    let at = back ? m.length - 1 : 0;
    if (back) { for (let i = m.length - 1; i >= 0; i--) if (m[i] < caret - query().length) { at = i; break; } }
    else { for (let i = 0; i < m.length; i++) if (m[i] >= caret) { at = i; break; } }
    ui.select(b.node(), m[at], m[at] + query().length); ui.focusNode(b.node());
  };
  const node = <View ref={root} focusable role="group" aria-label={p.label} onKeyDown={(e: ui.KeyEvent) => {
    if (e.key === 'Escape' && tool() !== '') { setTool(''); ui.focusNode(b.node()); e.preventDefault(); }
  }} className={`${surface()} ${ring()} ${p.className ?? ''}`}>
    <View className={`flex-row flex-wrap items-center gap-2 p-2 border-b border-${theme().border}`}>
      <Text className={`grow text-[12px] text-${theme().mutedForeground}`}>{p.title ?? p.label}</Text>
      <KitButton label="Find" variant="ghost" size="sm" onClick={() => setTool('find')} />
      <KitButton label="Go to line" variant="ghost" size="sm" onClick={() => setTool('line')} />
      <CopyButton text={p.value} label="Copy code" />
    </View>
    <Show when={tool() !== ''}><View className="flex-row flex-wrap gap-2 p-2 items-center">
      <Show when={tool() === 'find'}>
        <KitInput value={query} onInput={setQuery} onSubmit={() => find(false)} label="Find text" placeholder="Find text" className="grow min-w-0" />
        <Text role="status" className={`text-[12px] text-${theme().mutedForeground}`}>{String(matches().length) + ' matches'}</Text>
        <KitButton label="Previous" size="sm" variant="ghost" onClick={() => find(true)} />
        <KitButton label="Next" size="sm" variant="ghost" onClick={() => find(false)} />
      </Show>
      <Show when={tool() === 'line'}><KitInput value={line} onInput={setLine} onSubmit={() => jumpTo(b, Math.max(1, parseInt(line()) || 1), 1)} label="Line number" placeholder="Line number" className="grow min-w-0" /><KitButton label="Go" size="sm" onClick={() => jumpTo(b, Math.max(1, parseInt(line()) || 1), 1)} /></Show>
      <KitButton label="Close" size="sm" variant="ghost" onClick={() => { setTool(''); ui.focusNode(b.node()); }} />
    </View></Show>
    <View className="relative min-w-0" style={{ height: p.height ?? 220 }}>
      <EditorView state={b} visible={() => true} readOnly={p.readOnly} placeholder={p.placeholder} lineNumbers={p.lineNumbers ?? true} wrap={() => p.wrap ?? false}
        className={() => `text-[13px] leading-[20] px-3 py-2 bg-${theme().card} text-${theme().foreground} ${ring()}`} padLeft={12} padTop={8} fontPx={() => 13}
        onEscape={() => { setTool(''); ui.focusNode(root.node); }}
        onKey={(e: ui.KeyEvent): boolean => {
          if (e.primary && (e.key === 'f' || e.key === 'g')) { setTool(e.key === 'f' ? 'find' : 'line'); return true; }
          if (e.key === 'F3') { find(e.shift); return true; }
          return false;
        }} />
      <Canvas className="absolute inset-0 pointer-events-none" style={{ lazy: 1 }} onDraw={(x: i32, y: i32, w: i32, h: i32) => drawCursors(b, x, y, w, h)} />
    </View>
  </View>;
  componentEffect(() => {
    const name = tool();
    if (name !== lastTool.current) {
      lastTool.current = name;
      const focusField = (h: i32): boolean => {
        const n = ui.inspectNode(h); if (n === null) return false;
        if (n.ed !== null && n.label === (name === 'find' ? 'Find text' : 'Line number')) { ui.focusNode(h); return true; }
        for (const child of n.children) if (focusField(child)) return true;
        return false;
      };
      if (name !== '') focusField(root.node);
    }
    return undefined;
  });
  componentEffect(() => {
    if (!own.transition(EditorLife.Mounted)) return undefined;
    b.onEdited = (s: EditorState) => p.onChange(s.text());
    const generation = own.generation, serial = ui.nodeSerial(b.node());
    const tick = (): void => {
      if (own.life !== EditorLife.Mounted || own.generation !== generation || ui.nodeSerial(b.node()) !== serial) return;
      stepCursors(b);
      if (ui.focused() === b.node()) stepEditor(b, matches(), query().length, -1);
    };
    ui.addWatcher(tick);
    return () => { ui.removeWatcher(tick); own.transition(EditorLife.Disposed); b.onEdited = null; b.jump = []; };
  });
  return node;
}
export interface DiffViewerProps {
  before: string; after: string; language?: string; title?: string; mode?: string; context?: i32; height?: number; className?: string;
}
class DiffInputs {
  before: string = ''; after: string = ''; rows: DiffLine[] = []; changes: i32[] = [];
  oldDoc: Doc = new Doc(0); newDoc: Doc = new Doc(0);
  viewRows: DiffLine[] = []; expanded: i32[] = []; context: i32 = 0; split: boolean = false; pairs: DiffPair[] = [];
  update(before: string, after: string, language: string): void {
    if (before !== this.before || after !== this.after) {
      this.before = before; this.after = after; this.rows = diffLines(before, after);
      this.changes = this.rows.map((row: DiffLine, i: i32) => row.kind !== 0 && (i === 0 || this.rows[i - 1].kind === 0) ? i : -1).filter((i: i32) => i >= 0);
    }
    const lang = langNamed(language);
    this.oldDoc.setLanguage(lang); this.newDoc.setLanguage(lang);
    this.oldDoc.setText(before); this.newDoc.setText(after);
  }
  view(context: i32, expanded: i32[], split: boolean): DiffPair[] {
    if (this.viewRows === this.rows && this.context === context && this.expanded === expanded && this.split === split) return this.pairs;
    this.viewRows = this.rows; this.context = context; this.expanded = expanded; this.split = split;
    this.pairs = diffPairs(this.rows, diffVisible(this.rows, context, expanded), split);
    return this.pairs;
  }
}
export function DiffViewer(p: DiffViewerProps): i32 {
  const viewport = createNodeRef(), root = createNodeRef();
  const [expanded, setExpanded] = componentSignal<i32[]>([]), [change, setChange] = componentSignal<i32>(-1);
  const [wide, setWide] = componentSignal(false);
  const cache = componentRef<DiffInputs | null>(null);
  if (cache.current === null) cache.current = new DiffInputs();
  const data = cache.current as DiffInputs;
  const rows = componentMemo<DiffLine[]>(() => { data.update(p.before, p.after, p.language ?? ''); return data.rows; }, []);
  const split = (): boolean => p.mode !== 'inline' && wide();
  const changes = componentMemo<i32[]>(() => { rows(); return data.changes; }, []);
  const pairs = componentMemo<DiffPair[]>(() => { rows(); return data.view(p.context ?? 3, expanded(), split()); }, []);
  const navigate = (by: i32): void => {
    if (changes().length === 0) return;
    const next = change() < 0 ? by < 0 ? changes().length - 1 : 0 : (change() + by + changes().length) % changes().length; setChange(next);
    ui.scrollToRow(viewport.node, pairs().findIndex((pair: DiffPair) => pair.left === changes()[next] || pair.right === changes()[next])); ui.focusNode(viewport.node);
  };
  const cell = (index: i32, old: boolean, range: i32[]): i32 => {
    if (index < 0) return <View className="flex-1 min-w-0" />;
    const r = rows()[index], line = old ? r.oldLine : r.newLine, doc = old ? data.oldDoc : data.newDoc;
    return <View className={`flex-1 min-w-0 ${old && split() ? 'border-r border-' + theme().border : ''} ${r.kind < 0 ? 'bg-' + theme().destructiveSoft : r.kind > 0 ? 'bg-' + theme().successSoft : ''}`}>
      <CodeView tabIndex={-1} code={old ? r.before : r.after} lang={p.language} appearance={codeTheme} document={doc} offset={doc.starts[Math.max(0, line - 1)]}
        emphasizedRange={range} className={`text-[12px] leading-[24] p-0 bg-transparent text-${theme().foreground}`} />
    </View>;
  };
  const row = (position: i32): i32 => {
    const pair = pairs()[position];
    if (pair.fold >= 0) {
      let end = pair.fold;
      while (end < rows().length && rows()[end].kind === 0) end++;
      const hidden = end - pair.fold - (pair.fold === 0 ? 0 : p.context ?? 3) - (end === rows().length ? 0 : p.context ?? 3);
      return <KitButton label={'Show ' + String(hidden) + ' unchanged lines'} size="sm" variant="ghost" className="h-[24px] w-full justify-center rounded-none" onClick={() => setExpanded(expanded().concat([pair.fold]))} />;
    }
    const left = pair.left >= 0 ? rows()[pair.left] : new DiffLine(), right = pair.right >= 0 ? rows()[pair.right] : new DiffLine();
    const removed = pair.left >= 0 && left.kind < 0, added = pair.right >= 0 && right.kind > 0;
    const range = removed && added ? diffRange(left.before, right.after) : [];
    return <View className={`flex-row h-[24px] min-w-0 ${!split() && removed ? 'bg-' + theme().destructiveSoft : !split() && added ? 'bg-' + theme().successSoft : ''}`}>
      <Text className={`w-[76px] shrink-0 text-[11px] font-mono text-${theme().mutedForeground}`}>{(left.oldLine === 0 ? '' : String(left.oldLine)) + ' ' + (right.newLine === 0 ? '' : String(right.newLine)) + (removed ? ' −' : added ? ' +' : '  ')}</Text>
      <Show when={split()}>{cell(pair.left, true, range.length === 4 ? range.slice(0, 2) : [])}</Show>
      {cell(split() ? pair.right : pair.left >= 0 ? pair.left : pair.right, !split() && pair.left >= 0, range.length === 4 ? range.slice(2) : [])}
    </View>;
  };
  const node = <View ref={root} role="group" aria-label={p.title ?? 'Text differences'} className={`${surface()} ${p.className ?? ''}`}>
    <View className={`flex-row flex-wrap items-center gap-2 p-2 border-b border-${theme().border}`}>
      <Text role="status" className={`grow text-[12px] text-${theme().mutedForeground}`}>{p.title ?? 'Changes'}: {String(changes().length)}</Text>
      <KitButton label="Previous change" variant="ghost" size="sm" onClick={() => navigate(-1)} />
      <KitButton label="Next change" variant="ghost" size="sm" onClick={() => navigate(1)} />
    </View>
    <Show when={split()}><View className={`flex-row h-[24px] border-b border-${theme().border}`}><View className="w-[76px] shrink-0" /><Text className={`flex-1 text-[11px] text-${theme().mutedForeground}`}>Before</Text><Text className={`flex-1 text-[11px] text-${theme().mutedForeground}`}>After</Text></View></Show>
    <View ref={viewport} focusable role="region" aria-label={(p.title ?? 'Text differences') + ' rows'} aria-description="F7 moves to the next change; Shift F7 moves to the previous change." className={`overflow-y-auto min-w-0 ${ring()}`} style={{ height: p.height ?? 240 }} onKeyDown={(e: ui.KeyEvent) => {
      if (e.key === 'F7') { navigate(e.shift ? -1 : 1); e.preventDefault(); }
    }} />
  </View>;
  virtualRows(viewport.node, () => pairs().length, 24, row);
  componentEffect(() => {
    const serial = ui.nodeSerial(root.node);
    const resize = (): void => { if (ui.nodeSerial(root.node) === serial) setWide(ui.screenBox(root.node)[2] >= 560); };
    resize(); ui.addWatcher(resize);
    return () => ui.removeWatcher(resize);
  });
  return node;
}
export interface MarkdownViewProps {
  source: string; compact?: boolean; height?: number; className?: string;
  onLink?: (href: string) => void; onTask?: (source: string, offset: i32, checked: boolean) => void;
}
interface MarkdownInput { source: string; blocks: Block[] }
export function MarkdownView(p: MarkdownViewProps): i32 {
  const cache = componentRef<MarkdownInput | null>(null);
  const blocks = componentMemo<Block[]>(() => {
    const previous = cache.current;
    if (previous !== null && previous.source === p.source) return previous.blocks;
    const parsed = viewBlocks(parseMarkdown(p.source, GITHUB | FLAG_NO_HTML));
    cache.current = { source: p.source, blocks: parsed }; return parsed;
  }, []);
  return <ScrollView className={`min-w-0 text-${theme().foreground} ${p.className ?? ''}`} style={{ height: p.height ?? -1 }}>
    <SelectableMarkdown blocks={blocks()} small={p.compact ?? false} options={{
      bodyClass: p.compact === true ? 'text-[12px] leading-[18px]' : 'text-[13px] leading-[20px]',
      focus: ring,
      foreground: (): string => `text-${theme().foreground}`,
      muted: (): string => `text-${theme().mutedForeground}`,
      border: (): string => `border-${theme().border}`,
      surface: (): string => `bg-${theme().muted}`,
      activeColor: (): i32 => ui.tailwindColor(theme().accent),
      codeColor: (): i32 => ui.tailwindColor(theme().foreground),
      linkColor: (): i32 => ui.tailwindColor(theme().foreground),
      code: (block: Block): i32 => <CodeBlock code={block.code} language={block.lang} />,
      onLink: p.onLink,
      onTask: p.onTask === undefined ? undefined : (offset: i32, checked: boolean): void => { if (p.onTask !== undefined) p.onTask(setTask(p.source, offset, checked), offset, checked); },
    }} />
  </ScrollView>;
}
export interface JsonViewerProps { source: string; label?: string; expandDepth?: i32; height?: number; className?: string }
interface JsonInput { source: string; document: JsonDocument }
interface JsonRows { document: JsonDocument; toggled: string[]; depth: i32; rows: JsonLine[] }
export function JsonViewer(p: JsonViewerProps): i32 {
  const viewport = createNodeRef();
  const [toggled, setToggled] = componentSignal<string[]>([]), [selected, setSelected] = componentSignal('');
  const input = componentRef<JsonInput | null>(null), flattened = componentRef<JsonRows | null>(null);
  const document = componentMemo<JsonDocument>(() => {
    const previous = input.current;
    if (previous !== null && previous.source === p.source) return previous.document;
    const parsed = parseJsonDocument(p.source); input.current = { source: p.source, document: parsed }; return parsed;
  }, new JsonDocument(null, '', JsonStatus.Parsed));
  const rows = componentMemo<JsonLine[]>(() => {
    const doc = document(), folds = toggled(), depth = Math.max(0, Math.min(64, p.expandDepth ?? 2)) as i32, previous = flattened.current;
    if (previous !== null && previous.document === doc && previous.toggled === folds && previous.depth === depth) return previous.rows;
    const result = doc.status === JsonStatus.Invalid ? [] : jsonValueLines(doc.value, folds, depth);
    flattened.current = { document: doc, toggled: folds, depth, rows: result }; return result;
  }, []);
  const toggle = (row: JsonLine): void => {
    if (row.fold === 0) return;
    const old = toggled(); setToggled(old.indexOf(row.path) >= 0 ? old.filter((s: string) => s !== row.path) : old.concat([row.path]));
  };
  const move = (e: ui.KeyEvent): void => {
    const rs = rows(); if (rs.length === 0) return;
    const index = Math.max(0, rs.findIndex((row: JsonLine) => row.path === selected()));
    let next = index;
    if (e.key === 'ArrowDown') next = Math.min(rs.length - 1, index + 1);
    else if (e.key === 'ArrowUp') next = Math.max(0, index - 1);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = rs.length - 1;
    else if (e.key === 'Enter' || e.key === ' ') toggle(rs[index]);
    else if (e.key === 'ArrowRight') { if (rs[index].fold === 2) toggle(rs[index]); else if (rs[index].fold === 1 && index + 1 < rs.length) next++; }
    else if (e.key === 'ArrowLeft') {
      if (rs[index].fold === 1) toggle(rs[index]);
      else while (next > 0) { next--; if (rs[next].depth < rs[index].depth) break; }
    } else return;
    setSelected(rs[next].path); ui.scrollToRow(viewport.node, next); e.preventDefault();
  };
  const current = (): string => rows().some((row: JsonLine) => row.path === selected()) ? selected() : '';
  const rowId = (path: string): string => 'kit-json-' + String(ui.nodeSerial(viewport.node)) + '-' + toHex(utf8Encode(path));
  const node = <View className={`${surface()} ${p.className ?? ''}`}>
    <View className={`p-2 flex-row items-center border-b border-${theme().border}`}><Text className={`grow text-[12px] text-${theme().mutedForeground}`}>{p.label ?? 'JSON'}</Text><CopyButton text={() => p.source} label="Copy JSON" /></View>
    <Show when={rows().length === 0}><Text role="alert" className={`p-3 text-[13px] text-${theme().destructive}`}>{'Invalid JSON: ' + document().error}</Text></Show>
    <View ref={viewport} role="tree" aria-label={p.label ?? 'JSON value'} aria-activedescendant={rows().length > 0 ? rowId(current()) : ''} focusable className={`overflow-y-auto ${ring()}`} style={{ height: p.height ?? 220 }} onKeyDown={move} />
  </View>;
  virtualRows(viewport.node, () => rows().length, 26, (index: i32) => {
    const row = rows()[index];
    return <Button role="treeitem" id={rowId(row.path)} aria-posinset={String(row.position)} aria-setsize={String(row.size)} aria-label={(row.depth > 0 ? JSON.stringify(row.key) + ': ' : '') + row.text} aria-level={String(row.depth + 1)}
      aria-expanded={row.fold === 0 ? '' : row.fold === 1 ? 'true' : 'false'} aria-selected={String(current() === row.path)} tabIndex={-1}
      className={`h-[26px] flex-row items-center justify-start text-left ${current() === row.path ? 'bg-' + theme().accentSoft : ''}`} style={{ paddingLeft: 8 + row.depth * 16 }}
      onClick={() => { setSelected(row.path); toggle(row); ui.focusNode(viewport.node); }}>
      <Text className={`select-text font-mono text-[12px] text-${theme().foreground}`}>{(row.fold === 1 ? '▾ ' : row.fold === 2 ? '▸ ' : '  ') + (row.depth > 0 ? JSON.stringify(row.key) + ': ' : '') + row.text}</Text>
    </Button>;
  });
  return node;
}
