// zinc:sqlite — SQLite 3 databases (docs/plugins/sqlite.md), shaped like node:sqlite / txiki's tjs:sqlite:
// new Database(path), exec, prepare -> Statement.run / get / all / values, transactions. Parameters are positional
// (`?`, `?NNN`) or named (`:name`, `@name`, `$name` through a Map); values go in and out as `unknown`: null, number
// (an integer-valued number binds as INTEGER), string, boolean (0 / 1) or a zinc:web Blob (BLOB).
import S from './native/sqlite.spec';
import { Blob } from 'zinc:web';
import { devDatabaseOpened, devDatabaseClosed } from 'zinc:devhooks';

export class SqliteError extends Error {
  constructor(message: string) { super(message); this.name = 'SqliteError'; }
}
function fail(): SqliteError { return new SqliteError(S.error()); }

export class RunResult {
  changes: f64; lastInsertRowid: f64;
  constructor(c: f64, r: f64) { this.changes = c; this.lastInsertRowid = r; }
}
/** One result row: values in column order, looked up by name. */
export class Row {
  readonly columns: string[];
  readonly values: unknown[];
  constructor(columns: string[], values: unknown[]) { this.columns = columns; this.values = values; }
  /** The value of a column (null for SQL NULL, and for an unknown column). */
  get(name: string): unknown { const i = this.columns.indexOf(name); return i < 0 ? null : this.values[i]; }
  isNull(name: string): boolean { return this.get(name) === null; }
  /** A text or number column as a string ('' for NULL). */
  text(name: string): string {
    const v = this.get(name);
    if (typeof v === 'string') return v;
    if (typeof v === 'number') return `${v}`;
    return '';
  }
  /** A number column (0 for NULL or text). */
  number(name: string): f64 { const v = this.get(name); return typeof v === 'number' ? v : 0; }
  /** A BLOB column's bytes ([] otherwise). */
  bytes(name: string): u8[] { const v = this.get(name); return v instanceof Blob ? v.data.slice() : []; }
}

const EVICTED: i32 = -2;

