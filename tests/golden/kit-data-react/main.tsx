import * as ui from 'zinc:ui';
import { render, useState, MutableRef } from 'zinc:ui/react';
import { DataGrid, DataRow, DataColumn, DataSort, FileBrowser, FileEntry, PathBar, useQuietTheme } from 'zinc:ui/kit';
useQuietTheme();
const root = new MutableRef<i32>(-1);
const rows: DataRow[] = [{ id: 'a', cells: ['Alpha'] }, { id: 'b', cells: ['Beta'] }, { id: 'space /:é', cells: ['Gamma'] }];
const columns: DataColumn[] = [{ id: 'name', label: 'Name', sortable: true, cell: (row: DataRow) => <StatefulCell row={row.id} /> }];
let selection: string[] = [], requests = 0, frame = 0, editCount = 0, edited = '', location = '.';
let setSearch: (value: string) => void = (value: string) => {};
let setSort: (value: DataSort) => void = (value: DataSort) => {};
function list(folder: string): Promise<FileEntry[]> { requests++; return Promise.resolve([{ name: 'Latest', path: folder + '/Latest', directory: false, size: 1, modified: 0 }]); }
function StatefulCell(p: { row: string }): i32 {
  const [count, setCount] = useState(0);
  return <Button aria-label={'Custom ' + p.row} onClick={() => setCount(count + 1)}><Text>{p.row + ':' + String(count)}</Text></Button>;
}
function App(): i32 {
  const [selected, select] = useState<string[]>([]), [search, searchFor] = useState(''), [folder, navigate] = useState('.'), [files, choose] = useState<string[]>([]);
  const [sort, sortBy] = useState<DataSort>({ column: '', descending: false });
  selection = selected; setSearch = searchFor; setSort = sortBy; location = folder;
  return <View ref={root} className="flex-col gap-3 p-4">
    <DataGrid label="React grid" columns={columns} rows={() => rows} selected={() => selected} onSelect={select} search={() => search} sort={() => sort} onSort={sortBy} height={100} onEdit={(row: string, column: string, value: string) => { editCount++; edited = value; }} />
    <PathBar path={() => folder} segments={() => [{ label: folder, path: folder }]} onNavigate={navigate} />
    <FileBrowser path={() => folder} onNavigate={navigate} selected={() => files} onSelect={choose} lister={list} height={100} />
  </View>;
}
function find(h: i32, label: string): i32 {
  const n = ui.inspectNode(h); if (n === null) return -1;
  if (n.label === label) return h;
  for (const child of n.children) { const found = find(child, label); if (found >= 0) return found; }
  return -1;
}
function hasText(h: i32, text: string): boolean {
  const n = ui.inspectNode(h); if (n === null) return false;
  if (n.text === text) return true;
  for (const child of n.children) if (hasText(child, text)) return true;
  return false;
}
function expect(value: boolean, message: string): void { if (!value) throw new Error(message); }
function attr(h: i32, key: string): string { const n = ui.inspectNode(h); if (n === null) return ''; const at = n.attrK.indexOf(key); return at < 0 ? '' : n.attrV[at]; }
function findId(h: i32, id: string): i32 {
  const n = ui.inspectNode(h); if (n === null) return -1;
  if (attr(h, 'id') === id) return h;
  for (const child of n.children) { const found = findId(child, id); if (found >= 0) return found; }
  return -1;
}
function field(h: i32, label: string): i32 {
  const n = ui.inspectNode(h); if (n === null) return -1;
  if (n.label === label && n.ed !== null) return h;
  for (const child of n.children) { const found = field(child, label); if (found >= 0) return found; }
  return -1;
}
render(App, 0xf2f2f2, (dt: number) => {
  frame++;
  const grid = find(root.current, 'React grid');
  if (frame === 2) { ui.click(find(root.current, 'Custom a')); ui.focusNode(grid); ui.keyDown(grid, 'ArrowDown'); }
  if (frame === 3) { expect(hasText(grid, 'a:1'), 'custom cell state did not update'); ui.keyDown(grid, ' '); }
  if (frame === 4) { expect(selection.join(',') === 'b', 'React cursor reset on render'); expect(hasText(grid, 'a:1'), 'same-count parent render reset custom cell'); setSearch('Alpha'); }
  if (frame === 5) {
    expect(attr(grid, 'aria-rowcount') === '2', 'React memo did not update on filter');
    expect(requests === 1, 'React selection/search reloaded files');
    ui.focusNode(grid); ui.keyDown(grid, 'Enter');
  }
  if (frame === 6) {
    const editor = find(root.current, 'Edit cell'); expect(editor >= 0, 'React editor missing');
    ui.focusNode(editor); ui.select(editor, 0, ui.getValue(editor).length); ui.insertText('discarded'); ui.keyDown(editor, 'Escape');
  }
  if (frame === 7) { expect(editCount === 0, 'React Escape committed'); ui.focusNode(grid); ui.keyDown(grid, 'Enter'); }
  if (frame === 8) {
    const editor = find(root.current, 'Edit cell'); ui.focusNode(editor); ui.select(editor, 0, ui.getValue(editor).length); ui.insertText('42'); ui.keyDown(editor, 'Enter');
  }
  if (frame === 9) { expect(editCount === 1 && edited === '42', 'React typed editor commit/reentrant blur'); ui.focusNode(grid); ui.keyDown(grid, 'Enter'); }
  if (frame === 10) {
    const editor = find(root.current, 'Edit cell'); ui.focusNode(editor); ui.select(editor, 0, ui.getValue(editor).length); ui.insertText('98'); ui.focusNode(grid);
  }
  if (frame === 11) { expect(editCount === 2 && edited === '98', 'React blur editor commit'); ui.click(find(root.current, 'Edit path')); }
  if (frame === 12) { expect(location === '.', 'React path edit navigated early'); const input = field(root.current, 'Location'); ui.focusNode(input); ui.select(input, 0, ui.getValue(input).length); ui.insertText('child'); ui.keyDown(input, 'Enter'); }
  if (frame === 13) { expect(location === 'child' && requests === 2, 'React path submit/dependency lifecycle'); ui.click(find(root.current, 'Edit path')); }
  if (frame === 14) { const input = field(root.current, 'Location'); ui.focusNode(input); ui.select(input, 0, ui.getValue(input).length); ui.insertText('discarded'); ui.keyDown(input, 'Escape'); }
  if (frame === 15) {
    expect(location === 'child' && field(root.current, 'Location') < 0, 'React path Escape navigated or kept editor');
    const focused = ui.inspectNode(ui.focused()); expect(focused !== null && focused.role === 'group' && focused.label === 'Location', 'React path Escape lost focus');
    setSearch('');
  }
  if (frame === 17) ui.click(find(root.current, 'Custom a'));
  if (frame === 18) { expect(hasText(grid, 'a:1'), 'custom cell state after editing'); setSort({ column: 'name', descending: true }); }
  if (frame === 19) { expect(hasText(grid, 'b:0') && !hasText(grid, 'b:1'), 'custom cell state followed recycled row index'); }
  if (frame === 20) { ui.focusNode(grid); ui.keyDown(grid, 'Home', ui.CTRL); }
  if (frame === 21) { const id = attr(grid, 'aria-activedescendant'); expect(!id.includes(' ') && findId(grid, id) >= 0, 'filesystem-like stable ID broke active descendant'); console.log('data react: ok'); }
});
