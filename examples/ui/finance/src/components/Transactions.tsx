import { createSignal, createMemo } from 'zinc:ui/solid';
import { DataGrid, DataColumn, DataRow, DataSort, FilterBar, DataFilter, MenuItem, heading, theme } from 'zinc:ui/kit';
import { Transaction, accounts, money, categories } from '../data';
const columns: DataColumn[] = [
  { id: 'day', label: 'Date', width: 136, sortable: true }, { id: 'merchant', label: 'Merchant', width: 220, sortable: true },
  { id: 'category', label: 'Category', width: 152, sortable: true }, { id: 'account', label: 'Account', width: 148, sortable: true },
  { id: 'amount', label: 'Amount (USD)', width: 152, align: 'right', sortable: true, cell: (row: DataRow) => <Text className={`text-[13px] tabular-nums text-${theme().foreground}`}>{money(Number(row.cells[4]))}</Text> }
];
export function Transactions(p: { rows: () => Transaction[]; category: () => string; onCategory: (value: string) => void }): i32 {
  const [search, setSearch] = createSignal(''), [sort, setSort] = createSignal<DataSort>({ column: 'day', descending: true });
  const [selected, setSelected] = createSignal<string[]>([]);
  const filtered = createMemo(() => p.rows().filter((t: Transaction) => (p.category() === '' || t.category === p.category()) && (t.day + ' ' + t.merchant + ' ' + t.category + ' ' + accounts[t.account] + ' ' + money(t.cents)).toLowerCase().includes(search().toLowerCase())), [] as Transaction[]);
  const rows = createMemo(() => filtered().map((t: Transaction) => ({ id: t.id, cells: [t.day, t.merchant, t.category, accounts[t.account], String(t.cents)] })), [] as DataRow[]);
  const details = (): string => {
    const items = filtered().filter((t: Transaction) => selected().includes(t.id));
    if (items.length === 0) return 'Select a transaction to inspect its local details.';
    if (items.length === 1) return items[0].merchant + ' · ' + money(items[0].cents) + ' · ' + items[0].note;
    return String(items.length) + ' transactions · net ' + money(items.reduce((sum: number, t: Transaction) => sum + t.cents, 0));
  };
  const filters = (): DataFilter[] => p.category() === '' ? [] : [{ id: 'category', label: 'Category', value: p.category(), options: categories.concat(['Income']).map((name: string) => ({ value: name, label: name })) }];
  return <View className="flex-col gap-3 min-w-0">
    <Text className={heading(3)}>Transactions</Text>
    <FilterBar search={search} onSearch={setSearch} filters={filters} onChange={(id: string, value: string) => p.onCategory(value)} onRemove={(id: string) => p.onCategory('')} onClear={() => { setSearch(''); p.onCategory(''); }} available={categories.concat(['Income']).map((name: string): MenuItem => ({ label: name, onSelect: () => p.onCategory(name) }))} resultCount={() => filtered().length} />
    <DataGrid label="Account transactions" columns={columns} rows={rows} sort={sort} onSort={setSort} selected={selected} onSelect={setSelected} height={260} emptyLabel="No transactions match this view" onActivate={(row: DataRow) => setSelected([row.id])} />
    <View className={`p-4 rounded-[14px] border border-${theme().border} bg-${theme().card}`}><Text role="status" aria-live="polite" className={`text-[13px] text-${theme().foreground}`}>{details()}</Text></View>
    <Text className={`text-[12px] text-${theme().mutedForeground}`}>Arrows move cells · Space selects · Enter shows details · Alt+Up/Down sorts the current column. Scroll horizontally for every column.</Text>
  </View>;
}
