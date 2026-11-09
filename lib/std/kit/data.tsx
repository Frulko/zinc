/** @jsxHelpers zinc:ui/kit/host */
// Quiet data controls share stable row identities, visible-order selection and the host virtualizer.
import * as ui from 'zinc:ui';
import * as solid from 'zinc:ui/solid';
import * as fs from 'zinc:fs';
import * as path from 'zinc:path';
import { utf8Encode } from 'zinc:sys';
import { toHex } from 'zinc:hash';
import { theme } from './theme';
import { componentRef, componentSignal, componentMemo, componentEffect, renderSlot, _virtual as virtualRows, onCleanup } from './host';
import { Button as KitButton } from './button';
import { Input as KitInput, SearchField, Select, SelectOption } from './input';
import { ResizeHandle } from './separator';
import { Breadcrumb } from './navigation';
import { Dialog, DropdownMenu, MenuItem } from './overlays';
import { Checkbox, Chip } from './selection';

function textClass(): string { return `text-[13px] text-${theme().foreground}`; }
function ringClass(): string { return `focus-visible:ring-2 focus-visible:ring-${theme().accent} focus-visible:ring-offset-2`; }
function cellKey(row: string, column: string): string { return toHex(utf8Encode(row)) + ':' + toHex(utf8Encode(column)); }
function cellText(row: DataRow, column: i32): string { return column >= 0 && column < row.cells.length ? row.cells[column] : ''; }

export interface DataColumn {
  id: string; label: string; width?: number; minWidth?: number; align?: string;
  sortable?: boolean; fixed?: boolean; hidden?: boolean;
  cell?: (row: DataRow) => i32;
}
export interface DataRow { id: string; cells: string[]; disabled?: boolean; depth?: i32; expandable?: boolean; expanded?: boolean; unloaded?: boolean; parentId?: string; posInSet?: i32; setSize?: i32 }
export interface DataSort { column: string; descending: boolean }
export interface DataCursor { row: string; column: string }

/** Filter and stable sort once per input change, never per visible cell or scroll event. */
export function dataRows(rows: DataRow[], columns: DataColumn[], search: string = '', sort: DataSort = { column: '', descending: false }, filter?: (row: DataRow) => boolean): DataRow[] {
  const needle = search.toLowerCase();
  const result = rows.filter((row: DataRow) => (needle === '' || row.cells.join(' ').toLowerCase().includes(needle)) && (filter === undefined || filter(row)));
  const col = columns.findIndex((c: DataColumn) => c.id === sort.column);
  if (col >= 0) result.sort((a: DataRow, b: DataRow) => {
    const av = cellText(a, col), bv = cellText(b, col);
    const an = Number(av), bn = Number(bv);
    const order = av.trim() !== '' && bv.trim() !== '' && Number.isFinite(an) && Number.isFinite(bn) ? an - bn : av < bv ? -1 : av > bv ? 1 : 0;
    return sort.descending ? -order : order;
  });
  return result;
}

/** Shift selects an inclusive visible range; primary toggles a row without moving the range anchor. */
export function selectDataRows(rows: DataRow[], selected: string[], id: string, anchor: string, extend: boolean, toggle: boolean): string[] {
  const at = rows.findIndex((r: DataRow) => r.id === id);
  if (at < 0 || rows[at].disabled === true) return selected.slice();
  if (extend) {
    const from = rows.findIndex((r: DataRow) => r.id === anchor);
    return rows.slice(Math.min(from < 0 ? at : from, at), Math.max(from < 0 ? at : from, at) + 1).filter((r: DataRow) => r.disabled !== true).map((r: DataRow) => r.id);
  }
  if (toggle) return selected.indexOf(id) >= 0 ? selected.filter((s: string) => s !== id) : selected.concat([id]);
  return [id];
}

export interface TableProps {
  label: string; columns: DataColumn[]; rows: () => DataRow[];
  sort?: () => DataSort; onSort?: (sort: DataSort) => void;
  search?: () => string; filter?: (row: DataRow) => boolean;
  compact?: boolean; striped?: boolean; fixedHeader?: boolean; height?: number;
  widths?: () => number[];
  emptyLabel?: string; className?: string;
}
export interface DataGridProps extends TableProps {
  selected: () => string[]; onSelect: (ids: string[]) => void;
  rowHeight?: number; onColumnResize?: (id: string, width: number) => void;
  onActivate?: (row: DataRow) => void; onEdit?: (row: string, column: string, value: string) => void;
  tree?: boolean; onToggle?: (id: string) => void;
  outline?: boolean;
}

function columnWidth(column: DataColumn, index: i32, p: TableProps): number {
  const widths = p.widths !== undefined ? p.widths() : [];
  return Math.max(column.minWidth ?? 64, index < widths.length ? widths[index] : column.width ?? 160);
}
function tableWidth(p: TableProps): number {
  let width = 0;
  for (let i = 0; i < p.columns.length; i++) if (p.columns[i].hidden !== true) width += columnWidth(p.columns[i], i, p);
  return width;
}
function alignClass(column: DataColumn): string { return column.align === 'right' ? 'justify-end text-right' : column.align === 'center' ? 'justify-center text-center' : 'justify-start'; }
function CellContent(p: { row: DataRow; column: DataColumn; index: i32 }): i32 {
  const cell = p.column.cell;
  return cell !== undefined ? cell(p.row) : <Text className={textClass()}>{cellText(p.row, p.index)}</Text>;
}
function sortColumn(p: TableProps, column: DataColumn): void {
  if (p.onSort === undefined || column.sortable !== true) return;
  const previous = p.sort !== undefined ? p.sort() : { column: '', descending: false };
  p.onSort({ column: column.id, descending: previous.column === column.id && !previous.descending });
}
function header(p: TableProps, resize?: (id: string, width: number) => void, inGrid: boolean = false): i32 {
  return <View role="row" aria-rowindex="1" className={`flex-row shrink-0 h-9 bg-${theme().muted} border-b border-${theme().border}`}>
    {p.columns.map((column: DataColumn, index: i32) => <Show when={column.hidden !== true}><View role="columnheader" aria-colindex={String(index + 1)} aria-sort={p.sort !== undefined && p.sort().column === column.id ? p.sort().descending ? 'descending' : 'ascending' : 'none'} className={`flex-row shrink-0 items-center w-[${columnWidth(column, index, p)}px]`}>
      <Button tabIndex={inGrid ? -1 : 0} disabled={column.sortable !== true || p.onSort === undefined} aria-label={'Sort ' + column.label} onClick={() => sortColumn(p, column)} className={`flex-row items-center grow h-9 px-3 ${ringClass()} ${alignClass(column)}`}>
        <Text className={`text-[12px] font-medium text-${theme().mutedForeground}`}>{column.label + (p.sort !== undefined && p.sort().column === column.id ? p.sort().descending ? ' ↓' : ' ↑' : '')}</Text>
      </Button>
      <Show when={column.fixed !== true && resize !== undefined}><ResizeHandle tabIndex={inGrid ? -1 : 0} vertical={true} min={column.minWidth ?? 64} max={1200} size={() => columnWidth(column, index, p)} onResize={(width: number) => { if (resize !== undefined) resize(column.id, width); }} /></Show>
    </View></Show>)}
  </View>;
}

