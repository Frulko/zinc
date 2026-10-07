// The system modules of the host (ZN-049): zinc:sys, zinc:fs, zinc:storage, zinc:assets and zinc:os on a POSIX machine, behind the Rt::Host*
// entries from HostSysFirst (include/zn/runtime.h). The Zinc side (the module sources of src/frontend/modules.cpp) turns the flat calls into
// the API of lib/modules.d.ts: an error is reported with fsFailed()/fsError() and thrown there. Plain C++17, no dependency on the old runtime.
#include <signal.h>
#include <sys/wait.h>
#include <dirent.h>
#include <fcntl.h>
#include <pwd.h>
#include <sys/stat.h>
#include <sys/time.h>
#include <sys/utsname.h>
#include <unistd.h>

#include <algorithm>
#include <cerrno>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <map>
#include <random>
#include <sstream>
#include <string>
#include <vector>

#ifdef __APPLE__
#include <mach/mach.h>
#include <sys/sysctl.h>
#endif

#include "zn/host.h"
#include "zn/hostsys.h"
#include "zn/loop.h"
#include "zn/runtime.h"

extern char** environ;

namespace zn::host {
namespace {

using zn::Rt;

std::vector<std::string> gArgs;
std::string gOut;           // the string a call returns
std::string gError;         // the last failure: "CODE: op path"
bool gFailed = false;
std::vector<std::string> gNames;   // directory listing / environment keys / storage keys / asset names
std::vector<int> gKinds;           // listing entries: 1 file, 2 directory, 4 symlink
std::vector<unsigned char> gBytes; // the file or asset loaded last
struct StatInfo { double size = 0, mtime = 0, atime = 0, ctime = 0; int mode = 0, file = 0, dir = 0, link = 0; } gStat;

void ret(HostArg* r, const std::string& s) { gOut = s; r->p = gOut.data(); r->n = static_cast<std::uint32_t>(gOut.size()); }
std::string str(const HostArg& a) { return std::string(static_cast<const char*>(a.p), a.n); }

const char* codeOf(int e) {
  switch (e) {
    case ENOENT: return "ENOENT"; case EACCES: return "EACCES"; case EEXIST: return "EEXIST"; case ENOTDIR: return "ENOTDIR"; case ENOTEMPTY: return "ENOTEMPTY";
    case EISDIR: return "EISDIR"; case EPERM: return "EPERM"; case EINVAL: return "EINVAL"; case EBUSY: return "EBUSY"; case EXDEV: return "EXDEV"; case EMFILE: return "EMFILE";
    default: return "EIO";
  }
}
void fail(const char* op, const std::string& path, int e = errno) { gFailed = true; gError = std::string(codeOf(e)) + ": " + op + " " + path; }

bool readAll(const std::string& path, std::vector<unsigned char>& out, const char* op) {
  std::ifstream in(path, std::ios::binary);
  struct stat st;
  if (stat(path.c_str(), &st) == 0 && S_ISDIR(st.st_mode)) { fail(op, path, EISDIR); return false; }
  if (!in) { fail(op, path); return false; }
  out.assign(std::istreambuf_iterator<char>(in), std::istreambuf_iterator<char>());
  return true;
}

bool writeAll(const std::string& path, const char* p, size_t n, bool append, const char* op) {
  std::ofstream out(path, std::ios::binary | (append ? std::ios::app : std::ios::trunc));
  if (!out) { fail(op, path); return false; }
  out.write(p, static_cast<std::streamsize>(n));
  if (!out) { fail(op, path); return false; }
  return true;
}

bool removeTree(const std::string& path) {
  struct stat st;
  if (lstat(path.c_str(), &st) != 0) return false;
  if (S_ISDIR(st.st_mode)) {
    if (DIR* d = opendir(path.c_str())) {
      while (dirent* e = readdir(d)) { std::string n = e->d_name; if (n != "." && n != "..") removeTree(path + "/" + n); }
      closedir(d);
    }
    return rmdir(path.c_str()) == 0;
  }
  return unlink(path.c_str()) == 0;
}

bool mkdirs(const std::string& path) {
  if (path.empty()) return true;
  struct stat st;
  if (stat(path.c_str(), &st) == 0) return S_ISDIR(st.st_mode);
  size_t slash = path.find_last_of('/');
  if (slash != std::string::npos && slash > 0 && !mkdirs(path.substr(0, slash))) return false;
  return mkdir(path.c_str(), 0777) == 0 || errno == EEXIST;
}

std::string tmpdirPath() {
  std::string t = getenv("TMPDIR") ? getenv("TMPDIR") : "/tmp";
  while (t.size() > 1 && t.back() == '/') t.pop_back();
  return t;
}

// storage: a file of `key TAB value` lines (backslash, tab and newline escaped), read and rewritten whole: the stores are small
std::string storagePath() {
  if (const char* p = getenv("ZINC_STORAGE")) return p;
  const char* h = getenv("ZINC_HOME");
  return (h ? std::string(h) : std::string(getenv("HOME") ? getenv("HOME") : ".") + "/.zinc") + "/storage.kv";
}
std::string esc(const std::string& s) { std::string r; for (char c : s) { if (c == '\\') r += "\\\\"; else if (c == '\t') r += "\\t"; else if (c == '\n') r += "\\n"; else r += c; } return r; }
std::string unesc(const std::string& s) { std::string r; for (size_t i = 0; i < s.size(); ++i) { if (s[i] == '\\' && i + 1 < s.size()) { char c = s[++i]; r += c == 't' ? '\t' : c == 'n' ? '\n' : c; } else r += s[i]; } return r; }
std::map<std::string, std::string> storageLoad() {
  std::map<std::string, std::string> m;
  std::ifstream in(storagePath());
  std::string line;
  while (std::getline(in, line)) { size_t t = line.find('\t'); if (t != std::string::npos) m[unesc(line.substr(0, t))] = unesc(line.substr(t + 1)); }
  return m;
}
void storageSave(const std::map<std::string, std::string>& m) {
  std::string p = storagePath();
  size_t slash = p.find_last_of('/');
  if (slash != std::string::npos) mkdirs(p.substr(0, slash));
  std::ofstream out(p, std::ios::trunc);
  for (auto& [k, v] : m) out << esc(k) << '\t' << esc(v) << '\n';
}

std::string assetsDir() { const char* d = getenv("ZINC_ASSETS"); return d ? d : ""; }
void listAssets(const std::string& dir, const std::string& pre, std::vector<std::string>& out) {
  DIR* d = opendir(dir.c_str());
  if (!d) return;
  std::vector<std::string> names;
  while (dirent* e = readdir(d)) { std::string n = e->d_name; if (n[0] != '.') names.push_back(n); }
  closedir(d);
  std::sort(names.begin(), names.end());
  for (auto& n : names) {
    struct stat st;
    if (stat((dir + "/" + n).c_str(), &st) != 0) continue;
    if (S_ISDIR(st.st_mode)) listAssets(dir + "/" + n, pre + n + "/", out); else out.push_back(pre + n);
  }
}

std::string utf8Decode(const std::uint64_t* p, size_t n) {  // each invalid sequence becomes U+FFFD, like TextDecoder
  std::string out;
  auto bad = [&] { out += "\xEF\xBF\xBD"; };
  for (size_t i = 0; i < n;) {
    unsigned b = static_cast<unsigned>(p[i] & 0xFF);
    int len = b < 0x80 ? 1 : (b >= 0xC2 && b <= 0xDF) ? 2 : (b >= 0xE0 && b <= 0xEF) ? 3 : (b >= 0xF0 && b <= 0xF4) ? 4 : 0;
    if (len == 0) { bad(); ++i; continue; }
    if (len == 1) { out += static_cast<char>(b); ++i; continue; }
    unsigned lo = 0x80, hi = 0xBF;
    if (b == 0xE0) lo = 0xA0; else if (b == 0xED) hi = 0x9F; else if (b == 0xF0) lo = 0x90; else if (b == 0xF4) hi = 0x8F;
    size_t k = 1;
    bool ok = true;
    for (; k < static_cast<size_t>(len); ++k) {
      if (i + k >= n) { ok = false; break; }
      unsigned c = static_cast<unsigned>(p[i + k] & 0xFF);
      if (c < (k == 1 ? lo : 0x80u) || c > (k == 1 ? hi : 0xBFu)) { ok = false; break; }
    }
    if (!ok) { bad(); i += k; continue; }
    for (size_t j = 0; j < static_cast<size_t>(len); ++j) out += static_cast<char>(p[i + j] & 0xFF);
    i += static_cast<size_t>(len);
  }
  return out;
}

// child processes: `sh -c line` with stdout and stderr on one non-blocking pipe; a handle is an index (never reused) into a small table
// Child processes run on the libuv loop (zn/loop.h).
int procSpawn(const std::string& line) { return zn::loop::spawn(line); }
std::string procRead(int h) { return zn::loop::read(h); }
int procStatus(int h) { return zn::loop::status(h); }
void procKill(int h) { zn::loop::kill(h); }

void call(int id, const HostArg* a, HostArg* r) {
  auto s = [&](int k) { return str(a[k]); };
  auto n = [&](int k) { return static_cast<int>(a[k].i); };
  switch (static_cast<Rt>(id)) {
    // ---- zinc:sys
    case Rt::HostSysArgsCount: r->i = static_cast<std::int64_t>(gArgs.size()); break;
    case Rt::HostSysArg: ret(r, n(0) >= 0 && static_cast<size_t>(n(0)) < gArgs.size() ? gArgs[static_cast<size_t>(n(0))] : ""); break;
    case Rt::HostSysEnv: { const char* v = getenv(s(0).c_str()); ret(r, v ? v : ""); break; }
    case Rt::HostSysPlatform: {
#ifdef __APPLE__
      ret(r, "macos");
#else
      ret(r, "linux");
#endif
      break;
    }
    case Rt::HostSysPid: r->i = getpid(); break;
    case Rt::HostSysCwd: { char b[4096]; ret(r, getcwd(b, sizeof b) ? b : ""); break; }
    case Rt::HostSysChdir: r->i = chdir(s(0).c_str()) == 0; break;
    case Rt::HostSysSetEnv: setenv(s(0).c_str(), s(1).c_str(), 1); break;
    case Rt::HostSysUnsetEnv: unsetenv(s(0).c_str()); break;
    case Rt::HostSysEnvKeysCount: {
      gNames.clear();
      for (char** e = environ; e && *e; ++e) { const char* eq = strchr(*e, '='); if (eq) gNames.emplace_back(*e, static_cast<size_t>(eq - *e)); }
      std::sort(gNames.begin(), gNames.end());
      r->i = static_cast<std::int64_t>(gNames.size());
      break;
    }
    case Rt::HostSysEnvKey: ret(r, n(0) >= 0 && static_cast<size_t>(n(0)) < gNames.size() ? gNames[static_cast<size_t>(n(0))] : ""); break;
    case Rt::HostSysIsatty: r->i = isatty(n(0)) != 0; break;
    case Rt::HostSysWriteErr: { std::string t = s(0); std::fwrite(t.data(), 1, t.size(), stderr); break; }
    case Rt::HostSysRandomByte: { static std::random_device rd; r->i = static_cast<int>(rd() & 0xFF); break; }
    case Rt::HostSysUtf8Len: r->i = a[0].n; break;
    case Rt::HostSysUtf8Byte: r->i = static_cast<std::uint32_t>(n(1)) < a[0].n ? static_cast<unsigned char>(static_cast<const char*>(a[0].p)[n(1)]) : 0; break;
    case Rt::HostSysUtf8Decode: ret(r, utf8Decode(static_cast<const std::uint64_t*>(a[0].p), a[0].n)); break;
    // ---- zinc:fs
    case Rt::HostFsFailed: { r->i = gFailed; gFailed = false; break; }
    case Rt::HostFsError: ret(r, gError); break;
    case Rt::HostFsReadText: { std::vector<unsigned char> b; if (readAll(s(0), b, "open")) ret(r, std::string(b.begin(), b.end())); else ret(r, ""); break; }
    case Rt::HostFsWriteText: writeAll(s(0), static_cast<const char*>(a[1].p), a[1].n, false, "open"); break;
    case Rt::HostFsAppendText: writeAll(s(0), static_cast<const char*>(a[1].p), a[1].n, true, "open"); break;
    case Rt::HostFsExists: { struct stat st; r->i = stat(s(0).c_str(), &st) == 0; break; }
    case Rt::HostFsListCount: {
      gNames.clear(); gKinds.clear();
      std::string dir = s(0);
      DIR* d = opendir(dir.c_str());
      if (!d) { fail("scandir", dir); r->i = 0; break; }
      std::vector<std::pair<std::string, int>> es;
      while (dirent* e = readdir(d)) {
        std::string nm = e->d_name;
        if (nm == "." || nm == "..") continue;
        struct stat st;
        int kind = 0;
        if (lstat((dir + "/" + nm).c_str(), &st) == 0) kind = S_ISLNK(st.st_mode) ? 4 : S_ISDIR(st.st_mode) ? 2 : 1;
        es.push_back({nm, kind});
      }
      closedir(d);
      std::sort(es.begin(), es.end());
      for (auto& [nm, k] : es) { gNames.push_back(nm); gKinds.push_back(k); }
      r->i = static_cast<std::int64_t>(gNames.size());
      break;
    }
    case Rt::HostFsListName: ret(r, n(0) >= 0 && static_cast<size_t>(n(0)) < gNames.size() ? gNames[static_cast<size_t>(n(0))] : ""); break;
    case Rt::HostFsListKind: r->i = n(0) >= 0 && static_cast<size_t>(n(0)) < gKinds.size() ? gKinds[static_cast<size_t>(n(0))] : 0; break;
    case Rt::HostFsRemove: {
      std::string p = s(0);
      struct stat st;
      if (lstat(p.c_str(), &st) != 0) { r->i = 0; break; }
      r->i = a[1].i ? removeTree(p) : (S_ISDIR(st.st_mode) ? rmdir(p.c_str()) == 0 : unlink(p.c_str()) == 0);
      break;
    }
    case Rt::HostFsMkdir: r->i = a[1].i ? mkdirs(s(0)) : mkdir(s(0).c_str(), 0777) == 0; break;
    case Rt::HostFsLoad: { if (readAll(s(0), gBytes, "open")) r->i = static_cast<std::int64_t>(gBytes.size()); else r->i = 0; break; }
    case Rt::HostFsByte: r->i = n(0) >= 0 && static_cast<size_t>(n(0)) < gBytes.size() ? gBytes[static_cast<size_t>(n(0))] : 0; break;
    case Rt::HostFsWriteBytes: {
      std::string data;
      const std::uint64_t* p = static_cast<const std::uint64_t*>(a[1].p);
      for (std::uint32_t i = 0; i < a[1].n; ++i) data += static_cast<char>(p[i] & 0xFF);
      writeAll(s(0), data.data(), data.size(), false, "open");
      break;
    }
    case Rt::HostFsStat: {
      struct stat st;
      std::string p = s(0);
      int rc = a[1].i ? lstat(p.c_str(), &st) : stat(p.c_str(), &st);
      if (rc != 0) { fail("stat", p); r->i = 0; break; }
#ifdef __APPLE__
      gStat = {static_cast<double>(st.st_size), st.st_mtimespec.tv_sec * 1e3 + st.st_mtimespec.tv_nsec / 1e6, st.st_atimespec.tv_sec * 1e3 + st.st_atimespec.tv_nsec / 1e6,
               st.st_ctimespec.tv_sec * 1e3 + st.st_ctimespec.tv_nsec / 1e6, static_cast<int>(st.st_mode), S_ISREG(st.st_mode), S_ISDIR(st.st_mode), S_ISLNK(st.st_mode)};
#else
      gStat = {static_cast<double>(st.st_size), st.st_mtim.tv_sec * 1e3 + st.st_mtim.tv_nsec / 1e6, st.st_atim.tv_sec * 1e3 + st.st_atim.tv_nsec / 1e6,
               st.st_ctim.tv_sec * 1e3 + st.st_ctim.tv_nsec / 1e6, static_cast<int>(st.st_mode), S_ISREG(st.st_mode), S_ISDIR(st.st_mode), S_ISLNK(st.st_mode)};
#endif
      r->i = 1;
      break;
    }
    case Rt::HostFsStatD: r->d = n(0) == 0 ? gStat.size : n(0) == 1 ? gStat.mtime : n(0) == 2 ? gStat.atime : gStat.ctime; break;
    case Rt::HostFsStatI: r->i = n(0) == 0 ? gStat.mode : n(0) == 1 ? gStat.file : n(0) == 2 ? gStat.dir : gStat.link; break;
    case Rt::HostFsRename: if (rename(s(0).c_str(), s(1).c_str()) != 0) fail("rename", s(0) + " -> " + s(1)); break;
    case Rt::HostFsCopyFile: { std::vector<unsigned char> b; if (readAll(s(0), b, "copyfile")) writeAll(s(1), reinterpret_cast<const char*>(b.data()), b.size(), false, "copyfile"); break; }
    case Rt::HostFsRealpath: { char b[4096]; if (realpath(s(0).c_str(), b)) ret(r, b); else { fail("realpath", s(0)); ret(r, ""); } break; }
    case Rt::HostFsTmpdir: ret(r, tmpdirPath()); break;
    case Rt::HostFsMkdtemp: {
      std::string t = s(0) + "XXXXXX";
      std::vector<char> b(t.begin(), t.end());
      b.push_back(0);
      if (mkdtemp(b.data())) ret(r, b.data()); else { fail("mkdtemp", s(0)); ret(r, ""); }
      break;
    }
    // ---- zinc:storage
    case Rt::HostStorageGet: { auto m = storageLoad(); auto it = m.find(s(0)); ret(r, it == m.end() ? "" : it->second); break; }
    case Rt::HostStorageSet: { auto m = storageLoad(); m[s(0)] = s(1); storageSave(m); break; }
    case Rt::HostStorageRemove: { auto m = storageLoad(); m.erase(s(0)); storageSave(m); break; }
    case Rt::HostStorageKeysCount: { gNames.clear(); for (auto& kv : storageLoad()) gNames.push_back(kv.first); r->i = static_cast<std::int64_t>(gNames.size()); break; }
    case Rt::HostStorageKey: ret(r, n(0) >= 0 && static_cast<size_t>(n(0)) < gNames.size() ? gNames[static_cast<size_t>(n(0))] : ""); break;
    // ---- zinc:assets (a directory on disk: ZINC_ASSETS)
    case Rt::HostAssetsExists: { struct stat st; std::string d = assetsDir(); r->i = !d.empty() && stat((d + "/" + s(0)).c_str(), &st) == 0 && S_ISREG(st.st_mode); break; }
    case Rt::HostAssetsReadText: { std::vector<unsigned char> b; std::string d = assetsDir(); if (!d.empty() && readAll(d + "/" + s(0), b, "open")) ret(r, std::string(b.begin(), b.end())); else { if (d.empty()) fail("open", s(0), ENOENT); ret(r, ""); } break; }
    case Rt::HostAssetsLoad: { std::string d = assetsDir(); if (!d.empty() && readAll(d + "/" + s(0), gBytes, "open")) r->i = static_cast<std::int64_t>(gBytes.size()); else { if (d.empty()) fail("open", s(0), ENOENT); r->i = 0; } break; }
    case Rt::HostAssetsCount: { gNames.clear(); std::string d = assetsDir(); if (!d.empty()) listAssets(d, "", gNames); r->i = static_cast<std::int64_t>(gNames.size()); break; }
    case Rt::HostAssetsName: ret(r, n(0) >= 0 && static_cast<size_t>(n(0)) < gNames.size() ? gNames[static_cast<size_t>(n(0))] : ""); break;
    // ---- zinc:os
    case Rt::HostOsHostname: { char b[256]; ret(r, gethostname(b, sizeof b) == 0 ? b : ""); break; }
    case Rt::HostOsHomedir: { const char* h = getenv("HOME"); if (!h) { passwd* pw = getpwuid(getuid()); h = pw ? pw->pw_dir : ""; } ret(r, h); break; }
    case Rt::HostOsArch: {
#if defined(__aarch64__) || defined(__arm64__)
      ret(r, "arm64");
#elif defined(__x86_64__)
      ret(r, "x64");
#elif defined(__arm__)
      ret(r, "arm");
#else
      ret(r, "ia32");
#endif
      break;
    }
    case Rt::HostOsType: { utsname u; ret(r, uname(&u) == 0 ? u.sysname : ""); break; }
    case Rt::HostOsRelease: { utsname u; ret(r, uname(&u) == 0 ? u.release : ""); break; }
    case Rt::HostOsUptime: {
#ifdef __APPLE__
      timeval bt; size_t len = sizeof bt; int mib[2] = {CTL_KERN, KERN_BOOTTIME};
      timeval now; gettimeofday(&now, nullptr);
      r->d = sysctl(mib, 2, &bt, &len, nullptr, 0) == 0 ? static_cast<double>(now.tv_sec - bt.tv_sec) : 0;
#else
      double up = 0; if (FILE* f = fopen("/proc/uptime", "r")) { if (fscanf(f, "%lf", &up) != 1) up = 0; fclose(f); } r->d = up;
#endif
      break;
    }
    case Rt::HostOsTotalmem: {
#ifdef __APPLE__
      std::uint64_t mem = 0; size_t len = sizeof mem; sysctlbyname("hw.memsize", &mem, &len, nullptr, 0); r->d = static_cast<double>(mem);
#else
      r->d = static_cast<double>(sysconf(_SC_PHYS_PAGES)) * static_cast<double>(sysconf(_SC_PAGESIZE));
#endif
      break;
    }
    case Rt::HostOsFreemem: {
#ifdef __APPLE__
      vm_statistics64_data_t vm; mach_msg_type_number_t cnt = HOST_VM_INFO64_COUNT;
      r->d = host_statistics64(mach_host_self(), HOST_VM_INFO64, reinterpret_cast<host_info64_t>(&vm), &cnt) == KERN_SUCCESS ? static_cast<double>(vm.free_count) * static_cast<double>(vm_page_size) : 0;
#else
      r->d = static_cast<double>(sysconf(_SC_AVPHYS_PAGES)) * static_cast<double>(sysconf(_SC_PAGESIZE));
#endif
      break;
    }
    case Rt::HostOsCpus: r->i = sysconf(_SC_NPROCESSORS_ONLN); break;
    case Rt::HostProcSpawn: r->i = procSpawn(s(0)); break;
    case Rt::HostProcRead: ret(r, procRead(n(0))); break;
    case Rt::HostProcStatus: r->i = procStatus(n(0)); break;
    case Rt::HostProcKill: procKill(n(0)); break;
    case Rt::HostLoopWait: zn::loop::wait(a[0].d); break;
    case Rt::HostLoopReal: {  // real time unless the run is deterministic (ZINC_DETERMINISTIC, recording, replay); ZINC_REALTIME forces it
      auto set = [](const char* n) { const char* v = getenv(n); return v && *v && *v != '0'; };
      r->i = set("ZINC_REALTIME") || !(set("ZINC_DETERMINISTIC") || getenv("ZINC_RECORD") || getenv("ZINC_REPLAY")) ? 1 : 0;
      break;
    }
    case Rt::HostLoopNow: r->d = zn::loop::nowMs(); break;
    case Rt::HostProcSpawnEx: {
      auto split = [](const std::string& joined) { std::vector<std::string> v; if (joined.empty()) return v; size_t at = 0; for (;;) { size_t k = joined.find('\x1f', at); v.push_back(joined.substr(at, k == std::string::npos ? std::string::npos : k - at)); if (k == std::string::npos) break; at = k + 1; } return v; };
      std::vector<std::string> argv = split(s(1));
      argv.insert(argv.begin(), s(0));
      r->i = zn::loop::spawnProcess(argv, s(2), split(s(3)));
      break;
    }
    case Rt::HostProcError: ret(r, zn::loop::lastError()); break;
    case Rt::HostProcPid: r->i = zn::loop::pidOf(n(0)); break;
    case Rt::HostProcWrite: r->i = zn::loop::writeStdin(n(0), s(1)) ? 1 : 0; break;
    case Rt::HostProcCloseStdin: zn::loop::closeStdin(n(0)); break;
    case Rt::HostProcSignal: zn::loop::signalProcess(n(0), n(1)); break;
    case Rt::HostEvNext: {  // "handle \x1f kind \x1f data", or "" when no event is ready
      zn::loop::Event e;
      if (zn::loop::nextEvent(e)) ret(r, std::to_string(e.handle) + "\x1f" + std::to_string(e.kind) + "\x1f" + e.data); else ret(r, std::string());
      break;
    }
    case Rt::HostEvActive: r->i = zn::loop::active() ? 1 : 0; break;
    case Rt::HostSigWatch: r->i = zn::loop::watchSignal(s(0)) ? 1 : 0; break;
    case Rt::HostSigSend: r->i = zn::loop::sendSignal(n(0), s(1)) ? 1 : 0; break;
    case Rt::HostStdinRead: zn::loop::readStdin(); break;
    case Rt::HostLoopEpoch: { struct timeval tv; gettimeofday(&tv, nullptr); r->d = static_cast<double>(tv.tv_sec) * 1000.0 + static_cast<double>(tv.tv_usec) / 1000.0; break; }
    case Rt::HostOsUser: { passwd* pw = getpwuid(getuid()); ret(r, pw ? pw->pw_name : ""); break; }
    case Rt::HostOsLoad: { double l[3] = {0, 0, 0}; getloadavg(l, 3); r->d = n(0) >= 0 && n(0) < 3 ? l[n(0)] : 0; break; }
    default: break;
  }
}

}  // namespace

void setProgramArgs(const std::vector<std::string>& args) { gArgs = args; }
void installSys() { hostSys = call; }

}  // namespace zn::host
