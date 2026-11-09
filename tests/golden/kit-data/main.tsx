import * as ui from 'zinc:ui';
import { createNodeRef, createSignal, render } from 'zinc:ui/solid';
import { DataGrid, DataRow, DataColumn, DataSort, TreeItem, Tree, FileBrowser, FileEntry, dataRows, selectDataRows, flattenTree, fileMatches, useQuietTheme } from 'zinc:ui/kit';
useQuietTheme();
function expect(value: boolean, message: string): void { if (!value) throw new Error(message); }
const columns: DataColumn[] = [{ id: 'name', label: 'Name', sortable: true }, { id: 'count', label: 'Count', sortable: true }];
const numeric: DataRow[] = [{ id: 'a', cells: ['same', '10'] }, { id: 'b', cells: ['same', '2'] }, { id: 'c', cells: ['same', '2'], disabled: true }];
const ordered = dataRows(numeric, columns, '', { column: 'count', descending: false });
expect(ordered.map((r: DataRow) => r.id).join(',') === 'b,c,a', 'stable numeric sort');
expect(numeric[0].id === 'a', 'sorting mutated source');
expect(selectDataRows(ordered, [], 'a', 'b', true, false).join(',') === 'b,a', 'visible range must skip disabled rows');
expect(selectDataRows(ordered, ['b'], 'b', '', false, true).length === 0, 'toggle selected row');
expect(selectDataRows(ordered, ['a'], 'missing', '', false, false)[0] === 'a', 'missing selection target');
expect(dataRows(numeric, columns, 'SAME').length === 3, 'case insensitive search');
expect(fileMatches('Take.WAV', ['*.wav']) && !fileMatches('Take.wav.exe', ['*.wav']) && fileMatches('a+b.md', ['a+b.md']), 'file glob escaping and anchoring');
const treeItems: TreeItem[] = [{ id: 'folder', label: 'Folder', children: [{ id: 'leaf', label: 'Leaf' }] }];
expect(flattenTree(treeItems, []).length === 1, 'collapsed tree');
const treeRows = flattenTree(treeItems, ['folder']);
expect(treeRows.length === 2 && treeRows[1].parentId === 'folder' && treeRows[1].depth === 1, 'expanded tree metadata');
const cycle: TreeItem = { id: 'cycle', label: 'Cycle' }; cycle.children = [cycle];
let refused = false;
try { flattenTree([cycle], ['cycle']); } catch (e) { refused = true; }
expect(refused, 'cyclic tree did not fail');
const source: DataRow[] = [];
for (let i = 0; i < 2000; i++) source.push({ id: 'row-' + String(i), cells: ['Row ' + String(i), String(i)], disabled: i === 1 });
const root = createNodeRef();
const [selected, setSelected] = createSignal<string[]>([]), [search, setSearch] = createSignal('');
const [sort, setSort] = createSignal<DataSort>({ column: '', descending: false });
const [widths, setWidths] = createSignal<number[]>([160, 160]);
const [expanded, setExpanded] = createSignal<string[]>([]), [treeSelection, setTreeSelection] = createSignal<string[]>([]);
const [folder, setFolder] = createSignal('a'), [files, setFiles] = createSignal<string[]>([]), [showFiles, setShowFiles] = createSignal(true), [showTree, setShowTree] = createSignal(true);
const pending = new Map<string, (entries: FileEntry[]) => void>();
let requests = 0, edits = 0, edited = '', frame = 0, treeRequests = 0;
const pendingTree = new Map<string, (children: TreeItem[]) => void>();
const lazyItems: TreeItem[] = treeItems.concat([{ id: 'lazy', label: 'Lazy', hasChildren: true }, { id: 'retry', label: 'Retry branch', hasChildren: true }, { id: 'late', label: 'Late branch', hasChildren: true }]);
const attempts = new Map<string, i32>();
function loadChildren(id: string): Promise<TreeItem[]> {
  treeRequests++; const attempt = (attempts.get(id) ?? 0) + 1; attempts.set(id, attempt);
  if (id === 'retry' && attempt === 1) return Promise.reject<TreeItem[]>(new Error('branch fixture denied'));
  return new Promise<TreeItem[]>((resolve) => pendingTree.set(id, resolve));
}
function list(folder: string): Promise<FileEntry[]> {
  requests++;
  if (folder === 'bad' && requests < 4) throw new Error('denied fixture');
  return new Promise<FileEntry[]>((resolve) => { pending.set(folder, resolve); });
}
function resolve(folder: string, name: string): void {
  const done = pending.get(folder); if (done === undefined) throw new Error('missing request ' + folder);
  done([{ name, path: folder + '/' + name, directory: false, size: 12, modified: 0 }]);
}
function App(): i32 {
  return <View ref={root} className="flex-col gap-2 p-4 h-full">
    <DataGrid label="Test grid" columns={columns} rows={() => source} selected={selected} onSelect={setSelected} search={search} sort={sort} onSort={setSort} widths={widths} onColumnResize={(id: string, width: number) => { const next = widths().slice(); next[columns.findIndex((c: DataColumn) => c.id === id)] = width; setWidths(next); }} height={160} onEdit={(row: string, column: string, value: string) => { edits++; edited = row + '/' + column + '/' + value; }} />
    <Show when={showTree()}><Tree label="Test tree" items={() => lazyItems} expanded={expanded} onExpandedChange={setExpanded} selected={treeSelection} onSelect={setTreeSelection} onLoadChildren={loadChildren} height={180} /></Show>
    <Show when={showFiles()}><FileBrowser path={folder} onNavigate={setFolder} selected={files} onSelect={setFiles} lister={list} height={90} /></Show>
  </View>;
}
function find(h: i32, label: string): i32 {
  const n = ui.inspectNode(h); if (n === null) return -1;
  if (n.label === label) return h;
  for (const child of n.children) { const found = find(child, label); if (found >= 0) return found; }
  return -1;
}
function findRole(h: i32, role: string): i32 {
  const n = ui.inspectNode(h); if (n === null) return -1;
  if (n.role === role) return h;
  for (const child of n.children) { const found = findRole(child, role); if (found >= 0) return found; }
  return -1;
}
function countRows(h: i32): i32 {
  const n = ui.inspectNode(h); if (n === null) return 0;
  let total = n.role === 'row' ? 1 : 0;
  for (const child of n.children) total += countRows(child);
  return total;
}
function hasText(h: i32, text: string): boolean {
  const n = ui.inspectNode(h); if (n === null) return false;
  if (n.text.includes(text)) return true;
  for (const child of n.children) if (hasText(child, text)) return true;
  return false;
}
function attr(h: i32, key: string): string { const n = ui.inspectNode(h); if (n === null) return ''; const at = n.attrK.indexOf(key); return at < 0 ? '' : n.attrV[at]; }
function findId(h: i32, id: string): i32 {
  const n = ui.inspectNode(h); if (n === null) return -1;
  if (attr(h, 'id') === id) return h;
  for (const child of n.children) { const found = findId(child, id); if (found >= 0) return found; }
  return -1;
}
render(App, 0xf2f2f2, (dt: number) => {
  frame++;
  const grid = find(root.node, 'Test grid');
  if (frame === 2) {
    expect(countRows(grid) < 30 && attr(grid, 'aria-rowcount') === '2001', 'grid not virtualized or total row count wrong');
    const first = findId(grid, attr(grid, 'aria-activedescendant')), cell = ui.screenBox(first);
    ui.pointerAt(cell[0] + cell[2] / 2, cell[1] + cell[3] / 2, true); ui.pointerAt(cell[0] + cell[2] / 2, cell[1] + cell[3] / 2, false);
    ui.focusNode(grid); ui.keyDown(grid, ' '); ui.keyDown(grid, 'ArrowDown', ui.SHIFT);
    setFolder('b'); resolve('b', 'Latest'); resolve('a', 'Stale');
    const tree = find(root.node, 'Test tree'); ui.focusNode(tree); ui.keyDown(tree, 'ArrowRight');
  }
  if (frame === 3) {
    expect(selected().join(',') === 'row-0,row-2', 'shift selection or disabled skip');
    expect(expanded()[0] === 'folder', 'tree right did not expand');
    ui.click(find(root.node, 'Expand Lazy'));
  }
  if (frame === 4) { expect(hasText(root.node, 'Latest') && !hasText(root.node, 'Stale'), 'stale async folder replaced newer folder'); expect(treeRequests === 1, 'missing lazy request'); ui.click(find(root.node, 'Collapse Lazy')); }
  if (frame === 5) {
    ui.click(find(root.node, 'Expand Lazy')); expect(treeRequests === 1, 'repeated expansion duplicated pending load');
    const children = pendingTree.get('lazy'); if (children === undefined) throw new Error('missing lazy request'); children([{ id: 'loaded', label: 'Loaded child' }]);
    ui.focusNode(grid); ui.keyDown(grid, 'End', ui.CTRL);
  }
  if (frame === 6) {
    const active = findId(grid, attr(grid, 'aria-activedescendant'));
    expect(active >= 0 && attr(active, 'aria-colindex') === '2' && hasText(active, '1999'), 'keyboard active descendant did not reach last row/cell');
    const cell = ui.screenBox(active), box = ui.screenBox(grid);
    expect(cell[0] >= box[0] && cell[0] + cell[2] <= box[0] + box[2] + 1, 'keyboard column cursor remained outside horizontal viewport');
    expect(hasText(grid, 'Row 1999') && countRows(grid) < 30, 'keyboard did not scroll virtual row into view');
  }
  if (frame === 7) { expect(hasText(root.node, 'Loaded child'), 'loaded children not visible'); ui.click(find(root.node, 'Collapse Lazy')); }
  if (frame === 8) {
    ui.click(find(root.node, 'Expand Lazy')); expect(treeRequests === 1, 'cached lazy branch reloaded');
    ui.focusNode(grid); ui.keyDown(grid, 'a', ui.CTRL); expect(selected().length === 1999, 'select all must skip disabled rows');
    setSearch('Row 1999'); setFolder('bad');
  }
  if (frame === 9) {
    expect(attr(grid, 'aria-rowcount') === '2', 'filter total row count'); expect(hasText(root.node, 'denied fixture'), 'file failure state missing');
    ui.click(find(root.node, 'Retry')); resolve('bad', 'Recovered'); ui.focusNode(grid); ui.keyDown(grid, 'Enter');
  }
  if (frame === 10) {
    const editor = find(root.node, 'Edit cell'); expect(editor >= 0, 'editor missing');
    ui.focusNode(editor); ui.select(editor, 0, ui.getValue(editor).length); ui.insertText('discarded'); ui.keyDown(editor, 'Escape');
  }
  if (frame === 11) { expect(hasText(root.node, 'Recovered'), 'file retry failed'); expect(edits === 0, 'Escape committed editor'); ui.focusNode(grid); ui.keyDown(grid, 'Enter'); }
  if (frame === 12) {
    const editor = find(root.node, 'Edit cell'); ui.focusNode(editor); ui.select(editor, 0, ui.getValue(editor).length); ui.insertText('42'); ui.keyDown(editor, 'Enter');
    setFolder('late'); setShowFiles(false); resolve('late', 'After unmount');
  }
  if (frame === 13) {
    expect(edits === 1 && edited === 'row-1999/count/42', 'editor commit/reentrant blur'); expect(!hasText(root.node, 'After unmount'), 'late file completion mounted after dispose');
    ui.focusNode(grid); ui.keyDown(grid, 'ArrowRight', ui.ALT); expect(widths()[1] === 170, 'keyboard column resize');
    ui.keyDown(grid, 'ArrowDown', ui.ALT); expect(sort().column === 'count' && sort().descending, 'keyboard column sort');
    ui.systemSignal('reducemotion 1'); ui.click(find(root.node, 'Expand Retry branch'));
  }
  if (frame === 14) { expect(hasText(root.node, 'branch fixture denied'), 'lazy branch rejection missing'); ui.click(find(root.node, 'Retry retry')); }
  if (frame === 15) { const done = pendingTree.get('retry'); if (done === undefined) throw new Error('missing retry request'); done([{ id: 'retry-child', label: 'Recovered branch' }]); }
  if (frame === 17) {
    expect(hasText(root.node, 'Recovered branch'), 'lazy branch retry failed'); ui.click(find(root.node, 'Expand Late branch')); setShowTree(false);
    const done = pendingTree.get('late'); if (done === undefined) throw new Error('missing late request'); done([{ id: 'stale-tree', label: 'After tree unmount' }]);
  }
  if (frame === 18) { expect(!hasText(root.node, 'After tree unmount'), 'late tree completion survived unmount'); setShowTree(true); }
  if (frame === 19) ui.click(find(root.node, 'Collapse Late branch'));
  if (frame === 20) {
    ui.click(find(root.node, 'Expand Late branch')); const done = pendingTree.get('late'); if (done === undefined) throw new Error('missing fresh tree request'); done([{ id: 'fresh-tree', label: 'Fresh tree child' }]);
  }
  if (frame === 22) { expect(hasText(root.node, 'Fresh tree child') && !hasText(root.node, 'After tree unmount'), 'tree restarted with stale branch result'); }
  if (frame === 23) {
    const sortButton = find(root.node, 'Sort Name'), headerCell = ui.inspectNode(sortButton);
    if (headerCell === null) throw new Error('missing header');
    const cell = ui.inspectNode(headerCell.parent); if (cell === null) throw new Error('missing column header');
    const handle = findRole(headerCell.parent, 'separator');
    expect(handle >= 0, 'missing resize handle'); const box = ui.screenBox(handle), x = box[0] + box[2] / 2, y = box[1] + box[3] / 2;
    ui.pointerAt(x, y, true); ui.pointerAt(x + 20, y, true); ui.pointerAt(x + 20, y, false);
  }
  if (frame === 24) { expect(widths()[0] === 180, 'pointer header resize'); ui.click(find(root.node, 'Sort Name')); expect(sort().column === 'name' && !sort().descending, 'pointer header sort'); console.log('data: ok'); }
});
