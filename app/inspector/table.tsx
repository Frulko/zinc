// The data grid and the JSON tree of the Storage panel, after Chrome DevTools' Application panel: a header of columns (click: sort, drag the
// right edge: resize), rows of typed cells cut with an ellipsis (NULL dimmed, numbers right-aligned, blobs as their size and first bytes),
// row selection (click, Cmd/Ctrl-click, Shift-click; arrows; Delete), a double-click edits a cell in place; and a value's JSON shown as a
// tree whose objects and arrays fold.
import { createSignal, createNodeRef, onMount } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';

export const TEXT: i32 = 0;
export const NUM: i32 = 1;
export const NULL: i32 = 2;
export const BLOB: i32 = 3;
export class Cell { text: string = ''; kind: i32 = TEXT; }
export function cell(text: string, kind: i32): Cell { const c = new Cell(); c.text = text; c.kind = kind; return c; }

/** A grid's state. `local`: sorted and filtered here (all the rows are here); else by its owner (`onSort`, SQL with paging). */
export class Grid {
  cols: () => string[]; setCols: (v: string[]) => void;
  rows: () => Cell[][]; setRows: (v: Cell[][]) => void;
  widths: () => number[]; setWidths: (v: number[]) => void;
  sortCol: () => i32; setSortCol: (v: i32) => void;   // -1: the rows' own order
  desc: () => boolean; setDesc: (v: boolean) => void;
  filter: () => string; setFilter: (v: string) => void;
  selected: () => string[]; setSelected: (v: string[]) => void;   // the ids of the rows selected
  edit: () => string; setEdit: (v: string) => void;   // '<row id>\n<column>' of the cell edited, '' when none
  draft: () => string; setDraft: (v: string) => void;
  local: boolean = true;
  fill: boolean = true;   // the last column takes the rest of the width (no horizontal scroll)
  editable: boolean = false;
  anchor: string = '';   // the row a Shift-click extends from
  idOf: (row: i32) => string = (row: i32): string => '' + row;
  onSort: () => void = (): void => {};
  onSelect: (id: string) => void = (id: string): void => {};
  onCommit: (id: string, col: i32, text: string) => void = (id: string, col: i32, text: string): void => {};
  onDelete: () => void = (): void => {};
  constructor() {
    const [a, b] = createSignal<string[]>([]); this.cols = a; this.setCols = b;
    const [c, d] = createSignal<Cell[][]>([]); this.rows = c; this.setRows = d;
    const [e, f] = createSignal<number[]>([]); this.widths = e; this.setWidths = f;
    const [g, h] = createSignal<i32>(-1); this.sortCol = g; this.setSortCol = h;
    const [i, j] = createSignal<boolean>(false); this.desc = i; this.setDesc = j;
    const [k, l] = createSignal<string>(''); this.filter = k; this.setFilter = l;
    const [m, n] = createSignal<string[]>([]); this.selected = m; this.setSelected = n;
    const [o, p] = createSignal<string>(''); this.edit = o; this.setEdit = p;
    const [q, r] = createSignal<string>(''); this.draft = q; this.setDraft = r;
  }
  width(c: i32): number { const w = this.widths(); return c < w.length ? w[c] : 140; }
  /** The rows shown, in order (indices in rows()): filtered (a cell contains the text, any case) and sorted when local. */
  shown(): i32[] {
    const rs = this.rows(), out: i32[] = [];
    const f = this.local ? this.filter().toLowerCase() : '';
    for (let i = 0; i < rs.length; i++) {
      if (f.length === 0) { out.push(i); continue; }
      for (const c of rs[i]) if (c.text.toLowerCase().indexOf(f) >= 0) { out.push(i); break; }
    }
    const s = this.sortCol(), sign = this.desc() ? -1 : 1;
    if (this.local && s >= 0) out.sort((a: i32, b: i32): number => sign * compareCells(rs[a][s], rs[b][s]));
    return out;
  }
  /** Header clicked: sorted by that column, ascending, then descending, then not sorted. */
  sortBy(c: i32): void {
    if (this.sortCol() !== c) { this.setSortCol(c); this.setDesc(false); }
    else if (!this.desc()) this.setDesc(true);
    else { this.setSortCol(-1); this.setDesc(false); }
    this.onSort();
  }
  isSelected(id: string): boolean { return this.selected().indexOf(id) >= 0; }
  /** A row clicked: alone, toggled (Cmd/Ctrl) or the range from the last one clicked (Shift). */
  pick(id: string, toggle: boolean, range: boolean): void {
    if (range && this.anchor.length > 0) {
      const ids = this.shown().map((r: i32) => this.idOf(r));
      const a = ids.indexOf(this.anchor), b = ids.indexOf(id);
      if (a >= 0 && b >= 0) { this.setSelected(ids.slice(Math.min(a, b), Math.max(a, b) + 1)); this.onSelect(id); return; }
    }
    if (toggle) {
      const s = this.selected().filter((x: string) => x !== id);
      if (s.length === this.selected().length) s.push(id);
      this.setSelected(s);
    } else this.setSelected([id]);
    this.anchor = id;
    this.onSelect(id);
  }
  /** The selection moved by the arrows. */
  step(by: i32): void {
    const ids = this.shown().map((r: i32) => this.idOf(r));
    if (ids.length === 0) return;
    const s = this.selected();
    const at = s.length > 0 ? ids.indexOf(s[s.length - 1]) : -1;
    this.pick(ids[Math.max(0, Math.min(ids.length - 1, at < 0 ? 0 : at + by))], false, false);
  }
  startEdit(id: string, col: i32, text: string): void { if (!this.editable) return; this.setDraft(text); this.setEdit(id + '\n' + col); }
  commit(): void {
    const e = this.edit();
    if (e.length === 0) return;
    this.setEdit('');
    const at = e.lastIndexOf('\n');
    this.onCommit(e.slice(0, at), parseInt(e.slice(at + 1)), this.draft());
  }
  /** The rows shown as text, one line each, the columns joined by ' | ' (the dump). */
  lines(): string[] { const rs = this.rows(); return this.shown().map((r: i32) => rs[r].map((c: Cell) => c.text).join(' | ')); }
}
function compareCells(a: Cell, b: Cell): number {
  if (a.kind === NULL || b.kind === NULL) return a.kind === b.kind ? 0 : a.kind === NULL ? -1 : 1;   // NULL first, as SQLite sorts
  if (a.kind === NUM && b.kind === NUM) return parseFloat(a.text) - parseFloat(b.text);
  return a.text < b.text ? -1 : a.text > b.text ? 1 : 0;
}

