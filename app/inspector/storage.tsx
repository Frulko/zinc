// The Storage panel of Zinc Inspector, after Chrome DevTools' Application panel: on the left the tree of the program's stores (its key/values:
// zinc:storage and AsyncStorage, which keeps its keys there, the DOMStorage domain of zinc:devtools; and the SQLite databases it has open with
// their tables, plugins/sqlite in dev runs, the ZincSqlite domain); on the right the store picked as a grid (table.tsx): key/values sorted,
// filtered, edited in place, added, deleted, cleared, following the program's own writes (DOMStorage events), the value picked shown below as
// a JSON tree or raw; a table's rows by pages with its columns, sorted and filtered in SQL, its schema and indexes; a query whose result is
// the same grid, read-only unless a write is confirmed. Changes need a dev run; the program refuses them otherwise.
import { createSignal, createMemo } from 'zinc:ui/solid';
import { call, setStatus, errorOf } from './state';
import { Btn, Flat, Field } from './widgets';
import { Grid, GridView, Cell, cell, TEXT, NUM, NULL, BLOB, JsonTree, jsonLines, lineText, toggleFold, JLine } from './table';

const STORE = '{"storageId":{"securityOrigin":"zinc://app","isLocalStorage":true}';
const ASYNC = '@async/';   // AsyncStorage's keys in zinc:storage, their values after a '=' (plugins/async-storage)

/** A key/value of zinc:storage as the program keeps it. */
export class Item { key: string = ''; value: string = ''; }
export function shownKey(k: string): string { return k.startsWith(ASYNC) ? 'AsyncStorage · ' + k.slice(ASYNC.length) : k; }
export function shownValue(k: string, v: string): string { return k.startsWith(ASYNC) && v.startsWith('=') ? v.slice(1) : v; }
/** A value as pretty JSON when it is JSON, else as it is. */
export function pretty(v: string): string { try { return JSON.stringify(JSON.parse(v), null, 2); } catch (e) { return v; } }

export const [items, setItems] = createSignal<Item[]>([]);
export const [key, setKey] = createSignal<string>('');   // the key whose value shows below the grid
export const [draft, setDraft] = createSignal<string>('');   // the raw value being edited
export const [raw, setRaw] = createSignal<boolean>(false);   // the value as text instead of its JSON tree
export const [storeAt, setStoreAt] = createSignal<string>('');   // the store listed: the program's own file (an older program does not say)
export const [changes, setChanges] = createSignal<i32>(0);   // DOMStorage events received (the dump waits on them)
/** The store shown: 'kv:zinc', 'kv:async', 'db:<id>' (its query) or 'tbl:<id>:<table>'. */
export const [node, setNode] = createSignal<string>('kv:async');
export class Db { id: i32 = 0; path: string = ''; tables: string[] = []; }
export const [dbs, setDbs] = createSignal<Db[]>([]);
export const [db, setDb] = createSignal<i32>(0);
export const [table, setTable] = createSignal<string>('');
export const [schema, setSchema] = createSignal<string>('');
export const [page, setPage] = createSignal<i32>(0);
export const [total, setTotal] = createSignal<i32>(0);
export const [sql, setSql] = createSignal<string>('');
export const [confirm, setConfirm] = createSignal<boolean>(false);   // a write waits for its confirmation
export const [result, setResult] = createSignal<string>('');
const [adding, setAdding] = createSignal<boolean>(false);
const PAGE: i32 = 50;
const NEW = '\u0000new';   // the id of the row being added

function byKey(a: Item, b: Item): number { return a.key < b.key ? -1 : a.key > b.key ? 1 : 0; }
function asyncStore(): boolean { return node() === 'kv:async'; }
function inStore(k: string, isAsync: boolean): boolean { return k.startsWith(ASYNC) === isAsync; }
/** The key/values of the store shown (and the row being added). */
const kvList = createMemo<Item[]>(() => {
  const a = asyncStore();
  const l = items().filter((i: Item) => inStore(i.key, a));
  if (adding()) { const i = new Item(); i.key = NEW; l.push(i); }
  return l;
}, []);
function rowKey(k: string): string { return k === NEW ? '' : k.startsWith(ASYNC) ? k.slice(ASYNC.length) : k; }

