// zinc:sqlite in a phone app (ZN-628): a database file in the app's writable directory, a row added at each start, read back.
import { Database } from 'zinc:sqlite';

const db = new Database('runs.db');
db.exec('CREATE TABLE IF NOT EXISTS runs (n INTEGER)');
db.prepare('INSERT INTO runs (n) VALUES (?)').run([1]);
const r = db.prepare('SELECT count(*) AS n, sqlite_version() AS v FROM runs').get();
if (r !== null) console.log('sqlite ' + r.text('v') + ': ' + r.number('n') + ' runs');
db.close();
