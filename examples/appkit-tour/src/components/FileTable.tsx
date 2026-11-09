// The file list: an NSTableView of the visible files under the AppKit host (header sorting, multiple selection, type-select), a drawn table
// elsewhere. Only the rows in view are built, so 10,000 files cost what a screenful does. Below it, Finder's status line.
import { Table, TableColumn } from 'zinc:appkit';
import { FileEntry, formatSize } from '../services/files';
import { visible, selectedRows, selectRows, sortBy } from '../state';

const COLUMNS: TableColumn[] = [
  { id: 'name', title: 'Name', sortable: true },
  { id: 'modified', title: 'Date Modified', width: 110, sortable: true },
  { id: 'size', title: 'Size', width: 80, align: 'right', sortable: true },
  { id: 'kind', title: 'Kind', width: 120, sortable: true },
];

function cellText(f: FileEntry, column: i32): string {
  if (column === 0) return f.locked ? `${f.name} (locked)` : f.name;
  if (column === 1) return f.modified;
  if (column === 2) return formatSize(f.sizeKb);
  return f.kind;
}

function status(): string {
  const n = visible().length, picked = selectedRows().length;
  return picked > 0 ? `${picked} of ${n} selected` : `${n} items`;
}

export function FileTable(): i32 {
  return <View className="flex-col flex-1">
    <Table columns={COLUMNS} className="flex-1" accessibilityLabel="Files"
      count={() => visible().length}
      cell={(row: i32, column: i32) => cellText(visible()[row], column)}
      selection={selectedRows}
      onSelect={selectRows}
      onSort={sortBy} />
    <View className="flex-row items-center justify-center h-[22px]">
      <Text className="text-[11px]">{status()}</Text>
    </View>
  </View>;
}
