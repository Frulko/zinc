// zinc:fs — POSIX files on hosts; on esp32 a SPIFFS partition ("storage") mounted at /zinc, relative zinc paths are
// prefixed with /zinc/ before hitting libc.
// ponytail: built-in SPIFFS, not the esp_littlefs managed component — the managed component is fetched from the ESP
// Component Registry at `idf.py build` time, which the Docker/QEMU build cannot rely on; SPIFFS ships with ESP-IDF.
// SPIFFS is flat: directories do not exist (mkdir succeeds, readDir lists every file under the prefix), no links.
#include "zrt.h"
#include "mod/fs.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <errno.h>
#include <dirent.h>
#include <sys/stat.h>
#include <unistd.h>
#ifdef ESP_PLATFORM
#include "esp_spiffs.h"
#include "esp_random.h"
#endif

namespace zrt { namespace fs {
#ifdef ESP_PLATFORM
static void ensure_mounted() {
  static bool mounted = false;
  if (mounted) return;
  mounted = true;
  esp_vfs_spiffs_conf_t conf{};
  conf.base_path = "/zinc";
  conf.partition_label = "storage";
  conf.max_files = 8;
  conf.format_if_mount_failed = true;
  esp_vfs_spiffs_register(&conf);  // best effort: calls below fail cleanly (ENOENT/EACCES) if this didn't mount
}
struct CPath { StrBuilder sb; CPath(const String& s) { ensure_mounted(); sb.cstr("/zinc/"); to_s(sb, s); sb.ch('\0'); } const char* c() const { return sb.buf; } };
#else
struct CPath { StrBuilder sb; CPath(const String& s) { to_s(sb, s); sb.ch('\0'); } const char* c() const { return sb.buf; } };
#endif
static String str(const char* s) { return String::from(s, (uint32_t)strlen(s)); }
static void fail(const char* what, const String& path) {
  g_err = make<Error>(cat(String::from(what, (uint32_t)strlen(what)), path));
}
/** "ENOENT: stat build/x", like sim/fs.mjs (`${code}: ${op} ${path}`). */
static void fail_errno(const char* op, const String& path) {
  int e = errno;
  const char* code = e == ENOENT ? "ENOENT" : e == EACCES ? "EACCES" : e == EEXIST ? "EEXIST" : e == ENOTDIR ? "ENOTDIR" : e == EISDIR ? "EISDIR"
    : e == ENOTEMPTY ? "ENOTEMPTY" : e == EXDEV ? "EXDEV" : e == EINVAL ? "EINVAL" : e == ELOOP ? "ELOOP" : e == EPERM ? "EPERM" : e == ENOSYS ? "ENOSYS" : "EIO";
  StrBuilder sb; sb.cstr(code); sb.cstr(": "); sb.cstr(op); sb.ch(' '); to_s(sb, path);
  g_err = make<Error>(sb.build());
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
static void write(const String& path, const char* data, uint32_t n, const char* mode) {
  CPath p(path);
  FILE* f = fopen(p.c(), mode);
  if (!f) { fail("EACCES: cannot write ", path); return; }
  if (n) fwrite(data, 1, n, f);
  fclose(f);
}
void writeText(const String& path, const String& data) { write(path, data.ptr(), data.bytes(), "wb"); }
void appendText(const String& path, const String& data) { write(path, data.ptr(), data.bytes(), "ab"); }
Array<uint8_t> readBytes(const String& path) {
  CPath p(path);
  Array<uint8_t> r = Array<uint8_t>::with_cap(0);
  FILE* f = fopen(p.c(), "rb");
  if (!f) { fail("ENOENT: cannot open ", path); return r; }
  uint8_t buf[4096]; size_t n;
  while ((n = fread(buf, 1, sizeof buf, f)) > 0) {
    r.grow(r.length() + (int32_t)n);
    __builtin_memcpy(r.a->data + r.a->len, buf, n);
    r.a->len += (int32_t)n;
  }
  fclose(f);
  return r;
}
void writeBytes(const String& path, const Array<uint8_t>& data) { write(path, data.length() ? (const char*)data.a->data : "", (uint32_t)data.length(), "wb"); }
bool exists(const String& path) { CPath p(path); struct stat st; return ::stat(p.c(), &st) == 0; }
static int32_t by_name(const String& a, const String& b) { return str_cmp(a, b); }
Array<String> list(const String& dir) {
  CPath p(dir);
  Array<String> r = Array<String>::with_cap(0);
  DIR* d = opendir(p.c());
  if (!d) { fail("ENOENT: cannot list ", dir); return r; }
  while (struct dirent* e = readdir(d)) {
    if (!strcmp(e->d_name, ".") || !strcmp(e->d_name, "..")) continue;
    r.push(str(e->d_name));
  }
  closedir(d);
  // readdir order is filesystem-dependent: sort for determinism
  return r.sort([](const String& a, const String& b) { return (double)by_name(a, b); });
}

static double ms(const struct timespec& t) { return (double)t.tv_sec * 1e3 + (double)t.tv_nsec / 1e6; }
static Ref<Stat> make_stat(const struct stat& st) {
  auto s = make<Stat>();
  s->size = (double)st.st_size; s->mode = (int32_t)(st.st_mode & 07777);
#if defined(__APPLE__)
  s->mtimeMs = ms(st.st_mtimespec); s->atimeMs = ms(st.st_atimespec); s->ctimeMs = ms(st.st_ctimespec);
#elif defined(ESP_PLATFORM)
  s->mtimeMs = (double)st.st_mtime * 1e3; s->atimeMs = (double)st.st_atime * 1e3; s->ctimeMs = (double)st.st_ctime * 1e3;
#else
  s->mtimeMs = ms(st.st_mtim); s->atimeMs = ms(st.st_atim); s->ctimeMs = ms(st.st_ctim);
#endif
  s->isFile = S_ISREG(st.st_mode); s->isDirectory = S_ISDIR(st.st_mode);
#ifdef S_ISLNK
  s->isSymlink = S_ISLNK(st.st_mode);
#endif
  return s;
}
Ref<Stat> stat(const String& path) {
  CPath p(path); struct stat st;
  if (::stat(p.c(), &st) != 0) { fail_errno("stat", path); return nullptr; }
  return make_stat(st);
}
Ref<Stat> lstat(const String& path) {
  CPath p(path); struct stat st;
#ifdef ESP_PLATFORM
  if (::stat(p.c(), &st) != 0) { fail_errno("lstat", path); return nullptr; }
#else
  if (::lstat(p.c(), &st) != 0) { fail_errno("lstat", path); return nullptr; }
#endif
  return make_stat(st);
}
Array<Ref<DirEntry>> readDir(const String& dir) {
  Array<Ref<DirEntry>> r = Array<Ref<DirEntry>>::with_cap(0);
  CPath p(dir);
  DIR* d = opendir(p.c());
  if (!d) { fail_errno("scandir", dir); return r; }
  while (struct dirent* e = readdir(d)) {
    if (!strcmp(e->d_name, ".") || !strcmp(e->d_name, "..")) continue;
    auto de = make<DirEntry>();
    de->name = str(e->d_name);
    StrBuilder full; to_s(full, dir); full.ch('/'); full.cstr(e->d_name);
    CPath fp(full.build()); struct stat st;
#ifdef ESP_PLATFORM
    int rc = ::stat(fp.c(), &st);
#else
    int rc = ::lstat(fp.c(), &st);
#endif
    if (rc == 0) {
      de->isFile = S_ISREG(st.st_mode); de->isDirectory = S_ISDIR(st.st_mode);
#ifdef S_ISLNK
      de->isSymlink = S_ISLNK(st.st_mode);
#endif
    }
    r.push(de);
  }
  closedir(d);
  return r.sort([](const Ref<DirEntry>& a, const Ref<DirEntry>& b) { return (double)by_name(a->name, b->name); });
}
static bool rm_tree(const char* p) {
  struct stat st;
#ifdef ESP_PLATFORM
  if (::stat(p, &st) != 0) return false;
#else
  if (::lstat(p, &st) != 0) return false;
#endif
  if (!S_ISDIR(st.st_mode)) return ::unlink(p) == 0;
  if (DIR* d = opendir(p)) {
    while (struct dirent* e = readdir(d)) {
      if (!strcmp(e->d_name, ".") || !strcmp(e->d_name, "..")) continue;
      StrBuilder c; c.cstr(p); c.ch('/'); c.cstr(e->d_name); c.ch('\0');
      rm_tree(c.buf);
    }
    closedir(d);
  }
  return ::rmdir(p) == 0;
}
bool remove(const String& path, bool recursive) {
  CPath p(path);
  if (recursive) return rm_tree(p.c());
  return ::remove(p.c()) == 0;
}
bool mkdir(const String& path, bool recursive) {
#ifdef ESP_PLATFORM
  (void)path; (void)recursive;
  return true;  // SPIFFS: the full path is the file name, nothing to create
#else
  CPath p(path);
  if (!recursive) return ::mkdir(p.c(), 0755) == 0;
  char* s = p.sb.buf;
  for (char* c = s + 1; *c; c++) {
    if (*c != '/') continue;
    *c = 0;
    if (::mkdir(s, 0755) != 0 && errno != EEXIST) { *c = '/'; return false; }
    *c = '/';
  }
  struct stat st;
  return ::mkdir(s, 0755) == 0 || (errno == EEXIST && ::stat(s, &st) == 0 && S_ISDIR(st.st_mode));
#endif
}
void rename(const String& from, const String& to) {
  CPath a(from), b(to);
  if (::rename(a.c(), b.c()) != 0) fail_errno("rename", from);
}
void copyFile(const String& from, const String& to) {
  CPath a(from), b(to);
  FILE* in = fopen(a.c(), "rb");
  if (!in) { fail_errno("copyfile", from); return; }
  FILE* out = fopen(b.c(), "wb");
  if (!out) { fclose(in); fail_errno("copyfile", to); return; }
  char buf[8192]; size_t n;
  while ((n = fread(buf, 1, sizeof buf, in)) > 0) fwrite(buf, 1, n, out);
  fclose(in); fclose(out);
}
String tmpdir() {
#ifdef ESP_PLATFORM
  return str("tmp");
#else
  const char* t = getenv("TMPDIR");
  if (!t || !*t) t = getenv("TMP");
  if (!t || !*t) t = getenv("TEMP");
  if (!t || !*t) t = "/tmp";
  size_t n = strlen(t);
  while (n > 1 && t[n - 1] == '/') n--;  // like Node's os.tmpdir()
  return String::from(t, (uint32_t)n);
#endif
}
#ifdef ESP_PLATFORM
String realpath(const String& path) { return path; }
String mkdtemp(const String& prefix) {
  static const char AL[] = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  StrBuilder sb; to_s(sb, prefix);
  for (int i = 0; i < 6; i++) sb.ch(AL[esp_random() % 62]);
  return sb.build();
}
void symlink(const String&, const String& path) { errno = ENOSYS; fail_errno("symlink", path); }
String readlink(const String& path) { errno = ENOSYS; fail_errno("readlink", path); return String(); }
void chmod(const String&, int32_t) {}
#else
String realpath(const String& path) {
  CPath p(path);
  char out[4096];
  if (!::realpath(p.c(), out)) { fail_errno("realpath", path); return String(); }
  return str(out);
}
String mkdtemp(const String& prefix) {
  StrBuilder sb; to_s(sb, prefix); sb.cstr("XXXXXX"); sb.ch('\0');
  if (!::mkdtemp(sb.buf)) { fail_errno("mkdtemp", prefix); return String(); }
  return str(sb.buf);
}
void symlink(const String& target, const String& path) {
  CPath t(target), p(path);
  if (::symlink(t.c(), p.c()) != 0) fail_errno("symlink", path);
}
String readlink(const String& path) {
  CPath p(path);
  char out[4096];
  ssize_t n = ::readlink(p.c(), out, sizeof out);
  if (n < 0) { fail_errno("readlink", path); return String(); }
  return String::from(out, (uint32_t)n);
}
void chmod(const String& path, int32_t mode) {
  CPath p(path);
  if (::chmod(p.c(), (mode_t)mode) != 0) fail_errno("chmod", path);
}
#endif

// ---------- watch: polling (portable; the same algorithm as sim/fs.mjs, so both report the same events) ----------
// ponytail: stat polling every 100 ms of the watched file or the entries of the watched directory (not recursive);
// FSEvents / inotify would be cheaper and catch same-size writes within one mtime tick.
struct Snap { String name; double size, mtime; };
struct Watch { int32_t id; String path; Fn<void(String, String)> cb; Array<String> names; Array<double> sizes, mtimes; };
static void snapshot(const String& path, Array<String>& names, Array<double>& sizes, Array<double>& mtimes) {
  names = Array<String>::with_cap(0); sizes = Array<double>::with_cap(0); mtimes = Array<double>::with_cap(0);
  CPath p(path); struct stat st;
  if (::stat(p.c(), &st) != 0) return;
  if (!S_ISDIR(st.st_mode)) {
    const char* b = strrchr(p.c(), '/');
    names.push(str(b ? b + 1 : p.c())); sizes.push((double)st.st_size); mtimes.push(make_stat(st)->mtimeMs);
    return;
  }
  Array<String> l = list(path);
  g_err = nullptr;
  for (int32_t i = 0; i < l.length(); i++) {
    StrBuilder full; to_s(full, path); full.ch('/'); to_s(full, l.get(i));
    CPath fp(full.build()); struct stat es;
    if (::stat(fp.c(), &es) != 0) continue;
    names.push(l.get(i)); sizes.push((double)es.st_size); mtimes.push(make_stat(es)->mtimeMs);
  }
}
struct Watcher : Poller {
  Array<Watch*> ws = Array<Watch*>::with_cap(0);
  uint64_t last = 0;
  bool poll() override {
    if (!ws.length()) return false;
    uint64_t now = hal_time_us();
    if (now - last < 100000) return true;
    last = now;
    for (int32_t k = 0; k < ws.length(); k++) {
      Watch* w = ws.get(k);
      Array<String> names; Array<double> sizes, mtimes;
      snapshot(w->path, names, sizes, mtimes);
      Array<String> evs = Array<String>::with_cap(0), files = Array<String>::with_cap(0);
      int32_t i = 0, j = 0, n = w->names.length(), m = names.length();
      while (i < n || j < m) {  // both lists are sorted: merge
        int c = i >= n ? 1 : j >= m ? -1 : by_name(w->names.get(i), names.get(j));
        if (c < 0) { evs.push(str("rename")); files.push(w->names.get(i)); i++; }
        else if (c > 0) { evs.push(str("rename")); files.push(names.get(j)); j++; }
        else {
          if (w->sizes.get(i) != sizes.get(j) || w->mtimes.get(i) != mtimes.get(j)) { evs.push(str("change")); files.push(names.get(j)); }
          i++; j++;
        }
      }
      w->names = names; w->sizes = sizes; w->mtimes = mtimes;
      for (int32_t e = 0; e < evs.length(); e++) {
        Fn<void(String, String)> f = w->cb;
        if (!f) break;
        f(evs.get(e), files.get(e));
        check_uncaught();
        drain_microtasks();
      }
    }
    return ws.length() > 0;
  }
  void shutdown() override { for (int32_t i = 0; i < ws.length(); i++) { Watch* w = ws.get(i); w->~Watch(); mfree(w); } ws = Array<Watch*>::with_cap(0); }
};
static Watcher* watcher = nullptr;
static int32_t next_watch = 1;
int32_t watch(const String& path, Fn<void(String, String)> cb) {
  if (!exists(path)) { errno = ENOENT; fail_errno("watch", path); return 0; }
  if (!watcher) { watcher = new (alloc(sizeof(Watcher))) Watcher(); add_poller(watcher); watcher->last = hal_time_us(); }
  Watch* w = new (alloc(sizeof(Watch))) Watch();
  w->id = next_watch++; w->path = path; w->cb = cb;
  snapshot(path, w->names, w->sizes, w->mtimes);
  watcher->ws.push(w);
  return w->id;
}
void unwatch(int32_t id) {
  if (!watcher) return;
  for (int32_t i = 0; i < watcher->ws.length(); i++) {
    Watch* w = watcher->ws.get(i);
    if (w->id != id) continue;
    watcher->ws.splice(i, 1);
    w->~Watch(); mfree(w);
    return;
  }
}
}}