export function Table(p: TableProps): i32 {
  const rows = componentMemo(() => dataRows(p.rows(), p.columns, p.search !== undefined ? p.search() : '', p.sort !== undefined ? p.sort() : { column: '', descending: false }, p.filter), [] as DataRow[]);
  return <ScrollView className={`flex-col border border-${theme().border} rounded-[14px] bg-${theme().card} ${p.className ?? ''}`}>
    <View role="table" aria-label={p.label} aria-rowcount={String(rows().length + 1)} aria-colcount={String(p.columns.length)} className={`flex-col w-[${tableWidth(p)}px] min-w-full`}>
      <Show when={p.fixedHeader !== false}>{header(p)}</Show>
      <ScrollView className={p.height !== undefined ? `h-[${p.height}px]` : ''}>
        <Show when={p.fixedHeader === false}>{header(p)}</Show>
        {rows().map((row: DataRow, index: i32) => <View role="row" aria-rowindex={String(index + 2)} className={`flex-row shrink-0 ${p.compact === true ? 'h-[30px]' : 'h-[40px]'} border-b border-${theme().border} ${p.striped === true && index % 2 === 1 ? 'bg-' + theme().muted : ''}`}>
          {p.columns.map((column: DataColumn, col: i32) => <Show when={column.hidden !== true}><View role="cell" aria-colindex={String(col + 1)} className={`flex-row items-center shrink-0 px-3 w-[${columnWidth(column, col, p)}px] ${alignClass(column)}`}>
            <CellContent key={cellKey(row.id, column.id)} row={row} column={column} index={col} />
          </View></Show>)}
        </View>)}
        <Show when={rows().length === 0}><Text role="status" className={`p-4 text-[13px] text-${theme().mutedForeground}`}>{p.emptyLabel ?? 'No results'}</Text></Show>
      </ScrollView>
    </View>
  </ScrollView>;
}

enum EditPhase { Idle, Editing }
class GridEdit { phase: EditPhase = EditPhase.Idle; row: string = ''; column: string = ''; value: string = ''; }
function editTransition(edit: GridEdit, phase: EditPhase, row: string = '', column: string = '', value: string = ''): GridEdit {
  if (edit.phase === phase) return edit;
  const next = new GridEdit(); next.phase = phase; next.row = row; next.column = column; next.value = value;
  return next;
}

