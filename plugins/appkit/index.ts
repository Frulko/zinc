// zinc:appkit: the zinc:ui tree shown with real AppKit views (D210, docs/ui.md "Native views"). Importing it is enough: under "ui": {"render": "native"}
// (or ZINC_RENDER=native) on macOS it installs the native host, which zinc:ui hands each changed frame (ui.setHost); elsewhere it does nothing and the
// tree is drawn. Clicks, hover and drags fall through the views to zinc:ui's own hit testing, so they are the drawn UI's events; the views that take
// input themselves (fields, scroll views) report through the functions the web's DOM host uses.
import * as ui from 'zinc:ui';
import { windowCtl } from 'zinc:gfx';
import { createEffect, untrack } from 'zinc:ui/solid';
import A from './native/appkit.spec';

const EDIT = 0, CHANGE = 1, SUBMIT = 2, FOCUS = 3, BLUR = 4, SCROLL = 5, PRESS = 6, RESIZE = 7, SELECT = 8, SORT = 9, TYPE = 10, OPEN = 11, EXPAND = 12, ROWS = 13, LFOCUS = 14;

function onEvent(id: i32, kind: i32, text: string, a: number, b: number): void {
  if (!ui.hostMounted(id)) return;   // the node went, or its handle holds another node now
  const l = kind >= SELECT ? lists.get(id) : undefined;
  if (l !== undefined) { listEvent(l, kind, text, a, b); return; }   // a Table's or an Outline's own kinds
  if (kind === EDIT) ui.domEdit(id, text, a, b);
  else if (kind === CHANGE) ui.domChanged(id);
  else if (kind === SUBMIT) ui.submitFrom(id);
  else if (kind === FOCUS) ui.domFocus(id, false);
  else if (kind === BLUR) { if (ui.focused() === id) ui.domFocus(-1, false); }
  else if (kind === SCROLL) ui.domScroll(id, a, b);
  else if (kind === PRESS) ui.click(id);   // a toolbar item: its onPress, as a press of the drawn item
  else if (kind === RESIZE) ui.setNumber(id, 'width', a);   // a split pane the divider moved: its Yoga subtree is laid out again at that width
}

let shown = false;
if (ui.nativeRender() && A.start()) {
  A.onEvent(onEvent);
  shown = ui.setHost((changes: string) => { A.commit(changes); });
}

/** Whether AppKit views show the tree (render native on macOS); false where it is drawn. */
export function hostShown(): boolean { return shown; }
/** The native tree as text, one view per line indented by depth (`#ID kind x,y wxh`, then its text and colours): what tests compare. Empty when no host runs. */
export function dump(): string { return shown ? A.dump() : ''; }
/** Writes what the views show to a PNG at `path` (drawn offscreen, for people: it changes with each macOS); false when no host runs. */
export function snapshot(path: string): boolean { return shown && A.snapshot(path); }
/** Test hook: the node whose view AppKit's hit test picks at (x, y); -1 when a press there goes through the views to zinc:ui's own hit testing. */
export function hit(x: number, y: number): i32 { return shown ? A.hit(x, y) : -1; }
/** Test hook (as ui.pointerAt is for the drawn UI): 0 types `text` into field `h` through AppKit, 1 presses Enter in it, 2 scrolls scroll view `h` to
 *  (x, y), 3 sends the field editor of `h` the command `text` ('insertTab:'), 4 drags the first divider of split view `h` to x, 5 clicks toolbar item
 *  `h`; on a Table or an Outline `h`: 2 scrolls it to (x, y), 6 sorts by column `text` (x 1: ascending) as a click on its header does, 7 selects rows
 *  '3,4' (an Outline: the item id), 8 types the keys of `text` into it (type-select), 9 expands (x 1) or collapses item `text` of an Outline.
 *  The events come back at the next frame as a person's would. False when no host runs or h has no such view. */
export function drive(h: i32, action: i32, text: string = '', x: number = 0, y: number = 0): boolean { return shown && A.drive(h, action, text, x, y); }

// ---------------------------------------------------------------- the window chrome (ZN-1071): typed components with a drawn fallback
// Each is a zinc:ui node with a native kind (ui.setNativeKind): under the AppKit host it becomes the window's own chrome (title, NSToolbar,
// NSSplitView, a sidebar material); anywhere else (drawn, Linux, a Pi, the web) the same node draws a plain equivalent from its classes.
function el(tag: i32, cls: string): i32 { const h = ui.createNode(tag); ui.setClass(h, cls); return h; }
function slot(h: i32, children: (() => i32) | undefined): i32 { if (children !== undefined) ui.insert(h, children(), -1); return h; }

