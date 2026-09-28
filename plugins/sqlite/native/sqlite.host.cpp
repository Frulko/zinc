// zinc:sqlite for macos and linux (rpi1 / rmpp include this file): the SQLite C API over handle tables.
// The amalgamation (vendor/sqlite3.c) is compiled as C next to the program (plugin.json sources).
#include "zinc_native_sqlite.h"
#include "../vendor/sqlite3.h"
#include <string.h>
#include <stdio.h>

static const int MAXDB = 64, MAXST = 1024;
static sqlite3* dbs[MAXDB];
static sqlite3_stmt* sts[MAXST];
static int st_db[MAXST];
static char err_msg[512];

static zrt::String str(const char* s) { return s ? zrt::String::from(s, (uint32_t)strlen(s)) : zrt::String::from("", 0); }
struct CStr { zrt::StrBuilder sb; CStr(const zrt::String& s) { zrt::to_s(sb, s); sb.ch('\0'); } const char* c() const { return sb.buf; } };
static void set_err(const char* m) { snprintf(err_msg, sizeof err_msg, "%s", m ? m : "unknown error"); }
static sqlite3* db_at(int32_t h) { return h >= 0 && h < MAXDB ? dbs[h] : nullptr; }
static sqlite3_stmt* st_at(int32_t h) { return h >= 0 && h < MAXST ? sts[h] : nullptr; }
static bool bind_ok(int32_t st, int rc) {
  if (rc == SQLITE_OK) return true;
  set_err(sqlite3_errmsg(sqlite3_db_handle(sts[st])));
  return false;
}