export function DataGrid(p: DataGridProps): i32 {
  const root = solid.createNodeRef(), viewport = solid.createNodeRef(), horizontal = solid.createNodeRef();
  const [cursor, setCursor] = componentSignal<DataCursor>({ row: '', column: '' });
  const [edit, setEdit] = componentSignal(new GridEdit());
  const anchor = componentRef('');
  const visible = componentMemo(() => dataRows(p.rows(), p.columns, p.search !== undefined ? p.search() : '', p.sort !== undefined ? p.sort() : { column: '', descending: false }, p.filter), [] as DataRow[]);
  const columns = (): DataColumn[] => p.columns.filter((c: DataColumn) => c.hidden !== true);
  const current = (): DataCursor => {
    const list = visible(), cols = columns(), value = cursor();
    return { row: list.some((r: DataRow) => r.id === value.row) ? value.row : list.length > 0 ? list[0].id : '', column: cols.some((c: DataColumn) => c.id === value.column) ? value.column : cols.length > 0 ? cols[0].id : '' };
  };
  const choose = (row: DataRow, column: DataColumn, shift: boolean, toggle: boolean, select: boolean): void => {
    if (row.disabled === true) return;
    setCursor({ row: row.id, column: column.id });
    if (select) {
      p.onSelect(selectDataRows(visible(), p.selected(), row.id, anchor.current, shift, toggle));
      if (!shift && !toggle) anchor.current = row.id;
    }
    const at = visible().findIndex((r: DataRow) => r.id === row.id);
    ui.scrollToRow(viewport.node, at);
    let left = 0;
    for (let i = 0; i < p.columns.length; i++) {
      const c = p.columns[i];
      if (c.hidden === true) continue;
      const width = columnWidth(c, i, p);
      if (c.id === column.id) {
        const scroll = ui.scrollLeft(horizontal.node), viewportWidth = ui.screenBox(horizontal.node)[2];
        const next = left < scroll ? left : left + width > scroll + viewportWidth ? left + width - viewportWidth : scroll;
        ui.scrollTo(horizontal.node, next, ui.scrollTop(horizontal.node));
        break;
      }
      left += width;
    }
    ui.focusNode(root.node);
  };
  const finish = (commit: boolean): void => {
    const value = edit();
    if (value.phase !== EditPhase.Editing) return;
    setEdit(editTransition(value, EditPhase.Idle));
    if (commit && p.onEdit !== undefined) p.onEdit(value.row, value.column, value.value);
    ui.focusNode(root.node);
  };
  const begin = (target?: DataCursor): void => {
    if (p.onEdit === undefined) return;
    const value = target ?? current(), row = visible().find((r: DataRow) => r.id === value.row), col = p.columns.findIndex((c: DataColumn) => c.id === value.column);
    if (row === undefined || row.disabled === true || col < 0) return;
    setEdit(editTransition(edit(), EditPhase.Editing, row.id, value.column, cellText(row, col)));
  };
  const keys = (e: ui.KeyEvent): void => {
    if (edit().phase === EditPhase.Editing) { if (e.key === 'Escape') { finish(false); e.preventDefault(); } else if (e.key === 'Enter') { finish(true); e.preventDefault(); } return; }
    const list = visible(), cols = columns(), value = current();
    if (e.primary && e.key === 'a') { p.onSelect(list.filter((r: DataRow) => r.disabled !== true).map((r: DataRow) => r.id)); e.preventDefault(); return; }
    if (list.length === 0 || cols.length === 0) return;
    let row = list.findIndex((r: DataRow) => r.id === value.row), col = cols.findIndex((c: DataColumn) => c.id === value.column);
    if (e.alt && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && p.onColumnResize !== undefined && cols[col].fixed !== true) {
      const column = cols[col], index = p.columns.findIndex((c: DataColumn) => c.id === column.id);
      p.onColumnResize(column.id, Math.max(column.minWidth ?? 64, Math.min(1200, columnWidth(column, index, p) + (e.key === 'ArrowLeft' ? -10 : 10))));
      e.preventDefault(); return;
    }
    if (e.alt && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && p.onSort !== undefined && cols[col].sortable === true) {
      p.onSort({ column: cols[col].id, descending: e.key === 'ArrowDown' }); e.preventDefault(); return;
    }
    if (e.key === 'Enter' || e.key === 'F2') { if (p.onEdit !== undefined) begin(); else if (p.onActivate !== undefined) p.onActivate(list[row]); e.preventDefault(); return; }
    if (e.key === ' ') { choose(list[row], cols[col], e.shift, e.primary, true); e.preventDefault(); return; }
    if (p.tree === true && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      const selected = list[row];
      if (selected.expandable === true && selected.expanded !== (e.key === 'ArrowRight')) { if (p.onToggle !== undefined) p.onToggle(selected.id); e.preventDefault(); return; }
      if (e.key === 'ArrowLeft' && selected.parentId !== undefined) { const parent = list.findIndex((r: DataRow) => r.id === selected.parentId); if (parent >= 0) row = parent; }
      else if (e.key === 'ArrowRight' && selected.expanded === true && row + 1 < list.length) row++;
    } else if (e.key === 'ArrowDown') row++;
    else if (e.key === 'ArrowUp') row--;
    else if (e.key === 'ArrowRight') col++;
    else if (e.key === 'ArrowLeft') col--;
    else if (e.key === 'PageDown') row += Math.max(1, Math.floor((p.height ?? 320) / (p.rowHeight ?? 36)));
    else if (e.key === 'PageUp') row -= Math.max(1, Math.floor((p.height ?? 320) / (p.rowHeight ?? 36)));
    else if (e.key === 'Home') { col = 0; if (e.primary) row = 0; }
    else if (e.key === 'End') { col = cols.length - 1; if (e.primary) row = list.length - 1; }
    else return;
    row = Math.max(0, Math.min(list.length - 1, row)); col = Math.max(0, Math.min(cols.length - 1, col));
    const direction = e.key === 'ArrowUp' || e.key === 'PageUp' ? -1 : 1;
    while (list[row].disabled === true && row + direction >= 0 && row + direction < list.length) row += direction;
    choose(list[row], cols[col], e.shift, false, e.shift); e.preventDefault();
  };
  const cellId = (row: string, column: string): string => 'kit-grid-' + String(ui.nodeSerial(root.node)) + '-' + cellKey(row, column);
  const node = <View ref={root} role={p.outline === true ? 'tree' : p.tree === true ? 'treegrid' : 'grid'} aria-label={p.label} tabIndex={0} aria-multiselectable="true" aria-rowcount={String(visible().length + 1)} aria-colcount={String(p.columns.length)} aria-activedescendant={current().row !== '' && current().column !== '' ? cellId(current().row, current().column) : ''} onKeyDown={keys} className={`flex-col min-w-0 border border-${theme().border} rounded-[14px] bg-${theme().card} ${ringClass()} ${p.className ?? ''}`}>
    <ScrollView ref={horizontal} className="flex-col">
      <View className={`flex-col w-[${tableWidth(p)}px] min-w-full`}>
        <Show when={p.outline !== true}>{header(p, p.onColumnResize, true)}</Show>
        <ScrollView ref={viewport} className={`h-[${p.height ?? 320}px]`} />
      </View>
    </ScrollView>
    <Show when={visible().length === 0}><Text role="status" className={`p-3 text-[13px] text-${theme().mutedForeground}`}>{p.emptyLabel ?? 'No results'}</Text></Show>
  </View>;
  virtualRows(viewport.node, () => visible().length, p.rowHeight ?? 36, (index: i32) => {
    const row = visible()[index];
    return <View role={p.outline === true ? 'treeitem' : 'row'} aria-label={p.outline === true ? cellText(row, 0) : ''} id={p.outline === true ? cellId(row.id, p.columns[0].id) : ''} aria-rowindex={String(index + 2)} aria-level={String((row.depth ?? 0) + 1)} aria-expanded={row.expandable === true ? String(row.expanded === true) : ''} aria-posinset={String(row.posInSet ?? index + 1)} aria-setsize={String(row.setSize ?? visible().length)} aria-selected={String(p.selected().indexOf(row.id) >= 0)} aria-disabled={String(row.disabled === true)} className={`flex-row h-[${p.rowHeight ?? 36}px] border-b border-${theme().border} ${p.selected().indexOf(row.id) >= 0 ? 'bg-' + theme().accentSoft : p.striped === true && index % 2 === 1 ? 'bg-' + theme().muted : ''} ${row.disabled === true ? 'opacity-45' : ''}`}>
      {p.columns.map((column: DataColumn, col: i32) => <Show when={column.hidden !== true}><View role={p.outline === true ? '' : 'gridcell'} id={p.outline === true ? '' : cellId(row.id, column.id)} aria-colindex={String(col + 1)} onPointerDown={(e: ui.PointerEvent) => { if (e.button !== 0) return; choose(row, column, e.shift, e.ctrl || e.meta, true); if (e.clicks === 2) begin({ row: row.id, column: column.id }); }} className={`flex-row items-center shrink-0 px-3 w-[${columnWidth(column, col, p)}px] ${alignClass(column)} ${current().row === row.id && current().column === column.id ? 'border border-' + theme().accent : ''}`}>
        <Show when={p.tree === true && col === 0}><View className={`w-[${(row.depth ?? 0) * 16}px] shrink-0`} /><Show when={row.expandable === true} fallback={<View className="w-6 shrink-0" />}><Button tabIndex={-1} aria-label={(row.expanded === true ? 'Collapse ' : 'Expand ') + cellText(row, 0)} onClick={() => { if (p.onToggle !== undefined) p.onToggle(row.id); }} className="w-6 h-6 shrink-0 items-center justify-center"><Text className={textClass()}>{row.expanded === true ? '⌄' : '›'}</Text></Button></Show></Show>
        <Show when={edit().phase === EditPhase.Editing && edit().row === row.id && edit().column === column.id} fallback={<CellContent key={cellKey(row.id, column.id)} row={row} column={column} index={col} />}>
          <GridEditor value={() => edit().value} onInput={(value: string) => setEdit(editTransition(new GridEdit(), EditPhase.Editing, row.id, column.id, value))} onCommit={() => finish(true)} onCancel={() => finish(false)} />
        </Show>
      </View></Show>)}
    </View>;
  });
  return node;
}

