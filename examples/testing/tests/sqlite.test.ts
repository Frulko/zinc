// A failing check exits with 1 and fails the file (try changing the expected count).
import * as assert from 'zinc:assert';
import { Database } from 'zinc:sqlite';

const db = new Database();
db.exec('CREATE TABLE t (x INTEGER); INSERT INTO t VALUES (1), (2), (3)');
const r = db.prepare('SELECT count(*) AS n, sum(x) AS s FROM t').get();
assert.ok(r !== null);
if (r !== null) {
  assert.equal(r.number('n'), 3);
  assert.equal(r.number('s'), 6);
}
assert.throws(() => { db.exec('SELECT * FROM missing'); }, 'no such table');
db.close();
console.log('sqlite: ok');