export interface WindowProps {
  title?: string;
  toolbarStyle?: string;      // 'automatic' | 'expanded' | 'preference' | 'unified' (the default) | 'unifiedCompact'
  fullSizeContent?: boolean;  // the content runs under a transparent title bar (pad its top)
  className?: string;
  children?: () => i32;
}
/** `<Window title="Library">`: the app's window, a column that fills it. Native: its title, toolbar style and title bar; drawn: the title through the HAL. */
export function Window(p: WindowProps): i32 {
  const h = el(ui.VIEW, `flex-col w-full h-full ${p.className ?? ''}`);
  ui.setNativeKind(h, 'window');
  const title = p.title ?? '';
  if (title !== '') { ui.setNativeAttr(h, 'title', title); if (!shown) windowCtl(0, 3, title, 0, 0); }
  ui.setNativeAttr(h, 'toolbarStyle', p.toolbarStyle ?? 'unified');
  ui.setNativeAttr(h, 'fullSizeContent', p.fullSizeContent === true ? '1' : '0');
  return slot(h, p.children);
}

export interface ToolbarProps { className?: string; children?: () => i32 }
/** `<Toolbar>` of ToolbarItems: the window's NSToolbar under the host (it takes no room in the content); drawn, a bar across the top. */
export function Toolbar(p?: ToolbarProps): i32 {
  const h = el(ui.VIEW, shown ? 'absolute left-0 top-0 flex-row items-center gap-[8px]' : `flex-row items-center gap-[8px] px-[12px] h-[38px] bg-[#ececec] border-b border-[#d0d0d0] ${p?.className ?? ''}`);
  ui.setNativeKind(h, 'toolbar');
  return slot(h, p?.children);
}

export interface ToolbarItemProps {
  label?: string;
  symbol?: string;          // an SF Symbol name ('plus', 'trash'); drawn, the label shows instead
  onPress?: () => void;
  children?: () => i32;     // a custom item (a search field): the item is this content at the size its layout gives
}
/** One item of a Toolbar: a labelled button with a symbol, or custom content. */
export function ToolbarItem(p: ToolbarItemProps): i32 {
  const label = p.label ?? '';
  const h = el(ui.VIEW, p.children !== undefined || shown ? 'flex-row items-center' : 'flex-row items-center px-[8px] h-[28px] rounded-[6px]');
  ui.setNativeKind(h, 'toolbaritem');
  ui.setNativeAttr(h, 'label', label);
  ui.setNativeAttr(h, 'symbol', p.symbol ?? '');
  const f = p.onPress;
  if (f !== undefined) ui.listen(h, f);
  if (p.children !== undefined) return slot(h, p.children);
  if (!shown && label !== '') { const t = ui.createText(label); ui.setClass(t, 'text-[13px] text-[#333333]'); ui.insert(h, t, -1); }
  return h;
}

export interface SplitViewProps { className?: string; children?: () => i32 }
/** `<SplitView>` of panes side by side (a Sidebar first): an NSSplitView whose divider resizes the sidebar, its subtree laid out again; drawn, a row. */
export function SplitView(p?: SplitViewProps): i32 {
  const h = el(ui.VIEW, `flex-row ${shown ? 'gap-[1px] ' : ''}${p?.className ?? ''}`);   // the host's thin divider is 1 px between the panes
  ui.setNativeKind(h, 'split');
  return slot(h, p?.children);
}

export interface SidebarProps {
  width?: number;      // its first width (220)
  minWidth?: number;   // how far the divider moves it (150 to 400)
  maxWidth?: number;
  className?: string;
  children?: () => i32;
}
/** The first pane of a SplitView: the system's sidebar material under the host, which holds its width when the window resizes; drawn, a grey column. */
export function Sidebar(p?: SidebarProps): i32 {
  const h = el(ui.VIEW, `flex-col ${shown ? '' : 'bg-[#e8e8e8] border-r border-[#d0d0d0] '}${p?.className ?? ''}`);
  ui.setNumber(h, 'width', p?.width ?? 220);
  ui.setNativeKind(h, 'sidebar');
  ui.setNativeAttr(h, 'minWidth', '' + (p?.minWidth ?? 150));
  ui.setNativeAttr(h, 'maxWidth', '' + (p?.maxWidth ?? 400));
  return slot(h, p?.children);
}

