// The assets/ directory of a program built ahead of time, shared by the host's zinc:assets (src/host/sys_host.cpp) and zinc:webview's
// zinc:// URLs (ZN-314, ZN-645): assets/ beside the executable (zinc export), in the bundle's Resources (the .app of zinc export: the
// executable is in Contents/MacOS), one level above it (zinc build writes <project>/build/<name>); with `cwd`, else the assets/ of the
// directory the program was started in. "" when none. ZINC_ASSETS, which zinc run sets, is the callers' to check first.
// zinc build also writes the packs of the assets beside the executable, <project>/build/assets/<target>/ (ZN-434): that directory is the
// program's packs (zrt_program_packs_dir, ZN-436), never its assets.
#pragma once
#include <dirent.h>
#include <limits.h>
#include <stdlib.h>
#include <sys/stat.h>
#include <unistd.h>
#include <filesystem>
#include <string>
#ifdef _WIN32
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#include <windows.h>   // the executable's path (no /proc on Windows)
#endif
#ifdef __APPLE__
#include <mach-o/dyld.h>
#endif

// The directories a built program looks in, in order: its executable's, the bundle's Resources, the one above; the working directory with `cwd`.
inline int zrt_program_bases(bool cwd, std::string (&bases)[4]) {
  int n = 0;
  char exe[PATH_MAX];
  std::string real;
#ifdef __APPLE__
  uint32_t size = sizeof exe;
  const bool have = _NSGetExecutablePath(exe, &size) == 0;
#elif defined(_WIN32)
  const DWORD len = GetModuleFileNameA(nullptr, exe, static_cast<DWORD>(sizeof exe));
  const bool have = len > 0 && len < sizeof exe;
  if (have) exe[len] = 0;
#else
  const ssize_t len = readlink("/proc/self/exe", exe, sizeof exe - 1);
  const bool have = len > 0;
  if (have) exe[len] = 0;
#endif
  if (have) {
    std::error_code ec;
    std::filesystem::path canon = std::filesystem::weakly_canonical(exe, ec);
    if (!ec) real = canon.make_preferred().string();
  }
  if (!real.empty()) {
    const std::string path = real, dir = path.substr(0, path.find_last_of('/')), up = dir.substr(0, dir.find_last_of('/'));
    bases[n++] = dir;
    bases[n++] = up + "/Resources";
    bases[n++] = up;
  }
  if (cwd) { char w[PATH_MAX]; if (getcwd(w, sizeof w)) bases[n++] = w; }
  return n;
}

inline bool zrt_is_dir(const std::string& path) { struct stat st; return stat(path.c_str(), &st) == 0 && S_ISDIR(st.st_mode); }

// The packs zinc assets build wrote: a directory per target, each with its `.packs` record.
inline bool zrt_holds_packs(const std::string& dir) {
  DIR* d = opendir(dir.c_str());
  if (!d) return false;
  bool packs = false;
  while (dirent* e = readdir(d)) {
    struct stat st;
    if (e->d_name[0] != '.' && stat((dir + "/" + e->d_name + "/.packs").c_str(), &st) == 0) { packs = true; break; }
  }
  closedir(d);
  return packs;
}

inline std::string zrt_program_assets_dir(bool cwd) {
  std::string bases[4];
  const int n = zrt_program_bases(cwd, bases);
  for (int i = 0; i < n; i++) {
    const std::string a = bases[i] + "/assets";
    if (zrt_is_dir(a) && !zrt_holds_packs(a)) return a;
  }
  return std::string();
}

// The packs of a built program for `target` (macos, linux, rpi1...): <base>/assets/<target> with its `.packs` record; "" when none.
inline std::string zrt_program_packs_dir(const std::string& target) {
  std::string bases[4];
  const int n = zrt_program_bases(false, bases);
  for (int i = 0; i < n; i++) {
    const std::string p = bases[i] + "/assets/" + target;
    struct stat st;
    if (stat((p + "/.packs").c_str(), &st) == 0) return p;
  }
  return std::string();
}