// ---- the key/values grid
export const kv = new Grid();
kv.editable = true;
kv.setCols(['Key', 'Value']);
kv.setWidths([220]);
kv.rows = (): Cell[][] => kvList().map((i: Item) => [cell(rowKey(i.key), TEXT), cell(shownValue(i.key, i.value), TEXT)]);
kv.idOf = (r: i32): string => kvList()[r].key;
kv.onSelect = (id: string): void => { if (id !== NEW) pickItem(id); };
let committed: Promise<boolean> = Promise.resolve(false);   // the last in-place edit's write (the dump waits on it)
kv.onCommit = (id: string, col: i32, text: string): void => { committed = commitCell(id, col, text); };
kv.onDelete = (): void => { deleteSelected(); };

/** Attached: the key/values (and their events from now on) and the open databases with their tables. */
export async function loadStorage(): Promise<void> {
  await call('DOMStorage.enable', '{}');
  await readItems();
  if (items().filter((i: Item) => i.key.startsWith(ASYNC)).length === 0 && items().length > 0) setNode('kv:zinc');
  const d = await call('ZincSqlite.getDatabases', '{}');
  const l: Db[] = [];
  if (d.databases !== undefined) for (const x of d.databases) { const b = new Db(); b.id = x.id; b.path = x.path; l.push(b); }
  for (const b of l) {
    const r = await query(b.id, "SELECT name FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name", false, 1000);
    b.tables = r.rows.map((c: Cell[]) => c[0].text);
  }
  setDbs(l);
  if (l.length > 0) setDb(l[0].id);
}
/** The key/values read again (Refresh). */
export async function readItems(): Promise<void> {
  const r = await call('DOMStorage.getDOMStorageItems', STORE + '}');
  const l: Item[] = [];
  if (r.entries !== undefined) for (const e of r.entries) { const i = new Item(); i.key = e[0]; i.value = e[1]; l.push(i); }
  if (r.location !== undefined) setStoreAt(r.location);
  l.sort(byKey);
  setItems(l);
}
export function onStorage(method: string, params: any): void {
  if (method === 'DOMStorage.domStorageItemsCleared') { setItems([]); setChanges(changes() + 1); return; }
  const l = items().filter((i: Item) => i.key !== params.key);
  if (method !== 'DOMStorage.domStorageItemRemoved') { const i = new Item(); i.key = params.key; i.value = params.newValue; l.push(i); l.sort(byKey); }
  setItems(l);
  setChanges(changes() + 1);
}
export function valueOf(k: string): string { for (const i of items()) if (i.key === k) return i.value; return ''; }
/** A key picked: its value shows below (and in the raw editor). */
export function pickItem(k: string): void {
  setNode(k.startsWith(ASYNC) ? 'kv:async' : 'kv:zinc');
  setKey(k); setDraft(pretty(shownValue(k, valueOf(k))));
  if (!kv.isSelected(k)) kv.setSelected([k]);
}
/** Writes a value (AsyncStorage's keys keep their marker; JSON written back compact). */
export async function saveItem(k: string, text: string): Promise<boolean> {
  let v = text;
  try { v = JSON.stringify(JSON.parse(text)); } catch (e) { v = text; }
  if (k.startsWith(ASYNC)) v = '=' + v;
  const r = await call('DOMStorage.setDOMStorageItem', STORE + `,"key":${JSON.stringify(k)},"value":${JSON.stringify(v)}}`);
  const e = errorOf(r);
  setStatus(e.length > 0 ? e : 'saved ' + shownKey(k));
  return e.length === 0;
}
export async function deleteItem(k: string): Promise<boolean> {
  const r = await call('DOMStorage.removeDOMStorageItem', STORE + `,"key":${JSON.stringify(k)}}`);
  const e = errorOf(r);
  setStatus(e.length > 0 ? e : 'deleted ' + shownKey(k));
  if (e.length === 0 && key() === k) setKey('');
  return e.length === 0;
}
/** The rows selected deleted (Delete key, the toolbar). */
export async function deleteSelected(): Promise<boolean> {
  let ok = true;
  for (const k of kv.selected()) if (k !== NEW && !(await deleteItem(k))) ok = false;
  kv.setSelected([]);
  return ok;
}
/** The store shown cleared: its keys only (Chrome's Clear all), the other store kept. */
export async function clearItems(): Promise<boolean> {
  let ok = true;
  for (const i of kvList()) if (i.key !== NEW && !(await deleteItem(i.key))) ok = false;
  setStatus(ok ? 'storage cleared' : 'storage not cleared');
  return ok;
}
/** A cell edited in place: a value written, a key renamed (the value moved), a key added (the new row). */
export async function commitCell(id: string, col: i32, text: string): Promise<boolean> {
  const prefix = asyncStore() ? ASYNC : '';
  if (id === NEW) {
    setAdding(false);
    if (text.length === 0) return false;
    const k = prefix + text;
    const ok = await saveItem(k, '');
    if (ok) { pickItem(k); kv.startEdit(k, 1, ''); }   // then its value, as Chrome does
    return ok;
  }
  if (col === 1) return await saveItem(id, text);
  if (text.length === 0 || prefix + text === id) return false;
  const v = shownValue(id, valueOf(id));
  if (!(await saveItem(prefix + text, v))) return false;
  await deleteItem(id);
  pickItem(prefix + text);
  return true;
}
export function addRow(): void { setAdding(true); kv.startEdit(NEW, 0, ''); }

