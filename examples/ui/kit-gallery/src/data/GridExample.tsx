import { createSignal, createMemo } from 'zinc:ui/solid';
import { DataGrid, DataRow, DataColumn, DataSort, DataFilter, FilterBar, heading, theme } from 'zinc:ui/kit';
const initial: DataRow[] = [];
for (let i = 0; i < 2000; i++) initial.push({ id: 'take-' + String(i), cells: ['Recording ' + String(i + 1).padStart(4, '0'), i % 3 === 0 ? 'Reviewed' : 'Draft', String(10 + i % 190), i % 2 === 0 ? 'Ada' : 'Grace'] });
const columns: DataColumn[] = [{ id: 'name', label: 'Recording', width: 270, sortable: true, minWidth: 160 }, { id: 'status', label: 'Status', width: 160, sortable: true }, { id: 'seconds', label: 'Seconds', width: 110, align: 'right', sortable: true }, { id: 'owner', label: 'Recorded by', width: 180, sortable: true }];
const [rows, setRows] = createSignal(initial), [selected, setSelected] = createSignal<string[]>([]), [search, setSearch] = createSignal('');
const [sort, setSort] = createSignal<DataSort>({ column: '', descending: false }), [widths, setWidths] = createSignal<number[]>([270, 160, 110, 180]);
const [status, setStatus] = createSignal(''), [lastEdit, setLastEdit] = createSignal('');
const filters = (): DataFilter[] => status() === '' ? [] : [{ id: 'status', label: 'Status', value: status(), options: [{ value: 'Reviewed', label: 'Reviewed' }, { value: 'Draft', label: 'Draft' }] }];
const filtered = createMemo(() => rows().filter((row: DataRow) => status() === '' || row.cells[1] === status()), [] as DataRow[]);
export function GridExample(): i32 {
  return <View className="flex-col gap-3 min-w-0">
    <Text className={heading(3)}>2,000 recordings</Text>
    <FilterBar search={search} onSearch={setSearch} filters={filters} onChange={(id: string, value: string) => setStatus(value)} onRemove={(id: string) => setStatus('')} onClear={() => { setSearch(''); setStatus(''); }} available={[{ label: 'Status is Reviewed', onSelect: () => setStatus('Reviewed') }, { label: 'Status is Draft', onSelect: () => setStatus('Draft') }]} resultCount={() => filtered().filter((r: DataRow) => r.cells.join(' ').toLowerCase().includes(search().toLowerCase())).length} />
    <DataGrid label="Recordings" columns={columns} rows={filtered} selected={selected} onSelect={setSelected} search={search} sort={sort} onSort={setSort} widths={widths} onColumnResize={(id: string, width: number) => { const next = widths().slice(); next[columns.findIndex((column: DataColumn) => column.id === id)] = width; setWidths(next); }} height={300} striped={true} onEdit={(id: string, column: string, value: string) => { const at = columns.findIndex((c: DataColumn) => c.id === column); setRows(rows().map((row: DataRow) => { if (row.id !== id) return row; const cells = row.cells.slice(); cells[at] = value; return { id: row.id, cells }; })); setLastEdit('Updated ' + id); }} />
    <Text role="status" className={`text-[12px] text-${theme().mutedForeground}`}>{String(selected().length) + ' selected' + (lastEdit() !== '' ? ' · ' + lastEdit() : '')}</Text>
    <Text className={`text-[12px] text-${theme().mutedForeground}`}>Arrows move the cell cursor. Space selects; Shift extends; ⌘/Ctrl-click toggles. ⌘/Ctrl-A selects filtered rows. Enter edits; Escape reverts. Drag a header edge to resize.</Text>
  </View>;
}