function cellColor(k: i32): string { return k === NULL ? 'text-slate-400 italic' : k === NUM ? 'text-blue-700' : k === BLOB ? 'text-violet-700' : 'text-slate-900'; }

function EditCell(p: { g: Grid }): i32 {
  const r = createNodeRef();
  onMount(() => { ui.focusNode(r.node); });
  return <Input ref={r} className="flex-1 h-5 px-1 text-xs font-mono text-slate-900 bg-white border border-sky-500" value={p.g.draft()}
    onInput={(v: string) => { p.g.setDraft(v); }} onChange={(v: string) => { p.g.setDraft(v); p.g.commit(); }}
    onKeyDown={(e: ui.KeyEvent) => { if (e.key === 'Escape') { p.g.setEdit(''); e.preventDefault(); } }} />;
}

// Component bodies run once (untracked): what follows a signal is read inside the JSX.
function CellBody(p: { g: Grid; id: string; col: i32; c: Cell }): i32 {
  return <View className="flex-1 h-5 flex-row items-center" onPointerDown={(e: ui.PointerEvent) => {
      if (e.clicks === 2) p.g.startEdit(p.id, p.col, p.c.kind === NULL ? '' : p.c.text);
      else if (e.button === 0) p.g.pick(p.id, e.meta || e.ctrl, e.shift);
    }}>
    {p.g.edit() === p.id + '\n' + p.col ? <EditCell g={p.g} /> :
      <Text className={'flex-1 text-xs font-mono truncate ' + cellColor(p.c.kind) + (p.c.kind === NUM ? ' text-right' : '')}>{p.c.text}</Text>}
  </View>;
}
function GridCell(p: { g: Grid; id: string; col: i32; c: Cell; last: boolean }): i32 {
  if (p.last && p.g.fill) return <View className="flex-1 h-5 px-1.5 flex-row"><CellBody g={p.g} id={p.id} col={p.col} c={p.c} /></View>;
  return <View className="h-5 px-1.5 flex-row border-r border-slate-200" style={{ width: p.g.width(p.col) }}><CellBody g={p.g} id={p.id} col={p.col} c={p.c} /></View>;
}