export class Statement {
  private h: i32;
  private db: Database;
  readonly sql: string;
  constructor(db: Database, h: i32, sql: string) { this.db = db; this.h = h; this.sql = sql; }
  private live(): i32 {
    if (this.h === EVICTED) this.h = this.db.slot(this.sql);   // its slot was given back: prepared again
    if (this.h < 0) throw new SqliteError('statement is finalized');
    return this.h;
  }
  /** Gives its native slot back while it rests (the slots ran out); the next call prepares it again. False when it has none. */
  evict(): boolean { if (this.h < 0) return false; S.finalize(this.h); this.h = EVICTED; return true; }
  private bind(params: unknown[], named: Map<string, unknown> | null): void {
    const h = this.live();
    S.reset(h);
    S.clearBindings(h);
    for (let i = 0; i < params.length; i++) this.bindOne(h, i + 1, params[i]);
    if (named !== null) named.forEach((v: unknown, k: string) => {
      const i = S.paramIndex(h, k);
      if (i === 0) throw new SqliteError(`no such parameter: ${k}`);
      this.bindOne(h, i, v);
    });
  }
  private bindOne(h: i32, i: i32, v: unknown): void {
    let ok = true;
    if (v === null || v === undefined) ok = S.bindNull(h, i);
    else if (typeof v === 'number') ok = Number.isInteger(v) && Math.abs(v) <= Number.MAX_SAFE_INTEGER ? S.bindInt(h, i, v) : S.bindDouble(h, i, v);
    else if (typeof v === 'string') ok = S.bindText(h, i, v);
    else if (typeof v === 'boolean') ok = S.bindInt(h, i, v ? 1 : 0);
    else if (v instanceof Blob) ok = S.bindBlob(h, i, v.data);
    else throw new TypeError(`SQLite parameter ${i}: unsupported value (null, number, string, boolean or Blob)`);
    if (!ok) throw fail();
  }
  /** Column names of the result. */
  columns(): string[] { const h = this.live(); const n = S.columnCount(h); const r: string[] = []; for (let i = 0; i < n; i++) r.push(S.columnName(h, i)); return r; }
  private value(h: i32, i: i32): unknown {
    const t = S.columnType(h, i);
    if (t === 1 || t === 2) { const d: unknown = S.columnDouble(h, i); return d; }
    if (t === 3) { const s: unknown = S.columnText(h, i); return s; }
    if (t === 4) { const b: unknown = Blob.fromBytes(S.columnBlob(h, i)); return b; }
    return null;
  }
  /** Up to `max` rows (-1: all). The statement is reset after them, unless `more` and `max` rows came: the next call goes on. */
  rows(max: i32, more: boolean = false): unknown[][] {
    const h = this.live();
    const out: unknown[][] = [];
    const n = S.columnCount(h);
    while (max < 0 || out.length < max) {
      const rc = S.step(h);
      if (rc === 101) break;
      if (rc !== 100) { const e = fail(); S.reset(h); throw e; }
      const r: unknown[] = [];
      for (let i = 0; i < n; i++) r.push(this.value(h, i));
      out.push(r);
    }
    if (!more || out.length < max) S.reset(h);
    return out;
  }
  /** Runs the statement; changes and the last inserted rowid. @throws SqliteError */
  run(params: unknown[] = [], named: Map<string, unknown> | null = null): RunResult {
    this.bind(params, named);
    this.rows(-1);
    return new RunResult(S.changes(this.db.handle()), S.lastInsertRowid(this.db.handle()));
  }
  /** Every row. @throws SqliteError */
  all(params: unknown[] = [], named: Map<string, unknown> | null = null): Row[] {
    this.bind(params, named);
    const cols = this.columns();
    return this.rows(-1).map((v: unknown[]) => new Row(cols, v));
  }
  /** The first row, or null. @throws SqliteError */
  get(params: unknown[] = [], named: Map<string, unknown> | null = null): Row | null {
    this.bind(params, named);
    const cols = this.columns();
    const r = this.rows(1);
    return r.length === 0 ? null : new Row(cols, r[0]);
  }
  /** Every row as an array of values. @throws SqliteError */
  values(params: unknown[] = [], named: Map<string, unknown> | null = null): unknown[][] {
    this.bind(params, named);
    return this.rows(-1);
  }
  /** The rows a batch at a time (`Cursor.next`), as better-sqlite3's iterate(): a long read that lets the event loop run between batches.
   *  The cursor has its own native statement, so the same SQL run meanwhile does not disturb it. @throws SqliteError */
  cursor(params: unknown[] = [], named: Map<string, unknown> | null = null): Cursor {
    const own = new Statement(this.db, this.db.slot(this.sql), this.sql);
    own.bind(params, named);
    return new Cursor(own);
  }
  finalize(): void { if (this.h >= 0) S.finalize(this.h); this.h = -1; this.db.forget(this); }
}

/** A query read a batch at a time (Statement.cursor). */
export class Cursor {
  private st: Statement;
  /** True once the last row was read (the native statement is then freed). */
  done: boolean = false;
  constructor(st: Statement) { this.st = st; }
  /** The next rows (at most `max`) as arrays of values, in column order; fewer than `max` only at the end. @throws SqliteError */
  next(max: i32): unknown[][] {
    if (this.done) return [];
    let r: unknown[][] = [];
    try { r = this.st.rows(max, true); } catch (e) { this.close(); throw e; }
    if (r.length < max) this.close();
    return r;
  }
  /** Frees the native statement before the end. */
  close(): void { if (!this.done) { this.done = true; this.st.finalize(); } }
}

