// zinc:sqlite on the sim target: node:sqlite (DatabaseSync) behind the same handle API as sqlite.host.cpp. Node has no
// step / bind-by-index API, so parameters are collected per statement and bound when the first step runs (their names
// come from a small scan of the SQL, the way SQLite numbers them).
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const warn = process.emitWarning;
process.emitWarning = (() => {}) as typeof process.emitWarning;  // node:sqlite is still flagged experimental
const { DatabaseSync } = require('node:sqlite');
process.emitWarning = warn;

interface Stmt { db: number; s: any; params: string[]; vals: unknown[]; it: any; row: unknown[] | null }
const dbs: (any | null)[] = [];
const sts: (Stmt | null)[] = [];
let err = '';

/** SQLite's parameter numbering: `?` takes the next index, `?NNN` that index, a name its first index. */
function paramNames(sql: string): string[] {
  const names: string[] = [];
  let i = 0;
  while (i < sql.length) {
    const c = sql[i];
    if (c === "'" || c === '"' || c === '`' || c === '[') { const end = c === '[' ? ']' : c; i = sql.indexOf(end, i + 1); if (i < 0) break; i++; continue; }
    if (c === '-' && sql[i + 1] === '-') { i = sql.indexOf('\n', i); if (i < 0) break; continue; }
    if (c === '/' && sql[i + 1] === '*') { i = sql.indexOf('*/', i + 2); if (i < 0) break; i += 2; continue; }
    if (c === '?') {
      let j = i + 1; while (j < sql.length && /[0-9]/.test(sql[j])) j++;
      if (j > i + 1) { const n = Number(sql.slice(i + 1, j)); while (names.length < n) names.push(''); names[n - 1] = '?' + n; }
      else names.push('');
      i = j; continue;
    }
    if (c === ':' || c === '@' || c === '$') {
      let j = i + 1; while (j < sql.length && /[A-Za-z0-9_]/.test(sql[j])) j++;
      if (j > i + 1) { const n = sql.slice(i, j); if (!names.includes(n)) names.push(n); i = j; continue; }
    }
    i++;
  }
  return names;
}
const st = (h: number): Stmt | null => (h >= 0 && h < sts.length ? sts[h] : null);
function start(x: Stmt): void {
  const anon: unknown[] = [], named: Record<string, unknown> = {};
  let hasNamed = false;
  x.params.forEach((n, i) => {
    const v = x.vals[i] === undefined ? null : x.vals[i];
    if (n === '' || n.startsWith('?')) anon.push(v); else { named[n] = v; hasNamed = true; }
  });
  x.it = hasNamed ? x.s.iterate(named, ...anon) : x.s.iterate(...anon);
}

export default {
  open(path: string, flags: number): number {
    try {
      const d = new DatabaseSync(path, { readOnly: (flags & 1) !== 0, open: true });
      let h = dbs.indexOf(null); if (h < 0) { h = dbs.length; dbs.push(null); }
      dbs[h] = d;
      return h;
    } catch (e: any) { err = e.message.includes('unable to open') ? 'unable to open database file' : e.message; return -1; }
  },
  close(h: number): void {
    const d = dbs[h]; if (!d) return;
    sts.forEach((x, i) => { if (x && x.db === h) sts[i] = null; });
    d.close(); dbs[h] = null;
  },
  exec(h: number, sql: string): boolean {
    const d = dbs[h]; if (!d) { err = 'database is closed'; return false; }
    try { d.exec(sql); return true; } catch (e: any) { err = e.message; return false; }
  },
  error(): string { return err; },
  changes(h: number): number { const d = dbs[h]; return d ? Number(d.prepare('SELECT changes() AS c').get().c) : 0; },
  lastInsertRowid(h: number): number { const d = dbs[h]; return d ? Number(d.prepare('SELECT last_insert_rowid() AS r').get().r) : 0; },
  inTransaction(h: number): boolean { const d = dbs[h]; return !!d && d.isTransaction; },
  prepare(h: number, sql: string): number {
    const d = dbs[h]; if (!d) { err = 'database is closed'; return -1; }
    try {
      const s = d.prepare(sql);
      s.setReturnArrays(true); s.setReadBigInts(true);
      let i = sts.indexOf(null); if (i < 0) { i = sts.length; sts.push(null); }
      sts[i] = { db: h, s, params: paramNames(sql), vals: [], it: null, row: null };
      return i;
    } catch (e: any) { err = e.message; return -1; }
  },
  paramCount(h: number): number { return st(h)?.params.length ?? 0; },
  paramIndex(h: number, name: string): number { const x = st(h); return x ? x.params.indexOf(name) + 1 : 0; },
  bindNull(h: number, i: number): boolean { const x = st(h); if (!x) return false; x.vals[i - 1] = null; return true; },
  bindDouble(h: number, i: number, v: number): boolean { const x = st(h); if (!x) return false; x.vals[i - 1] = v; return true; },
  bindInt(h: number, i: number, v: number): boolean { const x = st(h); if (!x) return false; x.vals[i - 1] = BigInt(Math.trunc(v)); return true; },
  bindText(h: number, i: number, v: string): boolean { const x = st(h); if (!x) return false; x.vals[i - 1] = v; return true; },
  bindBlob(h: number, i: number, v: number[]): boolean { const x = st(h); if (!x) return false; x.vals[i - 1] = Uint8Array.from(v); return true; },
  clearBindings(h: number): void { const x = st(h); if (x) x.vals = []; },
  step(h: number): number {
    const x = st(h); if (!x) { err = 'statement is finalized'; return 21; }
    try {
      if (!x.it) start(x);
      const r = x.it.next();
      if (r.done) { x.row = null; return 101; }
      x.row = r.value;
      return 100;
    } catch (e: any) { err = e.message; x.row = null; return e.errcode ?? 1; }
  },
  reset(h: number): void { const x = st(h); if (x) { x.it?.return?.(); x.it = null; x.row = null; } },
  finalize(h: number): void { if (st(h)) sts[h] = null; },
  columnCount(h: number): number { const x = st(h); return x ? x.s.columns().length : 0; },
  columnName(h: number, i: number): string { const x = st(h); return x ? x.s.columns()[i]?.name ?? '' : ''; },
  columnType(h: number, i: number): number {
    const v = st(h)?.row?.[i];
    return typeof v === 'bigint' ? 1 : typeof v === 'number' ? 2 : typeof v === 'string' ? 3 : v instanceof Uint8Array ? 4 : 5;
  },
  columnDouble(h: number, i: number): number { const v = st(h)?.row?.[i]; return typeof v === 'bigint' || typeof v === 'number' ? Number(v) : 0; },
  columnText(h: number, i: number): string { const v = st(h)?.row?.[i]; return v === null || v === undefined ? '' : v instanceof Uint8Array ? Buffer.from(v).toString() : String(v); },
  columnBlob(h: number, i: number): number[] { const v = st(h)?.row?.[i]; return v instanceof Uint8Array ? Array.from(v) : typeof v === 'string' ? Array.from(Buffer.from(v)) : []; },
  version(): string { return process.versions.sqlite ?? ''; },
};