function GridEditor(p: { value: () => string; onInput: (value: string) => void; onCommit: () => void; onCancel: () => void }): i32 {
  const ref = solid.createNodeRef();
  const node = <Input ref={ref} aria-label="Edit cell" value={p.value()} onInput={p.onInput} onKeyDown={(e: ui.KeyEvent) => { if (e.key === 'Enter') { p.onCommit(); e.preventDefault(); } else if (e.key === 'Escape') { p.onCancel(); e.preventDefault(); } }} className={`grow min-w-0 h-[30px] px-1 border border-${theme().accent} ${textClass()}`} />;
  ui.focusNode(ref.node);
  onCleanup(ui.onFocusWithin(ref.node, (within: boolean) => { if (!within) p.onCommit(); }));
  return node;
}

export interface TreeItem { id: string; label: string; cells?: string[]; children?: TreeItem[]; hasChildren?: boolean; disabled?: boolean }
/** Iterative and cycle-safe: a repeated id is refused instead of hanging on a malformed provider. */
export function flattenTree(items: TreeItem[], expanded: string[], loaded?: Map<string, TreeItem[]>): DataRow[] {
  const result: DataRow[] = [], seen = new Set<string>();
  const stack: TreeItem[] = [], depths: i32[] = [], parents: string[] = [], positions: i32[] = [], sizes: i32[] = [];
  for (let i = items.length - 1; i >= 0; i--) { stack.push(items[i]); depths.push(0); parents.push(''); positions.push(i + 1); sizes.push(items.length); }
  while (stack.length > 0) {
    const item = stack.pop() as TreeItem, depth = depths.pop() as i32, parent = parents.pop() as string, pos = positions.pop() as i32, size = sizes.pop() as i32;
    if (seen.has(item.id)) throw new Error('Duplicate or cyclic tree id: ' + item.id);
    seen.add(item.id);
    const cached = loaded !== undefined ? loaded.get(item.id) : undefined;
    const children = item.children ?? cached ?? [], open = expanded.indexOf(item.id) >= 0;
    result.push({ id: item.id, cells: [item.label].concat(item.cells ?? []), disabled: item.disabled, depth, expandable: children.length > 0 || item.hasChildren === true, expanded: open, unloaded: item.hasChildren === true && item.children === undefined && cached === undefined, parentId: parent, posInSet: pos, setSize: size });
    if (open) for (let i = children.length - 1; i >= 0; i--) { stack.push(children[i]); depths.push(depth + 1); parents.push(item.id); positions.push(i + 1); sizes.push(children.length); }
  }
  return result;
}
export interface TreeProps { label: string; items: () => TreeItem[]; expanded: () => string[]; onExpandedChange: (ids: string[]) => void; selected: () => string[]; onSelect: (ids: string[]) => void; onActivate?: (row: DataRow) => void; height?: number; className?: string; onLoadChildren?: (id: string) => Promise<TreeItem[]> }
export interface TreeTableProps extends TreeProps { columns: DataColumn[]; widths?: () => number[]; onColumnResize?: (id: string, width: number) => void; outline?: boolean }
enum BranchPhase { Idle, Loading, Ready, Failed, Closed }
class TreeBranch { phase: BranchPhase = BranchPhase.Idle; generation: i32 = 0; children: TreeItem[] = []; error: string = ''; }
function branchTransition(branch: TreeBranch, next: BranchPhase): void {
  const from = branch.phase;
  const allowed = next === BranchPhase.Closed || next === BranchPhase.Loading && (from === BranchPhase.Idle || from === BranchPhase.Failed) || from === BranchPhase.Loading && (next === BranchPhase.Ready || next === BranchPhase.Failed);
  if (!allowed) throw new Error('Illegal tree branch transition');
  branch.phase = next;
}
export function TreeTable(p: TreeTableProps): i32 {
  const branches = componentRef(new Map<string, TreeBranch>());
  const [revision, setRevision] = componentSignal(0);
  const publish = (): void => { setRevision(revision() + 1); };
  componentEffect(() => () => { for (const branch of branches.current.values()) { branch.generation++; branchTransition(branch, BranchPhase.Closed); } }, []);
  const rows = componentMemo(() => {
    revision();
    const loaded = new Map<string, TreeItem[]>();
    for (const entry of branches.current) if (entry[1].phase === BranchPhase.Ready) loaded.set(entry[0], entry[1].children);
    return flattenTree(p.items(), p.expanded(), loaded);
  }, [] as DataRow[]);
  const load = async (id: string): Promise<void> => {
    const loader = p.onLoadChildren;
    if (loader === undefined) return;
    let branch = branches.current.get(id);
    if (branch === undefined) { branch = new TreeBranch(); branches.current.set(id, branch); }
    if (branch.phase !== BranchPhase.Idle && branch.phase !== BranchPhase.Failed) return;
    const request = branch, generation = ++request.generation;
    branchTransition(request, BranchPhase.Loading); request.error = ''; publish();
    try {
      const children = await loader(id);
      if (request.generation !== generation || request.phase !== BranchPhase.Loading) return;
      request.children = children; branchTransition(request, BranchPhase.Ready);
    } catch (error) {
      if (request.generation !== generation || request.phase !== BranchPhase.Loading) return;
      request.error = error.message; branchTransition(request, BranchPhase.Failed);
    }
    publish();
  };
  const loading = (): string[] => { revision(); const ids: string[] = []; for (const entry of branches.current) if (entry[1].phase === BranchPhase.Loading) ids.push(entry[0]); return ids; };
  const failures = (): string[] => { revision(); const ids: string[] = []; for (const entry of branches.current) if (entry[1].phase === BranchPhase.Failed) ids.push(entry[0]); return ids; };
  return <View className={`flex-col gap-2 min-w-0 ${p.className ?? ''}`}>
    <DataGrid label={p.label} columns={p.columns} rows={rows} selected={p.selected} onSelect={p.onSelect} height={p.height} widths={p.widths} onColumnResize={p.onColumnResize} tree={true} outline={p.outline} onActivate={p.onActivate} onToggle={(id: string) => {
      const open = p.expanded().indexOf(id) >= 0, row = rows().find((r: DataRow) => r.id === id);
      p.onExpandedChange(open ? p.expanded().filter((value: string) => value !== id) : p.expanded().concat([id]));
      if (!open && row !== undefined && row.unloaded === true) load(id);
    }} />
    <Show when={loading().length > 0}><Text role="status" className={`text-[12px] text-${theme().mutedForeground}`}>Loading children…</Text></Show>
    {failures().map((id: string) => <View className="flex-row items-center gap-2"><Text role="alert" className={`text-[12px] text-${theme().destructive}`}>{(branches.current.get(id) as TreeBranch).error}</Text><KitButton label={'Retry ' + id} size="sm" onClick={() => load(id)} /></View>)}
  </View>;
}
export function Tree(p: TreeProps): i32 { return <TreeTable label={p.label} items={p.items} expanded={p.expanded} onExpandedChange={p.onExpandedChange} selected={p.selected} onSelect={p.onSelect} onActivate={p.onActivate} height={p.height} className={p.className} onLoadChildren={p.onLoadChildren} outline={true} columns={[{ id: 'name', label: p.label, width: 320, fixed: true }]} />; }