// ---------------------------------------------------------------- Table and Outline (ZN-1072)
// A Table is a column node (native kind 'table') holding a drawn header and a body that is zinc:ui's virtual list (ui.virtualize): only the rows in
// view, and a few more, exist as nodes, each marked with its index (native attribute 'row'). Under the host that window of rows is the cache the
// NSTableView's data source answers from, pushed with each commit: AppKit never calls the program. Its scrolling comes back as the body's scroll, so
// the virtual list builds the rows AppKit is about to show; selection, sorting, type-select and double-click come back as events. An Outline is the
// same list over the rows of its expanded items; the host gets its whole tree (attribute 'tree': outlines are sidebars, small) and an NSOutlineView
// expands and type-selects by itself. Drawn, both are these nodes: rows that select on click, a header that sorts, the keys (arrows, letters).
class List {
  outer: i32; body: i32 = -1; rowH: number;
  count: i32 = 0;
  rows: Map<i32, i32> = new Map<i32, i32>();   // row index -> its node while the virtual list has it built
  sel: i32[] = []; anchor: i32 = -1;
  typed: string = ''; typedAt: number = -1e9;  // type-select: the letters typed within a second
  label: (i: i32) => string;                   // the string type-select matches in row i
  render: (i: i32) => i32;
  picked: (l: List) => void;                   // the selection changed: the attribute and the program's onSelect
  open: (i: i32) => void = (_i: i32): void => {};
  toggle: (i: i32, on: boolean) => void = (_i: i32, _on: boolean): void => {};   // an outline's row folded by the drawn keys
  sort: (id: string, asc: boolean) => void = (_id: string, _asc: boolean): void => {};
  expand: (id: string, on: boolean) => void = (_id: string, _on: boolean): void => {};
  outlineRow: (id: string) => i32 = (_id: string): i32 => -1;   // an outline's row of item id (-1: hidden, or a table)
  constructor(outer: i32, rowH: number) {
    this.outer = outer; this.rowH = rowH;
    this.label = (_i: i32): string => ''; this.render = (_i: i32): i32 => -1; this.picked = (_l: List): void => {};
  }
}
// ponytail: keyed by the outer handle and never removed; a recycled handle's new List replaces the entry (events are checked with hostMounted)
const lists: Map<i32, List> = new Map<i32, List>();