// ---- SQLite
/** A query's result: its columns and typed rows, the rows changed, or the error. */
export class QResult { cols: string[] = []; rows: Cell[][] = []; changes: i32 = 0; error: string = ''; }
function typed(v: any): Cell {
  if (v === null) return cell('NULL', NULL);
  if (typeof v === 'number') return cell('' + v, NUM);
  if (typeof v === 'string') return cell(v, TEXT);
  if (v.blob !== undefined) { const n: i32 = v.blob; const h: string = v.hex; return cell(`<blob ${n} B> ${h}${n > 16 ? '…' : ''}`, BLOB); }
  return cell(JSON.stringify(v), TEXT);
}
/** Runs SQL on a database (read-only unless `write`). */
export async function query(id: i32, text: string, write: boolean, limit: i32): Promise<QResult> {
  const r = await call('ZincSqlite.query', `{"databaseId":${id},"sql":${JSON.stringify(text)},"limit":${limit},"write":${write}}`);
  const q = new QResult();
  if (r.error !== undefined) { const e: string = r.error; q.error = e; return q; }
  q.error = errorOf(r);
  if (q.error.length > 0 || r.columns === undefined) return q;
  for (const x of r.columns) { const s: string = x; q.cols.push(s); }
  for (const row of r.rows) { const l: Cell[] = []; for (const v of row) l.push(typed(v)); q.rows.push(l); }
  q.changes = r.changes;
  return q;
}
function ident(t: string): string { return '"' + t.split('"').join('""') + '"'; }
function literal(t: string): string { return "'" + t.split("'").join("''") + "'"; }

/** A table's rows: sorted and filtered in SQL (the grid holds one page). */
export const tbl = new Grid();
tbl.local = false; tbl.fill = false;
let tblCols: string[] = [];   // the table's columns (PRAGMA table_info): the filter looks in each
/** The query's result. */
export const res = new Grid();
res.fill = false;

