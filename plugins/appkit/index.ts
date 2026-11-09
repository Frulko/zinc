// zinc:appkit: the zinc:ui tree shown with real AppKit views (D210, docs/ui.md "Native views"). Importing it is enough: under "ui": {"render": "native"}
// (or ZINC_RENDER=native) on macOS it installs the native host, which zinc:ui hands each changed frame (ui.setHost); elsewhere it does nothing and the
// tree is drawn. Clicks, hover and drags fall through the views to zinc:ui's own hit testing, so they are the drawn UI's events; the views that take
// input themselves (fields, scroll views) report through the functions the web's DOM host uses.
import * as ui from 'zinc:ui';
import { windowCtl } from 'zinc:gfx';
import { createEffect, untrack } from 'zinc:ui/solid';
import { Button as KitButton, Switch as KitSwitch, Slider as KitSlider, Tabs, Progress as KitProgress, nativeControl } from 'zinc:ui/kit';
import A from './native/appkit.spec';

const EDIT = 0, CHANGE = 1, SUBMIT = 2, FOCUS = 3, BLUR = 4, SCROLL = 5, PRESS = 6, RESIZE = 7, SELECT = 8, SORT = 9, TYPE = 10, OPEN = 11, EXPAND = 12, ROWS = 13, LFOCUS = 14;
const CPRESS = 15, CVALUE = 16, CLOSE = 17;   // a control's press and new value, an overlay closed by the person
const VIEW = 18;   // a plugin's native view sent an event (ZN-1075): its name and arguments, for the component's onNativeValue