const ROW = 'flex-row items-center';
function rowBg(l: List, i: i32): string { return l.sel.indexOf(i) >= 0 ? ' bg-[#cfe0fc]' : (i & 1) === 1 ? ' bg-[#f4f5f5]' : ''; }
function restyle(l: List): void { l.rows.forEach((row: i32, i: i32) => { ui.setClass(row, ROW + rowBg(l, i)); }); }
function refresh(l: List, count: i32): void {
  l.count = count;
  ui.setNativeAttr(l.outer, 'count', '' + count);
  ui.virtualize(l.body, count, l.rowH, (i: i32): i32 => {
    const r = l.render(i);
    ui.setClass(r, ROW + rowBg(l, i));
    ui.setNativeAttr(r, 'row', '' + i);
    l.rows.set(i, r);
    return r;
  }, (row: i32): void => { l.rows.forEach((r: i32, i: i32) => { if (r === row) l.rows.delete(i); }); });
}
function select(l: List, rows: i32[], reveal: boolean): void {
  l.sel = rows;
  if (rows.length > 0) l.anchor = rows[0];
  restyle(l);
  if (reveal && rows.length > 0 && !shown) ui.scrollToRow(l.body, rows[0]);   // the host reveals the row its selection attribute names
  l.picked(l);
}
/** The first row from `from` (wrapping) whose type-select string starts with `prefix`, ignoring case; -1 when none does. */
function findRow(l: List, prefix: string, from: i32): i32 {
  const p = prefix.toLowerCase();
  for (let k = 0; k < l.count; k++) { const i = (from + k) % l.count; if (l.label(i).toLowerCase().startsWith(p)) return i; }
  return -1;
}
function typeSelect(l: List, key: string): void {
  const t = ui.now();
  if (t - l.typedAt > 1000) l.typed = '';
  l.typedAt = t;
  l.typed += key;
  const cur = l.sel.length > 0 ? l.sel[0] : -1;
  const r = findRow(l, l.typed, l.typed.length === 1 ? cur + 1 : Math.max(cur, 0));   // one letter steps on to the next match, more refine this one
  if (r >= 0) select(l, [r], true);
}
function clickRow(l: List, i: i32, mods: i32, multiple: boolean): void {
  if (multiple && (mods & ui.SHIFT) !== 0 && l.anchor >= 0) {
    const rows: i32[] = [];
    for (let k = Math.min(l.anchor, i); k <= Math.max(l.anchor, i); k++) rows.push(k);
    const a = l.anchor;
    select(l, rows, false);
    l.anchor = a;
  } else if (multiple && (mods & (ui.META | ui.CTRL)) !== 0) {
    const rows = l.sel.slice(), at = rows.indexOf(i);
    if (at >= 0) rows.splice(at, 1); else rows.push(i);
    select(l, rows, false);
  } else select(l, [i], false);
}
/** The drawn list's keys (under the host the AppKit view has its own): arrows move the selection, Left and Right fold an outline, Enter opens, letters type-select. */
function listKey(l: List, e: ui.KeyEvent): void {
  if (shown) return;
  const cur = l.sel.length > 0 ? l.sel[0] : -1;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    const r = Math.min(Math.max(e.key === 'ArrowDown' ? cur + 1 : cur - 1, 0), l.count - 1);
    if (r >= 0) select(l, [r], true);
  } else if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && cur >= 0) l.toggle(cur, e.key === 'ArrowRight');
  else if (e.key === 'Enter' && cur >= 0) l.open(cur);
  else if (e.key.length === 1 && (e.mods & (ui.META | ui.CTRL)) === 0) typeSelect(l, e.key);
  else return;
  e.handled = true;
}
function listEvent(l: List, kind: i32, text: string, a: number, b: number): void {
  if (kind === ROWS) ui.domScroll(l.body, a, b);   // the rows AppKit shows from now: the virtual list builds them, the next commit pushes them
  else if (kind === SELECT) {
    const at = l.outlineRow(text);
    if (text === '' || at >= 0) { select(l, at >= 0 ? [at] : [], false); return; }
    const rows: i32[] = [];
    for (const s of text.split(',')) rows.push(parseInt(s) as i32);
    select(l, rows, false);
  } else if (kind === SORT) l.sort(text, a !== 0);
  else if (kind === TYPE) { const r = findRow(l, text, Math.max(a as i32, 0)); if (r >= 0) select(l, [r], true); }   // AppKit asks, the program's rows answer
  else if (kind === OPEN) { if (a >= 0) l.open(a as i32); }
  else if (kind === EXPAND) l.expand(text, a !== 0);
  else if (kind === LFOCUS) ui.domFocus(l.outer, false);
}
function listNode(kind: string, cls: string, rowH: number): List {
  const outer = el(ui.VIEW, `flex-col overflow-hidden ${shown ? '' : 'bg-[#ffffff] border border-[#d0d0d0] '}${cls}`);
  ui.setNativeKind(outer, kind);
  ui.setNativeAttr(outer, 'rowHeight', '' + rowH);
  ui.setFocusable(outer, true);
  const l = new List(outer, rowH);
  ui.onKeyDown(outer, (e: ui.KeyEvent) => { listKey(l, e); });
  lists.set(outer, l);
  return l;
}

export interface TableColumn {
  id: string;
  title: string;
  width?: number;       // px; the columns without one share what is left
  sortable?: boolean;   // a click on its header sorts by it (onSort)
  align?: string;       // 'left' (the default) | 'right' | 'center'
}
export interface TableProps {
  columns: TableColumn[];
  count: () => i32;                         // the number of rows, read in an effect: the rows are built again when the signals it reads change
  cell: (row: i32, column: i32) => string;  // the text of a cell; asked only for the rows in view (and by type-select)
  rowHeight?: number;                       // 24
  multiple?: boolean;                       // several rows can be selected (shift and cmd clicks); true by default
  onSelect?: (rows: i32[]) => void;
  onSort?: (column: string, ascending: boolean) => void;   // sort the data; the count's signal shows it
  onOpen?: (row: i32) => void;              // a double click, or Enter drawn
  className?: string;
}
/** `<Table columns={...} count={() => files().length} cell={(r, c) => ...} />`: an NSTableView under the host, its cells recycled by AppKit and
 *  answered from the visible rows zinc:ui pushes with each commit; drawn, a header over zinc:ui's virtual list. Only the rows in view are built. */
