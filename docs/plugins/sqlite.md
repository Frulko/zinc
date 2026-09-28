# sqlite plugin (`zinc:sqlite`)

This plugin gives SQLite 3 databases, shaped like `node:sqlite` and txiki's `tjs:sqlite`.

- **Native.** The public-domain amalgamation, version 3.53.4, is compiled into the program:
  `plugins/sqlite/vendor/sqlite3.c`. It is built as a C library next to the program with `SQLITE_THREADSAFE=0` and
  without extension loading. It adds about 1 MiB to the executable.
- **Sim.** Node's `node:sqlite` stands in.
- **Targets and `requires`.** Targets are macos, linux, rpi1 and rmpp. `requires` is `fs` and `heap>=4M`.
- **Test.** `tests/conformance/sqlite.ts`.

```ts
import { Database, Row } from 'zinc:sqlite';

const db = new Database('app.db');            // ':memory:' by default; { readOnly: true }, { create: false }
db.exec('CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY, text TEXT, stars REAL)');
const add = db.prepare('INSERT INTO notes (text, stars) VALUES (?, ?)');
console.log(add.run(['first', 4.5]).lastInsertRowid);
for (const r of db.prepare('SELECT id, text FROM notes WHERE stars > ?').all([3]))
  console.log(r.number('id'), r.text('text'));
db.transaction(() => { add.run(['a', 1]); add.run(['b', 2]); });   // ROLLBACK when the function throws
db.close();
```

## API

| API | |
|---|---|
| `new Database(path = ':memory:', { readOnly?, create? })` | Throws `SqliteError` (for example `unable to open database file`). |
| `db.exec(sql)` | Runs one or more statements without results. |
| `db.prepare(sql): Statement` | Throws on a syntax error, with SQLite's message. |
| `db.transaction(fn)` | Runs `BEGIN`, then `fn`, then `COMMIT`. When `fn` throws: `ROLLBACK` and rethrow. |
| `db.inTransaction`, `db.isOpen`, `db.close()`, `Database.version()` | |
| `stmt.run(params?, named?)` | Returns `RunResult { changes, lastInsertRowid }`. |
| `stmt.all(params?, named?)` | Returns `Row[]`. |
| `stmt.get(params?, named?)` | Returns `Row \| null`. |
| `stmt.values(params?, named?)` | Returns `unknown[][]`. |
| `stmt.columns()`, `stmt.finalize()` | |
| `row.get(name): unknown`, `row.text(name)`, `row.number(name)`, `row.bytes(name)`, `row.isNull(name)`, `row.columns`, `row.values` | |

## Parameters and values

- **Positional parameters.** Use `?` or `?NNN`, bound from the `params` array.
- **Named parameters.** Use `:name`, `@name` or `$name`, bound from a `Map<string, unknown>`:
  `named.set(':min', 40)`.
- **Binding.** Values are `null`, `number`, `string`, `boolean` (stored as 0 / 1) or a `Blob` (for BLOBs; build it
  with `Blob.fromBytes(bytes)`). An integer-valued number binds as `INTEGER`, any other number as `REAL`.
- **Reading.** `INTEGER` and `REAL` come back as `number`: 64-bit integers are exact up to 2^53. `TEXT` comes back as
  `string`, `BLOB` as a `Blob`, and `NULL` as `null`.

## Notes

- **Threads.** SQLite runs on the calling thread: a long query blocks the event loop. Keep queries short, or batch
  them in a transaction.
- **Library version.** The sim reports Node's SQLite version (3.51.2 with Node 24.14). Results are the same for
  standard SQL.
