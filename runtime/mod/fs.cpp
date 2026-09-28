#include "zrt.h"
#include "mod/fs.h"
#include <stdio.h>
#include <string.h>
#include <dirent.h>
#include <sys/stat.h>
#include <unistd.h>

namespace zrt { namespace fs {
// A path with a NUL byte becomes "" (every call then fails): libc would silently use the part before the NUL, so
// "secret\0.txt" would pass an endsWith('.txt') check and open "secret".
struct CPath { StrBuilder sb; CPath(const String& s) { if (!__builtin_memchr(s.ptr(), 0, s.bytes())) to_s(sb, s); sb.ch('\0'); } const char* c() const { return sb.buf; } };
static void fail(const char* what, const String& path) {
  g_err = make<Error>(cat(String::from(what, (uint32_t)strlen(what)), path));
}
String readText(const String& path) {
  CPath p(path);
  FILE* f = fopen(p.c(), "rb");
  if (!f) { fail("ENOENT: cannot open ", path); return String(); }
  StrBuilder sb; char buf[4096]; size_t n;
  while ((n = fread(buf, 1, sizeof buf, f)) > 0) sb.raw(buf, (uint32_t)n);
  fclose(f);
  return sb.build();
}
static void write(const String& path, const String& data, const char* mode) {
  CPath p(path);
  FILE* f = fopen(p.c(), mode);
  if (!f) { fail("EACCES: cannot write ", path); return; }
  fwrite(data.ptr(), 1, data.bytes(), f);
  fclose(f);
}
void writeText(const String& path, const String& data) { write(path, data, "wb"); }
void appendText(const String& path, const String& data) { write(path, data, "ab"); }
bool exists(const String& path) { CPath p(path); struct stat st; return stat(p.c(), &st) == 0; }
Array<String> list(const String& dir) {
  CPath p(dir);
  Array<String> r = Array<String>::with_cap(0);
  DIR* d = opendir(p.c());
  if (!d) { fail("ENOENT: cannot list ", dir); return r; }
  while (struct dirent* e = readdir(d)) {
    if (!strcmp(e->d_name, ".") || !strcmp(e->d_name, "..")) continue;
    r.push(String::from(e->d_name, (uint32_t)strlen(e->d_name)));
  }
  closedir(d);
  // readdir order is filesystem-dependent: sort for determinism
  return r.sort([](const String& a, const String& b) { return (double)str_cmp(a, b); });
}
bool remove(const String& path) { CPath p(path); return ::remove(p.c()) == 0; }
bool mkdir(const String& path) { CPath p(path); return ::mkdir(p.c(), 0755) == 0; }
}}