/** The tables of the database shown. */
export function tables(): string[] { for (const d of dbs()) if (d.id === db()) return d.tables; return []; }
export async function openTable(t: string, p: i32): Promise<void> {
  if (t !== table()) { tbl.setSortCol(-1); tbl.setDesc(false); tbl.setFilter(''); tbl.setSelected([]); }
  setTable(t); setPage(p); setNode('tbl:' + db() + ':' + t);
  const info = await query(db(), `PRAGMA table_info(${ident(t)})`, false, 1000);
  tblCols = info.rows.map((c: Cell[]) => c[1].text);
  const s = await query(db(), `SELECT sql FROM sqlite_master WHERE tbl_name = ${literal(t)} AND sql IS NOT NULL ORDER BY type = 'table' DESC, name`, false, 100);
  setSchema(s.rows.map((c: Cell[]) => c[0].text + ';').join('\n'));
  const f = tbl.filter();
  const where = f.length > 0 && tblCols.length > 0 ? ' WHERE ' + tblCols.map((c: string) => `${ident(c)} LIKE ${literal('%' + f + '%')}`).join(' OR ') : '';
  const order = tbl.sortCol() >= 0 && tbl.sortCol() < tblCols.length ? ` ORDER BY ${ident(tblCols[tbl.sortCol()])} ${tbl.desc() ? 'DESC' : 'ASC'}` : '';
  const n = await query(db(), `SELECT count(*) FROM ${ident(t)}${where}`, false, 1);
  setTotal(n.rows.length > 0 ? parseInt(n.rows[0][0].text) : 0);
  const r = await query(db(), `SELECT * FROM ${ident(t)}${where}${order} LIMIT ${PAGE} OFFSET ${p * PAGE}`, false, PAGE);
  if (r.error.length > 0) { setResult(r.error); return; }
  tbl.setCols(r.cols); tbl.setRows(r.rows);
  setResult(r.rows.length === 0 ? 'no rows' : 'rows ' + (p * PAGE + 1) + '–' + (p * PAGE + r.rows.length) + ' of ' + total());
}
tbl.onSort = (): void => { openTable(table(), 0); };
/** The query typed: read-only; a write is refused by SQLite until it is confirmed (Run as write, then Confirm). Its error, '' when it ran. */
export async function runQuery(write: boolean): Promise<string> {
  setConfirm(false);
  setNode('db:' + db());
  const r = await query(db(), sql(), write, 500);
  if (r.error.length > 0) { setResult(r.error); return r.error; }
  res.setSortCol(-1); res.setSelected([]); res.setCols(r.cols); res.setRows(r.rows);
  setResult(write ? r.changes + ' rows changed' : r.rows.length + (r.rows.length === 1 ? ' row' : ' rows'));
  return '';
}

// ---- the view
function TreeItem(p: { id: string; label: string; depth: i32; count: string; onClick: () => void }): i32 {
  return <Button className={'h-6 flex-row items-center justify-start gap-1 pr-2 ' + (node() === p.id ? 'bg-sky-100' : 'bg-transparent hover:bg-slate-100')}
    style={{ paddingLeft: 8 + p.depth * 14 }} onClick={p.onClick}>
    <Text className="flex-1 text-xs text-slate-800 truncate">{p.label}</Text>
    <Text className="text-xs text-slate-400">{p.count}</Text>
  </Button>;
}
function Heading(p: { label: string }): i32 { return <Text className="px-2 pt-2 pb-0.5 text-xs font-medium text-slate-500">{p.label}</Text>; }
function count(isAsync: boolean): string { return '' + items().filter((i: Item) => inStore(i.key, isAsync)).length; }
function baseName(path: string): string { return path.slice(path.lastIndexOf('/') + 1); }
function StoreTree(): i32 {
  return <ScrollView className="w-52 border-r bg-slate-50"><View className="flex-col pb-2">
    <Heading label="Key/values" />
    <TreeItem id="kv:zinc" label="zinc:storage" depth={1} count={count(false)} onClick={() => { setNode('kv:zinc'); kv.setSelected([]); setKey(''); }} />
    <TreeItem id="kv:async" label="AsyncStorage" depth={1} count={count(true)} onClick={() => { setNode('kv:async'); kv.setSelected([]); setKey(''); }} />
    <Heading label="SQLite" />
    {dbs().length === 0 ? <Text className="px-4 text-xs text-slate-400">no open database (a dev run)</Text> : <View />}
    {dbs().map((d: Db) => <View className="flex-col">
      <TreeItem id={'db:' + d.id} label={baseName(d.path)} depth={1} count="" onClick={() => { setDb(d.id); setNode('db:' + d.id); }} />
      {d.tables.map((t: string) => <TreeItem id={'tbl:' + d.id + ':' + t} label={t} depth={2} count="" onClick={() => { setDb(d.id); openTable(t, 0); }} />)}
    </View>)}
  </View></ScrollView>;
}

const BAR = 'flex-row items-center gap-1 px-2 py-1 border-b h-8';