export function Table(p: TableProps): i32 {
  const rowH = p.rowHeight ?? 24, multiple = p.multiple !== false;
  const l = listNode('table', p.className ?? '', rowH);
  const cols = p.columns;
  let spec = '';
  for (const c of cols) spec += (spec === '' ? '' : '\n') + `${c.id}\t${c.title}\t${c.width ?? 0}\t${c.sortable === true ? 1 : 0}\t${c.align ?? 'left'}`;
  ui.setNativeAttr(l.outer, 'columns', spec);
  ui.setNativeAttr(l.outer, 'multiple', multiple ? '1' : '0');
  const width = (c: TableColumn): string => c.width !== undefined ? `w-[${c.width}px]` : 'flex-1';
  const just = (c: TableColumn): string => c.align === 'right' ? ' items-end' : c.align === 'center' ? ' items-center' : '';
  // the header: drawn only (under the host the NSTableView has its own, and this node takes no room)
  const header = el(ui.VIEW, shown ? 'absolute h-[0px]' : 'flex-row h-[24px] bg-[#f6f6f6] border-b border-[#d0d0d0]');
  const marks: i32[] = [];
  let sortCol = '', asc = true;
  const sortBy = (id: string, up: boolean): void => {
    sortCol = id; asc = up;
    ui.setNativeAttr(l.outer, 'sort', `${id} ${up ? 1 : 0}`);
    for (let k = 0; k < cols.length; k++) ui.setText(marks[k], cols[k].id === id ? (up ? ' ▲' : ' ▼') : '');
    const f = p.onSort;
    if (f !== undefined) f(id, up);
  };
  l.sort = sortBy;
  for (const c of cols) {
    const h = el(ui.VIEW, `flex-row items-center px-[6px] ${width(c)}`);
    const t = ui.createText(c.title); ui.setClass(t, 'text-[12px] text-[#333333]'); ui.insert(h, t, -1);
    const m = ui.createText(''); ui.setClass(m, 'text-[10px] text-[#666666]'); ui.insert(h, m, -1);
    marks.push(m);
    if (c.sortable === true) ui.listen(h, () => { sortBy(c.id, sortCol === c.id ? !asc : true); });
    ui.insert(header, h, -1);
  }
  ui.insert(l.outer, header, -1);
  l.body = el(ui.VIEW, 'flex-1');
  ui.insert(l.outer, l.body, -1);
  l.label = (i: i32): string => cols.length > 0 ? p.cell(i, 0) : '';
  l.render = (i: i32): i32 => {
    const r = ui.createNode(ui.VIEW);
    for (let k = 0; k < cols.length; k++) {
      const c = cols[k];
      const box = el(ui.VIEW, `flex-col justify-center px-[6px] overflow-hidden ${width(c)}${just(c)}`);
      const t = ui.createText(p.cell(i, k)); ui.setClass(t, 'text-[13px] whitespace-nowrap truncate'); ui.insert(box, t, -1);
      ui.insert(r, box, -1);
    }
    ui.onPointer(r, ui.PDOWN, (e: ui.PointerEvent) => { clickRow(l, i, e.mods, multiple); ui.focusNode(l.outer); });
    ui.onPointer(r, ui.PDBL, (_e: ui.PointerEvent) => { l.open(i); });
    return r;
  };
  l.picked = (s: List): void => {
    ui.setNativeAttr(s.outer, 'selection', s.sel.join(','));
    const f = p.onSelect;
    if (f !== undefined) f(s.sel.slice());
  };
  l.open = (i: i32): void => { const f = p.onOpen; if (f !== undefined) f(i); };
  createEffect(() => { const n = p.count(); untrack(() => { refresh(l, n); return 0; }); });
  return l.outer;
}

export interface OutlineItem { id: string; label: string; children?: OutlineItem[] }
export interface OutlineProps {
  items: OutlineItem[];
  expanded?: string[];                      // the items open at first
  rowHeight?: number;                       // 22
  onSelect?: (id: string) => void;          // '' when nothing is selected
  onToggle?: (id: string, expanded: boolean) => void;
  onOpen?: (id: string) => void;
  className?: string;
}
class Flat { item: OutlineItem; level: i32; constructor(item: OutlineItem, level: i32) { this.item = item; this.level = level; } }
/** `<Outline items={folders} onSelect={open} />`: a tree with disclosure, a source-list NSOutlineView under the host (it expands and type-selects by
 *  itself; items keep their identity by id); drawn, the rows of the expanded items in zinc:ui's virtual list. */
