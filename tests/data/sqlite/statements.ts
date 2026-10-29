// zinc:sqlite statements are never collected: prepare() gives the same one for the same SQL, and when the native slots (1024) run out
// the one prepared longest ago gives its slot back and is prepared again at its next use (plugins/sqlite/index.ts).
import { Database } from 'zinc:sqlite';

const db = new Database();
db.exec('CREATE TABLE t (n INTEGER)');
let sum = 0;
for (let i = 0; i < 3000; i++) { db.prepare('INSERT INTO t (n) VALUES (?)').run([i]); sum += i; }
const total = db.prepare('SELECT sum(n) AS s FROM t').get();
console.log('same sql', total !== null && total.number('s') === sum, db.prepare('SELECT 1') === db.prepare('SELECT 1'));
const first = db.prepare('SELECT count(*) AS c FROM t WHERE n < ?');
for (let i = 0; i < 1500; i++) db.prepare(`SELECT ${i} AS v`).get();   // more distinct statements than slots
const again = first.get([10]);
console.log('evicted and prepared again', again !== null && again.number('c') === 10);
const f = db.prepare('SELECT 2');
f.finalize();
console.log('finalized leaves the cache', db.prepare('SELECT 2') !== f);
db.close();
const db2 = new Database();
console.log('slots given back at close', db2.prepare('SELECT 3 AS x').get() !== null);
