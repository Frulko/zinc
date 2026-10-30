// The Storage panel of Zinc Inspector: the program's key/values (zinc:storage, where AsyncStorage keeps its keys: the DOMStorage domain
// of zinc:devtools) listed, viewed (JSON pretty), edited, deleted and cleared, following the program's own writes (DOMStorage events); and
// the SQLite databases it has open (plugins/sqlite, dev runs: the ZincSqlite domain): their tables, a table's schema and rows by pages, and
// a query, read-only unless a write is confirmed. Changes need a dev run; the program refuses them otherwise.
import { createSignal } from 'zinc:ui/solid';
import { call, setStatus, errorOf } from './state';
import { Btn, Flat, Field, Mono } from './widgets';

const STORE = '{"storageId":{"securityOrigin":"zinc://app","isLocalStorage":true}';
const ASYNC = '@async/';   // AsyncStorage's keys in zinc:storage, their values after a '=' (plugins/async-storage)

/** A key/value as the panel shows it: AsyncStorage's keys without their prefix and marker. */
export class Item { key: string = ''; value: string = ''; }
export function shownKey(k: string): string { return k.startsWith(ASYNC) ? 'AsyncStorage · ' + k.slice(ASYNC.length) : k; }
export function shownValue(k: string, v: string): string { return k.startsWith(ASYNC) && v.startsWith('=') ? v.slice(1) : v; }
/** A value as pretty JSON when it is JSON, else as it is. */
export function pretty(v: string): string { try { return JSON.stringify(JSON.parse(v), null, 2); } catch (e) { return v; } }

export const [items, setItems] = createSignal<Item[]>([]);
export const [key, setKey] = createSignal<string>('');
export const [draft, setDraft] = createSignal<string>('');
export const [newKey, setNewKey] = createSignal<string>('');
export class Db { id: i32 = 0; path: string = ''; }
export const [dbs, setDbs] = createSignal<Db[]>([]);
export const [db, setDb] = createSignal<i32>(0);
export const [tables, setTables] = createSignal<string[]>([]);
export const [table, setTable] = createSignal<string>('');
export const [schema, setSchema] = createSignal<string>('');
export const [cols, setCols] = createSignal<string[]>([]);
export const [cells, setCells] = createSignal<string[][]>([]);
export const [page, setPage] = createSignal<i32>(0);
export const [sql, setSql] = createSignal<string>('');
export const [confirm, setConfirm] = createSignal<boolean>(false);   // a write waits for its confirmation
export const [result, setResult] = createSignal<string>('');
export const [changes, setChanges] = createSignal<i32>(0);   // DOMStorage events received (the dump waits on them)
const PAGE: i32 = 50;

