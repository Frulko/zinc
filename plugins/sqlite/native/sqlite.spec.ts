// zinc:sqlite native side: the SQLite C API over integer handles (databases and statements). The amalgamation is
// compiled into the program (vendor/sqlite3.c, public domain).
import { NativeModule, requireNative } from 'zinc:native';

export interface Spec extends NativeModule {
  /** flags: 1 read-only, 2 read-write, 4 create (SQLITE_OPEN_*). A handle, or -1 (see error()). */
  open(path: string, flags: i32): i32;
  close(db: i32): void;
  /** Runs one or more statements without results; false on error (see error()). */
  exec(db: i32, sql: string): boolean;
  /** The last error message (sqlite3_errmsg or a Zinc-side reason). */
  error(): string;
  changes(db: i32): f64;
  lastInsertRowid(db: i32): f64;
  inTransaction(db: i32): boolean;
  /** A statement handle, or -1 (see error()). */
  prepare(db: i32, sql: string): i32;
  paramCount(st: i32): i32;
  /** 1-based index of a named parameter (':name', '@name', '$name'), 0 when absent. */
  paramIndex(st: i32, name: string): i32;
  bindNull(st: i32, i: i32): boolean;
  bindDouble(st: i32, i: i32, v: f64): boolean;
  /** Integers up to 2^53 (a double holding an integer is bound as INTEGER). */
  bindInt(st: i32, i: i32, v: f64): boolean;
  bindText(st: i32, i: i32, v: string): boolean;
  bindBlob(st: i32, i: i32, v: u8[]): boolean;
  clearBindings(st: i32): void;
  /** 100 row, 101 done, anything else an error (see error()). */
  step(st: i32): i32;
  reset(st: i32): void;
  finalize(st: i32): void;
  columnCount(st: i32): i32;
  columnName(st: i32, i: i32): string;
  /** 1 integer, 2 float, 3 text, 4 blob, 5 null */
  columnType(st: i32, i: i32): i32;
  columnDouble(st: i32, i: i32): f64;
  columnText(st: i32, i: i32): string;
  columnBlob(st: i32, i: i32): u8[];
  version(): string;
}
export default requireNative<Spec>('Sqlite');
