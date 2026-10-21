import { Database } from 'zinc:sqlite';
const db = new Database(':memory:');
db.exec("CREATE VIRTUAL TABLE search USING fts5(path UNINDEXED, title, body)");
const add = db.prepare('INSERT INTO search (path, title, body) VALUES (?, ?, ?)');
add.run(['a.md', 'Roadmap', 'Ship the editor before the summer']);
add.run(['b.md', 'Reading list', 'A book about editors and summers']);
for (const r of db.prepare("SELECT path, snippet(search, 2, '[', ']', '…', 6) AS s FROM search WHERE search MATCH ? ORDER BY rank").all(['"editor"*']))
  console.log(r.text('path'), r.text('s'));