export interface DatabaseOptions { readOnly?: boolean; create?: boolean }
export class Database {
  private h: i32;
  readonly path: string;
  /** The statements by SQL text: prepare() gives the same one again, so `db.prepare(sql).get()` in a loop holds one native statement,
   *  not one per call (statements are never collected). When the native slots run out, the statement prepared longest ago gives its
   *  slot back and is prepared again at its next use. */
  private statements: Map<string, Statement> = new Map<string, Statement>();
  /** Opens (and creates, unless create: false) a database file; ':memory:' for a private in-memory one.
   *  @throws SqliteError */
  constructor(path: string = ':memory:', options: DatabaseOptions = {}) {
    this.path = path;
    const ro = options.readOnly ?? false;
    const h = S.open(path, ro ? 1 : 2 | ((options.create ?? true) ? 4 : 0));
    if (h < 0) throw fail();
    this.h = h;
    this.dev = devDatabaseOpened(path, (sql: string, max: i32, write: boolean): string => this.inspect(sql, max, write));
  }
  private dev: i32 = 0;
  /** The inspector's query (zinc:devhooks, dev runs): rows as JSON, writes refused by SQLite itself (PRAGMA query_only) unless `write`. */
  private inspect(sql: string, max: i32, write: boolean): string {
    const cell = (v: unknown): string => v === null ? 'null' : typeof v === 'number' ? (isFinite(v) ? `${v}` : 'null') : typeof v === 'string' ? JSON.stringify(v) :
      v instanceof Blob ? JSON.stringify(`<blob ${v.data.length} bytes>`) : 'null';
    let st: Statement | null = null;
    try {
      if (!write) this.exec('PRAGMA query_only = 1');
      st = new Statement(this, this.slot(sql), sql);   // its own: finalized below without touching the program's cached statements
      const cols = (st as Statement).columns();
      const rows = (st as Statement).values().slice(0, max);
      (st as Statement).finalize();
      if (!write) this.exec('PRAGMA query_only = 0');
      return `{"columns":[${cols.map((c: string) => JSON.stringify(c)).join(',')}],"rows":[${rows.map((r: unknown[]) => '[' + r.map(cell).join(',') + ']').join(',')}],"changes":${S.changes(this.h)}}`;
    } catch (e) {
      if (st !== null) (st as Statement).finalize();
      if (!write && this.h >= 0) this.exec('PRAGMA query_only = 0');
      return `{"error":${JSON.stringify((e as Error).message)}}`;
    }
  }
  handle(): i32 { if (this.h < 0) throw new SqliteError('database is closed'); return this.h; }
  get isOpen(): boolean { return this.h >= 0; }
  get inTransaction(): boolean { return this.h >= 0 && S.inTransaction(this.h); }
  /** Runs SQL without results (several statements allowed). @throws SqliteError */
  exec(sql: string): void { if (!S.exec(this.handle(), sql)) throw fail(); }
  /** @throws SqliteError on a syntax error */
  prepare(sql: string): Statement {
    const known = this.statements.get(sql);
    if (known !== undefined) return known as Statement;
    const st = new Statement(this, this.slot(sql), sql);
    this.statements.set(sql, st);
    return st;
  }
  /** A native statement for `sql`, giving back the slots of statements at rest when there are none left. @throws SqliteError */
  slot(sql: string): i32 {
    for (;;) {
      const h = S.prepare(this.handle(), sql);
      if (h >= 0) return h;
      const e = fail();
      if (e.message !== 'too many prepared statements') throw e;
      let freed = false;
      for (const k of Array.from(this.statements.keys())) {
        const st = this.statements.get(k) as Statement;
        this.statements.delete(k);   // to the end of the order: the next eviction takes another
        this.statements.set(k, st);
        if (st.evict()) { freed = true; break; }
      }
      if (!freed) throw e;
    }
  }
  /** A finalized statement leaves the cache. */
  forget(st: Statement): void { if (this.statements.get(st.sql) === st) this.statements.delete(st.sql); }
  /** BEGIN, fn, COMMIT; ROLLBACK (and rethrow) when fn throws. */
  transaction(fn: () => void): void {
    this.exec('BEGIN');
    try {
      fn();
      this.exec('COMMIT');
    } catch (e) {
      if (this.inTransaction) this.exec('ROLLBACK');
      throw e;
    }
  }
  close(): void {
    if (this.h < 0) return;
    for (const st of Array.from(this.statements.values())) st.finalize();
    S.close(this.h);
    this.h = -1;
    devDatabaseClosed(this.dev);
  }
  /** Version of the SQLite library (the bundled amalgamation natively, Node's on the sim). */
  static version(): string { return S.version(); }
}