function shownVal(): string { return shownValue(key(), valueOf(key())); }
function ValuePane(): i32 {
  return <View className="flex-col h-56 border-t">
    <View className="flex-row items-center gap-1 px-2 h-7 border-b bg-slate-50">
      <Text className="flex-1 text-xs font-mono text-slate-700 truncate">{rowKey(key())}</Text>
      <Flat label="Tree" on={!raw()} onClick={() => { setRaw(false); }} />
      <Flat label="Raw" on={raw()} onClick={() => { setDraft(pretty(shownVal())); setRaw(true); }} />
      {raw() ? <Btn label="Save" onClick={() => { saveItem(key(), draft()); }} /> : <View />}
    </View>
    {raw() ? <TextArea className="flex-1 bg-white p-2 text-xs font-mono text-slate-900" value={draft()} onInput={(v: string) => { setDraft(v); }} /> :
      <ScrollView className="flex-1"><View className="flex-col p-2">
        {jsonLines(shownVal()).length > 0 ? <JsonTree text={shownVal()} /> :
          <Text className="text-xs font-mono text-slate-800 whitespace-pre-wrap break-all">{shownVal()}</Text>}
      </View></ScrollView>}
  </View>;
}
function KvView(): i32 {
  return <View className="flex-col flex-1">
    <View className={BAR}>
      <Flat label="Refresh" on={false} onClick={() => { readItems(); }} />
      <Text className="text-xs text-slate-500 pl-1">Filter</Text>
      <Field value={kv.filter} width="w-48" onInput={(v: string) => { kv.setFilter(v); }} onChange={(v: string) => {}} />
      <Flat label="Add" on={false} onClick={() => { addRow(); }} />
      <Flat label="Delete" on={false} onClick={() => { deleteSelected(); }} />
      <Flat label="Clear all" on={false} onClick={() => { clearItems(); }} />
      <Text className="flex-1 text-xs text-slate-500 truncate text-right">{storeAt()}</Text>
    </View>
    <GridView g={kv} />
    {items().filter((i: Item) => i.key === key()).length > 0 ? <ValuePane /> : <View />}
  </View>;
}
function QueryBar(): i32 {
  return <View className={BAR}>
    <Field value={sql} width="flex-1" onInput={(v: string) => { setSql(v); }} onChange={(v: string) => { runQuery(false); }} />
    <Btn label="Run" onClick={() => { runQuery(false); }} />
    {confirm() ? <Btn label="Confirm write" onClick={() => { runQuery(true); }} /> : <Btn label="Run as write…" onClick={() => { setConfirm(true); setResult('This changes the database: Confirm write to run it.'); }} />}
  </View>;
}
function TableView(): i32 {
  return <View className="flex-col flex-1">
    <QueryBar />
    <View className={BAR}>
      <Flat label="Refresh" on={false} onClick={() => { openTable(table(), page()); }} />
      <Text className="text-xs text-slate-500 pl-1">Filter</Text>
      <Field value={tbl.filter} width="w-48" onInput={(v: string) => { tbl.setFilter(v); }} onChange={(v: string) => { openTable(table(), 0); }} />
      <Text className="flex-1 text-xs text-slate-600">{result()}</Text>
      <Flat label="‹" on={false} onClick={() => { if (page() > 0) openTable(table(), page() - 1); }} />
      <Flat label="›" on={false} onClick={() => { if ((page() + 1) * PAGE < total()) openTable(table(), page() + 1); }} />
    </View>
    <GridView g={tbl} />
    <ScrollView className="h-32 border-t bg-slate-50"><Text className="p-2 text-xs font-mono text-slate-700 whitespace-pre-wrap">{schema()}</Text></ScrollView>
  </View>;
}
function QueryView(): i32 {
  return <View className="flex-col flex-1">
    <QueryBar />
    <Text className="px-2 py-1 text-xs text-slate-600 border-b">{result().length > 0 ? result() : 'Type SQL, then Run (read-only) or Run as write.'}</Text>
    <GridView g={res} />
  </View>;
}
export function StorageView(): i32 {
  return <View className="flex-row flex-1">
    <StoreTree />
    {node().startsWith('kv:') ? <KvView /> : node().startsWith('tbl:') ? <TableView /> : <QueryView />}
  </View>;
}

