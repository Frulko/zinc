// zinc:sqlite in the browser: the native side of plugins/sqlite/native/sqlite.spec.ts over the SQLite amalgamation compiled to WebAssembly (docs/targets/web.md,
// "Plugins"; web/sqlite_web.c is its only own C). The calls are the C API's, so they stay synchronous as they are on a desktop. A database lives in memory;
// one opened with a path other than ':memory:' is saved after each write (debounced) as the bytes of sqlite3_serialize under that path in localStorage and loaded
// again by the next open of it, up to about 3 MB (a bigger one is not saved, with a warning once). index.ts runs unchanged.
const Z = globalThis.__zincWeb;
const g = globalThis;
let ex = null, lastError = '', warned = false;
const dbs = [], sts = [];
const enc = new TextEncoder(), dec = new TextDecoder();
const SQLITE_TRANSIENT = -1;

function api() { if (!ex) ex = Z.wasmInstance('sqlite').exports; return ex; }
const m8 = () => new Uint8Array(ex.memory.buffer);
function alloc(bytes) { const p = ex.malloc(bytes.length + 1); const m = m8(); m.set(bytes, p); m[p + bytes.length] = 0; return p; }
function cstr(s) { return alloc(enc.encode(s)); }
function read(p, n) { if (!p) return ''; const a = m8(); if (n === undefined) { let e = p; while (a[e]) e++; n = e - p; } return dec.decode(a.subarray(p, p + n)); }
function withStr(s, f) { const p = cstr(s); try { return f(p); } finally { ex.free(p); } }
const fail = (db) => { lastError = db ? read(ex.sqlite3_errmsg(db.ptr)) : 'no such database'; };

function save(db) {
  db.timer = 0;
  if (!db.key || !db.ptr) return;
  const out = ex.malloc(8);
  const p = withStr('main', (name) => ex.sqlite3_serialize(db.ptr, name, out, 0));
  const size = Number(new DataView(ex.memory.buffer).getBigUint64(out, true));
  ex.free(out);
  if (!p) return;
  try {
    if (size > 3 << 20) { if (!warned) { warned = true; console.warn(`zinc:sqlite: ${db.key} is ${size} bytes: too big to keep in localStorage, it is not saved`); } }
    else { const bytes = m8().slice(p, p + size); let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); g.localStorage.setItem(db.key, g.btoa(s)); }
  } catch (e) { if (!warned) { warned = true; console.warn('zinc:sqlite: cannot save ' + db.key + ': ' + e); } }
  ex.sqlite3_free(p);
}
const dirty = (db) => { if (db && db.key && !db.timer) db.timer = g.setTimeout(() => save(db), 250); };
function restore(db) {
  let b64 = null;
  try { b64 = g.localStorage.getItem(db.key); } catch { return; }
  if (!b64) return;
  const s = g.atob(b64), n = s.length, p = ex.sqlite3_malloc64(BigInt(n));
  const m = m8();
  for (let i = 0; i < n; i++) m[p + i] = s.charCodeAt(i);
  withStr('main', (name) => ex.sqlite3_deserialize(db.ptr, name, p, BigInt(n), BigInt(n), 1 | 2));   // SQLITE_DESERIALIZE_FREEONCLOSE | RESIZEABLE
}
g.addEventListener('pagehide', () => { for (const d of dbs) if (d && d.timer) { g.clearTimeout(d.timer); save(d); } });