function onEvent(id: i32, kind: i32, text: string, a: number, b: number): void {
  if (!ui.hostMounted(id)) return;   // the node went, or its handle holds another node now
  const l = kind >= SELECT && kind <= LFOCUS ? lists.get(id) : undefined;
  if (l !== undefined) { listEvent(l, kind, text, a, b); return; }   // a Table's or an Outline's own kinds
  if (kind === EDIT) ui.domEdit(id, text, a, b);
  else if (kind === CHANGE) ui.domChanged(id);
  else if (kind === SUBMIT) ui.submitFrom(id);
  else if (kind === FOCUS) ui.domFocus(id, false);
  else if (kind === BLUR) { if (ui.focused() === id) ui.domFocus(-1, false); }
  else if (kind === SCROLL) ui.domScroll(id, a, b);
  else if (kind === PRESS) ui.click(id);   // a toolbar item: its onPress, as a press of the drawn item
  else if (kind === RESIZE) ui.setNumber(id, 'width', a);   // a split pane the divider moved: its Yoga subtree is laid out again at that width
  else if (kind === CPRESS) ui.click(id);                    // a push button: the node's onClick, as a press of the drawn button
  else if (kind === CVALUE) ui.nativeValue(id, text);        // a switch, slider, pop-up...: the component's onNativeValue
  else if (kind === CLOSE) finish(id, text, a);              // an alert's button (a), a sheet or a popover dismissed
  else if (kind === VIEW) ui.nativeValue(id, text);          // a plugin's view (its spec's onX): the component decodes name and arguments
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
 *  '3,4' (an Outline: the item id), 8 types the keys of `text` into it (type-select), 9 expands (x 1) or collapses item `text` of an Outline;
 *  on a control: 10 clicks it (a push button, a switch, a check box), 11 sets its value (a pop-up's item `text`, a segment `text`, a slider's x, a
 *  date `text`; a plugin's view that is an NSControl: `text`, else x); on an alert's, a sheet's or a popover's panel `h`: 12 ends it (an alert's button x, -1: dismissed).
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

// ---------------------------------------------------------------- controls (ZN-1073)
// The kits' Button, Switch, Slider, Tabs and Progress are the controls already: under a native host they set a native kind (nativeControl) and
// become NSButton, NSSwitch, NSSlider, NSSegmentedControl and NSProgressIndicator; drawn they are the kits' own. The others (Checkbox, PopUpButton,
// DatePicker, SearchField) are small zinc:ui nodes here, with the same hook. A press comes back as the node's click, a value through ui.onNativeValue.

export interface PushButtonProps {
  title: string;
  onPress?: () => void;
  keyEquivalent?: string;   // 'Enter' (the default button), 'Escape' (cancel), or a letter pressed with Command
  className?: string;
}
/** `<PushButton title="Save" onPress={save} keyEquivalent="Enter" />`: an NSButton under the host; drawn, the kit's Button. */
export function PushButton(p: PushButtonProps): i32 {
  const h = KitButton({ label: p.title, variant: p.keyEquivalent === 'Enter' ? 'default' : 'outline', onClick: p.onPress, className: p.className });
  if (p.keyEquivalent !== undefined) ui.setNativeAttr(h, 'keyEquivalent', p.keyEquivalent as string);
  return h;
}

export interface SwitchProps { value: () => boolean; onValueChange: (on: boolean) => void; label?: string }
/** `<Switch value={shared} onValueChange={setShared} />`: an NSSwitch under the host (a check box before macOS 10.15); drawn, the kit's Switch. */
export function Switch(p: SwitchProps): i32 { return KitSwitch({ checked: p.value, onChange: p.onValueChange, label: p.label }); }

export interface SliderProps { value: () => number; onValueChange: (v: number) => void; min?: number; max?: number; step?: number; className?: string }
/** `<Slider value={volume} onValueChange={setVolume} max={100} />`: a continuous NSSlider under the host (snapped to `step`); drawn, the kit's Slider. */
export function Slider(p: SliderProps): i32 { return KitSlider({ value: p.value, onChange: p.onValueChange, min: p.min, max: p.max, step: p.step, className: p.className }); }

export interface SegmentedControlProps { items: string[]; selected: () => i32; onSelect: (i: i32) => void; className?: string }
/** `<SegmentedControl items={['Icons', 'List']} selected={view} onSelect={setView} />`: an NSSegmentedControl; drawn, the kit's Tabs. */
export function SegmentedControl(p: SegmentedControlProps): i32 { return Tabs({ items: p.items, selected: p.selected, onSelect: p.onSelect, className: p.className }); }

export interface ProgressProps { value: () => number; className?: string }
/** `<Progress value={done} />`, 0 to 100 (below 0: indeterminate): an NSProgressIndicator bar; drawn, the kit's Progress. */
export function Progress(p: ProgressProps): i32 { return KitProgress({ value: p.value, className: p.className ?? 'w-[160px]' }); }

export interface CheckboxProps { title: string; value: () => boolean; onValueChange: (on: boolean) => void; className?: string }
/** `<Checkbox title="Show hidden files" value={hidden} onValueChange={setHidden} />`: an NSButton check box with its title; drawn, a box and a label. */
export function Checkbox(p: CheckboxProps): i32 {
  const h = el(ui.VIEW, `flex-row items-center gap-[6px] ${p.className ?? ''}`);
  const box = ui.createNode(ui.VIEW), mark = ui.createText('');
  ui.setClass(mark, 'text-[10px] text-[#ffffff]');
  ui.insert(box, mark, -1);
  ui.insert(h, box, -1);
  label(h, p.title, 'text-[13px]');
  createEffect(() => {
    const on = p.value();
    ui.setClass(box, `w-[14px] h-[14px] rounded-[3px] items-center justify-center ${on ? 'bg-[#007aff]' : 'bg-[#ffffff] border border-[#b0b0b0]'}`);
    ui.setText(mark, on ? '✓' : '');
  });
  ui.listen(h, () => { p.onValueChange(!p.value()); });
  return nativeControl(h, 'checkbox', () => ['title', p.title, 'value', p.value() ? '1' : '0'], (v: string) => { p.onValueChange(v === '1'); });
}

export interface PopUpButtonProps { items: string[]; value: () => string; onValueChange: (v: string) => void; className?: string }
/** `<PopUpButton items={['Name', 'Date', 'Size']} value={sort} onValueChange={setSort} />`: an NSPopUpButton that opens its own menu; drawn, a button
 *  with the value that opens a list under it. */
export function PopUpButton(p: PopUpButtonProps): i32 {
  const h = el(ui.BUTTON, `flex-row items-center justify-between gap-[8px] h-[22px] px-[8px] rounded-[5px] bg-[#ffffff] border border-[#c8c8c8] ${p.className ?? ''}`);
  const value = ui.createText(''); ui.setClass(value, 'text-[13px]'); ui.insert(h, value, -1);
  label(h, '▾', 'text-[11px] text-[#666666]');
  createEffect(() => { ui.setText(value, p.value()); });
  const menu = el(ui.VIEW, 'flex-col p-[4px] min-w-[120px] rounded-[6px] bg-[#ffffff] border border-[#c8c8c8]');
  ui.setNumber(menu, 'hidden', 1);
  for (const it of p.items) menuRow(menu, it, p);
  ui.openLayer(menu, { priority: 100 });
  ui.anchor(menu, h, 'bottom-start', 2);
  ui.onDismiss(menu, () => { ui.setNumber(menu, 'hidden', 1); });
  ui.onOutsidePointer(menu, (_e: ui.PointerEvent) => { ui.setNumber(menu, 'hidden', 1); }, h);
  ui.listen(h, () => { const n = ui.inspectNode(menu); ui.setNumber(menu, 'hidden', n !== null && n.hidden ? 0 : 1); });
  return nativeControl(h, 'popup', () => ['items', p.items.join('\n'), 'value', p.value()], (v: string) => { p.onValueChange(v); });
}
function menuRow(menu: i32, it: string, p: PopUpButtonProps): void {
  const r = el(ui.BUTTON, 'flex-row items-center px-[8px] h-[22px] rounded-[4px] hover:bg-[#e8e8e8]');
  label(r, it, 'text-[13px]');
  ui.listen(r, () => { ui.setNumber(menu, 'hidden', 1); p.onValueChange(it); });
  ui.insert(menu, r, -1);
}

export interface DatePickerProps { value: () => string; onValueChange: (date: string) => void; className?: string }
/** `<DatePicker value={due} onValueChange={setDue} />`, the date as 'YYYY-MM-DD': an NSDatePicker (field and stepper) under the host; drawn, a field
 *  that takes a typed date. */
export function DatePicker(p: DatePickerProps): i32 {
  const h = el(ui.INPUT, `w-[110px] h-[22px] px-[6px] rounded-[5px] bg-[#ffffff] border border-[#c8c8c8] text-[13px] ${p.className ?? ''}`);
  createEffect(() => { ui.setValue(h, p.value()); });
  ui.onText(h, true, (v: string) => { if (isDate(v)) p.onValueChange(v); else ui.setValue(h, p.value()); });
  return nativeControl(h, 'datepicker', () => ['value', p.value()], (v: string) => { p.onValueChange(v); });
}
function isDate(v: string): boolean {
  if (v.length !== 10 || v.charAt(4) !== '-' || v.charAt(7) !== '-') return false;
  const m = parseInt(v.substring(5, 7)), d = parseInt(v.substring(8, 10));
  return parseInt(v.substring(0, 4)) > 0 && m >= 1 && m <= 12 && d >= 1 && d <= 31;
}

export interface SearchFieldProps { onChange: (text: string) => void; onSubmit?: (text: string) => void; placeholder?: string; className?: string }
/** `<SearchField onChange={filter} />`: an NSSearchField (its magnifier and clear button) under the host, edited as any field; drawn, a rounded field. */
export function SearchField(p: SearchFieldProps): i32 {
  const h = el(ui.INPUT, `w-[180px] h-[22px] px-[8px] rounded-full bg-[#ffffff] border border-[#c8c8c8] text-[13px] ${p.className ?? ''}`);
  ui.setPlaceholder(h, p.placeholder ?? 'Search');
  ui.onText(h, false, (v: string) => { p.onChange(v); });
  const f = p.onSubmit;
  if (f !== undefined) ui.onSubmit(h, () => { f(ui.getValue(h)); });
  ui.setNativeKind(h, 'search');   // still a field to zinc:ui: its edits come back as any field's
  return h;
}

// ---------------------------------------------------------------- overlays: alert, sheet, popover (ZN-1073)
// Each is a layer of zinc:ui (the drawn fallback: a dialog, a panel under the top, a panel anchored to a node) whose panel has a native kind: under
// the host an NSAlert or a window run as a sheet of the window (beginSheet, never runModal: the frames go on), or an NSPopover. The result comes back
// as a Promise; closing it (a button, close(), Escape, a click outside a popover) takes the layer away.
class Open {
  root: i32; done: (result: string, button: number) => void;
  constructor(root: i32, done: (result: string, button: number) => void) { this.root = root; this.done = done; }
}
const shownOverlays: Map<i32, Open> = new Map<i32, Open>();   // panel -> its layer and its promise
function overlay(kind: string, wrap: string, cls: string, o: ui.LayerOptions, done: (result: string, button: number) => void): i32 {
  const panel = el(ui.VIEW, cls);
  let root = panel;
  if (wrap !== '') { root = el(ui.VIEW, wrap); ui.insert(root, panel, -1); }
  ui.setNativeKind(panel, kind);
  ui.openLayer(root, o);
  ui.onDismiss(root, () => { finish(panel, '', -1); });
  shownOverlays.set(panel, new Open(root, done));
  return panel;
}
function finish(panel: i32, result: string, button: number): void {
  const o = shownOverlays.get(panel);
  if (o === undefined) return;
  shownOverlays.delete(panel);
  ui.closeLayer(o.root);
  ui.destroy(o.root);
  o.done(result, button);
}
/** Test hook: the panels of the alerts, sheets and popovers open now, oldest first (what drive's action 12 ends). */
export function overlays(): i32[] { const out: i32[] = []; shownOverlays.forEach((_o: Open, panel: i32) => { out.push(panel); }); return out; }
function label(parent: i32, s: string, cls: string): void { if (s === '') return; const t = ui.createText(s); ui.setClass(t, cls); ui.insert(parent, t, -1); }

export interface AlertOptions {
  message: string;
  detail?: string;
  style?: string;       // 'informational' (the default) | 'warning' | 'critical'
  buttons?: string[];   // ['OK']; the first is the default (Return), one named 'Cancel' answers Escape
}
/** `const b = await alert({ message: 'Delete 3 files?', buttons: ['Delete', 'Cancel'] })`: the index of the button pressed, -1 when dismissed. An NSAlert
 *  run as a sheet of the window under the host; drawn, a modal dialog. */
export function alert(o: AlertOptions): Promise<number> {
  return new Promise<number>((resolve) => {
    const buttons = o.buttons ?? ['OK'];
    const panel = overlay('alert', 'absolute inset-0 items-center justify-center', 'flex-col gap-[8px] p-[20px] w-[280px] rounded-[10px] bg-[#f0f0f0] border border-[#c8c8c8]',
      { priority: 300, modal: true, backdrop: 0x000000, backdropAlpha: 60 }, (_r: string, b: number) => { resolve(b); });
    ui.setNativeAttr(panel, 'message', o.message);
    ui.setNativeAttr(panel, 'detail', o.detail ?? '');
    ui.setNativeAttr(panel, 'style', o.style ?? 'informational');
    ui.setNativeAttr(panel, 'buttons', buttons.join('\n'));
    label(panel, o.message, 'text-[13px] font-bold');
    label(panel, o.detail ?? '', 'text-[11px]');
    const row = el(ui.VIEW, 'flex-row justify-end gap-[8px] mt-[8px]');
    for (let i = 0; i < buttons.length; i++) alertButton(row, panel, buttons[i], i);
    ui.insert(panel, row, -1);
  });
}
function alertButton(row: i32, panel: i32, title: string, i: i32): void {
  const b = el(ui.BUTTON, `px-[12px] h-[22px] rounded-[5px] items-center justify-center ${i === 0 ? 'bg-[#007aff]' : 'bg-[#ffffff] border border-[#c8c8c8]'}`);
  label(b, title, `text-[13px] ${i === 0 ? 'text-[#ffffff]' : ''}`);
  ui.listen(b, () => { finish(panel, '', i); });
  ui.insert(row, b, -1);
}

/** `const name = await sheet((close) => <NameForm onDone={close} />)`: content shown as a sheet of the window (a window that slides from the title bar
 *  under the host, beginSheet; drawn, a panel at the top over a dim). It resolves with what the content passes to `close`, '' when dismissed (Escape).
 *  Inside a native sheet the controls and fields take input; presses on drawn-only views there do not reach zinc:ui yet. */
export function sheet(content: (close: (result: string) => void) => i32, className: string = ''): Promise<string> {
  return new Promise<string>((resolve) => {
    let panel: i32 = -1;
    panel = overlay('sheet', 'absolute inset-0 items-center', `flex-col gap-[12px] p-[20px] w-[420px] rounded-b-[10px] bg-[#f6f6f6] border border-[#c8c8c8] ${className}`,
      { priority: 250, modal: true, backdrop: 0x000000, backdropAlpha: 40 }, (r: string, _b: number) => { resolve(r); });
    ui.insert(panel, content((r: string) => { finish(panel, r, 0); }), -1);
  });
}

export interface PopoverOptions {
  edge?: string;        // the side of the anchor it shows on: 'bottom' (the default), 'top', 'left', 'right'
  className?: string;   // classes of the panel ('w-[240px]', 'p-[12px]'...)
}
/** `const v = await popover(button, (close) => <Picker onPick={close} />)`: content in an NSPopover pointing at node `anchor` (transient: a click
 *  outside closes it) under the host; drawn, a panel anchored to it. Resolves with what the content passes to `close`, '' when dismissed. */
export function popover(anchor: i32, content: (close: (result: string) => void) => i32, o?: PopoverOptions): Promise<string> {
  return new Promise<string>((resolve) => {
    const edge = o?.edge ?? 'bottom';
    let panel: i32 = -1;
    panel = overlay('popover', '', `flex-col gap-[8px] p-[12px] rounded-[8px] bg-[#ffffff] border border-[#c8c8c8] ${o?.className ?? ''}`, { priority: 150 }, (r: string, _b: number) => { resolve(r); });
    ui.setNativeAttr(panel, 'anchor', '' + anchor);
    ui.setNativeAttr(panel, 'edge', edge);
    ui.anchor(panel, anchor, edge, 6);
    ui.onOutsidePointer(panel, (_e: ui.PointerEvent) => { finish(panel, '', -1); }, anchor);
    ui.insert(panel, content((r: string) => { finish(panel, r, 0); }), -1);
  });
}