struct HostSqlite : NativeSqlite {
  int32_t open(zrt::String path, int32_t flags) override {
    int h = 0;
    while (h < MAXDB && dbs[h]) h++;
    if (h == MAXDB) { set_err("too many open databases"); return -1; }
    int f = (flags & 1) ? SQLITE_OPEN_READONLY : SQLITE_OPEN_READWRITE;
    if (!(flags & 1) && (flags & 4)) f |= SQLITE_OPEN_CREATE;
    CStr p(path);
    sqlite3* db = nullptr;
    int rc = sqlite3_open_v2(p.c(), &db, f | SQLITE_OPEN_URI, nullptr);
    if (rc != SQLITE_OK) { set_err(db ? sqlite3_errmsg(db) : sqlite3_errstr(rc)); sqlite3_close(db); return -1; }
    dbs[h] = db;
    return h;
  }
  void close(int32_t h) override {
    sqlite3* db = db_at(h);
    if (!db) return;
    for (int i = 0; i < MAXST; i++) if (sts[i] && st_db[i] == h) { sqlite3_finalize(sts[i]); sts[i] = nullptr; }
    sqlite3_close(db);
    dbs[h] = nullptr;
  }
  bool exec(int32_t h, zrt::String sql) override {
    sqlite3* db = db_at(h);
    if (!db) { set_err("database is closed"); return false; }
    CStr s(sql);
    char* e = nullptr;
    if (sqlite3_exec(db, s.c(), nullptr, nullptr, &e) != SQLITE_OK) { set_err(e ? e : sqlite3_errmsg(db)); sqlite3_free(e); return false; }
    return true;
  }
  zrt::String error() override { return str(err_msg); }
  double changes(int32_t h) override { sqlite3* db = db_at(h); return db ? (double)sqlite3_changes64(db) : 0; }
  double lastInsertRowid(int32_t h) override { sqlite3* db = db_at(h); return db ? (double)sqlite3_last_insert_rowid(db) : 0; }
  bool inTransaction(int32_t h) override { sqlite3* db = db_at(h); return db && !sqlite3_get_autocommit(db); }
  int32_t prepare(int32_t h, zrt::String sql) override {
    sqlite3* db = db_at(h);
    if (!db) { set_err("database is closed"); return -1; }
    int s = 0;
    while (s < MAXST && sts[s]) s++;
    if (s == MAXST) { set_err("too many prepared statements"); return -1; }
    sqlite3_stmt* st = nullptr;
    if (sqlite3_prepare_v2(db, sql.ptr(), (int)sql.bytes(), &st, nullptr) != SQLITE_OK) { set_err(sqlite3_errmsg(db)); return -1; }
    if (!st) { set_err("no SQL statement"); return -1; }
    sts[s] = st; st_db[s] = h;
    return s;
  }
  int32_t paramCount(int32_t st) override { sqlite3_stmt* s = st_at(st); return s ? sqlite3_bind_parameter_count(s) : 0; }
  int32_t paramIndex(int32_t st, zrt::String name) override { sqlite3_stmt* s = st_at(st); CStr n(name); return s ? sqlite3_bind_parameter_index(s, n.c()) : 0; }
  bool bindNull(int32_t st, int32_t i) override { sqlite3_stmt* s = st_at(st); return s && bind_ok(st, sqlite3_bind_null(s, i)); }
  bool bindDouble(int32_t st, int32_t i, double v) override { sqlite3_stmt* s = st_at(st); return s && bind_ok(st, sqlite3_bind_double(s, i, v)); }
  bool bindInt(int32_t st, int32_t i, double v) override { sqlite3_stmt* s = st_at(st); return s && bind_ok(st, sqlite3_bind_int64(s, i, (sqlite3_int64)v)); }
  bool bindText(int32_t st, int32_t i, zrt::String v) override { sqlite3_stmt* s = st_at(st); return s && bind_ok(st, sqlite3_bind_text(s, i, v.ptr(), (int)v.bytes(), SQLITE_TRANSIENT)); }
  bool bindBlob(int32_t st, int32_t i, zrt::Array<uint8_t> v) override {
    sqlite3_stmt* s = st_at(st);
    int32_t n = v.length();
    return s && bind_ok(st, sqlite3_bind_blob(s, i, n ? (const void*)v.a->data : "", n, SQLITE_TRANSIENT));
  }
  void clearBindings(int32_t st) override { if (sqlite3_stmt* s = st_at(st)) sqlite3_clear_bindings(s); }
  int32_t step(int32_t st) override {
    sqlite3_stmt* s = st_at(st);
    if (!s) { set_err("statement is finalized"); return 21; }
    int rc = sqlite3_step(s);
    if (rc != SQLITE_ROW && rc != SQLITE_DONE) set_err(sqlite3_errmsg(sqlite3_db_handle(s)));
    return rc;
  }
  void reset(int32_t st) override { if (sqlite3_stmt* s = st_at(st)) sqlite3_reset(s); }
  void finalize(int32_t st) override { if (sqlite3_stmt* s = st_at(st)) { sqlite3_finalize(s); sts[st] = nullptr; } }
  int32_t columnCount(int32_t st) override { sqlite3_stmt* s = st_at(st); return s ? sqlite3_column_count(s) : 0; }
  zrt::String columnName(int32_t st, int32_t i) override { sqlite3_stmt* s = st_at(st); return str(s ? sqlite3_column_name(s, i) : ""); }
  int32_t columnType(int32_t st, int32_t i) override { sqlite3_stmt* s = st_at(st); return s ? sqlite3_column_type(s, i) : SQLITE_NULL; }
  double columnDouble(int32_t st, int32_t i) override {
    sqlite3_stmt* s = st_at(st);
    if (!s) return 0;
    return sqlite3_column_type(s, i) == SQLITE_INTEGER ? (double)sqlite3_column_int64(s, i) : sqlite3_column_double(s, i);
  }
  zrt::String columnText(int32_t st, int32_t i) override {
    sqlite3_stmt* s = st_at(st);
    if (!s) return zrt::String();
    const unsigned char* t = sqlite3_column_text(s, i);
    return zrt::String::from((const char*)(t ? t : (const unsigned char*)""), (uint32_t)sqlite3_column_bytes(s, i));
  }
  zrt::Array<uint8_t> columnBlob(int32_t st, int32_t i) override {
    sqlite3_stmt* s = st_at(st);
    const void* b = s ? sqlite3_column_blob(s, i) : nullptr;
    int n = s ? sqlite3_column_bytes(s, i) : 0;
    zrt::Array<uint8_t> r = zrt::Array<uint8_t>::with_cap(n);
    if (n) { memcpy(r.a->data, b, (size_t)n); r.a->len = n; }
    return r;
  }
  zrt::String version() override { return str(sqlite3_libversion()); }
};

NativeSqlite* zinc_create_Sqlite() {
  static HostSqlite inst;
  inst.rc = zrt::IMMORTAL;
  return &inst;
}