Z.registerNative('Sqlite', {
  open(path, flags) {
    api();
    const out = ex.malloc(4);
    const rc = withStr(':memory:', (name) => ex.sqlite3_open_v2(name, out, 2 | 4, 0));   // read-write and create: the page keeps the rest
    const ptr = new DataView(ex.memory.buffer).getUint32(out, true);
    ex.free(out);
    if (rc !== 0) { lastError = ptr ? read(ex.sqlite3_errmsg(ptr)) : 'out of memory'; if (ptr) ex.sqlite3_close(ptr); return -1; }
    const db = { ptr, key: path === ':memory:' || path === '' ? '' : 'zinc:sqlite:' + path, timer: 0 };
    dbs.push(db);
    if (db.key) restore(db);
    return dbs.length - 1;
  },
  close(h) { const db = dbs[h]; if (!db) return; if (db.timer) { g.clearTimeout(db.timer); save(db); } ex.sqlite3_close(db.ptr); db.ptr = 0; dbs[h] = null; },
  exec(h, sql) {
    const db = dbs[h]; if (!db) { lastError = 'no such database'; return false; }
    const rc = withStr(sql, (p) => ex.sqlite3_exec(db.ptr, p, 0, 0, 0));
    if (rc !== 0) { fail(db); return false; }
    dirty(db); return true;
  },
  error() { return lastError; },
  changes(h) { const db = dbs[h]; return db ? ex.sqlite3_changes(db.ptr) : 0; },
  lastInsertRowid(h) { const db = dbs[h]; return db ? Number(ex.sqlite3_last_insert_rowid(db.ptr)) : 0; },
  inTransaction(h) { const db = dbs[h]; return !!db && ex.sqlite3_get_autocommit(db.ptr) === 0; },
  prepare(h, sql) {
    const db = dbs[h]; if (!db) { lastError = 'no such database'; return -1; }
    const out = ex.malloc(4);
    const rc = withStr(sql, (p) => ex.sqlite3_prepare_v2(db.ptr, p, -1, out, 0));
    const st = new DataView(ex.memory.buffer).getUint32(out, true);
    ex.free(out);
    if (rc !== 0 || !st) { fail(db); return -1; }
    sts.push({ ptr: st, db }); return sts.length - 1;
  },
  paramCount(s) { return sts[s] ? ex.sqlite3_bind_parameter_count(sts[s].ptr) : 0; },
  paramIndex(s, name) { return sts[s] ? withStr(name, (p) => ex.sqlite3_bind_parameter_index(sts[s].ptr, p)) : 0; },
  bindNull(s, i) { return !!sts[s] && ex.sqlite3_bind_null(sts[s].ptr, i) === 0; },
  bindDouble(s, i, v) { return !!sts[s] && ex.sqlite3_bind_double(sts[s].ptr, i, v) === 0; },
  bindInt(s, i, v) { return !!sts[s] && ex.sqlite3_bind_int64(sts[s].ptr, i, BigInt(Math.trunc(v))) === 0; },
  bindText(s, i, v) { if (!sts[s]) return false; const b = enc.encode(v), p = alloc(b); const rc = ex.sqlite3_bind_text(sts[s].ptr, i, p, b.length, SQLITE_TRANSIENT); ex.free(p); return rc === 0; },
  bindBlob(s, i, v) { if (!sts[s]) return false; const p = alloc(Uint8Array.from(v)); const rc = ex.sqlite3_bind_blob(sts[s].ptr, i, p, v.length, SQLITE_TRANSIENT); ex.free(p); return rc === 0; },
  clearBindings(s) { if (sts[s]) ex.sqlite3_clear_bindings(sts[s].ptr); },
  step(s) {
    const st = sts[s]; if (!st) return 21;
    const rc = ex.sqlite3_step(st.ptr);
    if (rc !== 100 && rc !== 101) fail(st.db); else if (rc === 101 && !ex.sqlite3_stmt_readonly(st.ptr)) dirty(st.db);
    return rc;
  },
  reset(s) { if (sts[s]) ex.sqlite3_reset(sts[s].ptr); },
  finalize(s) { if (sts[s]) { ex.sqlite3_finalize(sts[s].ptr); sts[s] = null; } },
  columnCount(s) { return sts[s] ? ex.sqlite3_column_count(sts[s].ptr) : 0; },
  columnName(s, i) { return sts[s] ? read(ex.sqlite3_column_name(sts[s].ptr, i)) : ''; },
  columnType(s, i) { return sts[s] ? ex.sqlite3_column_type(sts[s].ptr, i) : 5; },
  columnDouble(s, i) { return sts[s] ? ex.sqlite3_column_double(sts[s].ptr, i) : 0; },
  columnText(s, i) { if (!sts[s]) return ''; const p = ex.sqlite3_column_text(sts[s].ptr, i); return read(p, ex.sqlite3_column_bytes(sts[s].ptr, i)); },
  columnBlob(s, i) { if (!sts[s]) return []; const p = ex.sqlite3_column_blob(sts[s].ptr, i), n = ex.sqlite3_column_bytes(sts[s].ptr, i); return p ? Array.from(m8().subarray(p, p + n)) : []; },
  version() { api(); return read(ex.sqlite3_libversion()); },
}, ['wasm']);