function GridRow(p: { g: Grid; r: i32; n: i32 }): i32 {
  const id = p.g.idOf(p.r), cs = p.g.rows()[p.r];
  return <View className={'flex-row h-5 ' + (p.g.isSelected(id) ? 'bg-sky-100' : p.n % 2 === 1 ? 'bg-slate-50' : 'bg-white')}>
    {cs.map((c: Cell, k: i32) => <GridCell g={p.g} id={id} col={k} c={c} last={k === cs.length - 1} />)}
  </View>;
}

function HeaderLabel(p: { g: Grid; col: i32; name: string }): i32 {
  return <Button className="flex-1 h-6 px-1.5 flex-row items-center justify-start bg-transparent hover:bg-slate-200" onClick={() => { p.g.sortBy(p.col); }}>
    <Text className="flex-1 text-xs font-medium text-slate-700 truncate">{p.name + (p.g.sortCol() === p.col ? (p.g.desc() ? ' ▼' : ' ▲') : '')}</Text>
  </Button>;
}
function HeaderCell(p: { g: Grid; col: i32; name: string; last: boolean }): i32 {
  if (p.last && p.g.fill) return <View className="flex-1 h-6 flex-row"><HeaderLabel g={p.g} col={p.col} name={p.name} /></View>;
  let start = 0;
  return <View className="h-6 flex-row items-center" style={{ width: p.g.width(p.col) }}>
    <HeaderLabel g={p.g} col={p.col} name={p.name} />
    <View className="w-1 h-6 bg-slate-300 hover:bg-sky-400" dragAxis="x" dragThreshold={1} onDrag={(e: ui.PointerEvent) => {
      if (e.phase === 0) start = p.g.width(p.col);
      const w = p.g.widths().slice();
      while (w.length <= p.col) w.push(140);
      w[p.col] = Math.max(40, Math.round(start + e.dx));
      p.g.setWidths(w);
    }} />
  </View>;
}