/** ZINC_INSPECTOR_DUMP=storage: the stores, the AsyncStorage grid (sorted, filtered), a value's JSON tree folded, a cell edited in place, a
 *  row deleted, the program's writes seen live; a table's columns, typed rows, pages, sort, filter and schema; queries. */
export async function dumpStorage(waitChange: (n: i32) => Promise<void>): Promise<void> {
  console.log('storage: ' + storeAt());
  console.log('stores: zinc:storage ' + count(false) + ' | AsyncStorage ' + count(true) + ' | ' + dbs().map((d: Db) => baseName(d.path) + ' ' + d.tables.join(' ')).join(' | '));
  setNode('kv:async');
  console.log('columns: ' + kv.cols().join(' | '));
  for (const l of kv.lines()) console.log('  ' + l);
  kv.sortBy(0); kv.sortBy(0);
  console.log('sorted desc: ' + kv.shown().map((r: i32) => kv.rows()[r][0].text).join(' '));
  kv.setFilter('rose');
  console.log('filtered: ' + kv.lines().join(' / '));
  kv.setFilter(''); kv.setSortCol(-1);
  const theme = ASYNC + 'theme';
  if (valueOf(theme).length > 0) {
    kv.pick(theme, false, false);
    console.log('tree ' + rowKey(key()) + ':');
    for (const l of jsonLines(shownVal())) console.log('  ' + lineText(l));
    const place = ASYNC + 'weather.place';
    pickItem(place);
    const ls: JLine[] = jsonLines(shownVal());
    if (ls.length > 1) toggleFold(ls[ls.length - 1].path.slice(0, ls[ls.length - 1].path.lastIndexOf('/')));
    console.log('folded ' + rowKey(key()) + ': ' + jsonLines(shownVal()).map(lineText).join(' / '));
    let n = changes();
    kv.startEdit(theme, 1, shownValue(theme, valueOf(theme)));
    kv.setDraft('{"mode":"light"}');
    kv.commit();
    const saved = await committed;
    if (saved) await waitChange(n);
    console.log('edit: ' + (saved ? 'theme = ' + shownValue(theme, valueOf(theme)) : 'refused'));
    n = changes();
    kv.pick(theme, false, false);
    const gone = await deleteSelected();
    if (gone) await waitChange(n);
    console.log('delete: ' + (gone ? 'gone ' + (valueOf(theme).length === 0) : 'refused'));
  }
  const n = changes();
  await waitChange(n);   // the program writes its counter every 300 ms: seen without asking
  console.log('live: ' + kv.lines().filter((l: string) => l.startsWith('count')).map((l: string) => l.split(' | ')[0]).join(' '));
  if (tables().length === 0) { console.log('sqlite: none'); return; }
  await openTable('songs', 0);
  console.log('table: ' + tbl.cols().join(' | ') + ' | ' + result() + ' | ' + tbl.lines()[0]);
  console.log('aligned: ' + tbl.rows()[0].map((c: Cell) => c.kind === NUM ? 'right' : 'left').join(' '));
  tbl.sortBy(2); tbl.sortBy(2);
  await openTable('songs', 0);
  console.log('sorted: ' + tbl.lines()[0]);
  tbl.setFilter('Song 11');
  await openTable('songs', 0);
  console.log('filtered: ' + result());
  tbl.setFilter(''); tbl.setSortCol(-1);
  await openTable('songs', 1);
  console.log('page 2: ' + result());
  console.log('schema: ' + schema().split('\n').join(' '));
  await openTable('covers', 0);
  console.log('covers: ' + tbl.lines().join(' / ') + ' | kinds ' + tbl.rows()[0].map((c: Cell) => c.kind === NULL ? 'null' : c.kind === BLOB ? 'blob' : c.kind === NUM ? 'num' : 'text').join(' '));
  setSql('SELECT count(*) AS n FROM songs');
  await runQuery(false);
  console.log('query: ' + res.cols().join(',') + ' = ' + res.lines()[0]);
  setSql('DELETE FROM songs');
  console.log('read-only: ' + await runQuery(false));
  const w = await runQuery(true);
  console.log('write: ' + (w.length > 0 ? w : result()));
}