export interface PathSegment { label: string; path: string; children?: { label: string; path: string }[] }
export interface PathBarProps { path: () => string; segments: () => PathSegment[]; onNavigate: (path: string) => void; editable?: boolean; label?: string; className?: string }
export function PathBar(p: PathBarProps): i32 {
  const root = solid.createNodeRef();
  const [editing, setEditing] = componentSignal(false), [draft, setDraft] = componentSignal('');
  const close = (): void => { ui.focusNode(root.node); setEditing(false); };
  const submit = (): void => { const value = draft().trim(); if (value !== '') { p.onNavigate(value); close(); } };
  return <View ref={root} tabIndex={-1} role="group" aria-label={p.label ?? 'Location'} onKeyDown={(e: ui.KeyEvent) => { if (editing() && e.key === 'Escape') { close(); e.preventDefault(); } else if (p.editable !== false && e.primary && e.key === 'l') { setDraft(p.path()); setEditing(true); e.preventDefault(); } }} className={`flex-row gap-1 items-center min-w-0 ${ringClass()} ${p.className ?? ''}`}>
    <Show when={editing()} fallback={<View className="flex-row items-center grow min-w-0"><Breadcrumb label={p.label ?? 'Location'} items={p.segments().map((s: PathSegment) => ({ label: s.label, onSelect: () => p.onNavigate(s.path) }))} /><Show when={p.segments().some((s: PathSegment) => (s.children ?? []).length > 0)}><DropdownMenu label="Locations" variant="ghost" items={p.segments().flatMap((s: PathSegment) => (s.children ?? []).map((c: { label: string; path: string }) => ({ label: s.label + ' / ' + c.label, onSelect: () => p.onNavigate(c.path) })))} /></Show><Show when={p.editable !== false}><KitButton label="Edit path" size="sm" variant="ghost" onClick={() => { setDraft(p.path()); setEditing(true); }} /></Show></View>}>
      <KitInput label={p.label ?? 'Location'} value={draft} onInput={setDraft} autofocus={true} onSubmit={submit} className="grow min-w-0" />
      <KitButton label="Go" size="sm" onClick={submit} /><KitButton label="Cancel" size="sm" variant="ghost" onClick={close} />
    </Show>
  </View>;
}

