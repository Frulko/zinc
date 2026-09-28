// zinc:fs esp32 — the same POSIX calls as fs.cpp, against a SPIFFS partition ("storage")
// mounted at /zinc; relative zinc paths are prefixed with /zinc/ before hitting libc.
// ponytail: built-in SPIFFS, not the esp_littlefs managed component — the managed component is
// fetched from the ESP Component Registry at `idf.py build` time, which this Docker/QEMU build
// environment cannot rely on being reachable; SPIFFS ships in-tree with ESP-IDF. Swap to
// esp_littlefs (wear-levelled, real dir metadata) once the registry fetch is known to work here.
#include "zrt.h"
#include "mod/fs.h"
#include "esp_spiffs.h"
#include <stdio.h>
#include <string.h>
#include <dirent.h>
#include <sys/stat.h>
#include <unistd.h>

namespace zrt { namespace fs {
static bool mounted = false;
static void ensure_mounted() {
  if (mounted) return;
  mounted = true;
  esp_vfs_spiffs_conf_t conf{};
  conf.base_path = "/zinc";
  conf.partition_label = "storage";
  conf.max_files = 8;
  conf.format_if_mount_failed = true;
  esp_vfs_spiffs_register(&conf);  // best effort: calls below fail cleanly (ENOENT/EACCES) if this didn't mount
}
struct CPath { StrBuilder sb; CPath(const String& s) { sb.cstr("/zinc/"); to_s(sb, s); sb.ch('\0'); } const char* c() const { return sb.buf; } };
static void fail(const char* what, const String& path) {
  g_err = make<Error>(cat(String::from(what, (uint32_t)strlen(what)), path));
}
String readText(const String& path) {
  ensure_mounted();
  CPath p(path);
  FILE* f = fopen(p.c(), "rb");
  if (!f) { fail("ENOENT: cannot open ", path); return String(); }
  StrBuilder sb; char buf[512]; size_t n;
  while ((n = fread(buf, 1, sizeof buf, f)) > 0) sb.raw(buf, (uint32_t)n);
  fclose(f);
  return sb.build();
}
static void write(const String& path, const String& data, const char* mode) {
  ensure_mounted();
  CPath p(path);
  FILE* f = fopen(p.c(), mode);
  if (!f) { fail("EACCES: cannot write ", path); return; }
  fwrite(data.ptr(), 1, data.bytes(), f);
  fclose(f);
}
void writeText(const String& path, const String& data) { write(path, data, "wb"); }
void appendText(const String& path, const String& data) { write(path, data, "ab"); }
bool exists(const String& path) { ensure_mounted(); CPath p(path); struct stat st; return stat(p.c(), &st) == 0; }
Array<String> list(const String& dir) {
  ensure_mounted();
  CPath p(dir);
  Array<String> r = Array<String>::with_cap(0);
  DIR* d = opendir(p.c());
  if (!d) { fail("ENOENT: cannot list ", dir); return r; }
  while (struct dirent* e = readdir(d)) {
    if (!strcmp(e->d_name, ".") || !strcmp(e->d_name, "..")) continue;
    r.push(String::from(e->d_name, (uint32_t)strlen(e->d_name)));
  }
  closedir(d);
  // readdir order is filesystem-dependent: sort for determinism (matches fs.cpp)
  return r.sort([](const String& a, const String& b) { return (double)str_cmp(a, b); });
}
bool remove(const String& path) { ensure_mounted(); CPath p(path); return ::remove(p.c()) == 0; }
bool mkdir(const String& path) {
  // ponytail: SPIFFS has no real directory entries — the full path (slashes included) is the
  // filename, so nothing needs creating in advance. Treat it as a no-op success, like POSIX
  // mkdir on a path that already "exists" as a usable prefix.
  ensure_mounted();
  (void)path;
  return true;
}
}}
