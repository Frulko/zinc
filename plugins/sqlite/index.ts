// zinc:sqlite — SQLite 3 databases (docs/plugins/sqlite.md), shaped like node:sqlite / txiki's tjs:sqlite:
// new Database(path), exec, prepare -> Statement.run / get / all / values, transactions. Parameters are positional
// (`?`, `?NNN`) or named (`:name`, `@name`, `$name` through a Map); values go in and out as `unknown`: null, number
// (an integer-valued number binds as INTEGER), string, boolean (0 / 1) or a zinc:web Blob (BLOB).
import S from './native/sqlite.spec';
import { Blob } from 'zinc:web';

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

export class Statement {
  private h: i32;
  private db: Database;
  readonly sql: string;
  constructor(db: Database, h: i32, sql: string) { this.db = db; this.h = h; this.sql = sql; }
  private live(): i32 { if (this.h < 0) throw new SqliteError('statement is finalized'); return this.h; }
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
  private rows(max: i32): unknown[][] {
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
    S.reset(h);
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
  finalize(): void { if (this.h >= 0) { S.finalize(this.h); this.h = -1; } }
}

export interface DatabaseOptions { readOnly?: boolean; create?: boolean }
export class Database {
  private h: i32;
  readonly path: string;
  /** Opens (and creates, unless create: false) a database file; ':memory:' for a private in-memory one.
   *  @throws SqliteError */
  constructor(path: string = ':memory:', options: DatabaseOptions = {}) {
    this.path = path;
    const ro = options.readOnly ?? false;
    const h = S.open(path, ro ? 1 : 2 | ((options.create ?? true) ? 4 : 0));
    if (h < 0) throw fail();
    this.h = h;
  }
  handle(): i32 { if (this.h < 0) throw new SqliteError('database is closed'); return this.h; }
  get isOpen(): boolean { return this.h >= 0; }
  get inTransaction(): boolean { return this.h >= 0 && S.inTransaction(this.h); }
  /** Runs SQL without results (several statements allowed). @throws SqliteError */
  exec(sql: string): void { if (!S.exec(this.handle(), sql)) throw fail(); }
  /** @throws SqliteError on a syntax error */
  prepare(sql: string): Statement {
    const st = S.prepare(this.handle(), sql);
    if (st < 0) throw fail();
    return new Statement(this, st, sql);
  }
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
  close(): void { if (this.h >= 0) { S.close(this.h); this.h = -1; } }
  /** Version of the SQLite library (the bundled amalgamation natively, Node's on the sim). */
  static version(): string { return S.version(); }
}