export interface AccordionItem { id: string; title: string; description?: string; disabled?: boolean; content: () => i32 }
export interface AccordionProps { items: AccordionItem[]; expanded: () => string[]; onChange: (ids: string[]) => void; multiple?: boolean; className?: string }
function disclosureButtons(root: i32, buttons: i32[]): void {
  const node = ui.inspectNode(root);
  if (node === null || node.hidden || ui.isDisabled(root)) return;
  const controls = node.attrK.indexOf('aria-controls');
  if (node.tag === ui.BUTTON && controls >= 0 && node.attrV[controls].startsWith('kit-region-')) { buttons.push(root); return; }
  for (const child of node.children) disclosureButtons(child, buttons);
}
export function Accordion(p: AccordionProps): i32 {
  const root = solid.createNodeRef();
  const keys = (e: ui.KeyEvent): void => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return;
    const buttons: i32[] = []; disclosureButtons(root.node, buttons);
    let at = buttons.indexOf(ui.focused()); if (at < 0) return;
    at = e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1 : (at + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
    ui.focusNode(buttons[at]); e.preventDefault();
  };
  return <View ref={root} tabIndex={-1} onKeyDown={keys} className={`flex-col border border-${theme().border} rounded-[14px] ${p.className ?? ''}`}>
    {p.items.map((item: AccordionItem) => <View className={`flex-col border-b border-${theme().border}`}>
      <View role="heading" aria-level="3">
      <Button role="button" id={'kit-disclosure-' + String(ui.nodeSerial(root.node)) + '-' + item.id} aria-controls={'kit-region-' + String(ui.nodeSerial(root.node)) + '-' + item.id} aria-label={item.title} aria-expanded={String(p.expanded().indexOf(item.id) >= 0)} disabled={item.disabled === true} onClick={() => { const open = p.expanded().indexOf(item.id) >= 0; if (!ui.prefersReducedMotion()) ui.LayoutAnimation.configureNext(ui.LayoutAnimation.create(320, 'spring', 'opacity')); p.onChange(open ? p.expanded().filter((id: string) => id !== item.id) : p.multiple === true ? p.expanded().concat([item.id]) : [item.id]); }} className={`flex-row items-center justify-between gap-3 h-11 px-4 ${ringClass()} ${item.disabled === true ? 'opacity-45' : ''}`}>
        <Text className={`text-[13px] font-medium text-${theme().foreground}`}>{item.title}</Text><Text className={textClass()}>{p.expanded().indexOf(item.id) >= 0 ? '−' : '+'}</Text>
      </Button>
      </View>
      <Show when={p.expanded().indexOf(item.id) >= 0}><View role="region" id={'kit-region-' + String(ui.nodeSerial(root.node)) + '-' + item.id} aria-labelledby={'kit-disclosure-' + String(ui.nodeSerial(root.node)) + '-' + item.id} className="flex-col gap-2 p-4 pt-0"><Show when={item.description !== undefined}><Text className={`text-[12px] text-${theme().mutedForeground}`}>{item.description ?? ''}</Text></Show>{renderSlot(item.content)}</View></Show>
    </View>)}
  </View>;
}

export interface DataFilter { id: string; label: string; value: string; options: SelectOption[] }
export interface FilterBarProps { search: () => string; onSearch: (value: string) => void; filters: () => DataFilter[]; onChange: (id: string, value: string) => void; onRemove: (id: string) => void; onClear: () => void; available?: MenuItem[]; resultCount?: () => i32; className?: string }
export function FilterBar(p: FilterBarProps): i32 {
  return <View role="search" aria-label="Filter results" className={`flex-row flex-wrap items-end gap-2 ${p.className ?? ''}`}>
    <SearchField label="Search" placeholder="Search rows" value={p.search} onInput={p.onSearch} clearable={true} className="w-56" />
    {p.filters().map((filter: DataFilter) => <View className="flex-row items-end gap-1"><Select label={filter.label} items={filter.options} value={() => filter.value} onChange={(value: string) => p.onChange(filter.id, value)} className="w-40" /><Chip label={filter.label} selected={() => true} onChange={(selected: boolean) => {}} onRemove={() => p.onRemove(filter.id)} /></View>)}
    <Show when={(p.available ?? []).length > 0}><DropdownMenu label="Add filter" variant="outline" items={p.available ?? []} /></Show>
    <KitButton label="Clear filters" size="sm" variant="ghost" disabled={p.search() === '' && p.filters().length === 0} onClick={p.onClear} />
    <Show when={p.resultCount !== undefined}><Text role="status" className={`text-[12px] py-2 text-${theme().mutedForeground}`}>{String(p.resultCount !== undefined ? p.resultCount() : 0) + ' results'}</Text></Show>
  </View>;
}

