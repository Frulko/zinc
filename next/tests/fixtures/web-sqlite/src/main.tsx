import { render, createSignal } from 'zinc:ui/solid';
import { Database } from 'zinc:sqlite';

const [status, setStatus] = createSignal<string>('idle');

function run(): void {
  try {
    const a = new Database('notes.db');
    a.exec('DROP TABLE IF EXISTS notes; CREATE TABLE notes (id INTEGER PRIMARY KEY, title TEXT, score REAL, data BLOB)');
    const ins = a.prepare('INSERT INTO notes (title, score) VALUES (?, ?)');
    ins.run(['alpha', 1.5]);
    const r = ins.run(['béta', 2]);
    ins.finalize();
    a.transaction(() => { a.exec("INSERT INTO notes (title, score) VALUES ('gamma', 3)"); });
    a.close();
    // the same path again: what the first one saved comes back (localStorage, as the bytes of sqlite3_serialize)
    const b = new Database('notes.db');
    const rows = b.prepare('SELECT title, score FROM notes ORDER BY id').all();
    const sum = b.prepare('SELECT SUM(score) AS s FROM notes WHERE title <> :skip').get([], new Map([[':skip', 'gamma']]));
    setStatus(`sqlite ${Database.version()}, rows ${rows.length}: ${rows.map((x) => x.text('title')).join('/')}, sum ${String(sum === null ? 'none' : sum.get('s'))}, last id ${r.lastInsertRowid}`);
    b.close();
  } catch (e) { setStatus('error ' + (e as Error).message); }
}

function App(): i32 {
  return <View className="p-6 flex-col gap-3 bg-white w-full h-full">
    <Button className="bg-sky-600 rounded-md px-3 py-2 cursor-pointer" onClick={run}><Text className="text-white">Run</Text></Button>
    <Text>{status()}</Text>
  </View>;
}

render(App, 0xffffff, null);