/** The grid: its header and rows (vertical scroll; horizontal too when the columns are fixed widths). */
export function GridView(p: { g: Grid }): i32 {
  const body = <View className="flex-col flex-1">
    <View className="flex-row bg-slate-100 border-b border-slate-300">{p.g.cols().map((c: string, k: i32) => <HeaderCell g={p.g} col={k} name={c} last={k === p.g.cols().length - 1} />)}</View>
    <ScrollView className="flex-1"><View className="flex-col">{p.g.shown().map((r: i32, n: i32) => <GridRow g={p.g} r={r} n={n} />)}</View></ScrollView>
  </View>;
  return <View className={'flex-col flex-1 ' + (p.g.fill ? '' : 'overflow-x-auto')} focusable onKeyDown={(e: ui.KeyEvent) => {
    if (p.g.edit().length > 0) return;
    if (e.key === 'ArrowDown') { p.g.step(1); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { p.g.step(-1); e.preventDefault(); }
    else if (e.key === 'Delete' || e.key === 'Backspace') { p.g.onDelete(); e.preventDefault(); }
  }}>{body}</View>;
}

// ---- the JSON tree
/** A line of the tree: a key and a value (a leaf), or an object / array with its preview, open or folded. */
export class JLine { depth: i32 = 0; path: string = ''; key: string = ''; text: string = ''; kind: i32 = TEXT; fold: i32 = 0; }   // fold: 0 leaf, 1 open, 2 folded
export const [folds, setFolds] = createSignal<string[]>([]);   // the paths whose default (open to depth 1) is toggled
function isOpen(path: string, depth: i32): boolean { return (depth < 2) !== (folds().indexOf(path) >= 0); }
export function toggleFold(path: string): void {
  const f = folds().filter((x: string) => x !== path);
  if (f.length === folds().length) f.push(path);
  setFolds(f);
}
function leaf(v: any): Cell {
  if (v === null) return cell('null', NULL);
  if (typeof v === 'number' || typeof v === 'boolean') return cell(JSON.stringify(v), NUM);
  return cell(JSON.stringify(v), TEXT);
}
/** Chrome's preview of a folded object or array: {a: 1, b: "x"} / Array(3), cut at 80 characters. */
function preview(v: any): string {
  if (Array.isArray(v)) return 'Array(' + v.length + ')';
  const ks = Object.keys(v);
  const parts: string[] = [];
  for (const k of ks) parts.push(k + ': ' + (v[k] !== null && typeof v[k] === 'object' ? (Array.isArray(v[k]) ? '[…]' : '{…}') : JSON.stringify(v[k])));
  const s = '{' + parts.join(', ') + '}';
  return s.length > 80 ? s.slice(0, 79) + '…' : s;
}
function walk(v: any, key: string, path: string, depth: i32, out: JLine[]): void {
  const l = new JLine();
  l.depth = depth; l.path = path; l.key = key;
  out.push(l);
  if (v === null || typeof v !== 'object') { const c = leaf(v); l.text = c.text; l.kind = c.kind; return; }
  l.text = preview(v);
  const open = isOpen(path, depth);
  l.fold = open ? 1 : 2;
  if (!open) return;
  if (Array.isArray(v)) { for (let i = 0; i < v.length; i++) walk(v[i], '' + i, path + '/' + i, depth + 1, out); return; }
  for (const k of Object.keys(v)) walk(v[k], k, path + '/' + k, depth + 1, out);
}
/** The lines of a value's tree; [] when it is not a JSON object or array. */
export function jsonLines(text: string): JLine[] {
  let v: any = null;
  try { v = JSON.parse(text); } catch (e) { return []; }
  if (v === null || typeof v !== 'object') return [];
  const out: JLine[] = [];
  walk(v, '', '', 0, out);
  return out;
}
/** A line of the tree as the dump prints it. */
export function lineText(l: JLine): string {
  return '  '.repeat(l.depth) + (l.fold === 1 ? '▼ ' : l.fold === 2 ? '▶ ' : '') + (l.key.length > 0 ? l.key + ': ' : '') + l.text;
}
function JRow(p: { l: JLine }): i32 {
  return <View className="flex-row items-center h-4" style={{ paddingLeft: 4 + p.l.depth * 14 }}
    onPointerDown={(e: ui.PointerEvent) => { if (p.l.fold > 0) toggleFold(p.l.path); }}>
    <Text className="w-3 text-[9px] text-slate-500">{p.l.fold === 1 ? '▼' : p.l.fold === 2 ? '▶' : ''}</Text>
    {p.l.key.length > 0 ? <Text className="text-xs font-mono text-purple-800">{p.l.key + ': '}</Text> : <View />}
    <Text className={'flex-1 text-xs font-mono truncate ' + (p.l.fold > 0 ? 'text-slate-600' : p.l.kind === TEXT ? 'text-red-700' : cellColor(p.l.kind))}>{p.l.text}</Text>
  </View>;
}
export function JsonTree(p: { text: string }): i32 {
  return <View className="flex-col">{jsonLines(p.text).map((l: JLine) => <JRow l={l} />)}</View>;
}