export interface FileEntry { name: string; path: string; directory: boolean; size: number; modified: number }
export type FileLister = (folder: string) => Promise<FileEntry[]>;
export async function readFileEntries(folder: string): Promise<FileEntry[]> {
  const result: FileEntry[] = [];
  for (const entry of fs.readDir(folder)) {
    const full = path.join(folder, entry.name), stat = fs.stat(full);
    result.push({ name: entry.name, path: full, directory: stat.isDirectory, size: stat.size, modified: stat.mtimeMs });
  }
  return result;
}
export function fileMatches(name: string, patterns: string[]): boolean {
  if (patterns.length === 0) return true;
  return patterns.some((pattern: string) => new RegExp('^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i').test(name));
}
export function filePathSegments(folder: string): PathSegment[] {
  const normalized = path.normalize(folder), absolute = path.isAbsolute(normalized), pieces = normalized.split('/').filter((p: string) => p !== '' && p !== '.');
  const result: PathSegment[] = [{ label: absolute ? '/' : '.', path: absolute ? '/' : '.' }];
  let current = absolute ? '/' : '.';
  for (const piece of pieces) { current = path.join(current, piece); result.push({ label: piece, path: current }); }
  return result;
}
enum FileLoadPhase { Idle, Loading, Ready, Failed, Closed }
class FileSession {
  phase: FileLoadPhase = FileLoadPhase.Idle; generation: i32 = 0;
  entries: FileEntry[] = []; error: string = '';
}
function modifiedLabel(milliseconds: number): string {
  if (!Number.isFinite(milliseconds) || Math.abs(milliseconds) > 8640000000000000) return 'Unknown';
  return new Date(milliseconds).toISOString().slice(0, 16).replace('T', ' ');
}
function fileTransition(session: FileSession, phase: FileLoadPhase): void {
  const allowed = phase === FileLoadPhase.Loading || phase === FileLoadPhase.Closed || session.phase === FileLoadPhase.Loading && (phase === FileLoadPhase.Ready || phase === FileLoadPhase.Failed);
  if (!allowed) throw new Error('Illegal file browser transition');
  session.phase = phase;
}
export interface FileBrowserProps {
  path: () => string; onNavigate: (folder: string) => void; selected: () => string[]; onSelect: (paths: string[]) => void;
  onActivate?: (entry: FileEntry) => void; lister?: FileLister; patterns?: () => string[]; foldersOnly?: boolean;
  multiple?: boolean; showHidden?: boolean; places?: PathSegment[]; height?: number; className?: string;
}
export function FileBrowser(p: FileBrowserProps): i32 {
  const session = componentRef(new FileSession());
  const [revision, setRevision] = componentSignal(0), [snapshot, setSnapshot] = componentSignal(0);
  const [hidden, setHidden] = componentSignal(p.showHidden === true), [search, setSearch] = componentSignal('');
  const [sort, setSort] = componentSignal<DataSort>({ column: 'name', descending: false });
  const history = componentRef<string[]>([]), historyAt = componentRef<i32>(-1);
  const columns: DataColumn[] = [{ id: 'name', label: 'Name', width: 300, sortable: true }, { id: 'size', label: 'Size', width: 100, align: 'right', sortable: true }, { id: 'modified', label: 'Modified (UTC)', width: 180, sortable: true }];
  const navigate = (folder: string, remember: boolean = true): void => {
    const normalized = path.normalize(folder);
    if (remember) { history.current = history.current.slice(0, historyAt.current + 1); if (history.current[history.current.length - 1] !== normalized) history.current.push(normalized); historyAt.current = history.current.length - 1; }
    setSearch(''); p.onSelect([]); p.onNavigate(normalized);
  };
  const start = (): (() => void) => {
    const folder = p.path(); revision();
    if (historyAt.current < 0 || history.current[historyAt.current] !== folder) {
      history.current = history.current.slice(0, historyAt.current + 1).concat([folder]);
      historyAt.current = history.current.length - 1;
    }
    const own = session.current, generation = ++own.generation;
    fileTransition(own, FileLoadPhase.Loading); own.error = ''; own.entries = []; setSnapshot(generation * 2);
    const load = async (): Promise<void> => {
      try {
        const lister = p.lister ?? readFileEntries;
        const entries = await lister(folder);
        if (own.generation !== generation || own.phase !== FileLoadPhase.Loading) return;
        own.entries = entries;
        fileTransition(own, FileLoadPhase.Ready);
      } catch (error) {
        if (own.generation !== generation || own.phase !== FileLoadPhase.Loading) return;
        own.error = error.message;
        fileTransition(own, FileLoadPhase.Failed);
      }
      setSnapshot(generation * 2 + 1);
    };
    load();
    return () => { if (own.generation === generation) { own.generation++; fileTransition(own, FileLoadPhase.Closed); } };
  };
  componentEffect(start, [revision()].concat(p.path().split('').map((c: string): number => c.charCodeAt(0))));
  const phase = (): FileLoadPhase => { snapshot(); return session.current.phase; };
  const backDisabled = (): boolean => { snapshot(); return historyAt.current <= 0; };
  const forwardDisabled = (): boolean => { snapshot(); return historyAt.current >= history.current.length - 1; };
  const entries = componentMemo(() => {
    snapshot();
    return session.current.entries.filter((entry: FileEntry) => (hidden() || !entry.name.startsWith('.')) && (p.foldersOnly !== true || entry.directory) && (entry.directory || fileMatches(entry.name, p.patterns !== undefined ? p.patterns() : [])));
  }, [] as FileEntry[]);
  const rows = componentMemo(() => entries().map((entry: FileEntry) => ({ id: entry.path, cells: [entry.directory ? entry.name + '/' : entry.name, entry.directory ? '' : String(entry.size), modifiedLabel(entry.modified)] })), [] as DataRow[]);
  const activate = (row: DataRow): void => { const entry = entries().find((e: FileEntry) => e.path === row.id); if (entry === undefined) return; if (entry.directory) navigate(entry.path); else if (p.onActivate !== undefined) p.onActivate(entry); };
  return <View className={`flex-col gap-3 min-w-0 ${p.className ?? ''}`}>
    <View className="flex-row flex-wrap gap-1 items-center">
      <KitButton label="Back" variant="ghost" size="sm" disabled={backDisabled()} onClick={() => { historyAt.current--; navigate(history.current[historyAt.current], false); }} />
      <KitButton label="Forward" variant="ghost" size="sm" disabled={forwardDisabled()} onClick={() => { historyAt.current++; navigate(history.current[historyAt.current], false); }} />
      <KitButton label="Up" variant="ghost" size="sm" disabled={path.dirname(p.path()) === p.path()} onClick={() => navigate(path.dirname(p.path()))} />
      <KitButton label="Reload" variant="ghost" size="sm" onClick={() => setRevision(revision() + 1)} />
      <Show when={(p.places ?? []).length > 0}><DropdownMenu label="Places" variant="ghost" items={(p.places ?? []).map((place: PathSegment) => ({ label: place.label, onSelect: () => navigate(place.path) }))} /></Show>
    </View>
    <PathBar path={p.path} segments={() => filePathSegments(p.path())} onNavigate={(folder: string) => navigate(folder)} />
    <View className="flex-row gap-3 items-center"><SearchField label="Filter files" value={search} onInput={setSearch} clearable={true} className="grow min-w-0" /><Checkbox label="Hidden files" checked={hidden} onChange={setHidden} /></View>
    <Show when={phase() === FileLoadPhase.Loading}><Text role="status" className={textClass()}>Loading folder…</Text></Show>
    <Show when={phase() === FileLoadPhase.Failed}><View className="flex-row gap-2 items-center"><Text role="alert" className={`text-[13px] text-${theme().destructive}`}>{session.current.error}</Text><KitButton label="Retry" size="sm" onClick={() => setRevision(revision() + 1)} /></View></Show>
    <DataGrid label="Files" columns={columns} rows={rows} selected={p.selected} onSelect={(ids: string[]) => p.onSelect(p.multiple === true ? ids : ids.slice(-1))} search={search} sort={sort} onSort={setSort} onActivate={activate} height={p.height ?? 240} emptyLabel={phase() === FileLoadPhase.Ready ? 'This folder is empty' : ''} />
    <Text role="status" className={`text-[12px] text-${theme().mutedForeground}`}>{String(entries().length) + ' items · ' + String(p.selected().length) + ' selected'}</Text>
  </View>;
}

