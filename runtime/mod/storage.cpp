#include "zrt.h"
#include "mod/storage.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

namespace zrt { namespace storage {
// ponytail: whole-file rewrite on every set; fine for settings-sized data, a log-structured file if it grows.
static Map<String, String> db;
static const char* file() { const char* f = getenv("ZINC_STORAGE"); return f ? f : "zinc.storage"; }
static void unescape(StrBuilder& out, const char* s, size_t n) {
  for (size_t i = 0; i < n; i++) {
    if (s[i] == '\\' && i + 1 < n) { char c = s[++i]; out.ch(c == 'n' ? '\n' : c == 't' ? '\t' : c); }
    else out.ch(s[i]);
  }
}
static void drop() { db = Map<String, String>(); }
static void load() {
  if (db.m) return;
  db = Map<String, String>::make();
  at_finish(drop);
  FILE* f = fopen(file(), "rb");
  if (!f) return;
  char line[8192];
  while (fgets(line, sizeof line, f)) {
    size_t n = strlen(line); if (n && line[n - 1] == '\n') line[--n] = 0;
    char* tab = strchr(line, '\t'); if (!tab) continue;
    StrBuilder k, v; unescape(k, line, (size_t)(tab - line)); unescape(v, tab + 1, n - (size_t)(tab - line) - 1);
    db.set(k.build(), v.build());
  }
  fclose(f);
}
static void escape(FILE* f, const String& s) {
  for (uint32_t i = 0; i < s.bytes(); i++) { char c = s.ptr()[i]; if (c == '\n') fputs("\\n", f); else if (c == '\t') fputs("\\t", f); else if (c == '\\') fputs("\\\\", f); else fputc(c, f); }
}
static void save() {
  FILE* f = fopen(file(), "wb"); if (!f) return;
  for (int32_t i = 0; i < db.slots(); i++) if (db.live_at(i)) { escape(f, db.key_at(i)); fputc('\t', f); escape(f, db.val_at(i)); fputc('\n', f); }
  fclose(f);
}
String get(const String& key) { load(); return db.get_or(key, String()); }
void set(const String& key, const String& value) { load(); db.set(key, value); save(); }
void remove(const String& key) { load(); db.del(key); save(); }
Array<String> keys() { load(); return db.keys(); }
}}