export function Outline(p: OutlineProps): i32 {
  const l = listNode('outline', p.className ?? '', p.rowHeight ?? 22);
  const open = new Map<string, boolean>();
  for (const id of p.expanded ?? []) open.set(id, true);
  let flat: Flat[] = [], selId = '';
  const walk = (items: OutlineItem[], level: i32, all: boolean, out: Flat[]): void => {
    for (const it of items) {
      out.push(new Flat(it, level));
      const kids = it.children;
      if (kids !== undefined && (all || open.get(it.id) === true)) walk(kids, level + 1, all, out);
    }
  };
  const every: Flat[] = [];
  walk(p.items, 0, true, every);
  let tree = '';
  for (const f of every) tree += (tree === '' ? '' : '\n') + `${f.level}\t${f.item.id}\t${f.item.label}`;
  ui.setNativeAttr(l.outer, 'tree', tree);
  l.outlineRow = (id: string): i32 => { for (let i = 0; i < flat.length; i++) if (flat[i].item.id === id) return i; return -1; };
  const reflat = (): void => {
    flat = [];
    walk(p.items, 0, false, flat);
    let ids = '';
    open.forEach((on: boolean, id: string) => { if (on) ids += (ids === '' ? '' : '\n') + id; });
    ui.setNativeAttr(l.outer, 'expanded', ids);
    const at = l.outlineRow(selId);
    l.sel = at >= 0 ? [at] : [];
    refresh(l, flat.length);
  };
  l.expand = (id: string, on: boolean): void => {
    if ((open.get(id) === true) === on) return;
    open.set(id, on);
    reflat();
    const f = p.onToggle;
    if (f !== undefined) f(id, on);
  };
  l.toggle = (i: i32, on: boolean): void => {
    const f = flat[i], kids = f.item.children;
    if (kids !== undefined && kids.length > 0 && (open.get(f.item.id) === true) !== on) { l.expand(f.item.id, on); return; }
    if (on || f.level === 0) return;
    for (let k = i - 1; k >= 0; k--) if (flat[k].level < f.level) { select(l, [k], true); return; }   // Left on a closed item: its parent
  };
  l.label = (i: i32): string => flat[i].item.label;
  l.render = (i: i32): i32 => {
    const f = flat[i], kids = f.item.children, folder = kids !== undefined && kids.length > 0;
    const r = ui.createNode(ui.VIEW);
    ui.insert(r, el(ui.VIEW, `w-[${6 + f.level * 14}px]`), -1);
    // ponytail: the disclosure is a glyph of the text font; an icon when zinc:icons comes to the kits' fallbacks
    const d = ui.createText(folder ? (open.get(f.item.id) === true ? '▾' : '▸') : ''); ui.setClass(d, 'w-[14px] text-[11px] text-[#666666]'); ui.insert(r, d, -1);
    if (folder) ui.onPointer(d, ui.PDOWN, (_e: ui.PointerEvent) => { l.expand(f.item.id, open.get(f.item.id) !== true); });
    const t = ui.createText(f.item.label); ui.setClass(t, 'text-[13px] whitespace-nowrap truncate'); ui.insert(r, t, -1);
    ui.onPointer(r, ui.PDOWN, (_e: ui.PointerEvent) => { clickRow(l, i, 0, false); ui.focusNode(l.outer); });
    ui.onPointer(r, ui.PDBL, (_e: ui.PointerEvent) => { l.open(i); });
    return r;
  };
  l.picked = (s: List): void => {
    selId = s.sel.length > 0 && s.sel[0] < flat.length ? flat[s.sel[0]].item.id : '';
    ui.setNativeAttr(s.outer, 'selection', selId);
    const f = p.onSelect;
    if (f !== undefined) f(selId);
  };
  l.open = (i: i32): void => { const f = p.onOpen; if (f !== undefined) f(flat[i].item.id); };
  l.body = el(ui.VIEW, 'flex-1');
  ui.insert(l.outer, l.body, -1);
  reflat();
  return l.outer;
}