/** Attached: the key/values (and their events from now on) and the open databases. */
export async function loadStorage(): Promise<void> {
  await call('DOMStorage.enable', '{}');
  await readItems();
  const d = await call('ZincSqlite.getDatabases', '{}');
  const l: Db[] = [];
  if (d.databases !== undefined) for (const x of d.databases) { const b = new Db(); b.id = x.id; b.path = x.path; l.push(b); }
  setDbs(l);
  if (l.length > 0) await openDb(l[0].id);
}
async function readItems(): Promise<void> {
  const r = await call('DOMStorage.getDOMStorageItems', STORE + '}');
  const l: Item[] = [];
  if (r.entries !== undefined) for (const e of r.entries) { const i = new Item(); i.key = e[0]; i.value = e[1]; l.push(i); }
  l.sort((a: Item, b: Item) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
  setItems(l);
}
export function onStorage(method: string, params: any): void {
  const l = items().filter((i: Item) => i.key !== params.key);
  if (method === 'DOMStorage.domStorageItemsCleared') { setItems([]); setChanges(changes() + 1); return; }
  if (method !== 'DOMStorage.domStorageItemRemoved') { const i = new Item(); i.key = params.key; i.value = params.newValue; l.push(i); l.sort((a: Item, b: Item) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0); }
  setItems(l);
  if (key() === params.key) setDraft(pretty(shownValue(key(), valueOf(key()))));
  setChanges(changes() + 1);
}
export function valueOf(k: string): string { for (const i of items()) if (i.key === k) return i.value; return ''; }
export function pickItem(k: string): void { setKey(k); setDraft(pretty(shownValue(k, valueOf(k)))); }
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
export async function clearItems(): Promise<boolean> {
  const r = await call('DOMStorage.clear', STORE + '}');
  const e = errorOf(r);
  setStatus(e.length > 0 ? e : 'storage cleared');
  return e.length === 0;
}

// ---- SQLite
/** Runs SQL on the database shown: the columns and rows, or the error ('' when it ran). */
export async function query(text: string, write: boolean, limit: i32): Promise<string> {
  const r = await call('ZincSqlite.query', `{"databaseId":${db()},"sql":${JSON.stringify(text)},"limit":${limit},"write":${write}}`);
  if (r.error !== undefined) { const e: string = r.error; return e; }
  const e = errorOf(r);
  if (e.length > 0) return e;
  const c: string[] = [];
  for (const x of r.columns) { const s: string = x; c.push(s); }
  const rows: string[][] = [];
  for (const row of r.rows) { const l: string[] = []; for (const v of row) l.push(v === null ? 'NULL' : '' + v); rows.push(l); }
  setCols(c); setCells(rows);
  const n: i32 = r.changes;
  setResult(write ? n + ' rows changed' : rows.length + (rows.length === 1 ? ' row' : ' rows'));
  return '';
}
export async function openDb(id: i32): Promise<void> {
  setDb(id); setTable(''); setSchema(''); setCols([]); setCells([]);
  const e = await query("SELECT name FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name", false, 1000);
  if (e.length > 0) { setResult(e); return; }
  setTables(cells().map((r: string[]) => r[0]));
  setCols([]); setCells([]); setResult('');
}
function ident(t: string): string { return '"' + t.split('"').join('""') + '"'; }
export async function openTable(t: string, p: i32): Promise<void> {
  setTable(t); setPage(p);
  await query(`SELECT sql FROM sqlite_master WHERE name = '${t.split("'").join("''")}'`, false, 1);
  setSchema(cells().length > 0 ? cells()[0][0] : '');
  const e = await query(`SELECT * FROM ${ident(t)} LIMIT ${PAGE} OFFSET ${p * PAGE}`, false, PAGE);
  if (e.length > 0) setResult(e); else setResult('rows ' + (p * PAGE + 1) + '–' + (p * PAGE + cells().length));
}
/** The query typed: read-only; a write is refused by SQLite until it is confirmed (Run as write, then Confirm). */
export async function runQuery(write: boolean): Promise<string> {
  setConfirm(false);
  const e = await query(sql(), write, 500);
  if (e.length > 0) setResult(e);
  return e;
}

// ---- the view
function ItemRow(p: { i: Item }): i32 {
  return <Button className={'py-0.5 flex-row items-center justify-start h-5 px-2 gap-2 ' + (key() === p.i.key ? 'bg-sky-100' : 'bg-white')} onClick={() => { pickItem(p.i.key); }}>
    <Text className="w-48 text-xs font-mono text-slate-900">{shownKey(p.i.key)}</Text>
    <Text className="flex-1 text-xs font-mono text-slate-600">{shownValue(p.i.key, p.i.value).slice(0, 80)}</Text>
  </Button>;
}
export function StorageView(): i32 {
  return <View className="flex-row flex-1">
    <View className="flex-col flex-1 border-r">
      <View className="flex-row items-center gap-1 px-2 py-1 border-b">
        <Text className="text-xs font-medium text-slate-700">Key/values</Text>
        <Field value={newKey} width="w-32" onInput={(v: string) => { setNewKey(v); }} onChange={(v: string) => {}} />
        <Btn label="Add" onClick={() => { if (newKey().length > 0) { saveItem(newKey(), '""'); setNewKey(''); } }} />
        <Btn label="Clear all" onClick={() => { clearItems(); }} />
      </View>
      <ScrollView className="flex-1"><View className="flex-col">{items().map((i: Item) => <ItemRow i={i} />)}</View></ScrollView>
      {key().length > 0 ? <View className="flex-col gap-1 p-2 border-t h-48">
        <Text className="text-xs font-medium text-slate-700">{shownKey(key())}</Text>
        <TextArea className="flex-1 bg-white border-slate-300 p-1 text-xs font-mono text-slate-900 border rounded" value={draft()} onInput={(v: string) => { setDraft(v); }} />
        <View className="flex-row gap-1"><Btn label="Save" onClick={() => { saveItem(key(), draft()); }} /><Btn label="Delete" onClick={() => { deleteItem(key()); }} /></View>
      </View> : <View />}
    </View>
    <View className="flex-col flex-1">
      <View className="flex-row items-center gap-1 px-2 py-1 border-b flex-wrap">
        <Text className="text-xs font-medium text-slate-700">SQLite</Text>
        {dbs().length === 0 ? <Text className="text-xs text-slate-500">no open database (zinc:sqlite, in a dev run)</Text> : <View />}
        {dbs().map((d: Db) => <Flat label={d.path.slice(d.path.lastIndexOf('/') + 1)} on={db() === d.id} onClick={() => { openDb(d.id); }} />)}
      </View>
      <View className="flex-row gap-1 px-2 py-1 border-b flex-wrap">{tables().map((t: string) => <Flat label={t} on={table() === t} onClick={() => { openTable(t, 0); }} />)}</View>
      {schema().length > 0 ? <Text className="px-2 py-1 text-xs font-mono text-slate-600">{schema()}</Text> : <View />}
      <View className="flex-row items-center gap-1 px-2 py-1 border-b">
        <Field value={sql} width="flex-1" onInput={(v: string) => { setSql(v); }} onChange={(v: string) => { runQuery(false); }} />
        <Btn label="Run" onClick={() => { runQuery(false); }} />
        {confirm() ? <Btn label="Confirm write" onClick={() => { runQuery(true); }} /> : <Btn label="Run as write…" onClick={() => { setConfirm(true); setResult('This changes the database: Confirm write to run it.'); }} />}
      </View>
      <View className="flex-row items-center gap-2 px-2 py-1">
        <Text className="flex-1 text-xs text-slate-600">{result()}</Text>
        {table().length > 0 ? <Btn label="‹" onClick={() => { if (page() > 0) openTable(table(), page() - 1); }} /> : <View />}
        {table().length > 0 ? <Btn label="›" onClick={() => { openTable(table(), page() + 1); }} /> : <View />}
      </View>
      <ScrollView className="flex-1">
        <View className="flex-col px-2">
          <Mono text={cols().join(' | ')} color="text-slate-500" />
          {cells().map((r: string[]) => <Mono text={r.join(' | ')} color="text-slate-800" />)}
        </View>
      </ScrollView>
    </View>
  </View>;
}

/** ZINC_INSPECTOR_DUMP: the key/values, an edit, a delete and a write of the program seen live; a table browsed and queries. */
export async function dumpStorage(waitChange: (n: i32) => Promise<void>): Promise<void> {
  console.log('storage:');
  for (const i of items()) console.log('  ' + shownKey(i.key) + ' = ' + shownValue(i.key, i.value));
  const theme = items().filter((i: Item) => i.key.endsWith('theme'));
  if (theme.length > 0) {
    const k = theme[0].key;
    pickItem(k);
    console.log('view ' + shownKey(k) + ': ' + draft().split('\n').join(' '));
    let n = changes();
    const saved = await saveItem(k, '{"mode":"light"}');
    if (saved) await waitChange(n);
    console.log('edit: ' + (saved ? shownValue(k, valueOf(k)) : 'refused'));
    n = changes();
    const gone = await deleteItem(k);
    if (gone) await waitChange(n);
    console.log('delete: ' + (gone ? 'gone ' + (items().filter((i: Item) => i.key === k).length === 0) : 'refused'));
  }
  const n = changes();
  await waitChange(n);   // the program writes its counter every 300 ms: seen without asking
  console.log('live: ' + items().filter((i: Item) => i.key.endsWith('count')).map((i: Item) => shownKey(i.key)).join(' '));
  console.log('sqlite: ' + dbs().map((d: Db) => d.path.slice(d.path.lastIndexOf('/') + 1)).join(' ') + ' tables ' + tables().join(' '));
  if (tables().length === 0) return;
  await openTable(tables()[0], 0);
  console.log('schema: ' + schema());
  console.log('rows: ' + result() + ' | ' + cols().join(',') + ' | ' + (cells().length > 0 ? cells()[0].join(',') : ''));
  await openTable(tables()[0], 1);
  console.log('page 2: ' + result());
  setSql('SELECT count(*) AS n FROM ' + tables()[0]);
  await runQuery(false);
  console.log('query: ' + cols().join(',') + ' = ' + (cells().length > 0 ? cells()[0][0] : ''));
  setSql('DELETE FROM ' + tables()[0]);
  console.log('read-only: ' + await runQuery(false));
  const w = await runQuery(true);
  console.log('write: ' + (w.length > 0 ? w : result()));
}
