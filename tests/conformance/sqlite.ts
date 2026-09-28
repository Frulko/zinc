// zinc-test: requires fs heap>=4M
// zinc:sqlite: the bundled amalgamation natively, node:sqlite on the sim, the same rows on both.
import { Database, Row, SqliteError } from 'zinc:sqlite';
import * as fs from 'zinc:fs';

const db = new Database();
db.exec(`
  CREATE TABLE people (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, age INTEGER, score REAL, avatar BLOB);
  CREATE INDEX people_age ON people(age);
`);
const ins = db.prepare('INSERT INTO people (name, age, score, avatar) VALUES (?, ?, ?, ?)');
console.log(ins.run(['Ada', 36, 9.5, null]).lastInsertRowid, ins.run(['Linus', 54, 7, Blob.fromBytes([1, 2, 255])]).changes);
ins.run(['Grace', 85, null, null]);
ins.finalize();

const named = new Map<string, unknown>();
named.set(':min', 40);
const q = db.prepare('SELECT id, name, age, score, avatar FROM people WHERE age >= :min ORDER BY age');
console.log(q.columns());
for (const r of q.all([], named)) console.log(r.number('id'), r.text('name'), r.number('age'), r.isNull('score'), r.get('score'), r.bytes('avatar'));
const one = db.prepare('SELECT name, age * 2 AS twice, typeof(score) AS t FROM people WHERE id = ?1').get([1]);
if (one !== null) console.log(one.text('name'), one.number('twice'), one.text('t'), one.get('missing') === null);
console.log(db.prepare('SELECT count(*) AS n FROM people').get() !== null, db.prepare('SELECT name FROM people WHERE id = ?').get([99]) === null);
console.log(db.prepare('SELECT name, age FROM people ORDER BY id').values());
console.log(db.prepare("SELECT 'é€' AS s, 2.5 AS f, 3 AS i, NULL AS n, x'00ff' AS b, 1 = 1 AS t").values());

// errors
for (const sql of ['SELEC 1', 'SELECT * FROM nope']) { try { db.prepare(sql); } catch (e) { console.log(e.name, e.message); } }
try { db.prepare('INSERT INTO people (name) VALUES (?)').run(['Ada']); } catch (e) { console.log(e.name, e.message); }
try { db.exec('INSERT INTO people (age) VALUES (1)'); } catch (e) { console.log(e.name, e.message); }

// transactions
const count = (): f64 => { const r = db.prepare('SELECT count(*) AS n FROM people').get(); return r === null ? -1 : r.number('n'); };
db.transaction(() => { db.exec("INSERT INTO people (name) VALUES ('Tx')"); console.log('inside', db.inTransaction, count()); });
try {
  db.transaction(() => { db.exec("INSERT INTO people (name) VALUES ('Rolled')"); throw new Error('abort'); });
} catch (e) { console.log('rolled back:', e.message, count(), db.inTransaction); }
const upd = db.prepare('UPDATE people SET age = age + 1 WHERE age > ?').run([50]);
console.log('updated', upd.changes);
db.close();
try { db.exec('SELECT 1'); } catch (e) { console.log(e.message); }

// a file database, reopened read-only
const path = fs.tmpdir() + '/zinc-sqlite-test.db';
fs.remove(path);
const f = new Database(path);
f.exec('CREATE TABLE kv (k TEXT PRIMARY KEY, v TEXT); INSERT INTO kv VALUES (\'a\', \'1\')');
f.close();
const ro = new Database(path, { readOnly: true });
const v = ro.prepare('SELECT v FROM kv WHERE k = ?').get(['a']);
console.log('file', v !== null ? v.text('v') : '');
try { ro.exec("INSERT INTO kv VALUES ('b', '2')"); } catch (e) { console.log(e.message); }
ro.close();
try { new Database(fs.tmpdir() + '/no/such/dir/x.db'); } catch (e) { console.log(e.name, e.message); }
console.log(fs.remove(path), Database.version().startsWith('3.'));
