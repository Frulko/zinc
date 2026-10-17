/* zinc:sqlite in the browser (docs/targets/web.md, "Plugins"): the amalgamation (vendor/sqlite3.c) built for WebAssembly with no operating system layer.
 * A page has no files to open, so the one virtual file system is this stub, and every database is `:memory:`; web/sqlite.js saves and restores
 * a database as the bytes of sqlite3_serialize / sqlite3_deserialize (localStorage, per path). SQLITE_OS_OTHER makes the library ask for
 * sqlite3_os_init and sqlite3_os_end, which are all this file is. */
#include "sqlite3.h"

#include <string.h>
#include <time.h>

static int xOpen(sqlite3_vfs* v, sqlite3_filename n, sqlite3_file* f, int flags, int* out) { (void)v; (void)n; (void)f; (void)flags; (void)out; return SQLITE_CANTOPEN; }
static int xDelete(sqlite3_vfs* v, const char* n, int sync) { (void)v; (void)n; (void)sync; return SQLITE_OK; }
static int xAccess(sqlite3_vfs* v, const char* n, int flags, int* out) { (void)v; (void)n; (void)flags; *out = 0; return SQLITE_OK; }
static int xFullPathname(sqlite3_vfs* v, const char* n, int len, char* out) { (void)v; strncpy(out, n, (size_t)len); out[len - 1] = 0; return SQLITE_OK; }
static int xRandomness(sqlite3_vfs* v, int len, char* out) {
  (void)v;
  unsigned s = (unsigned)time(0) * 2654435761u;   /* SQLite only salts its temp names and rowids with it */
  for (int i = 0; i < len; i++) { s = s * 1103515245u + 12345u; out[i] = (char)(s >> 16); }
  return len;
}
static int xSleep(sqlite3_vfs* v, int us) { (void)v; return us; }
static int xCurrentTime(sqlite3_vfs* v, double* t) { (void)v; *t = 2440587.5 + (double)time(0) / 86400.0; return SQLITE_OK; }

static sqlite3_vfs stub = {1, 8, 512, 0, "zinc-web", 0, xOpen, xDelete, xAccess, xFullPathname, 0, 0, 0, 0, xRandomness, xSleep, xCurrentTime, 0, 0, 0, 0};
int sqlite3_os_init(void) { return sqlite3_vfs_register(&stub, 1); }
int sqlite3_os_end(void) { return SQLITE_OK; }
