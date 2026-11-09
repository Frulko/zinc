// Table and Outline (ZN-1072, tests/t0/ui_appkit_table.sh): zinc:appkit's Table of 10,000 rows and an Outline, shown by the AppKit host headless (a
// window never shown) and dumped. Only the rows in view (and a few more) are ever built: the host's cache is the virtual list's rows, and a scroll
// through AppKit comes back so the next commit pushes the rows it shows. Type-select reaches a row never built (the program answers), a sort by the
// header and a selection come back as events; the Outline expands, type-selects by itself and collapses. ZINC_RENDER=drawn runs the same program
// drawn: the components' fallback, with type-select from the keys.
import * as ui from 'zinc:ui';
import * as appkit from 'zinc:appkit';
import { Table, Outline } from 'zinc:appkit';
import { createSignal } from 'zinc:ui/solid';
import { quit } from 'zinc:gfx';

const N = 10000;
const name = (i: i32): string => i >= 9990 ? `zulu ${i}` : `file ${i}`;
const ids: i32[] = [];
for (let i = 0; i < N; i++) ids.push(i);
const [order, setOrder] = createSignal<i32[]>(ids);
const table = Table({
  columns: [{ id: 'name', title: 'Name', sortable: true }, { id: 'size', title: 'Size', width: 70, align: 'right', sortable: true }, { id: 'kind', title: 'Kind', width: 60 }],
  count: () => order().length,
  cell: (r: i32, c: i32): string => { const i = order()[r]; return c === 0 ? name(i) : c === 1 ? `${(i * 37) % 1000} KB` : i % 3 === 0 ? 'Folder' : 'File'; },
  className: 'flex-1',
  onSelect: (rows: i32[]) => { console.log(`table select ${rows.join(',')}`); },
  onSort: (col: string, asc: boolean) => {
    console.log(`table sort ${col} ${asc ? 'asc' : 'desc'}`);
    const o = ids.slice();
    if (!asc) o.reverse();
    setOrder(o);
  },
});
const outline = Outline({
  items: [
    { id: 'home', label: 'Home', children: [{ id: 'docs', label: 'Documents', children: [{ id: 'work', label: 'Work' }, { id: 'bills', label: 'Bills' }] }, { id: 'music', label: 'Music' }] },
    { id: 'trash', label: 'Trash' },
  ],
  expanded: ['home'],
  className: 'w-[140px]',
  onSelect: (id: string) => { console.log(`outline select ${id}`); },
  onToggle: (id: string, open: boolean) => { console.log(`outline ${open ? 'expand' : 'collapse'} ${id}`); },
});
const root = ui.createNode(ui.VIEW);
ui.setClass(root, 'flex-row w-full h-full');
ui.insert(root, outline, -1);
ui.insert(root, table, -1);

function box(h: i32): string { const b = ui.screenBox(h); return `${b[0]},${b[1]} ${b[2]}x${b[3]}`; }
const built = (): i32 => ui.childCount(ui.childAt(table, 1));   // the rows of the virtual list: those in view and a few more
let frame = 0;
ui.mount(root, 0xffffff, (_dt: number) => {
  frame++;
  if (!appkit.hostShown()) {   // drawn: the fallback, its keys
    if (frame === 2) { console.log(`drawn: outline ${box(outline)} table ${box(table)} rows built ${built()}`); ui.focusNode(table); ui.keyDown(-1, 'z'); }
    if (frame === 3) { ui.focusNode(outline); ui.keyDown(-1, 't'); }
    if (frame === 4) { console.log(`drawn: rows built ${built()}`); quit(); }
    return;
  }
  if (frame === 2) { console.log(`shown true, rows built ${built()}`); console.log(appkit.dump()); console.log(`scroll ${appkit.drive(table, 2, '', 0, 5000 * 24)}`); }
  if (frame === 5) { console.log(`-- scrolled to row 5000, rows built ${built()}`); console.log(appkit.dump()); console.log(`type ${appkit.drive(table, 8, 'z')}`); }
  if (frame === 8) { console.log(`-- type-select, rows built ${built()}`); console.log(appkit.dump()); console.log(`sort ${appkit.drive(table, 6, 'name', 0)}`); }
  if (frame === 11) { console.log('-- sorted'); console.log(appkit.dump()); console.log(`select ${appkit.drive(table, 7, '3,4')}`); }
  if (frame === 12) console.log(`expand ${appkit.drive(outline, 9, 'docs', 1)}`);
  if (frame === 13) console.log(`type ${appkit.drive(outline, 8, 't')}`);
  if (frame === 14) { console.log('-- outline'); console.log(appkit.dump()); console.log(`collapse ${appkit.drive(outline, 9, 'home', 0)}`); }
  if (frame === 16) { console.log('-- collapsed'); console.log(appkit.dump()); quit(); }
});
