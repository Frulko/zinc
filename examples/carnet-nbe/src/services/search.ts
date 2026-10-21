// Search, as Obsidian's: the words of every note in an SQLite FTS5 index (zinc:sqlite), in the vault's `.carnet/index.sqlite` for
// the window that serves it (other programs can query it too), in memory for a window that joined. A note changed since the
// last search is indexed again when someone searches.
import { Database, Statement, Row } from 'zinc:sqlite';
import { Page, Block, titleOf, pageWithId, onPageChanged, onPageOpened, onPageRemoved, onPageMoved } from '../state';

let db: Database | null = null;
let put: Statement | null = null, drop: Statement | null = null, find: Statement | null = null;
const dirty = new Set<Page>();
const gone = new Set<string>();

onPageOpened((p: Page) => dirty.add(p));
onPageChanged((p: Page) => dirty.add(p));
onPageMoved((p: Page, from: string) => dirty.add(p));
onPageRemoved((p: Page) => { dirty.delete(p); gone.add(p.id); });

/** Where the index lives: a file of the vault, or ':memory:' (the default). Called before the first search. */
export function openIndex(file: string): void {
  try { db = new Database(file); } catch (e) { console.log(`carnet: no index at ${file}: ${e}`); db = new Database(':memory:'); }
  const d = db as Database;
  d.exec('CREATE VIRTUAL TABLE IF NOT EXISTS notes USING fts5(id UNINDEXED, path UNINDEXED, title, body)');
  d.exec('DELETE FROM notes');   // the ids are this session's: the notes are indexed again as they open
  put = d.prepare('INSERT INTO notes (id, path, title, body) VALUES (?, ?, ?, ?)');
  drop = d.prepare('DELETE FROM notes WHERE id = ?');
  find = d.prepare("SELECT id, snippet(notes, 3, '', '', '…', 12) AS s FROM notes WHERE notes MATCH ? ORDER BY rank LIMIT 50");
}

function flush(): void {
  if (db === null) openIndex(':memory:');
  if (dirty.size === 0 && gone.size === 0) return;
  const d = db as Database;
  d.exec('BEGIN');
  for (const id of gone) (drop as Statement).run([id]);
  for (const p of dirty) {
    (drop as Statement).run([p.id]);
    (put as Statement).run([p.id, p.path(), titleOf(p), p.blocks().map((b: Block) => b.text()).join('\n')]);
  }
  d.exec('COMMIT');
  dirty.clear(); gone.clear();
}

/** A note that matches and the words around the match. */
export class Hit {
  p: Page; snippet: string;
  constructor(p: Page, snippet: string) { this.p = p; this.snippet = snippet; }
}
/** The notes with every word of `query` (as prefixes), best first. */
export function search(query: string): Hit[] {
  const words = query.trim().split(/\s+/).filter((w: string) => w !== '');
  if (words.length === 0) return [];
  flush();
  const out: Hit[] = [];
  for (const r of (find as Statement).all([words.map((w: string) => `"${w.replaceAll('"', '""')}"*`).join(' ')])) {
    const p = pageWithId((r as Row).text('id'));
    if (p !== null) out.push(new Hit(p, (r as Row).text('s').replaceAll('\n', ' ')));
  }
  return out;
}