export interface FileDialogProps {
  open: () => boolean; onOpenChange: (open: boolean) => void; onConfirm: (paths: string[]) => void;
  initialFolder: string; initialName?: string; title?: string; multiple?: boolean; foldersOnly?: boolean;
  filters?: { label: string; patterns: string[] }[]; places?: PathSegment[]; lister?: FileLister;
}
enum FileConfirmPhase { Browsing, ConfirmingOverwrite, Complete }
function confirmTransition(current: FileConfirmPhase, next: FileConfirmPhase): FileConfirmPhase {
  if (current === FileConfirmPhase.Complete || next === current) return current;
  if (next === FileConfirmPhase.Browsing || next === FileConfirmPhase.ConfirmingOverwrite || next === FileConfirmPhase.Complete) return next;
  throw new Error('Illegal file confirmation transition');
}
function FileDialogContent(p: { dialog: FileDialogProps; save: boolean }): i32 {
  const owner = p.dialog;
  const [folder, setFolder] = componentSignal(owner.initialFolder), [name, setName] = componentSignal(owner.initialName ?? '');
  const [selected, setSelected] = componentSignal<string[]>([]), [filter, setFilter] = componentSignal(0), [error, setError] = componentSignal('');
  const [phase, setPhase] = componentSignal(FileConfirmPhase.Browsing);
  const patterns = (): string[] => { const filters = owner.filters ?? []; return filter() >= 0 && filter() < filters.length ? filters[filter()].patterns : []; };
  const confirm = (overwrite: boolean = false, activated?: string[]): void => {
    if (phase() === FileConfirmPhase.Complete) return;
    try {
      let paths = activated ?? selected();
      if (p.save) {
        const file = name().trim();
        if (file === '' || file === '.' || file === '..' || file.includes('/') || file.includes('\\') || file.includes('\0')) throw new Error('Enter a file name without a folder.');
        if (!fs.stat(folder()).isDirectory) throw new Error('Choose an existing folder.');
        const target = path.join(folder(), file);
        if (fs.exists(target)) {
          if (fs.stat(target).isDirectory) throw new Error('That name belongs to a folder.');
          if (!overwrite) { setPhase(confirmTransition(phase(), FileConfirmPhase.ConfirmingOverwrite)); return; }
        }
        if (!fileMatches(file, patterns())) throw new Error('The file name does not match the selected file type.');
        paths = [target];
      } else {
        if (owner.foldersOnly === true && paths.length === 0) paths = [folder()];
        if (paths.length === 0) throw new Error('Select a file.');
        for (const full of paths) {
          const stat = fs.stat(full);
          if (owner.foldersOnly === true ? !stat.isDirectory : !stat.isFile) throw new Error(owner.foldersOnly === true ? 'Select a folder.' : 'Select a file.');
        }
      }
      owner.onConfirm(paths);
      setPhase(confirmTransition(phase(), FileConfirmPhase.Complete));
      owner.onOpenChange(false);
    } catch (e) { setError(e.message); setPhase(confirmTransition(phase(), FileConfirmPhase.Browsing)); }
  };
  return <View className="flex-col gap-3">
    <FileBrowser path={folder} onNavigate={(value: string) => { setFolder(value); setError(''); }} selected={selected} onSelect={(paths: string[]) => { setSelected(paths); setPhase(confirmTransition(phase(), FileConfirmPhase.Browsing)); if (p.save && paths.length > 0) setName(path.basename(paths[0])); }} onActivate={(entry: FileEntry) => { setSelected([entry.path]); if (p.save) setName(entry.name); else confirm(false, [entry.path]); }} multiple={owner.multiple} foldersOnly={owner.foldersOnly} patterns={patterns} places={owner.places} lister={owner.lister} height={200} />
    <Show when={p.save}><KitInput label="File name" value={name} onInput={(value: string) => { setName(value); setPhase(confirmTransition(phase(), FileConfirmPhase.Browsing)); }} onSubmit={() => confirm()} /></Show>
    <Show when={(owner.filters ?? []).length > 0}><Select label="File type" items={(owner.filters ?? []).map((f: { label: string; patterns: string[] }, i: i32) => ({ value: String(i), label: f.label }))} value={() => String(filter())} onChange={(value: string) => { setFilter(Number(value) as i32); setSelected([]); }} /></Show>
    <Show when={error() !== ''}><Text role="alert" className={`text-[13px] text-${theme().destructive}`}>{error()}</Text></Show>
    <Show when={phase() === FileConfirmPhase.ConfirmingOverwrite}><Text role="alert" className={textClass()}>{name() + ' already exists. Replace it when you save?'}</Text></Show>
    <View className="flex-row justify-end gap-2"><KitButton label="Cancel" variant="ghost" onClick={() => owner.onOpenChange(false)} /><KitButton label={phase() === FileConfirmPhase.ConfirmingOverwrite ? 'Replace' : p.save ? 'Choose save path' : owner.foldersOnly === true ? 'Choose folder' : 'Open'} onClick={() => confirm(phase() === FileConfirmPhase.ConfirmingOverwrite)} /></View>
  </View>;
}
function fileDialog(p: FileDialogProps, save: boolean): i32 {
  return <Dialog open={p.open} onOpenChange={p.onOpenChange} title={p.title ?? (save ? 'Save file' : 'Open file')} width={720} closeButton={false}>
    <Show when={p.open()}><FileDialogContent dialog={p} save={save} /></Show>
  </Dialog>;
}
/** Confirms paths only. The application owns every subsequent read or write and its filesystem scope. */
export function OpenFileDialog(p: FileDialogProps): i32 { return fileDialog(p, false); }
export function SaveFileDialog(p: FileDialogProps): i32 { return fileDialog(p, true); }
